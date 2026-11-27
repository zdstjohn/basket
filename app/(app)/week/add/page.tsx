import { redirect } from "next/navigation";
import { AddMealScreen } from "@/components/add-meal/AddMealScreen";
import { getMyHouseholdOnce } from "@/lib/db/queries/household-server";
import type { Day } from "@/lib/domain/weeks";
import { isDay } from "@/lib/week/format";

export default async function Page(props: PageProps<"/week/add">) {
  const { day, slot } = await props.searchParams;
  const household = await getMyHouseholdOnce();
  if (!household) redirect("/onboarding");
  const slotName = typeof slot === "string" ? slot : "";
  if (typeof day !== "string" || !isDay(day) || !household.slots.includes(slotName)) redirect("/week");
  return <AddMealScreen household={household} day={day as Day} slot={slotName} />;
}
