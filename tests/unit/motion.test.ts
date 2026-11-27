// @vitest-environment jsdom
import { createElement, useRef } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { DUR, prefersReducedMotion } from "@/lib/motion/motion";
import { tick } from "@/lib/motion/haptics";
import { shouldDismiss, velocity } from "@/lib/motion/sheet-gesture";
import { rollDigits, rollDirection } from "@/lib/motion/roll";
import { morph, supportsViewTransitions } from "@/lib/motion/view-transition";
import { invert, useFlipList } from "@/lib/motion/flip";
import { markSettle, newlyFilled, SETTLE_KEY, takeSettle } from "@/lib/motion/settle";

describe("motion basics", () => {
  it("has the durations", () => {
    expect(DUR).toEqual({ fast: 120, base: 240, slow: 400, snap: 370, settle: 560 });
  });
  it("reads reduced motion", () => {
    expect(prefersReducedMotion({ matchMedia: () => ({ matches: true }) as MediaQueryList })).toBe(true);
    expect(prefersReducedMotion({ matchMedia: () => ({ matches: false }) as MediaQueryList })).toBe(false);
    expect(prefersReducedMotion({} as Window)).toBe(false);
  });
});

describe("haptics", () => {
  it("ticks only where vibrate exists, and never throws", () => {
    expect(tick(undefined)).toBe(false);
    expect(tick({})).toBe(false);
    const v = vi.fn(() => true);
    expect(tick({ vibrate: v })).toBe(true);
    expect(v).toHaveBeenCalledWith(8);
    expect(tick({ vibrate() { throw new Error("no"); } })).toBe(false);
  });
});

describe("sheet gesture", () => {
  it("decides dismissal", () => {
    expect(shouldDismiss(100, 600, 0.1)).toBe(false);
    expect(shouldDismiss(181, 600, 0)).toBe(true);
    expect(shouldDismiss(20, 600, 0.51)).toBe(true);
    expect(shouldDismiss(20, 600, -0.9)).toBe(false);
  });
  it("measures velocity over the last 100 ms", () => {
    expect(velocity([{ t: 0, y: 0 }, { t: 50, y: 40 }, { t: 100, y: 80 }])).toBeCloseTo(0.8);
    expect(velocity([{ t: 0, y: 0 }, { t: 500, y: 0 }, { t: 550, y: 10 }])).toBeCloseTo(0.2);
    expect(velocity([])).toBe(0);
    expect(velocity([{ t: 0, y: 5 }])).toBe(0);
  });
});

describe("roll", () => {
  it("rolls only changed digits, staggered from the right", () => {
    const r = rollDigits("$168.00", "$172.00");
    expect(r.filter((d) => d.from !== null).map((d) => d.char)).toEqual(["7", "2"]);
    expect(r.filter((d) => d.from !== null).map((d) => d.delayMs)).toEqual([30, 0]);
  });
  it("rolls a new leading digit in from blank", () => {
    expect(rollDigits("$98.50", "$104.50").map((d) => d.from)).toEqual([null, " ", "9", "8", null, null, null]);
  });
  it("holds still when nothing changed", () => {
    expect(rollDigits("$1,234.56", "$1,234.56").every((d) => d.from === null)).toBe(true);
  });
  it("gives the direction", () => {
    expect(rollDirection(16800, 17200)).toBe("up");
    expect(rollDirection(17200, 16800)).toBe("down");
  });
});

describe("settle", () => {
  const mk = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } as unknown as Storage;
  };
  it("returns a fresh mark once", () => {
    const s = mk();
    markSettle("thu", s, 1000);
    expect(takeSettle(s, 5000)).toBe("thu");
    expect(takeSettle(s, 5000)).toBeNull();
  });
  it("drops a stale mark and clears it", () => {
    const s = mk();
    markSettle("thu", s, 1000);
    expect(takeSettle(s, 12000)).toBeNull();
    expect(s.getItem(SETTLE_KEY)).toBeNull();
  });
  it("works with null storage and sessionStorage by default", () => {
    expect(() => markSettle("x", null)).not.toThrow();
    expect(takeSettle(null)).toBeNull();
    markSettle("fri");
    expect(takeSettle()).toBe("fri");
  });
  it("finds newly filled days", () => {
    expect(newlyFilled(null, ["mon"])).toEqual([]);
    expect(newlyFilled(["mon"], ["mon", "thu"])).toEqual(["thu"]);
  });
});

describe("morph", () => {
  const els = () => ({ from: document.createElement("div"), dest: document.createElement("div") });
  it("without the API, calls update once and names nothing", async () => {
    const { from, dest } = els();
    const update = vi.fn();
    const doc = {} as Document;
    expect(supportsViewTransitions(doc)).toBe(false);
    await morph({ from, to: () => dest, update, doc });
    expect(update).toHaveBeenCalledTimes(1);
    expect(from.style.viewTransitionName).toBeFalsy();
    expect(dest.style.viewTransitionName).toBeFalsy();
  });
  it("with reduced: true, calls update once and never starts a transition", async () => {
    const { from, dest } = els();
    const update = vi.fn();
    const start = vi.fn();
    await morph({ from, to: () => dest, update, doc: { startViewTransition: start } as unknown as Document, reduced: true });
    expect(update).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
  });
  it("with the API, moves the name from `from` to `to()` and clears both after finished", async () => {
    const { from, dest } = els();
    const seen: Record<string, string> = {};
    const doc = {
      startViewTransition(cb: () => void) {
        seen.fromBefore = from.style.viewTransitionName;
        cb();
        seen.fromInside = from.style.viewTransitionName;
        seen.destInside = dest.style.viewTransitionName;
        return { finished: Promise.resolve() };
      },
    } as unknown as Document;
    await morph({ from, to: () => dest, update: () => {}, doc });
    expect(seen).toEqual({ fromBefore: "meal-photo", fromInside: "", destInside: "meal-photo" });
    expect(from.style.viewTransitionName).toBe("");
    expect(dest.style.viewTransitionName).toBe("");
  });
  it("clears the names even if the transition is rejected", async () => {
    const { from, dest } = els();
    const doc = {
      startViewTransition(cb: () => void) {
        cb();
        return { finished: Promise.reject(new Error("skipped")) };
      },
    } as unknown as Document;
    await expect(morph({ from, to: () => dest, update: () => {}, doc, name: "x" })).resolves.toBeUndefined();
    expect(dest.style.viewTransitionName).toBe("");
  });
  it("with from: null just calls update", async () => {
    const update = vi.fn();
    const start = vi.fn();
    await morph({ from: null, to: () => null, update, doc: { startViewTransition: start } as unknown as Document });
    expect(update).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
  });
});

describe("flip", () => {
  it("inverts positions", () => {
    expect(invert({ left: 10, top: 100 }, { left: 10, top: 160 })).toEqual({ dx: 0, dy: -60 });
  });

  function Harness({ sig, tops }: { sig: string; tops: Record<string, number> }) {
    const ref = useRef<HTMLDivElement>(null);
    useFlipList(ref, sig);
    return createElement(
      "div",
      { ref },
      createElement(
        "section",
        null,
        createElement("div", { "data-flip-key": "a", "data-top": tops.a }),
        createElement("div", { "data-flip-key": "b", "data-top": tops.b }),
      ),
    );
  }

  async function run(reduced: boolean) {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const calls: { key: string; frames: Keyframe[]; opts: KeyframeAnimationOptions }[] = [];
    Element.prototype.animate = function (this: Element, frames: Keyframe[], opts: KeyframeAnimationOptions) {
      calls.push({ key: this.getAttribute("data-flip-key")!, frames, opts });
      return {} as Animation;
    } as never;
    Element.prototype.getBoundingClientRect = function (this: Element) {
      const top = Number(this.getAttribute("data-top") ?? 0);
      return { left: 0, top, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: top, toJSON() {} } as DOMRect;
    };
    window.matchMedia = (() => ({ matches: reduced })) as never;
    document.documentElement.style.setProperty("--bk-spring-snap", "linear(0, 1)");
    const root = createRoot(document.createElement("div"));
    await act(async () => root.render(createElement(Harness, { sig: "1", tops: { a: 0, b: 50 } })));
    expect(calls).toEqual([]);
    await act(async () => root.render(createElement(Harness, { sig: "2", tops: { a: 50, b: 50 } })));
    await act(async () => root.unmount());
    return calls;
  }

  it("finds keys on grandchildren and slides the one that moved with the snap spring", async () => {
    const calls = await run(false);
    expect(calls).toHaveLength(1);
    expect(calls[0].key).toBe("a");
    expect(calls[0].frames).toEqual([{ transform: "translate(0px, -50px)" }, { transform: "none" }]);
    expect(calls[0].opts).toEqual({ duration: 370, easing: "linear(0, 1)" });
  });
  it("fades in place under reduced motion", async () => {
    const calls = await run(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].frames).toEqual([{ opacity: 0 }, { opacity: 1 }]);
    expect(calls[0].opts.duration).toBe(120);
  });
});
