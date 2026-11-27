import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/db/server";
import { countPeople, getMyHousehold } from "@/lib/db/queries/household";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
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
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-1 flex-col bg-ground">
      <ScreenHeader
        title="Set up"
        below={
          <p className="text-body text-ink-soft">
            Tell us who’s eating and what you like to spend. You can change it any time.
          </p>
        }
      />
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
