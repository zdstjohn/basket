"use client";

import { useMemo, useState } from "react";
import { FavoritesBrowser } from "@/components/FavoritesBrowser";
import { Toast } from "@/components/ui/Toast";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
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
        setMessage({ text: "This week’s dinners are all planned.", bad: true });
        return;
      }
      await setWeekMeal(sb, week.id, day, slot, meal.id);
      markSettle(day);
      setMessage({ text: `Added ${meal.name} to ${dayName(day)}.`, bad: false });
    } catch {
      setMessage({ text: "We couldn’t add that. Try again.", bad: true });
    }
  }

  return (
    <section className="pb-6">
      <ScreenHeader title="Favorites" />
      {message && <Toast message={message.text} tone={message.bad ? "bad" : "ok"} onDone={() => setMessage(null)} />}
      <FavoritesBrowser
        household={household}
        showChips
        addLabel={(m) => `Add ${m.name} to this week`}
        onAdd={addToWeek}
        emptyAction={{ label: "Find a dinner", href: "/week" }}
      />
    </section>
  );
}
