import type { Database } from "./types";

type Row<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];

export type Household = Row<"households">;
export type Week = Row<"weeks">;
export type WeekMeal = Row<"week_meals">;
export type MealRow = Row<"meals">;
export type PersonRow = Row<"people">;
export type CartSendRow = Row<"cart_sends">;
export type KrogerMatchRow = Row<"kroger_matches">;
