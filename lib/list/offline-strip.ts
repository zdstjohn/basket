/** How long "Back online." stays on the list before it goes. */
export const STRIP_MS = 2000;

/**
 * The line shown when the signal returns. "Saved" is said only when every change made offline went through:
 * something was sent, the queue is empty and the server refused none of it. Otherwise it only says the phone is back.
 */
export function reconnectedStrip({ queueLeft, refused, sent }: { queueLeft: number; refused: boolean; sent: boolean }): "saved" | "back" {
  return sent && queueLeft === 0 && !refused ? "saved" : "back";
}
