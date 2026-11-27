"use client";

import { useRouter } from "next/navigation";
import { flushSync } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { RecipePage, draftFlags } from "@/components/add-meal/RecipePage";
import { PasteTab } from "@/components/add-meal/PasteTab";
import { SearchTab } from "@/components/add-meal/SearchTab";
import { draftFromOption, messageFor } from "@/components/add-meal/api";
import { FavoritesBrowser } from "@/components/FavoritesBrowser";
import type { RecipeDraft } from "@/lib/ai/schemas";
import { createBrowserClient } from "@/lib/db/client";
import { updateHousehold, listPeople } from "@/lib/db/queries/household";
import { listAlwaysHave } from "@/lib/db/queries/list";
import { getMeals, saveMeal, setMealPhoto, toMeal } from "@/lib/db/queries/meals";
import { findWeek, getOrCreateWeek, listWeekMeals, setWeekMeal } from "@/lib/db/queries/weeks";
import type { Household, MealRow } from "@/lib/db/rows";
import { ingredientNames } from "@/lib/domain/flags";
import type { Meal, Person } from "@/lib/domain/types";
import { weekStartFor, type Day } from "@/lib/domain/weeks";
import { markSettle } from "@/lib/motion/settle";
import { watchPeople } from "@/lib/people-watch";
import { clearDraft, loadDraft, saveDraft } from "@/lib/drafts";
import { matchedWords, parseSavedAddMeal, type AddMealTab, type SavedAddMeal } from "@/lib/add-meal-saved";
import { morph } from "@/lib/motion/view-transition";
import { resizeForUpload, uploadMealPhoto } from "@/lib/photos/upload";
import { subscribeHousehold } from "@/lib/realtime";
import { weekFoods } from "@/lib/recipes/search/overlap";
import type { RecipeOption, RecipeSource } from "@/lib/recipes/search/provider";
import { Button } from "@/components/ui/Button";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ErrorBanner } from "@/components/ui/states";
import { Tabs } from "@/components/ui/Tabs";
import { barBottom } from "@/lib/ui";
import { dayName } from "@/lib/week/format";

type Tab = AddMealTab;

const TABS: { id: Tab; label: string }[] = [
  { id: "search", label: "Search" },
  { id: "paste", label: "Paste" },
  { id: "favorites", label: "Favorites" },
];

export function AddMealScreen({ household, day, slot }: { household: Household; day: Day; slot: string }) {
  const router = useRouter();
  const sb = useMemo(() => createBrowserClient(), []);
  // Null until the household has loaded: nothing can be added before the allergy check can run.
  const [people, setPeople] = useState<Person[] | null>(null);
  const [peopleFailed, setPeopleFailed] = useState(false);
  const [weekStart, setWeekStart] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("search");
  const [query, setQuery] = useState("");
  const [paste, setPaste] = useState("");
  const [source, setSource] = useState<RecipeSource>(household.recipe_source === "spoonacular" ? "spoonacular" : "sites");
  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [saveFavorite, setSaveFavorite] = useState(true);
  const [custom, setCustom] = useState<{ blob: Blob; url: string } | null>(null);
  const [dishPhoto, setDishPhoto] = useState<{ blob: Blob; url: string } | null>(null);
  const [useDishPhoto, setUseDishPhoto] = useState(true);
  const [picking, setPicking] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);
  const [others, setOthers] = useState<{ entries: { meal: Meal; servings: number | null }[]; alwaysHave: string[] } | null>(null);
  const [needWeek, setNeedWeek] = useState(false);
  const wantWeek = useCallback(() => setNeedWeek(true), []);
  // The picked recipe's own lines, kept in memory beside the draft (never saved) so the check sees both.
  const [optionNames, setOptionNames] = useState<string[]>([]);
  // After a reload only the matched words come back ("almonds"), never the recipe's lines; they join the check.
  const [restoredWords, setRestoredWords] = useState<string[]>([]);
  const checkNames = useMemo(() => [...optionNames, ...restoredWords], [optionNames, restoredWords]);
  // What is kept beside the draft: only the words that matched someone's list. Until people load, keep what came back.
  const matched = useMemo(() => (people ? matchedWords(checkNames, people) : restoredWords), [checkNames, people, restoredWords]);
  const savedMealId = useRef<string | null>(null);
  // The tapped result: its photo and title show at once while the recipe is read, and it is the way back to its card.
  const [pending, setPending] = useState<RecipeOption | null>(null);
  const heroRef = useRef<HTMLDivElement | null>(null);
  // Bumped whenever a read is abandoned, so a late answer cannot bring the page back.
  const readToken = useRef(0);
  /** Where the results were scrolled to when a recipe opened, so closing it puts them back. */
  const resultsScroll = useRef(0);

  const key = weekStart ? `add-meal:${weekStart}:${day}:${slot}` : null;
  const label = dayName(day);

  useEffect(() => {
    // The week comes from the phone's clock, so it is worked out after the page loads.
    const start = weekStartFor(new Date(), household.week_start as Day, household.time_zone);
    const storedKey = `add-meal:${start}:${day}:${slot}`;
    const stored = loadDraft<unknown>(storedKey);
    const saved = parseSavedAddMeal(stored);
    if (stored !== null && !saved) clearDraft(storedKey);
    /* eslint-disable react-hooks/set-state-in-effect */
    if (saved) {
      setTab(saved.tab);
      setQuery(saved.query);
      setPaste(saved.paste);
      setDraft(saved.draft);
      setRestoredWords(saved.draft ? saved.matched : []);
      setSaveFavorite(saved.saveFavorite);
    }
    setWeekStart(start);
    setRestored(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [household.week_start, household.time_zone, day, slot]);

  const peopleWatch = useRef<{ retry: () => void } | null>(null);
  const loadPeople = useCallback(() => peopleWatch.current?.retry(), []);

  useEffect(() => {
    // An allergy added on another phone counts as soon as it arrives, and a refetch that works clears the failure message.
    const watch = watchPeople({
      load: () => listPeople(sb, household.id),
      subscribe: (onChange) => subscribeHousehold(household.id, ["people"], onChange),
      onPeople: setPeople,
      onFailed: setPeopleFailed,
    });
    peopleWatch.current = watch;
    return () => {
      peopleWatch.current = null;
      watch.stop();
    };
  }, [sb, household.id]);

  // The other dinners already planned this week (not the one being added or replaced), read only once
  // "Fits this week" is chosen.
  useEffect(() => {
    if (!weekStart || !needWeek) return;
    let alive = true;
    (async () => {
      const week = await findWeek(sb, household.id, weekStart);
      const rows = week ? (await listWeekMeals(sb, week.id)).filter((r) => !(r.day === day && r.slot === slot)) : [];
      const [meals, alwaysHave] = await Promise.all([
        getMeals(sb, [...new Set(rows.map((r) => r.meal_id))]),
        listAlwaysHave(sb, household.id),
      ]);
      const byId = new Map(meals.map((m) => [m.id, m]));
      const entries = rows.flatMap((r) => {
        const m = byId.get(r.meal_id);
        return m ? [{ meal: toMeal(m), servings: r.servings_override === null ? null : Number(r.servings_override) }] : [];
      });
      if (alive) setOthers({ entries, alwaysHave });
    })().catch(() => {
      // Without the week, "Fits this week" just keeps the most-loved order.
    });
    return () => {
      alive = false;
    };
  }, [sb, household.id, weekStart, day, slot, needWeek]);

  const week = useMemo(
    () =>
      others && people && people.length > 0
        ? { foods: weekFoods(others.entries, people, others.alwaysHave), otherMeals: others.entries.length }
        : null,
    [others, people],
  );

  useEffect(() => {
    if (!key || !restored) return;
    if (!query && !paste && !draft) clearDraft(key);
    else saveDraft(key, { tab, query, paste, draft, saveFavorite, matched } satisfies SavedAddMeal);
  }, [key, restored, tab, query, paste, draft, saveFavorite, matched]);

  useEffect(() => {
    if (!custom) return;
    return () => URL.revokeObjectURL(custom.url);
  }, [custom]);

  useEffect(() => {
    if (!dishPhoto) return;
    return () => URL.revokeObjectURL(dishPhoto.url);
  }, [dishPhoto]);

  // A photo they changed by hand wins; otherwise the one they found the dish with, unless they unticked it.
  const mine = custom ?? (dishPhoto && useDishPhoto ? dishPhoto : null);

  function changeTab(next: Tab) {
    setTab(next);
    if (next !== "search") setDishPhoto(null);
  }

  function foundWithPhoto(blob: Blob | null) {
    setDishPhoto(blob ? { blob, url: URL.createObjectURL(blob) } : null);
    setUseDishPhoto(true);
  }

  function changeSource(next: RecipeSource) {
    setSource(next);
    void updateHousehold(sb, household.id, { recipe_source: next }).catch(() => {});
  }

  function startOver() {
    readToken.current += 1;
    setPending(null);
    setPicking(false);
    setDraft(null);
    setOptionNames([]);
    setRestoredWords([]);
    setCustom(null);
    setError(null);
    savedMealId.current = null;
  }

  async function pick(option: RecipeOption, img: HTMLImageElement | null) {
    if (picking) return;
    const token = ++readToken.current;
    setPicking(true);
    setError(null);
    resultsScroll.current = window.scrollY;
    // The recipe page opens at once; its photo grows from the card's.
    void morph({
      from: img,
      to: () => heroRef.current,
      update: () => {
        if (readToken.current !== token) return;
        flushSync(() => setPending(option));
        window.scrollTo(0, 0);
      },
    }).catch(() => {});
    try {
      const next = await draftFromOption(option);
      if (readToken.current !== token) return;
      setDraft(next);
      setOptionNames(ingredientNames(option));
      setRestoredWords([]);
      setCustom(null);
      savedMealId.current = null;
      setPending((p) => p ?? option);
    } catch (e) {
      if (readToken.current !== token) return;
      setPending(null);
      setError(messageFor(e));
      setPicking(false);
      // A page still on its way in must not open after the failure.
      readToken.current += 1;
    } finally {
      if (readToken.current === token) setPicking(false);
    }
  }

  /** Back to the results; the photo shrinks into its card when the card can be found again. */
  function dismiss() {
    const url = pending?.url;
    const from = heroRef.current;
    if (!url || !from) {
      flushSync(startOver);
      window.scrollTo(0, resultsScroll.current);
      return;
    }
    void morph({
      from,
      to: () => document.querySelector<HTMLElement>(`[data-option-url="${CSS.escape(url)}"]`),
      update: () => {
        flushSync(startOver);
        // The results are back where they were when the recipe was opened.
        window.scrollTo(0, resultsScroll.current);
      },
    }).catch(() => {});
  }

  async function putOnDay(mealId: string) {
    const week = await getOrCreateWeek(sb, household.id, weekStart as string);
    await setWeekMeal(sb, week.id, day, slot, mealId);
    if (key) clearDraft(key);
    markSettle(day);
    router.push("/week");
  }

  async function addDraft() {
    if (!draft || !weekStart || !people || adding) return;
    setAdding(true);
    setError(null);
    try {
      if (!savedMealId.current) {
        const meal = await saveMeal(sb, household.id, { ...draft, isFavorite: saveFavorite });
        savedMealId.current = meal.id;
        if (mine) {
          try {
            const path = await uploadMealPhoto(sb, household.id, meal.id, mine.blob);
            await setMealPhoto(sb, meal.id, { path });
          } catch {
            // The meal is saved; the photo can be changed from the week.
          }
        }
      }
      await putOnDay(savedMealId.current);
    } catch {
      setError("We couldn’t add that. Try again.");
      setAdding(false);
    }
  }

  async function addFavorite(meal: MealRow) {
    if (!weekStart) return;
    try {
      await putOnDay(meal.id);
    } catch {
      setError("We couldn’t add that. Try again.");
    }
  }

  async function pickPhoto(file: File) {
    try {
      const blob = await resizeForUpload(file);
      setCustom({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setError("We couldn’t use that photo. Try another one.");
    }
  }

  const showPage = (!!draft || !!pending) && tab !== "favorites";
  const hasAllergy = useMemo(
    () => !!draft && !!people && draftFlags(draft, people, checkNames).some((f) => f.kind === "allergy"),
    [draft, people, checkNames],
  );
  // Nothing can be added until the recipe and the household (for the allergy check) have both arrived.
  const cantAdd = !draft || !weekStart || people === null;

  return (
    <section className={`flex flex-1 flex-col ${showPage ? "" : "mb-[var(--bk-safe-bottom)]"}`}>
      <ScreenHeader title={`${label} dinner`} back={{ href: "/week", label: "Close", icon: "close" }} />

      {!showPage && (
        <div className="bk-gutter">
          <Tabs label="How to add" items={TABS} active={tab} onChange={changeTab} panelId="add-panel" />
        </div>
      )}

      <div role="tabpanel" id="add-panel" aria-labelledby={`add-panel-tab-${tab}`} hidden={showPage}>
        <div hidden={tab !== "search"}>
          <SearchTab
            query={query}
            onQuery={setQuery}
            source={source}
            onSource={changeSource}
            hideResults={!!draft || !!pending}
            week={week}
            people={people}
            onNeedWeek={wantWeek}
            picking={picking}
            onPick={(o, img) => void pick(o, img)}
            onSearchStart={startOver}
            onDishPhoto={foundWithPhoto}
          />
        </div>
        {tab === "paste" && <PasteTab value={paste} onChange={setPaste} onDraft={setDraft} onStart={startOver} />}
        {tab === "favorites" && (
          <div className="mt-3">
            <FavoritesBrowser
              household={household}
              showChips={false}
              addLabel={(m) => `Add ${m.name} to ${label}`}
              anywayLabel={`Add to ${label} anyway`}
              onAdd={addFavorite}
            />
          </div>
        )}
      </div>

      {showPage && (
        <RecipePage
          draft={draft}
          pending={pending}
          people={people ?? []}
          photoSrc={mine?.url ?? null}
          onPhoto={(f) => void pickPhoto(f)}
          dishPhoto={tab === "search" && dishPhoto ? { checked: useDishPhoto, onChange: setUseDishPhoto } : null}
          onDismiss={dismiss}
          onIngredients={(ingredients) => draft && setDraft({ ...draft, ingredients })}
          onChanges={(personChanges) => draft && setDraft({ ...draft, personChanges })}
          optionNames={checkNames}
          saveFavorite={saveFavorite}
          onSaveFavorite={setSaveFavorite}
          heroRef={heroRef}
        />
      )}
      {peopleFailed && (
        <div className="bk-gutter mt-3">
          <ErrorBanner message="Couldn’t check allergies. Try again." actionLabel="Retry" onAction={loadPeople} />
        </div>
      )}
      {error && (
        <div className="bk-gutter mt-3">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="mt-auto" />
      {showPage && (
        <div className={barBottom}>
          {hasAllergy ? (
            <div className="grid gap-2">
              <Button variant="main" onClick={dismiss}>
                Pick a different dinner
              </Button>
              <Button variant="ghost" disabled={cantAdd} busy={adding} busyLabel="Adding…" onClick={() => void addDraft()}>
                Add to {label} anyway
              </Button>
            </div>
          ) : (
            <Button variant="main" disabled={cantAdd} busy={adding} busyLabel="Adding…" onClick={() => void addDraft()}>
              Add to {label}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
