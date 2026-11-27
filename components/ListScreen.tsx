"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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
import { ErrorBanner, Loading } from "@/components/ui/states";
import { Toast } from "@/components/ui/Toast";
import type { Household } from "@/lib/db/rows";
import type { Store } from "@/lib/domain/list";
import { checkedOffMessage, keysToCheck, keysToUntick } from "@/lib/list/check-all";
import { splitGotIt } from "@/lib/list/groups";
import { loadQueue } from "@/lib/list/offline";
import { reconnectedStrip, STRIP_MS } from "@/lib/list/offline-strip";
import { STORE_NAMES } from "@/lib/list/prices";
import { reviewLines } from "@/lib/list/review";
import { tick } from "@/lib/motion/haptics";
import { useFlipList } from "@/lib/motion/flip";
import { prefersReducedMotion } from "@/lib/motion/motion";
import { barAboveNav } from "@/lib/ui";
import { listView, useWeekId, useWeekList } from "@/lib/useWeekList";

const PANEL = "list-panel";
/** How long the strike has to draw before the row leaves for "Got it". */
const MOVE_DELAY_MS = 300;
const heading = "mb-2 mt-6 text-heading";

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>): boolean => a.size === b.size && [...a].every((k) => b.has(k));

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
  // What the last failed change was, so Retry can send it again; "refused" is a change the server turned down while offline.
  const [problem, setProblem] = useState<"save" | "refused" | null>(null);
  const retryRef = useRef<(() => Promise<void>) | null>(null);
  // A change was made while offline, so there is something to be sent when the signal returns.
  const [queued, setQueued] = useState(false);
  const view = listView({ weekFailed: week.failed && week.id === null, error: list.error, loading: list.loading, itemCount: list.items.length });
  const offlineReady = useOfflineShell(!list.loading && !list.error);

  const choiceOf = (canonical: string) => list.choices.find((c) => c.canonical === canonical);
  const open = openKey ? (items.find((i) => i.key === openKey) ?? null) : null;
  const swapping = swapKey ? (items.find((i) => i.key === swapKey) ?? null) : null;
  const here = useMemo(() => items.filter((i) => i.store === store), [items, store]);
  const toBuyHere = useMemo(() => here.filter((i) => !i.haveIt), [here]);
  // Which rows sit in "Got it". It starts equal to `checked` once the list has loaded (nothing slides on open) and
  // follows it 300 ms later (at once under reduced motion), so the strike draws before the row moves. The data write
  // has already happened at the tap; this only decides where the row is drawn.
  const [settled, setSettled] = useState<ReadonlySet<string>>(checked);
  const [primed, setPrimed] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const refocus = useRef<{ key: string; box: boolean } | null>(null);
  if (!primed && !list.loading) {
    setPrimed(true);
    setSettled(checked);
  }
  useEffect(() => {
    if (!primed || sameSet(settled, checked)) return;
    const t = setTimeout(
      () => {
        // The row is about to be remounted in its new list; note where focus is so it can be put back.
        const a = document.activeElement;
        const at = a instanceof HTMLElement ? a.closest<HTMLElement>("[data-flip-key]") : null;
        refocus.current =
          at && listRef.current?.contains(at) ? { key: at.getAttribute("data-flip-key") ?? "", box: a instanceof HTMLInputElement } : null;
        setSettled(checked);
      },
      prefersReducedMotion() ? 0 : MOVE_DELAY_MS,
    );
    return () => clearTimeout(t);
  }, [primed, settled, checked]);
  // A moved row is a new element, so keyboard and screen-reader focus would fall to the page: put it back on the same item.
  useLayoutEffect(() => {
    const want = refocus.current;
    refocus.current = null;
    if (!want?.key) return;
    const li = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-flip-key]") ?? [])].find((e) => e.getAttribute("data-flip-key") === want.key);
    const target = li?.querySelector<HTMLElement>(want.box ? 'input[type="checkbox"]' : "button");
    if (target && document.activeElement !== target) target.focus({ preventScroll: true });
  }, [settled]);
  const { toBuy, gotIt } = useMemo(() => splitGotIt(toBuyHere, settled), [toBuyHere, settled]);
  useFlipList(listRef, `${store}|${toBuy.map((g) => g.items.map((i) => i.key).join(",")).join(";")}|${gotIt.map((i) => i.key).join(",")}`);
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
    if (list.offline) setStrip("offline");
    else {
      const refused = list.refusals > net.refusalsThen;
      setStrip(reconnectedStrip({ queueLeft: loadQueue(household.id).length, refused, sent: queued }));
      if (refused) setProblem("refused");
      setQueued(false);
    }
  }
  // A sheet whose item has left the list is gone: its key must not wake it up if the item comes back.
  if (openKey && !open) setOpenKey(null);
  if (swapKey && !swapping) setSwapKey(null);
  useEffect(() => {
    if (!openKey && !open) swapAfterClose.current = null;
  }, [openKey, open]);
  useEffect(() => {
    if (strip !== "saved" && strip !== "back") return;
    const t = setTimeout(() => setStrip(null), STRIP_MS);
    return () => clearTimeout(t);
  }, [strip]);

  function checkOffAll() {
    const keys = toCheck;
    if (keys.length === 0) return;
    void run(() => list.updateMany(keys, { checked: true }), true);
    setUndo({ keys, id: ++undoId.current });
  }

  function undoCheckOff() {
    if (!undo) return;
    const keys = keysToUntick(undo.keys, checked);
    setUndo(null);
    if (keys.length > 0) void run(() => list.updateMany(keys, { checked: false }), true);
  }

  async function run(fn: () => Promise<void>, change = false) {
    setProblem(null);
    if (change && (list.offline || (typeof navigator !== "undefined" && navigator.onLine === false))) setQueued(true);
    try {
      await fn();
    } catch {
      // Only a change that failed can be retried; an older failure must never re-send a newer change.
      retryRef.current = fn;
      setProblem("save");
    }
  }

  /** Runs a swap-sheet action with the sheet's buttons held; a failure is said in the sheet or under the list. */
  async function whileBusy(fn: () => Promise<void>, rethrow = false) {
    setSwapBusy(true);
    try {
      await fn();
    } catch (e) {
      if (rethrow) throw e;
      retryRef.current = () => whileBusy(fn);
      setProblem("save");
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
      onToggle={(c) => {
        tick();
        void run(() => list.update(i.key, { checked: c }), true);
      }}
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
        <div role="status" className={list.stalePrices ? "pt-2" : undefined}>
          {list.stalePrices && (
            <Banner role={null} icon={Clock}>
              Fred Meyer prices may be out of date.
            </Banner>
          )}
        </div>
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
            {problem === "refused" ? (
              <ErrorBanner message="Some changes didn’t save." />
            ) : (
              <ErrorBanner
                message="Couldn’t save. Try again."
                actionLabel="Retry"
                onAction={() => {
                  const again = retryRef.current;
                  if (again) void run(again);
                }}
              />
            )}
          </div>
        )}
      </div>

      <div ref={listRef} role="tabpanel" id={PANEL} aria-labelledby={`${PANEL}-tab-${store}`} className="bk-gutter flex flex-col">
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
            <div aria-hidden="true" className="bk-skeleton min-h-48 rounded-md" />
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
              <div key={g.id}>
                <h2 className={heading}>{g.title}</h2>
                <ul>{g.items.map(row)}</ul>
              </div>
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
          focusAction
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
          onHave={(have) => void run(() => list.update(open.key, { have_it: have }), true)}
          onMove={(s) => void run(() => list.moveItem(open, s))}
          onPrice={(cents) => list.setPrice(open, cents)}
          hasProduct={!!products[open.key]?.pick}
          product={products[open.key]?.pick ?? null}
          canSwap={productMode && open.store === "fred_meyer" && !open.haveIt && !!products[open.key]?.pick}
          canFind={productMode && open.store === "fred_meyer" && !open.haveIt && !!products[open.key] && !products[open.key]?.pick}
          onSwap={() => {
            swapAfterClose.current = open.key;
          }}
          onBudget={(outside) => void run(() => list.update(open.key, { outside_budget: outside }), true)}
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
            void run(() => list.chooseProduct(swapping, upc));
          }}
          onSearch={(term) => whileBusy(() => list.searchWith(swapping, term), true)}
          onReset={() => {
            void run(() => list.resetChoice(swapping));
          }}
        />
      )}
    </section>
  );
}
