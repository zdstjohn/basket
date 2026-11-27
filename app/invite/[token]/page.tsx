import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/db/server";
import { pillButton } from "@/lib/ui";

const MESSAGES: Record<string, string> = {
  invite_used: "This invite was already used",
  invite_expired: "This invite has expired. Ask for a new one.",
  invite_not_found: "We couldn't find that invite.",
  already_in_household: "You're already in a household.",
};

function messageFor(error: string): string {
  const key = Object.keys(MESSAGES).find((k) => error.includes(k));
  return key ? MESSAGES[key] : "We couldn't open that invite. Try again in a moment.";
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
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10 pb-[calc(var(--bk-safe-bottom)+40px)]">
      <h1 className="text-[30px] font-bold tracking-tight text-ink">Invite</h1>
      <p role="alert" className="mt-4 rounded-2xl border border-line bg-white p-5 text-[16px] text-ink">
        {messageFor(error.message)}
      </p>
      <Link href="/week" className={`mt-4 self-start ${pillButton}`}>
        Go to your week
      </Link>
    </main>
  );
}
