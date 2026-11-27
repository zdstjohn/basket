"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DraftPreview } from "@/components/add-meal/DraftPreview";
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
import type { Meal, Person } from "@/lib/domain/types";
import { weekStartFor, type Day } from "@/lib/domain/weeks";
import { clearDraft, loadDraft, saveDraft } from "@/lib/drafts";
import { parseSavedAddMeal, type AddMealTab, type SavedAddMeal } from "@/lib/add-meal-saved";
import { resizeForUpload, uploadMealPhoto } from "@/lib/photos/upload";
import { weekFoods } from "@/lib/recipes/search/overlap";
import type { RecipeOption, RecipeSource } from "@/lib/recipes/search/provider";
import { bigGreenLink, focusRing, stickyBottom } from "@/lib/ui";
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
  const [people, setPeople] = useState<Person[]>([]);
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
  const savedMealId = useRef<string | null>(null);

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
      setSaveFavorite(saved.saveFavorite);
    }
    setWeekStart(start);
    setRestored(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    void listPeople(sb, household.id).then(setPeople, () => setError("We couldn't load your household. Try again."));
  }, [sb, household.id, household.week_start, household.time_zone, day, slot]);

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
      others && people.length > 0
        ? { foods: weekFoods(others.entries, people, others.alwaysHave), otherMeals: others.entries.length }
        : null,
    [others, people],
  );

  useEffect(() => {
    if (!key || !restored) return;
    if (!query && !paste && !draft) clearDraft(key);
    else saveDraft(key, { tab, query, paste, draft, saveFavorite } satisfies SavedAddMeal);
  }, [key, restored, tab, query, paste, draft, saveFavorite]);

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
    setDraft(null);
    setCustom(null);
    setError(null);
    savedMealId.current = null;
  }

  async function pick(option: RecipeOption) {
    setPicking(true);
    setError(null);
    try {
      setDraft(await draftFromOption(option));
      setCustom(null);
      savedMealId.current = null;
    } catch (e) {
      setError(messageFor(e));
    } finally {
      setPicking(false);
    }
  }

  async function putOnDay(mealId: string) {
    const week = await getOrCreateWeek(sb, household.id, weekStart as string);
    await setWeekMeal(sb, week.id, day, slot, mealId);
    if (key) clearDraft(key);
    router.push("/week");
  }

  async function addDraft() {
    if (!draft || !weekStart || adding) return;
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
      setError("We couldn't add that. Try again.");
      setAdding(false);
    }
  }

  async function addFavorite(meal: MealRow) {
    if (!weekStart) return;
    try {
      await putOnDay(meal.id);
    } catch {
      setError("We couldn't add that. Try again.");
    }
  }

  async function pickPhoto(file: File) {
    try {
      const blob = await resizeForUpload(file);
      setCustom({ blob, url: URL.createObjectURL(blob) });
    } catch {
      setError("We couldn't use that photo. Try another one.");
    }
  }

  const showPreview = draft && tab !== "favorites";

  return (
    <section className="flex flex-1 flex-col">
      <header className="flex items-center gap-2 px-5 pb-2.5 pt-4">
        <Link href="/week" aria-label="Close" className={`-ml-2.5 flex size-11 items-center justify-center rounded-full text-ink ${focusRing}`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </Link>
        <h1 className="text-2xl font-bold">{label} dinner</h1>
      </header>

      <div role="tablist" aria-label="How to add" className="mx-5 grid grid-cols-3 gap-1 rounded-[14px] bg-[#EAEEE9] p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => changeTab(t.id)}
            className={`h-11 rounded-[10px] text-sm ${focusRing} ${
              tab === t.id ? "bg-white font-semibold text-ink shadow-sm" : "font-medium text-[#4A544F]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "search" && (
        <SearchTab
          query={query}
          onQuery={setQuery}
          source={source}
          onSource={changeSource}
          hideResults={!!draft}
          week={week}
          onNeedWeek={wantWeek}
          picking={picking}
          onPick={(o) => void pick(o)}
          onSearchStart={startOver}
          onDishPhoto={foundWithPhoto}
        />
      )}
      {tab === "paste" && (
        <PasteTab value={paste} onChange={setPaste} onDraft={setDraft} onStart={startOver} />
      )}
      {tab === "favorites" && (
        <div className="mt-3.5">
          <FavoritesBrowser
            household={household}
            showChips={false}
            addLabel={(m) => `Add ${m.name} to ${label}`}
            onAdd={addFavorite}
          />
        </div>
      )}

      {picking && (
        <p role="status" className="mx-5 mt-3.5 text-[15px] text-muted">
          Reading the recipe…
        </p>
      )}
      {showPreview && (
        <>
          <DraftPreview draft={draft} people={people} photoSrc={mine?.url ?? null} onPhoto={(f) => void pickPhoto(f)} dishPhoto={tab === "search" && dishPhoto ? { checked: useDishPhoto, onChange: setUseDishPhoto } : null} onDismiss={startOver} onIngredients={(ingredients) => setDraft({ ...draft, ingredients })} />
          <label className="mx-5 mt-3 flex min-h-11 items-center gap-2.5 text-[15px] font-medium">
            <input
              type="checkbox"
              checked={saveFavorite}
              onChange={(e) => setSaveFavorite(e.target.checked)}
              className="size-5 accent-green"
            />
            Save as a favorite
          </label>
        </>
      )}
      {error && (
        <p role="alert" className="mx-5 mt-3 text-[15px] font-medium text-[#A6261B]">
          {error}
        </p>
      )}

      <div className="mt-auto" />
      {showPreview && (
        <div className={stickyBottom}>
          <button type="button" disabled={adding || !weekStart} onClick={() => void addDraft()} className={bigGreenLink}>
            Add to {label}
          </button>
        </div>
      )}
    </section>
  );
}
