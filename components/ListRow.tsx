import { Fragment } from "react";
import { ExternalLink, Tag } from "lucide-react";
import { Check } from "@/components/ui/Check";
import { Icon } from "@/components/ui/Icon";
import { Packshot } from "@/components/ui/Packshot";
import { Qty } from "@/components/ui/Qty";
import type { ListItem } from "@/lib/domain/list";
import { formatMoney } from "@/lib/domain/money-input";
import type { Recommendation } from "@/lib/domain/packages";
import type { Quantity } from "@/lib/domain/types";
import { isVague } from "@/lib/domain/units";
import { krogerImageUrl, STORE_NAMES, storeSearchUrl, type PriceRow, type PriceSource } from "@/lib/list/prices";
import { ghostButton, quietLink } from "@/lib/ui";

export const displayName = (canonical: string): string => canonical.charAt(0).toUpperCase() + canonical.slice(1);

/** What a row needs, in kitchen words ("1 + 7.1 oz"), one <Qty> per part. A lone "1 to taste" reads as "to taste". */
export function Need({ parts }: { parts: Quantity[] }) {
  return (
    <>
      {parts.map((p, i) => (
        <Fragment key={i}>
          {i > 0 && " + "}
          {isVague(p) && p.amount === 1 && p.countUnit ? p.countUnit : <Qty q={p} />}
        </Fragment>
      ))}
    </>
  );
}

/** One thing to buy: a "got it" check, and the rest of the row opens its actions. */
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
  onFind,
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
  /** Opens the swap sheet from a row that has no match yet. Swapping a matched product is the first action of the item sheet. */
  onFind?: () => void;
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
        : `${offer.count} × ${formatMoney(offer.unitCents)}`;
  const noMatch = real && !skipped && product && !product.pick;
  // Amazon and Costco never guess a price: until you type one, a link to their search stands in for it.
  const searchStore = item.store === "amazon" || item.store === "costco" ? item.store : null;
  const searchLink = searchStore && !skipped && source !== "user" ? searchStore : null;
  const onSale = real ? !!offer?.onSale : source === "kroger" && !!shelf?.onSale;
  const sourceWord = real
    ? source === "user" && !countLine
      ? { text: "your price", tone: "text-ink-soft" }
      : null
    : source === "user"
      ? { text: "your price", tone: "text-ink-soft" }
      : source === "kroger"
        ? { text: "Fred Meyer price", tone: "text-price" }
        : source === "ai"
          ? { text: "estimate", tone: "text-estimate" }
          : { text: "no price yet", tone: "text-ink-soft" };
  // A checked row's text eases to ink-soft; the line itself is the name's overlay (.bk-strike), not text-decoration.
  const dim = checked ? "text-ink-soft" : "";
  return (
    <li
      data-testid="list-row"
      data-checked={checked ? "true" : undefined}
      data-flip-key={item.key}
      className="flex min-h-13 items-center gap-2 border-b border-line"
    >
      <span className="-ml-3 shrink-0">
        <Check label={`Got ${name}`} checked={checked} onChange={onToggle} />
      </span>
      <button type="button" onClick={onOpen} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 py-2 text-left">
        <Packshot src={photo} alt={productName ?? ""} />
        <span className="min-w-0 flex-1">
          <span className="relative inline-block max-w-full align-top text-small font-semibold">
            <span className={`line-clamp-2 block transition-colors duration-[var(--bk-dur-base)] ease-out ${dim}`}>{name}</span>
            <span aria-hidden="true" data-testid="strike" data-on={checked ? "" : undefined} className="bk-strike line-clamp-2">
              {name}
            </span>
          </span>
          <span className="block text-label text-ink-soft">
            <Need parts={item.parts} />
            {item.alwaysHave ? " · always have" : ""}
            {item.outsideBudget && !skipped ? " · outside budget" : ""}
          </span>
          {productLine ? (
            <span className="line-clamp-1 block text-label text-ink-soft">{productLine}</span>
          ) : noMatch ? (
            <span className="block text-label text-ink-soft">No Fred Meyer match yet</span>
          ) : real && !skipped && !product && lookingUp ? (
            <span className="block text-label text-ink-soft">Looking up Fred Meyer…</span>
          ) : (
            shelf?.productName && <span className="line-clamp-1 block text-label text-ink-soft">{shelf.productName}</span>
          )}
          {real && !skipped && product?.usualMissing && (
            <span className="block text-label text-ink">Your usual isn’t on the shelf today</span>
          )}
        </span>
        {!skipped && !searchLink && (
          <span className="shrink-0 whitespace-nowrap text-right">
            <span data-testid="row-total" className={`bk-price block text-small font-semibold transition-colors duration-[var(--bk-dur-base)] ease-out ${dim}`}>
              {item.estimateCents === null ? "—" : `${offer?.approx ? "about " : ""}${formatMoney(item.estimateCents)}`}
            </span>
            {countLine && (
              <span data-testid="row-count" className="bk-price block text-label text-ink-soft">
                {countLine}
              </span>
            )}
            {sourceWord && <span className={`block text-label ${sourceWord.tone}`}>{sourceWord.text}</span>}
            {onSale && (
              <span className="inline-flex items-center gap-1 text-label text-sale">
                <Icon icon={Tag} size={18} />
                on sale
              </span>
            )}
          </span>
        )}
      </button>
      {searchLink && (
        <a
          href={storeSearchUrl(searchLink, item.canonical)}
          target="_blank"
          rel="noopener noreferrer"
          className={`${quietLink} shrink-0`}
        >
          Search {STORE_NAMES[searchLink]}
          <Icon icon={ExternalLink} size={18} />
        </a>
      )}
      {onFind && noMatch && (
        <button type="button" onClick={onFind} aria-label={`Find a product for ${name}`} className={`${ghostButton} shrink-0`}>
          Find a product
        </button>
      )}
    </li>
  );
}
