"use client";

import { useEffect, useMemo, useState } from "react";
import { AllergyBox } from "@/components/flags/AllergyBox";
import { cardFlagText, FlagLines, flagsOf } from "@/components/flags/FlagLines";
import { MealThumb } from "@/components/MealThumb";
import { Sheet } from "@/components/Sheet";
import { createBrowserClient } from "@/lib/db/client";
import { listPeople } from "@/lib/db/queries/household";
import { listItemStores, listPrices } from "@/lib/db/queries/list";
import { filterFavorites, listFavorites, mealPhotoSrcs, toMeal, type FavoriteFilter } from "@/lib/db/queries/meals";
import type { Household, MealRow } from "@/lib/db/rows";
import type { Store } from "@/lib/domain/list";
import { scaleMeal } from "@/lib/domain/scaling";
import type { Person } from "@/lib/domain/types";
import { favoritesCosts, storeFor, toPriceMap, type PriceRow } from "@/lib/list/prices";
import { subscribeHousehold } from "@/lib/realtime";
import type { Flag } from "@/lib/domain/flags";
import { focusRing, pillButton } from "@/lib/ui";
import { mealTag } from "@/lib/week/note";

type Chip = "all" | FavoriteFilter;

const TAGS = {
  vegetarian: { label: "Vegetarian", cls: "bg-green-tint text-[#134D31]" },
  swap: { label: "Veg swap", cls: "bg-[#EEF0ED] text-[#4A544F]" },
} as const;

interface Pricing {
  itemStores: Map<string, Store>;
  prices: PriceRow[];
}

const made = (n: number) => (n === 0 ? "Not made yet" : n === 1 ? "Made 1 time" : `Made ${n} times`);

/** The household's saved meals: search, filter chips and a "+" on every row. Used on Favorites and in Add a meal. */
export function FavoritesBrowser({
  household,
  showChips,
  addLabel,
  anywayLabel = "Add to this week anyway",
  onAdd,
}: {
  household: Household;
  showChips: boolean;
  addLabel: (meal: MealRow) => string;
  /** The text of the second button when a recipe lists an allergy. */
  anywayLabel?: string;
  onAdd: (meal: MealRow) => void | Promise<void>;
}) {
  const sb = useMemo(() => createBrowserClient(), []);
  const [rows, setRows] = useState<MealRow[] | null>(null);
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  const [error, setError] = useState(false);
  const [q, setQ] = useState("");
  const [chip, setChip] = useState<Chip>("all");
  const [people, setPeople] = useState<Person[]>([]);
  const [pricing, setPricing] = useState<Pricing | null>(null);
  const [warning, setWarning] = useState<{ meal: MealRow; flags: Flag[] } | null>(null);

  useEffect(() => {
    let run = 0;
    async function load() {
      const mine = ++run;
      try {
        // People come with the rows, so a row is never drawn without its flags.
        const [all, loadedPeople] = await Promise.all([listFavorites(sb, household.id), listPeople(sb, household.id)]);
        const urls = await mealPhotoSrcs(sb, all);
        if (mine !== run) return;
        setRows(all);
        setPeople(loadedPeople);
        setPhotos(urls);
        setError(false);
        if (showChips) {
          // Only the "Under $15" chip needs these; the list still works without them.
          try {
            const [itemStores, prices] = await Promise.all([
              listItemStores(sb, household.id),
              listPrices(sb, household.id),
            ]);
            if (mine === run) setPricing({ itemStores, prices });
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
    () => (rows && pricing ? rows.map((r) => ({ id: r.id, lines: scaleMeal(toMeal(r), people) })) : []),
    [rows, pricing, people],
  );
  // "Under $15" uses the prices already saved and never asks anyone for more.
  const priced = useMemo(
    () => (pricing ? favoritesCosts(lines, storeOf, toPriceMap(pricing.prices)) : undefined),
    [pricing, lines, storeOf],
  );
  const costs = priced?.costs;

  const shown = useMemo(
    () => (rows ? filterFavorites(rows, { q, filter: chip === "all" ? undefined : chip, costs }) : []),
    [rows, q, chip, costs],
  );

  const flagsById = useMemo(
    () => new Map<string, Flag[]>((rows ?? []).map((r) => [r.id, flagsOf(toMeal(r), people)])),
    [rows, people],
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
          className={`h-12 w-full rounded-xl border border-[#D5DBD5] bg-white pl-[42px] pr-3.5 text-base ${focusRing}`}
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

      {showChips && chip === "under15" && priced && priced.notPriced > 0 && (
        <p data-testid="not-priced-yet" className="mx-5 mt-3 text-[13px] text-muted">
          {priced.notPriced} not priced yet
        </p>
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
            const flags = flagsById.get(m.id) ?? [];
            return (
              <li key={m.id} data-testid="favorite-row" className="flex min-h-[58px] items-center gap-3 rounded-[14px] border border-line bg-white py-1.5 pl-2.5 pr-2">
                <MealThumb src={photos[m.id] ?? null} className="size-14 rounded-[10px]" />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold">{m.name}</p>
                  <p className="mt-0.5 text-xs text-muted">{made(m.times_planned)}</p>
                  <FlagLines flags={flags} people={people} />
                </div>
                {tag && <span className={`whitespace-nowrap rounded-[10px] px-2 py-[3px] text-xs font-semibold ${TAGS[tag].cls}`}>{TAGS[tag].label}</span>}
                <button
                  type="button"
                  aria-label={`${addLabel(m)}${cardFlagText(toMeal(m), people)}`}
                  onClick={() => (flags.some((f) => f.kind === "allergy") ? setWarning({ meal: m, flags }) : void onAdd(m))}
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
      {warning && (
        <Sheet label="Allergy" onClose={() => setWarning(null)}>
          <div className="pb-5 pt-3">
            <p className="mx-5 text-[17px] font-bold">{warning.meal.name}</p>
            <AllergyBox flags={warning.flags} people={people} />
            <div className="mx-5 mt-3 grid gap-2">
              <button type="button" onClick={() => setWarning(null)} className={`${pillButton} h-[52px] w-full text-base`}>
                Pick a different dinner
              </button>
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => {
                    const meal = warning.meal;
                    setWarning(null);
                    void onAdd(meal);
                  }}
                  className={`inline-flex min-h-11 min-w-11 items-center justify-center px-3 text-[15px] font-semibold text-ink ${focusRing}`}
                >
                  {anywayLabel}
                </button>
              </div>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
