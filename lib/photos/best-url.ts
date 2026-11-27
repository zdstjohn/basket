const SIZED = /-(?:90x90|240x150|312x150|312x231|480x360|556x370)(\.(?:jpe?g|png|webp))$/i;

/** The largest size Spoonacular serves for a recipe picture; every other URL is returned unchanged. */
export function bestPhotoUrl(url: string): string {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return url;
  }
  if (u.hostname !== 'img.spoonacular.com' && u.hostname !== 'spoonacular.com') return url;
  if (!SIZED.test(u.pathname)) return url;
  u.pathname = u.pathname.replace(SIZED, '-636x393$1');
  return u.toString();
}
