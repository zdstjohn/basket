import type { ListItem } from "@/lib/domain/list";
import { formatNeed } from "@/lib/domain/units";
import type { Recommendation } from "@/lib/domain/packages";
import { formatPrice, krogerImageUrl, type PriceRow, type PriceSource } from "@/lib/list/prices";
import { focusRing } from "@/lib/ui";

export const displayName = (canonical: string): string => canonical.charAt(0).toUpperCase() + canonical.slice(1);

/** One thing to buy: a "got it" checkbox, and the rest of the row opens its actions. */
export function ListRow({
  item,
  checked,
  source,
  detail,
  product,
  productMode = false,
  lookingUp = false,
  onToggle,
  onOpen,
}: {
  item: ListItem;
  checked: boolean;
  source: PriceSource | undefined;
  /** For a Fred Meyer shelf price: the product it came from. */
  detail?: PriceRow;
  /** The Fred Meyer products found for this food (product mode only); missing until the search is back. */
  product?: Recommendation;
  /** A Fred Meyer store is chosen: Fred Meyer rows show real products, never a guess. */
  productMode?: boolean;
  /** Fred Meyer is still being searched. */
  lookingUp?: boolean;
  onToggle: (checked: boolean) => void;
  onOpen: () => void;
}) {
  const name = displayName(item.canonical);
  const skipped = item.haveIt;
  const shelf = source === "kroger" && !skipped ? detail : undefined;
  const real = productMode && item.store === "fred_meyer";
  const offer = real && !skipped ? (product?.pick ?? null) : null;
  const photo = krogerImageUrl(offer?.candidate.imageUrl) ?? shelf?.imageUrl ?? null;
  const productName = offer?.candidate.name ?? shelf?.productName ?? null;
  const productLine = offer
    ? offer.candidate.sizeText
      ? `${offer.candidate.name} · ${offer.candidate.sizeText}`
      : offer.candidate.name
    : null;
  const countLine = !offer
    ? null
    : offer.candidate.soldBy === "WEIGHT"
      ? `${offer.count} lb`
      : offer.count === 1
        ? "1 package"
        : `${offer.count} × ${formatPrice(offer.unitCents)}`;
  const noMatch = real && !skipped && product && !product.pick;
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
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element -- a small photo from Kroger; it is hidden if it won't load
          <img
            src={photo}
            alt={productName ?? ""}
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
            {formatNeed(item.parts)}
            {item.alwaysHave ? " · always have" : ""}
            {item.outsideBudget && !skipped ? " · outside budget" : ""}
          </span>
          {productLine ? (
            <span className="mt-px line-clamp-2 text-xs text-muted">{productLine}</span>
          ) : noMatch ? (
            <span className="mt-px block text-xs text-muted">No Fred Meyer match yet</span>
          ) : real && !skipped && !product && lookingUp ? (
            <span className="mt-px block text-xs text-muted">Looking up Fred Meyer…</span>
          ) : (
            shelf?.productName && <span className="mt-px line-clamp-2 text-xs text-muted">{shelf.productName}</span>
          )}
          {real && !skipped && product?.usualMissing && (
            <span className="mt-px block text-xs text-muted">Your usual isn&apos;t on the shelf today</span>
          )}
        </span>
        {!skipped && (
          <span className="flex-none text-right">
            <span data-testid="row-total" className={`block text-sm font-semibold ${checked ? "line-through" : ""}`}>
              {item.estimateCents === null ? "—" : `${offer?.approx ? "about " : ""}${formatPrice(item.estimateCents)}`}
            </span>
            {real ? (
              <>
                {countLine ? (
                  <span data-testid="row-count" className="mt-px block text-xs text-muted">
                    {countLine}
                  </span>
                ) : (
                  source === "user" && <span className="mt-px block text-xs text-muted">your price</span>
                )}
                {offer?.onSale && (
                  <span className="mt-0.5 inline-block rounded-full bg-sale-tint px-1.5 text-[11px] font-semibold text-sale">
                    Sale
                  </span>
                )}
              </>
            ) : (
              <>
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
              </>
            )}
          </span>
        )}
      </button>
    </li>
  );
}
