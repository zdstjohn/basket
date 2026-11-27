import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ListScreen } from "@/components/ListScreen";
import { getMyHouseholdOnce } from "@/lib/db/queries/household-server";

export const metadata: Metadata = { title: "Shopping list" };

export default async function Page() {
  const household = await getMyHouseholdOnce();
  if (!household) redirect("/onboarding");
  return <ListScreen household={household} />;
}
