import { Check, TriangleAlert } from "lucide-react";
import { displayName } from "@/components/ListRow";
import { Icon } from "@/components/ui/Icon";
import { Packshot } from "@/components/ui/Packshot";
import { Stepper } from "@/components/ui/Stepper";
import type { CartLine } from "@/lib/domain/cart";
import type { ListItem } from "@/lib/domain/list";
import type { Offer } from "@/lib/domain/packages";
import { formatMoney } from "@/lib/domain/money-input";
import { krogerImageUrl } from "@/lib/list/prices";
import { ghostButton } from "@/lib/ui";

const MAX = 99;

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
  // The stepper shows the line's total; a tap moves this food's own count by one (a line made of two foods adds both).
  const min = line.quantity - (ownCount - 1);
  const max = line.quantity + (MAX - ownCount);
  return (
    <li data-testid="review-line" data-upc={line.upc} className="py-3">
      <div className="flex items-start gap-3">
        <Packshot src={photo} alt={line.name} size={64} />
        <div className="min-w-0 flex-1">
          <p data-testid="review-name" className="line-clamp-2 text-small font-semibold text-ink">
            {line.name}
          </p>
          {pick.candidate.sizeText && <p className="text-label text-ink-soft">{pick.candidate.sizeText}</p>}
          <p className="text-label text-ink-soft">For {food}</p>
          {chip === "sent" && (
            <p className="mt-1 flex items-center gap-1 text-label font-semibold text-ink">
              <Icon icon={Check} size={18} />
              Sent
            </p>
          )}
          {chip === "not_added" && (
            <p className="mt-1 flex items-center gap-1 text-label font-semibold text-error">
              <Icon icon={TriangleAlert} size={18} />
              Not added
            </p>
          )}
        </div>
        <p data-testid="review-total" className="bk-price shrink-0 whitespace-nowrap text-small font-semibold text-ink">
          {formatMoney(line.cents)}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-2">
        <span data-testid="review-count" className="inline-flex items-center gap-1 text-small text-ink">
          <Stepper
            value={line.quantity}
            min={min}
            max={max}
            fewerLabel={`One fewer ${line.name}`}
            moreLabel={`One more ${line.name}`}
            onChange={(n) => {
              if (busy) return;
              onCount(n > line.quantity ? ownCount + 1 : ownCount - 1);
            }}
          />
          {unit}
        </span>
        <button type="button" onClick={onSwap} aria-label={`Swap ${line.name}`} disabled={busy} className={ghostButton}>
          Swap
        </button>
        <button type="button" onClick={onHave} aria-label={`I have it: ${food}`} disabled={busy} className={ghostButton}>
          I have it
        </button>
      </div>
    </li>
  );
}
