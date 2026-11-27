import 'server-only';
import sharp from 'sharp';

const MAX_PREVIEW_CHARS = 2000;
const MAX_PIXELS = 50_000_000;
const SHARP_OPTIONS = { limitInputPixels: MAX_PIXELS, failOn: 'error' as const };
const TIMEOUT_SECONDS = 10;

/** The photo itself cannot be turned into a preview (not an image, SVG, too many pixels, undecodable): a permanent failure. */
export class PreviewError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PreviewError';
  }
}

/**
 * A 16 px wide WebP as a data URL (the blur-up preview) and the source's width after rotating it upright.
 * The width comes from the header (width and height swap for EXIF orientations 5 to 8); only the 16 px copy is decoded.
 */
export async function makePreview(bytes: Uint8Array): Promise<{ preview: string; width: number }> {
  try {
    const meta = await sharp(bytes, SHARP_OPTIONS).metadata();
    if (meta.format === 'svg') throw new PreviewError('svg');
    if (!meta.width || !meta.height) throw new PreviewError('no size');
    if (meta.width * meta.height > MAX_PIXELS) throw new PreviewError('too many pixels');
    const width = (meta.orientation ?? 1) >= 5 ? meta.height : meta.width;
    const small = await sharp(bytes, SHARP_OPTIONS)
      .rotate()
      .resize({ width: 16 })
      .webp({ quality: 40 })
      .timeout({ seconds: TIMEOUT_SECONDS })
      .toBuffer();
    const preview = `data:image/webp;base64,${small.toString('base64')}`;
    if (preview.length > MAX_PREVIEW_CHARS) throw new PreviewError('preview too large');
    return { preview, width };
  } catch (e) {
    if (e instanceof PreviewError) throw e;
    throw new PreviewError(e instanceof Error ? e.message : 'unreadable');
  }
}
