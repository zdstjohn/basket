import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import type { Household, PersonRow } from "@/lib/db/rows";
import type { Diet, Person } from "@/lib/domain/types";

type Sb = SupabaseClient<Database>;

export type HouseholdPatch = Partial<
  Pick<
    Household,
    "name" | "budget_cents" | "cushion_cents" | "week_start" | "slots" | "time_zone" | "recipe_source" | "kroger_location_id" | "kroger_location_name"
  >
>;

export type PersonInput = Omit<Person, "id"> & { id?: string };

// people.age is nullable in the database; a Person always has a number.
function toPerson(row: PersonRow): Person {
  return {
    id: row.id,
    name: row.name,
    age: row.age ?? 0,
    diet: row.diet as Diet,
    appetite: Number(row.appetite),
    dislikes: row.dislikes,
  };
}

/** The household the signed-in user belongs to (row-level security does the filtering). */
export async function getMyHousehold(sb: Sb): Promise<Household | null> {
  const { data, error } = await sb.from("households").select("*").limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

export async function listPeople(sb: Sb, householdId: string): Promise<Person[]> {
  const { data, error } = await sb
    .from("people")
    .select("*")
    .eq("household_id", householdId)
    .order("sort")
    .order("created_at");
  if (error) throw new Error(error.message);
  return (data ?? []).map(toPerson);
}

/** Updates the person when `p.id` is set, otherwise adds them at position `sort`. */
export async function upsertPerson(
  sb: Sb,
  householdId: string,
  p: PersonInput,
  sort?: number,
): Promise<Person> {
  const { id, ...fields } = p;
  const query = id
    ? sb.from("people").update(fields).eq("id", id)
    : sb
        .from("people")
        .insert({
          household_id: householdId,
          ...fields,
          ...(sort === undefined ? {} : { sort }),
        });
  const { data, error } = await query.select().single();
  if (error) throw new Error(error.message);
  return toPerson(data);
}

export async function deletePerson(sb: Sb, id: string): Promise<void> {
  const { error } = await sb.from("people").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateHousehold(
  sb: Sb,
  id: string,
  patch: HouseholdPatch,
): Promise<void> {
  const { error } = await sb.from("households").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
}

/** Owner only. Makes a one-time invite and returns the full link to share. */
export async function createInviteLink(
  sb: Sb,
  origin: string = window.location.origin,
): Promise<string> {
  const { data, error } = await sb.rpc("create_invite");
  if (error) throw new Error(error.message);
  return `${origin}/invite/${data}`;
}

export async function countPeople(sb: Sb, householdId: string): Promise<number> {
  const { count, error } = await sb
    .from("people")
    .select("id", { count: "exact", head: true })
    .eq("household_id", householdId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
