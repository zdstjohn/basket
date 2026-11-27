/** Thrown by a state that cannot be reached until a later task lands; the proof prints the reason and skips it. */
export class Pending extends Error {}

/**
 * The one decision the proof makes about an error: skip the test only for a `Pending` (and say why); anything else is a real
 * failure, because a screen that is registered and no longer contrastPending is finished, so a step that breaks on it is a bug.
 */
export function skipReason(err: unknown): string | null {
  return err instanceof Pending ? err.message : null;
}
