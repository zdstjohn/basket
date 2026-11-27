// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RollingNumber } from "@/components/RollingNumber";
import { BudgetSentence } from "@/components/BudgetSentence";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
function setReduced(on: boolean) {
  window.matchMedia = vi.fn().mockImplementation((q: string) => ({ matches: on && q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} })) as never;
}
const show = (v: string, d: "up" | "down" = "up") =>
  act(() => root.render(<RollingNumber value={v} direction={d} testId="t" />));
const cols = () => host.querySelectorAll(".bk-roll");
const live = () => host.querySelector('[data-testid="t"]') as HTMLElement;

beforeEach(() => {
  setReduced(false);
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe("RollingNumber", () => {
  it("first render has no columns and the live span is the value", () => {
    show("$168.00");
    expect(cols().length).toBe(0);
    expect(live().textContent).toBe("$168.00");
    expect(live().getAttribute("aria-live")).toBe("polite");
  });
  it("rolls two digits and the live span updates once", () => {
    show("$168.00");
    show("$172.00");
    expect(cols().length).toBe(2);
    expect(live().textContent).toBe("$172.00");
    expect(host.querySelector('[aria-hidden="true"]')).not.toBeNull();
    expect(host.querySelector('[aria-hidden="true"]')!.contains(live())).toBe(false);
  });
  it("a new leading digit adds a column", () => {
    show("$98.50");
    show("$104.50");
    expect(cols().length).toBe(3);
  });
  it("rolls delays digits 30ms each from the right", () => {
    show("$168.00");
    show("$172.00");
    const delays = [...cols()].map((c) => (c.firstElementChild as HTMLElement).style.transitionDelay);
    expect(delays).toEqual(["30ms", "0ms"]);
  });
  it("reduced motion: no columns, visible digits are the new value", () => {
    setReduced(true);
    show("$168.00");
    show("$172.00");
    expect(cols().length).toBe(0);
    expect(host.querySelector('[aria-hidden="true"]')!.textContent).toBe("$172.00");
    expect(live().textContent).toBe("$172.00");
  });
  it("successive changes in the same direction each roll with fresh columns", () => {
    show("$168.00");
    show("$172.00");
    const first = [...cols()];
    show("$176.00");
    const second = [...cols()];
    expect(second.length).toBe(1);
    expect(first.some((c) => second.includes(c))).toBe(false);
  });
  it("same value again does not roll", () => {
    show("$168.00");
    show("$168.00");
    expect(cols().length).toBe(0);
  });
});

describe("BudgetSentence", () => {
  const render = (cents: number, exact = true, cushion = 2500) =>
    act(() => root.render(<BudgetSentence totalCents={cents} targetCents={20000} cushionCents={cushion} exact={exact} totalTestId="bt" />));
  it("reads as one sentence under budget", () => {
    render(16800, false);
    const s = host.querySelector('section[aria-label="Budget"]')!;
    expect(s.textContent).toContain("In the basket so far: ");
    expect(s.textContent).toContain("$168.00");
    expect(s.textContent).toContain("$32 left, plus $25 wiggle room if you need it.");
    expect(s.textContent).toContain("Estimated total, for the amounts you’ll use");
    expect(host.querySelector('[data-testid="bt"]')!.textContent).toBe("$168.00");
  });
  it("past: the amount is sale-colored, no caveat when exact", () => {
    render(23600);
    expect(host.querySelector(".text-sale")!.textContent).toBe("$11");
    expect(host.textContent).not.toContain("Estimated total");
  });
});
