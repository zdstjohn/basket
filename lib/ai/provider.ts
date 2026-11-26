import 'server-only';
import { generateObject, NoObjectGeneratedError } from 'ai';
import type { z } from 'zod';
import { fakeGenerate, type AiTask } from './fake';

export const DEFAULT_MODEL = 'anthropic/claude-haiku-5.5';

/** The Vercel AI Gateway model id used for parsing and estimating. */
export function getModel(kind: 'parse'): string {
  void kind;
  return process.env.AI_FAKE === '1' ? 'fake' : (process.env.AI_MODEL_PARSE || DEFAULT_MODEL);
}

/** The model's answer could not be read as the expected shape. */
export class UnreadableError extends Error {
  constructor() {
    super('unreadable');
    this.name = 'UnreadableError';
  }
}

export interface GenerateArgs<T> {
  task: AiTask;
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
}

export interface GenerateResult<T> {
  object: T;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

/** One structured model call. Throws UnreadableError when the output does not fit `schema`. */
export async function generateStructured<T>(args: GenerateArgs<T>): Promise<GenerateResult<T>> {
  const model = getModel('parse');
  if (process.env.AI_FAKE === '1') {
    const parsed = args.schema.safeParse(fakeGenerate(args.task, args.prompt));
    if (!parsed.success) throw new UnreadableError();
    return { object: parsed.data, model, usage: { inputTokens: 100, outputTokens: 50 } };
  }
  try {
    const result = await generateObject({
      model,
      schema: args.schema,
      system: args.system,
      prompt: args.prompt,
      temperature: 0,
      abortSignal: AbortSignal.timeout(30_000),
    });
    return {
      object: result.object as T,
      model,
      usage: { inputTokens: result.usage.inputTokens ?? 0, outputTokens: result.usage.outputTokens ?? 0 },
    };
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) throw new UnreadableError();
    throw e;
  }
}
