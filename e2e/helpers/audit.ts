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
      // Only a row that opts in with data-scroll-x (the Favorites filters) excuses a control: it must really scroll
      // sideways, sit inside the screen, and the control must lie within its scroll extent.
      const scroller = el.closest<HTMLElement>("[data-scroll-x]");
      let inScroller = false;
      if (scroller && scroller.scrollWidth > scroller.clientWidth) {
        const sr = scroller.getBoundingClientRect();
        const left = box.left - sr.left + scroller.scrollLeft;
        inScroller =
          sr.left >= -0.5 && sr.right <= window.innerWidth + 0.5 && left >= -0.5 && left + box.width <= scroller.scrollWidth + 0.5;
      }
      if (!inScroller && (box.right > window.innerWidth + 0.5 || box.left < -0.5)) {
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
    // With no bar the page must still clear the bottom safe-area inset (the home bar).
    const probe = document.createElement("div");
    probe.style.cssText = "position:fixed;visibility:hidden;padding-bottom:var(--bk-safe-bottom)";
    document.body.append(probe);
    const insetBottom = parseFloat(getComputedStyle(probe).paddingBottom) || 0;
    probe.remove();
    const limit = Math.min(window.innerHeight - (bars.length ? 0 : insetBottom), ...bars.map((b) => b.getBoundingClientRect().top));
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
        // A bar and whatever wraps it are not "content under the bar".
        !bars.some((b) => b.contains(e) || e.contains(b))
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

export interface TextPair {
  fg: string;
  bg: string;
  text: string;
}

export interface SkippedText {
  text: string;
  reason: string;
}

/**
 * Every distinct piece of text on the page with its text color and background as `rgb()` strings, so the spec can
 * turn them into ratios with the real contrastRatio.
 * Colors of any CSS syntax (rgb, color(srgb), oklab, color-mix results) are read through a canvas. Faded text is
 * measured as it is seen: ancestor opacity is folded into the text color, and finite animations and transitions are
 * finished first so text still fading in is not measured half way.
 * Text is never dropped without a trace: what cannot be measured comes back in `skipped` with a reason.
 * Exempt on purpose: text marked `data-on-photo`, disabled controls (WCAG exempts them) and hidden text.
 * An image or gradient background is reported as skipped with a reason starting "image"; the spec fails it unless the text is in `data-on-photo`.
 */
export async function textPairs(page: Page): Promise<{ pairs: TextPair[]; skipped: SkippedText[] }> {
  return page.evaluate(() => {
    type Rgba = [number, number, number, number];
    const ctx = document.createElement("canvas").getContext("2d", { willReadFrequently: true })!;
    const cache = new Map<string, Rgba | null>();
    const parse = (c: string): Rgba | null => {
      const hit = cache.get(c);
      if (hit !== undefined) return hit;
      let out: Rgba | null = null;
      // Two different sentinels tell an unparseable color (fillStyle is left alone) from a real one.
      const read = (sentinel: string) => {
        ctx.fillStyle = sentinel;
        ctx.fillStyle = c;
        const resolved = ctx.fillStyle;
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        return { resolved, rgba: [d[0], d[1], d[2], d[3] / 255] as Rgba };
      };
      const a = read("#010203");
      const b = read("#fdfcfb");
      out = a.resolved !== "#010203" || b.resolved !== "#fdfcfb" ? a.rgba : null;
      cache.set(c, out);
      return out;
    };
    const over = (top: Rgba, under: Rgba): Rgba => {
      const a = top[3] + under[3] * (1 - top[3]);
      if (a === 0) return [0, 0, 0, 0];
      const mix = (i: number) => (top[i] * top[3] + under[i] * under[3] * (1 - top[3])) / a;
      return [mix(0), mix(1), mix(2), a];
    };
    const css = (c: Rgba) => `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`;

    /** The color behind an element, or why it cannot be known. */
    const backdrop = (el: Element): { color: Rgba } | { reason: string } => {
      const layers: Rgba[] = [];
      for (let e: Element | null = el; e; e = e.parentElement) {
        const s = getComputedStyle(e);
        if (s.backgroundImage !== "none") return { reason: "image or gradient background" };
        const c = parse(s.backgroundColor);
        if (!c) return { reason: `unreadable background color ${s.backgroundColor}` };
        if (c[3] > 0) layers.push(c);
        if (c[3] >= 0.999) break;
      }
      let acc: Rgba = layers.length && layers[layers.length - 1][3] >= 0.999 ? layers.pop()! : [255, 255, 255, 1];
      while (layers.length) acc = over(layers.pop()!, acc);
      return { color: acc };
    };
    const opacityOf = (el: Element) => {
      let o = 1;
      for (let e: Element | null = el; e; e = e.parentElement) o *= Number(getComputedStyle(e).opacity);
      return o;
    };

    // Settle finite animations and transitions so fade-ins are measured where they end up.
    for (const a of document.getAnimations()) {
      const t = a.effect?.getComputedTiming();
      if (t && Number.isFinite(t.endTime as number)) {
        try {
          a.finish();
        } catch {
          /* an animation that cannot finish is measured as it is */
        }
      }
    }

    const seen = new Set<string>();
    const pairs: { fg: string; bg: string; text: string }[] = [];
    const skipped: { text: string; reason: string }[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const text = (n.textContent ?? "").replace(/\s+/g, " ").trim();
      const el = n.parentElement;
      if (!text || !el) continue;
      if (el.closest("[data-on-photo], script, style, noscript, :disabled, [aria-disabled='true']")) continue;
      const style = getComputedStyle(el);
      const box = el.getBoundingClientRect();
      if (style.display === "none" || style.visibility === "hidden" || box.width <= 1 || box.height <= 1) continue;
      const label = text.slice(0, 40);
      const fg = parse(style.color);
      if (!fg) {
        skipped.push({ text: label, reason: `unreadable text color ${style.color}` });
        continue;
      }
      const bg = backdrop(el);
      if ("reason" in bg) {
        skipped.push({ text: label, reason: bg.reason });
        continue;
      }
      const seenFg: Rgba = [fg[0], fg[1], fg[2], fg[3] * opacityOf(el)];
      if (seenFg[3] === 0) continue;
      const key = `${css(over(seenFg, bg.color))}|${css(bg.color)}|${label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push({ fg: css(over(seenFg, bg.color)), bg: css(bg.color), text: label });
    }
    return { pairs, skipped };
  });
}
