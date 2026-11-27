"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Sheet, useSheetClose } from "@/components/Sheet";
import { displayName, Need } from "@/components/ListRow";
import { offerLine } from "@/components/SwapSheet";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Packshot } from "@/components/ui/Packshot";
import type { ListItem, Store } from "@/lib/domain/list";
import { parseMoneyToCents } from "@/lib/domain/money-input";
import type { Offer } from "@/lib/domain/packages";
import { STORES, STORE_NAMES, krogerImageUrl } from "@/lib/list/prices";

/** An action: a 48 px row split from the next by a hairline, with a chevron. */
const action = "flex min-h-12 w-full items-center justify-between gap-3 py-2 text-left text-body text-ink bk-press";

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
  /** The row has no Fred Meyer match yet: the same swap sheet is where to look for one. */
  canFind?: boolean;
  /** The chosen Fred Meyer product, shown at the top. */
  product?: Offer | null;
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
  const [leaving, setLeaving] = useState<Pick<Props, "item" | "hasProduct" | "canSwap" | "canFind" | "product"> | null>(null);
  const { onHave, onMove, onPrice, onBudget, onSwap } = props;
  const { item, hasProduct = false, canSwap = false, canFind = false, product = null } = leaving ?? props;
  const go = (act: () => void) => {
    setLeaving({ item: props.item, hasProduct: props.hasProduct, canSwap: props.canSwap, canFind: props.canFind, product: props.product });
    act();
    close();
  };
  const [view, setView] = useState<"menu" | "price">("menu");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const name = displayName(item.canonical);
  const photo = krogerImageUrl(product?.candidate.imageUrl);

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
      setError("That didn’t save. Try again.");
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 px-4 pb-4">
      <p className="text-small text-ink-soft">
        <Need parts={item.parts} /> · {STORE_NAMES[item.store]}
      </p>

      {view === "menu" ? (
        <>
          {product && (
            <div className="flex items-center gap-3 py-2">
              <Packshot src={photo} alt={product.candidate.name} size={64} />
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-small font-semibold text-ink">{product.candidate.name}</p>
                {product.candidate.sizeText && <p className="text-label text-ink-soft">{product.candidate.sizeText}</p>}
                <p className="bk-price whitespace-nowrap text-label text-ink-soft">{offerLine(product)}</p>
              </div>
            </div>
          )}
          <div className="divide-y divide-line border-y border-line">
            {canSwap && onSwap && (
              <button type="button" aria-label={`Swap ${name} product`} className={action} onClick={() => go(onSwap)}>
                Swap
                <Icon icon={ChevronRight} className="text-ink-soft" />
              </button>
            )}
            {canFind && onSwap && (
              <button type="button" className={action} onClick={() => go(onSwap)}>
                Find a product
                <Icon icon={ChevronRight} className="text-ink-soft" />
              </button>
            )}
            {item.alwaysHave ? (
              <p className="py-3 text-small text-ink-soft">It’s on your always-have list. Take it off in Household to buy it.</p>
            ) : (
              <button type="button" className={action} onClick={() => go(() => onHave(!item.haveIt))}>
                {item.haveIt ? "I need it" : "I have it"}
                <Icon icon={ChevronRight} className="text-ink-soft" />
              </button>
            )}
            {STORES.filter((s) => s !== item.store).map((s) => (
              <button key={s} type="button" className={action} onClick={() => go(() => onMove(s))}>
                Move to {STORE_NAMES[s]}
                <Icon icon={ChevronRight} className="text-ink-soft" />
              </button>
            ))}
            {!hasProduct && (
              <button type="button" className={action} onClick={() => setView("price")}>
                Set price
                <Icon icon={ChevronRight} className="text-ink-soft" />
              </button>
            )}
            <button type="button" className={action} onClick={() => go(() => onBudget(!item.outsideBudget))}>
              {item.outsideBudget ? "Count in budget" : "Leave out of budget"}
              <Icon icon={ChevronRight} className="text-ink-soft" />
            </button>
          </div>
        </>
      ) : (
        <form onSubmit={savePrice} className="grid gap-3">
          <TextField
            label="Price"
            autoFocus
            inputMode="decimal"
            placeholder="$0.00"
            value={text}
            onChange={(e) => setText(e.target.value)}
            error={error ?? undefined}
          />
          <p className="text-small text-ink-soft">
            The total for <Need parts={item.parts} />.
          </p>
          <Button variant="main" type="submit" busy={saving}>
            Save price
          </Button>
          <Button variant="ghost" onClick={() => setView("menu")}>
            Back
          </Button>
        </form>
      )}
    </div>
  );
}
