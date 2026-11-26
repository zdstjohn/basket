import { LoginForm } from "./LoginForm";
import { safeNext } from "@/lib/auth/safe-next";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-5 py-10">
      <h1 className="text-[30px] font-bold tracking-tight text-ink">Basket</h1>
      <p className="mt-1 text-[15px] text-muted">
        Family meals, planned and ordered.
      </p>
      <LoginForm next={safeNext(next)} linkFailed={error === "link"} />
    </main>
  );
}
