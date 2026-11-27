import type { Page } from "@playwright/test";

/** The spacing scale (px) and the two tile exceptions. */
export const SPACING = [0, 2, 4, 8, 12, 16, 24, 32, 48, 64, 10, 6];
/** The type scale (px). */
export const FONT_SIZES = [12, 14, 16, 18, 24, 34];

export interface Finding {
  rule: "spacing" | "gutter" | "type";
  where: string;
  detail: string;
}

/**
 * Rules 1 to 3 of the proof, measured in the page:
 *  1. every visible element's margin, padding and gap is on the spacing scale;
 *  2. every direct child of a `.bk-gutter` block starts at the gutter;
 *  3. font sizes are only the type scale (and 54 on `.bk-fallback-letter`).
 * Exempt: padding built from `--bk-safe-*`, `auto` margins, `.bk-packshot > img`, negative margins of 4 (the chevron hang), svg internals.
 */
export async function measureScales(page: Page): Promise<Finding[]> {
  return page.evaluate(
    ({ spacing, sizes }) => {
      const found: { rule: "spacing" | "gutter" | "type"; where: string; detail: string }[] = [];
      const seen = new Set<string>();
      const add = (rule: "spacing" | "gutter" | "type", where: string, detail: string) => {
        const key = `${rule}|${where}|${detail}`;
        if (seen.has(key) || found.length >= 80) return;
        seen.add(key);
        found.push({ rule, where, detail });
      };
      const near = (v: number, list: number[]) => list.some((s) => Math.abs(s - v) < 0.05);
      const name = (el: Element) => {
        const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
        const label = el.getAttribute("data-testid") ?? el.getAttribute("aria-label") ?? "";
        return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}${label ? `[${label}]` : ""}`;
      };
      const visible = (el: Element) => {
        const s = getComputedStyle(el);
        if (s.display === "none" || s.visibility === "hidden") return false;
        const b = el.getBoundingClientRect();
        return b.width > 1 && b.height > 1;
      };

      // The safe-area tokens as pixels, so padding made from them can be told apart.
      const probe = document.createElement("div");
      probe.style.cssText =
        "position:fixed;visibility:hidden;padding:var(--bk-safe-top) var(--bk-safe-right) var(--bk-safe-bottom) var(--bk-safe-left)";
      document.body.append(probe);
      const ps = getComputedStyle(probe);
      const safe = [ps.paddingTop, ps.paddingRight, ps.paddingBottom, ps.paddingLeft].map(parseFloat);
      probe.remove();
      const fromSafe = (v: number) => safe.some((s) => s > 0 && (Math.abs(v - s) < 0.5 || near(v - s, spacing)));

      /** Is this margin side `auto`? Setting it to auto changes nothing exactly when it already was. */
      const isAuto = (el: HTMLElement, prop: string) => {
        const before = el.getBoundingClientRect();
        const saved = el.style.getPropertyValue(prop);
        const savedPriority = el.style.getPropertyPriority(prop);
        el.style.setProperty(prop, "auto", "important");
        const after = el.getBoundingClientRect();
        if (saved) el.style.setProperty(prop, saved, savedPriority);
        else el.style.removeProperty(prop);
        return Math.abs(before.left - after.left) < 0.5 && Math.abs(before.top - after.top) < 0.5 && Math.abs(before.width - after.width) < 0.5;
      };

      const props = [
        ["margin-top", "margin"], ["margin-right", "margin"], ["margin-bottom", "margin"], ["margin-left", "margin"],
        ["padding-top", "padding"], ["padding-right", "padding"], ["padding-bottom", "padding"], ["padding-left", "padding"],
        ["row-gap", "gap"], ["column-gap", "gap"],
      ] as const;

      for (const el of document.body.querySelectorAll<HTMLElement>("*")) {
        if (el.closest("svg, script, style, noscript, option, [aria-hidden='true'] > svg") || !visible(el)) continue;
        const s = getComputedStyle(el);
        const packshotImg = el.matches(".bk-packshot > img");
        for (const [prop, kind] of props) {
          const raw = s.getPropertyValue(prop);
          if (raw === "normal" || raw === "") continue; // gap: normal
          const v = parseFloat(raw);
          if (!Number.isFinite(v) || near(v, spacing)) continue;
          if (kind === "padding" && (packshotImg || fromSafe(v))) continue;
          if (kind === "margin") {
            if (v < 0 && Math.abs(v + 4) < 0.05) continue; // the chevron hang
            if (isAuto(el, prop)) continue;
          }
          add("spacing", name(el), `${prop} ${Math.round(v * 100) / 100}`);
        }
      }

      // 2. Direct children of a gutter block start at the gutter.
      for (const block of document.querySelectorAll<HTMLElement>(".bk-gutter")) {
        if (!visible(block)) continue;
        const bs = getComputedStyle(block);
        const expected = block.getBoundingClientRect().left + parseFloat(bs.paddingLeft) + parseFloat(bs.borderLeftWidth);
        for (const child of block.children) {
          const cs = getComputedStyle(child);
          if (!visible(child) || cs.position === "absolute" || cs.position === "fixed") continue;
          if (parseFloat(cs.marginLeft) < 0) continue; // a hang into the gutter
          const left = child.getBoundingClientRect().left;
          if (Math.abs(left - expected) > 0.5) add("gutter", name(child), `starts at ${Math.round(left * 10) / 10}, the gutter is ${Math.round(expected * 10) / 10}`);
        }
      }

      // 3. Type scale, measured on the element that holds text.
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const el = n.parentElement;
        if (!el || !(n.textContent ?? "").trim() || el.closest("script, style, noscript") || !visible(el)) continue;
        const size = parseFloat(getComputedStyle(el).fontSize);
        const allowed = el.closest(".bk-fallback-letter") ? [...sizes, 54] : sizes;
        if (!near(size, allowed)) add("type", name(el), `font-size ${Math.round(size * 100) / 100} on "${(n.textContent ?? "").trim().slice(0, 24)}"`);
      }
      return found;
    },
    { spacing: SPACING, sizes: FONT_SIZES },
  );
}

/**
 * Motion check: reduced motion means no transform changes, only opacity. Call before the page's first navigation; it
 * samples every animation frame on every page the tab loads (results survive navigations in sessionStorage). The returned
 * function stops the check and lists each element whose transform (or translate, scale, rotate) changed, and each running
 * animation that animates one. Elements inside `.bk-press` (the finger-down press feedback) are ignored.
 */
export async function watchTransforms(page: Page): Promise<() => Promise<string[]>> {
  await page.addInitScript(() => {
    const KEY = "bk-proof-transforms";
    const read = (): Record<string, string> => {
      try {
        return JSON.parse(window.sessionStorage.getItem(KEY) ?? "{}");
      } catch {
        return {};
      }
    };
    const changed = read();
    const save = () => {
      try {
        window.sessionStorage.setItem(KEY, JSON.stringify(changed));
      } catch {
        /* no storage: the result stays in this page only */
      }
    };
    const last = new WeakMap<Element, string>();
    const describe = (el: Element) => {
      const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
      return `${el.tagName.toLowerCase()}${cls ? "." + cls : ""}${el.getAttribute("data-testid") ? `[${el.getAttribute("data-testid")}]` : ""}`;
    };
    const key = (el: Element) => {
      const s = getComputedStyle(el);
      return `${s.transform}|${s.translate}|${s.scale}|${s.rotate}`;
    };
    const tick = () => {
      if (document.body) {
        let dirty = false;
        for (const el of document.body.querySelectorAll("*")) {
          if (el.closest(".bk-press, svg")) continue;
          const now = key(el);
          const before = last.get(el);
          if (before !== undefined && before !== now) {
            changed[describe(el)] = `${before} -> ${now}`;
            dirty = true;
          }
          last.set(el, now);
        }
        for (const a of document.getAnimations()) {
          const effect = a.effect as KeyframeEffect | null;
          const target = effect?.target;
          if (!effect || !target || target.closest?.(".bk-press")) continue;
          const props = new Set(effect.getKeyframes().flatMap((k) => Object.keys(k)));
          for (const p of ["transform", "translate", "scale", "rotate"]) {
            if (props.has(p)) {
              changed[describe(target)] = `animates ${p}`;
              dirty = true;
            }
          }
        }
        if (dirty) save();
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  return async () => {
    await page.waitForTimeout(100);
    const found = await page.evaluate(() => {
      try {
        return JSON.parse(window.sessionStorage.getItem("bk-proof-transforms") ?? "{}") as Record<string, string>;
      } catch {
        return {};
      }
    });
    return Object.entries(found).map(([k, v]) => `${k}: ${v}`);
  };
}

export interface RollClip {
  where: string;
  detail: string;
}

/**
 * Rolling digits clip to one line even at 200% text size: sets the root font size to 200%, then checks that every rolling-digit
 * window (`[data-roll], .bk-roll`) clips its overflow and is no taller than one line. Returns null when the page has none.
 */
export async function measureRollClipping(page: Page): Promise<RollClip[] | null> {
  return page.evaluate(() => {
    const windows = [...document.querySelectorAll<HTMLElement>("[data-roll], .bk-roll")];
    if (windows.length === 0) return null;
    const prev = document.documentElement.style.fontSize;
    document.documentElement.style.fontSize = "200%";
    const found: { where: string; detail: string }[] = [];
    for (const el of windows) {
      const s = getComputedStyle(el);
      const font = parseFloat(s.fontSize);
      const line = s.lineHeight === "normal" ? font * 1.4 : parseFloat(s.lineHeight);
      const h = el.getBoundingClientRect().height;
      const where = `${el.tagName.toLowerCase()}.${typeof el.className === "string" ? el.className.trim().split(/\s+/).join(".") : ""}`;
      if (!["hidden", "clip"].includes(s.overflowY)) found.push({ where, detail: `overflow-y is ${s.overflowY}, not hidden or clip` });
      if (h > line * 1.15) found.push({ where, detail: `${Math.round(h)}px tall, more than one line (${Math.round(line)}px)` });
    }
    document.documentElement.style.fontSize = prev;
    return found;
  });
}
