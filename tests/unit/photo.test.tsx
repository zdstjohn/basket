// @vitest-environment jsdom
import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Photo } from "@/components/ui/Photo";
import { Packshot } from "@/components/ui/Packshot";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// A generated 1x1 gif: no real photo is ever used in tests.
const PREVIEW = "data:image/gif;base64,R0lGODlhAQABAAAAACw=";

let host: HTMLDivElement;
let root: Root;
const render = (el: ReactElement) => act(() => root.render(el));
const q = <T extends Element = HTMLElement>(sel: string) => host.querySelector<T>(sel)!;
const wrapper = () => q("[data-photo-state]");
const state = () => wrapper().getAttribute("data-photo-state");
function load(img: HTMLImageElement, naturalWidth = 800) {
  Object.defineProperty(img, "naturalWidth", { configurable: true, value: naturalWidth });
  act(() => void img.dispatchEvent(new Event("load")));
}
const fail = (img: HTMLImageElement) => act(() => void img.dispatchEvent(new Event("error")));

beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
});

describe("<Photo>", () => {
  it("is a sized wrapper with exactly one lazy img, loading until the image arrives", () => {
    render(<Photo src="/a.jpg" name="Tacos" crop="tile" preview={PREVIEW} />);
    expect(state()).toBe("loading");
    expect(wrapper().className).toMatch(/aspect-tile/);
    expect(wrapper().className).toMatch(/bg-sunk/);
    expect(host.querySelectorAll("img")).toHaveLength(1);
    const img = q<HTMLImageElement>("img");
    expect(img.className).toContain("bk-photo");
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(img.getAttribute("decoding")).toBe("async");
    expect(img.className).toMatch(/opacity-0/);
    expect(wrapper().getAttribute("style")).toContain("--bk-photo-preview");
    expect(wrapper().getAttribute("style")).toContain(PREVIEW);
    expect(wrapper().className).toMatch(/before:/); // the preview is a layer, not a second <img>
  });

  it("uses the three aspect classes", () => {
    render(<Photo src="/a.jpg" name="Tacos" crop="hero" />);
    expect(wrapper().className).toMatch(/aspect-hero/);
    render(<Photo src="/a.jpg" name="Tacos" crop="thumb" />);
    expect(wrapper().className).toMatch(/aspect-thumb/);
  });

  it("priority drops lazy loading and asks for high fetch priority", () => {
    render(<Photo src="/a.jpg" name="Tacos" crop="hero" priority />);
    const img = q<HTMLImageElement>("img");
    expect(img.getAttribute("loading")).toBeNull();
    expect(img.getAttribute("fetchpriority")).toBe("high");
  });

  it("is ready and shows the photo on load", () => {
    render(<Photo src="/a.jpg" name="Tacos" crop="tile" />);
    load(q<HTMLImageElement>("img"));
    expect(state()).toBe("ready");
    expect(q("img").className).toMatch(/opacity-100/);
    expect(q("img").className).toMatch(/motion-reduce:transition-none/);
  });

  it("holds the preview when the photo never finishes loading", () => {
    render(<Photo src="/a.jpg" name="Tacos" crop="tile" preview={PREVIEW} />);
    expect(state()).toBe("loading");
    expect(wrapper().getAttribute("style")).toContain(PREVIEW);
  });

  it("falls back with no img when src is null", () => {
    render(<Photo src={null} name="tacos" crop="tile" />);
    expect(state()).toBe("fallback");
    expect(host.querySelectorAll("img")).toHaveLength(0);
    expect(q(".bk-fallback-letter").textContent).toBe("T");
    expect(host.textContent).toContain("Add a photo");
  });

  it("falls back when the photo 404s after its preview showed, and the box stays the same shape", () => {
    render(<Photo src="/gone.jpg" name="Tacos" crop="tile" preview={PREVIEW} />);
    fail(q<HTMLImageElement>("img"));
    expect(state()).toBe("fallback");
    expect(host.querySelectorAll("img")).toHaveLength(0);
    expect(wrapper().className).toMatch(/relative .*aspect-tile/); // same box: only the preview layer goes
    expect(wrapper().getAttribute("style") ?? "").not.toContain(PREVIEW);
  });

  it("falls back when the loaded photo is too small", () => {
    render(<Photo src="/small.jpg" name="Tacos" crop="tile" />);
    load(q<HTMLImageElement>("img"), 250);
    expect(state()).toBe("fallback");
    expect(host.querySelectorAll("img")).toHaveLength(0);
  });

  it("a known width settles it before any request: too small is the fallback at once, with no img", () => {
    render(<Photo src="/a.jpg" name="Tacos" crop="tile" width={200} />);
    expect(state()).toBe("fallback");
    expect(host.querySelectorAll("img")).toHaveLength(0);
  });

  it("a known hero width under 300 is the fallback at once, and never asks to be demoted", () => {
    const onDemote = vi.fn();
    render(<Photo src="/a.jpg" name="Tacos" crop="hero" width={250} onDemote={onDemote} />);
    expect(state()).toBe("fallback");
    expect(host.querySelectorAll("img")).toHaveLength(0);
    expect(onDemote).not.toHaveBeenCalled();
  });

  it("a known width of 450 on a hero still requests the photo and demotes on load", () => {
    const onDemote = vi.fn();
    render(<Photo src="/a.jpg" name="Tacos" crop="hero" width={450} onDemote={onDemote} />);
    expect(host.querySelectorAll("img")).toHaveLength(1);
    load(q<HTMLImageElement>("img"), 900);
    expect(onDemote).toHaveBeenCalledTimes(1);
    expect(state()).toBe("ready");
  });

  it("a small hero is never the hero: it asks to be demoted and does not fall back", () => {
    const onDemote = vi.fn();
    render(<Photo src="/mid.jpg" name="Tacos" crop="hero" onDemote={onDemote} />);
    load(q<HTMLImageElement>("img"), 450);
    expect(onDemote).toHaveBeenCalledTimes(1);
    expect(state()).toBe("ready");
  });

  it("with a stored width of 0, a tiny photo that loads is still the fallback", () => {
    render(<Photo src="/tiny.jpg" name="Tacos" crop="tile" width={0} />);
    load(q<HTMLImageElement>("img"), 120);
    expect(state()).toBe("fallback");
  });

  it("with a stored width of 0, a mid-size hero that loads still asks to be demoted", () => {
    const onDemote = vi.fn();
    render(<Photo src="/mid.jpg" name="Tacos" crop="hero" width={0} onDemote={onDemote} />);
    load(q<HTMLImageElement>("img"), 450);
    expect(onDemote).toHaveBeenCalledTimes(1);
  });

  it("a hero under 300 wide is the fallback, not a demotion", () => {
    const onDemote = vi.fn();
    render(<Photo src="/tiny.jpg" name="Tacos" crop="hero" onDemote={onDemote} />);
    load(q<HTMLImageElement>("img"), 250);
    expect(onDemote).not.toHaveBeenCalled();
    expect(state()).toBe("fallback");
  });

  it("treats width 0 (the server could not read it) as unknown: the browser still requests the photo", () => {
    render(<Photo src="/a.jpg" name="Tacos" crop="thumb" width={0} />);
    expect(state()).not.toBe("fallback");
    expect(host.querySelectorAll("img")).toHaveLength(1);
  });

  it("shows the hint under the letter unless hint is false", () => {
    render(<Photo src={null} name="Soup" crop="hero" />);
    expect(host.textContent).toContain("Add a photo");
    expect(host.querySelector(".text-small.font-semibold.text-ink-soft")).not.toBeNull();
    render(<Photo src={null} name="Soup" crop="hero" hint={false} />);
    expect(host.textContent).not.toContain("Add a photo");
  });

  it("thumb fallback is the letter alone, in Gloock at 24 px", () => {
    render(<Photo src={null} name="Soup" crop="thumb" />);
    expect(host.textContent).toBe("S");
    expect(host.innerHTML).toMatch(/font-display/);
    expect(host.innerHTML).toMatch(/text-title/);
  });

  it("a cached photo that is already complete on mount is ready without a load event", () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(900);
    render(<Photo src="/cached.jpg" name="Tacos" crop="tile" />);
    expect(state()).toBe("ready");
  });

  it("a complete image with no pixels (broken) is the fallback", () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(0);
    render(<Photo src="/broken.jpg" name="Tacos" crop="tile" />);
    expect(state()).toBe("fallback");
  });

  it("onFallback fires once when the picture fails to load, and when it loads too small", () => {
    const onFallback = vi.fn();
    render(<Photo src="/gone.jpg" name="Tacos" crop="hero" onFallback={onFallback} />);
    fail(q<HTMLImageElement>("img"));
    expect(state()).toBe("fallback");
    expect(onFallback).toHaveBeenCalledTimes(1);

    const small = vi.fn();
    render(<Photo src="/small.jpg" name="Tacos" crop="tile" onFallback={small} />);
    load(q<HTMLImageElement>("img"), 120);
    expect(state()).toBe("fallback");
    expect(small).toHaveBeenCalledTimes(1);
  });

  it("onFallback stays quiet for a photo that loads fine", () => {
    const onFallback = vi.fn();
    render(<Photo src="/ok.jpg" name="Tacos" crop="hero" onFallback={onFallback} />);
    load(q<HTMLImageElement>("img"), 900);
    expect(onFallback).not.toHaveBeenCalled();
  });

  it("a re-signed link for a shown photo does not drop back to loading", () => {
    render(<Photo src="/a.jpg?sig=1" name="Tacos" crop="tile" />);
    load(q<HTMLImageElement>("img"));
    expect(state()).toBe("ready");
    render(<Photo src="/a.jpg?sig=2" name="Tacos" crop="tile" />);
    expect(state()).toBe("ready");
    expect(q("img").className).toMatch(/opacity-100/);
  });

  it("a new link after a failure tries again", () => {
    render(<Photo src="/a.jpg" name="Tacos" crop="tile" />);
    fail(q<HTMLImageElement>("img"));
    expect(state()).toBe("fallback");
    render(<Photo src="/b.jpg" name="Tacos" crop="tile" />);
    expect(state()).toBe("loading");
    expect(host.querySelectorAll("img")).toHaveLength(1);
  });

  it("hands the img to imgRef", () => {
    const ref = { current: null as HTMLImageElement | null };
    render(<Photo src="/a.jpg" name="Tacos" crop="tile" imgRef={ref} />);
    expect(ref.current).toBe(q("img"));
  });
});

describe("<Packshot>", () => {
  it("hides itself on mount when the image already failed before React listened", () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(0);
    render(<Packshot src="https://example.test/p.jpg" alt="x" />);
    expect(q(".bk-packshot").hasAttribute("hidden")).toBe(true);
  });

  it("stays visible on mount when the image already arrived", () => {
    vi.spyOn(HTMLImageElement.prototype, "complete", "get").mockReturnValue(true);
    vi.spyOn(HTMLImageElement.prototype, "naturalWidth", "get").mockReturnValue(200);
    render(<Packshot src="https://example.test/p.jpg" alt="x" />);
    expect(q(".bk-packshot").hasAttribute("hidden")).toBe(false);
  });

  it("size 64 takes the md radius, size 44 keeps the default", () => {
    render(<Packshot src="https://example.test/p.jpg" alt="x" size={64} />);
    expect(q(".bk-packshot").getAttribute("style")).toContain("--bk-packshot-radius: var(--radius-md)");
    render(<Packshot src="https://example.test/p.jpg" alt="x" />);
    expect(q(".bk-packshot").getAttribute("style") ?? "").not.toContain("--bk-packshot-radius");
  });

  it("is a lazy, no-referrer image in a .bk-packshot of 44 or 64 px", () => {
    render(<Packshot src="https://example.test/p.jpg" alt="Black Beans" />);
    const box = q(".bk-packshot");
    expect(box.className).toMatch(/size-11/);
    const img = box.querySelector("img")!;
    expect(img.parentElement).toBe(box);
    expect(img.getAttribute("alt")).toBe("Black Beans");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(img.getAttribute("referrerpolicy")).toBe("no-referrer");
    render(<Packshot src="https://example.test/p.jpg" alt="" size={64} />);
    expect(q(".bk-packshot").className).toMatch(/size-16/);
  });

  it("renders nothing without a src", () => {
    render(<Packshot src={null} alt="x" />);
    expect(host.querySelector(".bk-packshot")).toBeNull();
  });

  it("disappears when the image fails, and tries again for a new src", () => {
    render(<Packshot src="https://example.test/p.jpg" alt="x" />);
    fail(q<HTMLImageElement>("img"));
    expect(host.querySelector(".bk-packshot:not([hidden])")).toBeNull();
    render(<Packshot src="https://example.test/q.jpg" alt="x" />);
    expect(host.querySelector(".bk-packshot:not([hidden])")).not.toBeNull();
  });
});
