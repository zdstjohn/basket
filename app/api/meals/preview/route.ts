import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isResponse, readJson, requireHousehold } from '@/lib/api/household-context';
import { makePreview, PreviewError } from '@/lib/photos/preview';
import { takePreviewSlot } from '@/lib/photos/preview-limit';
import { fetchPublicBytes, ImportError } from '@/lib/recipes/import-url';

// 5 s fetch + up to 10 s of image work + a few database calls.
export const maxDuration = 30;

const BodySchema = z.object({ mealId: z.string().min(1).max(100) });

/** Failures of the photo itself, which will fail the same way next time. Anything else is treated as transient. */
const PERMANENT = new Set(['blocked_host', 'bad_url', 'not_image', 'too_large']);

const unavailable = () => NextResponse.json({ error: 'unavailable' }, { status: 503, headers: { 'retry-after': '60' } });
const unreadable = (error = 'unreadable') => NextResponse.json({ error }, { status: 422 });

export async function POST(req: Request) {
  const body = BodySchema.safeParse(await readJson(req));
  const ctx = await requireHousehold();
  if (isResponse(ctx)) return ctx;
  if (!body.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const { sb } = ctx;
  const id = body.data.mealId;

  const { data: meal, error: readError } = await sb
    .from('meals')
    .select('id, photo_path, photo_url, photo_preview, photo_width')
    .eq('id', id)
    .maybeSingle();
  if (readError) return unavailable();
  if (!meal || (!meal.photo_path && !meal.photo_url)) return NextResponse.json({ error: 'no_photo' }, { status: 404 });

  // Already done: hand back what is stored, or the permanent verdict, without any work.
  if (meal.photo_preview) return NextResponse.json({ preview: meal.photo_preview, width: meal.photo_width });
  if (meal.photo_width === 0) return unreadable();

  if (!takePreviewSlot(ctx.household.id)) {
    return NextResponse.json({ error: 'slow_down' }, { status: 429, headers: { 'retry-after': '600' } });
  }

  // Only if the photo is still the one that was read: a photo changed mid-fetch must not get the old one's preview.
  const store = async (patch: { photo_preview: string; photo_width: number } | { photo_width: 0 }) => {
    let q = sb.from('meals').update(patch).eq('id', id);
    q = meal.photo_path ? q.eq('photo_path', meal.photo_path) : q.is('photo_path', null);
    q = meal.photo_url ? q.eq('photo_url', meal.photo_url) : q.is('photo_url', null);
    return q.select('id');
  };

  let out: { preview: string; width: number };
  try {
    let bytes: Uint8Array;
    if (meal.photo_path) {
      const { data, error } = await sb.storage.from('meal-photos').download(meal.photo_path);
      if (error || !data) return unavailable();
      bytes = new Uint8Array(await data.arrayBuffer());
    } else {
      bytes = await fetchPublicBytes(meal.photo_url as string);
    }
    out = await makePreview(bytes);
  } catch (e) {
    const permanent = e instanceof PreviewError || (e instanceof ImportError && PERMANENT.has(e.code));
    if (!permanent) return unavailable();
    try {
      await store({ photo_width: 0 });
    } catch {
      // The next load simply asks once more.
    }
    return unreadable(e instanceof ImportError ? e.code : 'unreadable');
  }

  try {
    const { data, error } = await store({ photo_preview: out.preview, photo_width: out.width });
    if (error) return unavailable();
    if (!data || data.length === 0) return NextResponse.json({ error: 'photo_changed' }, { status: 409 });
  } catch {
    return unavailable();
  }
  return NextResponse.json(out);
}
