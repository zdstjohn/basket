/** WCAG contrast helpers and a reader for the design values in app/globals.css. */

function channels(color: string): [number, number, number] {
  const c = color.trim();
  const hex = /^#([0-9a-f]{6})$/i.exec(c);
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgb = /^rgb\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})\s*\)$/i.exec(c);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  throw new Error(`Not a #RRGGBB or rgb() color: ${color}`);
}

function luminance(color: string): number {
  const [r, g, b] = channels(color).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio, 1 to 21, of two `#RRGGBB` or two `rgb()` colors. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

interface Rule {
  selector: string;
  body: string;
  /** Selector chain of the at-rules this rule sits inside, outermost first. */
  parents: string[];
}

function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Every rule that has declarations, with the at-rules around it. */
function rules(css: string): Rule[] {
  const out: Rule[] = [];
  const text = stripComments(css);
  const walk = (src: string, parents: string[]) => {
    let i = 0;
    while (i < src.length) {
      const open = src.indexOf("{", i);
      if (open < 0) break;
      // Anything before the last ";" or "}" is an earlier statement (an @import, say), not this rule's selector.
      const selector = src.slice(i, open).replace(/^[\s\S]*[;}]/, "").trim();
      let depth = 1;
      let j = open + 1;
      while (j < src.length && depth > 0) {
        if (src[j] === "{") depth++;
        else if (src[j] === "}") depth--;
        j++;
      }
      const body = src.slice(open + 1, j - 1);
      if (selector.startsWith("@")) walk(body, [...parents, selector]);
      else out.push({ selector, body, parents });
      i = j;
    }
  };
  walk(text, []);
  return out;
}

function declarations(body: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const m of body.matchAll(/--bk-([a-z0-9-]+)\s*:\s*([^;]+);/gi)) vars[m[1]] = m[2].trim();
  return vars;
}

/**
 * The `--bk-*` values of each look, keyed without the prefix (`ink`, `line-strong`).
 * Light is the top-level `:root`; dark is the top-level `[data-look="dark"]` block.
 */
export function parseTokens(css: string): { light: Record<string, string>; dark: Record<string, string> } {
  const light: Record<string, string> = {};
  const dark: Record<string, string> = {};
  for (const r of rules(css)) {
    if (r.parents.length > 0) continue;
    if (r.selector === ":root") Object.assign(light, declarations(r.body));
    if (r.selector === '[data-look="dark"]') Object.assign(dark, declarations(r.body));
  }
  return { light, dark };
}

/** The values inside `@media (prefers-color-scheme: dark) { [data-look="auto"] { … } }`. */
export function parseAutoTokens(css: string): Record<string, string> {
  const auto: Record<string, string> = {};
  for (const r of rules(css)) {
    if (r.selector === '[data-look="auto"]' && r.parents.some((p) => /prefers-color-scheme:\s*dark/.test(p)))
      Object.assign(auto, declarations(r.body));
  }
  return auto;
}
