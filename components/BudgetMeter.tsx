import { budgetState, type BudgetState } from "@/lib/domain/budget";
import { formatDollars } from "@/lib/domain/money-input";

export const BUDGET_LOOK: Record<BudgetState, { label: string; pill: string; bar: string }> = {
  green: { label: "On budget", pill: "bg-green-tint text-green", bar: "bg-green" },
  amber: { label: "A little over", pill: "bg-[#FFF1CC] text-[#7A4B00]", bar: "bg-[#C98A00]" },
  red: { label: "Over budget", pill: "bg-[#FDE8E6] text-[#A6261B]", bar: "bg-[#C8372D]" },
};

/** The week's spend against the target. The state is always written out, never colour alone. */
export function BudgetMeter({
  totalCents,
  targetCents,
  cushionCents,
}: {
  totalCents: number;
  targetCents: number;
  cushionCents: number;
}) {
  const state = budgetState(totalCents, targetCents, cushionCents);
  const look = BUDGET_LOOK[state];
  const pct = targetCents > 0 ? Math.min(100, Math.round((totalCents / targetCents) * 100)) : totalCents > 0 ? 100 : 0;
  const left =
    totalCents <= targetCents
      ? `${formatDollars(targetCents - totalCents)} left`
      : `${formatDollars(totalCents - targetCents)} over`;

  return (
    <section aria-label="Budget" className="mx-5 rounded-2xl border border-line bg-white p-4">
      <div className="flex items-baseline justify-between">
        <p className="font-heading text-[28px] font-semibold">
          {formatDollars(totalCents)}{" "}
          <span className="font-sans text-[15px] font-medium text-muted">of {formatDollars(targetCents)}</span>
        </p>
        <p className={`rounded-xl px-2.5 py-1 text-[13px] font-semibold ${look.pill}`}>{look.label}</p>
      </div>
      <div
        role="meter"
        aria-label="Weekly budget"
        aria-valuemin={0}
        aria-valuemax={Math.max(targetCents, totalCents, 1)}
        aria-valuenow={totalCents}
        aria-valuetext={`${formatDollars(totalCents)} of ${formatDollars(targetCents)}, ${look.label}`}
        className="mt-2.5 h-2.5 overflow-hidden rounded-[5px] bg-[#EDF0EC]"
      >
        <div className={`h-2.5 rounded-[5px] ${look.bar}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2.5 text-[13px] text-muted">{left}</p>
    </section>
  );
}
