"use client";

import { useMemo, useState } from "react";
import { BUDGET_LOOK } from "@/components/BudgetMeter";
import { ListRow } from "@/components/ListRow";
import { ListSheet } from "@/components/ListSheet";
import { StoreTabs } from "@/components/StoreTabs";
import { useOfflineShell } from "@/components/useOfflineShell";
import type { Household } from "@/lib/db/rows";
import type { Store } from "@/lib/domain/list";
import { formatDollars } from "@/lib/domain/money-input";
import { groupItems } from "@/lib/list/groups";
import { STORE_NAMES } from "@/lib/list/prices";
import { pillButton, stickyAboveNav } from "@/lib/ui";
import { useWeekId, useWeekList } from "@/lib/useWeekList";

export function ListScreen({ household }: { household: Household }) {
  const weekId = useWeekId(household);
  const list = useWeekList(household, weekId);
  const { items, totals, state, checked, priceSource, priceDetail } = list;
  const [store, setStore] = useState<Store>("fred_meyer");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const offlineReady = useOfflineShell(!list.loading && !list.error);

  const open = openKey ? (items.find((i) => i.key === openKey) ?? null) : null;
  const here = useMemo(() => items.filter((i) => i.store === store), [items, store]);
  const toBuy = useMemo(() => groupItems(here.filter((i) => !i.haveIt)), [here]);
  const skipped = useMemo(() => here.filter((i) => i.haveIt), [here]);
  const buyCount = items.filter((i) => !i.haveIt).length;
  const look = BUDGET_LOOK[state];

  async function run(fn: () => Promise<void>) {
    setProblem(null);
    try {
      await fn();
    } catch {
      setProblem("That didn't save. Check your connection and try again.");
    }
  }

  const row = (i: (typeof items)[number]) => (
    <ListRow
      key={i.key}
      item={i}
      checked={checked.has(i.key)}
      source={priceSource[i.key]}
      detail={priceDetail[i.key]}
      onToggle={(c) => void run(() => list.update(i.key, { checked: c }))}
      onOpen={() => setOpenKey(i.key)}
    />
  );

  return (
    <section
      data-live={list.live ? "on" : undefined}
      data-offline-ready={offlineReady ? "on" : undefined}
      className="flex flex-1 flex-col"
    >
      <header className="flex items-end justify-between px-5 pb-2.5 pt-5">
        <h1 className="text-[30px] font-bold tracking-tight">Shopping list</h1>
        <span className="min-h-[19px] text-[13px] font-medium text-muted">
          {list.loading ? "" : `${buyCount} ${buyCount === 1 ? "item" : "items"}`}
        </span>
      </header>

      <StoreTabs active={store} onChange={setStore} byStore={totals.byStore} />

      {list.offline && (
        <p role="status" className="mx-5 mt-2.5 text-[13px] text-muted">
          Offline, showing your last list
        </p>
      )}
      {problem && (
        <p role="alert" className="mx-5 mt-2.5 text-[13px] font-medium text-[#A6261B]">
          {problem}
        </p>
      )}

      <div className="mx-5 mt-1.5 flex flex-col">
        {list.error && list.items.length === 0 ? (
          <div role="alert" className="mt-3 rounded-[14px] border border-line bg-white p-4 text-[15px]">
            <p>We couldn&apos;t load your list.</p>
            <button type="button" onClick={() => void list.reload()} className={`${pillButton} mt-2`}>
              Try again
            </button>
          </div>
        ) : list.loading ? (
          <div className="mt-3 flex flex-col gap-2" aria-hidden="true">
            {[0, 1, 2, 3].map((n) => (
              <div key={n} className="h-[52px] animate-pulse rounded-[14px] bg-[#EDF0EC]" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="mt-4 text-[15px] text-muted">
            Nothing on your list yet. Plan some dinners on the Week tab, or add weekly staples in Household.
          </p>
        ) : (
          <>
            {toBuy.length === 0 && (
              <p className="mt-4 text-[15px] text-muted">Nothing to buy at {STORE_NAMES[store]} this week.</p>
            )}
            {toBuy.map((g) => (
              <div key={g.id}>
                <h2 className="mb-1 mt-3.5 text-xs font-semibold uppercase tracking-[0.6px] text-muted">{g.title}</h2>
                <ul>{g.items.map(row)}</ul>
              </div>
            ))}
            {skipped.length > 0 && (
              <details data-testid="skipped" className="mt-4">
                <summary className="flex min-h-11 cursor-pointer items-center text-[13px] font-semibold text-muted">
                  Skipped, you have them · {skipped.length}
                </summary>
                <ul>{skipped.map(row)}</ul>
              </details>
            )}
          </>
        )}
      </div>

      <div className="mt-auto" />
      <div data-testid="list-bar" className={stickyAboveNav}>
        <div className="flex items-center justify-between rounded-2xl border border-line bg-white px-4 py-3">
          <div>
            <p className="text-xs text-muted">Estimated total, for the amounts you&apos;ll use</p>
            <p className="font-heading text-[24px] font-semibold leading-tight">
              <span data-testid="list-total">{formatDollars(totals.totalCents)}</span>{" "}
              <span className="font-sans text-[13px] font-medium text-muted">of {formatDollars(household.budget_cents)}</span>
            </p>
            {totals.missingEstimates > 0 && (
              <p className="text-xs text-muted">
                {totals.missingEstimates} {totals.missingEstimates === 1 ? "item" : "items"} without a price
              </p>
            )}
          </div>
          <p className={`rounded-xl px-2.5 py-1 text-[13px] font-semibold ${look.pill}`}>{look.label}</p>
        </div>
      </div>

      {open && (
        <ListSheet
          item={open}
          onClose={() => setOpenKey(null)}
          onHave={(have) => {
            setOpenKey(null);
            void run(() => list.update(open.key, { have_it: have }));
          }}
          onMove={(s) => {
            setOpenKey(null);
            void run(() => list.moveItem(open, s));
          }}
          onPrice={async (cents) => {
            await list.setPrice(open, cents);
            setOpenKey(null);
          }}
          onBudget={(outside) => {
            setOpenKey(null);
            void run(() => list.update(open.key, { outside_budget: outside }));
          }}
        />
      )}
    </section>
  );
}
