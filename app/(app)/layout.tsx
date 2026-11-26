import { redirect } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { createServerClient } from "@/lib/db/server";
import { countPeople, getMyHousehold } from "@/lib/db/queries/household";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sb = await createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const household = await getMyHousehold(sb);
  // A household with nobody in it is unfinished: send them back to finish setup.
  if (!household || (await countPeople(sb, household.id)) === 0) {
    redirect("/onboarding");
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
      <main className="flex flex-1 flex-col">{children}</main>
      <BottomNav />
    </div>
  );
}
