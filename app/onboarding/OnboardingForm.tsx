"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { DIETS, PersonRow } from "@/components/PersonRow";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { Segmented } from "@/components/ui/Segmented";
import { ErrorBanner } from "@/components/ui/states";
import { createBrowserClient } from "@/lib/db/client";
import { formatDollars, formatExtra, parseMoneyToCents } from "@/lib/domain/money-input";
import { saveOnboarding } from "@/lib/onboarding/save";
import { householdServings } from "@/lib/domain/portions";
import type { Diet } from "@/lib/domain/types";
import { servingsText } from "@/lib/text/typography";
import { barBottom } from "@/lib/ui";

interface Row {
  key: number;
  name: string;
  age: string;
  diet: Diet;
  appetite: number;
}

const APPETITES: { id: string; label: string; value: number }[] = [
  { id: "small", label: "Small", value: 0.75 },
  { id: "typical", label: "Typical", value: 1 },
  { id: "big", label: "Big", value: 1.25 },
];

const blankRow = (key: number): Row => ({ key, name: "", age: "", diet: "none", appetite: 1 });
const validAge = (age: string) => /^\d{1,3}$/.test(age) && Number(age) <= 120;
const BUDGET_ERROR = "Enter an amount like $200.";

export interface ExistingHousehold {
  id: string;
  name: string;
  budgetCents: number;
  cushionCents: number;
}

export function OnboardingForm({ existing }: { existing: ExistingHousehold | null }) {
  const router = useRouter();
  const sb = useRef(createBrowserClient()).current;
  const nextKey = useRef(1);
  const createdId = useRef<string | null>(existing?.id ?? null); // survives a retry after a partial save
  const [householdName, setHouseholdName] = useState(existing?.name ?? "");
  const [rows, setRows] = useState<Row[]>([blankRow(0)]);
  const [open, setOpen] = useState<number | null>(0); // exactly one editor is open at a time
  const [focusKey, setFocusKey] = useState<number | null>(null); // an editor the person opened, so it takes focus
  const [budget, setBudget] = useState(existing ? formatDollars(existing.budgetCents) : "$200");
  const [cushion, setCushion] = useState(existing ? formatExtra(existing.cushionCents) : "+$25");
  const [budgetError, setBudgetError] = useState<string | null>(null);
  const [cushionError, setCushionError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editor = useRef<HTMLFieldSetElement>(null);

  const servings = householdServings(
    rows
      .filter((r) => validAge(r.age))
      .map((r) => ({
        id: String(r.key),
        name: r.name,
        age: Number(r.age),
        diet: r.diet,
        appetite: r.appetite,
        dislikes: [],
      })),
  );
  // The live line follows the people once typing pauses, so a reader hears it once per change, not per keystroke.
  const [announced, setAnnounced] = useState(servings);
  useEffect(() => {
    const t = setTimeout(() => setAnnounced(servings), 500);
    return () => clearTimeout(t);
  }, [servings]);

  const patch = (key: number, change: Partial<Row>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...change } : r)));

  /** True when the open editor can close into a row; otherwise shows what is missing. */
  function closeOpen(): boolean {
    const fields = editor.current?.querySelectorAll("input");
    if (fields) {
      for (const f of fields) if (!f.reportValidity()) return false;
    }
    return true;
  }

  function addPerson() {
    if (open !== null && !closeOpen()) return;
    const key = nextKey.current++;
    setRows((list) => [...list, blankRow(key)]);
    setOpen(key);
    setFocusKey(key);
  }

  function reopen(key: number) {
    if (open === key) return;
    if (open !== null && !closeOpen()) return;
    setOpen(key);
    setFocusKey(key);
  }

  function removePerson(key: number) {
    setRows((list) => list.filter((x) => x.key !== key));
    setOpen(null);
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const budgetCents = parseMoneyToCents(budget);
    const cushionCents = parseMoneyToCents(cushion);
    setBudgetError(budgetCents === null ? BUDGET_ERROR : null);
    setCushionError(cushionCents === null ? BUDGET_ERROR : null);
    if (budgetCents === null || cushionCents === null) return;
    const name = householdName.trim();
    if (!name || rows.some((r) => !r.name.trim())) {
      setError("Give the household and everyone in it a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Everyone saves, including the person still being edited.
      createdId.current = await saveOnboarding(
        sb,
        {
          name,
          people: rows.map((r) => ({
            name: r.name.trim(),
            age: Number(r.age),
            diet: r.diet,
            appetite: r.appetite,
            dislikes: [],
          })),
          budgetCents,
          cushionCents,
        },
        createdId.current,
      );
      router.push("/week");
      router.refresh();
    } catch {
      setBusy(false);
      setError("We couldn’t save that. Check the details and try again.");
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-1 flex-col">
      <div className="bk-gutter mt-4 flex flex-1 flex-col gap-6 pb-6">
        <TextField
          label="Household name"
          required
          maxLength={80}
          value={householdName}
          onChange={(e) => setHouseholdName(e.target.value)}
        />

        <section aria-label="Who’s eating" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-heading text-ink">Who’s eating</h2>
            <span aria-live="polite" className="text-small text-ink-soft">
              {servingsText(announced)}
            </span>
          </div>
          <div className="flex flex-col divide-y divide-line">
            {rows.map((r, i) =>
              r.key === open ? (
                <fieldset
                  key={r.key}
                  ref={editor}
                  className="grid min-w-0 gap-3 rounded-md bg-surface p-3"
                >
                  <legend className="px-1 text-small font-semibold text-ink-soft">Person {i + 1}</legend>
                  <TextField
                    label="Name"
                    required
                    autoFocus={focusKey === r.key}
                    value={r.name}
                    onChange={(e) => patch(r.key, { name: e.target.value })}
                  />
                  <div className="grid grid-cols-2 gap-3">
                    <TextField
                      label="Age"
                      required
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={120}
                      step={1}
                      value={r.age}
                      onChange={(e) => patch(r.key, { age: e.target.value })}
                    />
                    <SelectField
                      label="Diet"
                      value={r.diet}
                      onChange={(e) => patch(r.key, { diet: e.target.value as Diet })}
                    >
                      {DIETS.map((d) => (
                        <option key={d.value} value={d.value}>
                          {d.label}
                        </option>
                      ))}
                    </SelectField>
                  </div>
                  <div>
                    <span className="mb-1 block text-small text-ink-soft">Appetite</span>
                    <Segmented
                      label="Appetite"
                      options={APPETITES}
                      value={APPETITES.find((a) => a.value === r.appetite)?.id ?? "typical"}
                      onChange={(id) =>
                        patch(r.key, { appetite: APPETITES.find((a) => a.id === id)?.value ?? 1 })
                      }
                    />
                  </div>
                  {rows.length > 1 && (
                    <Button variant="ghost" className="justify-self-start" onClick={() => removePerson(r.key)}>
                      Remove person {i + 1}
                    </Button>
                  )}
                </fieldset>
              ) : (
                <PersonRow
                  key={r.key}
                  person={{
                    id: String(r.key),
                    name: r.name,
                    age: Number(r.age),
                    diet: r.diet,
                    appetite: r.appetite,
                    dislikes: [],
                    allergies: [],
                  }}
                  expanded={false}
                  onClick={() => reopen(r.key)}
                />
              ),
            )}
          </div>
          <Button variant="ghost" className="self-start" onClick={addPerson}>
            + Add person
          </Button>
        </section>

        <section aria-label="Budget" className="grid grid-cols-2 gap-2">
          <TextField
            label="Weekly budget target"
            inputMode="decimal"
            value={budget}
            error={budgetError ?? undefined}
            onChange={(e) => {
              setBudget(e.target.value);
              setBudgetError(null);
            }}
          />
          <TextField
            label="Wiggle room"
            inputMode="decimal"
            value={cushion}
            error={cushionError ?? undefined}
            onChange={(e) => {
              setCushion(e.target.value);
              setCushionError(null);
            }}
          />
        </section>

        {error && <ErrorBanner message={error} />}
      </div>
      <div className={barBottom}>
        <Button type="submit" variant="main" busy={busy} busyLabel="Saving…">
          Start planning
        </Button>
      </div>
    </form>
  );
}
