import { redirect } from "next/navigation";
import { WeekScreen } from "@/components/WeekScreen";
import { getMyHouseholdOnce } from "@/lib/db/queries/household-server";

export default async function Page() {
  const household = await getMyHouseholdOnce();
  if (!household) redirect("/onboarding");
  return <WeekScreen household={household} />;
}
