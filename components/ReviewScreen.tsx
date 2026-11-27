"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BUDGET_LOOK } from "@/components/BudgetMeter";
import { displayName } from "@/components/ListRow";
import { ReviewLine } from "@/components/ReviewLine";
import { Sheet } from "@/components/Sheet";
import { SwapSheet } from "@/components/SwapSheet";
import { createBrowserClient } from "@/lib/db/client";
import { updateHousehold } from "@/lib/db/queries/household";
import { listCartSends } from "@/lib/db/queries/kroger";
import type { Household } from "@/lib/db/rows";
import { cartDiff, type CartLine, type CartSend, type Modality } from "@/lib/domain/cart";
import type { ListItem } from "@/lib/domain/list";
import { formatDollars } from "@/lib/domain/money-input";
import { sendCart } from "@/lib/list/cart-client";
import { FRED_MEYER_CART_URL, lastSendNote, MAX_PER_PRODUCT, otherCartNote, resendScope, reviewLines, SENT_CHECK_ADVICE, sendPlan } from "@/lib/list/review";
import { subscribeHousehold } from "@/lib/realtime";
import { bigGreenLink, focusRing, pillButton, primaryButton, stickyAboveNav } from "@/lib/ui";
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
  | { kind: "failed" }
  | { kind: "no_answer" };

/** A send to try again after an unsure one: only the lines Fred Meyer did not report as added. */
interface Retry {
  /** The lines on screen when it was made; a change to them (a count, a swap) drops the retry. */
  sig: string;
  lines: { key: string; upc: string; quantity: number }[];
}

const signature = (lines: CartLine[]): string => lines.map((l) => `${l.key}:${l.upc}:${l.quantity}`).join("|");
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
      setProblem("That didn't save. Check your connection and try again.");
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
      setProblem("That didn't save. Check your connection and try again.");
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
  const look = BUDGET_LOOK[state];

  const label = !connected
    ? "Connect Fred Meyer first"
    : sending
      ? "Adding…"
      : offline
        ? "You're offline."
        : !diff
          ? sendsFailed
            ? "Can’t send yet"
            : "Checking your cart…"
          : sendCount === 0
            ? "Nothing new to send"
            : `Add ${plural(sendCount, "item", "items")} to my Fred Meyer cart`;
  const canSend = connected && cartEnabled && !sending && !offline && !!diff && sendCount > 0;

  return (
    <section className="flex flex-1 flex-col">
      <header className="px-5 pb-2.5 pt-5">
        <Link href="/list" className={`-ml-1 inline-flex min-h-11 items-center px-1 text-sm font-semibold text-green underline ${focusRing}`}>
          Back to list
        </Link>
        <h1 className="text-[28px] font-bold leading-tight tracking-tight">Review your Fred Meyer cart</h1>
      </header>

      {fmNotice && (
        <p role="status" className="mx-5 mb-2 text-[13px] font-medium text-[#4A544F]">
          {FM_NOTICES[fmNotice]}
        </p>
      )}
      {list.offline && (
        <p role="status" className="mx-5 mb-2 text-[13px] text-muted">
          Offline, showing your last list
        </p>
      )}
      {problem && (
        <p role="alert" className="mx-5 mb-2 text-[13px] font-medium text-[#A6261B]">
          {problem}
        </p>
      )}

      {!cartEnabled ? (
        <p className="mx-5 mb-3 rounded-[14px] border border-line bg-white p-4 text-[15px]">Cart filling isn&apos;t set up yet.</p>
      ) : !connected ? (
        <div className="mx-5 mb-3 rounded-[14px] border border-line bg-white p-4">
          <a href={CONNECT_HREF} className={bigGreenLink}>
            Connect Fred Meyer
          </a>
          <p className="mt-2 text-[13px] text-muted">You&apos;ll sign in on Fred Meyer&apos;s own page. Basket never sees your password.</p>
        </div>
      ) : null}

      <div className="mx-5 flex flex-col">
        {view === "error" ? (
          <div role="alert" className="rounded-[14px] border border-line bg-white p-4 text-[15px]">
            <p>We couldn&apos;t load your list.</p>
            <button type="button" onClick={() => { week.retry(); void list.reload(); }} className={`${pillButton} mt-2`}>
              Try again
            </button>
          </div>
        ) : view === "skeleton" ? (
          <div className="flex flex-col gap-2" aria-hidden="true">
            {[0, 1, 2].map((n) => (
              <div key={n} className="h-[72px] animate-pulse rounded-[14px] bg-[#EDF0EC]" />
            ))}
          </div>
        ) : (
          <>
            <fieldset className="mb-1">
              <legend className="sr-only">How you&apos;ll get it</legend>
              <div role="radiogroup" aria-label="How you'll get it" className="grid grid-cols-2 gap-1 rounded-[14px] bg-[#EAEEE9] p-1">
                {(["PICKUP", "DELIVERY"] as const).map((m) => (
                  <label
                    key={m}
                    className={`relative flex min-h-11 cursor-pointer items-center justify-center rounded-xl text-sm font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-green ${
                      modality === m ? "bg-white text-ink shadow-sm" : "text-muted"
                    }`}
                  >
                    <input
                      type="radio"
                      name="fulfillment"
                      value={m}
                      checked={modality === m}
                      onChange={() => void chooseModality(m)}
                      className="absolute inset-0 cursor-pointer opacity-0"
                    />
                    {m === "PICKUP" ? "Pickup" : "Delivery"}
                  </label>
                ))}
              </div>
            </fieldset>

            {note && (
              <p data-testid="last-send" role="status" className="mt-2 text-[13px] font-medium text-[#4A544F]">
                {note}
              </p>
            )}
            {otherNote && (
              <p data-testid="other-cart" role="status" className="mt-2 rounded-xl bg-[#FFF1CC] p-3 text-[13px] font-medium text-[#7A4B00]">
                {otherNote}
              </p>
            )}
            {capped.length > 0 && (
              <p data-testid="capped" role="status" className="mt-2 text-[13px] font-medium text-[#7A4B00]">
                Capped at {MAX_PER_PRODUCT}: {capped.join(", ")}. Basket sends at most {MAX_PER_PRODUCT} of one product.
              </p>
            )}
            {unsureNow && (
              <p data-testid="unsure-note" role="status" className="mt-2 rounded-xl bg-[#FFF1CC] p-3 text-[13px] font-medium text-[#7A4B00]">
                {SENT_CHECK_ADVICE}
              </p>
            )}

            {lines.length === 0 && unmatched.length === 0 && (
              <p className="mt-4 text-[15px] text-muted">Nothing to buy at Fred Meyer this week.</p>
            )}

            {diff && diff.toSend.length > 0 && (
              <div data-testid="to-send">
                <h2 className="mb-1 mt-3.5 text-xs font-semibold uppercase tracking-[0.6px] text-muted">
                  {diff.alreadySent.length > 0 || diff.toRemove.length > 0 || note ? "New since then" : "Your Fred Meyer cart"}
                </h2>
                <ul>{diff.toSend.map((l) => lineRow(lineByKey.get(l.key) ?? l))}</ul>
              </div>
            )}
            {!diff && lines.length > 0 && (
              <ul className="mt-3.5">{lines.map(lineRow)}</ul>
            )}

            {diff && diff.alreadySent.length > 0 && (
              <div data-testid="already-sent">
                <h2 className="mb-1 mt-3.5 text-xs font-semibold uppercase tracking-[0.6px] text-muted">Already in your cart</h2>
                <ul>{diff.alreadySent.map(lineRow)}</ul>
                {again ? (
                  <p className="mt-2 text-[13px] font-medium text-[#4A544F]">These will be added a second time.</p>
                ) : (
                  <button type="button" onClick={() => setAsking("again")} className={`${pillButton} mt-2`}>
                    Send these again
                  </button>
                )}
              </div>
            )}

            {diff && diff.toRemove.length > 0 && (
              <div data-testid="to-remove">
                <h2 className="mb-1 mt-3.5 text-xs font-semibold uppercase tracking-[0.6px] text-muted">
                  Take these out in the Fred Meyer app
                </h2>
                <ul>
                  {diff.toRemove.map((r) => (
                    <li key={r.upc} className="border-b border-[#E8EBE7] py-2 text-sm">
                      {r.name} <span className="text-muted">× {r.quantity}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {unmatched.length > 0 && (
              <div data-testid="not-in-order">
                <h2 className="mb-1 mt-3.5 text-xs font-semibold uppercase tracking-[0.6px] text-muted">Not in this order</h2>
                <ul>
                  {unmatched.map((i: ListItem) => (
                    <li key={i.key} className="flex min-h-[52px] items-center justify-between gap-2 border-b border-[#E8EBE7]">
                      <span className="text-sm font-semibold">{displayName(i.canonical)}</span>
                      <button
                        type="button"
                        aria-label={`Find a product for ${displayName(i.canonical)}`}
                        onClick={() => setSwapKey(i.key)}
                        className={`inline-flex min-h-11 items-center px-2 text-xs font-semibold text-green underline ${focusRing}`}
                      >
                        Find a product
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="mt-4 rounded-2xl border border-line bg-white px-4 py-3">
              <div className="flex items-baseline justify-between">
                <p className="text-sm font-medium">Fred Meyer total</p>
                <p data-testid="fm-total" className="font-heading text-[20px] font-semibold">
                  {formatDollars(fmTotal)}
                </p>
              </div>
              <div className="mt-1.5 flex items-center justify-between">
                <p className="text-sm text-muted">
                  This week{" "}
                  <span data-testid="week-total" className="font-semibold text-ink">
                    {formatDollars(totals.totalCents)}
                  </span>{" "}
                  <span className="text-[13px]">of {formatDollars(household.budget_cents)}</span>
                </p>
                <p className={`rounded-xl px-2.5 py-1 text-[13px] font-semibold ${look.pill}`}>{look.label}</p>
              </div>
            </div>

            <p className="mt-3 text-xs text-muted">
              A new week starts a new list, so Basket may add items again that you didn&apos;t buy last week.
            </p>
            <p className="mb-3 mt-1 text-xs text-muted">Basket never places an order. You check out at Fred Meyer.</p>
          </>
        )}
      </div>

      <div className="mt-auto" />
      <div data-testid="review-bar" className={stickyAboveNav}>
        {sendsFailed && !sends && (
          <div role="alert" className="mb-2 flex items-center justify-between gap-2 text-[13px] font-medium text-[#A6261B]">
            <p>Couldn’t check what’s already in your cart.</p>
            <button type="button" onClick={() => void loadSends()} className={pillButton}>
              Retry
            </button>
          </div>
        )}
        <div
          ref={resultRef}
          tabIndex={-1}
          role="status"
          aria-live="polite"
          data-testid="send-result"
          className={`text-[13px] font-medium text-[#4A544F] outline-none ${outcome ? "mb-2" : ""}`}
        >
          {outcome && (
            <>
            {outcome.kind === "sent" && (
              <>
                <p>Added. Check out in the Fred Meyer app.</p>
                {outcome.rejected.length > 0 && <p className="mt-0.5">Fred Meyer wouldn&apos;t take: {outcome.rejected.join(", ")}.</p>}
                <a
                  href={FRED_MEYER_CART_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`mt-1 inline-flex min-h-11 items-center font-semibold text-green underline ${focusRing}`}
                >
                  Open my Fred Meyer cart
                </a>
              </>
            )}
            {outcome.kind === "unsure" && (
              <>
                <p>{SENT_CHECK_ADVICE}</p>
                {outcome.rejected.length > 0 && (
                  <p className="mt-0.5">Not added: {outcome.rejected.map((r) => r.name).join(", ")}.</p>
                )}
              </>
            )}
            {outcome.kind === "already_sending" && (
              <p>A send for this list is already in progress. Wait a moment, then check the Fred Meyer app.</p>
            )}
            {outcome.kind === "already_sent" && <p>Everything here is already in your cart.</p>}
            {outcome.kind === "not_connected" && <p>Connect Fred Meyer again.</p>}
            {outcome.kind === "rejected" && <p>Fred Meyer wouldn&apos;t take these items. Try swapping them.</p>}
            {outcome.kind === "too_many" && <p>You’ve sent this list a lot today. Try again tomorrow.</p>}
            {outcome.kind === "busy" && <p>Fred Meyer is busy. Try again in a minute.</p>}
            {outcome.kind === "no_answer" && <p>{SENT_CHECK_ADVICE}</p>}
            {outcome.kind === "failed" && <p role="alert" className="text-[#A6261B]">That didn&apos;t go through. Nothing was added.</p>}
            </>
          )}
        </div>
        <button type="button" data-testid="send-cart" disabled={!canSend} aria-disabled={!canSend} onClick={tapSend} className={primaryButton}>
          {label}
        </button>
      </div>

      {asking === "over" && (
        <Sheet label="Over budget" onClose={() => setAsking(null)}>
          <div className="p-5">
            <p className="text-base font-semibold">
              You&apos;re {formatDollars(Math.max(0, totals.totalCents - household.budget_cents))} over your budget. Add to cart anyway?
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                className={primaryButton}
                onClick={() => {
                  setAsking(null);
                  void doSend();
                }}
              >
                Add anyway
              </button>
              <button type="button" className={pillButton} onClick={() => setAsking(null)}>
                Go back
              </button>
            </div>
          </div>
        </Sheet>
      )}

      {asking === "again" && (
        <Sheet label="Send these again" onClose={() => setAsking(null)}>
          <div className="p-5">
            <p className="text-base font-semibold">
              This adds them a second time. Fred Meyer can&apos;t tell Basket what&apos;s already in your cart.
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <button
                type="button"
                className={primaryButton}
                onClick={() => {
                  setAsking(null);
                  if (!payload.retry) setAgain(true);
                  else if (over) setAsking("over");
                  else void doSend();
                }}
              >
                Add again
              </button>
              <button type="button" className={pillButton} onClick={() => setAsking(null)}>
                Cancel
              </button>
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
