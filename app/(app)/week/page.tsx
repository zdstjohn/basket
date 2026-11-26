import { redirect } from "next/navigation";
import { WeekScreen } from "@/components/WeekScreen";
import { createServerClient } from "@/lib/db/server";
import { getMyHousehold } from "@/lib/db/queries/household";

export default async function Page() {
  const household = await getMyHousehold(await createServerClient());
  if (!household) redirect("/onboarding");
  return <WeekScreen household={household} />;
}
