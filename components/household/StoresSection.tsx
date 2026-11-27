"use client";

import { useId, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Sheet, useSheetClose } from "@/components/Sheet";
import { Icon } from "@/components/ui/Icon";
import { RadioRows } from "@/components/ui/RadioRows";
import { ErrorBanner } from "@/components/ui/states";
import { createBrowserClient } from "@/lib/db/client";
import { setCategoryStore } from "@/lib/db/queries/list";
import type { Household } from "@/lib/db/rows";
import type { Store } from "@/lib/domain/list";
import { GROUPS } from "@/lib/list/groups";
import { isStore, STORES, STORE_NAMES } from "@/lib/list/prices";

type Group = (typeof GROUPS)[number];

/** The store choices for one kind of food. Choosing saves and closes the sheet. */
function StoreRows({ kind, current, onChoose }: { kind: string; current: Store; onChoose: (store: Store) => void }) {
  const name = useId();
  const close = useSheetClose();
  return (
    <div className="px-4 pb-4">
      <RadioRows
        label={kind}
        name={name}
        options={STORES.map((s) => ({ value: s, label: STORE_NAMES[s] }))}
        value={current}
        onChange={(store) => {
          onChoose(store);
          close();
        }}
      />
    </div>
  );
}

/** Which store each kind of food usually comes from. Single items can still be moved on the list. */
export function StoresSection({ household }: { household: Household }) {
  const sb = useMemo(() => createBrowserClient(), []);
  const [chosen, setChosen] = useState<Record<string, unknown>>((household.category_store ?? {}) as Record<string, unknown>);
  const [error, setError] = useState(false);
  const [open, setOpen] = useState<Group | null>(null);

  const storeOf = (g: Group): Store => {
    const raw = chosen[g.roles[0]];
    return isStore(raw) ? raw : "fred_meyer";
  };

  async function choose(roles: Group["roles"], store: Store) {
    const before = chosen;
    setError(false);
    setChosen({ ...chosen, ...Object.fromEntries(roles.map((r) => [r, store])) });
    try {
      setChosen(await setCategoryStore(sb, household.id, before, roles, store));
    } catch {
      setChosen(before);
      setError(true);
    }
  }

  return (
    <section aria-label="Where things come from" className="flex flex-col gap-2">
      <h2 className="text-heading text-ink">Where things come from</h2>
      <p className="text-small text-ink-soft">The shopping list sorts each kind of food to this store.</p>
      <ul className="divide-y divide-line">
        {GROUPS.map((g) => {
          const store = STORE_NAMES[storeOf(g)];
          return (
            <li key={g.id}>
              <button
                type="button"
                aria-label={`${g.title}, ${store}`}
                onClick={() => setOpen(g)}
                className="flex min-h-13 w-full items-center gap-3 py-2 text-left text-ink"
              >
                <span className="min-w-0 flex-1 text-body">{g.title}</span>
                <span className="text-small text-ink-soft">{store}</span>
                <Icon icon={ChevronRight} size={18} className="text-ink-soft" />
              </button>
            </li>
          );
        })}
      </ul>
      {error && <ErrorBanner message="That didn’t save. Try again." />}
      {open && (
        <Sheet label={open.title} title={open.title} onClose={() => setOpen(null)}>
          <StoreRows kind={open.title} current={storeOf(open)} onChoose={(s) => void choose(open.roles, s)} />
        </Sheet>
      )}
    </section>
  );
}
