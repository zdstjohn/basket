import { describe, expect, it } from 'vitest';
import { bestPhotoUrl } from '@/lib/photos/best-url';

describe('bestPhotoUrl', () => {
  it('upgrades a Spoonacular size suffix to 636x393', () => {
    expect(bestPhotoUrl('https://img.spoonacular.com/recipes/716429-312x231.jpg')).toBe('https://img.spoonacular.com/recipes/716429-636x393.jpg');
    expect(bestPhotoUrl('https://spoonacular.com/recipeImages/1-90x90.png')).toBe('https://spoonacular.com/recipeImages/1-636x393.png');
  });
  it('leaves the best size and every other host alone', () => {
    expect(bestPhotoUrl('https://img.spoonacular.com/recipes/716429-636x393.jpg')).toBe('https://img.spoonacular.com/recipes/716429-636x393.jpg');
    expect(bestPhotoUrl('https://example.com/a-312x231.jpg')).toBe('https://example.com/a-312x231.jpg');
    expect(bestPhotoUrl('https://evil.test/img.spoonacular.com/a-312x231.jpg')).toBe('https://evil.test/img.spoonacular.com/a-312x231.jpg');
    expect(bestPhotoUrl('not a url')).toBe('not a url');
  });
});
