"use client";

import { useMemo, useState } from "react";
import { createBrowserClient } from "@/lib/db/client";
import { setCategoryStore } from "@/lib/db/queries/list";
import type { Household } from "@/lib/db/rows";
import type { Store } from "@/lib/domain/list";
import { GROUPS } from "@/lib/list/groups";
import { isStore, STORES, STORE_NAMES } from "@/lib/list/prices";

/** Which store each kind of food usually comes from. Single items can still be moved on the list. */
export function StoresSection({ household }: { household: Household }) {
  const sb = useMemo(() => createBrowserClient(), []);
  const [chosen, setChosen] = useState<Record<string, unknown>>((household.category_store ?? {}) as Record<string, unknown>);
  const [error, setError] = useState(false);

  async function choose(roles: (typeof GROUPS)[number]["roles"], store: Store) {
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
    <section aria-label="Where things come from" className="mx-5 mt-4">
      <h2 className="text-[15px] font-semibold">Where things come from</h2>
      <p className="mb-1.5 text-xs text-muted">The shopping list sorts each kind of food to this store.</p>
      <ul className="overflow-hidden rounded-2xl border border-line bg-white">
        {GROUPS.map((g) => {
          const raw = chosen[g.roles[0]];
          const current: Store = isStore(raw) ? raw : "fred_meyer";
          return (
            <li key={g.id} className="flex flex-col gap-1.5 border-b border-[#F0F2EF] px-3.5 py-2.5 last:border-b-0">
              <span id={`cat-${g.id}`} className="text-[15px] font-medium">
                {g.title}
              </span>
              <div role="radiogroup" aria-labelledby={`cat-${g.id}`} className="grid grid-cols-3 gap-1 rounded-xl bg-[#EAEEE9] p-1">
                {STORES.map((s) => (
                  <label
                    key={s}
                    className="relative flex h-11 items-center justify-center rounded-[10px] text-[13px] font-medium text-ink has-checked:bg-white has-checked:font-semibold has-checked:shadow-[0_1px_2px_rgba(0,0,0,0.08)] has-focus-visible:outline-2 has-focus-visible:outline-green"
                  >
                    <input
                      type="radio"
                      name={`cat-${g.id}`}
                      aria-label={STORE_NAMES[s]}
                      checked={current === s}
                      onChange={() => void choose(g.roles, s)}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                    {STORE_NAMES[s]}
                  </label>
                ))}
              </div>
            </li>
          );
        })}
      </ul>
      {error && (
        <p role="alert" className="mt-2 text-[13px] text-sale">
          That didn&apos;t save. Try again.
        </p>
      )}
    </section>
  );
}
