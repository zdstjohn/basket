import type { Quantity } from "@/lib/domain/types";
import { quantityParts } from "@/lib/text/typography";

/** One quantity with real fractions. A need with several parts ("1 + 7 oz") is one <Qty> per part. */
export function Qty({ q }: { q: Quantity }) {
  const { lead, built, rest } = quantityParts(q);
  return (
    <>
      {lead}
      {built !== null && <span className="bk-qty">{built}</span>}
      {rest}
    </>
  );
}
