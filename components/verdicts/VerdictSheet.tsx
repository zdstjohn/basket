"use client";

import { useRef, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { personLabel } from "@/lib/domain/flags";
import type { Person } from "@/lib/domain/types";
import { verdictWords, type Vote } from "@/lib/domain/verdicts";
import { focusRing, primaryButton } from "@/lib/ui";

const CHOICES: { vote: Vote; label: string }[] = [
  { vote: "up", label: "Liked it" },
  { vote: "down", label: "Didn’t like" },
  { vote: "skip", label: "Didn’t try" },
];

function Thumb({ vote, color }: { vote: Vote; color: string }) {
  if (vote === "skip") return null;
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0">
      {vote === "up" ? (
        <path d="M7 10v10H4.5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1H7zm0 0l3.6-7.2a2.3 2.3 0 0 1 2.9 2.6L13 9h5.4a2 2 0 0 1 2 2.4l-1.3 7a2 2 0 0 1-2 1.6H7" />
      ) : (
        <path d="M17 14V4h2.5a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H17zm0 0l-3.6 7.2a2.3 2.3 0 0 1-2.9-2.6L11 15H5.6a2 2 0 0 1-2-2.4l1.3-7a2 2 0 0 1 2-1.6H17" />
      )}
    </svg>
  );
}

/** "Not everyone": one three-way choice per person, the kids included. */
export function VerdictSheet({
  mealName,
  people,
  initial,
  onSave,
  onClose,
}: {
  mealName: string;
  people: Person[];
  initial: Record<string, Vote>;
  onSave: (votes: Record<string, Vote>) => Promise<void>;
  onClose: () => void;
}) {
  // Only the people in the household now: a vote for someone since removed is let go, and someone
  // added since has no choice until it is made.
  const [votes, setVotes] = useState<Record<string, Vote>>(() =>
    Object.fromEntries(people.flatMap((p) => (initial[p.id] ? [[p.id, initial[p.id]]] : []))),
  );
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const groups = useRef(new Map<string, (HTMLButtonElement | null)[]>());

  const words = verdictWords({ mealId: "", eatenOn: "", status: "answered", votes });

  async function save() {
    setBusy(true);
    setFailed(false);
    try {
      await onSave(votes);
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  function move(person: Person, from: number, step: number) {
    const to = (from + step + CHOICES.length) % CHOICES.length;
    setVotes((v) => ({ ...v, [person.id]: CHOICES[to].vote }));
    groups.current.get(person.id)?.[to]?.focus();
  }

  return (
    <Sheet label={mealName} onClose={onClose}>
      <div className="flex flex-col gap-3 p-5 pb-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-[22px] font-bold leading-tight">{mealName}</h2>
            <p className="mt-1 text-sm text-muted">Who liked it? Answer for the kids too.</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className={`-mr-2 -mt-1 flex size-11 shrink-0 items-center justify-center rounded-full ${focusRing}`}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        {people.map((p) => {
          const label = personLabel(p, people);
          const chosen = votes[p.id];
          return (
            <div key={p.id}>
              <p className="text-sm font-semibold">{label}</p>
              <div role="radiogroup" aria-label={label} className="mt-1 grid grid-cols-3 gap-1 rounded-[14px] bg-[#EAEEE9] p-1">
                {CHOICES.map((c, i) => {
                  const on = chosen === c.vote;
                  return (
                    <button
                      key={c.vote}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      tabIndex={on || (chosen === undefined && i === 0) ? 0 : -1}
                      ref={(el) => {
                        const list = groups.current.get(p.id) ?? [];
                        list[i] = el;
                        groups.current.set(p.id, list);
                      }}
                      onClick={() => setVotes((v) => ({ ...v, [p.id]: c.vote }))}
                      onKeyDown={(e) => {
                        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                          e.preventDefault();
                          move(p, i, 1);
                        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                          e.preventDefault();
                          move(p, i, -1);
                        }
                      }}
                      className={`flex h-11 items-center justify-center gap-1 rounded-[10px] text-[13px] ${focusRing} ${
                        on ? "bg-white font-semibold text-ink shadow-[0_1px_2px_rgba(23,32,27,.14)]" : "font-medium text-[#4A544F]"
                      }`}
                    >
                      <Thumb vote={c.vote} color={on && c.vote === "up" ? "#1F7A4D" : on ? "#17201B" : "#4A544F"} />
                      {c.label}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}

        <p aria-live="polite" className="min-h-5 text-sm text-[#4A544F]">
          {words ?? ""}
        </p>
        {failed && (
          <p role="alert" className="text-[13px] font-medium text-[#A6261B]">
            That didn’t save. Try again.
          </p>
        )}
        <button type="button" disabled={busy} onClick={() => void save()} className={primaryButton}>
          Save
        </button>
      </div>
    </Sheet>
  );
}
