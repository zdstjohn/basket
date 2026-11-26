import 'server-only';
import { generateObject, NoObjectGeneratedError } from 'ai';
import { fakeIdentify } from './fake';
import { getModel, UnreadableError, type UsageReport } from './provider';
import { DishGuessSchema, type DishGuess } from './schemas';

export { UnreadableError } from './provider';

export type ImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp';

const SYSTEM =
  'You look at one photo for a family meal planner. If it shows a dish or plated food, set isFood true and name ' +
  'the most likely home-cookable dish (dish, at most 80 characters, plain words such as "Chicken tacos"). ' +
  'searchQuery is a short recipe-search query for it (at most 80 characters, no site names). ' +
  'keyIngredients lists up to 8 ingredients you can see or expect. confidence is high, medium or low. ' +
  'If the photo is not food (a person, a place, an object), set isFood false, dish and searchQuery to empty strings, ' +
  'and keyIngredients to an empty list.';

/** One vision call: what dish is in this photo, and what to search for to cook it. */
export async function identifyDish(
  image: { base64: string; mediaType: ImageMediaType },
  opts: { onUsage?: (u: UsageReport) => void } = {},
): Promise<DishGuess> {
  const model = getModel('parse');
  if (process.env.AI_FAKE === '1') {
    const usage = { inputTokens: 100, outputTokens: 50 };
    opts.onUsage?.({ model, ...usage });
    const parsed = DishGuessSchema.safeParse(fakeIdentify(image.base64));
    if (!parsed.success) throw new UnreadableError(usage);
    return parsed.data;
  }
  try {
    const result = await generateObject({
      model,
      schema: DishGuessSchema,
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
      maxOutputTokens: 300,
      abortSignal: AbortSignal.timeout(30_000),
    });
    opts.onUsage?.({
      model,
      inputTokens: result.usage.inputTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
    });
    return result.object;
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) {
      const usage = { inputTokens: e.usage?.inputTokens ?? 0, outputTokens: e.usage?.outputTokens ?? 0 };
      opts.onUsage?.({ model, ...usage });
      throw new UnreadableError(usage);
    }
    throw e;
  }
}
