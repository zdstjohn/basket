"use client";

import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion/motion";
import { rollDigits, type RollDigit } from "@/lib/motion/roll";

type Shown = { value: string; digits: RollDigit[] | null; go: boolean; fade: boolean };

const plain = (value: string): RollDigit[] => value.split("").map((char) => ({ char, from: null, delayMs: 0 }));

/**
 * An amount whose digits roll when it changes. Screen readers hear the value once (the live span);
 * the rolling characters are aria-hidden. Under reduced motion the row crossfades over 120 ms.
 */
export function RollingNumber({ value, direction, testId }: { value: string; direction: "up" | "down"; testId?: string }) {
  const [shown, setShown] = useState<Shown>({ value, digits: null, go: false, fade: false });
  if (shown.value !== value) {
    if (prefersReducedMotion()) setShown({ value, digits: null, go: true, fade: true });
    else setShown({ value, digits: rollDigits(shown.value, value), go: false, fade: false });
  }

  useEffect(() => {
    if (shown.go || !shown.digits) return;
    let b = 0;
    const a = requestAnimationFrame(() => {
      b = requestAnimationFrame(() => setShown((s) => (s.value === shown.value ? { ...s, go: true } : s)));
    });
    return () => {
      cancelAnimationFrame(a);
      cancelAnimationFrame(b);
    };
  }, [shown.go, shown.digits, shown.value]);

  const up = direction === "up";
  const digits = shown.digits ?? plain(shown.value);
  return (
    <span className="inline-flex">
      <span className="sr-only" aria-live="polite" data-testid={testId}>
        {value}
      </span>
      <span
        aria-hidden="true"
        className={`inline-flex whitespace-nowrap tabular-nums ${shown.fade ? "bk-fade-in" : ""}`}
        style={shown.fade ? { animationDuration: "120ms" } : undefined}
        key={shown.fade ? shown.value : "row"}
      >
        {digits.map((d, i) =>
          d.from === null ? (
            <span key={i}>{d.char}</span>
          ) : (
            <span key={i} className="bk-roll">
              {(up ? [d.from, d.char] : [d.char, d.from]).map((c, k) => {
                const isOld = up ? k === 0 : k === 1;
                // up: both lines slide up one line; down: both slide down from one line above.
                const t = up ? (shown.go ? "translateY(-100%)" : "translateY(0)") : shown.go ? "translateY(0)" : "translateY(-100%)";
                return (
                  <span key={k} style={{ transform: t, transitionDelay: `${d.delayMs}ms` }}>
                    {c === " " && isOld ? " " : c}
                  </span>
                );
              })}
            </span>
          ),
        )}
      </span>
    </span>
  );
}
