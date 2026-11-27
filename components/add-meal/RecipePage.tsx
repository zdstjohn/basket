"use client";

import { useState, type RefObject } from "react";
import { ChevronRight, Leaf, TriangleAlert } from "lucide-react";
import { AllergyBox } from "@/components/flags/AllergyBox";
import { DislikeBox } from "@/components/flags/DislikeBox";
import { IngredientEditor } from "@/components/add-meal/IngredientEditor";
import { Button } from "@/components/ui/Button";
import { Check } from "@/components/ui/Check";
import { Icon } from "@/components/ui/Icon";
import { Photo } from "@/components/ui/Photo";
import { Qty } from "@/components/ui/Qty";
import { SkeletonLines } from "@/components/ui/states";
import type { RecipeDraft } from "@/lib/ai/schemas";
import { familiesFor, matchFood } from "@/lib/domain/families";
import { findFlags, flagAmount, ingredientNames, type Flag } from "@/lib/domain/flags";
import { householdServings } from "@/lib/domain/portions";
import { scaleMeal } from "@/lib/domain/scaling";
import type { IngredientLine, Meal, Person, PersonChange, Quantity } from "@/lib/domain/types";
import type { RecipeOption } from "@/lib/recipes/search/provider";
import { servingsText } from "@/lib/text/typography";
import { ghostButton, quietLink } from "@/lib/ui";
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
    personChanges: draft.personChanges ?? [],
  };
}

/** Flags for a draft: its own lines plus the picked option's own lines, in case the parse step renamed or dropped one. */
export function draftFlags(draft: RecipeDraft, people: Person[], optionNames: string[] = []): Flag[] {
  return findFlags([...ingredientNames(draftAsMeal(draft)), ...optionNames], people);
}

/** "tree nut" for a line an allergy flag names, from the family it belongs to (or the typed word); null when none does. */
export function allergyLabel(canonical: string, allergies: Flag[]): string | null {
  for (const f of allergies) {
    if (!matchFood(f.food, canonical, { wide: true })) continue;
    const { families, viaAlias } = familiesFor(f.food, { wide: true });
    return families.length === 1 && !viaAlias ? families[0].label : f.food;
  }
  return null;
}

/** Counts round up to whole numbers (you buy whole onions); other units read as usual. */
function roundedUp(q: Quantity): Quantity {
  return q.kind === "count" ? { ...q, amount: Math.max(1, Math.ceil(q.amount - 1e-9)) } : q;
}

/**
 * What the recipe becomes for this household: photo, scaled ingredients and the vegetarian swap.
 * With only `pending` (the tapped result) it shows that photo and title while the recipe is read.
 */
export function RecipePage({
  draft,
  pending,
  people,
  photoSrc,
  onPhoto,
  dishPhoto,
  onDismiss,
  onIngredients,
  onChanges,
  optionNames,
  startEditing = false,
  saveFavorite,
  onSaveFavorite,
  heroRef,
}: {
  /** Null while the recipe is still being read. */
  draft: RecipeDraft | null;
  /** The result that was tapped; its photo and title show until the draft arrives. */
  pending: RecipeOption | null;
  people: Person[];
  /** A photo the user picked, shown instead of the recipe page's. */
  photoSrc: string | null;
  onPhoto: (file: File) => void;
  /** Set when the meal was found from the user's own photo: the "use my photo" tick. */
  dishPhoto?: { checked: boolean; onChange: (checked: boolean) => void } | null;
  onDismiss: () => void;
  onIngredients: (lines: IngredientLine[]) => void;
  /** Who leaves out or swaps what; kept in the draft and saved with the meal. */
  onChanges: (changes: PersonChange[]) => void;
  /** The picked recipe's own ingredient lines (kept in memory only), checked beside the draft's. */
  optionNames?: string[];
  /** Opens the ingredient editor at once. */
  startEditing?: boolean;
  saveFavorite: boolean;
  onSaveFavorite: (v: boolean) => void;
  /** The photo's box: the end point the photo grows into from its card. */
  heroRef: RefObject<HTMLDivElement | null>;
}) {
  const [editing, setEditing] = useState(startEditing);
  // A photo too small to lead the page (or none) is a tile inside the gutter; tracked per link so a new photo gets a new try.
  const [smallSrc, setSmallSrc] = useState<string | null>(null);

  const name = draft?.name ?? pending?.title ?? "";
  const shownPhoto = draft ? (photoSrc ?? draft.photo?.url ?? pending?.image ?? null) : (photoSrc ?? pending?.image ?? null);
  const asTile = !shownPhoto || smallSrc === shownPhoto;
  const credit = photoSrc ? "Your photo" : draft?.photo ? `Photo: ${draft.photo.credit}` : "";

  const meal = draft ? draftAsMeal(draft) : null;
  const servings = householdServings(people);
  const lines = meal ? scaleMeal(meal, people) : [];
  const skipping = meal ? swapPeople(meal, people) : [];
  const protein = meal?.ingredients.find((i) => i.role === "meat" || i.role === "fish");
  const swapNames = joinNames(skipping);
  const swapLabel = skipping.length === 1 ? `${swapNames}’s portion` : swapNames;
  const flags = draft ? draftFlags(draft, people, optionNames) : [];
  const allergies = flags.filter((f) => f.kind === "allergy");

  return (
    <section aria-label="Draft recipe" className={pending ? undefined : "bk-fade-in"}>
      <div ref={heroRef} className={asTile ? "mx-4 mt-3 overflow-hidden rounded-lg" : undefined}>
        <Photo
          src={shownPhoto}
          name={name}
          crop={asTile ? "tile" : "hero"}
          priority
          className={asTile ? "rounded-lg" : undefined}
          onDemote={() => setSmallSrc(shownPhoto)}
          onFallback={() => setSmallSrc(shownPhoto)}
        />
      </div>

      <div className="bk-gutter mt-3 flex items-start justify-between gap-3">
        <h2 className="min-w-0 break-words font-display text-title">{name}</h2>
        <Button variant="ghost" onClick={onDismiss} className="shrink-0">
          Not this one
        </Button>
      </div>

      {!draft || !meal ? (
        <div className="bk-gutter mt-4">
          <SkeletonLines lines={5} size="body" />
          <p role="status" className="mt-3 text-small text-ink-soft">
            Reading the recipe…
          </p>
        </div>
      ) : (
        <>
          <div className="bk-gutter mt-2 flex items-center justify-between gap-3">
            <p className="min-w-0 break-words text-label text-ink-soft">{credit}</p>
            <label className={`${ghostButton} shrink-0 cursor-pointer focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent`}>
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
            <div className="bk-gutter mt-2">
              <Check checked={dishPhoto.checked} onChange={dishPhoto.onChange} label="Use my photo for this meal">
                <span className="text-body text-ink">Use my photo for this meal</span>
              </Check>
            </div>
          )}
          {draft.sourceUrl && (
            <div className="bk-gutter">
              <a href={draft.sourceUrl} target="_blank" rel="noopener noreferrer" className={quietLink}>
                Open the full recipe
                <Icon icon={ChevronRight} size={18} />
              </a>
            </div>
          )}

          {hasMeatOrFish(meal) && skipping.length > 0 && (
            <section aria-label="Vegetarian swap" className="bk-gutter mt-3">
              <div className="flex items-start gap-3 border-y border-line py-3">
                <Icon icon={Leaf} size={18} className="mt-1" />
                <div className="min-w-0 flex-1">
                  {draft.vegSwap ? (
                    <>
                      <p className="text-body font-semibold">
                        {swapLabel}: {draft.vegSwap.canonical}
                      </p>
                      <p className="text-small text-ink-soft">
                        {cap(protein?.canonical ?? "Meat")} cut to {people.length - skipping.length} people
                      </p>
                    </>
                  ) : (
                    <p className="text-body font-semibold">{swapNames}: no swap yet</p>
                  )}
                </div>
              </div>
            </section>
          )}

          <AllergyBox flags={flags} people={people} />
          {flags
            .filter((f) => f.kind === "dislike")
            .map((f) => (
              <DislikeBox
                key={f.food}
                flag={f}
                people={people}
                amount={flagAmount(meal, f)}
                changes={draft.personChanges ?? []}
                onChange={onChanges}
                mealName={draft.name}
                meal={meal}
              />
            ))}

          <div className="bk-gutter mt-4">
            {editing ? (
              <IngredientEditor
                lines={draft.ingredients}
                servings={draft.baseServings}
                onDone={(next) => {
                  onIngredients(next);
                  setEditing(false);
                }}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-heading">Ingredients</h3>
                  {servings > 0 && <span className="text-small text-ink-soft">Scaled to {servingsText(servings)}</span>}
                </div>
                <ul className="mt-2 flex flex-col divide-y divide-line">
                  {lines.map((l, i) => {
                    // scaleMeal adds the swap as the last line whenever someone is skipping the meat.
                    const isSwap = !!draft.vegSwap && skipping.length > 0 && i === lines.length - 1;
                    const allergen = allergyLabel(l.canonical, allergies);
                    return (
                      <li key={`${l.canonical}-${i}`} className="flex justify-between gap-3 py-2 text-body">
                        <span className={`flex min-w-0 items-start gap-2 ${allergen ? "font-semibold text-error" : ""}`}>
                          {allergen && <Icon icon={TriangleAlert} size={18} className="mt-1" />}
                          <span className="min-w-0 break-words">
                            {cap(l.canonical)}
                            {isSwap ? ` (${swapNames})` : ""}
                            {allergen ? ` · ${allergen}` : ""}
                          </span>
                        </span>
                        <span className="bk-price shrink-0 whitespace-nowrap text-right">
                          <Qty q={roundedUp(l.qty)} />
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <button type="button" onClick={() => setEditing(true)} className={`${quietLink} mt-1`}>
                  Edit ingredients
                </button>
              </>
            )}
          </div>

          <div className="bk-gutter mt-2">
            <Check checked={saveFavorite} onChange={onSaveFavorite} label="Save as a favorite">
              <span className="text-body text-ink">Save as a favorite</span>
            </Check>
          </div>
        </>
      )}
    </section>
  );
}
