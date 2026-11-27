"use client";

import { useState } from "react";
import type { IngredientLine, Role } from "@/lib/domain/types";
import { focusRing, pillButton } from "@/lib/ui";

const ROLES: { id: Role; label: string }[] = [
  { id: "meat", label: "Meat" },
  { id: "fish", label: "Fish" },
  { id: "veg_protein", label: "Beans, tofu" },
  { id: "produce", label: "Produce" },
  { id: "dairy", label: "Dairy" },
  { id: "bakery", label: "Bakery" },
  { id: "frozen", label: "Frozen" },
  { id: "pantry", label: "Pantry" },
  { id: "other", label: "Other" },
];

interface Row {
  key: number;
  canonical: string;
  amount: string;
  unit: string;
  role: Role;
  note?: string;
}

const field = `h-11 rounded-lg border border-[#D5DBD5] bg-white px-2.5 text-base ${focusRing}`;

/** Edit the recipe's ingredients as written (for its own serving count): change, remove or add lines. */
export function IngredientEditor({
  lines,
  servings,
  onDone,
  onCancel,
}: {
  lines: IngredientLine[];
  servings: number;
  onDone: (lines: IngredientLine[]) => void;
  onCancel: () => void;
}) {
  const [next, setNext] = useState(lines.length);
  const [rows, setRows] = useState<Row[]>(() =>
    lines.map((l, key) => ({ key, canonical: l.canonical, amount: String(l.amount), unit: l.unit, role: l.role, note: l.note })),
  );
  const [error, setError] = useState<string | null>(null);

  const patch = (key: number, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  function done() {
    const out: IngredientLine[] = [];
    for (const r of rows) {
      const canonical = r.canonical.trim();
      const unit = r.unit.trim();
      const amount = Number(r.amount);
      if (!canonical || canonical.length > 80 || !unit || unit.length > 30 || !Number.isFinite(amount) || amount <= 0) {
        setError("Each ingredient needs a name, an amount above zero and a unit.");
        return;
      }
      out.push({ canonical, amount, unit, role: r.role, ...(r.note ? { note: r.note } : {}) });
    }
    if (out.length === 0) {
      setError("Keep at least one ingredient.");
      return;
    }
    onDone(out);
  }

  return (
    <div>
      <p className="mt-2 text-xs text-muted">As written in the recipe, for {servings} servings</p>
      <ul className="mt-2 flex flex-col gap-3">
        {rows.map((r, i) => (
          <li key={r.key} role="group" aria-label={`Ingredient ${i + 1}`} className="flex flex-wrap gap-2 border-t border-[#F0F2EF] pt-3">
            <input aria-label="Name" value={r.canonical} onChange={(e) => patch(r.key, { canonical: e.target.value })} className={`${field} w-full`} />
            <input aria-label="Amount" inputMode="decimal" value={r.amount} onChange={(e) => patch(r.key, { amount: e.target.value })} className={`${field} w-20`} />
            <input aria-label="Unit" value={r.unit} onChange={(e) => patch(r.key, { unit: e.target.value })} className={`${field} w-24`} />
            <select aria-label="Type" value={r.role} onChange={(e) => patch(r.key, { role: e.target.value as Role })} className={`${field} min-w-0 flex-1`}>
              {ROLES.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-label={`Remove ${r.canonical || `ingredient ${i + 1}`}`}
              onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
              className={`flex size-11 items-center justify-center rounded-lg text-[#A6261B] ${focusRing}`}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => {
          setRows((rs) => [...rs, { key: next, canonical: "", amount: "1", unit: "each", role: "other" }]);
          setNext(next + 1);
        }}
        className={`mt-2 inline-flex min-h-11 items-center text-sm font-semibold text-green ${focusRing}`}
      >
        + Add ingredient
      </button>
      {error && (
        <p role="alert" className="text-sm font-medium text-[#A6261B]">
          {error}
        </p>
      )}
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={done} className={`inline-flex h-11 flex-1 items-center justify-center rounded-full bg-green text-[15px] font-semibold text-white ${focusRing}`}>
          Done
        </button>
        <button type="button" onClick={onCancel} className={`${pillButton} flex-1`}>
          Cancel
        </button>
      </div>
    </div>
  );
}
