"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { MealThumb } from "@/components/MealThumb";
import type { RecipeOption, RecipeSource } from "@/lib/recipes/search/provider";
import { isMostLoved, ratingLine } from "@/lib/recipes/search/loved";
import { sharesLine, sortByOverlap } from "@/lib/recipes/search/overlap";
import { focusRing } from "@/lib/ui";
import { formatMinutes } from "@/lib/week/format";
import { messageFor, searchRecipes, type SearchResult } from "./api";
import { loadSort, saveSort, SortControl, type SortMode } from "./SortControl";
import { DishCard, FindMyDishButton, lookUpDish, type DishState } from "./FindMyDish";

const SOURCES: { id: RecipeSource; label: string }[] = [
  { id: "sites", label: "Big sites" },
  { id: "spoonacular", label: "Spoonacular" },
];

function metaParts(o: RecipeOption, first: boolean) {
  const rating = ratingLine(o);
  const minutes = o.totalMinutes !== null ? formatMinutes(o.totalMinutes) : null;
  return { loved: first && !!rating && isMostLoved(o), line: [rating, minutes].filter(Boolean).join(" · ") };
}

function MetaLine({ loved, line, shares }: { loved: boolean; line: string; shares: string | null }) {
  return (
    <>
      {loved && <span data-testid="result-loved" className="mt-0.5 block text-[13px] font-semibold text-[#1F7A4D]">Most loved</span>}
      {line && <span data-testid="result-meta" className="mt-0.5 block truncate text-[13px] text-[#4A544F]">{line}</span>}
      {shares && <span data-testid="result-shares" className="mt-0.5 block break-words text-[13px] font-medium text-[#1F7A4D]">{shares}</span>}
    </>
  );
}

/** Search the big recipe sites or Spoonacular, then pick a card. */
export function SearchTab({
  query,
  onQuery,
  source,
  onSource,
  hideResults,
  week,
  onNeedWeek,
  picking,
  onPick,
  onSearchStart,
  onDishPhoto,
}: {
  query: string;
  onQuery: (q: string) => void;
  source: RecipeSource;
  onSource: (s: RecipeSource) => void;
  hideResults: boolean;
  /** Foods on this week's list from the other planned meals; null until known. */
  week: { foods: string[]; otherMeals: number } | null;
  /** Called when "Fits this week" is chosen, so the week is only read when it is wanted. */
  onNeedWeek: () => void;
  picking: boolean;
  onPick: (o: RecipeOption) => void;
  onSearchStart: () => void;
  /** The browser-sized photo behind a found dish, or null when there is none. */
  onDishPhoto: (photo: Blob | null) => void;
}) {
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dish, setDish] = useState<DishState | null>(null);
  const [sort, setSort] = useState<SortMode>(loadSort);
  const thumbUrl = useRef<string | null>(null);

  useEffect(() => {
    if (sort === "fits") onNeedWeek();
  }, [sort, onNeedWeek]);

  useEffect(() => () => {
    if (thumbUrl.current) URL.revokeObjectURL(thumbUrl.current);
  }, []);

  async function findDish(file: File) {
    onSearchStart();
    onDishPhoto(null);
    setResult(null);
    setError(null);
    setLoading(true);
    setDish({ phase: "looking", url: "" });
    try {
      const { blob, result: found } = await lookUpDish(file, source, (_blob, url) => {
        if (thumbUrl.current) URL.revokeObjectURL(thumbUrl.current);
        thumbUrl.current = url;
        setDish({ phase: "looking", url });
      });
      const url = thumbUrl.current ?? "";
      if (!found.guess.isFood) {
        setDish({ phase: "notfood", url });
        return;
      }
      onQuery(found.guess.searchQuery);
      setResult({
        options: found.options,
        source: found.source ?? source,
        fellBack: !!found.fellBack,
        toppedUp: !!found.toppedUp,
      });
      onDishPhoto(blob);
      setDish({ phase: "found", url, guess: found.guess });
    } catch (e) {
      setDish({ phase: "error", url: thumbUrl.current, message: e instanceof Error ? e.message : messageFor(e) });
    } finally {
      setLoading(false);
    }
  }

  async function run(q: string, src: RecipeSource) {
    if (!q.trim()) return;
    setDish((d) => (d?.phase === "found" ? d : null));
    onSearchStart();
    setLoading(true);
    setError(null);
    try {
      setResult(await searchRecipes(q.trim(), src));
    } catch (e) {
      setResult(null);
      setError(messageFor(e));
    } finally {
      setLoading(false);
    }
  }

  const found = useMemo(() => result?.options ?? [], [result]);
  const foods = useMemo(() => week?.foods ?? [], [week]);
  // Fits this week reorders by shared foods; with nothing to share it is the same order as Most loved.
  const ranked = useMemo(() => sortByOverlap(found, foods), [found, foods]);
  const shown = useMemo(() => {
    if (sort === "fits") return ranked;
    const sharedBy = new Map(ranked.map((r) => [r.option, r.shared]));
    return found.map((option) => ({ option, shared: sharedBy.get(option) ?? [] }));
  }, [sort, ranked, found]);
  const options = found;
  const showsSpoonacular = options.some((o) => o.source === "spoonacular");

  return (
    <div>
      <form
        className="mx-5 mt-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void run(query, source);
        }}
      >
        <label htmlFor="meal" className="mb-1.5 block text-[13px] font-semibold text-[#4A544F]">
          What&apos;s for dinner?
        </label>
        <div className="flex gap-2">
          <input
            id="meal"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            enterKeyHint="search"
            autoComplete="off"
            className={`h-12 min-w-0 flex-1 rounded-xl border-[1.5px] border-green bg-white px-3.5 text-base ${focusRing}`}
          />
          <button
            type="submit"
            disabled={loading || !query.trim()}
            className={`inline-flex h-12 shrink-0 items-center rounded-full bg-green px-5 text-[15px] font-semibold text-white disabled:opacity-60 ${focusRing}`}
          >
            Search
          </button>
        </div>
        <FindMyDishButton busy={loading} onFile={(f) => void findDish(f)} />
        <div role="radiogroup" aria-label="Where to look" className="mt-2.5 grid grid-cols-2 gap-1 rounded-[14px] bg-[#EAEEE9] p-1">
          {SOURCES.map((s) => (
            <button
              key={s.id}
              type="button"
              role="radio"
              aria-checked={source === s.id}
              onClick={() => {
                if (source === s.id) return;
                onSource(s.id);
                if (query.trim() && (result || error)) void run(query, s.id);
              }}
              className={`h-11 rounded-[10px] text-sm ${focusRing} ${
                source === s.id ? "bg-white font-semibold text-ink shadow-sm" : "font-medium text-[#4A544F]"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </form>

      {!hideResults && dish && (
        <DishCard
          state={dish}
          onChangeName={() => {
            const input = document.getElementById("meal") as HTMLInputElement | null;
            input?.focus();
            input?.select();
          }}
        />
      )}

      {!hideResults && (
        <div className="mx-5 mt-3.5" aria-live="polite">
          {loading && dish?.phase !== "looking" && (
            <ul aria-label="Searching" className="flex flex-col gap-2">
              {[0, 1, 2].map((i) => (
                <li key={i} className="flex h-[88px] animate-pulse gap-3 rounded-2xl border border-line bg-white p-2.5">
                  <div className="size-[68px] rounded-[10px] bg-[#EDF0EC]" />
                  <div className="flex-1 space-y-2 pt-1.5">
                    <div className="h-3.5 w-3/4 rounded bg-[#EDF0EC]" />
                    <div className="h-3 w-1/2 rounded bg-[#EDF0EC]" />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {!loading && error && (
            <p role="alert" className="text-[15px] font-medium text-[#A6261B]">
              {error}
            </p>
          )}
          {!loading && result && (
            <>
              {result.fellBack && <p className="mb-2 text-sm text-muted">Nothing on the big sites, so here&apos;s Spoonacular.</p>}
              {result.toppedUp && (
                <p className="mb-2 text-sm text-muted">Only a few on the big sites, so here are some from Spoonacular too.</p>
              )}
              {options.length === 0 ? (
                <p className="text-[15px] text-muted">No recipes found on our sites. Try other words, or paste a recipe.</p>
              ) : (
                <>
                <SortControl
                  value={sort}
                  onChange={(m) => {
                    setSort(m);
                    saveSort(m);
                  }}
                />
                {sort === "fits" && week !== null && foods.length === 0 && (
                  <p data-testid="fits-empty" className="mb-2.5 text-sm text-muted">
                    {week.otherMeals === 0 ? "Add another dinner first to see what fits" : "Nothing on this week's list to match yet"}
                  </p>
                )}
                <ul className="flex flex-col gap-2">
                  {shown.map(({ option: o, shared }) => {
                    // The badge stays with the most-loved pick, wherever the sort puts it.
                    const m = metaParts(o, o === found[0]);
                    const shares = sharesLine(shared);
                    return (
                    <li key={o.url}>
                      <button
                        type="button"
                        data-testid="result-card"
                        aria-label={`${o.title} · ${o.site}${m.loved ? ", Most loved" : ""}${m.line ? `, ${m.line}` : ""}${shares ? `, ${shares}` : ""}`}
                        disabled={picking}
                        onClick={() => onPick(o)}
                        className={`flex min-h-[88px] w-full items-center gap-3 rounded-2xl border border-line bg-white p-2.5 text-left disabled:opacity-60 ${focusRing}`}
                      >
                        <MealThumb src={o.image} className="size-[68px] rounded-[10px]" />
                        <span className="min-w-0 flex-1">
                          <span data-testid="result-title" className="block text-[15px] font-semibold leading-snug">
                            {o.title}
                          </span>
                          <span data-testid="result-site" className="mt-0.5 block text-[13px] text-muted">
                            {o.site}
                          </span>
                          <MetaLine loved={m.loved} line={m.line} shares={shares} />
                        </span>
                      </button>
                    </li>
                    );
                  })}
                </ul>
                </>
              )}
              {showsSpoonacular && (
                <p className="mt-3 text-[13px]">
                  <a href="https://spoonacular.com" target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-11 items-center font-semibold text-green ${focusRing}`}>
                    Recipes from Spoonacular
                  </a>
                </p>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
