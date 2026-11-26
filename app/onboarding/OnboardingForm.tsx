"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { DIETS } from "@/components/PersonRow";
import { createBrowserClient } from "@/lib/db/client";
import { formatDollars, formatExtra, parseMoneyToCents } from "@/lib/domain/money-input";
import { saveOnboarding } from "@/lib/onboarding/save";
import { householdServings } from "@/lib/domain/portions";
import type { Diet } from "@/lib/domain/types";
import { focusRing, primaryButton, textInput } from "@/lib/ui";

interface Row {
  key: number;
  name: string;
  age: string;
  diet: Diet;
}

const blankRow = (key: number): Row => ({ key, name: "", age: "", diet: "none" });
const validAge = (age: string) => /^\d{1,3}$/.test(age) && Number(age) <= 120;

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
  const [budget, setBudget] = useState(existing ? formatDollars(existing.budgetCents) : "$200");
  const [cushion, setCushion] = useState(existing ? formatExtra(existing.cushionCents) : "+$25");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const servings = householdServings(
    rows
      .filter((r) => validAge(r.age))
      .map((r) => ({
        id: String(r.key),
        name: r.name,
        age: Number(r.age),
        diet: r.diet,
        appetite: 1,
        dislikes: [],
      })),
  );

  const patch = (key: number, change: Partial<Row>) =>
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...change } : r)));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const budgetCents = parseMoneyToCents(budget);
    const cushionCents = parseMoneyToCents(cushion);
    if (budgetCents === null || cushionCents === null) {
      setError("Enter the budget as an amount, like $200 and +$25.");
      return;
    }
    const name = householdName.trim();
    if (!name || rows.some((r) => !r.name.trim())) {
      setError("Give the household and everyone in it a name.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      createdId.current = await saveOnboarding(
        sb,
        {
          name,
          people: rows.map((r) => ({
            name: r.name.trim(),
            age: Number(r.age),
            diet: r.diet,
            appetite: 1,
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
      setError("We couldn't save that. Check the details and try again.");
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 flex flex-col gap-5">
      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium text-muted">Household name</span>
        <input
          required
          maxLength={80}
          value={householdName}
          onChange={(e) => setHouseholdName(e.target.value)}
          className={textInput}
        />
      </label>

      <section aria-label="Who's eating" className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Who&apos;s eating</h2>
          <span aria-live="polite" className="text-[13px] font-medium text-muted">
            {servings} servings
          </span>
        </div>
        {rows.map((r, i) => (
          <fieldset
            key={r.key}
            className="grid gap-3 rounded-2xl border border-line bg-white p-3.5"
          >
            <legend className="px-1 text-[13px] font-semibold text-muted">Person {i + 1}</legend>
            <label className="grid gap-1 text-xs text-muted">
              Name
              <input
                required
                value={r.name}
                onChange={(e) => patch(r.key, { name: e.target.value })}
                className={textInput}
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-xs text-muted">
                Age
                <input
                  required
                  type="number"
                  inputMode="numeric"
                  min={0}
                  max={120}
                  step={1}
                  value={r.age}
                  onChange={(e) => patch(r.key, { age: e.target.value })}
                  className={textInput}
                />
              </label>
              <label className="grid gap-1 text-xs text-muted">
                Diet
                <select
                  value={r.diet}
                  onChange={(e) => patch(r.key, { diet: e.target.value as Diet })}
                  className={textInput}
                >
                  {DIETS.map((d) => (
                    <option key={d.value} value={d.value}>
                      {d.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => setRows((list) => list.filter((x) => x.key !== r.key))}
                className={`h-11 justify-self-start rounded-full px-3 text-[14px] font-semibold text-sale ${focusRing}`}
              >
                Remove person {i + 1}
              </button>
            )}
          </fieldset>
        ))}
        <button
          type="button"
          onClick={() => setRows((list) => [...list, blankRow(nextKey.current++)])}
          className={`h-11 self-start rounded-full px-3 text-sm font-semibold text-green ${focusRing}`}
        >
          + Add person
        </button>
      </section>

      <section aria-label="Budget" className="grid grid-cols-2 gap-2">
        <label className="block rounded-[14px] border border-line bg-white px-3.5 py-2.5">
          <span className="block text-xs text-muted">Weekly budget target</span>
          <input
            inputMode="decimal"
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            className={`mt-0.5 h-8 w-full bg-transparent text-xl font-semibold text-ink ${focusRing}`}
          />
        </label>
        <label className="block rounded-[14px] border border-line bg-white px-3.5 py-2.5">
          <span className="block text-xs text-muted">Wiggle room</span>
          <input
            inputMode="decimal"
            value={cushion}
            onChange={(e) => setCushion(e.target.value)}
            className={`mt-0.5 h-8 w-full bg-transparent text-xl font-semibold text-ink ${focusRing}`}
          />
        </label>
      </section>

      {error && (
        <p role="alert" className="rounded-xl bg-sale-tint px-3 py-2 text-[14px] text-sale">
          {error}
        </p>
      )}
      <button type="submit" disabled={busy} className={primaryButton}>
        {busy ? "Saving…" : "Start planning"}
      </button>
    </form>
  );
}
