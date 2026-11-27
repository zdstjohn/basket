import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const sql = readFileSync('supabase/migrations/0017_photo_preview.sql', 'utf8');

describe('migration 0017 column checks', () => {
  it('limits photo_preview to null or a small data:image/ URL', () => {
    expect(sql).toMatch(/photo_preview is null or \(photo_preview like 'data:image\/%' and length\(photo_preview\) <= 4096\)/i);
  });
  it('keeps photo_width at zero or more', () => {
    expect(sql).toMatch(/photo_width is null or photo_width >= 0/i);
  });
});
