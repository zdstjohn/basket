"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, MapPin } from "lucide-react";
import { BudgetSentence } from "@/components/BudgetSentence";
import { ListRow } from "@/components/ListRow";
import { ListSheet } from "@/components/ListSheet";
import { StoreTabs } from "@/components/StoreTabs";
import { SwapSheet } from "@/components/SwapSheet";
import { useOfflineShell } from "@/components/useOfflineShell";
import { Banner, OfflineStrip } from "@/components/ui/Banner";
import { Button, ButtonLink } from "@/components/ui/Button";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ErrorBanner, Loading, SkeletonLines } from "@/components/ui/states";
import { Toast } from "@/components/ui/Toast";
import type { Household } from "@/lib/db/rows";
import type { Store } from "@/lib/domain/list";
import { checkedOffMessage, keysToCheck, keysToUntick } from "@/lib/list/check-all";
import { splitGotIt } from "@/lib/list/groups";
import { loadQueue } from "@/lib/list/offline";
import { reconnectedStrip, STRIP_MS } from "@/lib/list/offline-strip";
import { STORE_NAMES } from "@/lib/list/prices";
import { reviewLines } from "@/lib/list/review";
import { barAboveNav } from "@/lib/ui";
import { listView, useWeekId, useWeekList } from "@/lib/useWeekList";

const PANEL = "list-panel";
const heading = "mb-2 mt-6 text-heading";

export function ListScreen({ household }: { household: Household }) {
  const week = useWeekId(household);
  const list = useWeekList(household, week.id);
  const { items, totals, checked, priceSource, priceDetail, products, productMode } = list;
  const [store, setStore] = useState<Store>("fred_meyer");
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [swapKey, setSwapKey] = useState<string | null>(null);
  // The swap the item sheet asked for: it opens once that sheet has finished closing.
  const swapAfterClose = useRef<string | null>(null);
  const [swapBusy, setSwapBusy] = useState(false);
  const [problem, setProblem] = useState(false);
  const view = listView({ weekFailed: week.failed && week.id === null, error: list.error, loading: list.loading, itemCount: list.items.length });
  const offlineReady = useOfflineShell(!list.loading && !list.error);

  const choiceOf = (canonical: string) => list.choices.find((c) => c.canonical === canonical);
  const open = openKey ? (items.find((i) => i.key === openKey) ?? null) : null;
  const swapping = swapKey ? (items.find((i) => i.key === swapKey) ?? null) : null;
  const here = useMemo(() => items.filter((i) => i.store === store), [items, store]);
  const toBuyHere = useMemo(() => here.filter((i) => !i.haveIt), [here]);
  const { toBuy, gotIt } = useMemo(() => splitGotIt(toBuyHere, checked), [toBuyHere, checked]);
  const skipped = useMemo(() => here.filter((i) => i.haveIt), [here]);
  const reviewable = useMemo(() => reviewLines(items, products).lines.length, [items, products]);
  const buyCount = items.filter((i) => !i.haveIt).length;
  const toCheck = useMemo(() => keysToCheck(items, store, checked), [items, store, checked]);
  const [undo, setUndo] = useState<{ keys: string[]; id: number } | null>(null);
  const undoId = useRef(0);

  // The status line under the tabs. "Saved" is said only when every change made offline went through.
  const [net, setNet] = useState({ offline: false, refusalsThen: 0 });
  const [strip, setStrip] = useState<"offline" | "saved" | "back" | null>(null);
  if (list.offline !== net.offline) {
    setNet({ offline: list.offline, refusalsThen: list.offline ? list.refusals : net.refusalsThen });
    setStrip(
      list.offline
        ? "offline"
        : reconnectedStrip({ queueLeft: loadQueue(household.id).length, refused: list.refusals > net.refusalsThen }),
    );
  }
  useEffect(() => {
    if (strip !== "saved" && strip !== "back") return;
    const t = setTimeout(() => setStrip(null), STRIP_MS);
    return () => clearTimeout(t);
  }, [strip]);

  function checkOffAll() {
    const keys = toCheck;
    if (keys.length === 0) return;
    void run(() => list.updateMany(keys, { checked: true }));
    setUndo({ keys, id: ++undoId.current });
  }

  function undoCheckOff() {
    if (!undo) return;
    const keys = keysToUntick(undo.keys, checked);
    setUndo(null);
    if (keys.length > 0) void run(() => list.updateMany(keys, { checked: false }));
  }

  async function run(fn: () => Promise<void>) {
    setProblem(false);
    try {
      await fn();
    } catch {
      setProblem(true);
    }
  }

  /** Runs a swap-sheet action with the sheet's buttons held; a failure is said in the sheet or under the list. */
  async function whileBusy(fn: () => Promise<void>, rethrow = false) {
    setSwapBusy(true);
    try {
      await fn();
    } catch (e) {
      if (rethrow) throw e;
      setProblem(true);
    } finally {
      setSwapBusy(false);
    }
  }

  const row = (i: (typeof items)[number]) => (
    <ListRow
      key={i.key}
      item={i}
      checked={checked.has(i.key)}
      source={priceSource[i.key]}
      detail={priceDetail[i.key]}
      product={products[i.key]}
      productMode={productMode}
      lookingUp={!list.offline && !list.stalePrices}
      onToggle={(c) => void run(() => list.update(i.key, { checked: c }))}
      onOpen={() => setOpenKey(i.key)}
      onFind={() => setSwapKey(i.key)}
    />
  );

  const showChooseStore = view === "list" && store === "fred_meyer" && !productMode;
  const nothingHere = toBuy.length === 0 && gotIt.length === 0;

  return (
    <section
      data-live={list.live ? "on" : undefined}
      data-offline-ready={offlineReady ? "on" : undefined}
      className="flex flex-1 flex-col"
    >
      <ScreenHeader
        title="Shopping list"
        action={
          <span className="min-h-5 text-small text-ink-soft">
            {list.loading ? "" : `${buyCount} ${buyCount === 1 ? "item" : "items"}`}
          </span>
        }
      />

      <StoreTabs active={store} onChange={setStore} byStore={totals.byStore} panelId={PANEL} />

      <div className="bk-gutter">
        <div className={strip ? "pt-2" : undefined}>
          <OfflineStrip state={strip} />
        </div>
        {list.stalePrices && (
          <div className="pt-2">
            <Banner icon={Clock}>Fred Meyer prices may be out of date.</Banner>
          </div>
        )}
        {showChooseStore && (
          <div className="pt-2">
            <Banner icon={MapPin}>
              Choose your Fred Meyer in{" "}
              <Link href="/household" className="inline-flex min-h-11 items-center font-semibold text-ink underline">
                Household
              </Link>{" "}
              to see real products and prices.
            </Banner>
          </div>
        )}
        {problem && (
          <div className="pt-2">
            <ErrorBanner message="Couldn’t save. Try again." />
          </div>
        )}
      </div>

      <div role="tabpanel" id={PANEL} aria-labelledby={`${PANEL}-tab-${store}`} className="bk-gutter flex flex-col">
        {view === "error" ? (
          <div className="pt-4">
            <ErrorBanner
              message="Couldn’t load your list."
              actionLabel="Try again"
              onAction={() => {
                week.retry();
                void list.reload();
              }}
            />
          </div>
        ) : view === "skeleton" ? (
          <div className="pt-4">
            <Loading label="Loading your list…" />
            <SkeletonLines lines={6} size="body" />
          </div>
        ) : view === "empty" ? (
          <div className="flex flex-col items-start gap-3 py-8">
            <p className="text-body text-ink">Your list is clear.</p>
            <ButtonLink variant="ghost" href="/week">
              Plan this week
            </ButtonLink>
          </div>
        ) : (
          <>
            {toCheck.length > 0 && (
              <div className="pt-4">
                <Button variant="ghost" onClick={checkOffAll}>
                  Check off all ({toCheck.length})
                </Button>
              </div>
            )}
            {nothingHere && <p className="pt-4 text-body text-ink">Nothing to buy at {STORE_NAMES[store]} this week.</p>}
            {toBuy.map((g) => (
              <section key={g.id} aria-labelledby={`${PANEL}-${g.id}`}>
                <h2 id={`${PANEL}-${g.id}`} className={heading}>
                  {g.title}
                </h2>
                <ul>{g.items.map(row)}</ul>
              </section>
            ))}
            {gotIt.length > 0 && (
              <section aria-labelledby={`${PANEL}-got-it`}>
                <h2 id={`${PANEL}-got-it`} className={heading}>
                  Got it · {gotIt.length}
                </h2>
                <ul>{gotIt.map(row)}</ul>
              </section>
            )}
            {skipped.length > 0 && (
              <details data-testid="skipped" className="mt-6">
                <summary className="flex min-h-11 cursor-pointer items-center text-small font-semibold text-ink-soft">
                  Skipped, you have them · {skipped.length}
                </summary>
                <ul>{skipped.map(row)}</ul>
              </details>
            )}
          </>
        )}
      </div>

      <div className="mt-auto" />
      <div data-testid="list-bar" className={barAboveNav}>
        {store === "fred_meyer" && productMode && reviewable > 0 && (
          <ButtonLink variant="main" href="/list/review" className="mb-2">
            Review and send to Fred Meyer
          </ButtonLink>
        )}
        <BudgetSentence
          totalCents={totals.totalCents}
          targetCents={household.budget_cents}
          cushionCents={household.cushion_cents}
          exact={productMode}
          totalTestId="list-total"
        />
        {totals.missingEstimates > 0 && (
          <p className="text-label text-ink-soft">
            {totals.missingEstimates} {totals.missingEstimates === 1 ? "item" : "items"} without a price
          </p>
        )}
      </div>

      {undo && (
        <Toast
          key={undo.id}
          message={checkedOffMessage(undo.keys.length)}
          tone="ok"
          action={{ label: "Undo", onAction: undoCheckOff }}
          ms={8000}
          onDone={() => setUndo(null)}
          testId="check-all-undo"
        />
      )}

      {open && (
        <ListSheet
          item={open}
          onClose={() => {
            setOpenKey(null);
            const next = swapAfterClose.current;
            swapAfterClose.current = null;
            if (next) setSwapKey(next);
          }}
          onHave={(have) => void run(() => list.update(open.key, { have_it: have }))}
          onMove={(s) => void run(() => list.moveItem(open, s))}
          onPrice={(cents) => list.setPrice(open, cents)}
          hasProduct={!!products[open.key]?.pick}
          canSwap={productMode && open.store === "fred_meyer" && !open.haveIt && !!products[open.key]?.pick}
          onSwap={() => {
            swapAfterClose.current = open.key;
          }}
          onBudget={(outside) => void run(() => list.update(open.key, { outside_budget: outside }))}
        />
      )}

      {swapping && (
        <SwapSheet
          item={swapping}
          rec={products[swapping.key] ?? { pick: null, options: [], cheapestUpc: null, usualMissing: false }}
          searchTerm={choiceOf(swapping.canonical)?.searchTerm ?? null}
          usualUpc={choiceOf(swapping.canonical)?.upc ?? null}
          hasChoice={!!choiceOf(swapping.canonical)}
          busy={swapBusy}
          onClose={() => setSwapKey(null)}
          onChoose={(upc) => {
            setSwapKey(null);
            void run(() => list.chooseProduct(swapping, upc));
          }}
          onSearch={(term) => whileBusy(() => list.searchWith(swapping, term), true)}
          onReset={() => {
            setSwapKey(null);
            void run(() => list.resetChoice(swapping));
          }}
        />
      )}
    </section>
  );
}
