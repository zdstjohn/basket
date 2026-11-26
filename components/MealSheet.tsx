"use client";

import { useState } from "react";
import { MealThumb } from "@/components/MealThumb";
import { Sheet } from "@/components/Sheet";
import type { SupabaseClient } from "@supabase/supabase-js";
import { setMealPhoto, toMeal, updateMeal } from "@/lib/db/queries/meals";
import { setWeekMeal } from "@/lib/db/queries/weeks";
import type { MealRow, WeekMeal } from "@/lib/db/rows";
import type { Database } from "@/lib/db/types";
import { householdServings } from "@/lib/domain/portions";
import type { Person } from "@/lib/domain/types";
import type { Day } from "@/lib/domain/weeks";
import { resizeForUpload, uploadMealPhoto } from "@/lib/photos/upload";
import { focusRing, pillButton } from "@/lib/ui";
import { dayName } from "@/lib/week/format";
import { dayNote } from "@/lib/week/note";

/** A planned dinner opened from the week: photo, link to the recipe, leftovers, favorite, take it off. */
export function MealSheet({
  sb,
  householdId,
  meal,
  weekMeal,
  day,
  photo,
  people,
  onClose,
  onChanged,
}: {
  sb: SupabaseClient<Database>;
  householdId: string;
  meal: MealRow;
  weekMeal: WeekMeal;
  day: Day;
  photo: string | null;
  people: Person[];
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = householdServings(people);
  const override = weekMeal.servings_override === null ? null : Number(weekMeal.servings_override);
  const extra = override === null ? 0 : Math.max(0, Math.round((override - base) * 10) / 10);
  const credit = !meal.photo_path && meal.photo_url ? meal.photo_credit : null;

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch {
      setError(failure);
    } finally {
      setBusy(false);
    }
  }

  const changePhoto = (file: File | undefined) =>
    file &&
    run(async () => {
      const blob = await resizeForUpload(file);
      const path = await uploadMealPhoto(sb, householdId, meal.id, blob);
      await setMealPhoto(sb, meal.id, { path });
    }, "We couldn't save that photo. Try again.");

  const setLeftovers = (n: number) =>
    run(
      () => setWeekMeal(sb, weekMeal.week_id, day, weekMeal.slot, meal.id, n > 0 ? base + n : null),
      "We couldn't change that. Try again.",
    );

  return (
    <Sheet label={meal.name} onClose={onClose}>
      <div className="flex flex-col gap-3 p-5 pb-6">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-[22px] font-bold leading-tight">{meal.name}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={`-mr-2 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-full ${focusRing}`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <MealThumb src={photo} className="h-40 w-full rounded-2xl" tileText="text-sm" />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted">{credit ? `Photo: ${credit}` : ""}</p>
          <label className={`${pillButton} cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-green`}>
            Change photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="sr-only"
              aria-label="Change photo"
              disabled={busy}
              onChange={(e) => {
                void changePhoto(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
          </label>
        </div>

        <p className="text-sm text-muted">{dayNote(toMeal(meal), people, override)}</p>
        {meal.source_url && (
          <a
            href={meal.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex min-h-11 items-center text-sm font-semibold text-green ${focusRing}`}
          >
            Open the full recipe
          </a>
        )}

        <div className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
          <p className="text-sm font-medium">Leftovers: +{extra} servings</p>
          <div className="flex gap-2">
            <button type="button" aria-label="Fewer leftovers" disabled={busy || extra <= 0} onClick={() => void setLeftovers(extra - 1)} className={`${pillButton} w-11 px-0 text-lg`}>
              −
            </button>
            <button type="button" aria-label="More leftovers" disabled={busy} onClick={() => void setLeftovers(extra + 1)} className={`${pillButton} w-11 px-0 text-lg`}>
              +
            </button>
          </div>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(async () => void (await updateMeal(sb, meal.id, { is_favorite: !meal.is_favorite })), "We couldn't change that. Try again.")
          }
          className={`${pillButton} w-full`}
        >
          {meal.is_favorite ? "Remove from favorites" : "Save as a favorite"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await setWeekMeal(sb, weekMeal.week_id, day, weekMeal.slot, null);
              onClose();
            }, "We couldn't take that off. Try again.")
          }
          className={`${pillButton} w-full text-[#A6261B]`}
        >
          Take off {dayName(day)}
        </button>
        {error && (
          <p role="alert" className="text-sm font-medium text-[#A6261B]">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
