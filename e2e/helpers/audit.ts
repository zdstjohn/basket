import type { Page } from "@playwright/test";

export interface Problem {
  what: string;
  detail: string;
}

/** Everything the layout rules care about, measured in the page. */
export async function audit(page: Page): Promise<Problem[]> {
  return page.evaluate(() => {
    const problems: { what: string; detail: string }[] = [];
    const describe = (el: Element) =>
      `${el.tagName.toLowerCase()}${el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label")}]` : ""} "${(el.textContent ?? "").trim().slice(0, 30)}"`;

    const doc = document.documentElement;
    if (doc.scrollWidth > window.innerWidth) {
      problems.push({ what: "horizontal scroll", detail: `${doc.scrollWidth} > ${window.innerWidth}` });
    }

    // A control may be a big label around a small native input (checkbox row), so measure its tap area:
    // the input itself or the label that wraps it, whichever is larger.
    const controls = [...document.querySelectorAll<HTMLElement>("button, a, input")];
    if (controls.length === 0) problems.push({ what: "no controls found", detail: "the screen did not render" });
    for (const el of controls) {
      const style = getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") continue;
      let box = el.getBoundingClientRect();
      const label = el instanceof HTMLInputElement ? el.closest("label") : null;
      if (label) {
        const lb = label.getBoundingClientRect();
        if (lb.width * lb.height > box.width * box.height) box = lb;
      }
      // Skip controls that take no room at all (visually hidden inputs that a visible label stands in for).
      if (box.width === 0 && box.height === 0) continue;
      if (box.width < 44 || box.height < 44) {
        problems.push({ what: "target under 44px", detail: `${describe(el)} ${Math.round(box.width)}x${Math.round(box.height)}` });
      }
      if (box.right > window.innerWidth + 0.5 || box.left < -0.5) {
        problems.push({ what: "target off screen sideways", detail: describe(el) });
      }
    }

    // Nothing sits under a bottom bar or the bottom edge: after scrolling to the end, the last thing in the page
    // ends above the top of the nav and of any bar pinned to the bottom (or the viewport bottom when there is none).
    window.scrollTo(0, document.documentElement.scrollHeight);
    const nav = document.querySelector("nav[aria-label='Main']");
    const bars: Element[] = nav ? [nav] : [];
    for (const el of document.querySelectorAll<HTMLElement>("body *")) {
      const s = getComputedStyle(el);
      if ((s.position === "fixed" || s.position === "sticky") && s.bottom !== "auto" && el.getBoundingClientRect().top > window.innerHeight / 2) {
        bars.push(el);
      }
    }
    const limit = Math.min(window.innerHeight, ...bars.map((b) => b.getBoundingClientRect().top));
    const main = document.querySelector("main") ?? document.body;
    const visible = [...main.querySelectorAll<HTMLElement>("*")].filter((e) => {
      const r = e.getBoundingClientRect();
      const s = getComputedStyle(e);
      return (
        r.height > 0 &&
        r.width > 0 &&
        s.position !== "fixed" &&
        s.position !== "sticky" &&
        s.visibility !== "hidden" &&
        !bars.some((b) => b.contains(e))
      );
    });
    let lowest = 0;
    let lowestEl: Element | null = null;
    for (const e of visible) {
      const b = e.getBoundingClientRect().bottom;
      if (b > lowest) {
        lowest = b;
        lowestEl = e;
      }
    }
    if (lowestEl && lowest > limit + 0.5) {
      problems.push({ what: "content under the nav or bottom edge", detail: `${describe(lowestEl)} ends ${Math.round(lowest)} > ${Math.round(limit)}` });
    }
    // Fixed or sticky controls must stay inside the viewport (the safe-area padding keeps them clear of the home bar).
    for (const el of controls) {
      const s = getComputedStyle(el);
      if (s.position !== "fixed" && s.position !== "sticky") continue;
      const r = el.getBoundingClientRect();
      if (r.bottom > window.innerHeight + 0.5) problems.push({ what: "pinned control below the screen", detail: describe(el) });
    }
    window.scrollTo(0, 0);
    return problems;
  });
}

export interface ShellMeasure {
  /** The top and bottom safe-area insets the page resolves to, in px. */
  insetTop: number;
  insetBottom: number;
  /** Top edge of the first h1 at scroll 0, or null when the page has none. */
  h1Top: number | null;
  /** The tab bar, or null on a screen without one. */
  nav: { paddingBottom: number; bottom: number } | null;
  innerHeight: number;
}

/** Where the shell puts things: the insets, the first h1 and the tab bar. */
export async function measureShell(page: Page): Promise<ShellMeasure> {
  return page.evaluate(() => {
    window.scrollTo(0, 0);
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;visibility:hidden;padding-top:var(--bk-safe-top);padding-bottom:var(--bk-safe-bottom)";
    document.body.append(probe);
    const ps = getComputedStyle(probe);
    const insetTop = parseFloat(ps.paddingTop);
    const insetBottom = parseFloat(ps.paddingBottom);
    probe.remove();
    const h1 = document.querySelector("h1");
    const nav = document.querySelector("nav[aria-label='Main']");
    return {
      insetTop,
      insetBottom,
      h1Top: h1 ? h1.getBoundingClientRect().top : null,
      nav: nav ? { paddingBottom: parseFloat(getComputedStyle(nav).paddingBottom), bottom: nav.getBoundingClientRect().bottom } : null,
      innerHeight: window.innerHeight,
    };
  });
}

/**
 * Every distinct piece of text on the page as [text color, background, the text], as `rgb()` strings.
 * Skips text on a photo, hidden text, faded text (disabled or still animating in) and anything over an image or gradient.
 * The spec turns the pairs into ratios with the real contrastRatio.
 */
export async function textPairs(page: Page): Promise<[fg: string, bg: string, text: string][]> {
  return page.evaluate(() => {
    type Rgba = [number, number, number, number];
    const parse = (c: string): Rgba | null => {
      const m = /^rgba?\(([^)]+)\)$/.exec(c.trim());
      if (!m) return null;
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number);
      if (p.length < 3 || p.some((n) => Number.isNaN(n))) return null;
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    };
    const over = (top: Rgba, under: Rgba): Rgba => {
      const a = top[3] + under[3] * (1 - top[3]);
      if (a === 0) return [0, 0, 0, 0];
      const mix = (i: number) => (top[i] * top[3] + under[i] * under[3] * (1 - top[3])) / a;
      return [mix(0), mix(1), mix(2), a];
    };
    const css = (c: Rgba) => `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`;

    /** The color behind an element, or null when an image, gradient or unreadable color is in the way. */
    const backdrop = (el: Element): Rgba | null => {
      const layers: Rgba[] = [];
      for (let e: Element | null = el; e; e = e.parentElement) {
        const s = getComputedStyle(e);
        if (s.backgroundImage !== "none") return null;
        const c = parse(s.backgroundColor);
        if (!c) return null;
        if (c[3] > 0) layers.push(c);
        if (c[3] === 1) break;
      }
      let acc: Rgba = layers.length && layers[layers.length - 1][3] === 1 ? layers.pop()! : [255, 255, 255, 1];
      while (layers.length) acc = over(layers.pop()!, acc);
      return acc;
    };
    const faded = (el: Element) => {
      let o = 1;
      for (let e: Element | null = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
      return o < 0.99;
    };

    const seen = new Set<string>();
    const out: [string, string, string][] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent ?? "").replace(/\s+/g, " ").trim();
      const el = n.parentElement;
      if (!text || !el) continue;
      if (el.closest("[data-on-photo], script, style, noscript")) continue;
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" || box.width <= 1 || box.height <= 1) continue;
      if (faded(el)) continue;
      const fg = parse(style.color);
      const bg = backdrop(el);
      if (!fg || !bg || fg[3] === 0) continue;
      const key = `${css(over(fg, bg))}|${css(bg)}|${text.slice(0, 40)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push([css(over(fg, bg)), css(bg), text.slice(0, 40)]);
    }
    return out;
  });
}
