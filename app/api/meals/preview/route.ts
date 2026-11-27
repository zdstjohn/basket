import { NextResponse } from 'next/server';
import { z } from 'zod';
import { isResponse, readJson, requireHousehold } from '@/lib/api/household-context';
import { updateMeal } from '@/lib/db/queries/meals';
import { makePreview } from '@/lib/photos/preview';
import { fetchPublicBytes, ImportError } from '@/lib/recipes/import-url';

const BodySchema = z.object({ mealId: z.string().min(1).max(100) });

export async function POST(req: Request) {
  const body = BodySchema.safeParse(await readJson(req));
  const ctx = await requireHousehold();
  if (isResponse(ctx)) return ctx;
  if (!body.success) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const { sb } = ctx;
  const id = body.data.mealId;

  const { data: meal } = await sb.from('meals').select('id, photo_path, photo_url').eq('id', id).maybeSingle();
  if (!meal || (!meal.photo_path && !meal.photo_url)) return NextResponse.json({ error: 'no_photo' }, { status: 404 });

  try {
    let bytes: Uint8Array;
    if (meal.photo_path) {
      const { data, error } = await sb.storage.from('meal-photos').download(meal.photo_path);
      if (error || !data) throw new ImportError('fetch_failed');
      bytes = new Uint8Array(await data.arrayBuffer());
    } else {
      bytes = await fetchPublicBytes(meal.photo_url as string);
    }
    const out = await makePreview(bytes);
    await updateMeal(sb, id, { photo_preview: out.preview, photo_width: out.width });
    return NextResponse.json(out);
  } catch (e) {
    // Remember that this photo could not be read, so nobody asks again.
    try {
      await updateMeal(sb, id, { photo_width: 0 });
    } catch {
      // The next load simply asks once more.
    }
    const error = e instanceof ImportError ? e.code : 'unreadable';
    return NextResponse.json({ error }, { status: 422 });
  }
}
