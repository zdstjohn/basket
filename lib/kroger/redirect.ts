export const OAUTH_COOKIE = 'kroger_oauth';
export const OAUTH_COOKIE_PATH = '/api/kroger/callback';

/** A redirect target on this site: `path` keeps its own query and gains `fm`. Anything that parses off-site becomes /week. */
export function backTo(origin: string, path: string, fm: 'connected' | 'denied' | 'failed'): URL {
  let url = new URL(path, origin);
  if (url.origin !== origin) url = new URL('/week', origin);
  url.searchParams.set('fm', fm);
  return url;
}
