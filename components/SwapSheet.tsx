"use client";

import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import type { ListItem } from "@/lib/domain/list";
import type { Offer, Recommendation } from "@/lib/domain/packages";
import { formatPrice, krogerImageUrl } from "@/lib/list/prices";
import { focusRing, pillButton, textInput } from "@/lib/ui";

/** The words typed for a search: 2 to 80 letters once trimmed (the database holds the same limit). */
export const validSearchTerm = (t: string): boolean => t.trim().length >= 2 && t.trim().length <= 80;

/** "1 package · $3.99", "2 × $1.25 · $2.50" or, sold by the pound, "about $3.99 · 1 lb". */
export function offerLine(o: Offer): string {
  if (o.candidate.soldBy === "WEIGHT") return `about ${formatPrice(o.totalCents)} · ${o.count} lb`;
  return o.count === 1
    ? `1 package · ${formatPrice(o.totalCents)}`
    : `${o.count} × ${formatPrice(o.unitCents)} · ${formatPrice(o.totalCents)}`;
}

const tag = "inline-block rounded-full px-1.5 text-[11px] font-semibold";

/** Pick another Fred Meyer product for a food, or look for it with other words. */
export function SwapSheet({
  item,
  rec,
  searchTerm,
  usualUpc,
  hasChoice,
  busy,
  onChoose,
  onSearch,
  onReset,
  onClose,
}: {
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
}) {
  const food = item.canonical;
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

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
    } catch {
      setError("That search didn't come back. Your words are saved; we'll try again soon.");
    }
  }

  return (
    <Sheet label={`Swap ${food}`} onClose={onClose}>
      <div className="flex flex-col gap-2 p-4 pb-6">
        <h2 className="px-1 text-lg font-semibold">Swap {food}</h2>

        {rec.options.length === 0 ? (
          <p className="px-1 text-[15px] text-muted">Nothing matched at your Fred Meyer. Try other words.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {rec.options.map((o) => {
              const c = o.candidate;
              const photo = krogerImageUrl(c.imageUrl);
              return (
                <li key={c.upc}>
                  <button
                    type="button"
                    data-testid="swap-option"
                    disabled={!c.inStock || busy}
                    onClick={() => onChoose(c.upc)}
                    className={`flex min-h-14 w-full items-center gap-2.5 rounded-xl border border-line bg-white p-2 text-left disabled:opacity-60 ${focusRing}`}
                  >
                    {photo && (
                      // eslint-disable-next-line @next/next/no-img-element -- a small photo from Kroger; it is hidden if it won't load
                      <img
                        src={photo}
                        alt=""
                        width={40}
                        height={40}
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                        className="size-10 flex-none rounded-lg border border-line bg-white object-contain"
                      />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 block text-sm font-semibold">{c.name}</span>
                      {c.sizeText && <span className="block text-xs text-muted">{c.sizeText}</span>}
                      <span className="block text-xs text-muted">{offerLine(o)}</span>
                      <span className="mt-0.5 flex flex-wrap gap-1">
                        {c.upc === rec.cheapestUpc && c.inStock && (
                          <span className={`${tag} bg-[#E3EFE6] text-[#1F5A33]`}>Cheapest</span>
                        )}
                        {c.upc === usualUpc && <span className={`${tag} border border-line bg-white text-ink`}>Your usual</span>}
                        {!c.inStock && <span className={`${tag} bg-[#EDF0EC] text-[#4A544F]`}>Out of stock</span>}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <form onSubmit={search} className="mt-2 grid gap-2 px-1">
          <label className="grid gap-1 text-[13px] text-muted">
            Search with other words
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={200}
              enterKeyHint="search"
              className={textInput}
            />
          </label>
          {error && (
            <p role="alert" className="text-[13px] font-medium text-[#A6261B]">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy} className={`${pillButton} justify-self-start`}>
            Search
          </button>
        </form>
        {searchTerm && <p className="px-1 text-[13px] text-muted">Searching for &quot;{searchTerm}&quot;</p>}

        {hasChoice && (
          <button type="button" disabled={busy} onClick={onReset} className={`${pillButton} mt-1 justify-self-start`}>
            Back to Basket&apos;s pick
          </button>
        )}
      </div>
    </Sheet>
  );
}
