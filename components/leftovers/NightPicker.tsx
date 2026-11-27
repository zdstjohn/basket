"use client";

import { useEffect, useRef, useState } from "react";
import type { NightChoice } from "@/lib/domain/leftovers";
import type { Day } from "@/lib/domain/weeks";
import { focusRing, pillButton } from "@/lib/ui";
import { dayName } from "@/lib/week/format";
import { BEST_WITHIN, choiceSub, lastNightLine, pickerIntro, tintLines } from "@/lib/week/leftover-copy";

const check = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#1F7A4D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-px flex-none">
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

function Ring({ on, color }: { on: boolean; color: string }) {
  return (
    <span aria-hidden="true" className="flex size-[22px] flex-none items-center justify-center rounded-full border-2" style={{ borderColor: color }}>
      {on && <span className="size-2.5 rounded-full bg-green" />}
    </span>
  );
}

/**
 * Which night the leftovers are eaten. Content for a sheet, not a sheet itself: the dialog stays the caller's,
 * so only one modal is ever open.
 */
export function NightPicker({
  mode,
  mealName,
  cookDay,
  choices,
  takenNames,
  swapLine,
  initial,
  busy,
  error,
  showUsual,
  onConfirm,
  onUsual,
  onBack,
}: {
  mode: "cook" | "move";
  mealName: string;
  cookDay: Day;
  choices: NightChoice[];
  takenNames: Record<string, string>;
  swapLine: string | null;
  initial: Day | null;
  busy: boolean;
  error: string | null;
  showUsual: boolean;
  onConfirm: (day: Day | null) => void;
  onUsual: () => void;
  onBack: () => void;
}) {
  const [picked, setPicked] = useState<{ day: Day | null }>({ day: initial });
  const heading = useRef<HTMLHeadingElement>(null);
  // Focus follows the view: the picker opens on its heading.
  useEffect(() => heading.current?.focus(), []);
  // A night that was free when the picker opened may have been taken since (the rows are rebuilt from fresh data).
  // Say so instead of quietly moving the choice.
  const takenNow = picked.day !== null && !choices.some((c) => c.day === picked.day && c.taken === null);
  const selected = picked.day;
  const message = error ?? (takenNow && picked.day ? `${dayName(picked.day)} was just taken. Pick another night.` : null);
  const intro = pickerIntro(mode, mealName, cookDay);

  return (
    <div data-testid="night-picker" className="flex flex-col gap-3 p-5 pb-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 ref={heading} tabIndex={-1} className="text-[22px] font-bold leading-tight outline-none">
            {intro.title}
          </h2>
          <p className="mt-1 text-sm text-muted">{intro.sub}</p>
        </div>
        <button type="button" aria-label="Back" onClick={onBack} className={`-mr-2 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-full ${focusRing}`}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <p className="-mb-1 text-sm font-semibold">Eat the leftovers on</p>
      <div role="radiogroup" aria-label="Eat the leftovers on" className="flex flex-col gap-2">
        {choices.length === 0 && <p className="text-sm">{lastNightLine(cookDay)}</p>}
        {choices.map((c) =>
          c.taken ? (
            <label key={c.day} className="flex min-h-[52px] items-center gap-3 rounded-[14px] border border-line bg-ground px-3.5">
              <input type="radio" name="leftover-night" disabled checked={false} readOnly className="sr-only" />
              <Ring on={false} color="#C9D1C9" />
              <span className="flex-1">
                <span className="block text-[15px] font-medium text-muted">{dayName(c.day)}</span>
                <span className="block text-xs text-muted">{choiceSub(c, takenNames[c.day] ?? null)}</span>
              </span>
            </label>
          ) : (
            <label
              key={c.day}
              className={`flex min-h-[52px] cursor-pointer items-center gap-3 rounded-[14px] bg-white px-3.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-green ${
                selected === c.day ? "border-[1.5px] border-green" : "border border-line"
              }`}
            >
              <input type="radio" name="leftover-night" className="sr-only" checked={selected === c.day} onChange={() => setPicked({ day: c.day })} />
              <Ring on={selected === c.day} color={selected === c.day ? "#1F7A4D" : "#8A948E"} />
              <span className="flex-1">
                <span className={`block text-[15px] ${selected === c.day ? "font-semibold" : "font-medium"}`}>{dayName(c.day)}</span>
                <span className="block text-xs text-muted">{choiceSub(c, null)}</span>
              </span>
            </label>
          ),
        )}
        <label
          className={`flex min-h-[52px] cursor-pointer items-center gap-3 rounded-[14px] bg-white px-3.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-green ${
            selected === null ? "border-[1.5px] border-green" : "border border-line"
          }`}
        >
          <input type="radio" name="leftover-night" className="sr-only" checked={selected === null} onChange={() => setPicked({ day: null })} />
          <Ring on={selected === null} color={selected === null ? "#1F7A4D" : "#8A948E"} />
          <span className="flex-1">
            <span className={`block text-[15px] ${selected === null ? "font-semibold" : "font-medium"}`}>No set night</span>
            <span className="block text-xs text-muted">For lunches, or whenever</span>
          </span>
        </label>
      </div>

      {mode === "cook" && !takenNow && (
        <div className="rounded-[14px] bg-[#E6F2EB] px-3.5 py-2.5 text-[13px] text-[#134D31]">
          {tintLines(selected, swapLine).map((line) => (
            <p key={line} className="my-0.5 flex gap-2">
              {check}
              <span>{line}</span>
            </p>
          ))}
        </div>
      )}
      {message && (
        <p role="alert" className="text-sm font-medium text-[#A6261B]">
          {message}
        </p>
      )}
      <p className="text-[13px] text-muted">{BEST_WITHIN}</p>
      <button
        type="button"
        disabled={busy || takenNow}
        onClick={() => onConfirm(selected)}
        className={`inline-flex h-12 w-full items-center justify-center rounded-full bg-green text-[15px] font-semibold text-white disabled:opacity-60 ${focusRing}`}
      >
        {intro.action}
      </button>
      {showUsual && (
        <button type="button" disabled={busy} onClick={onUsual} className={`${pillButton} w-full`}>
          Back to the usual amount
        </button>
      )}
    </div>
  );
}
