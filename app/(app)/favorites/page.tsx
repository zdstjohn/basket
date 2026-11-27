import { redirect } from "next/navigation";
import { FavoritesScreen } from "@/components/FavoritesScreen";
import { getMyHouseholdOnce } from "@/lib/db/queries/household-server";

export default async function Page() {
  const household = await getMyHouseholdOnce();
  if (!household) redirect("/onboarding");
  return <FavoritesScreen household={household} />;
}
