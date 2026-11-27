"use client";

import { useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { useOffline } from "@/components/verdicts/useDinnerToAsk";
import { setBusyChoice } from "@/lib/db/queries/busy";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/db/types";
import { busyChoice, busySummary, withChoice, type BusyChoice } from "@/lib/domain/busy";
import type { Day } from "@/lib/domain/weeks";
import { dayName, dayShort } from "@/lib/week/format";
import { focusRing, primaryButton } from "@/lib/ui";

const CHOICES: { id: BusyChoice; label: string }[] = [
  { id: "no", label: "Not busy" },
  { id: "week", label: "This week" },
  { id: "every", label: "Every week" },
];

type Sb = SupabaseClient<Database>;
type Lists = { every: Day[]; thisWeek: Day[] };

export function BusyNightsSheet({
  sb,
  householdId,
  weekId,
  weekDays,
  busy,
  onClose,
  onChanged,
}: {
  sb: Sb;
  householdId: string;
  weekId: string;
  weekDays: Day[];
  busy: Lists;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const offline = useOffline();
  // What the family just tapped, shown until the week reloads with it.
  const [shown, setShown] = useState<Lists | null>(null);
  const [pending, setPending] = useState<Day | null>(null);
  const [failed, setFailed] = useState(false);
  const refs = useRef(new Map<Day, (HTMLButtonElement | null)[]>());
  const lists = shown ?? busy;

  async function choose(day: Day, choice: BusyChoice) {
    if (pending || offline || busyChoice(day, lists.every, lists.thisWeek) === choice) return;
    setFailed(false);
    setPending(day);
    setShown(withChoice(lists.every, lists.thisWeek, day, choice));
    try {
      await setBusyChoice(sb, householdId, weekId, day, choice);
      await onChanged();
    } catch {
      setFailed(true);
    } finally {
      setShown(null);
      setPending(null);
    }
  }

  function move(day: Day, from: number, step: number) {
    const next = (from + step + CHOICES.length) % CHOICES.length;
    void choose(day, CHOICES[next].id);
    refs.current.get(day)?.[next]?.focus();
  }

  return (
    <Sheet label="Busy nights" onClose={onClose}>
      <div className="flex flex-col gap-3 p-5 pb-6">
        <div>
          <h2 className="text-lg font-bold">Busy nights</h2>
          <p className="mt-1 text-sm text-[#4A544F]">Busy nights get quick dinners: 30 minutes or less, slow cooker, or make-ahead.</p>
        </div>

        {weekDays.map((d) => {
          const chosen = busyChoice(d, lists.every, lists.thisWeek);
          const locked = offline || pending === d;
          return (
            <div key={d} className="flex items-center gap-3">
              <span className="w-[34px] shrink-0 text-[13px] font-semibold">{dayShort(d)}</span>
              <div role="radiogroup" aria-label={dayName(d)} className="grid min-w-0 flex-1 grid-cols-3 gap-1 rounded-[14px] bg-[#EAEEE9] p-1">
                {CHOICES.map((c, i) => {
                  const on = chosen === c.id;
                  return (
                    <button
                      key={c.id}
                      ref={(el) => {
                        const list = refs.current.get(d) ?? [];
                        list[i] = el;
                        refs.current.set(d, list);
                      }}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      disabled={locked}
                      tabIndex={on ? 0 : -1}
                      onClick={() => void choose(d, c.id)}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                          e.preventDefault();
                          move(d, i, 1);
                        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                          e.preventDefault();
                          move(d, i, -1);
                        }
                      }}
                      className={`min-h-11 rounded-[10px] px-1 text-[13px] disabled:opacity-60 ${focusRing} ${
                        on ? "bg-white font-semibold text-ink shadow-sm" : "font-medium text-[#4A544F]"
                      }`}
                    >
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        {offline ? (
          <p aria-live="polite" className="text-sm text-[#4A544F]">You’re offline. Connect to change this week.</p>
        ) : failed ? (
          <p role="alert" className="text-sm font-medium text-[#A6261B]">That didn’t save. Try again.</p>
        ) : (
          <p aria-live="polite" className="text-sm text-[#4A544F]">{busySummary(lists.every, lists.thisWeek, weekDays)}</p>
        )}

        <button type="button" onClick={onClose} className={primaryButton}>
          Done
        </button>
      </div>
    </Sheet>
  );
}
