import { describe, expect, it } from 'vitest';
import { dangerPillButton, pillButton } from '@/lib/ui';

describe('dangerPillButton', () => {
  it('is the pill with a red label, and no ink colour left to win over it', () => {
    expect(dangerPillButton).toContain('text-[#A6261B]');
    expect(dangerPillButton).not.toContain('text-ink');
    expect(dangerPillButton.replace('text-[#A6261B]', 'text-ink')).toBe(pillButton);
  });
});
