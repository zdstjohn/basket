/** An absolute http(s) URL (resolved against `base` when given), or null. Rejects javascript:, data: and the like. */
export function httpUrl(value: unknown, base?: string): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const u = new URL(value.trim(), base);
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.href.length <= 2000 ? u.href : null;
  } catch {
    return null;
  }
}
