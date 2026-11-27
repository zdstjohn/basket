"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { DIETS } from "@/components/PersonRow";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { ErrorBanner } from "@/components/ui/states";
import { FoodChips, addFood, allergyHelp, mergeList } from "@/components/household/FoodChips";
import { dangerGhost } from "@/components/household/danger";
import { COMMON_ALLERGENS } from "@/lib/domain/families";
import type { Diet, Person } from "@/lib/domain/types";
import { ghostButton } from "@/lib/ui";

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
  deleteLabel,
  onCancel,
}: {
  initial: PersonDraft;
  onSave: (p: PersonDraft) => Promise<void>;
  onDelete?: () => Promise<void>;
  /** How this person is named when asking to delete them: "Son", or "Daughter (4)" when a name is shared. */
  deleteLabel?: string;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial.name);
  const [age, setAge] = useState(initial.age > 0 || initial.id ? String(initial.age) : "");
  const [diet, setDiet] = useState<Diet>(initial.diet);
  const [appetite, setAppetite] = useState(initial.appetite);
  const [dislikes, setDislikes] = useState(initial.dislikes);
  const [allergies, setAllergies] = useState(initial.allergies ?? []);
  const [dislikeTyped, setDislikeTyped] = useState("");
  const [allergyTyped, setAllergyTyped] = useState("");
  const [dislikeError, setDislikeError] = useState<string | null>(null);
  const [allergyError, setAllergyError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const cancelDelete = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (confirmingDelete) cancelDelete.current?.focus();
  }, [confirmingDelete]);

  // The person changed on another phone while this editor was open: keep my edits, take the rest from the fresh row.
  const [base, setBase] = useState(initial);
  const [changedElsewhere, setChangedElsewhere] = useState(false);
  const fields = (p: PersonDraft) =>
    JSON.stringify([p.name, p.age, p.diet, p.appetite, p.dislikes, p.allergies ?? []]);
  if (initial.id && fields(initial) !== fields(base)) {
    const baseAge = base.age > 0 || base.id ? String(base.age) : "";
    setName(name === base.name ? initial.name : name);
    setAge(age === baseAge ? String(initial.age) : age);
    setDiet(diet === base.diet ? initial.diet : diet);
    setAppetite(appetite === base.appetite ? initial.appetite : appetite);
    setDislikes(mergeList(base.dislikes, dislikes, initial.dislikes));
    setAllergies(mergeList(base.allergies ?? [], allergies, initial.allergies ?? []));
    setBase(initial);
    setChangedElsewhere(true);
  }
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
      setError("That didn’t save. Try again.");
      setBusy(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    // Text left in a box is a food the parent meant to add: add it now, or say why it can't be.
    const d = addFood(dislikes, dislikeTyped);
    const a = addFood(allergies, allergyTyped);
    setDislikeError(d.error);
    setAllergyError(a.error);
    if (d.error || a.error) return;
    return run(() =>
      onSave({
        ...initial,
        name: name.trim(),
        age: Number(age),
        diet,
        appetite,
        dislikes: d.list,
        allergies: a.list,
      }),
    );
  }

  return (
    <form
      onSubmit={submit}
      aria-label={initial.id ? `Edit ${initial.name}` : "Add a person"}
      className="grid gap-4 rounded-md bg-sunk p-3"
    >
      {changedElsewhere && (
        <p role="status" className="text-small font-semibold text-ink">
          Changed on the other phone. Your edits are kept; check before saving.
        </p>
      )}
      <TextField label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <TextField
          label="Age"
          required
          type="number"
          inputMode="numeric"
          min={0}
          max={120}
          step={1}
          value={age}
          onChange={(e) => setAge(e.target.value)}
        />
        <SelectField label="Diet" value={diet} onChange={(e) => setDiet(e.target.value as Diet)}>
          {DIETS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </SelectField>
      </div>
      <SelectField label="Appetite" value={appetite} onChange={(e) => setAppetite(Number(e.target.value))}>
        {appetites.map((a) => (
          <option key={a.value} value={a.value}>
            {a.label}
          </option>
        ))}
      </SelectField>
      <FoodChips
        label="Won’t eat"
        help={
          dislikes.length === 0
            ? "Nothing yet. Add foods to steer around."
            : "We’ll point these out and offer to swap or leave them out."
        }
        value={dislikes}
        onChange={setDislikes}
        typed={dislikeTyped}
        onTyped={setDislikeTyped}
        error={dislikeError}
        onError={setDislikeError}
        placeholder="Add a food"
        addLabel="Add"
      />
      <FoodChips
        label="Allergies"
        help={allergyHelp(allergies)}
        value={allergies}
        onChange={setAllergies}
        typed={allergyTyped}
        onTyped={setAllergyTyped}
        error={allergyError}
        onError={setAllergyError}
        placeholder="Add an allergy"
        addLabel="Add"
        suggestions={COMMON_ALLERGENS}
        allergy
      />
      {error && <ErrorBanner message={error} />}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="ghost" busy={busy}>
          Save
        </Button>
        <button type="button" onClick={onCancel} disabled={busy} className={ghostButton}>
          Cancel
        </button>
        {onDelete && !confirmingDelete && (
          <button type="button" disabled={busy} onClick={() => setConfirmingDelete(true)} className={`${dangerGhost} ml-auto`}>
            Delete
          </button>
        )}
      </div>
      {onDelete && confirmingDelete && (
        <div role="group" aria-label="Confirm delete" className="grid gap-2 rounded-md bg-surface p-3">
          <p className="text-body font-semibold text-ink">
            Delete {deleteLabel ?? initial.name}? This can’t be undone.
          </p>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => run(onDelete)} className={dangerGhost}>
              Delete
            </button>
            <button ref={cancelDelete} type="button" disabled={busy} onClick={() => setConfirmingDelete(false)} className={ghostButton}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
