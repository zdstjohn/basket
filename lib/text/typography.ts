import type { Quantity } from "@/lib/domain/types";
import { formatQuantity } from "@/lib/domain/units";

/** Straight quotes and apostrophes become curly; `3-4` gets an en dash; `...` becomes one character. */
export function curly(text: string): string {
  return text
    .replace(/\.\.\./g, "…")
    .replace(/(\d)-(\d)/g, "$1–$2")
    .replace(/(^|[\s([{—–])"/g, "$1“")
    .replace(/"/g, "”")
    .replace(/(^|[\s([{—–“])'/g, "$1‘")
    .replace(/'/g, "’");
}

export function servingsText(n: number): string {
  const text = String(Math.round(n * 10) / 10);
  return `${text} ${n === 1 ? "serving" : "servings"}`;
}

export function portionText(f: number): string {
  const text = String(Math.round(f * 10) / 10);
  return f === 1 ? "1 portion" : `${text} of a portion`;
}

const G_PER_OZ = 28.349523125;
const G_PER_LB = 453.59237;
const ML_PER_TSP = 4.92892159;
const ML_PER_TBSP = 14.78676478;
const ML_PER_CUP = 236.5882365;
const ML_PER_GALLON = 3785.411784;

const GLYPHS: [number, string][] = [
  [0.25, "¼"], [0.5, "½"], [0.75, "¾"], [1 / 3, "⅓"], [2 / 3, "⅔"],
];

export interface QuantityParts {
  lead: string;
  built: string | null;
  rest: string;
}

/** The unit and size that `formatQuantity` would pick, as a number plus the words after it. */
function pick(q: Quantity): { value: number; unit: string; plural: boolean } | null {
  if (q.kind === "mass") {
    return q.amount < G_PER_LB
      ? { value: q.amount / G_PER_OZ, unit: "oz", plural: false }
      : { value: q.amount / G_PER_LB, unit: "lb", plural: false };
  }
  if (q.kind === "volume") {
    // A quarter cup up to a cup reads better in cups when it lands on ¼ ⅓ ½ ⅔ ¾ (formatQuantity says 8 tbsp).
    const cups = q.amount / ML_PER_CUP;
    if (cups >= 0.23 && GLYPHS.some(([target]) => Math.abs(cups - target) <= 0.02)) {
      return { value: cups, unit: "cup", plural: true };
    }
    const steps: [string, number, boolean][] = [
      ["gallon", ML_PER_GALLON, true],
      ["cup", ML_PER_CUP, true],
      ["tbsp", ML_PER_TBSP, false],
    ];
    for (const [unit, ml, plural] of steps) if (q.amount >= ml) return { value: q.amount / ml, unit, plural };
    return { value: q.amount / ML_PER_TSP, unit: "tsp", plural: false };
  }
  if (!q.countUnit) return { value: q.amount, unit: "", plural: false };
  const u = q.countUnit;
  return { value: q.amount, unit: u, plural: true };
}

const plain = (n: number): string => n.toFixed(1).replace(/\.0$/, "");

function pluralize(unit: string, value: number): string {
  if (value <= 1) return unit;
  return unit + (/(ch|sh|s|x|z)$/.test(unit) ? "es" : "s");
}

/**
 * A quantity split for display: `lead` is plain text (a whole number, a fraction glyph or both),
 * `built` is a built fraction like "1/8" that wants `.bk-qty`, `rest` is the unit with its leading space.
 * Snaps from the unrounded amount. Anything it cannot snap reads as `formatQuantity` writes it.
 */
export function quantityParts(q: Quantity): QuantityParts {
  const p = pick(q);
  if (!p) return fallback(q);
  const { value } = p;
  if (!Number.isFinite(value) || value < 0) return fallback(q);
  const whole = Math.floor(value + 1e-9);
  const frac = value - whole;
  const unitWords = (n: number): string => {
    if (!p.unit) return "";
    // Mass and volume units that never take an "s" (oz, lb, tsp, tbsp) stay as they are; cups and gallons pluralize.
    if (p.plural && (q.kind === "volume" || q.kind === "count")) return ` ${pluralize(p.unit, n)}`;
    return ` ${p.unit}`;
  };

  if (frac < 0.02 || frac > 0.98) {
    const w = frac > 0.98 ? whole + 1 : whole;
    const text = String(w);
    if (q.kind === "count" && !q.countUnit) return { lead: text, built: null, rest: "" };
    return { lead: text, built: null, rest: unitWords(w) };
  }
  for (const [target, glyph] of GLYPHS) {
    if (Math.abs(frac - target) <= 0.02) {
      return { lead: `${whole > 0 ? whole : ""}${glyph}`, built: null, rest: unitWords(value) };
    }
  }
  for (const eighth of [1, 3, 5, 7]) {
    if (Math.abs(frac - eighth / 8) <= 0.01) {
      return {
        lead: whole > 0 ? `${whole} ` : "",
        built: `${eighth}/8`,
        rest: unitWords(value),
      };
    }
  }
  const shown = plain(value);
  return { lead: shown, built: null, rest: unitWords(Number(shown)) };
}

function fallback(q: Quantity): QuantityParts {
  return { lead: formatQuantity(q), built: null, rest: "" };
}
