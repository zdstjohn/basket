/** How long "Back online." stays on the list before it goes. */
export const STRIP_MS = 2000;

/**
 * The line shown when the signal returns. "Saved" is said only when every change made offline went through:
 * the queue is empty and the server refused none of them. Otherwise it only says the phone is back.
 */
export function reconnectedStrip({ queueLeft, refused }: { queueLeft: number; refused: boolean }): "saved" | "back" {
  return queueLeft === 0 && !refused ? "saved" : "back";
}
