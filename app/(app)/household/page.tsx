import { createServerClient } from "@/lib/db/server";
import { getMyHousehold, listPeople } from "@/lib/db/queries/household";
import { HouseholdScreen } from "./HouseholdScreen";

export default async function HouseholdPage() {
  const sb = await createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  const household = await getMyHousehold(sb);
  if (!user || !household) return null; // the layout has already redirected

  const [people, members] = await Promise.all([
    listPeople(sb, household.id),
    sb.from("members").select("user_id, role"),
  ]);
  const roster = members.data ?? [];
  const isOwner = roster.some((m) => m.user_id === user.id && m.role === "owner");

  return (
    <HouseholdScreen
      household={household}
      initialPeople={people}
      memberCount={Math.max(roster.length, 1)}
      isOwner={isOwner}
    />
  );
}
