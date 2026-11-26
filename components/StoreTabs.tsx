import type { Store } from "@/lib/domain/list";
import { formatDollars } from "@/lib/domain/money-input";
import { STORES, STORE_NAMES } from "@/lib/list/prices";
import { focusRing } from "@/lib/ui";

/** Fred Meyer, Amazon and Costco: each shows what you'd spend there and how many things to get. */
export function StoreTabs({
  active,
  onChange,
  byStore,
}: {
  active: Store;
  onChange: (s: Store) => void;
  byStore: Record<Store, { cents: number; count: number }>;
}) {
  return (
    <div
      role="tablist"
      aria-label="Stores"
      className="mx-5 grid grid-cols-3 gap-1 rounded-[14px] bg-[#EAEEE9] p-1"
    >
      {STORES.map((s) => {
        const on = s === active;
        return (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => onChange(s)}
            className={`flex h-12 flex-col items-center justify-center gap-px rounded-[10px] ${focusRing} ${
              on ? "bg-white shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "bg-transparent"
            }`}
          >
            <span className={`text-[13px] text-ink ${on ? "font-semibold" : "font-medium"}`}>{STORE_NAMES[s]}</span>
            <span className="text-xs text-[#4A544F]">
              {formatDollars(byStore[s].cents)} · {byStore[s].count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
