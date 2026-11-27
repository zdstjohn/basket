"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getMeals, mealPhotoSrcs } from "@/lib/db/queries/meals";
import { listDinnerDates, listVerdicts } from "@/lib/db/queries/verdicts";
import type { Household, MealRow } from "@/lib/db/rows";
import type { Database } from "@/lib/db/types";
import { dinnerToAsk, type Dinner } from "@/lib/domain/verdicts";
import { todayIn } from "@/lib/domain/weeks";
import { addDays } from "@/lib/week/format";

type Sb = SupabaseClient<Database>;

/** How far back the card looks: three days of asking, and a little room. */
const LOOK_BACK_DAYS = 14;

export interface Ask {
  dinner: Dinner;
  meal: MealRow;
  photo: string | null;
}

/**
 * The dinner to ask about, with its own meal and photo. The dinner is often last week's, and the week
 * screen holds only this week's meals, so the meal is read by id. Any failure, or a meal that no longer
 * exists, gives null: no card, no error, and the week itself is untouched.
 */
export async function loadAsk(sb: Sb, household: Household, today: string): Promise<Ask | null> {
  try {
    const since = addDays(today, -LOOK_BACK_DAYS);
    const [verdicts, dinners] = await Promise.all([
      listVerdicts(sb, household.id, { since }),
      listDinnerDates(sb, household.id, { since, slot: household.slots?.[0] ?? "dinner" }),
    ]);
    const dinner = dinnerToAsk(dinners, verdicts, today);
    if (!dinner) return null;
    const [meal] = await getMeals(sb, [dinner.mealId]);
    if (!meal) return null;
    const photos = await mealPhotoSrcs(sb, [meal]);
    return { dinner, meal, photo: photos[meal.id] ?? null };
  } catch {
    return null;
  }
}

/**
 * The card's dinner. It loads on mount and whenever `changes` (counted by the week's one realtime
 * subscription) moves, and opens no subscription of its own. A newer load replaces an older one still out.
 */
export function useDinnerToAsk(household: Household, sb: Sb, changes: number): { ask: Ask | null; reload: () => void } {
  const [ask, setAsk] = useState<Ask | null>(null);
  const latest = useRef(0);
  const { time_zone: timeZone } = household;

  const reload = useCallback(() => {
    const run = ++latest.current;
    void loadAsk(sb, household, todayIn(timeZone)).then((next) => {
      if (run === latest.current) setAsk(next);
    });
    // `household` is read for its id and slots, which do not change while the screen is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sb, household.id, household.slots, timeZone]);

  useEffect(() => {
    reload();
    const counter = latest;
    return () => {
      counter.current++;
    };
    // `changes` is the trigger: the week's subscription moved.
  }, [reload, changes]);

  return { ask, reload };
}

const subscribeOnline = (notify: () => void): (() => void) => {
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
  return () => {
    window.removeEventListener("online", notify);
    window.removeEventListener("offline", notify);
  };
};

/** True while the phone says it has no connection. */
export function useOffline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine === false,
    () => false,
  );
}
