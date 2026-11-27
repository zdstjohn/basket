"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Check } from "lucide-react";
import { BudgetSentence } from "@/components/BudgetSentence";
import { displayName } from "@/components/ListRow";
import { ReviewLine } from "@/components/ReviewLine";
import { Sheet, useSheetClose } from "@/components/Sheet";
import { SwapSheet } from "@/components/SwapSheet";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Segmented } from "@/components/ui/Segmented";
import { ErrorBanner } from "@/components/ui/states";
import { createBrowserClient } from "@/lib/db/client";
import { updateHousehold } from "@/lib/db/queries/household";
import { listCartSends } from "@/lib/db/queries/kroger";
import type { Household } from "@/lib/db/rows";
import { cartDiff, type CartLine, type CartSend, type Modality } from "@/lib/domain/cart";
import type { ListItem } from "@/lib/domain/list";
import { formatMoney } from "@/lib/domain/money-input";
import { sendCart } from "@/lib/list/cart-client";
import { FRED_MEYER_CART_URL, lastSendNote, MAX_PER_PRODUCT, otherCartNote, resendScope, reviewLines, SENT_CHECK_ADVICE, sendPlan } from "@/lib/list/review";
import { subscribeHousehold } from "@/lib/realtime";
import { curly } from "@/lib/text/typography";
import { barAboveNav, ghostButton, mainAction, quietLink } from "@/lib/ui";
import { FM_NOTICES } from "@/lib/list/fm-notices";
import { listView, useWeekId, useWeekList } from "@/lib/useWeekList";

const CONNECT_HREF = "/api/kroger/connect?next=/list/review";

/** What the last tap on the send button came to. */
type Outcome =
  | { kind: "sent"; rejected: string[] }
  | { kind: "unsure"; added: string[]; rejected: { key: string; name: string }[] }
  | { kind: "already_sending" }
  | { kind: "already_sent" }
  | { kind: "not_connected" }
  | { kind: "rejected" }
  | { kind: "too_many" }
  | { kind: "busy" }
  | { kind: "allowance_spent" }
  | { kind: "failed" }
  | { kind: "no_answer" };

/** A send to try again after an unsure one: only the lines Fred Meyer did not report as added. */
interface Retry {
  /** The lines on screen when it was made; a change to them (a count, a swap) drops the retry. */
  sig: string;
  lines: { key: string; upc: string; quantity: number }[];
}

const signature = (lines: CartLine[]): string => lines.map((l) => `${l.key}:${l.upc}:${l.quantity}`).join("|");
/** A Close button for a sheet: it leaves with the same exit as a drag or Escape. */
function SheetCloseButton({ variant, children }: { variant: "main" | "ghost"; children: string }) {
  const close = useSheetClose();
  return (
    <Button variant={variant} onClick={close}>
      {children}
    </Button>
  );
}

/** The connect address is a route handler that redirects to Fred Meyer's sign-in, so it needs a full page load. */
function connectAgain() {
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- an API route, not a page
  location.assign(CONNECT_HREF);
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

export function ReviewScreen({
  household,
  userId,
  profileId,
  connected: connectedAtLoad,
  cartEnabled,
  notice,
}: {
  household: Household;
  userId: string;
  profileId: string | null;
  connected: boolean;
  cartEnabled: boolean;
  /** How the last connect attempt ended, from the `fm` address parameter. */
  notice: "connected" | "denied" | "failed" | null;
}) {
  const sb = useMemo(() => createBrowserClient(), []);
  const week = useWeekId(household);
  const list = useWeekList(household, week.id);
  const { items, products, totals, state } = list;
  const view = listView({ weekFailed: week.failed && week.id === null, error: list.error, loading: list.loading, itemCount: items.length });

  const [connected, setConnected] = useState(connectedAtLoad);
  const [fmNotice] = useState(notice);
  useEffect(() => {
    // The notice is shown once: take ?fm= out of the address so a reload or a shared link does not repeat it.
    const url = new URL(window.location.href);
    if (!url.searchParams.has("fm")) return;
    url.searchParams.delete("fm");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, []);

  // Every try at filling this week's cart, kept fresh by the other phone's sends too.
  const [sendsFor, setSendsFor] = useState<{ weekId: string; sends: CartSend[] } | null>(null);
  const [sendsFailed, setSendsFailed] = useState(false);
  const weekId = week.id;
  const loadSends = useCallback(async () => {
    if (!weekId) return;
    try {
      setSendsFor({ weekId, sends: await listCartSends(sb, weekId) });
      setSendsFailed(false);
    } catch {
      setSendsFailed(true);
    }
  }, [sb, weekId]);
  useEffect(() => {
    if (!weekId) return;
    // Loading starts from an effect on purpose: it depends on the week, and the other phone's sends arrive by subscription.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadSends();
    const stop = subscribeHousehold(household.id, ["cart_sends"], () => void loadSends());
    return stop;
  }, [household.id, weekId, loadSends]);
  // Sends loaded for another week must not stand in for this one's.
  const sends = sendsFor && sendsFor.weekId === weekId ? sendsFor.sends : null;

  const { lines, unmatched, capped } = useMemo(() => reviewLines(items, products), [items, products]);
  const itemOf = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);
  const me = useMemo(() => ({ userId, profileId }), [userId, profileId]);
  const diff = useMemo(() => (sends ? cartDiff(lines, sends, me) : null), [lines, sends, me]);
  const fmTotal = lines.reduce((n, l) => n + l.cents, 0);
  const lineByKey = useMemo(() => new Map(lines.map((l) => [l.key, l])), [lines]);

  const [modality, setModality] = useState<Modality>(household.fulfillment === "DELIVERY" ? "DELIVERY" : "PICKUP");
  const [problem, setProblem] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const sendingRef = useRef(false);
  const resultRef = useRef<HTMLDivElement>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [retry, setRetry] = useState<Retry | null>(null);
  const [again, setAgain] = useState(false);
  const [asking, setAsking] = useState<"over" | "again" | null>(null);
  const [swapKey, setSwapKey] = useState<string | null>(null);
  const [swapBusy, setSwapBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setProblem(null);
    try {
      await fn();
    } catch {
      setProblem("That didn’t save. Check your connection and try again.");
    }
  }

  async function chooseModality(next: Modality) {
    const before = modality;
    setModality(next);
    await run(async () => {
      try {
        await updateHousehold(sb, household.id, { fulfillment: next });
      } catch (e) {
        setModality(before);
        throw e;
      }
    });
  }

  async function whileBusy(fn: () => Promise<void>, rethrow = false) {
    setSwapBusy(true);
    try {
      await fn();
    } catch (e) {
      if (rethrow) throw e;
      setProblem("That didn’t save. Check your connection and try again.");
    } finally {
      setSwapBusy(false);
    }
  }

  const sig = signature(lines);
  const live = retry && retry.sig === sig ? retry : null;
  // What the next tap sends. After an unsure send it is the lines not reported added (always a resend, and the
  // differences that send asked for, never the wanted totals); after "send these again" it adds the lines already in
  // the cart; otherwise only what is new, as the wanted totals.
  const payload = useMemo(() => {
    if (live) return { body: live.lines, actual: live.lines, resend: true, retry: true };
    if (!diff) return { body: [], actual: [], resend: false, retry: false };
    return { ...sendPlan(lines, diff, again), retry: false };
  }, [live, diff, again, lines]);
  const sendCount = payload.body.length;
  const offline = list.offline || (typeof navigator !== "undefined" && navigator.onLine === false);
  const over = state === "red";

  async function doSend() {
    if (sendingRef.current || sendCount === 0 || !weekId) return;
    sendingRef.current = true;
    setSending(true);
    setOutcome(null);
    const sent = payload.actual;
    try {
      const res = await sendCart({ weekId, modality, lines: payload.body, resend: payload.resend });
      if (res.ok) {
        setOutcome({ kind: "sent", rejected: res.rejected.map((r) => r.name) });
        setRetry(null);
        setAgain(false);
      } else if (res.reason === "unsure") {
        const left = resendScope(sent, res.added);
        setOutcome({ kind: "unsure", added: res.added, rejected: res.rejected });
        setRetry({ sig, lines: left });
      } else {
        setOutcome({ kind: res.reason });
        if (res.reason === "not_connected") setConnected(false);
      }
    } finally {
      sendingRef.current = false;
      setSending(false);
      void loadSends();
    }
  }

  function tapSend() {
    if (sendingRef.current || sendCount === 0) return;
    // A retry after an unsure send may add things a second time: it asks first, like "Send these again".
    if (payload.retry) setAsking("again");
    else if (over) setAsking("over");
    else void doSend();
  }

  // The result is said, and focus goes to it, so a screen reader hears it and a keyboard stays with it.
  useEffect(() => {
    if (outcome) resultRef.current?.focus();
  }, [outcome]);

  const swapping = swapKey ? (itemOf.get(swapKey) ?? null) : null;
  const choiceOf = (canonical: string) => list.choices.find((c) => c.canonical === canonical);
  const sentUpcs = new Set(outcome?.kind === "unsure" ? outcome.added : []);
  const notAdded = new Set(outcome?.kind === "unsure" ? outcome.rejected.map((r) => r.key) : []);

  const lineRow = (l: CartLine) => {
    const item = itemOf.get(l.key);
    const pick = products[l.key]?.pick;
    if (!item || !pick) return null;
    return (
      <ReviewLine
        key={l.key}
        line={l}
        item={item}
        pick={pick}
        ownCount={pick.count}
        chip={sentUpcs.has(l.upc) ? "sent" : notAdded.has(l.key) ? "not_added" : undefined}
        busy={sending}
        onCount={(n) => void run(() => list.setPackCount(item, n))}
        onSwap={() => setSwapKey(l.key)}
        onHave={() => void run(() => list.update(l.key, { have_it: true }))}
      />
    );
  };

  const note = sends ? lastSendNote(sends, me, household.time_zone) : null;
  const otherNote = sends ? otherCartNote(sends, me, household.time_zone) : null;
  const unsureNow = outcome?.kind === "unsure" || (diff?.unsure ?? false);

  const label = !connected
    ? "Connect Fred Meyer first"
    : sending
      ? "Adding…"
      : offline
        ? "You’re offline."
        : !diff
          ? sendsFailed
            ? "Can’t send yet"
            : "Checking your cart…"
          : sendCount === 0
            ? "Nothing new to send"
            : `Add ${plural(sendCount, "item", "items")} to my Fred Meyer cart`;
  const canSend = connected && cartEnabled && !sending && !offline && !!diff && sendCount > 0;

  const sectionTitle = "mb-1 mt-6 text-heading text-ink";
  // The unsure warning shows once: in the result after a send that came to it, otherwise from what was recorded earlier.
  const unsureInResult = outcome?.kind === "unsure" || outcome?.kind === "no_answer";

  return (
    <section className="flex flex-1 flex-col">
      <ScreenHeader title="Review your Fred Meyer cart" size="title" back={{ href: "/list", label: "Back to list" }} />

      <div className="bk-gutter flex flex-col gap-2">
        {fmNotice && <Banner>{curly(FM_NOTICES[fmNotice])}</Banner>}
        {list.offline && <Banner>Offline, showing your last list</Banner>}
        {problem && <ErrorBanner message={problem} />}
      </div>

      {!cartEnabled ? (
        <p className="bk-gutter mt-2 text-body text-ink">Cart filling isn’t set up yet.</p>
      ) : !connected ? (
        <div className="bk-gutter mt-2 flex flex-col gap-2">
          <a href={CONNECT_HREF} className={mainAction}>
            Connect Fred Meyer
          </a>
          <p className="text-small text-ink-soft">You’ll sign in on Fred Meyer’s own page. Basket never sees your password.</p>
        </div>
      ) : null}

      <div className="bk-gutter mt-2 flex flex-col">
        {view === "error" ? (
          <ErrorBanner
            message="We couldn’t load your list."
            actionLabel="Try again"
            onAction={() => {
              week.retry();
              void list.reload();
            }}
          />
        ) : view === "skeleton" ? (
          <div className="flex flex-col gap-2" aria-hidden="true">
            {[0, 1, 2].map((n) => (
              <div key={n} className="bk-skeleton h-20 rounded-md" />
            ))}
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              <p className="text-small font-semibold text-ink">How you’ll get it</p>
              <Segmented
                label="How you’ll get it"
                options={[
                  { id: "PICKUP" as const, label: "Pickup" },
                  { id: "DELIVERY" as const, label: "Delivery" },
                ]}
                value={modality}
                onChange={(m) => void chooseModality(m)}
              />
            </div>

            <div className="mt-2 flex flex-col gap-2">
              {note && (
                <div data-testid="last-send">
                  <Banner>{note}</Banner>
                </div>
              )}
              {otherNote && (
                <div data-testid="other-cart">
                  <Banner>{otherNote}</Banner>
                </div>
              )}
              {capped.length > 0 && (
                <div data-testid="capped">
                  <Banner>
                    Capped at {MAX_PER_PRODUCT}: {capped.join(", ")}. Basket sends at most {MAX_PER_PRODUCT} of one product.
                  </Banner>
                </div>
              )}
              {unsureNow && !unsureInResult && (
                <div data-testid="unsure-note">
                  <ErrorBanner message={SENT_CHECK_ADVICE} />
                </div>
              )}
            </div>

            {lines.length === 0 && unmatched.length === 0 && <p className="mt-4 text-body text-ink-soft">Nothing to buy at Fred Meyer this week.</p>}

            {diff && diff.toSend.length > 0 && (
              <div data-testid="to-send">
                <h2 className={sectionTitle}>
                  {diff.alreadySent.length > 0 || diff.toRemove.length > 0 || note ? "New since then" : "Your Fred Meyer cart"}
                </h2>
                <ul className="divide-y divide-line">{diff.toSend.map((l) => lineRow(lineByKey.get(l.key) ?? l))}</ul>
              </div>
            )}
            {!diff && lines.length > 0 && <ul className="mt-4 divide-y divide-line">{lines.map(lineRow)}</ul>}

            {diff && diff.alreadySent.length > 0 && (
              <div data-testid="already-sent">
                <h2 className={sectionTitle}>Already in your cart</h2>
                <ul className="divide-y divide-line">{diff.alreadySent.map(lineRow)}</ul>
                {again ? (
                  <p className="mt-2 text-small text-ink-soft">These will be added a second time.</p>
                ) : (
                  <Button variant="ghost" className="mt-2" onClick={() => setAsking("again")}>
                    Send these again
                  </Button>
                )}
              </div>
            )}

            {diff && diff.toRemove.length > 0 && (
              <div data-testid="to-remove">
                <h2 className={sectionTitle}>Take these out in the Fred Meyer app</h2>
                <ul className="divide-y divide-line">
                  {diff.toRemove.map((r) => (
                    <li key={r.upc} className="flex min-h-13 items-center py-2 text-small text-ink">
                      <span>
                        {r.name} <span className="bk-price text-ink-soft">× {r.quantity}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {unmatched.length > 0 && (
              <div data-testid="not-in-order">
                <h2 className={sectionTitle}>Not in this order</h2>
                <ul className="divide-y divide-line">
                  {unmatched.map((i: ListItem) => (
                    <li key={i.key} className="flex min-h-13 items-center justify-between gap-2 py-2">
                      <span className="min-w-0 text-small font-semibold text-ink">{displayName(i.canonical)}</span>
                      <button
                        type="button"
                        aria-label={`Find a product for ${displayName(i.canonical)}`}
                        onClick={() => setSwapKey(i.key)}
                        className={ghostButton}
                      >
                        Find a product
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-6 flex items-baseline justify-between gap-3 border-t border-line pt-3">
              <p className="text-body text-ink">Fred Meyer total</p>
              <p data-testid="fm-total" className="bk-price whitespace-nowrap text-heading text-ink">
                {formatMoney(fmTotal)}
              </p>
            </div>
            <div className="mt-2">
              <BudgetSentence
                totalCents={totals.totalCents}
                targetCents={household.budget_cents}
                cushionCents={household.cushion_cents}
                exact
                totalTestId="week-total"
              />
            </div>

            <p className="mb-4 mt-4 text-label text-ink-soft">
              A new week starts a new list, so Basket may add items again that you didn’t buy last week.
            </p>
          </>
        )}
      </div>

      <div className="mt-auto" />
      <div data-testid="review-bar" className={barAboveNav}>
        {sendsFailed && !sends && (
          <div className="mb-2">
            <ErrorBanner message="Couldn’t check what’s already in your cart." actionLabel="Retry" onAction={() => void loadSends()} />
          </div>
        )}
        <div
          ref={resultRef}
          tabIndex={-1}
          role="status"
          aria-live="polite"
          data-testid="send-result"
          className={`flex max-h-[40dvh] flex-col gap-2 overflow-y-auto text-small text-ink outline-none ${outcome ? "mb-2" : ""}`}
        >
          {outcome && (
            <>
              {outcome.kind === "sent" && (
                <>
                  <Banner role={null} icon={Check}>
                    <span className="flex flex-col items-start">
                      <span>Added. Check out in the Fred Meyer app.</span>
                      <a href={FRED_MEYER_CART_URL} target="_blank" rel="noopener noreferrer" className={quietLink}>
                        Open my Fred Meyer cart
                        <Icon icon={ExternalLink} size={18} />
                      </a>
                    </span>
                  </Banner>
                  {outcome.rejected.length > 0 && <ErrorBanner role={null} message={`Fred Meyer wouldn’t take: ${outcome.rejected.join(", ")}.`} />}
                </>
              )}
              {outcome.kind === "unsure" && (
                <ErrorBanner
                  role={null}
                  message={
                    outcome.rejected.length > 0
                      ? `${SENT_CHECK_ADVICE} Not added: ${outcome.rejected.map((r) => r.name).join(", ")}.`
                      : SENT_CHECK_ADVICE
                  }
                />
              )}
              {outcome.kind === "already_sending" && (
                <Banner role={null}>A send for this list is already in progress. Wait a moment, then check the Fred Meyer app.</Banner>
              )}
              {outcome.kind === "already_sent" && <Banner role={null}>Everything here is already in your cart.</Banner>}
              {outcome.kind === "not_connected" && <ErrorBanner role={null} message="Connect Fred Meyer again." actionLabel="Connect Fred Meyer" onAction={connectAgain} />}
              {outcome.kind === "rejected" && <ErrorBanner role={null} message="Fred Meyer wouldn’t take these items. Try swapping them." />}
              {outcome.kind === "too_many" && <ErrorBanner role={null} message="You’ve sent this list a lot today. Try again tomorrow." />}
              {outcome.kind === "busy" && <ErrorBanner role={null} message="Fred Meyer is busy. Try again in a minute." />}
              {outcome.kind === "allowance_spent" && <ErrorBanner role={null} message="Basket has looked up a lot of Fred Meyer prices today. Try again tomorrow." />}
              {outcome.kind === "no_answer" && <ErrorBanner role={null} message={SENT_CHECK_ADVICE} />}
              {outcome.kind === "failed" && <ErrorBanner role={null} message="That didn’t go through. Nothing was added." />}
            </>
          )}
        </div>
        <button
          type="button"
          data-testid="send-cart"
          disabled={!canSend}
          aria-disabled={!canSend}
          onClick={tapSend}
          className={connected ? mainAction : `${ghostButton} w-full`}
        >
          {label}
        </button>
        <p className="mt-2 text-label text-ink-soft">Basket never places an order. You check out at Fred Meyer.</p>
      </div>

      {asking === "over" && (
        <Sheet
          label="Over budget"
          title={`You’re ${formatMoney(Math.max(0, totals.totalCents - household.budget_cents))} over your budget. Add to cart anyway?`}
          onClose={() => setAsking(null)}
        >
          <div className="flex flex-col gap-2 px-4 pb-4 pt-2">
            <Button
              variant="main"
              onClick={() => {
                setAsking(null);
                void doSend();
              }}
            >
              Add anyway
            </Button>
            <SheetCloseButton variant="ghost">Go back</SheetCloseButton>
          </div>
        </Sheet>
      )}

      {asking === "again" && (
        <Sheet label="Send these again" title="Send these again" onClose={() => setAsking(null)}>
          <div className="flex flex-col gap-4 px-4 pb-4 pt-2">
            <p className="text-body text-ink">This adds them a second time. Fred Meyer can’t tell Basket what’s already in your cart.</p>
            <div className="flex flex-col gap-2">
              <SheetCloseButton variant="main">Cancel</SheetCloseButton>
              <Button
                variant="ghost"
                onClick={() => {
                  setAsking(null);
                  if (!payload.retry) setAgain(true);
                  else if (over) setAsking("over");
                  else void doSend();
                }}
              >
                Add again
              </Button>
            </div>
          </div>
        </Sheet>
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
