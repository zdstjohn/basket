import { NextResponse } from 'next/server';
import { identifyDish, UnreadableError, type ImageMediaType } from '@/lib/ai/identify';
import type { UsageReport } from '@/lib/ai/provider';
import { IdentifyBodySchema } from '@/lib/ai/schemas';
import { recordUsage } from '@/lib/ai/usage';
import { isResponse, readJson, requireHouseholdWithinCap } from '@/lib/api/household-context';
import { updateHousehold } from '@/lib/db/queries/household';
import { searchRecipes } from '@/lib/recipes/search';
import { SourceLimitError } from '@/lib/recipes/search/provider';

const MAX_IMAGE_BYTES = 1_572_864; // 1.5 MB decoded; the browser sends at most about 300 KB.

function decodedLength(b64: string): number {
  const padding = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - padding;
}

/** The image type from its first bytes (a name or header the client sends is never trusted), or null. */
function sniffType(b64: string): ImageMediaType | null {
  const head = Buffer.from(b64.slice(0, 24), 'base64');
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) return 'image/png';
  if (head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP') {
    return 'image/webp';
  }
  return null;
}

/** The photo is read once and dropped: never stored, never logged. */
export async function POST(req: Request) {
  const body = IdentifyBodySchema.safeParse(await readJson(req));
  const ctx = await requireHouseholdWithinCap();
  if (isResponse(ctx)) return ctx;
  if (!body.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const { image, source } = body.data;
  const { sb, household } = ctx;

  if (decodedLength(image) > MAX_IMAGE_BYTES) return NextResponse.json({ error: 'too_large' }, { status: 413 });
  const mediaType = sniffType(image);
  if (!mediaType) return NextResponse.json({ error: 'bad_type' }, { status: 415 });

  const usages: UsageReport[] = [];
  let searches = 0;
  try {
    const guess = await identifyDish({ base64: image, mediaType }, { onUsage: (u) => void usages.push(u) });
    if (!guess.isFood || !guess.searchQuery.trim()) {
      return NextResponse.json({ guess: { ...guess, isFood: false }, options: [] });
    }
    const query = guess.searchQuery.trim();
    let found = await searchRecipes(query, source);
    searches++;
    // A long query can find nothing: try once more with just its first three words.
    const shorter = query.split(/\s+/).slice(0, 3).join(' ');
    if (found.options.length === 0 && shorter !== query) {
      found = await searchRecipes(shorter, source);
      searches++;
    }
    return NextResponse.json({ guess, ...found });
  } catch (e) {
    if (e instanceof UnreadableError) return NextResponse.json({ error: 'unreadable' }, { status: 422 });
    if (e instanceof SourceLimitError) return NextResponse.json({ error: 'source_limit' }, { status: 429 });
    console.error('identify failed', e instanceof Error ? e.message : 'unknown');
    return NextResponse.json({ error: 'identify_failed' }, { status: 502 });
  } finally {
    // Every model call costs money, even one whose answer was unusable or whose search then failed.
    try {
      for (const u of usages) {
        await recordUsage(sb, household.id, 'identify', u.model, { inputTokens: u.inputTokens, outputTokens: u.outputTokens });
      }
      // Only Brave costs money; Spoonacular's free plan does not.
      if (source === 'sites') {
        for (let i = 0; i < searches; i++) await recordUsage(sb, household.id, 'search', 'brave', { inputTokens: 0, outputTokens: 0 });
      }
      if (searches > 0 && household.recipe_source !== source) await updateHousehold(sb, household.id, { recipe_source: source });
    } catch (e) {
      console.error('identify bookkeeping failed', e instanceof Error ? e.message : 'unknown');
    }
  }
}
