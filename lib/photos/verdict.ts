/** The three photo crops: hero 2:1, tile 8:5, thumb 1:1. Nothing else. */
export type Crop = "hero" | "tile" | "thumb";

/** Source pixels wide a photo needs. These match --bk-photo-min-tile and --bk-photo-min-hero in globals.css. */
const MIN_TILE = 300;
const MIN_HERO = 600;

/**
 * What to do with a photo of a given width in a given crop.
 * `null` means the width is not known yet, so trust it. `0` means only that the server could not read the photo
 * (and must not be asked again); a browser often can, so it is treated as unknown too.
 * A small photo is never the hero: `'demote'` asks the caller to use a tile instead.
 */
export function photoVerdict(crop: Crop, sourceWidth: number | null): "ok" | "fallback" | "demote" {
  if (sourceWidth === null || sourceWidth === 0) return "ok";
  if (crop === "thumb") return "ok";
  if (sourceWidth < MIN_TILE) return "fallback";
  if (crop === "hero" && sourceWidth < MIN_HERO) return "demote";
  return "ok";
}
