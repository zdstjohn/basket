"use client";

import { useState, type FormEvent } from "react";
import { DIETS } from "@/components/PersonRow";
import type { Diet, Person } from "@/lib/domain/types";
import { focusRing, pillButton, textInput } from "@/lib/ui";

const APPETITES = [
  { value: 0.75, label: "Small appetite" },
  { value: 1, label: "Typical" },
  { value: 1.25, label: "Big appetite" },
];

export type PersonDraft = Omit<Person, "id"> & { id?: string };

export function PersonEditor({
  initial,
  onSave,
  onDelete,
  onCancel,
}: {
  initial: PersonDraft;
  onSave: (p: PersonDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [age, setAge] = useState(initial.age > 0 || initial.id ? String(initial.age) : "");
  const [diet, setDiet] = useState<Diet>(initial.diet);
  const [appetite, setAppetite] = useState(initial.appetite);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const appetites = APPETITES.some((a) => a.value === appetite)
    ? APPETITES
    : [...APPETITES, { value: appetite, label: `Custom (${appetite})` }];

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch {
      setError("That didn't save. Try again.");
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    return run(() =>
      onSave({
        ...initial,
        name: name.trim(),
        age: Number(age),
        diet,
        appetite,
      }),
    );
  }

  return (
    <form
      onSubmit={submit}
      aria-label={initial.id ? `Edit ${initial.name}` : "Add a person"}
      className="grid gap-3 border-t border-[#F0F2EF] bg-ground px-3.5 py-3"
    >
      <label className="grid gap-1 text-xs text-muted">
        Name
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
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
            value={age}
            onChange={(e) => setAge(e.target.value)}
            className={textInput}
          />
        </label>
        <label className="grid gap-1 text-xs text-muted">
          Diet
          <select
            value={diet}
            onChange={(e) => setDiet(e.target.value as Diet)}
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
      <label className="grid gap-1 text-xs text-muted">
        Appetite
        <select
          value={appetite}
          onChange={(e) => setAppetite(Number(e.target.value))}
          className={textInput}
        >
          {appetites.map((a) => (
            <option key={a.value} value={a.value}>
              {a.label}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="text-[13px] text-sale">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className={`inline-flex h-11 items-center rounded-full bg-green px-5 text-[14px] font-semibold text-white disabled:opacity-60 ${focusRing}`}
        >
          Save
        </button>
        <button type="button" onClick={onCancel} disabled={busy} className={pillButton}>
          Cancel
        </button>
        {onDelete && (
          <button
            type="button"
            disabled={busy}
            onClick={() => run(onDelete)}
            className={`ml-auto h-11 rounded-full px-3 text-[14px] font-semibold text-sale ${focusRing}`}
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}
