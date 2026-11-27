import type { MealRow } from '@/lib/db/rows';

type Needs = Pick<MealRow, 'id' | 'photo_path' | 'photo_url' | 'photo_preview' | 'photo_width'>;

const MAX_AT_ONCE = 3;
const asked = new Set<string>();
const queue: string[] = [];
let running = 0;

function pump(): void {
  while (running < MAX_AT_ONCE && queue.length > 0) {
    const mealId = queue.shift() as string;
    running++;
    void fetch('/api/meals/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ mealId }),
    })
      .catch(() => {})
      .finally(() => {
        running--;
        pump();
      });
  }
}

/**
 * Browser only. Asks the server once per meal (per page session) for a preview and the source width of
 * meals that have a photo but no preview yet, three at a time. Never throws and is never awaited.
 */
export function ensurePreviews(meals: Needs[]): void {
  for (const m of meals) {
    if (!(m.photo_path || m.photo_url) || m.photo_preview || m.photo_width === 0 || asked.has(m.id)) continue;
    asked.add(m.id);
    queue.push(m.id);
  }
  pump();
}

/** Tests only. */
export function resetEnsurePreviews(): void {
  asked.clear();
  queue.length = 0;
  running = 0;
}
