import { redirect } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { createServerClient } from "@/lib/db/server";
import { getMyHousehold } from "@/lib/db/queries/household";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sb = await createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");
  if (!(await getMyHousehold(sb))) redirect("/onboarding");

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
      <main className="flex-1">{children}</main>
      <BottomNav />
    </div>
  );
}
