// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sheet, useSheetClose } from "@/components/Sheet";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let now = 0;

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  // jsdom has no layout and, depending on its version, no modal dialog.
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", { configurable: true, get: () => 400 });
  const proto = HTMLDialogElement.prototype as unknown as { showModal: () => void; close: () => void };
  proto.showModal = function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  delete (HTMLElement.prototype as { offsetHeight?: number }).offsetHeight;
});

function render(el: ReactElement) {
  act(() => root.render(el));
}
const q = <T extends Element = HTMLElement>(sel: string) => host.querySelector<T>(sel)!;
function ptr(el: Element, type: string, y: number) {
  act(() => {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientY: y, button: 0 }));
  });
}
async function settle() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}
const panelY = () => q("[data-testid=sheet-panel]").style.transform;

describe("Sheet markup", () => {
  it("is a modal dialog with its label, drag zone and no close button without a title", () => {
    render(
      <Sheet label="Yellow onion" onClose={() => {}}>
        <p>Inside</p>
      </Sheet>,
    );
    const d = q<HTMLDialogElement>("dialog");
    expect(d.getAttribute("aria-label")).toBe("Yellow onion");
    expect(d.open).toBe(true);
    expect(q("[data-testid=sheet-drag]").className).toContain("touch-none");
    expect(q("[data-testid=sheet-drag] [aria-hidden=true]")).toBeTruthy();
    expect(host.querySelector("button[aria-label=Close]")).toBeNull();
    expect(host.textContent).toContain("Inside");
  });

  it("with a title draws the header and a Close button that closes once", async () => {
    const onClose = vi.fn();
    render(
      <Sheet label="Swap onion" title="Swap onion" onClose={onClose}>
        <p>Inside</p>
      </Sheet>,
    );
    expect(q("h2").textContent).toBe("Swap onion");
    const close = q("button[aria-label=Close]");
    act(() => close.click());
    act(() => close.click());
    await settle();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("useSheetClose lets a child play the same exit", async () => {
    const onClose = vi.fn();
    function Child() {
      const close = useSheetClose();
      return <button onClick={close}>Done</button>;
    }
    render(
      <Sheet label="x" onClose={onClose}>
        <Child />
      </Sheet>,
    );
    act(() => q("button").click());
    await settle();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("Escape is caught (not closed natively), plays the exit, and the close event is only a fallback", async () => {
    const onClose = vi.fn();
    render(
      <Sheet label="x" onClose={onClose}>
        <p>a</p>
      </Sheet>,
    );
    const d = q<HTMLDialogElement>("dialog");
    const cancel = new Event("cancel", { cancelable: true });
    act(() => {
      d.dispatchEvent(cancel);
    });
    expect(cancel.defaultPrevented).toBe(true);
    await settle();
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => {
      d.dispatchEvent(new Event("close"));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("the close event alone still reports the close", () => {
    const onClose = vi.fn();
    render(
      <Sheet label="x" onClose={onClose}>
        <p>a</p>
      </Sheet>,
    );
    act(() => {
      q("dialog").dispatchEvent(new Event("close"));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a backdrop tap closes it; a tap inside does not", async () => {
    const onClose = vi.fn();
    render(
      <Sheet label="x" onClose={onClose}>
        <button>In</button>
      </Sheet>,
    );
    act(() => q("button").click());
    await settle();
    expect(onClose).not.toHaveBeenCalled();
    act(() => q("[data-testid=sheet-scrim]").click());
    await settle();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("Sheet drag (pointer on the drag zone)", () => {
  function open(onClose = vi.fn()) {
    render(
      <Sheet label="x" onClose={onClose}>
        <p>a</p>
      </Sheet>,
    );
    return { onClose, zone: q("[data-testid=sheet-drag]") };
  }

  it("follows the finger 1:1 with no transition and never rises above its place", () => {
    const { zone } = open();
    ptr(zone, "pointerdown", 100);
    now += 16;
    ptr(zone, "pointermove", 150);
    expect(panelY()).toBe("translateY(50px)");
    now += 16;
    ptr(zone, "pointermove", 60);
    expect(panelY()).toBe("translateY(0px)");
  });

  it("a short slow drag springs back and stays open", async () => {
    const { onClose, zone } = open();
    ptr(zone, "pointerdown", 100);
    for (let i = 1; i <= 6; i++) {
      now += 60;
      ptr(zone, "pointermove", 100 + i * 10);
    }
    now += 60;
    ptr(zone, "pointerup", 160);
    await settle();
    expect(onClose).not.toHaveBeenCalled();
    expect(panelY()).toBe("");
  });

  it("a drag past 30% of the height dismisses", async () => {
    const { onClose, zone } = open();
    ptr(zone, "pointerdown", 100);
    for (let i = 1; i <= 8; i++) {
      now += 60;
      ptr(zone, "pointermove", 100 + i * 20);
    }
    now += 60;
    ptr(zone, "pointerup", 260);
    await settle();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("a quick flick dismisses", async () => {
    const { onClose, zone } = open();
    ptr(zone, "pointerdown", 100);
    now += 20;
    ptr(zone, "pointermove", 140);
    now += 20;
    ptr(zone, "pointermove", 180);
    ptr(zone, "pointerup", 180);
    await settle();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("drag, pause, release does not dismiss on stale speed", async () => {
    const { onClose, zone } = open();
    ptr(zone, "pointerdown", 100);
    now += 20;
    ptr(zone, "pointermove", 140);
    now += 20;
    ptr(zone, "pointermove", 180); // 2 px/ms: a flick so far
    now += 400; // the finger rests
    ptr(zone, "pointerup", 180);
    await settle();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("a cancelled pointer springs back", async () => {
    const { onClose, zone } = open();
    ptr(zone, "pointerdown", 100);
    now += 20;
    ptr(zone, "pointermove", 300);
    ptr(zone, "pointercancel", 300);
    await settle();
    expect(onClose).not.toHaveBeenCalled();
    expect(panelY()).toBe("");
  });
});

describe("Sheet touch drag on the content", () => {
  function touch(el: Element, type: string, x: number, y: number) {
    const e = new Event(type, { bubbles: true, cancelable: true }) as Event & { touches: unknown[] };
    e.touches = type === "touchend" || type === "touchcancel" ? [] : [{ clientX: x, clientY: y }];
    act(() => {
      el.dispatchEvent(e);
    });
    return e;
  }
  function open(child: ReactElement = <p data-testid="plain">a</p>) {
    const onClose = vi.fn();
    render(
      <Sheet label="x" onClose={onClose}>
        {child}
      </Sheet>,
    );
    return { onClose };
  }

  it("a vertical pull at the top drags the sheet and stops the page scrolling", () => {
    open();
    const target = q("[data-testid=plain]");
    touch(target, "touchstart", 100, 100);
    const move = touch(target, "touchmove", 102, 140);
    expect(panelY()).toBe("translateY(40px)");
    expect(move.defaultPrevented).toBe(true);
  });

  it("a sideways swipe does not drag it", () => {
    open();
    const target = q("[data-testid=plain]");
    touch(target, "touchstart", 100, 100);
    const move = touch(target, "touchmove", 180, 110);
    expect(panelY()).toBe("");
    expect(move.defaultPrevented).toBe(false);
  });

  it("a touch that starts in an input does not drag it", () => {
    open(<input data-testid="field" />);
    const target = q("[data-testid=field]");
    touch(target, "touchstart", 100, 100);
    touch(target, "touchmove", 100, 160);
    expect(panelY()).toBe("");
  });

  it("a nested scroller that is scrolled down keeps the pull", () => {
    open(
      <div data-testid="inner" style={{ overflowY: "auto" }}>
        <p data-testid="in-inner">a</p>
      </div>,
    );
    const inner = q("[data-testid=inner]");
    Object.defineProperty(inner, "scrollHeight", { configurable: true, value: 500 });
    Object.defineProperty(inner, "clientHeight", { configurable: true, value: 100 });
    inner.scrollTop = 50;
    const target = q("[data-testid=in-inner]");
    touch(target, "touchstart", 100, 100);
    touch(target, "touchmove", 100, 160);
    expect(panelY()).toBe("");
  });

  it("a nested scroller at its top still lets the sheet drag", () => {
    open(
      <div data-testid="inner" style={{ overflowY: "auto" }}>
        <p data-testid="in-inner">a</p>
      </div>,
    );
    const inner = q("[data-testid=inner]");
    Object.defineProperty(inner, "scrollHeight", { configurable: true, value: 500 });
    Object.defineProperty(inner, "clientHeight", { configurable: true, value: 100 });
    const target = q("[data-testid=in-inner]");
    touch(target, "touchstart", 100, 100);
    touch(target, "touchmove", 100, 160);
    expect(panelY()).toBe("translateY(60px)");
  });
});

describe("Sheet release details", () => {
  it("an upward flick after a long pull does not dismiss", async () => {
    const onClose = vi.fn();
    render(
      <Sheet label="x" onClose={onClose}>
        <p>a</p>
      </Sheet>,
    );
    const zone = q("[data-testid=sheet-drag]");
    ptr(zone, "pointerdown", 100);
    now += 200;
    ptr(zone, "pointermove", 260); // 160 px: past 30% of 400
    now += 20;
    ptr(zone, "pointermove", 230);
    now += 20;
    ptr(zone, "pointerup", 230);
    await settle();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("losing pointer capture abandons the drag", async () => {
    const onClose = vi.fn();
    render(
      <Sheet label="x" onClose={onClose}>
        <p>a</p>
      </Sheet>,
    );
    const zone = q("[data-testid=sheet-drag]");
    ptr(zone, "pointerdown", 100);
    now += 20;
    ptr(zone, "pointermove", 300);
    act(() => {
      zone.dispatchEvent(new Event("lostpointercapture", { bubbles: true }));
    });
    expect(panelY()).toBe("");
    now += 20;
    ptr(zone, "pointerup", 300);
    await settle();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("the panel is inert while it leaves", () => {
    render(
      <Sheet label="x" onClose={() => {}}>
        <p>a</p>
      </Sheet>,
    );
    act(() => q("[data-testid=sheet-scrim]").click());
    expect(q("[data-testid=sheet-panel]").hasAttribute("inert")).toBe(true);
  });

  it("under reduced motion the spring-back snaps with no animation", async () => {
    const calls: unknown[] = [];
    (HTMLElement.prototype as unknown as { animate: unknown }).animate = function () {
      calls.push(1);
      return { finished: Promise.resolve(), cancel() {} };
    };
    (window as unknown as { matchMedia: unknown }).matchMedia = (query: string) => ({ matches: true, media: query });
    render(
      <Sheet label="x" onClose={() => {}}>
        <p>a</p>
      </Sheet>,
    );
    calls.length = 0; // the enter fade
    const zone = q("[data-testid=sheet-drag]");
    ptr(zone, "pointerdown", 100);
    now += 100;
    ptr(zone, "pointermove", 130);
    now += 400;
    ptr(zone, "pointerup", 130);
    await settle();
    expect(calls.length).toBe(0);
    expect(panelY()).toBe("");
    delete (HTMLElement.prototype as { animate?: unknown }).animate;
    delete (window as { matchMedia?: unknown }).matchMedia;
  });
});
