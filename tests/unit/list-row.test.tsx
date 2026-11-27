// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ListRow } from "@/components/ListRow";
import type { ListItem } from "@/lib/domain/list";
import type { Offer, Recommendation } from "@/lib/domain/packages";
import { formatNeed } from "@/lib/domain/units";
import type { Quantity } from "@/lib/domain/types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});
const render = (el: ReactElement) => act(() => root.render(el));
const q = (sel: string) => host.querySelector<HTMLElement>(sel);

const each = (amount: number): Quantity => ({ amount, kind: "count", base: "each" });
const grams = (amount: number): Quantity => ({ amount, kind: "mass", base: "g" });
const item = (over: Partial<ListItem> = {}): ListItem => ({
  key: "black beans",
  canonical: "black beans",
  qty: each(1),
  parts: [each(1)],
  role: "veg_protein",
  store: "fred_meyer",
  estimateCents: 399,
  haveIt: false,
  alwaysHave: false,
  outsideBudget: false,
  sources: [],
  ...over,
});
const offer = (over: Partial<Offer> = {}, candidate: Partial<Offer["candidate"]> = {}): Offer => ({
  candidate: {
    upc: "1", name: "Simple Truth Organic Black Beans", brand: null, sizeText: "15 oz", size: null, soldBy: "UNIT",
    regularCents: 199, promoCents: null, imageUrl: null, relevant: true, inStock: true, ...candidate,
  },
  count: 1, unitCents: 399, totalCents: 399, onSale: false, approx: false, ...over,
});
const rec = (pick: Offer | null): Recommendation => ({ pick, options: pick ? [pick] : [], cheapestUpc: null, usualMissing: false });
const noop = () => {};
const row = (props: Partial<Parameters<typeof ListRow>[0]> = {}) =>
  render(
    <ul>
      <ListRow item={item()} checked={false} source="kroger" productMode onToggle={noop} onOpen={noop} {...props} />
    </ul>,
  );

describe("ListRow", () => {
  it("says the amount in the same words as formatNeed, one Qty per part", () => {
    const parts = [each(1), grams(200)];
    row({ item: item({ parts, qty: parts[0] }), product: rec(offer()) });
    const amount = [...host.querySelectorAll("span")].find((s) => s.textContent?.startsWith(formatNeed(parts)));
    expect(amount?.textContent).toBe(formatNeed(parts));
  });

  it("keeps the test ids, the flip key and the check's name", () => {
    row({ product: rec(offer()) });
    expect(q('li[data-testid="list-row"]')?.getAttribute("data-flip-key")).toBe("black beans");
    expect(q('input[type="checkbox"]')?.getAttribute("aria-label")).toBe("Got Black beans");
    expect(q('[data-testid="row-total"]')?.textContent).toBe("$3.99");
    expect(q('[data-testid="row-count"]')?.textContent).toBe("1 package");
  });

  it("writes every price with cents, and a package count as count × unit price", () => {
    row({ item: item({ estimateCents: 500 }), product: rec(offer({ count: 2, unitCents: 250, totalCents: 500 })) });
    expect(q('[data-testid="row-total"]')?.textContent).toBe("$5.00");
    expect(q('[data-testid="row-count"]')?.textContent).toBe("2 × $2.50");
    row({ item: item({ estimateCents: 399 }), product: rec(offer({ approx: true }, { soldBy: "WEIGHT" })) });
    expect(q('[data-testid="row-total"]')?.textContent).toBe("about $3.99");
    expect(q('[data-testid="row-count"]')?.textContent).toBe("1 lb");
  });

  it("keeps prices in a column that never wraps", () => {
    row({ product: rec(offer()) });
    expect(q('[data-testid="row-total"]')?.className).toContain("bk-price");
    expect(q('[data-testid="row-total"]')?.parentElement?.className).toContain("whitespace-nowrap");
    expect(q('[data-testid="row-total"]')?.parentElement?.className).toContain("shrink-0");
  });

  it("puts the product picture on a packshot tile only when there is a photo", () => {
    row({ product: rec(offer()) });
    expect(q(".bk-packshot")).toBeNull();
    row({ product: rec(offer({}, { imageUrl: "https://www.kroger.com/product/images/small/front/1" })) });
    expect(q(".bk-packshot img")?.getAttribute("alt")).toBe("Simple Truth Organic Black Beans");
  });

  it("marks a sale in words with a tag, not a pill", () => {
    row({ product: rec(offer({ onSale: true })) });
    expect(host.textContent).toContain("on sale");
    expect(host.textContent).not.toMatch(/\bSale\b/);
    expect(host.querySelector("svg.lucide-tag")).not.toBeNull();
  });

  it("names the price source: estimate, Fred Meyer price, your price", () => {
    row({ productMode: false, source: "ai" });
    expect(host.textContent).toContain("estimate");
    row({ productMode: false, source: "kroger" });
    expect(host.textContent).toContain("Fred Meyer price");
    row({ productMode: false, source: "user" });
    expect(host.textContent).toContain("your price");
  });

  it("has no Swap on the row; a food with no match gets Find a product beside the row button", () => {
    const onFind = vi.fn();
    row({ product: rec(offer()), onFind });
    expect(host.querySelector('[aria-label="Swap Black beans product"]')).toBeNull();
    row({ product: rec(null), onFind, item: item({ estimateCents: null }) });
    expect(host.textContent).toContain("No Fred Meyer match yet");
    expect(q('[data-testid="row-total"]')?.textContent).toBe("—");
    const find = host.querySelector<HTMLButtonElement>('button[aria-label="Find a product for Black beans"]')!;
    expect(find.textContent).toBe("Find a product");
    expect(find.parentElement?.tagName).toBe("LI");
    act(() => find.click());
    expect(onFind).toHaveBeenCalledOnce();
  });

  it("stands a store search in for the price at Amazon and Costco", () => {
    row({ productMode: false, item: item({ store: "amazon", canonical: "corn tortillas", key: "corn tortillas", estimateCents: null }), source: undefined });
    const a = host.querySelector("a")!;
    expect(a.textContent).toBe("Search Amazon");
    expect(a.getAttribute("href")).toBe("https://www.amazon.com/s?k=corn%20tortillas");
    expect(a.getAttribute("target")).toBe("_blank");
    expect(a.getAttribute("rel")).toBe("noopener noreferrer");
    expect(a.parentElement?.tagName).toBe("LI");
    expect(q('[data-testid="row-total"]')).toBeNull();
  });

  it("says the usual is missing with a curly apostrophe", () => {
    row({ product: { ...rec(offer()), usualMissing: true } });
    expect(host.textContent).toContain("Your usual isn’t on the shelf today");
  });
});
