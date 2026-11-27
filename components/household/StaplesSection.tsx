"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/db/client";
import { deleteStaple, listStaples, saveStaple, setStapleActive, type Staple } from "@/lib/db/queries/list";
import type { Household } from "@/lib/db/rows";
import type { Role } from "@/lib/domain/types";
import { ROLE_LABELS, ROLES } from "@/lib/list/groups";
import { Button } from "@/components/ui/Button";
import { SelectField, TextField } from "@/components/ui/Field";
import { Qty } from "@/components/ui/Qty";
import { ErrorBanner, Loading, SkeletonLines } from "@/components/ui/states";
import { Switch } from "@/components/ui/Switch";
import { quantityOrCount } from "@/lib/domain/units";
import { dangerGhost, ghostButton } from "@/lib/ui";

interface Draft {
  id?: string;
  name: string;
  amount: string;
  unit: string;
  role: Role;
  active: boolean;
}

const BLANK: Draft = { name: "", amount: "1", unit: "each", role: "pantry", active: true };
const displayName = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Things bought every week. They are added to the shopping list on top of the dinners. */
export function StaplesSection({ household }: { household: Household }) {
  const sb = useMemo(() => createBrowserClient(), []);
  const [staples, setStaples] = useState<Staple[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setStaples(await listStaples(sb, household.id));
      setLoadFailed(false);
      setError(null); // a good load clears a save message left by an earlier failure
    } catch {
      setLoadFailed(true);
    }
  }, [sb, household.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft || saving) return;
    const amount = Number(draft.amount);
    if (!draft.name.trim() || !(amount > 0)) {
      setError("A staple needs a name and an amount above zero.");
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await saveStaple(sb, household.id, {
        id: draft.id,
        canonical: draft.name,
        amount,
        unit: draft.unit.trim() || "each",
        role: draft.role,
        active: draft.active,
      });
      setDraft(null);
      await load();
    } catch {
      setError("That didn’t save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function toggle(s: Staple, active: boolean) {
    setStaples((l) => l?.map((x) => (x.id === s.id ? { ...x, active } : x)) ?? l);
    try {
      await setStapleActive(sb, s.id, active);
    } catch {
      await load(); // put the switch back where it was, then say so (a good load clears errors)
      setError("That didn’t save. Try again.");
    }
  }

  async function remove(id: string) {
    try {
      await deleteStaple(sb, id);
      setDraft(null);
      await load();
    } catch {
      setError("That didn’t save. Try again.");
    }
  }

  return (
    <section aria-label="Staples" className="flex flex-col gap-2">
      <h2 className="text-heading text-ink">Staples</h2>
      <p className="text-small text-ink-soft">Bought every week, on top of the dinners.</p>
      {staples === null && !loadFailed && (
        <>
          <SkeletonLines lines={3} size="body" />
          <Loading label="Loading your staples" />
        </>
      )}
      {loadFailed && <ErrorBanner message="We couldn’t load your staples." actionLabel="Try again" onAction={() => void load()} />}
      {staples !== null && (staples.length > 0 || draft) && (
        <ul className="divide-y divide-line">
          {staples.map((s) => (
            <li key={s.id} data-testid="staple-row" className="flex min-h-13 items-center gap-2">
              <button
                type="button"
                onClick={() => setDraft({ id: s.id, name: s.canonical, amount: String(s.amount), unit: s.unit, role: s.role, active: s.active })}
                className={`min-h-13 min-w-0 flex-1 py-2 text-left ${s.active ? "text-ink" : "text-ink-soft"}`}
              >
                <span className="block text-body">{displayName(s.canonical)}</span>
                <span className="block text-small text-ink-soft">
                  <Qty q={quantityOrCount(s.amount, s.unit)} /> · {ROLE_LABELS[s.role]}
                </span>
              </button>
              <Switch label={`Buy ${displayName(s.canonical)} every week`} checked={s.active} onChange={(on) => void toggle(s, on)} />
            </li>
          ))}
          {draft && (
            <li className="py-3">
              <form onSubmit={save} className="grid gap-3">
                <TextField label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                <div className="grid grid-cols-2 gap-3">
                  <TextField label="Amount" inputMode="decimal" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} />
                  <TextField label="Unit" value={draft.unit} placeholder="each, lb, gallon" onChange={(e) => setDraft({ ...draft, unit: e.target.value })} />
                </div>
                <SelectField label="Type" value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </SelectField>
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="submit" variant="ghost" busy={saving} busyLabel="Saving…">
                    Save staple
                  </Button>
                  <button type="button" onClick={() => setDraft(null)} className={ghostButton}>
                    Cancel
                  </button>
                  {draft.id && (
                    <button type="button" onClick={() => void remove(draft.id as string)} className={`${dangerGhost} ml-auto`}>
                      Delete
                    </button>
                  )}
                </div>
              </form>
            </li>
          )}
        </ul>
      )}
      {staples?.length === 0 && !draft && <p className="text-small text-ink-soft">No staples yet. Milk, eggs, bread?</p>}
      {error && <ErrorBanner message={error} />}
      <Button variant="ghost" className="self-start" onClick={() => setDraft(BLANK)}>
        + Add staple
      </Button>
    </section>
  );
}
