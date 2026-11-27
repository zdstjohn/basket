/** Speed of a drag over the last 100 ms, in px/ms. Positive is downward. */
export function velocity(samples: { t: number; y: number }[]): number {
  if (samples.length < 2) return 0;
  const last = samples[samples.length - 1];
  let first = last;
  for (let i = samples.length - 2; i >= 0; i--) {
    if (last.t - samples[i].t > 100) break;
    first = samples[i];
  }
  const dt = last.t - first.t;
  return dt > 0 ? (last.y - first.y) / dt : 0;
}

/** A flick faster than 0.5 px/ms or a drag past 30% of the sheet closes it. */
export function shouldDismiss(dragPx: number, sheetHeightPx: number, velocityPxPerMs: number): boolean {
  if (velocityPxPerMs > 0.5) return true;
  return sheetHeightPx > 0 && dragPx / sheetHeightPx > 0.3;
}
