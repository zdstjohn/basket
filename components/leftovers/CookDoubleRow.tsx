import type { Ref } from "react";
import type { CookState } from "@/lib/domain/leftovers";
import { focusRing, pillButton } from "@/lib/ui";
import { doneBox, OFFLINE_LINE } from "@/lib/week/leftover-copy";

const repeatIcon = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 12a9 9 0 1 0 3-6.7" />
    <path d="M3 4v5h5" />
  </svg>
);

/** On a cooking night: the ask ("Cook double") while it is the usual amount, the green box once it is not. */
export function CookDoubleRow({
  state,
  disabled,
  offline,
  buttonRef,
  onOpen,
}: {
  state: CookState;
  disabled: boolean;
  offline: boolean;
  /** The button that opens the picker, so focus can come back to it. */
  buttonRef?: Ref<HTMLButtonElement>;
  onOpen: () => void;
}) {
  const box = doneBox(state);
  return (
    <div data-testid="cook-double" className="flex flex-col gap-2">
      {box ? (
        <section className="flex items-center gap-3 rounded-[14px] bg-[#E6F2EB] py-1.5 pl-3.5 pr-1.5">
          <span className="flex text-green">{repeatIcon}</span>
          <div className="flex-1 py-1.5">
            <p className="text-sm font-semibold text-[#134D31]">{box.head}</p>
            <p className="mt-0.5 text-xs text-[#2C5A42]">{box.sub}</p>
          </div>
          <button
            ref={buttonRef}
            type="button"
            disabled={disabled || offline}
            onClick={onOpen}
            className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full px-2.5 text-sm font-semibold text-[#134D31] disabled:opacity-60 ${focusRing}`}
          >
            Change
          </button>
        </section>
      ) : (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-line py-2 pl-3 pr-2">
          <p className="text-sm">
            <span className="block font-semibold">Leftovers night</span>
            <span className="block text-xs text-muted">Cook once, eat it twice.</span>
          </p>
          <button ref={buttonRef} type="button" disabled={disabled || offline} onClick={onOpen} className={`${pillButton} text-sm`}>
            Cook double
          </button>
        </div>
      )}
      {offline && <p className="text-[13px] text-[#4A544F]">{OFFLINE_LINE}</p>}
    </div>
  );
}
