/** A short tick where the phone supports it (Android). Never throws; false when nothing buzzed. */
export function tick(nav?: { vibrate?: (ms: number) => boolean }): boolean {
  try {
    const n = nav ?? (typeof navigator === "undefined" ? undefined : navigator);
    if (!n || typeof n.vibrate !== "function") return false;
    return n.vibrate(8) === true;
  } catch {
    return false;
  }
}
