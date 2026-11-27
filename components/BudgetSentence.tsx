"use client";

import { useState } from "react";
import { budgetSentence } from "@/lib/domain/budget";
import { rollDirection } from "@/lib/motion/roll";
import { RollingNumber } from "./RollingNumber";

type Props = { totalCents: number; targetCents: number; cushionCents: number; exact: boolean; totalTestId?: string };

/** How the week sits against the budget, as a sentence. No bar, pill, meter or red. */
export function BudgetSentence({ totalCents, targetCents, cushionCents, exact, totalTestId }: Props) {
  const [last, setLast] = useState({ cents: totalCents, dir: "up" as "up" | "down" });
  if (last.cents !== totalCents) setLast({ cents: totalCents, dir: rollDirection(last.cents, totalCents) });

  const p = budgetSentence(totalCents, targetCents, cushionCents, { exact });
  const note =
    p.noteAmount && p.note.startsWith(p.noteAmount) ? (
      <>
        <span className="text-sale">{p.noteAmount}</span>
        {p.note.slice(p.noteAmount.length)}
      </>
    ) : (
      p.note
    );
  return (
    <section aria-label="Budget" className="bk-price text-small">
      <p>
        {p.lead}
        <strong className="font-bold">
          <RollingNumber value={p.total} direction={last.dir} testId={totalTestId} />
        </strong>
        {p.of}
      </p>
      {p.note && (
        <p key={p.note} className="bk-fade-in text-ink-soft" style={{ animationDelay: "120ms" }}>
          {note}
        </p>
      )}
      {p.caveat && <p className="text-label text-ink-soft">{p.caveat}</p>}
    </section>
  );
}
