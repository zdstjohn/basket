"use client";

import { MealThumb } from "@/components/MealThumb";
import type { RecipeDraft } from "@/lib/ai/schemas";
import { householdServings } from "@/lib/domain/portions";
import { scaleMeal } from "@/lib/domain/scaling";
import type { Meal, Person } from "@/lib/domain/types";
import { formatQuantityRoundedUp } from "@/lib/domain/units";
import { useState } from "react";
import { IngredientEditor } from "@/components/add-meal/IngredientEditor";
import type { IngredientLine } from "@/lib/domain/types";
import { focusRing, pillButton } from "@/lib/ui";
import { hasMeatOrFish, joinNames, swapPeople } from "@/lib/week/note";

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

export function draftAsMeal(draft: RecipeDraft): Meal {
  return {
    id: "draft",
    name: draft.name,
    baseServings: draft.baseServings,
    ingredients: draft.ingredients,
    vegSwap: draft.vegSwap,
    everyoneVegetarian: false,
    isFavorite: false,
  };
}

/** What the recipe becomes for this household: photo, scaled ingredients and the vegetarian swap. */
export function DraftPreview({
  draft,
  people,
  photoSrc,
  onPhoto,
  dishPhoto,
  onDismiss,
  onIngredients,
}: {
  draft: RecipeDraft;
  people: Person[];
  /** A photo the user picked, shown instead of the recipe page's. */
  photoSrc: string | null;
  onPhoto: (file: File) => void;
  /** Set when the meal was found from the user's own photo: the "use my photo" tick. */
  dishPhoto?: { checked: boolean; onChange: (checked: boolean) => void } | null;
  onDismiss: () => void;
  onIngredients: (lines: IngredientLine[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  const meal = draftAsMeal(draft);
  const servings = householdServings(people);
  const lines = scaleMeal(meal, people);
  const skipping = swapPeople(meal, people);
  const protein = meal.ingredients.find((i) => i.role === "meat" || i.role === "fish");
  const swapNames = joinNames(skipping);
  const swapLabel = skipping.length === 1 ? `${swapNames}'s portion` : swapNames;
  const shownPhoto = photoSrc ?? draft.photo?.url ?? null;

  return (
    <>
      <section aria-label="Draft recipe" className="mx-5 mt-3.5 rounded-2xl border border-line bg-white px-4 py-3.5">
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-[17px] font-bold leading-snug">{draft.name}</h2>
          <button type="button" onClick={onDismiss} className={`${pillButton} h-11 shrink-0 px-3 text-[13px]`}>
            Not this one
          </button>
        </div>

        <MealThumb key={shownPhoto} src={shownPhoto} className="mt-2.5 h-40 w-full rounded-xl" tileText="text-sm" />
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <p className="text-xs text-muted">{photoSrc ? "Your photo" : draft.photo ? `Photo: ${draft.photo.credit}` : ""}</p>
          <label className={`${pillButton} h-11 cursor-pointer text-[13px] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-green`}>
            Change photo
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label="Change photo"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPhoto(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
        {dishPhoto && (
          <label className="flex min-h-11 items-center gap-2.5 text-[15px] font-medium">
            <input
              type="checkbox"
              checked={dishPhoto.checked}
              onChange={(e) => dishPhoto.onChange(e.target.checked)}
              className="size-5 accent-green"
            />
            Use my photo for this meal
          </label>
        )}
        {draft.sourceUrl && (
          <a
            href={draft.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex min-h-11 items-center text-sm font-semibold text-green ${focusRing}`}
          >
            Open the full recipe
          </a>
        )}

        {editing ? (
          <IngredientEditor
            lines={draft.ingredients}
            servings={draft.baseServings}
            onDone={(lines) => {
              onIngredients(lines);
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <>
            <div className="mt-2 flex items-baseline justify-between">
              <h3 className="text-[15px] font-semibold">Ingredients</h3>
              <span className="text-xs text-muted">Scaled to {servings} servings</span>
            </div>
            <ul className="mt-2 flex flex-col">
              {lines.map((l, i) => {
                // scaleMeal adds the swap as the last line whenever someone is skipping the meat.
                const isSwap = !!draft.vegSwap && skipping.length > 0 && i === lines.length - 1;
                return (
                  <li key={`${l.canonical}-${i}`} className="flex justify-between gap-3 border-t border-[#F0F2EF] py-[7px] text-sm">
                    <span>
                      {cap(l.canonical)}
                      {isSwap ? ` (${swapNames})` : ""}
                    </span>
                    <span className="whitespace-nowrap text-[#4A544F]">{formatQuantityRoundedUp(l.qty)}</span>
                  </li>
                );
              })}
            </ul>
            <button type="button" onClick={() => setEditing(true)} className={`mt-1 inline-flex min-h-11 items-center text-sm font-semibold text-green ${focusRing}`}>
              Edit ingredients
            </button>
          </>
        )}
      </section>

      {hasMeatOrFish(meal) && skipping.length > 0 && (
        <section aria-label="Vegetarian swap" className="mx-5 mt-3 flex items-center gap-3 rounded-[14px] bg-green-tint px-3.5 py-3">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1F7A4D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z" />
            <path d="M5 19l7-7" />
          </svg>
          <div className="flex-1">
            {draft.vegSwap ? (
              <>
                <p className="text-sm font-semibold text-[#134D31]">
                  {swapLabel}: {draft.vegSwap.canonical}
                </p>
                <p className="mt-0.5 text-xs text-[#2C5A42]">
                  {cap(protein?.canonical ?? "Meat")} cut to {people.length - skipping.length} people
                </p>
              </>
            ) : (
              <p className="text-sm font-semibold text-[#134D31]">{swapNames}: no swap yet</p>
            )}
          </div>
        </section>
      )}
    </>
  );
}
