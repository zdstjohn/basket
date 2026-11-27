"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { displayName } from "@/components/ListRow";
import type { ListItem, Store } from "@/lib/domain/list";
import { parseMoneyToCents } from "@/lib/domain/money-input";
import { formatNeed } from "@/lib/domain/units";
import { STORES, STORE_NAMES } from "@/lib/list/prices";
import { focusRing, textInput } from "@/lib/ui";

const action = `flex min-h-12 w-full items-center rounded-xl px-3.5 text-left text-[15px] font-medium text-ink hover:bg-[#F3F5F2] ${focusRing}`;

/** What you can do with one item: skip it, move it, price it, or leave it out of the budget. */
export function ListSheet({
  item,
  onClose,
  onHave,
  onMove,
  onPrice,
  onBudget,
}: {
  item: ListItem;
  onClose: () => void;
  onHave: (have: boolean) => void;
  onMove: (store: Store) => void;
  onPrice: (cents: number) => Promise<void>;
  onBudget: (outside: boolean) => void;
}) {
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
    } catch {
      setError("That didn't save. Try again.");
      setSaving(false);
    }
  }

  return (
    <Sheet label={name} onClose={onClose}>
      <div className="flex flex-col gap-1 p-4 pb-6">
        <div className="px-3.5 pb-2">
          <h2 className="text-lg font-semibold">{name}</h2>
          <p className="text-[13px] text-muted">
            {formatNeed(item.parts)} · {STORE_NAMES[item.store]}
          </p>
        </div>

        {view === "menu" ? (
          <>
            {item.alwaysHave ? (
              <p className="px-3.5 pb-1 text-[13px] text-muted">
                It&apos;s on your always-have list. Take it off in Household to buy it.
              </p>
            ) : (
              <button type="button" className={action} onClick={() => onHave(!item.haveIt)}>
                {item.haveIt ? "I need it" : "I have it"}
              </button>
            )}
            {STORES.filter((s) => s !== item.store).map((s) => (
              <button key={s} type="button" className={action} onClick={() => onMove(s)}>
                Move to {STORE_NAMES[s]}
              </button>
            ))}
            <button type="button" className={action} onClick={() => setView("price")}>
              Set price
            </button>
            <button type="button" className={action} onClick={() => onBudget(!item.outsideBudget)}>
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
    </Sheet>
  );
}
