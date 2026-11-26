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
  constructor(public readonly usage?: { inputTokens: number; outputTokens: number }) {
    super('unreadable');
    this.name = 'UnreadableError';
  }
}

export interface UsageReport {
  model: string;
  inputTokens: number;
  outputTokens: number;
}

export interface GenerateArgs<T> {
  /** Called once per model call, including calls whose answer turns out unreadable (they cost money too). */
  onUsage?: (u: UsageReport) => void;
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
    if (!parsed.success) {
      const usage = { inputTokens: 100, outputTokens: 50 };
      args.onUsage?.({ model, ...usage });
      throw new UnreadableError(usage);
    }
    args.onUsage?.({ model, inputTokens: 100, outputTokens: 50 });
    return { object: parsed.data, model, usage: { inputTokens: 100, outputTokens: 50 } };
  }
  try {
    const result = await generateObject({
      model,
      schema: args.schema,
      system: args.system,
      prompt: args.prompt,
      temperature: 0,
      maxOutputTokens: 4000,
      abortSignal: AbortSignal.timeout(30_000),
    });
    const usage = { inputTokens: result.usage.inputTokens ?? 0, outputTokens: result.usage.outputTokens ?? 0 };
    args.onUsage?.({ model, ...usage });
    return { object: result.object as T, model, usage };
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) {
      const usage = { inputTokens: e.usage?.inputTokens ?? 0, outputTokens: e.usage?.outputTokens ?? 0 };
      args.onUsage?.({ model, ...usage });
      throw new UnreadableError(usage);
    }
    throw e;
  }
}
