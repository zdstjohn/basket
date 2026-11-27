"use client";

import { useEffect, useState } from "react";
import { Bookmark, ChevronRight, X } from "lucide-react";
import { AllergyBox } from "@/components/flags/AllergyBox";
import { DislikeBox } from "@/components/flags/DislikeBox";
import { Sheet, useSheetClose } from "@/components/Sheet";
import { Button, IconButton } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Photo } from "@/components/ui/Photo";
import { Qty } from "@/components/ui/Qty";
import { Stepper } from "@/components/ui/Stepper";
import { ErrorBanner } from "@/components/ui/states";
import { VerdictSheet } from "@/components/verdicts/VerdictSheet";
import type { SupabaseClient } from "@supabase/supabase-js";
import { setMealPhoto, setPersonChanges, toMeal, updateMeal } from "@/lib/db/queries/meals";
import { listVerdicts, saveVerdict } from "@/lib/db/queries/verdicts";
import { setWeekMeal } from "@/lib/db/queries/weeks";
import type { MealRow, WeekMeal } from "@/lib/db/rows";
import type { Database } from "@/lib/db/types";
import { findFlags, flagAmount, ingredientNames } from "@/lib/domain/flags";
import { householdServings } from "@/lib/domain/portions";
import { scaleMeal } from "@/lib/domain/scaling";
import type { Person, PersonChange } from "@/lib/domain/types";
import { latestAnswer, verdictWords, type Verdict, type Vote } from "@/lib/domain/verdicts";
import type { Day } from "@/lib/domain/weeks";
import { photoVerdict } from "@/lib/photos/verdict";
import { resizeForUpload, uploadMealPhoto } from "@/lib/photos/upload";
import { servingsText } from "@/lib/text/typography";
import { ghostButton, quietLink } from "@/lib/ui";
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
  enter = "slide",
  onGrownClose,
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
  /** "none" when the photo grew into the sheet (a view transition), so the sheet does not also slide. */
  enter?: "slide" | "none";
  /** Set when the photo grew in: Close then shrinks it back into its tile instead of sliding the sheet down. */
  onGrownClose?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ message: string; retry: () => void } | null>(null);
  // A photo too small to be a hero is shown as a tile in the gutter; a width we already know decides it before any request.
  const [demoted, setDemoted] = useState(false);
  // How the family answered the last time they ate this (all dates). A failed read just leaves the line out.
  const [last, setLast] = useState<Verdict | null>(null);
  const [changing, setChanging] = useState(false);
  useEffect(() => {
    let alive = true;
    listVerdicts(sb, householdId, { mealId: meal.id })
      .then((all) => {
        if (alive) setLast(latestAnswer(all, meal.id));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [sb, householdId, meal.id]);
  const lastWords = last ? verdictWords(last) : null;

  async function changeAnswer(votes: Record<string, Vote>) {
    if (!last) return;
    await saveVerdict(sb, householdId, { mealId: meal.id, date: last.eatenOn }, votes);
    setLast({ ...last, status: "answered", votes });
  }
  const base = householdServings(people);
  const override = weekMeal.servings_override === null ? null : Number(weekMeal.servings_override);
  const extra = override === null ? 0 : Math.max(0, Math.round((override - base) * 10) / 10);
  const domainMeal = toMeal(meal);
  const flags = people.length === 0 ? [] : findFlags(ingredientNames(domainMeal), people);
  const asTile = demoted || photoVerdict("hero", meal.photo_width) === "demote";
  const target = override ?? base;
  const scaled = people.length === 0 ? [] : scaleMeal(domainMeal, people, override ?? undefined);
  const credit = !meal.photo_path && meal.photo_url ? meal.photo_credit : null;

  async function run(action: () => Promise<void>, failure: string) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch {
      setError({ message: failure, retry: () => void run(action, failure) });
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
    }, "We couldn’t save that photo. Try again.");

  const setLeftovers = (n: number) =>
    run(
      () => setWeekMeal(sb, weekMeal.week_id, day, weekMeal.slot, meal.id, n > 0 ? base + n : null),
      "We couldn’t change that. Try again.",
    );

  // Leave out or swap saves at once, so a favorite remembers it.
  const saveChanges = (next: PersonChange[]) =>
    run(async () => void (await setPersonChanges(sb, meal.id, next)), "We couldn’t change that. Try again.");

  return (
    <Sheet label={meal.name} enter={enter} onClose={onClose}>
      <div className="relative">
        <div data-sheet-photo className={asTile ? "mx-4 mt-2 overflow-hidden rounded-lg" : "overflow-hidden rounded-t-lg"}>
          <Photo
            src={photo}
            name={meal.name}
            crop={asTile ? "tile" : "hero"}
            preview={meal.photo_preview}
            width={meal.photo_width}
            priority
            onDemote={() => setDemoted(true)}
            className={asTile ? "rounded-lg" : ""}
          />
        </div>
        <CloseButton onGrownClose={onGrownClose} className={asTile ? "right-6 top-4" : "right-2 top-2"} />
      </div>

      <div className="flex flex-col gap-3 px-4 pb-6 pt-3">
        <div>
          <h2 className="break-words font-display text-title text-ink">{meal.name}</h2>
          {credit && <p className="text-label text-ink-soft">Photo: {credit}</p>}
        </div>

        <p className="text-small text-ink">{dayNote(domainMeal, people, override)}</p>
        <AllergyBox flags={flags} people={people} className="" />
        {flags.filter((f) => f.kind === "dislike").map((f) => (
          <DislikeBox
            key={f.food}
            flag={f}
            people={people}
            amount={flagAmount(domainMeal, f)}
            changes={domainMeal.personChanges ?? []}
            onChange={saveChanges}
            mealName={meal.name}
            meal={domainMeal}
            className=""
          />
        ))}
        {last && lastWords && (
          <div className="flex items-center justify-between gap-3">
            <p data-testid="last-time" className="min-w-0 text-small text-ink-soft">
              Last time: {lastWords}
            </p>
            <Button variant="ghost" className="shrink-0" onClick={() => setChanging(true)}>
              Change
            </Button>
          </div>
        )}
        {meal.source_url && (
          <a href={meal.source_url} target="_blank" rel="noopener noreferrer" className={`${quietLink} self-start`}>
            Open the full recipe
            <Icon icon={ChevronRight} size={18} />
          </a>
        )}

        {scaled.length > 0 && (
          <section aria-label="Ingredients" className="flex flex-col gap-1">
            <h3 className="text-heading text-ink">Ingredients</h3>
            <p className="text-small text-ink-soft">Scaled to {servingsText(target)}</p>
            <ul className="divide-y divide-line">
              {scaled.map((line, i) => (
                <li key={`${line.canonical}|${i}`} className="flex min-h-11 items-center justify-between gap-3 py-2">
                  <span className="min-w-0 break-words text-body text-ink">{line.canonical}</span>
                  <span className="bk-price shrink-0 text-body text-ink">
                    <Qty q={line.qty} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="flex items-center justify-between gap-3 border-y border-line py-2">
          <p className="text-small font-semibold">Leftovers: +{servingsText(extra)}</p>
          <Stepper
            value={extra}
            min={0}
            max={12}
            fewerLabel="Fewer leftovers"
            moreLabel="More leftovers"
            onChange={(n) => {
              if (!busy) void setLeftovers(n);
            }}
          />
        </div>

        <label className={`${ghostButton} cursor-pointer has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent`}>
          Change photo
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            aria-label="Change photo"
            disabled={busy}
            onChange={(e) => {
              void changePhoto(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
        <Button
          variant="ghost"
          disabled={busy}
          onClick={() =>
            void run(async () => void (await updateMeal(sb, meal.id, { is_favorite: !meal.is_favorite })), "We couldn’t change that. Try again.")
          }
        >
          <Icon icon={Bookmark} size={18} />
          {meal.is_favorite ? "Remove from favorites" : "Save as a favorite"}
        </Button>
        <Button
          variant="ghost"
          className="text-error!"
          disabled={busy}
          onClick={() =>
            void run(async () => {
              await setWeekMeal(sb, weekMeal.week_id, day, weekMeal.slot, null);
              onClose();
            }, "We couldn’t take that off. Try again.")
          }
        >
          Take off {dayName(day)}
        </Button>
        {error && <ErrorBanner message={error.message} actionLabel="Try again" onAction={error.retry} />}
      </div>
      {changing && last && (
        <VerdictSheet mealName={meal.name} people={people} initial={last.votes} onSave={changeAnswer} onClose={() => setChanging(false)} />
      )}
    </Sheet>
  );
}

/** The Close button over the photo's top-right corner. It lives inside the Sheet so it can use the sheet's own exit. */
function CloseButton({ onGrownClose, className }: { onGrownClose?: () => void; className: string }) {
  const close = useSheetClose();
  return (
    <IconButton
      icon={X}
      label="Close"
      onClick={onGrownClose ?? close}
      className={`absolute bg-[rgb(var(--bk-scrim)/0.6)] text-on-photo ${className}`}
    />
  );
}
