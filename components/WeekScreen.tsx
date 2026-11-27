"use client";

import Link from "next/link";
import { useState } from "react";
import { BudgetMeter } from "@/components/BudgetMeter";
import { DayRow } from "@/components/DayRow";
import { MealSheet } from "@/components/MealSheet";
import { Sheet } from "@/components/Sheet";
import { useWeekData } from "@/components/useWeekData";
import { VerdictCard } from "@/components/verdicts/VerdictCard";
import { useDinnerToAsk, useOffline, type Ask } from "@/components/verdicts/useDinnerToAsk";
import { useWeekList } from "@/lib/useWeekList";
import { copyWeek } from "@/lib/db/queries/weeks";
import { toMeal } from "@/lib/db/queries/meals";
import type { Household } from "@/lib/db/rows";
import { allergyCopy, findFlags, ingredientNames } from "@/lib/domain/flags";
import { householdServings } from "@/lib/domain/portions";
import { daysOfWeek, type Day } from "@/lib/domain/weeks";
import { bigGreenLink, focusRing, pillButton, stickyAboveNav } from "@/lib/ui";
import { formatWeekRange } from "@/lib/week/format";
import { dayNote } from "@/lib/week/note";

const weekdayOf = (ymd: string): string =>
  new Intl.DateTimeFormat("en-US", { weekday: "long", timeZone: "UTC" }).format(new Date(`${ymd}T00:00:00Z`));

export function WeekScreen({ household }: { household: Household }) {
  const { sb, data, error, live, changes, reload } = useWeekData(household);
  // The dinner card loads on its own and fails quietly: it is never part of the week's load.
  const { ask, reload: reloadAsk } = useDinnerToAsk(household, sb, changes);
  // The card the family just answered stays up while "Saved." shows, though the dinner no longer needs asking.
  const [held, setHeld] = useState<Ask | null>(null);
  const offline = useOffline();
  const card = held ?? ask;
  const list = useWeekList(household, data?.week.id ?? null);
  const [openDay, setOpenDay] = useState<Day | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState(false);

  const slot = household.slots[0] ?? "dinner";
  const days = daysOfWeek(household.week_start as Day);
  const servings = data ? householdServings(data.people) : null;
  const forDay = (d: Day) => data?.weekMeals.find((m) => m.day === d && m.slot === slot) ?? null;
  const open = openDay && data ? forDay(openDay) : null;
  const openMeal = open && data ? (data.meals.get(open.meal_id) ?? null) : null;

  async function repeat() {
    if (!data?.lastWeek) return;
    setCopying(true);
    setCopyError(false);
    try {
      await copyWeek(sb, data.lastWeek.id, data.week.id);
      setConfirming(false);
      await reload();
    } catch {
      setCopyError(true);
    } finally {
      setCopying(false);
    }
  }

  return (
    <section data-live={live ? "on" : undefined} className="flex flex-1 flex-col">
      <header className="flex items-end justify-between px-5 pb-3 pt-5">
        <div>
          <p data-testid="week-range" className="min-h-[19px] text-[13px] font-medium text-muted">
            {data ? formatWeekRange(data.week.week_start) : ""}
          </p>
          <h1 className="mt-0.5 text-[30px] font-bold tracking-tight">This week</h1>
        </div>
        <button
          type="button"
          aria-label="Repeat a past week"
          disabled={!data?.lastWeek || data.lastWeek.count === 0}
          onClick={() => setConfirming(true)}
          className={`${pillButton} gap-1.5 text-sm`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 3-6.7" />
            <path d="M3 4v5h5" />
          </svg>
          Repeat
        </button>
      </header>

      <BudgetMeter totalCents={list.totals.totalCents} targetCents={household.budget_cents} cushionCents={household.cushion_cents} />

      {data && card && data.people.length > 0 && (
        <VerdictCard
          key={`${card.dinner.mealId}|${card.dinner.date}`}
          ask={card}
          dayName={weekdayOf(card.dinner.date)}
          people={data.people}
          offline={offline}
          sb={sb}
          householdId={household.id}
          onHold={setHeld}
          onDone={reloadAsk}
        />
      )}

      <section aria-label="Dinners" className="mx-5 mt-3.5 flex flex-col gap-1.5">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">
            Dinners{servings !== null ? ` · ${servings} servings each` : ""}
          </h2>
          <Link href="/household" className={`inline-flex min-h-11 items-center text-[13px] font-semibold text-green no-underline ${focusRing}`}>
            Who&apos;s eating
          </Link>
        </div>

        {error && !data ? (
          <div role="alert" className="rounded-[14px] border border-line bg-white p-4 text-[15px]">
            <p>We couldn&apos;t load this week.</p>
            <button type="button" onClick={() => void reload()} className={`${pillButton} mt-2`}>
              Try again
            </button>
          </div>
        ) : !data ? (
          days.map((d) => <div key={d} aria-hidden="true" className="h-[52px] animate-pulse rounded-[14px] bg-[#EDF0EC]" />)
        ) : (
          days.map((d) => {
            const wm = forDay(d);
            const meal = wm ? data.meals.get(wm.meal_id) : null;
            const domainMeal = meal ? toMeal(meal) : null;
            const allergy = domainMeal && data.people.length > 0
              ? allergyCopy(findFlags(ingredientNames(domainMeal), data.people).filter((f) => f.kind === "allergy"), data.people)
              : null;
            return (
              <DayRow
                key={d}
                day={d}
                slot={slot}
                onOpen={() => setOpenDay(d)}
                filled={
                  wm && meal && domainMeal
                    ? {
                        name: meal.name,
                        allergy: allergy?.head ?? null,
                        note: dayNote(domainMeal, data.people, wm.servings_override === null ? null : Number(wm.servings_override)),
                        photo: data.photos[meal.id] ?? null,
                        favorite: meal.is_favorite,
                      }
                    : null
                }
              />
            );
          })
        )}
      </section>

      <div className="mt-auto" />
      <div className={stickyAboveNav}>
        <Link href="/list" className={bigGreenLink}>
          Build shopping list
        </Link>
      </div>

      {data && openDay && open && openMeal && (
        <MealSheet
          sb={sb}
          householdId={household.id}
          meal={openMeal}
          weekMeal={open}
          day={openDay}
          photo={data.photos[openMeal.id] ?? null}
          people={data.people}
          onClose={() => setOpenDay(null)}
          onChanged={reload}
        />
      )}

      {confirming && (
        <Sheet label="Repeat last week" onClose={() => setConfirming(false)}>
          <div className="flex flex-col gap-3 p-5 pb-6">
            <p className="text-base font-semibold">Copy last week&apos;s dinners into this week? This replaces what&apos;s planned.</p>
            {copyError && (
              <p role="alert" className="text-sm font-medium text-[#A6261B]">
                We couldn&apos;t copy last week. Try again.
              </p>
            )}
            <button type="button" disabled={copying} onClick={() => void repeat()} className={`inline-flex h-12 items-center justify-center rounded-full bg-green text-[15px] font-semibold text-white disabled:opacity-60 ${focusRing}`}>
              Copy dinners
            </button>
            <button type="button" onClick={() => setConfirming(false)} className={`${pillButton} h-12`}>
              Cancel
            </button>
          </div>
        </Sheet>
      )}
    </section>
  );
}
