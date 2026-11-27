"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { personLabel } from "@/lib/domain/flags";
import type { Person } from "@/lib/domain/types";
import { verdictWords, type Vote } from "@/lib/domain/verdicts";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/states";
import { Segmented } from "@/components/ui/Segmented";

const CHOICES: { id: Vote; label: string }[] = [
  { id: "up", label: "Liked it" },
  { id: "down", label: "Didn’t like" },
  { id: "skip", label: "Didn’t try" },
];

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

  return (
    <Sheet label={mealName} title={mealName} onClose={onClose}>
      <div className="flex flex-col gap-3 px-4 pb-6 pt-2">
        <p className="text-small text-ink-soft">Who liked it? Answer for the kids too.</p>

        {people.map((p) => {
          const label = personLabel(p, people);
          return (
            <div key={p.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
              <p className="text-body text-ink">{label}</p>
              <div className="min-w-72 flex-1">
                <Segmented<Vote | "">
                  label={label}
                  options={CHOICES}
                  value={votes[p.id] ?? ""}
                  onChange={(v) => v && setVotes((all) => ({ ...all, [p.id]: v }))}
                />
              </div>
            </div>
          );
        })}

        <p aria-live="polite" className="min-h-5 text-small text-ink-soft">
          {words ?? ""}
        </p>
        {failed && <ErrorBanner message="That didn’t save. Try again." />}
        <Button variant="main" busy={busy} onClick={() => void save()}>
          Save
        </Button>
      </div>
    </Sheet>
  );
}
