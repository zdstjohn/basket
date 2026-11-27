import Link from "next/link";
import { MealThumb } from "@/components/MealThumb";
import { focusRing } from "@/lib/ui";
import { dayShort } from "@/lib/week/format";
import type { Day } from "@/lib/domain/weeks";

export interface FilledDay {
  name: string;
  note: string;
  photo: string | null;
  favorite: boolean;
}

/** The word that marks a busy night; colour never carries it alone. */
const BusyWord = () => <span aria-hidden="true" className="block text-[11px] font-semibold text-[#4A544F]">Busy</span>;

/** One day on the week: a dashed "Add dinner" link, or the meal with its photo and note. */
export function DayRow({
  day,
  slot,
  filled,
  onOpen,
  busy = false,
}: {
  day: Day;
  slot: string;
  filled: FilledDay | null;
  onOpen: () => void;
  busy?: boolean;
}) {
  if (!filled) {
    return (
      <div data-testid={`day-row-${day}`}>
        <Link
          href={`/week/add?day=${day}&slot=${slot}`}
          className={`flex min-h-[52px] items-center gap-3 rounded-[14px] border-[1.5px] border-dashed border-[#C9D1C9] px-3.5 text-muted no-underline ${focusRing}`}
        >
          <span className="w-[34px] text-[13px] font-semibold text-ink">
            {dayShort(day)}
            {busy && <BusyWord />}
          </span>
          <span className="text-[15px] font-medium">
            {busy ? "+ Add a quick dinner" : "+ Add dinner"}
            {busy && <span className="sr-only">, busy night</span>}
          </span>
        </Link>
      </div>
    );
  }
  return (
    <div data-testid={`day-row-${day}`}>
      <button
        type="button"
        onClick={onOpen}
        className={`flex min-h-14 w-full items-center gap-3 rounded-[14px] border border-line bg-white px-3.5 py-2 text-left ${focusRing}`}
      >
        <span className="w-[34px] shrink-0 text-[13px] font-semibold">
          {dayShort(day)}
          {busy && <BusyWord />}
        </span>
        <MealThumb src={filled.photo} className="size-12 rounded-[10px]" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold">{filled.name}</span>
          <span className="mt-0.5 block text-xs text-muted">{filled.note}</span>
          {busy && <span className="sr-only">, busy night</span>}
        </span>
        {filled.favorite && (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#E8A13A" stroke="#E8A13A" strokeWidth="1.5" role="img" aria-label="Favorite">
            <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z" />
          </svg>
        )}
      </button>
    </div>
  );
}
