"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MealThumb } from "@/components/MealThumb";
import { createBrowserClient } from "@/lib/db/client";
import { listPeople } from "@/lib/db/queries/household";
import { listItemStores, listPrices } from "@/lib/db/queries/list";
import { filterFavorites, listFavorites, mealPhotoSrcs, toMeal, type FavoriteFilter } from "@/lib/db/queries/meals";
import type { Household, MealRow } from "@/lib/db/rows";
import type { Store } from "@/lib/domain/list";
import { scaleMeal } from "@/lib/domain/scaling";
import type { Person } from "@/lib/domain/types";
import { groupMissing, requestEstimates } from "@/lib/list/estimates-client";
import { mealCostCents, priceKey, storeFor, toPriceMap, type PriceRow } from "@/lib/list/prices";
import { subscribeHousehold } from "@/lib/realtime";
import { focusRing } from "@/lib/ui";
import { mealTag } from "@/lib/week/note";

type Chip = "all" | FavoriteFilter;

const TAGS = {
  vegetarian: { label: "Vegetarian", cls: "bg-green-tint text-[#134D31]" },
  swap: { label: "Veg swap", cls: "bg-[#EEF0ED] text-[#4A544F]" },
} as const;

interface Pricing {
  people: Person[];
  itemStores: Map<string, Store>;
  prices: PriceRow[];
}

const made = (n: number) => (n === 0 ? "Not made yet" : n === 1 ? "Made 1 time" : `Made ${n} times`);

/** The household's saved meals: search, filter chips and a "+" on every row. Used on Favorites and in Add a meal. */
export function FavoritesBrowser({
  household,
  showChips,
  addLabel,
  onAdd,
}: {
  household: Household;
  showChips: boolean;
  addLabel: (meal: MealRow) => string;
  onAdd: (meal: MealRow) => void | Promise<void>;
}) {
  const sb = useMemo(() => createBrowserClient(), []);
  const [rows, setRows] = useState<MealRow[] | null>(null);
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [chip, setChip] = useState<Chip>("all");
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const requested = useRef(new Set<string>());

  useEffect(() => {
    let run = 0;
    async function load() {
      const mine = ++run;
      try {
        const all = await listFavorites(sb, household.id);
        const urls = await mealPhotoSrcs(sb, all);
        if (mine !== run) return;
        setRows(all);
        setPhotos(urls);
        setError(false);
        if (showChips) {
          // Only the "Under $15" chip needs these; the list still works without them.
          try {
            const [people, itemStores, prices] = await Promise.all([
              listPeople(sb, household.id),
              listItemStores(sb, household.id),
              listPrices(sb, household.id),
            ]);
            if (mine === run) setPricing({ people, itemStores, prices });
          } catch {
            // Without prices the chip simply finds nothing.
          }
        }
      } catch {
        if (mine === run) setError(true);
      }
    }
    void load();
    const stop = subscribeHousehold(household.id, ["meals"], () => void load());
    return () => {
      run++;
      stop();
    };
  }, [sb, household.id, showChips]);

  const storeOf = useMemo(
    () => (canonical: string, role: Parameters<typeof storeFor>[1]) =>
      storeFor(canonical, role, pricing?.itemStores ?? new Map(), (household.category_store ?? {}) as Record<string, unknown>),
    [pricing, household.category_store],
  );
  const lines = useMemo(
    () => (rows && pricing ? rows.map((r) => ({ id: r.id, lines: scaleMeal(toMeal(r), pricing.people) })) : []),
    [rows, pricing],
  );
  const costs = useMemo(() => {
    if (!pricing) return undefined;
    const prices = toPriceMap(pricing.prices);
    return new Map(lines.map((m) => [m.id, mealCostCents(m.lines, storeOf, prices)]));
  }, [pricing, lines, storeOf]);

  // The first time "Under $15" is picked, price whatever has no price yet: one request per store.
  useEffect(() => {
    if (chip !== "under15" || !pricing) return;
    const have = new Set(pricing.prices.map((p) => priceKey(p.canonical, p.store, p.kind)));
    const missing = lines
      .flatMap((m) => m.lines)
      .map((l) => ({ canonical: l.canonical, qty: l.qty, store: storeOf(l.canonical, l.role) }))
      .filter((w) => !have.has(priceKey(w.canonical, w.store, w.qty.kind)) && !requested.current.has(priceKey(w.canonical, w.store, w.qty.kind)));
    for (const w of missing) requested.current.add(priceKey(w.canonical, w.store, w.qty.kind));
    for (const [store, wanted] of groupMissing(missing)) {
      void requestEstimates(wanted, store).then((rows) => {
        if (rows.length > 0) setPricing((p) => (p ? { ...p, prices: [...p.prices, ...rows] } : p));
      });
    }
  }, [chip, pricing, lines, storeOf]);

  const shown = useMemo(
    () => (rows ? filterFavorites(rows, { q, filter: chip === "all" ? undefined : chip, costs }) : []),
    [rows, q, chip, costs],
  );

  if (error && !rows) return <p role="alert" className="mx-5 mt-4 text-[15px]">We couldn&apos;t load your favorites. Try again in a moment.</p>;
  if (!rows) return <p className="mx-5 mt-4 text-[15px] text-muted">Loading favorites…</p>;

  const chips: { id: Chip; label: string }[] = [
    { id: "all", label: `All ${rows.length}` },
    { id: "vegetarian", label: "Vegetarian" },
    { id: "under15", label: "Under $15" },
    { id: "most", label: "Most made" },
  ];

  return (
    <div>
      <div className="relative mx-5">
        <label htmlFor="favorites-q" className="sr-only">
          Search favorites
        </label>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#5B6560" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="absolute left-3.5 top-[15px]">
          <circle cx="11" cy="11" r="7" />
          <path d="M20 20l-3.5-3.5" />
        </svg>
        <input
          id="favorites-q"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search meals or ingredients"
          className={`h-12 w-full rounded-xl border border-[#D5DBD5] bg-white pl-[42px] pr-3.5 text-[15px] ${focusRing}`}
        />
      </div>

      {showChips && (
        <div role="group" aria-label="Filter" className="mx-5 mt-3 flex flex-wrap gap-2">
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={chip === c.id}
              onClick={() => setChip(c.id)}
              className={`inline-flex min-h-11 items-center rounded-full px-3.5 text-[13px] ${focusRing} ${
                chip === c.id ? "bg-ink font-semibold text-white" : "border border-[#D5DBD5] bg-white font-medium text-ink"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <p className="mx-5 mt-4 text-[15px] text-muted">
          {rows.length === 0
            ? "No favorites yet. Save a meal as a favorite when you add it."
            : "No favorites match that."}
        </p>
      ) : (
        <ul className="mx-5 mt-3.5 flex flex-col gap-2">
          {shown.map((m) => {
            const tag = mealTag(toMeal(m));
            return (
              <li key={m.id} data-testid="favorite-row" className="flex min-h-[58px] items-center gap-3 rounded-[14px] border border-line bg-white py-1.5 pl-2.5 pr-2">
                <MealThumb src={photos[m.id] ?? null} className="size-14 rounded-[10px]" />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold">{m.name}</p>
                  <p className="mt-0.5 text-xs text-muted">{made(m.times_planned)}</p>
                </div>
                {tag && <span className={`whitespace-nowrap rounded-[10px] px-2 py-[3px] text-xs font-semibold ${TAGS[tag].cls}`}>{TAGS[tag].label}</span>}
                <button
                  type="button"
                  aria-label={addLabel(m)}
                  onClick={() => void onAdd(m)}
                  className={`flex size-11 shrink-0 items-center justify-center rounded-full bg-green-tint text-green ${focusRing}`}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
