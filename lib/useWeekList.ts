"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/db/client";
import { listPeople } from "@/lib/db/queries/household";
import {
  listAlwaysHave, listItemState, listItemStores, listPrices, listStaples,
  setEstimate, setItemState, setItemStore, type ItemState,
} from "@/lib/db/queries/list";
import { getMeals, toMeal } from "@/lib/db/queries/meals";
import { getOrCreateWeek, listWeekMeals } from "@/lib/db/queries/weeks";
import type { Household } from "@/lib/db/rows";
import { budgetState, type BudgetState } from "@/lib/domain/budget";
import { buildShoppingList, listTotals, type ListItem, type Store } from "@/lib/domain/list";
import { scaleMeal } from "@/lib/domain/scaling";
import type { IngredientLine, Meal, Person } from "@/lib/domain/types";
import { weekStartFor, type Day } from "@/lib/domain/weeks";
import { loadDraft, saveDraft } from "@/lib/drafts";
import { groupMissing, requestEstimates } from "@/lib/list/estimates-client";
import {
  enqueuePatches, flushQueue, isNetworkError, loadListCache, loadQueue, saveListCache, type ItemPatch,
} from "@/lib/list/offline";
import {
  estimateFor, KROGER_PRICE_MAX_AGE_MS, priceKey, storeFor, toPriceMap, userCentsPerBase,
  type PriceRow, type PriceSource,
} from "@/lib/list/prices";
import { subscribeHousehold } from "@/lib/realtime";

/** Everything the list is built from. This is also what is cached for offline use. */
export interface ListInputs {
  entries: { meal: Meal; servings: number | null }[];
  people: Person[];
  staples: IngredientLine[];
  alwaysHave: string[];
  itemState: Record<string, ItemState>;
  itemStores: [string, Store][];
  categoryStore: Record<string, unknown>;
  prices: PriceRow[];
}

/** A fetched Kroger shelf price takes the place of an AI guess or an older Kroger price, never of a typed one. */
const replaces = (fresh: PriceRow, old: PriceRow): boolean =>
  fresh.source === "kroger" &&
  old.source !== "user" &&
  (old.source === "ai" || (fresh.updatedAt ?? "") > (old.updatedAt ?? ""));

/** The saved prices, plus any fetched this visit that the saved ones don't have yet (or have only as older ones). */
function withFetched(saved: PriceRow[], fetched: Map<string, PriceRow>): PriceRow[] {
  const have = new Set(saved.map((p) => priceKey(p.canonical, p.store, p.kind)));
  const swapped = saved.map((p) => {
    const f = fetched.get(priceKey(p.canonical, p.store, p.kind));
    return f && replaces(f, p) ? f : p;
  });
  return [...swapped, ...[...fetched].filter(([k]) => !have.has(k)).map(([, p]) => p)];
}

/** Adds fetched rows to the prices on screen, upgrading AI guesses and old Kroger prices. */
function mergeFetched(prices: PriceRow[], rows: PriceRow[]): PriceRow[] {
  const byKey = new Map(prices.map((p) => [priceKey(p.canonical, p.store, p.kind), p]));
  for (const r of rows) {
    const k = priceKey(r.canonical, r.store, r.kind);
    const old = byKey.get(k);
    if (!old || replaces(r, old)) byKey.set(k, r);
  }
  return [...byKey.values()];
}

/** Fred Meyer shelf prices to look up again: AI guesses (once a store is chosen) and Kroger prices over a day old. */
const dueForShelfPrice = (row: PriceRow | undefined): boolean =>
  !!row &&
  (row.source === "ai" ||
    (row.source === "kroger" && !(Date.now() - Date.parse(row.updatedAt ?? "") < KROGER_PRICE_MAX_AGE_MS)));

const RETRY_OFFLINE_MS = 5000;
const NO_FLAGS: ItemState = { have_it: false, checked: false, outside_budget: false };

export function buildList(raw: ListInputs) {
  const prices = toPriceMap(raw.prices);
  const itemStores = new Map(raw.itemStores);
  const scaled = raw.entries.flatMap((e) => scaleMeal(e.meal, raw.people, e.servings ?? undefined));
  const flagged = (f: keyof ItemState) =>
    new Set(Object.entries(raw.itemState).filter(([, s]) => s[f]).map(([k]) => k));
  const items = buildShoppingList({
    scaled,
    staples: raw.staples,
    alwaysHave: raw.alwaysHave,
    haveIt: flagged("have_it"),
    outsideBudget: flagged("outside_budget"),
    storeFor: (c, r) => storeFor(c, r, itemStores, raw.categoryStore),
    estimateFor: (c, q, s) => estimateFor(prices, c, q, s),
  });
  const priceSource: Record<string, PriceSource> = {};
  const priceDetail: Record<string, PriceRow> = {};
  for (const i of items) {
    const row = prices.get(priceKey(i.canonical, i.store, i.qty.kind));
    if (!row) continue;
    priceSource[i.key] = row.source;
    if (row.source === "kroger") priceDetail[i.key] = row;
  }
  return { items, priceSource, priceDetail, checked: flagged("checked") };
}

/**
 * The week's shopping list: dinners scaled for the household plus the weekly staples,
 * priced, split by store, with live have-it and got-it flags. Keeps working offline
 * from the last list it saw; check-offs made offline are sent when the connection returns.
 */
export function useWeekList(household: Household, weekId: string | null) {
  const sb = useMemo(() => createBrowserClient(), []);
  const [raw, setRaw] = useState<ListInputs | null>(null);
  const [loading, setLoading] = useState(true);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState(false);
  const [live, setLive] = useState(false);
  const latest = useRef(0);
  const rawRef = useRef<ListInputs | null>(null);
  const requested = useRef(new Set<string>());
  // Prices fetched this visit. A load that began before the server saved them must not wipe them out.
  const fetched = useRef(new Map<string, PriceRow>());
  const invalidate = useCallback(() => {
    latest.current++;
  }, []);

  useEffect(() => {
    rawRef.current = raw;
    if (raw && weekId) saveListCache(weekId, raw);
  }, [raw, weekId]);

  // Set when the server refuses a queued change (not a network failure): the change was dropped.
  const refused = useRef(false);
  const flushPending = useCallback(async () => {
    const send = async (e: { weekId: string; itemKey: string; patch: ItemPatch }) => {
      try {
        await setItemState(sb, e.weekId, e.itemKey, e.patch, household.id);
      } catch (err) {
        if (!isNetworkError(err)) refused.current = true;
        throw err;
      }
    };
    // One flush runs at a time; a call that joined it may have missed a change added just now, so look once more.
    let left = await flushQueue(household.id, send);
    if (loadQueue(household.id).length > 0 && !(typeof navigator !== "undefined" && navigator.onLine === false)) {
      left = await flushQueue(household.id, send);
    }
    return left;
  }, [sb, household.id]);

  const fromCache = useCallback(() => {
    if (!weekId) return false;
    if (rawRef.current) {
      setOffline(true);
      return true;
    }
    const cached = loadListCache<ListInputs>(weekId);
    if (!cached) return false;
    setRaw(cached);
    setOffline(true);
    return true;
  }, [weekId]);

  const load = useCallback(async () => {
    if (!weekId) return;
    const run = ++latest.current;
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("offline");
      await flushPending();
      const [weekMeals, people, staples, alwaysHave, itemState, itemStores, prices] = await Promise.all([
        listWeekMeals(sb, weekId),
        listPeople(sb, household.id),
        listStaples(sb, household.id),
        listAlwaysHave(sb, household.id),
        listItemState(sb, weekId),
        listItemStores(sb, household.id),
        listPrices(sb, household.id),
      ]);
      const meals = new Map((await getMeals(sb, [...new Set(weekMeals.map((m) => m.meal_id))])).map((m) => [m.id, m]));
      if (run !== latest.current) return;
      const entries = weekMeals.flatMap((wm) => {
        const row = meals.get(wm.meal_id);
        return row
          ? [{ meal: toMeal(row), servings: wm.servings_override === null ? null : Number(wm.servings_override) }]
          : [];
      });
      setRaw({
        entries,
        people,
        staples: staples.filter((s) => s.active).map(({ canonical, amount, unit, role }) => ({ canonical, amount, unit, role })),
        alwaysHave,
        itemState,
        itemStores: [...itemStores],
        categoryStore: (household.category_store ?? {}) as Record<string, unknown>,
        prices: withFetched(prices, fetched.current),
      });
      setOffline(false);
      setError(false);
    } catch {
      if (run !== latest.current) return;
      if (!fromCache()) setError(true);
    } finally {
      if (run === latest.current) setLoading(false);
    }
  }, [sb, weekId, household.id, household.category_store, flushPending, fromCache]);

  useEffect(() => {
    if (!weekId) return;
    // Show the last list straight away while the fresh one loads (and keep it when there is no signal).
    const cached = rawRef.current ? null : loadListCache<ListInputs>(weekId);
    // Loading starts from an effect on purpose: it depends on the phone's connection.
    if (cached) setRaw(cached);
    void load();
    const stop = subscribeHousehold(
      household.id,
      ["week_meals", "week_item_state", "staples", "meals", "people", "item_store", "always_have", "price_estimates", "households"],
      () => void load(),
      setLive,
    );
    const goOffline = () => setOffline(true);
    window.addEventListener("offline", goOffline);
    return () => {
      invalidate();
      stop();
      window.removeEventListener("offline", goOffline);
    };
  }, [household.id, weekId, load, invalidate]);

  // While offline, look again every few seconds: not every browser says when the network is back.
  useEffect(() => {
    if (!offline) return;
    const t = setInterval(() => void load(), RETRY_OFFLINE_MS);
    return () => clearInterval(t);
  }, [offline, load]);

  const built = useMemo(() => (raw ? buildList(raw) : null), [raw]);
  const items: ListItem[] = useMemo(() => built?.items ?? [], [built]);
  const totals = useMemo(() => listTotals(items), [items]);
  const state: BudgetState = budgetState(totals.totalCents, household.budget_cents, household.cushion_cents);

  // Price whatever nobody has priced yet: one request per store.
  useEffect(() => {
    if (!raw || offline) return;
    const saved = toPriceMap(raw.prices);
    const shelf = !!household.kroger_location_id;
    const missing = items
      .filter((i) => {
        if (i.haveIt || requested.current.has(priceKey(i.canonical, i.store, i.qty.kind))) return false;
        if (i.estimateCents === null) return true;
        return shelf && i.store === "fred_meyer" && dueForShelfPrice(saved.get(priceKey(i.canonical, i.store, i.qty.kind)));
      })
      .map((i) => ({ canonical: i.canonical, qty: i.qty, store: i.store }));
    if (missing.length === 0) return;
    for (const m of missing) requested.current.add(priceKey(m.canonical, m.store, m.qty.kind));
    for (const [store, wanted] of groupMissing(missing)) {
      const forget = () => {
        // No answer (offline, over the cap): let it be asked again next time the list changes.
        for (const w of wanted) requested.current.delete(priceKey(w.canonical, store, w.qty.kind));
      };
      void requestEstimates(wanted, store).then((rows) => {
        if (rows.length === 0) return forget();
        for (const p of rows) fetched.current.set(priceKey(p.canonical, p.store, p.kind), p);
        setRaw((r) => (r ? { ...r, prices: mergeFetched(r.prices, rows) } : r));
      }, forget);
    }
  }, [raw, items, offline, household.kroger_location_id]);

  /** Sets have-it, got-it or outside-budget for an item. Offline, it waits in the queue. */
  const updateMany = useCallback(
    async (itemKeys: string[], patch: ItemPatch) => {
      if (!weekId || itemKeys.length === 0) return;
      // One state update for the whole batch, so 40+ rows render once.
      setRaw((r) => {
        if (!r) return r;
        const itemState = { ...r.itemState };
        for (const k of itemKeys) itemState[k] = { ...(itemState[k] ?? NO_FLAGS), ...patch };
        return { ...r, itemState };
      });
      latest.current++; // a load already under way would bring back the old value
      // Every change goes through the queue (one entry per item), so an older queued write can never land after a newer one.
      enqueuePatches(household.id, itemKeys.map((itemKey) => ({ weekId, itemKey, patch })));
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setOffline(true);
        return;
      }
      refused.current = false;
      const left = await flushPending();
      if (left > 0) {
        setOffline(true);
        return;
      }
      void load();
      // The server said no (not a network problem): the screen is put back and the caller says so.
      if (refused.current) throw new Error("refused");
    },
    [weekId, household.id, flushPending, load],
  );
  const update = useCallback((itemKey: string, patch: ItemPatch) => updateMany([itemKey], patch), [updateMany]);

  /** A price you typed: the total for the quantity on the list. Throws when it can't be saved. */
  const setPrice = useCallback(
    async (item: ListItem, totalCents: number) => {
      const per = userCentsPerBase(totalCents, item.qty);
      await setEstimate(sb, household.id, item.canonical, item.store, item.qty.kind, per, "user");
      const row: PriceRow = { canonical: item.canonical, store: item.store, kind: item.qty.kind, centsPerBase: per, source: "user" };
      setRaw((r) =>
        r
          ? { ...r, prices: [...r.prices.filter((p) => priceKey(p.canonical, p.store, p.kind) !== priceKey(row.canonical, row.store, row.kind)), row] }
          : r,
      );
    },
    [sb, household.id],
  );

  /** Where this item is bought from now on (for every week). Throws when it can't be saved. */
  const moveItem = useCallback(
    async (item: ListItem, store: Store) => {
      await setItemStore(sb, household.id, item.canonical, store);
      setRaw((r) =>
        r ? { ...r, itemStores: [...r.itemStores.filter(([c]) => c !== item.canonical), [item.canonical, store]] } : r,
      );
    },
    [sb, household.id],
  );

  return {
    items,
    totals,
    state,
    loading: loading && !raw,
    offline,
    error,
    live,
    checked: built?.checked ?? new Set<string>(),
    priceSource: built?.priceSource ?? ({} as Record<string, PriceSource>),
    priceDetail: built?.priceDetail ?? ({} as Record<string, PriceRow>),
    update,
    updateMany,
    setPrice,
    moveItem,
    reload: load,
  };
}

/** This week's id. Offline it falls back to the one seen last time, so the cached list can still show. */
export function useWeekId(household: Household): string | null {
  const sb = useMemo(() => createBrowserClient(), []);
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    const weekStart = weekStartFor(new Date(), household.week_start as Day, household.time_zone);
    // The week seen last time is used right away, so a phone with no signal doesn't wait on the network.
    const seen = loadDraft<{ householdId: string; weekStart: string; id: string }>("list-week");
    if (seen?.householdId === household.id && seen.weekStart === weekStart) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setId(seen.id);
    }
    (async () => {
      try {
        const week = await getOrCreateWeek(sb, household.id, weekStart);
        saveDraft("list-week", { householdId: household.id, weekStart, id: week.id });
        if (alive) setId(week.id);
      } catch {
        // Offline: the remembered week above stands.
      }
    })();
    return () => {
      alive = false;
    };
  }, [sb, household.id, household.week_start, household.time_zone]);
  return id;
}
