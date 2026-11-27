"use client";

import { useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { Sheet, useSheetClose } from "@/components/Sheet";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/Field";
import { Icon } from "@/components/ui/Icon";
import { Packshot } from "@/components/ui/Packshot";
import { Loading } from "@/components/ui/states";
import { formatMoney } from "@/lib/domain/money-input";
import type { ListItem } from "@/lib/domain/list";
import type { Offer, Recommendation } from "@/lib/domain/packages";
import { searchMessage } from "@/lib/list/match-requests";
import { krogerImageUrl } from "@/lib/list/prices";
import { quietLink } from "@/lib/ui";

/** The words typed for a search: 2 to 80 letters once trimmed (the database holds the same limit). */
export const validSearchTerm = (t: string): boolean => t.trim().length >= 2 && t.trim().length <= 80;

/** "1 package · $3.99", "2 × $1.25 · $2.50" or, sold by the pound, "about $3.99 · 1 lb". */
export function offerLine(o: Offer): string {
  if (o.candidate.soldBy === "WEIGHT") return `about ${formatMoney(o.totalCents)} · ${o.count} lb`;
  return o.count === 1
    ? `1 package · ${formatMoney(o.totalCents)}`
    : `${o.count} × ${formatMoney(o.unitCents)} · ${formatMoney(o.totalCents)}`;
}

type Props = {
  item: ListItem;
  rec: Recommendation;
  /** The household's own search words for this food, if any. */
  searchTerm: string | null;
  /** The product the household chose for this food, if any. */
  usualUpc: string | null;
  /** The household has a saved choice (a product or search words) for this food. */
  hasChoice: boolean;
  busy: boolean;
  onChoose: (upc: string) => void;
  onSearch: (term: string) => Promise<void>;
  onReset: () => void;
  onClose: () => void;
};

/** Pick another Fred Meyer product for a food, or look for it with other words. */
export function SwapSheet(props: Props) {
  const food = props.item.canonical;
  return (
    <Sheet label={`Swap ${food}`} title={`Swap ${food}`} onClose={props.onClose}>
      <SwapBody {...props} />
    </Sheet>
  );
}

function SwapBody({
  rec,
  searchTerm,
  usualUpc,
  hasChoice,
  busy,
  onChoose,
  onSearch,
  onReset,
}: Props) {
  const close = useSheetClose();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Once a choice is made the sheet keeps showing what it showed while it leaves, and further taps do nothing.
  const [leaving, setLeaving] = useState<Recommendation | null>(null);
  const shown = leaving ?? rec;
  const chosenUpc = shown.pick?.candidate.upc ?? null;
  const leave = (act: () => void) => {
    if (leaving) return;
    setLeaving(rec);
    act();
    close();
  };

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!validSearchTerm(text)) {
      setError("Use 2 to 80 letters.");
      return;
    }
    setError(null);
    try {
      await onSearch(text.trim());
      setText("");
    } catch (err) {
      // The typed words stay in the field. "Saved" is said only when the save went through.
      setError(searchMessage(err));
    }
  }

  return (
    <div className="flex flex-col gap-3 px-4 pb-4">
      <Loading label={busy ? "Loading" : ""} />
      {shown.options.length === 0 ? (
        <p className="text-body text-ink">Nothing matched at your Fred Meyer. Try other words.</p>
      ) : (
        <ul className="divide-y divide-line border-y border-line">
          {shown.options.map((o) => {
            const c = o.candidate;
            const chosen = c.upc === chosenUpc;
            return (
              <li key={c.upc}>
                <button
                  type="button"
                  data-testid="swap-option"
                  aria-current={chosen ? "true" : undefined}
                  disabled={!c.inStock || busy || !!leaving}
                  onClick={() => leave(() => onChoose(c.upc))}
                  className={`flex min-h-16 w-full items-center gap-3 py-2 text-left bk-press ${c.inStock ? "" : "opacity-45"}`}
                >
                  {krogerImageUrl(c.imageUrl) ? (
                    <Packshot src={krogerImageUrl(c.imageUrl)} alt="" size={64} />
                  ) : (
                    <span aria-hidden="true" className="bk-packshot block size-16 shrink-0" style={{ "--bk-packshot-radius": "var(--radius-md)" } as React.CSSProperties} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="flex items-start gap-1">
                      <span className="line-clamp-2 block flex-1 text-small font-semibold text-ink">{c.name}</span>
                      {chosen && <Icon icon={Check} className="mt-0.5 text-ink" />}
                    </span>
                    {c.sizeText && <span className="block text-label text-ink-soft">{c.sizeText}</span>}
                    <span className="flex flex-wrap gap-x-2 text-label font-semibold">
                      {c.upc === shown.cheapestUpc && c.inStock && <span className="text-ink">Cheapest</span>}
                      {c.upc === usualUpc && <span className="text-ink">Your usual</span>}
                      {!c.inStock && <span className="font-semibold text-ink-soft">Out of stock</span>}
                    </span>
                  </span>
                  <span data-testid="swap-price" className="bk-price shrink-0 whitespace-nowrap text-right text-label text-ink-soft">{offerLine(o)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <form onSubmit={search} className="grid gap-2">
        <TextField
          label="Search with other words"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={200}
          enterKeyHint="search"
          error={error ?? undefined}
        />
        <Button variant="ghost" type="submit" disabled={busy} className="justify-self-start">
          Search
        </Button>
      </form>
      {searchTerm && <p className="text-small text-ink-soft">Searching for “{searchTerm}”</p>}

      {hasChoice && (
        <button type="button" disabled={busy || !!leaving} onClick={() => leave(onReset)} className={`${quietLink} justify-self-start`}>
          Back to Basket’s pick
          <Icon icon={ChevronRight} />
        </button>
      )}
    </div>
  );
}
