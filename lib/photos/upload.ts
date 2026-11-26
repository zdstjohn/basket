import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/db/types';

/** Browser only: scales an image down so its longest edge is at most `maxEdge`, as JPEG at 0.8. */
export async function resizeForUpload(file: Blob, maxEdge = 1600): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the photo'))),
      'image/jpeg',
      0.8,
    );
  });
}

/** Uploads a photo to the private meal-photos bucket and returns its storage path. */
export async function uploadMealPhoto(
  sb: SupabaseClient<Database>,
  householdId: string,
  mealId: string,
  file: Blob,
): Promise<string> {
  const path = `${householdId}/${mealId}-${Date.now()}.jpg`;
  const { error } = await sb.storage
    .from('meal-photos')
    .upload(path, file, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error(error.message);
  return path;
}
