"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/db/client";
import { deleteStaple, listStaples, saveStaple, setStapleActive, type Staple } from "@/lib/db/queries/list";
import type { Household } from "@/lib/db/rows";
import type { Role } from "@/lib/domain/types";
import { ROLE_LABELS, ROLES } from "@/lib/list/groups";
import { focusRing, pillButton, primaryButton, textInput } from "@/lib/ui";

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

  const load = useCallback(async () => {
    try {
      setStaples(await listStaples(sb, household.id));
    } catch {
      setError("We couldn't load your staples.");
    }
  }, [sb, household.id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!draft) return;
    const amount = Number(draft.amount);
    if (!draft.name.trim() || !(amount > 0)) {
      setError("A staple needs a name and an amount above zero.");
      return;
    }
    setError(null);
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
      setError("That didn't save. Try again.");
    }
  }

  async function toggle(s: Staple, active: boolean) {
    setStaples((l) => l?.map((x) => (x.id === s.id ? { ...x, active } : x)) ?? l);
    try {
      await setStapleActive(sb, s.id, active);
    } catch {
      setError("That didn't save. Try again.");
      await load();
    }
  }

  async function remove(id: string) {
    try {
      await deleteStaple(sb, id);
      setDraft(null);
      await load();
    } catch {
      setError("That didn't save. Try again.");
    }
  }

  const field = "grid gap-1 text-xs text-muted";
  return (
    <section aria-label="Staples" className="mx-5 mt-4">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">Staples</h2>
        <button type="button" onClick={() => setDraft(BLANK)} className={`h-11 rounded-full px-3 text-sm font-semibold text-green ${focusRing}`}>
          + Add staple
        </button>
      </div>
      <p className="mb-1.5 text-xs text-muted">Bought every week, on top of the dinners.</p>
      <ul className="overflow-hidden rounded-2xl border border-line bg-white">
        {(staples ?? []).map((s) => (
          <li key={s.id} data-testid="staple-row" className="flex min-h-12 items-center border-b border-[#F0F2EF] last:border-b-0">
            <button
              type="button"
              onClick={() => setDraft({ id: s.id, name: s.canonical, amount: String(s.amount), unit: s.unit, role: s.role, active: s.active })}
              className={`min-h-12 min-w-0 flex-1 py-1 pl-3.5 text-left ${focusRing} ${s.active ? "" : "opacity-60"}`}
            >
              <span className="block text-[15px] font-medium">{displayName(s.canonical)}</span>
              <span className="block text-xs text-muted">
                {s.amount} {s.unit} · {ROLE_LABELS[s.role]}
              </span>
            </button>
            <label className="relative flex size-12 shrink-0 items-center justify-center">
              <input
                type="checkbox"
                role="switch"
                aria-label={displayName(s.canonical)}
                checked={s.active}
                onChange={(e) => void toggle(s, e.target.checked)}
                className="size-5 cursor-pointer accent-green"
              />
            </label>
          </li>
        ))}
        {staples?.length === 0 && !draft && <li className="px-3.5 py-3 text-[13px] text-muted">No staples yet. Milk, eggs, bread?</li>}
        {draft && (
          <li>
            <form onSubmit={save} className="grid gap-2.5 p-3.5">
              <label className={field}>
                Name
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className={textInput} />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className={field}>
                  Amount
                  <input inputMode="decimal" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })} className={textInput} />
                </label>
                <label className={field}>
                  Unit
                  <input value={draft.unit} placeholder="each, lb, gallon" onChange={(e) => setDraft({ ...draft, unit: e.target.value })} className={textInput} />
                </label>
              </div>
              <label className={field}>
                Type
                <select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as Role })} className={textInput}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className={primaryButton}>
                Save staple
              </button>
              <div className="flex gap-2">
                <button type="button" onClick={() => setDraft(null)} className={`${pillButton} flex-1`}>
                  Cancel
                </button>
                {draft.id && (
                  <button type="button" onClick={() => void remove(draft.id as string)} className={`${pillButton} flex-1 text-[#A6261B]`}>
                    Delete
                  </button>
                )}
              </div>
            </form>
          </li>
        )}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-sale">
          {error}
        </p>
      )}
    </section>
  );
}
