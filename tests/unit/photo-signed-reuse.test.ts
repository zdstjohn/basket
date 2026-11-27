import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mealPhotoSrc, mealPhotoSrcs } from '@/lib/db/queries/meals';

function fakeSb() {
  let n = 0;
  const calls: string[][] = [];
  const sb = {
    storage: {
      from: () => ({
        createSignedUrls: async (paths: string[], seconds: number) => {
          expect(seconds).toBe(3600);
          calls.push(paths);
          return { data: paths.map((p) => ({ path: p, signedUrl: `https://x.test/${p}?token=${++n}` })) };
        },
        createSignedUrl: async (p: string) => ({ data: { signedUrl: `https://x.test/${p}?token=${++n}` } }),
      }),
    },
  };
  return { sb: sb as never, calls };
}

describe('signed photo links across a realtime reload', () => {
  beforeEach(() => {
    vi.stubGlobal('window', {});
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-26T10:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('never shares a link between requests on a server (no window)', async () => {
    vi.unstubAllGlobals();
    const { sb, calls } = fakeSb();
    const meal = { id: 'm9', photo_path: 'h/server1.jpg', photo_url: null };
    const first = await mealPhotoSrcs(sb, [meal]);
    const second = await mealPhotoSrcs(sb, [meal]);
    expect(second.m9).not.toBe(first.m9);
    expect(calls).toHaveLength(2);
    expect(await mealPhotoSrc(sb, meal)).not.toBe(first.m9);
  });

  it('returns the same src for an uploaded photo on a second load, without signing again', async () => {
    const { sb, calls } = fakeSb();
    const meal = { id: 'm1', photo_path: 'h/reuse1.jpg', photo_url: null };
    const first = await mealPhotoSrcs(sb, [meal]);
    vi.advanceTimersByTime(49 * 60_000);
    const second = await mealPhotoSrcs(sb, [meal]);
    expect(second.m1).toBe(first.m1);
    expect(calls).toHaveLength(1);
    expect(await mealPhotoSrc(sb, meal)).toBe(first.m1);
  });

  it('signs again once the link is older than 50 minutes', async () => {
    const { sb, calls } = fakeSb();
    const meal = { id: 'm2', photo_path: 'h/reuse2.jpg', photo_url: null };
    const first = await mealPhotoSrcs(sb, [meal]);
    vi.advanceTimersByTime(50 * 60_000 + 1);
    const second = await mealPhotoSrcs(sb, [meal]);
    expect(second.m2).not.toBe(first.m2);
    expect(calls).toHaveLength(2);
  });

  it('only signs the paths it has no fresh link for', async () => {
    const { sb, calls } = fakeSb();
    await mealPhotoSrcs(sb, [{ id: 'a', photo_path: 'h/a.jpg', photo_url: null }]);
    await mealPhotoSrcs(sb, [
      { id: 'a', photo_path: 'h/a.jpg', photo_url: null },
      { id: 'b', photo_path: 'h/b.jpg', photo_url: null },
    ]);
    expect(calls[1]).toEqual(['h/b.jpg']);
  });
});
