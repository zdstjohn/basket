"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createBrowserClient } from "@/lib/db/client";
import { listPeople } from "@/lib/db/queries/household";
import { getMeals, mealPhotoSrcs } from "@/lib/db/queries/meals";
import { findWeek, getOrCreateWeek, listWeekMeals } from "@/lib/db/queries/weeks";
import type { Household, MealRow, Week, WeekMeal } from "@/lib/db/rows";
import type { Person } from "@/lib/domain/types";
import { weekStartFor, type Day } from "@/lib/domain/weeks";
import { singleFlight } from "@/lib/list/single-flight";
import { subscribeHousehold } from "@/lib/realtime";
import { previousWeekStart } from "@/lib/week/format";

export interface WeekData {
  week: Week;
  weekMeals: WeekMeal[];
  meals: Map<string, MealRow>;
  photos: Record<string, string | null>;
  people: Person[];
  /** Dinners planned last week (the Repeat button needs at least one). */
  lastWeek: { id: string; count: number } | null;
}

/** The current week for a household, kept fresh by realtime changes from either phone. */
export function useWeekData(household: Household) {
  const sb = useMemo(() => createBrowserClient(), []);
  const [data, setData] = useState<WeekData | null>(null);
  const [error, setError] = useState(false);
  const [live, setLive] = useState(false);
  const latest = useRef(0);
  const invalidate = useCallback(() => {
    latest.current++;
  }, []);

  const loadOnce = useCallback(async () => {
    const run = ++latest.current;
    try {
      const weekStart = weekStartFor(new Date(), household.week_start as Day, household.time_zone);
      const [people, week, prev] = await Promise.all([
        listPeople(sb, household.id),
        getOrCreateWeek(sb, household.id, weekStart),
        findWeek(sb, household.id, previousWeekStart(weekStart)),
      ]);
      const [weekMeals, prevMeals] = await Promise.all([
        listWeekMeals(sb, week.id),
        prev ? listWeekMeals(sb, prev.id) : Promise.resolve([]),
      ]);
      const meals = await getMeals(sb, [...new Set(weekMeals.map((m) => m.meal_id))]);
      const photos = await mealPhotoSrcs(sb, meals);
      if (run !== latest.current) return;
      setData({
        week,
        weekMeals,
        meals: new Map(meals.map((m) => [m.id, m])),
        photos,
        people,
        lastWeek: prev ? { id: prev.id, count: prevMeals.length } : null,
      });
      setError(false);
    } catch {
      if (run === latest.current) setError(true);
    }
  }, [sb, household.id, household.week_start, household.time_zone]);
  // One load at a time: a call while one is out joins it, and it repeats once at the end.
  const [flight] = useState(() => singleFlight());
  const load = useCallback(() => flight.run(loadOnce), [flight, loadOnce]);

  useEffect(() => {
    // Loading starts from an effect on purpose: the week depends on the phone's clock.
    void load();
    const stop = subscribeHousehold(household.id, ["week_meals", "meals", "people"], () => void load(), setLive);
    return () => {
      invalidate();
      stop();
    };
  }, [household.id, load, invalidate]);

  return { sb, data, error, live, reload: load };
}
