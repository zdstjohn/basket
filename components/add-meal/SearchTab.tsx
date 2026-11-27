"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Info, Search } from "lucide-react";
import { Sheet, useSheetClose } from "@/components/Sheet";
import { Banner } from "@/components/ui/Banner";
import { TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Photo } from "@/components/ui/Photo";
import { RadioRows } from "@/components/ui/RadioRows";
import { EmptyState, ErrorBanner, Loading, SkeletonLines, SkeletonTile } from "@/components/ui/states";
import { cardFlagText, cardLines, FlagLines, flagsOf } from "@/components/flags/FlagLines";
import type { Flag } from "@/lib/domain/flags";
import type { Person } from "@/lib/domain/types";
import type { RecipeOption, RecipeSource } from "@/lib/recipes/search/provider";
import { isMostLoved, ratingLine } from "@/lib/recipes/search/loved";
import { sharesLine, sortByOverlap } from "@/lib/recipes/search/overlap";
import { ghostButton, quietLink } from "@/lib/ui";
import { formatMinutes } from "@/lib/week/format";
import { ApiFailure, messageFor, searchRecipes, type SearchResult } from "./api";
import { loadSort, saveSort, SortControl, type SortMode } from "./SortControl";
import { DishCard, FindMyDishButton, lookUpDish, type DishState } from "./FindMyDish";

const SOURCES: { id: RecipeSource; label: string; detail: string }[] = [
  { id: "sites", label: "Big sites", detail: "Recipe sites we trust" },
  { id: "spoonacular", label: "Spoonacular", detail: "A recipe database" },
];

function metaParts(o: RecipeOption, first: boolean) {
  const rating = ratingLine(o);
  const minutes = o.totalMinutes !== null ? formatMinutes(o.totalMinutes) : null;
  return { loved: first && !!rating && isMostLoved(o), line: [rating, minutes].filter(Boolean).join(" · ") };
}

function MetaLine({ loved, line, shares }: { loved: boolean; line: string; shares: string | null }) {
  return (
    <>
      {loved && (
        <span data-testid="result-loved" className="mt-0.5 block text-label font-semibold text-ink">
          Most loved
        </span>
      )}
      {line && (
        <span data-testid="result-meta" className="mt-0.5 block break-words text-label text-ink-soft">
          {line}
        </span>
      )}
      {shares && (
        <span data-testid="result-shares" className="mt-0.5 block break-words text-label text-ink">
          {shares}
        </span>
      )}
    </>
  );
}

/** The two sources as rows; choosing one closes the sheet. */
function SourceChoice({ source, onChoose }: { source: RecipeSource; onChoose: (s: RecipeSource) => void }) {
  const close = useSheetClose();
  return (
    <div className="bk-gutter pb-4">
      <RadioRows
        label="Where to look"
        name="recipe-source"
        options={SOURCES.map((s) => ({ value: s.id, label: s.label, detail: s.detail }))}
        value={source}
        onChange={(next) => {
          onChoose(next);
          close();
        }}
      />
    </div>
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
  people,
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
  /** The household; null until loaded, and then no card shows a flag. */
  people: Person[] | null;
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
  const [error, setError] = useState<{ message: string; guard: boolean } | null>(null);
  const [choosing, setChoosing] = useState(false);
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
      // The spend guard's answers are notices, not faults: no retry beside them.
      setError({ message: messageFor(e), guard: e instanceof ApiFailure && (e.kind === "cap" || e.kind === "slow" || e.kind === "busy") });
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
  const flagsByOption = useMemo(
    () => new Map<RecipeOption, Flag[]>(found.map((o) => [o, people ? flagsOf(o, people) : []])),
    [found, people],
  );
  const showsSpoonacular = options.some((o) => o.source === "spoonacular");

  const sourceLabel = SOURCES.find((x) => x.id === source)?.label ?? "Big sites";
  const searched = result?.source === "spoonacular" ? "Spoonacular" : "our sites";

  return (
    <div>
      <form
        className="bk-gutter mt-3 flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(query, source);
        }}
      >
        <TextField
          id="meal"
          label="What’s for dinner?"
          icon={Search}
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          enterKeyHint="search"
          autoComplete="off"
        />
        <div className="grid grid-cols-2 gap-2">
          <button type="submit" disabled={loading || !query.trim()} className={ghostButton}>
            Search
          </button>
          <FindMyDishButton busy={loading} onFile={(f) => void findDish(f)} />
        </div>
        <div>
          <button type="button" aria-haspopup="dialog" onClick={() => setChoosing(true)} className={quietLink}>
            Looking on: {sourceLabel}
            <Icon icon={ChevronRight} size={18} />
          </button>
        </div>
      </form>

      {choosing && (
        <Sheet label="Where to look" title="Where to look" onClose={() => setChoosing(false)}>
          <SourceChoice
            source={source}
            onChoose={(next) => {
              if (source === next) return;
              onSource(next);
              if (query.trim() && (result || error)) void run(query, next);
            }}
          />
        </Sheet>
      )}

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
        <div className="bk-gutter mt-3" aria-live="polite">
          {loading && dish?.phase !== "looking" && (
            <ul aria-label="Searching" className="grid grid-cols-2 items-start gap-2">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <li key={i} className="rounded-md bg-surface">
                  <SkeletonTile crop="tile" />
                  <div className="px-2.5 py-2">
                    <SkeletonLines lines={2} size="small" />
                  </div>
                </li>
              ))}
              <li className="sr-only">
                <Loading label="Searching for recipes" />
              </li>
            </ul>
          )}
          {!loading && error &&
            (error.guard ? (
              <Banner role="alert" icon={Info}>
                {error.message}
              </Banner>
            ) : (
              <ErrorBanner message={error.message} actionLabel="Search again" onAction={() => void run(query, source)} />
            ))}
          {!loading && !result && !error && !dish && !query.trim() && (
            <EmptyState sentence="Search for a dinner, paste a recipe, or pick a favorite." />
          )}
          {!loading && result && (
            <>
              {result.fellBack && <p className="mb-2 text-small text-ink-soft">Nothing on the big sites, so here’s Spoonacular.</p>}
              {result.toppedUp && (
                <p className="mb-2 text-small text-ink-soft">Only a few on the big sites, so here are some from Spoonacular too.</p>
              )}
              {options.length === 0 ? (
                <p className="text-body text-ink">No recipes found on {searched}. Try other words, or paste a recipe.</p>
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
                    <p data-testid="fits-empty" className="mt-2 text-small text-ink-soft">
                      {week.otherMeals === 0 ? "Add another dinner first to see what fits." : "Nothing on this week’s list to match yet."}
                    </p>
                  )}
                  <ul className="mt-3 grid grid-cols-2 items-start gap-2">
                    {shown.map(({ option: o, shared }) => {
                      // The badge stays with the most-loved pick, wherever the sort puts it.
                      const m = metaParts(o, o === found[0]);
                      const flags = flagsByOption.get(o) ?? [];
                      const lines = cardLines({
                        shares: !!sharesLine(shared),
                        made: false,
                        allergy: flags.some((f) => f.kind === "allergy"),
                        dislike: flags.some((f) => f.kind === "dislike"),
                      });
                      const shares = lines.includes("shares") ? sharesLine(shared) : null;
                      return (
                        <li key={o.url}>
                          <button
                            type="button"
                            data-testid="result-card"
                            aria-label={`${o.title} · ${o.site}${m.loved ? ", Most loved" : ""}${m.line ? `, ${m.line}` : ""}${shares ? `, ${shares}` : ""}${people ? cardFlagText(o, people) : ""}`}
                            disabled={picking}
                            onClick={() => onPick(o)}
                            className="block w-full rounded-md bg-surface text-left text-ink bk-press"
                          >
                            <Photo
                              src={o.image}
                              name={o.title}
                              crop="tile"
                              hint={false}
                              className="rounded-t-md"
                              imgRef={(img) => {
                                if (img) img.dataset.optionUrl = o.url;
                              }}
                            />
                            <span className="block px-2.5 py-2">
                              <span data-testid="result-title" className="line-clamp-2 break-words text-small font-semibold">
                                {o.title}
                              </span>
                              <span data-testid="result-site" className="mt-0.5 block break-words text-label text-ink-soft">
                                {o.site}
                              </span>
                              <MetaLine loved={m.loved} line={m.line} shares={shares} />
                              {people && <FlagLines flags={flags} people={people} />}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
              {showsSpoonacular && (
                <p className="mt-3">
                  <a href="https://spoonacular.com" target="_blank" rel="noopener noreferrer" className={quietLink}>
                    Recipes from Spoonacular
                    <Icon icon={ChevronRight} size={18} />
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
