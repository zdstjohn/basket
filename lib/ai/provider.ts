import 'server-only';
import { fakeOn } from '@/lib/fake';
import { generateObject, NoObjectGeneratedError } from 'ai';
import type { z } from 'zod';
import { fakeGenerate, type AiTask } from './fake';

export const DEFAULT_MODEL = 'anthropic/claude-haiku-5.5';

/** The Vercel AI Gateway model id used for parsing and estimating. */
export function getModel(kind: 'parse'): string {
  void kind;
  return fakeOn('AI_FAKE') ? 'fake' : (process.env.AI_MODEL_PARSE || DEFAULT_MODEL);
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
  /** The model reported no token counts: these are the output limit, to be priced at the unknown-model rate. */
  assumed?: boolean;
}

/**
 * What a call cost. A model answer with no token counts is not free: it is billed as the whole output
 * limit at the unknown-model rate, so a gateway that omits usage cannot make calls invisible to the cap.
 */
export function usageReport(
  model: string,
  usage: { inputTokens?: number; outputTokens?: number } | undefined,
  maxOutputTokens: number,
): UsageReport {
  if (usage?.inputTokens == null || usage.outputTokens == null) {
    return { model, inputTokens: 0, outputTokens: maxOutputTokens, assumed: true };
  }
  return { model, inputTokens: usage.inputTokens, outputTokens: usage.outputTokens };
}

export const MAX_OUTPUT_TOKENS = 4000;

/**
 * True when the error, or anything it wraps, came back with an HTTP status. The SDK retries 408/409/429/5xx
 * and then throws a RetryError that has no status of its own: the real errors are `lastError` and `errors`.
 */
const hasStatus = (v: unknown, depth = 0): boolean => {
  if (typeof v !== 'object' || v === null || depth > 4) return false;
  const o = v as { statusCode?: unknown; status?: unknown; cause?: unknown; lastError?: unknown; errors?: unknown };
  if (typeof o.statusCode === 'number' || typeof o.status === 'number') return true;
  const inner = [o.cause, o.lastError, ...(Array.isArray(o.errors) ? o.errors : [])];
  return inner.some((e) => e !== v && hasStatus(e, depth + 1));
};

/**
 * What a model call that threw cost. An error that came back with an HTTP status (a bad key, a gateway
 * outage, a 429) was refused and bills nothing, so an outage cannot use up the month. One with no
 * status (a timeout, an abort, a dropped connection) may have run to the end: it is billed as the whole
 * output limit at the configured model's own rate. Returns null for nothing to bill.
 */
export function thrownUsage(model: string, e: unknown, maxOutputTokens: number): UsageReport | null {
  return hasStatus(e) ? null : { model, inputTokens: 0, outputTokens: maxOutputTokens };
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
  if (fakeOn('AI_FAKE')) {
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
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      abortSignal: AbortSignal.timeout(30_000),
    });
    const report = usageReport(model, result.usage, MAX_OUTPUT_TOKENS);
    args.onUsage?.(report);
    return { object: result.object as T, model, usage: { inputTokens: report.inputTokens, outputTokens: report.outputTokens } };
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) {
      const report = usageReport(model, e.usage, MAX_OUTPUT_TOKENS);
      args.onUsage?.(report);
      throw new UnreadableError({ inputTokens: report.inputTokens, outputTokens: report.outputTokens });
    }
    const thrown = thrownUsage(model, e, MAX_OUTPUT_TOKENS);
    if (thrown) args.onUsage?.(thrown);
    throw e;
  }
}
