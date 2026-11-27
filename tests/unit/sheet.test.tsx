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
