import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/db/server";
import { countPeople, getMyHousehold } from "@/lib/db/queries/household";
import { OnboardingForm } from "./OnboardingForm";

export default async function OnboardingPage() {
  const sb = await createServerClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");
  const household = await getMyHousehold(sb);
  if (household && (await countPeople(sb, household.id)) > 0) redirect("/week");

  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-8">
      <h1 className="text-[30px] font-bold tracking-tight text-ink">Set up your kitchen</h1>
      <p className="mt-1 text-[15px] text-muted">
        Tell us who&apos;s eating and what you like to spend. You can change it any time.
      </p>
      <OnboardingForm
        existing={
          household
            ? {
                id: household.id,
                name: household.name,
                budgetCents: household.budget_cents,
                cushionCents: household.cushion_cents,
              }
            : null
        }
      />
    </main>
  );
}
