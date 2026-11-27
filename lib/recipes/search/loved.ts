import type { RecipeOption } from './provider';

const PRIOR_MEAN = 3.8;
const PRIOR_WEIGHT = 25;
const MIN_COUNT_FOR_FAVOURITE = 50;
const MIN_LIKES_FOR_FAVOURITE = 500;
const FAVOURITE_SCORE = 4.5;

const hasRating = (o: RecipeOption) => o.rating !== null && Number.isFinite(o.rating) && o.rating > 0;
const hasLikes = (o: RecipeOption) => o.likes !== null && Number.isFinite(o.likes) && o.likes > 0;

/** How loved a recipe is on a 0-5 scale: 0 when there is no rating or likes to go on. */
export function lovedScore(o: RecipeOption): number {
  if (hasRating(o)) {
    const count = o.ratingCount !== null && Number.isFinite(o.ratingCount) && o.ratingCount > 0 ? o.ratingCount : 1;
    return (PRIOR_WEIGHT * PRIOR_MEAN + (o.rating as number) * count) / (PRIOR_WEIGHT + count);
  }
  if (hasLikes(o)) return PRIOR_MEAN + 1.2 * Math.min(1, Math.log10(1 + (o.likes as number)) / 4);
  return 0;
}

/** Stable sort, most loved first; unrated options keep their order at the end. */
export function sortByLoved(options: RecipeOption[]): RecipeOption[] {
  return options
    .map((o, i) => ({ o, i, s: lovedScore(o) }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.o);
}

/** True when there is enough evidence to point at this one as a favourite. */
export function isMostLoved(o: RecipeOption): boolean {
  if (lovedScore(o) < FAVOURITE_SCORE) return false;
  if (hasRating(o)) return (o.ratingCount ?? 0) >= MIN_COUNT_FOR_FAVOURITE;
  return (o.likes ?? 0) >= MIN_LIKES_FOR_FAVOURITE;
}

const num = (n: number) => n.toLocaleString('en-US');

/** "★ 4.7 · 1,203 ratings", "★ 4.7", "♥ 2,340 likes", or null when there is no data. Never invents a rating. */
export function ratingLine(o: RecipeOption): string | null {
  if (hasRating(o)) {
    const stars = `★ ${(o.rating as number).toFixed(1)}`;
    const c = o.ratingCount;
    if (c === null || !Number.isFinite(c) || c <= 0) return stars;
    return `${stars} · ${num(c)} ${c === 1 ? 'rating' : 'ratings'}`;
  }
  if (hasLikes(o)) {
    const l = o.likes as number;
    return `♥ ${num(l)} ${l === 1 ? 'like' : 'likes'}`;
  }
  return null;
}
