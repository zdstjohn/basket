import type { ListItem } from "@/lib/domain/list";
import { formatQuantity } from "@/lib/domain/units";
import { formatPrice, type PriceRow, type PriceSource } from "@/lib/list/prices";
import { focusRing } from "@/lib/ui";

export const displayName = (canonical: string): string => canonical.charAt(0).toUpperCase() + canonical.slice(1);

/** One thing to buy: a "got it" checkbox, and the rest of the row opens its actions. */
export function ListRow({
  item,
  checked,
  source,
  detail,
  onToggle,
  onOpen,
}: {
  item: ListItem;
  checked: boolean;
  source: PriceSource | undefined;
  /** For a Fred Meyer shelf price: the product it came from. */
  detail?: PriceRow;
  onToggle: (checked: boolean) => void;
  onOpen: () => void;
}) {
  const name = displayName(item.canonical);
  const skipped = item.haveIt;
  const shelf = source === "kroger" && !skipped ? detail : undefined;
  return (
    <li
      data-testid="list-row"
      data-checked={checked ? "true" : undefined}
      className="flex min-h-[52px] items-center border-b border-[#E8EBE7]"
    >
      <label className="-ml-3 flex size-11 shrink-0 items-center justify-center">
        <input
          type="checkbox"
          aria-label={`Got ${name}`}
          checked={checked}
          onChange={(e) => onToggle(e.target.checked)}
          className={`size-5 accent-green ${focusRing}`}
        />
      </label>
      <button
        type="button"
        onClick={onOpen}
        className={`flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg py-1.5 text-left ${focusRing} ${
          checked ? "opacity-60" : ""
        }`}
      >
        {shelf?.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element -- a small photo from Kroger; it is hidden if it won't load
          <img
            src={shelf.imageUrl}
            alt={shelf.productName ?? ""}
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
          <span className={`block text-sm font-semibold ${checked ? "line-through" : ""}`}>{name}</span>
          <span className="mt-px block text-xs text-muted">
            {formatQuantity(item.qty)}
            {item.alwaysHave ? " · always have" : ""}
            {item.outsideBudget && !skipped ? " · outside budget" : ""}
          </span>
          {shelf?.productName && <span className="mt-px line-clamp-2 text-xs text-muted">{shelf.productName}</span>}
        </span>
        {!skipped && (
          <span className="flex-none text-right">
            <span className={`block text-sm font-semibold ${checked ? "line-through" : ""}`}>
              {item.estimateCents === null ? "—" : formatPrice(item.estimateCents)}
            </span>
            <span className="mt-px block text-xs text-muted">
              {source === "user"
                ? "your price"
                : source === "kroger"
                  ? "Fred Meyer price"
                  : source === "ai"
                    ? "estimate"
                    : "no price yet"}
            </span>
            {source === "kroger" && shelf?.onSale && (
              <span className="mt-0.5 inline-block rounded-full bg-sale-tint px-1.5 text-[11px] font-semibold text-sale">
                Sale
              </span>
            )}
          </span>
        )}
      </button>
    </li>
  );
}
