// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resizeForUpload, uploadMealPhoto } from '@/lib/photos/upload';

let drawn: { w: number; h: number } | null;
let toBlobArgs: { type?: string; quality?: number } | null;

function setupImage(width: number, height: number) {
  drawn = null;
  toBlobArgs = null;
  vi.stubGlobal('createImageBitmap', async () => ({ width, height, close() {} }));
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function (this: HTMLCanvasElement) {
    return { drawImage: () => (drawn = { w: this.width, h: this.height }) } as unknown as CanvasRenderingContext2D;
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, cb, type, quality) {
    toBlobArgs = { type, quality };
    cb(new Blob([`${this.width}x${this.height}`], { type: type ?? 'image/png' }));
  });
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe('resizeForUpload', () => {
  it('shrinks 4000x3000 to 1600x1200 JPEG at 0.8', async () => {
    setupImage(4000, 3000);
    const out = await resizeForUpload(new Blob(['x'], { type: 'image/png' }));
    expect(drawn).toEqual({ w: 1600, h: 1200 });
    expect(toBlobArgs).toEqual({ type: 'image/jpeg', quality: 0.8 });
    expect(out.type).toBe('image/jpeg');
  });

  it('does not enlarge 800x600', async () => {
    setupImage(800, 600);
    await resizeForUpload(new Blob(['x']));
    expect(drawn).toEqual({ w: 800, h: 600 });
  });

  it('handles portrait images by the longest edge', async () => {
    setupImage(3000, 4000);
    await resizeForUpload(new Blob(['x']));
    expect(drawn).toEqual({ w: 1200, h: 1600 });
  });
});

describe('uploadMealPhoto', () => {
  it('uploads to meal-photos without upsert and returns the path', async () => {
    const upload = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ upload });
    const path = await uploadMealPhoto({ storage: { from } } as never, 'h1', 'm1', new Blob(['x']));
    expect(from).toHaveBeenCalledWith('meal-photos');
    expect(path).toMatch(/^h1\/m1-\d+\.jpg$/);
    expect(upload).toHaveBeenCalledWith(path, expect.any(Blob), { contentType: 'image/jpeg', upsert: false });
  });

  it('throws when storage fails', async () => {
    const upload = vi.fn().mockResolvedValue({ error: { message: 'nope' } });
    await expect(uploadMealPhoto({ storage: { from: () => ({ upload }) } } as never, 'h', 'm', new Blob(['x']))).rejects.toThrow('nope');
  });
});
