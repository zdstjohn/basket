import { redirect } from "next/navigation";
import { ListScreen } from "@/components/ListScreen";
import { createServerClient } from "@/lib/db/server";
import { getMyHousehold } from "@/lib/db/queries/household";

export default async function Page() {
  const household = await getMyHousehold(await createServerClient());
  if (!household) redirect("/onboarding");
  return <ListScreen household={household} />;
}
