"use client";

import { useMemo, useState } from "react";
import { FavoritesBrowser } from "@/components/FavoritesBrowser";
import { createBrowserClient } from "@/lib/db/client";
import { getOrCreateWeek, listWeekMeals, setWeekMeal } from "@/lib/db/queries/weeks";
import type { Household, MealRow } from "@/lib/db/rows";
import { daysOfWeek, weekStartFor, type Day } from "@/lib/domain/weeks";
import { markSettle } from "@/lib/motion/settle";
import { dayName } from "@/lib/week/format";

export function FavoritesScreen({ household }: { household: Household }) {
  const sb = useMemo(() => createBrowserClient(), []);
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);

  /** "+" puts the meal on the first empty dinner of the current week. */
  async function addToWeek(meal: MealRow) {
    setMessage(null);
    try {
      const slot = household.slots[0] ?? "dinner";
      const start = weekStartFor(new Date(), household.week_start as Day, household.time_zone);
      const week = await getOrCreateWeek(sb, household.id, start);
      const planned = await listWeekMeals(sb, week.id);
      const day = daysOfWeek(household.week_start as Day).find(
        (d) => !planned.some((p) => p.day === d && p.slot === slot),
      );
      if (!day) {
        setMessage({ text: "This week's dinners are all planned.", bad: true });
        return;
      }
      await setWeekMeal(sb, week.id, day, slot, meal.id);
      markSettle(day);
      setMessage({ text: `Added ${meal.name} to ${dayName(day)}.`, bad: false });
    } catch {
      setMessage({ text: "We couldn't add that. Try again.", bad: true });
    }
  }

  return (
    <section className="pb-6">
      <h1 className="px-5 pb-2.5 pt-5 text-[30px] font-bold tracking-tight">Favorites</h1>
      <p
        role="status"
        className={`mx-5 mb-2 min-h-5 text-sm font-medium ${message?.bad ? "text-[#A6261B]" : "text-green"}`}
      >
        {message?.text ?? ""}
      </p>
      <FavoritesBrowser
        household={household}
        showChips
        addLabel={(m) => `Add ${m.name} to this week`}
        onAdd={addToWeek}
      />
    </section>
  );
}
