"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { Button, IconButton } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import type { IngredientLine, Role } from "@/lib/domain/types";
import { ROLE_LABELS, ROLES } from "@/lib/list/groups";
import { servingsText } from "@/lib/text/typography";
import { quietLink } from "@/lib/ui";

interface Row {
  key: number;
  canonical: string;
  amount: string;
  unit: string;
  role: Role;
  note?: string;
}

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
      <p className="text-small text-ink-soft">As written in the recipe, for {servingsText(servings)}</p>
      <ul className="mt-2 flex flex-col divide-y divide-line">
        {rows.map((r, i) => (
          <li key={r.key} role="group" aria-label={`Ingredient ${i + 1}`} className="flex flex-col gap-2 py-3">
            <TextField label="Name" value={r.canonical} onChange={(e) => patch(r.key, { canonical: e.target.value })} />
            <div className="flex items-end gap-2">
              <TextField
                label="Amount"
                inputMode="decimal"
                value={r.amount}
                onChange={(e) => patch(r.key, { amount: e.target.value })}
                className="w-24 shrink-0"
              />
              <TextField label="Unit" value={r.unit} onChange={(e) => patch(r.key, { unit: e.target.value })} className="min-w-0 flex-1" />
            </div>
            <div className="flex items-end gap-2">
              <SelectField label="Type" value={r.role} onChange={(e) => patch(r.key, { role: e.target.value as Role })} className="min-w-0 flex-1">
                {ROLES.map((id) => (
                  <option key={id} value={id}>
                    {ROLE_LABELS[id]}
                  </option>
                ))}
              </SelectField>
              <IconButton
                icon={X}
                size={18}
                label={`Remove ${r.canonical || `ingredient ${i + 1}`}`}
                onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}
              />
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => {
          setRows((rs) => [...rs, { key: next, canonical: "", amount: "1", unit: "each", role: "other" }]);
          setNext(next + 1);
        }}
        className={quietLink}
      >
        + Add ingredient
      </button>
      {error && (
        <p role="alert" className="mt-2 text-small text-error">
          {error}
        </p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="ghost" onClick={done}>
          Done
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
