import { displayName } from "@/components/ListRow";
import type { CartLine } from "@/lib/domain/cart";
import type { ListItem } from "@/lib/domain/list";
import type { Offer } from "@/lib/domain/packages";
import { formatPrice, krogerImageUrl } from "@/lib/list/prices";
import { focusRing } from "@/lib/ui";

const action = `inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl px-2 text-xs font-semibold text-green underline ${focusRing}`;
const step = `inline-flex size-11 items-center justify-center rounded-full border border-[#D5DBD5] bg-white text-lg font-semibold text-ink disabled:text-muted ${focusRing}`;

/** One product that will go to the Fred Meyer cart: what it is, how many, what it costs, and the two ways to change it. */
export function ReviewLine({
  line,
  item,
  pick,
  ownCount,
  chip,
  busy,
  onCount,
  onSwap,
  onHave,
}: {
  line: CartLine;
  /** The first food that picked this product. */
  item: ListItem;
  pick: Offer;
  /** How many packages that food alone asks for (a line made of two foods adds both). */
  ownCount: number;
  /** What the last send said about this line, if anything. */
  chip?: "sent" | "not_added";
  busy: boolean;
  onCount: (count: number) => void;
  onSwap: () => void;
  onHave: () => void;
}) {
  const food = displayName(item.canonical);
  const photo = krogerImageUrl(pick.candidate.imageUrl);
  const unit = pick.candidate.soldBy === "WEIGHT" ? " lb" : "";
  return (
    <li data-testid="review-line" data-upc={line.upc} className="border-b border-[#E8EBE7] py-2.5">
      <div className="flex items-start gap-2">
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element -- a small photo from Kroger; it is hidden if it won't load
          <img
            src={photo}
            alt={line.name}
            width={48}
            height={48}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
            className="size-12 flex-none rounded-lg border border-line bg-white object-contain"
          />
        )}
        <div className="min-w-0 flex-1">
          <p data-testid="review-name" className="line-clamp-2 text-sm font-semibold">
            {line.name}
          </p>
          {pick.candidate.sizeText && <p className="mt-px text-xs text-muted">{pick.candidate.sizeText}</p>}
          <p className="mt-px text-xs text-muted">For {food}</p>
          {chip === "sent" && <p className="mt-0.5 text-xs font-semibold text-green">Sent</p>}
          {chip === "not_added" && <p className="mt-0.5 text-xs font-semibold text-[#A6261B]">Not added</p>}
        </div>
        <p data-testid="review-total" className="flex-none text-sm font-semibold">
          {formatPrice(line.cents)}
        </p>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-0">
        <button
          type="button"
          aria-label={`One fewer ${line.name}`}
          disabled={busy || ownCount <= 1}
          onClick={() => onCount(ownCount - 1)}
          className={step}
        >
          −
        </button>
        <span data-testid="review-count" aria-live="polite" className="min-w-8 text-center text-sm font-semibold">
          {line.quantity}
          {unit}
        </span>
        <button
          type="button"
          aria-label={`One more ${line.name}`}
          disabled={busy || ownCount >= 99}
          onClick={() => onCount(ownCount + 1)}
          className={step}
        >
          +
        </button>
        <span className="flex-1" />
        <button type="button" onClick={onSwap} aria-label={`Swap ${line.name}`} disabled={busy} className={action}>
          Swap
        </button>
        <button type="button" onClick={onHave} aria-label={`I have it: ${food}`} disabled={busy} className={action}>
          I have it
        </button>
      </div>
    </li>
  );
}
