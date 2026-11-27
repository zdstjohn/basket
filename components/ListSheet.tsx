"use client";

import { useState } from "react";
import { Sheet, useSheetClose } from "@/components/Sheet";
import { displayName } from "@/components/ListRow";
import type { ListItem, Store } from "@/lib/domain/list";
import { parseMoneyToCents } from "@/lib/domain/money-input";
import { formatNeed } from "@/lib/domain/units";
import { STORES, STORE_NAMES } from "@/lib/list/prices";
import { focusRing, textInput } from "@/lib/ui";

const action = `flex min-h-12 w-full items-center rounded-xl px-3.5 text-left text-[15px] font-medium text-ink hover:bg-[#F3F5F2] ${focusRing}`;

type Props = {
  item: ListItem;
  /** Called once the sheet has finished closing, however it was closed. */
  onClose: () => void;
  onHave: (have: boolean) => void;
  onMove: (store: Store) => void;
  /** Saves the price; throws when it can't. The sheet closes itself after a save that went through. */
  onPrice: (cents: number) => Promise<void>;
  onBudget: (outside: boolean) => void;
  /** Opens the product swap once this sheet has closed. */
  onSwap?: () => void;
  /** The row has a Fred Meyer product that can be swapped. */
  canSwap?: boolean;
  /** A Fred Meyer product sets the price, so there is nothing to type. */
  hasProduct?: boolean;
};

/** What you can do with one item: swap its product, skip it, move it, price it, or leave it out of the budget. */
export function ListSheet(props: Props) {
  const name = displayName(props.item.canonical);
  return (
    <Sheet label={name} title={name} onClose={props.onClose}>
      <ListSheetBody {...props} />
    </Sheet>
  );
}

function ListSheetBody(props: Props) {
  const close = useSheetClose();
  // Once an action is chosen the sheet keeps showing what it showed, so the labels don't flip while it leaves.
  const [leaving, setLeaving] = useState<Pick<Props, "item" | "hasProduct" | "canSwap"> | null>(null);
  const { onHave, onMove, onPrice, onBudget, onSwap } = props;
  const { item, hasProduct = false, canSwap = false } = leaving ?? props;
  const go = (act: () => void) => {
    setLeaving({ item: props.item, hasProduct: props.hasProduct, canSwap: props.canSwap });
    act();
    close();
  };
  const name = displayName(item.canonical);
  const [view, setView] = useState<"menu" | "price">("menu");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function savePrice(e: React.FormEvent) {
    e.preventDefault();
    const cents = parseMoneyToCents(text);
    if (cents === null) {
      setError("Enter an amount like $3.00.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onPrice(cents);
      close();
    } catch {
      setError("That didn't save. Try again.");
      setSaving(false);
    }
  }

  return (
    <>
      <div className="flex flex-col gap-1 p-4 pb-6">
        <div className="px-3.5 pb-2">
          <p className="text-[13px] text-muted">
            {formatNeed(item.parts)} · {STORE_NAMES[item.store]}
          </p>
        </div>

        {view === "menu" ? (
          <>
            {canSwap && onSwap && (
              <button type="button" aria-label={`Swap ${name} product`} className={action} onClick={() => go(onSwap)}>
                Swap
              </button>
            )}
            {item.alwaysHave ? (
              <p className="px-3.5 pb-1 text-[13px] text-muted">
                It&apos;s on your always-have list. Take it off in Household to buy it.
              </p>
            ) : (
              <button type="button" className={action} onClick={() => go(() => onHave(!item.haveIt))}>
                {item.haveIt ? "I need it" : "I have it"}
              </button>
            )}
            {STORES.filter((s) => s !== item.store).map((s) => (
              <button key={s} type="button" className={action} onClick={() => go(() => onMove(s))}>
                Move to {STORE_NAMES[s]}
              </button>
            ))}
            {!hasProduct && (
              <button type="button" className={action} onClick={() => setView("price")}>
                Set price
              </button>
            )}
            <button type="button" className={action} onClick={() => go(() => onBudget(!item.outsideBudget))}>
              {item.outsideBudget ? "Count in budget" : "Leave out of budget"}
            </button>
          </>
        ) : (
          <form onSubmit={savePrice} className="grid gap-2 px-3.5">
            <label className="grid gap-1 text-[13px] text-muted">
              Price
              <input
                autoFocus
                inputMode="decimal"
                placeholder="$0.00"
                value={text}
                onChange={(e) => setText(e.target.value)}
                className={textInput}
              />
            </label>
            <p className="text-xs text-muted">The total for {formatNeed(item.parts)}.</p>
            {error && (
              <p role="alert" className="text-[13px] font-medium text-[#A6261B]">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={saving}
              className={`inline-flex h-12 items-center justify-center rounded-full bg-green text-[15px] font-semibold text-white disabled:opacity-60 ${focusRing}`}
            >
              Save price
            </button>
            <button type="button" onClick={() => setView("menu")} className={action}>
              Back
            </button>
          </form>
        )}
      </div>
    </>
  );
}
