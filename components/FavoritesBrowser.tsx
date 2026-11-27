"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";
import { AllergyBox } from "@/components/flags/AllergyBox";
import { cardFlagText, FlagLines, flagsOf } from "@/components/flags/FlagLines";
import { MealTile } from "@/components/MealTile";
import { ensurePreviews } from "@/lib/photos/ensure-previews";
import { Sheet } from "@/components/Sheet";
import { Button, ButtonLink, IconButton } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { EmptyState, ErrorBanner, Loading, SkeletonTile } from "@/components/ui/states";
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
import { ghostButton } from "@/lib/ui";
import { mealTag } from "@/lib/week/note";

type Chip = "all" | FavoriteFilter;

const TAGS = { vegetarian: "Vegetarian", swap: "Veg swap" } as const;

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
  emptyAction,
}: {
  household: Household;
  showChips: boolean;
  addLabel: (meal: MealRow) => string;
  /** The text of the second button when a recipe lists an allergy. */
  anywayLabel?: string;
  onAdd: (meal: MealRow) => void | Promise<void>;
  /** A way on from the empty list (Favorites passes "Find a dinner"; the Add a meal tab does not). */
  emptyAction?: { label: string; href: string };
}) {
  const sb = useMemo(() => createBrowserClient(), []);
  const [rows, setRows] = useState<MealRow[] | null>(null);
  const [photos, setPhotos] = useState<Record<string, string | null>>({});
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
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
        setTimeout(() => ensurePreviews(all), 0); // never throws, never awaited
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
    const stop = subscribeHousehold(household.id, ["meals", "people"], () => void load());
    return () => {
      run++;
      stop();
    };
  }, [sb, household.id, showChips, attempt]);

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

  if (error && !rows) {
    return (
      <div className="bk-gutter mt-3">
        <ErrorBanner
          message="Couldn’t load your favorites."
          actionLabel="Try again"
          onAction={() => {
            setError(false);
            setAttempt((n) => n + 1);
          }}
        />
      </div>
    );
  }
  if (!rows) {
    return (
      <div className="bk-gutter mt-3">
        <Loading label="Loading favorites…" />
        <div className="grid grid-cols-2 items-start gap-2">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonTile key={i} crop="tile" />
          ))}
        </div>
      </div>
    );
  }

  const chips: { id: Chip; label: string }[] = [
    { id: "all", label: `All ${rows.length}` },
    { id: "vegetarian", label: "Vegetarian" },
    { id: "under15", label: "Under $15" },
    { id: "most", label: "Most made" },
  ];

  const chipBase = "inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-md px-3 py-2 text-small bk-press";

  return (
    <div>
      <div className="bk-gutter">
        <TextField
          label="Search favorites"
          hideLabel
          icon={Search}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search meals or ingredients"
        />
      </div>

      {showChips && (
        <div
          role="group"
          aria-label="Filter"
          className="bk-gutter mt-3 flex gap-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {chips.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={chip === c.id}
              onClick={() => setChip(c.id)}
              className={chip === c.id ? `${chipBase} bg-ink font-semibold text-ground` : `${ghostButton} shrink-0 whitespace-nowrap`}
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      {showChips && chip === "under15" && priced && priced.notPriced > 0 && (
        <p data-testid="not-priced-yet" className="bk-gutter mt-3 text-small text-ink-soft">
          {priced.notPriced} not priced yet
        </p>
      )}

      {shown.length === 0 ? (
        <div className="bk-gutter">
          {rows.length === 0 ? (
            <>
              <EmptyState sentence="Nothing saved yet. Meals you keep will wait here." />
              {emptyAction && (
                <div className="-mt-4 pb-8">
                  <ButtonLink variant="ghost" href={emptyAction.href}>
                    {emptyAction.label}
                  </ButtonLink>
                </div>
              )}
            </>
          ) : (
            <p className="py-8 text-body text-ink">No favorites match that.</p>
          )}
        </div>
      ) : (
        <ul className="bk-gutter mt-3 grid grid-cols-2 items-start gap-2">
          {shown.map((m) => {
            const tag = mealTag(toMeal(m));
            const flags = flagsById.get(m.id) ?? [];
            return (
              <li key={m.id} data-testid="favorite-row">
                <MealTile
                  name={m.name}
                  photo={photos[m.id] ?? null}
                  preview={m.photo_preview}
                  width={m.photo_width}
                  note={made(m.times_planned)}
                  lines={
                    <>
                      {tag && <span className="block text-label text-ink-soft">{TAGS[tag]}</span>}
                      <FlagLines flags={flags} people={people} />
                    </>
                  }
                  trailing={
                    <span className="mt-1 flex justify-end">
                      <IconButton
                        icon={Plus}
                        size={18}
                        label={`${addLabel(m)}${cardFlagText(toMeal(m), people)}`}
                        onClick={() => (flags.some((f) => f.kind === "allergy") ? setWarning({ meal: m, flags }) : void onAdd(m))}
                        className="bg-sunk"
                      />
                    </span>
                  }
                />
              </li>
            );
          })}
        </ul>
      )}
      {warning && (
        <Sheet label="Allergy" title={warning.meal.name} onClose={() => setWarning(null)}>
          <div className="pb-4">
            <AllergyBox flags={warning.flags} people={people} />
            <div className="mx-4 mt-3 grid gap-2">
              <Button variant="main" onClick={() => setWarning(null)}>
                Pick a different dinner
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  const meal = warning.meal;
                  setWarning(null);
                  void onAdd(meal);
                }}
              >
                {anywayLabel}
              </Button>
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}
