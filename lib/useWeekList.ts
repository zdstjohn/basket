"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/db/client";
import { listPeople } from "@/lib/db/queries/household";
import { clearChoice, listChoices, listMatches, setChoice } from "@/lib/db/queries/kroger";
import {
  listAlwaysHave, listItemState, listItemStores, listPrices, listStaples,
  setEstimate, setItemState, setItemStates, setItemStore, type ItemState,
} from "@/lib/db/queries/list";
import { getMeals } from "@/lib/db/queries/meals";
import { cookedNights } from "@/lib/domain/leftovers";
import { weekEntries } from "@/lib/list/entries";
import { getOrCreateWeek, listWeekMeals } from "@/lib/db/queries/weeks";
import type { Household } from "@/lib/db/rows";
import { budgetState, type BudgetState } from "@/lib/domain/budget";
import { buildShoppingList, listTotals, type ListItem, type Store } from "@/lib/domain/list";
import { recommend, type Recommendation } from "@/lib/domain/packages";
import { scaleMeal } from "@/lib/domain/scaling";
import type { IngredientLine, Meal, Person, Quantity } from "@/lib/domain/types";
import { isVague } from "@/lib/domain/units";
import { weekStartFor, type Day } from "@/lib/domain/weeks";
import { loadDraft, saveDraft } from "@/lib/drafts";
import { clampPackCount, foldItemState, mergeFlags, overlayQueue, writeFlags } from "@/lib/list/state";
import { groupMissing, requestEstimates } from "@/lib/list/estimates-client";
import { type Choice, type MatchRow } from "@/lib/list/matches";
import {
  answered, askableNow, began, failed as failedAsk, foodsToAsk, latchBad, pricesStale, SearchNotReturned, SearchNotSaved, type Asked,
} from "@/lib/list/match-requests";
import { requestMatches } from "@/lib/list/matches-client";
import {
  enqueuePatches, flushQueue, isNetworkError, loadListCache, loadQueue, saveListCache, type ItemPatch, type QueuedPatch,
} from "@/lib/list/offline";
import { backoffDelay, FAILED_REQUEST_HOLD_MS, retryAfter, singleFlight } from "@/lib/list/single-flight";
import {
  estimateFor, priceKey, storeFor, toPriceMap, userCentsFor, userCentsPerBase,
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
  /** Fred Meyer searches for this store; an older cache has none. */
  matches?: MatchRow[];
  /** The household's remembered products; an older cache has none. */
  choices?: Choice[];
  /** The chosen Fred Meyer store (product mode); null or missing means no store is chosen. */
  locationId?: string | null;
}

const matchKey = (locationId: string, canonical: string): string => `${locationId}|${canonical}`;

/** Saved searches, plus any fetched this visit that are newer (or that the saved ones don't have). */
function withFetchedMatches(saved: MatchRow[], fetched: Map<string, MatchRow>): MatchRow[] {
  const byKey = new Map(saved.map((m) => [matchKey(m.locationId, m.canonical), m]));
  for (const [k, f] of fetched) {
    const old = byKey.get(k);
    if (!old || f.fetchedAt > old.fetchedAt) byKey.set(k, f);
  }
  return [...byKey.values()];
}

/** The list as it is saved for offline use: only the searches for foods that are on this week's list. */
export function trimForCache(raw: ListInputs, foods: ReadonlySet<string>): ListInputs {
  return raw.matches ? { ...raw, matches: raw.matches.filter((m) => foods.has(m.canonical)) } : raw;
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

/** The choices with this food's changed by `patch` (a new row if it had none). */
function withChoice(choices: Choice[], canonical: string, patch: { upc?: string | null; searchTerm?: string | null }): Choice[] {
  const old = choices.find((c) => c.canonical === canonical) ?? { canonical, upc: null, searchTerm: null };
  const next: Choice = {
    canonical,
    upc: "upc" in patch ? (patch.upc ?? null) : old.upc,
    searchTerm: "searchTerm" in patch ? (patch.searchTerm ?? null) : old.searchTerm,
  };
  return [...choices.filter((c) => c.canonical !== canonical), next];
}

export function buildList(raw: ListInputs) {
  const prices = toPriceMap(raw.prices);
  const itemStores = new Map(raw.itemStores);
  const locationId = raw.locationId ?? null;
  const productMode = !!locationId;
  const matches = new Map((raw.matches ?? []).filter((m) => m.locationId === locationId).map((m) => [m.canonical, m]));
  const choices = new Map((raw.choices ?? []).map((c) => [c.canonical, c]));
  const scaled = raw.entries.flatMap((e) => scaleMeal(e.meal, raw.people, e.servings ?? undefined));
  // Flags are saved per food; rows saved the old way (per kind of amount) are folded in.
  const state = foldItemState(raw.itemState);
  const flagged = (f: "have_it" | "checked" | "outside_budget") =>
    new Set(Object.entries(state).filter(([, s]) => s[f]).map(([k]) => k));
  // Only Fred Meyer, with no store chosen, still guesses a price. A shelf product sets the price in
  // product mode (below), and at Amazon and Costco only a price you typed counts.
  const guessing = (s: Store): boolean => s === "fred_meyer" && !productMode;
  const built = buildShoppingList({
    scaled,
    staples: raw.staples,
    alwaysHave: raw.alwaysHave,
    haveIt: flagged("have_it"),
    outsideBudget: flagged("outside_budget"),
    storeFor: (c, r) => storeFor(c, r, itemStores, raw.categoryStore),
    estimateFor: (c, q, s) => (guessing(s) ? estimateFor(prices, c, q, s) : null),
    userCents: (c, q, s) => userCentsFor(prices, c, q, s),
  });
  const products: Record<string, Recommendation> = {};
  const items = built.map((i) => {
    if (!productMode || i.store !== "fred_meyer") return i;
    const row = matches.get(i.canonical);
    if (!row) return i;
    // The saved search is cast from the database, not checked: one malformed row counts as no row.
    let rec: Recommendation;
    try {
      rec = recommend(i.canonical, i.parts, row.candidates, {
        chosenUpc: choices.get(i.canonical)?.upc ?? null,
        count: state[i.key]?.pack_count ?? null,
      });
    } catch {
      return i;
    }
    products[i.key] = rec;
    return rec.pick ? { ...i, estimateCents: rec.pick.totalCents } : i;
  });
  const priceSource: Record<string, PriceSource> = {};
  const priceDetail: Record<string, PriceRow> = {};
  for (const i of items) {
    const row = prices.get(priceKey(i.canonical, i.store, i.qty.kind));
    if (!row) continue;
    if (row.source === "user" && !(i.key in products && products[i.key].pick)) priceSource[i.key] = "user";
    else if (guessing(i.store)) priceSource[i.key] = row.source;
    if (guessing(i.store) && row.source === "kroger") priceDetail[i.key] = row;
  }
  return { items, priceSource, priceDetail, products, productMode, checked: flagged("checked") };
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
  const liveRef = useRef(false);
  const rawRef = useRef<ListInputs | null>(null);
  // Estimate keys already asked: Infinity while out or answered, a time when the request failed (held for a minute).
  const requested = useRef(new Map<string, number>());
  // Fred Meyer searches fetched this visit, kept for the same reason as the prices.
  const fetchedMatches = useRef(new Map<string, MatchRow>());
  const requestedMatches = useRef<Asked>(new Map());
  // Ticks each minute, so a list left open past a day notices its prices have aged and asks again.
  const [now, setNow] = useState(() => Date.now());
  // A product lookup came back limited or failed this visit.
  const [badFoods, setBadFoods] = useState<ReadonlySet<string>>(new Set());
  // Prices fetched this visit. A load that began before the server saved them must not wipe them out.
  const fetched = useRef(new Map<string, PriceRow>());
  const invalidate = useCallback(() => {
    latest.current++;
  }, []);

  useEffect(() => {
    rawRef.current = raw;
  }, [raw]);
  useEffect(() => {
    liveRef.current = live;
  }, [live]);

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
    const gaveUp = () => void (refused.current = true);
    // Runs of changes for one week and the same flags go as one request; a refused batch is sent one by one.
    const sendBatch = (entries: QueuedPatch[]) => setItemStates(sb, household.id, entries);
    let left = await flushQueue(household.id, send, undefined, gaveUp, sendBatch);
    if (loadQueue(household.id).length > 0 && !(typeof navigator !== "undefined" && navigator.onLine === false)) {
      left = await flushQueue(household.id, send, undefined, gaveUp, sendBatch);
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

  const loadOnce = useCallback(async () => {
    if (!weekId) return;
    const run = ++latest.current;
    try {
      if (typeof navigator !== "undefined" && navigator.onLine === false) throw new Error("offline");
      await flushPending();
      const locationId = household.kroger_location_id ?? null;
      const [weekMeals, people, staples, alwaysHave, itemState, itemStores, prices, matches, choices] = await Promise.all([
        listWeekMeals(sb, weekId),
        listPeople(sb, household.id),
        listStaples(sb, household.id),
        listAlwaysHave(sb, household.id),
        listItemState(sb, weekId),
        listItemStores(sb, household.id),
        listPrices(sb, household.id),
        locationId ? listMatches(sb, household.id, locationId) : Promise.resolve([] as MatchRow[]),
        locationId ? listChoices(sb, household.id) : Promise.resolve([] as Choice[]),
      ]);
      const meals = new Map((await getMeals(sb, [...new Set(cookedNights(weekMeals).map((m) => m.meal_id))])).map((m) => [m.id, m]));
      if (run !== latest.current) return;
      const entries = weekEntries(weekMeals, meals);
      setRaw({
        entries,
        people,
        staples: staples.filter((s) => s.active).map(({ canonical, amount, unit, role }) => ({ canonical, amount, unit, role })),
        alwaysHave,
        // A change still waiting in the queue (the signal dropped mid-flush) stays on screen.
        itemState: overlayQueue(itemState, loadQueue(household.id), weekId),
        itemStores: [...itemStores],
        categoryStore: (household.category_store ?? {}) as Record<string, unknown>,
        prices: withFetched(prices, fetched.current),
        matches: withFetchedMatches(matches, fetchedMatches.current),
        choices,
        locationId,
      });
      setOffline(false);
      setError(false);
    } catch {
      if (run !== latest.current) return;
      if (!fromCache()) setError(true);
    } finally {
      if (run === latest.current) setLoading(false);
    }
  }, [sb, weekId, household.id, household.category_store, household.kroger_location_id, flushPending, fromCache]);
  // One load at a time: a call while one is out joins it, and it repeats once at the end.
  const [flight] = useState(() => singleFlight());
  const load = useCallback(() => flight.run(loadOnce), [flight, loadOnce]);
  const joinLoad = useCallback(() => flight.join(loadOnce), [flight, loadOnce]);

  useEffect(() => {
    if (!weekId) return;
    // Show the last list straight away while the fresh one loads (and keep it when there is no signal).
    const cached = rawRef.current ? null : loadListCache<ListInputs>(weekId);
    // Loading starts from an effect on purpose: it depends on the phone's connection.
    if (cached) setRaw(cached);
    void load();
    const stop = subscribeHousehold(
      household.id,
      ["week_meals", "week_item_state", "staples", "meals", "people", "item_store", "always_have", "price_estimates", "households", "kroger_matches", "item_product_choice"],
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

  // While offline, look again after 5, 10, 20, then every 30 seconds: not every browser says when the network
  // is back. A look that comes due while a load is still out joins it instead of starting another.
  useEffect(() => {
    if (!offline) return;
    let attempt = 0;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      timer = setTimeout(() => {
        void joinLoad().then(() => {
          if (stopped) return;
          attempt++;
          schedule();
        });
      }, backoffDelay(attempt));
    };
    schedule();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [offline, joinLoad]);

  const built = useMemo(() => (raw ? buildList(raw) : null), [raw]);
  const items: ListItem[] = useMemo(() => built?.items ?? [], [built]);
  const totals = useMemo(() => listTotals(items), [items]);
  const state: BudgetState = budgetState(totals.totalCents, household.budget_cents, household.cushion_cents);
  const products = useMemo(() => built?.products ?? {}, [built]);
  const productMode = built?.productMode ?? false;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  // Offline use needs only the searches for foods on this week's list.
  useEffect(() => {
    if (raw && built && weekId) saveListCache(weekId, trimForCache(raw, new Set(built.items.map((i) => i.key))));
  }, [raw, built, weekId]);

  /** Sends a lookup for these foods (the caller has checked they may go) and folds the answer into the list. */
  const askMatches = useCallback(
    (wanted: string[], locationId: string, choice: ReadonlyMap<string, Choice>): Promise<ReadonlyMap<string, MatchRow>> => {
      for (const w of wanted) began(requestedMatches.current, matchKey(locationId, w));
      const settle = (): void => {
        for (const w of wanted) if (requestedMatches.current.get(matchKey(locationId, w))?.inFlight) failedAsk(requestedMatches.current, matchKey(locationId, w));
      };
      return requestMatches(wanted).then(({ matches, unreached }) => {
        const back = new Map(matches.map((m) => [m.canonical, m]));
        // The household may have changed its words while this was out: judge the answer by the latest ones.
        const nowChoice = rawRef.current?.choices ? new Map(rawRef.current.choices.map((c) => [c.canonical, c])) : choice;
        for (const w of wanted) {
          const k = matchKey(locationId, w);
          // A batch that was answered before a later one went unreached still counts for its own foods.
          const got = back.get(w);
          // An answer made with other words than the household's (the day's limit hands back the old row)
          // is no answer: ask again after the backoff, not a day later.
          if ((unreached && !got) || (got && got.term !== (nowChoice.get(w)?.searchTerm || w))) failedAsk(requestedMatches.current, k);
          else answered(requestedMatches.current, k, got);
        }
        setBadFoods((prev) => latchBad(prev, wanted, back, choice));
        if (matches.length > 0) {
          for (const m of matches) fetchedMatches.current.set(matchKey(m.locationId, m.canonical), m);
          setRaw((r) =>
            r && r.locationId === locationId ? { ...r, matches: withFetchedMatches(r.matches ?? [], fetchedMatches.current) } : r,
          );
        }
        return back;
      }, (err) => {
        settle();
        throw err;
      });
    },
    [],
  );

  // Look up the Fred Meyer products of what's to buy and has no fresh search: once per food per visit,
  // so a day's limit or a failed search isn't asked again until the next visit.
  useEffect(() => {
    if (!raw || offline || !raw.locationId) return;
    const locationId = raw.locationId;
    const have = new Map((raw.matches ?? []).filter((m) => m.locationId === locationId).map((m) => [m.canonical, m]));
    const choice = new Map((raw.choices ?? []).map((c) => [c.canonical, c]));
    const wanted = foodsToAsk(
      items.filter((i) => i.store === "fred_meyer" && !i.haveIt).map((i) => i.canonical),
      (f) => matchKey(locationId, f),
      have,
      choice,
      requestedMatches.current,
      now,
    );
    if (wanted.length === 0) return;
    void askMatches(wanted, locationId, choice);
  }, [raw, items, offline, now, askMatches]);

  // Prices may be old when a lookup failed or ran out and a food still has no search from the last day.
  const stalePrices = useMemo(() => {
    if (!raw?.locationId) return false;
    const locationId = raw.locationId;
    const have = new Map((raw.matches ?? []).filter((m) => m.locationId === locationId).map((m) => [m.canonical, m]));
    const choice = new Map((raw.choices ?? []).map((c) => [c.canonical, c]));
    const foods = items.filter((i) => i.store === "fred_meyer" && !i.haveIt).map((i) => i.canonical);
    return pricesStale(foods, have, choice, badFoods, now);
  }, [badFoods, raw, items, now]);

  // Price whatever nobody has priced yet: one request per store.
  useEffect(() => {
    if (!raw || offline) return;
    // Only Fred Meyer with no store chosen is still priced by the model; a chosen store uses real products,
    // and Amazon and Costco show only a price you typed.
    if (raw.locationId) return;
    const saved = toPriceMap(raw.prices);
    // One question per part: a row can need a volume price and a count price.
    const missing: { canonical: string; qty: Quantity; store: Store }[] = [];
    const seen = new Set<string>();
    for (const i of items) {
      if (i.haveIt || i.store !== "fred_meyer") continue;
      // A "to taste" note is not worth pricing when the row has a real amount.
      const asked = i.parts.filter((p) => !isVague(p) || i.parts.every(isVague));
      for (const p of asked) {
        const k = priceKey(i.canonical, i.store, p.kind);
        if (retryAfter(requested.current.get(k), now) > 0 || seen.has(k)) continue;
        const have = saved.get(k);
        if (have) continue;
        seen.add(k);
        missing.push({ canonical: i.canonical, qty: p, store: i.store });
      }
    }
    if (missing.length === 0) return;
    for (const m of missing) requested.current.set(priceKey(m.canonical, m.store, m.qty.kind), Infinity);
    for (const [store, wanted] of groupMissing(missing)) {
      const forget = () => {
        // No answer (offline, over the cap): hold it for a minute, then let it be asked again.
        const again = Date.now() + FAILED_REQUEST_HOLD_MS;
        for (const w of wanted) requested.current.set(priceKey(w.canonical, store, w.qty.kind), again);
      };
      void requestEstimates(wanted, store).then((rows) => {
        if (rows.length === 0) return forget();
        for (const p of rows) fetched.current.set(priceKey(p.canonical, p.store, p.kind), p);
        setRaw((r) => (r ? { ...r, prices: mergeFetched(r.prices, rows) } : r));
      }, forget);
    }
  }, [raw, items, offline, now]);

  /** Sets have-it, got-it or outside-budget for an item. Offline, it waits in the queue. */
  const updateMany = useCallback(
    async (itemKeys: string[], patch: ItemPatch) => {
      if (!weekId || itemKeys.length === 0) return;
      // One state update for the whole batch, so 40+ rows render once.
      // Writes go to the food's own key and carry every flag, not just the patch: the food may still
      // have its flags on old food#kind rows, and the food row wins whole once it exists.
      const current = rawRef.current;
      // Full-flag writes are last-writer-wins per food across phones.
      const merged = mergeFlags(current?.itemState ?? {}, itemKeys, patch);
      if (current) {
        const next = { ...current, itemState: { ...current.itemState, ...merged } };
        rawRef.current = next;
        setRaw(next);
      }
      latest.current++; // a load already under way would bring back the old value
      // Every change goes through the queue (one entry per item), so an older queued write can never land after a newer one.
      // The package count goes along only when this change names it: another phone may have set it since.
      enqueuePatches(household.id, itemKeys.map((itemKey) => ({ weekId, itemKey, patch: writeFlags(merged[itemKey], patch) })));
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setOffline(true);
        return;
      }
      refused.current = false;
      const left = await flushPending();
      if (left > 0) {
        setOffline(true);
        // A change was given up on while others wait: put the screen back to what the server has.
        if (refused.current) void load();
        return;
      }
      // Realtime brings our own writes back; reload ourselves only when it isn't live, or when a change was refused.
      if (!liveRef.current || refused.current) void load();
      // The server said no (not a network problem): the screen is put back and the caller says so.
      if (refused.current) throw new Error("refused");
    },
    [weekId, household.id, flushPending, load],
  );
  const update = useCallback((itemKey: string, patch: ItemPatch) => updateMany([itemKey], patch), [updateMany]);

  /** How many packages to buy of a food this week; null goes back to what the list works out. */
  const setPackCount = useCallback(
    (item: ListItem, count: number | null) => update(item.key, { pack_count: clampPackCount(count) }),
    [update],
  );

  /** The household's pick among the products found. The list re-picks at once. Throws when it can't be saved. */
  const chooseProduct = useCallback(
    async (item: ListItem, upc: string) => {
      await setChoice(sb, household.id, item.canonical, { upc });
      latest.current++; // a load already under way would bring back the old choice
      setRaw((r) => (r ? { ...r, choices: withChoice(r.choices ?? [], item.canonical, { upc }) } : r));
    },
    [sb, household.id],
  );

  /**
   * Looks for a food with the household's own words. That one food skips the day's hold, but not the backoff
   * after a failed request, and the server still charges the household's daily cap. Throws SearchNotSaved when the words
   * can't be saved, or SearchNotReturned when the search didn't come back (the words stay saved and are tried again later).
   */
  const searchWith = useCallback(
    async (item: ListItem, term: string) => {
      const words = term.trim();
      try {
        await setChoice(sb, household.id, item.canonical, { searchTerm: words, upc: null });
      } catch {
        throw new SearchNotSaved();
      }
      latest.current++;
      const current = rawRef.current;
      const locationId = current?.locationId ?? null;
      const choices = withChoice(current?.choices ?? [], item.canonical, { searchTerm: words, upc: null });
      setRaw((r) => (r ? { ...r, choices } : r));
      if (!locationId || (typeof navigator !== "undefined" && navigator.onLine === false)) throw new SearchNotReturned();
      if (!askableNow(requestedMatches.current, matchKey(locationId, item.canonical))) throw new SearchNotReturned();
      const back = await askMatches([item.canonical], locationId, new Map(choices.map((c) => [c.canonical, c])));
      // Over the day's limit the server hands back the old search: it is not an answer to these words.
      if (back.get(item.canonical)?.term !== words) throw new SearchNotReturned();
    },
    [sb, household.id, askMatches],
  );

  /** Back to Basket's own pick. Searches again if the saved search used the household's words. */
  const resetChoice = useCallback(
    async (item: ListItem) => {
      await clearChoice(sb, household.id, item.canonical);
      latest.current++;
      const current = rawRef.current;
      const locationId = current?.locationId ?? null;
      const choices = (current?.choices ?? []).filter((c) => c.canonical !== item.canonical);
      setRaw((r) => (r ? { ...r, choices: (r.choices ?? []).filter((c) => c.canonical !== item.canonical) } : r));
      const cached = current?.matches?.find((m) => m.locationId === locationId && m.canonical === item.canonical);
      if (!locationId || !cached || cached.term === item.canonical) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) return;
      if (!askableNow(requestedMatches.current, matchKey(locationId, item.canonical))) return;
      await askMatches([item.canonical], locationId, new Map(choices.map((c) => [c.canonical, c])));
    },
    [sb, household.id, askMatches],
  );

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
    products,
    productMode,
    stalePrices,
    update,
    updateMany,
    setPackCount,
    chooseProduct,
    searchWith,
    resetChoice,
    choices: raw?.choices ?? [],
    setPrice,
    moveItem,
    reload: load,
  };
}

/** True when the household's current week is not the one `seen` (a week start, YYYY-MM-DD) names; null means none seen yet. */
export function weekChanged(seen: string | null, now: Date, household: Pick<Household, "week_start" | "time_zone">): boolean {
  return seen !== weekStartFor(now, household.week_start as Day, household.time_zone);
}

/** What the list area shows: the error card, the skeleton, the empty note or the list. */
export function listView(o: { weekFailed: boolean; error: boolean; loading: boolean; itemCount: number }): "error" | "skeleton" | "empty" | "list" {
  if ((o.weekFailed || o.error) && o.itemCount === 0) return "error";
  if (o.loading) return "skeleton";
  return o.itemCount === 0 ? "empty" : "list";
}

/**
 * This week's id. Offline it falls back to the one seen last time, so the cached list can still show.
 * It looks again when the phone comes back to the foreground or online, so a list left open past the turn
 * of the week moves on to the new one. `failed` means the last try got no answer; with `id` still null
 * there is nothing to show, and `retry` tries again.
 */
export function useWeekId(household: Household): { id: string | null; failed: boolean; retry: () => void } {
  const sb = useMemo(() => createBrowserClient(), []);
  const [id, setId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  // The week start the server last confirmed; null until then (a remembered id alone does not count).
  const seen = useRef<string | null>(null);
  const retry = useCallback(() => {
    setFailed(false);
    setTries((n) => n + 1);
  }, []);
  const { id: householdId, week_start: weekStartDay, time_zone: timeZone } = household;
  useEffect(() => {
    let alive = true;
    let running: Promise<void> | null = null;
    const resolve = (): Promise<void> => {
      if (running) return running;
      const weekStart = weekStartFor(new Date(), weekStartDay as Day, timeZone);
      // The week seen last time is used right away, so a phone with no signal doesn't wait on the network.
      const remembered = loadDraft<{ householdId: string; weekStart: string; id: string }>("list-week");
      if (remembered?.householdId === householdId && remembered.weekStart === weekStart) {
        setId(remembered.id);
      }
      running = (async () => {
        try {
          const week = await getOrCreateWeek(sb, householdId, weekStart);
          saveDraft("list-week", { householdId: householdId, weekStart, id: week.id });
          seen.current = weekStart;
          if (alive) {
            setId(week.id);
            setFailed(false);
          }
        } catch {
          // Offline: the remembered week above stands.
          if (alive) setFailed(true);
        } finally {
          running = null;
        }
      })();
      return running;
    };
    const recheck = () => {
      if (weekChanged(seen.current, new Date(), { week_start: weekStartDay, time_zone: timeZone })) void resolve();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") recheck();
    };
    void resolve();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", recheck);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", recheck);
    };
  }, [sb, householdId, weekStartDay, timeZone, tries]);
  return { id, failed, retry };
}
