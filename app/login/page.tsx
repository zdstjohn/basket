import { LoginForm } from "./LoginForm";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { safeNext } from "@/lib/auth/safe-next";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col bg-ground pb-[calc(var(--bk-safe-bottom)+32px)]">
      <ScreenHeader
        title="Basket"
        below={<p className="text-body text-ink-soft">Plan the week’s dinners and the shopping, together.</p>}
      />
      <LoginForm next={safeNext(next)} linkFailed={error === "link"} />
    </main>
  );
}
