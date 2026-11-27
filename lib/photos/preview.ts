import 'server-only';
import sharp from 'sharp';

const MAX_PREVIEW_CHARS = 2000;

/** A 16 px wide WebP as a data URL (the blur-up preview) and the source's width after rotating it upright. */
export async function makePreview(bytes: Uint8Array): Promise<{ preview: string; width: number }> {
  const rotated = sharp(bytes, { limitInputPixels: 100_000_000 }).rotate();
  const { info } = await rotated.clone().toBuffer({ resolveWithObject: true });
  const small = await rotated.clone().resize({ width: 16 }).webp({ quality: 40 }).toBuffer();
  const preview = `data:image/webp;base64,${small.toString('base64')}`;
  if (preview.length > MAX_PREVIEW_CHARS) throw new Error('preview too large');
  return { preview, width: info.width };
}
