import Link from "next/link";
import { Plus } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
import type { Day } from "@/lib/domain/weeks";
import { dayShort } from "@/lib/week/format";

/** A day with no dinner: a dashed link to add one. `wide` is tonight's row, a little taller. */
export function OpenDay({ day, slot, tonight, wide }: { day: Day; slot: string; tonight?: boolean; wide?: boolean }) {
  return (
    <Link
      href={`/week/add?day=${day}&slot=${slot}`}
      className={`flex w-full flex-1 items-center gap-2 rounded-md border-[1.5px] border-dashed border-line-strong px-2.5 text-ink no-underline bk-press ${
        wide ? "min-h-13" : "min-h-12"
      }`}
    >
      <span className={`mr-auto text-label bk-caps ${tonight ? "text-accent" : "text-ink-soft"}`}>
        {tonight ? `Tonight · ${dayShort(day)}` : dayShort(day)}
      </span>
      <Icon icon={Plus} size={18} />
      <span className="text-small font-semibold">Add dinner</span>
    </Link>
  );
}
