import type { Metadata } from "next";
import { createServerClient } from "@/lib/db/server";
import { listPeople } from "@/lib/db/queries/household";
import { getMyHouseholdOnce } from "@/lib/db/queries/household-server";
import { linkStatus } from "@/lib/kroger/link";
import { isCartConfigured } from "@/lib/kroger/oauth";
import { isKrogerConfigured } from "@/lib/kroger/token";
import { HouseholdScreen } from "./HouseholdScreen";

export const metadata: Metadata = { title: "Household" };

export default async function HouseholdPage({
  searchParams,
}: {
  searchParams: Promise<{ fm?: string | string[] }>;
}) {
  const { fm } = await searchParams;
  const sb = await createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  const household = await getMyHouseholdOnce();
  if (!user || !household) return null; // the layout has already redirected

  const [people, members] = await Promise.all([
    listPeople(sb, household.id),
    sb.from("members").select("user_id, role"),
  ]);
  const roster = members.data ?? [];
  const isOwner = roster.some((m) => m.user_id === user.id && m.role === "owner");

  const cartEnabled = isCartConfigured();
  const connected = (await linkStatus(sb, user.id)).connected;
  const notice = typeof fm === "string" && ["connected", "denied", "failed"].includes(fm) ? (fm as "connected" | "denied" | "failed") : null;

  return (
    <HouseholdScreen
      household={household}
      initialPeople={people}
      memberCount={Math.max(roster.length, 1)}
      isOwner={isOwner}
      krogerEnabled={isKrogerConfigured()}
      cartEnabled={cartEnabled}
      fredMeyerConnected={connected}
      fredMeyerNotice={notice}
    />
  );
}
