import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/db/server";
import { ButtonLink } from "@/components/ui/Button";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ErrorBanner } from "@/components/ui/states";

const MESSAGES: Record<string, string> = {
  invite_used: "This invite was already used.",
  invite_expired: "This invite has expired. Ask for a new one.",
  invite_not_found: "We couldn’t find that invite.",
  already_in_household: "You’re already in a household.",
};

function messageFor(error: string): string {
  const key = Object.keys(MESSAGES).find((k) => error.includes(k));
  return key ? MESSAGES[key] : "We couldn’t open that invite. Try again in a moment.";
}

export const metadata: Metadata = { title: "Invite" };

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const sb = await createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);

  const { error } = await sb.rpc("accept_invite", { p_token: token });
  if (!error) redirect("/week");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col bg-ground pb-[calc(var(--bk-safe-bottom)+32px)]">
      <ScreenHeader title="Invite" />
      <div className="bk-gutter mt-4 flex flex-col items-start gap-3">
        <div className="w-full">
          <ErrorBanner message={messageFor(error.message)} />
        </div>
        <ButtonLink variant="ghost" href="/week">
          Go to Basket
        </ButtonLink>
      </div>
    </main>
  );
}
