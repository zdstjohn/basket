import { focusRing } from "@/lib/ui";
import { busyLine } from "@/lib/domain/busy";
import type { Day } from "@/lib/domain/weeks";

/** Under the last day row: which nights are busy, and the button that changes them. */
export function BusyLine({ days, weekDays, onOpen }: { days: Day[]; weekDays: Day[]; onOpen: () => void }) {
  const any = weekDays.some((d) => days.includes(d));
  return (
    <div data-testid="busy-line" className="mt-1 flex min-h-11 items-center gap-2 px-1">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#4A544F" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      <p className="min-w-0 flex-1 text-[13px] text-[#4A544F]">{busyLine(days, weekDays)}</p>
      <button
        type="button"
        onClick={onOpen}
        className={`inline-flex min-h-11 shrink-0 items-center px-2 text-[13px] font-semibold text-green ${focusRing}`}
      >
        {any ? "Change" : "Mark busy nights"}
      </button>
    </div>
  );
}
