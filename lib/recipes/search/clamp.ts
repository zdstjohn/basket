import type { IngredientLine } from '@/lib/domain/types';
import { httpUrl } from '../url';
import type { RecipeOption } from './provider';

const MAX_INGREDIENTS = 80;
const MAX_STRUCTURED = 60;

/** Makes a server-built option fit RecipeOptionSchema, or returns null when it has no usable url or image. */
export function clampOption(o: RecipeOption): RecipeOption | null {
  const url = httpUrl(o.url);
  const image = httpUrl(o.image);
  const title = o.title.trim().slice(0, 120);
  if (!url || !image || !title) return null;
  const structured = o.structured
    ? o.structured.slice(0, MAX_STRUCTURED).map<IngredientLine>((l) => ({
        ...l,
        canonical: l.canonical.slice(0, 80),
        unit: l.unit.slice(0, 30),
      }))
    : null;
  return {
    ...o,
    url,
    image,
    title,
    site: o.site.slice(0, 120),
    ingredients: o.ingredients.slice(0, MAX_INGREDIENTS).map((s) => s.slice(0, 300)),
    structured: structured && structured.length > 0 ? structured : null,
  };
}
