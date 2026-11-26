export interface ExtractedRecipe {
  name: string;
  servings: number | null;
  ingredients: string[];
  steps: string[];
  image: string | null;
  rating: number | null;
  ratingCount: number | null;
  totalMinutes: number | null;
}

type Json = unknown;
const isObj = (v: Json): v is Record<string, Json> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = (s: string): string =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();

const text = (v: Json): string | null => (typeof v === 'string' && v.trim() ? decode(v) : null);

function typeIncludes(node: Record<string, Json>, type: string): boolean {
  const t = node['@type'];
  return t === type || (Array.isArray(t) && t.includes(type));
}

/** Every object in a JSON-LD document, descending through arrays and @graph. */
function* walk(v: Json): Generator<Record<string, Json>> {
  if (Array.isArray(v)) {
    for (const x of v) yield* walk(x);
  } else if (isObj(v)) {
    yield v;
    if ('@graph' in v) yield* walk(v['@graph']);
  }
}

function firstNumber(v: Json): number | null {
  const items = Array.isArray(v) ? v : [v];
  for (const item of items) {
    if (typeof item === 'number' && item > 0) return item;
    if (typeof item === 'string') {
      const m = item.match(/\d+(?:\.\d+)?/);
      if (m && parseFloat(m[0]) > 0) return parseFloat(m[0]);
    }
  }
  return null;
}

function firstImage(v: Json): string | null {
  if (typeof v === 'string') return v.trim() || null;
  if (Array.isArray(v)) {
    for (const x of v) {
      const u = firstImage(x);
      if (u) return u;
    }
    return null;
  }
  if (isObj(v)) return firstImage(v.url ?? v.contentUrl);
  return null;
}

function steps(v: Json): string[] {
  if (typeof v === 'string') return v.split(/\n+/).map(decode).filter(Boolean);
  if (Array.isArray(v)) return v.flatMap(steps);
  if (isObj(v)) {
    if ('itemListElement' in v) return steps(v.itemListElement);
    const t = text(v.text) ?? text(v.name);
    return t ? [t] : [];
  }
  return [];
}

function minutes(v: Json): number | null {
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!m) return null;
  const total = Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) + Math.round(Number(m[4] ?? 0) / 60);
  return total > 0 ? total : null;
}

function num(v: Json): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? parseFloat(v.replace(/,/g, '')) : NaN;
  return Number.isFinite(n) ? n : null;
}

/** Reads the first schema.org Recipe from a page's JSON-LD. Steps are parsed but never stored by callers. */
export function extractRecipeJsonLd(html: string): ExtractedRecipe | null {
  const blocks = html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of blocks) {
    let doc: Json;
    try {
      doc = JSON.parse(block[1].trim());
    } catch {
      continue;
    }
    for (const node of walk(doc)) {
      if (!typeIncludes(node, 'Recipe')) continue;
      const rating = isObj(node.aggregateRating) ? node.aggregateRating : null;
      const ingredients = (Array.isArray(node.recipeIngredient) ? node.recipeIngredient : [])
        .map(text)
        .filter((s): s is string => s !== null);
      return {
        name: text(node.name) ?? '',
        servings: firstNumber(node.recipeYield),
        ingredients,
        steps: steps(node.recipeInstructions),
        image: firstImage(node.image),
        rating: rating ? num(rating.ratingValue) : null,
        ratingCount: rating ? num(rating.ratingCount ?? rating.reviewCount) : null,
        totalMinutes: minutes(node.totalTime),
      };
    }
  }
  return null;
}
