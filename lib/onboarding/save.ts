import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { updateHousehold } from "@/lib/db/queries/household";
import type { Person } from "@/lib/domain/types";

export interface OnboardingInput {
  name: string;
  people: Omit<Person, "id">[];
  budgetCents: number;
  cushionCents: number;
}

/**
 * Saves the onboarding form and is safe to run again after a partial failure:
 * the household is created only when there is none yet, people are added only
 * if the household has none, and the budget update is idempotent.
 */
export async function saveOnboarding(
  sb: SupabaseClient<Database>,
  input: OnboardingInput,
  existingHouseholdId: string | null,
): Promise<string> {
  let id = existingHouseholdId;
  if (!id) {
    const { data, error } = await sb.rpc("create_household", { p_name: input.name });
    if (error) throw new Error(error.message);
    id = data;
  }

  const { count, error: countError } = await sb
    .from("people")
    .select("id", { count: "exact", head: true })
    .eq("household_id", id);
  if (countError) throw new Error(countError.message);

  if (!count) {
    const { error } = await sb.from("people").insert(
      input.people.map((p, sort) => ({
        household_id: id,
        name: p.name,
        age: p.age,
        diet: p.diet,
        appetite: p.appetite,
        dislikes: p.dislikes,
        allergies: p.allergies ?? [],
        sort,
      })),
    );
    if (error) throw new Error(error.message);
  }

  await updateHousehold(sb, id, {
    budget_cents: input.budgetCents,
    cushion_cents: input.cushionCents,
  });
  return id;
}
