import 'server-only';
import { fakeOn } from '@/lib/fake';
import { generateObject, NoObjectGeneratedError } from 'ai';
import { z } from 'zod';
import { fakeIdentify } from './fake';
import { getModel, thrownUsage, UnreadableError, usageReport, type UsageReport } from './provider';

const MAX_OUTPUT_TOKENS = 300;
import type { DishGuess } from './schemas';

export { UnreadableError } from './provider';

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp';

/** What the model may answer: lengths are not limited here, they are trimmed after (see clampGuess). */
const LooseGuessSchema = z.object({
  isFood: z.boolean(),
  dish: z.string(),
  searchQuery: z.string(),
  keyIngredients: z.array(z.string()),
  confidence: z.enum(['high', 'medium', 'low']),
});

/** Cut at a word boundary so it is at most `max` characters. */
function clampText(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > 0 ? cut.slice(0, space) : cut).trim();
}

/** A real answer that runs a little long is trimmed to the contract, never thrown away. */
function clampGuess(g: z.infer<typeof LooseGuessSchema>): DishGuess {
  return {
    isFood: g.isFood,
    dish: clampText(g.dish, 80),
    searchQuery: clampText(g.searchQuery, 80),
    keyIngredients: g.keyIngredients.map((i) => clampText(i, 40)).filter(Boolean).slice(0, 8),
    confidence: g.confidence,
  };
}

const SYSTEM =
  'You look at one photo for a family meal planner. If it shows a dish or plated food, set isFood true and name ' +
  'the most likely home-cookable dish (dish, the fuller name in under 80 characters, such as "Chicken tacos"). ' +
  'searchQuery is the dish in 2 to 4 plain words, for example "eggplant curry", "teriyaki salmon bowl" or "duck breast": ' +
  'no word "recipe", no sides, sauces or garnishes, no site names. ' +
  'keyIngredients lists up to 8 ingredients you can see or expect. confidence is high, medium or low. ' +
  'If the photo is not food (a person, a place, an object), set isFood false, dish and searchQuery to empty strings, ' +
  'and keyIngredients to an empty list.';

/** One vision call: what dish is in this photo, and what to search for to cook it. */
export async function identifyDish(
  image: { base64: string; mediaType: ImageMediaType },
  opts: { onUsage?: (u: UsageReport) => void } = {},
): Promise<DishGuess> {
  const model = getModel('parse');
  if (fakeOn('AI_FAKE')) {
    const usage = { inputTokens: 100, outputTokens: 50 };
    opts.onUsage?.({ model, ...usage });
    const parsed = LooseGuessSchema.safeParse(fakeIdentify(image.base64));
    if (!parsed.success) throw new UnreadableError(usage);
    return clampGuess(parsed.data);
  }
  try {
    const result = await generateObject({
      model,
      schema: LooseGuessSchema,
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'What dish is this, and what should I search for to cook it?' },
            { type: 'file', mediaType: image.mediaType, data: image.base64 },
          ],
        },
      ],
      temperature: 0,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      abortSignal: AbortSignal.timeout(30_000),
    });
    opts.onUsage?.(usageReport(model, result.usage, MAX_OUTPUT_TOKENS));
    return clampGuess(result.object);
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) {
      const report = usageReport(model, e.usage, MAX_OUTPUT_TOKENS);
      opts.onUsage?.(report);
      throw new UnreadableError({ inputTokens: report.inputTokens, outputTokens: report.outputTokens });
    }
    const thrown = thrownUsage(model, e, MAX_OUTPUT_TOKENS);
    if (thrown) opts.onUsage?.(thrown);
    throw e;
  }
}
