import { redirect } from "next/navigation";
import { ReviewScreen } from "@/components/ReviewScreen";
import { createServerClient } from "@/lib/db/server";
import { getMyHouseholdOnce } from "@/lib/db/queries/household-server";
import { linkStatus } from "@/lib/kroger/link";
import { isCartConfigured } from "@/lib/kroger/oauth";

export default async function Page({ searchParams }: { searchParams: Promise<{ fm?: string | string[] }> }) {
  const { fm } = await searchParams;
  const household = await getMyHouseholdOnce();
  if (!household) redirect("/onboarding");
  if (!household.kroger_location_id) redirect("/list");
  const sb = await createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const cartEnabled = isCartConfigured();
  let link: { connected: boolean; profileId: string | null } = { connected: false, profileId: null };
  try {
    link = await linkStatus(sb, user.id);
  } catch {
    // Not knowing is shown as not connected: the family can connect again, and nothing is sent either way.
  }
  const notice = typeof fm === "string" && ["connected", "denied", "failed"].includes(fm) ? (fm as "connected" | "denied" | "failed") : null;

  return (
    <ReviewScreen
      household={household}
      userId={user.id}
      profileId={link.profileId}
      connected={link.connected}
      cartEnabled={cartEnabled}
      notice={notice}
    />
  );
}
