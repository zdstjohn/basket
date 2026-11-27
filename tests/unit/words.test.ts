import { describe, expect, it } from 'vitest';
import { matchFood } from '@/lib/domain/families';
import { singular } from '@/lib/domain/words';

describe('singular', () => {
  it('a typed kiwi flags "2 kiwis, peeled"', () => {
    expect(matchFood('kiwi', '2 kiwis, peeled', { wide: true })?.found).toBe('kiwis');
  });
  it.each([
    ['kiwis', 'kiwi'], ['zucchinis', 'zucchini'], ['raviolis', 'ravioli'], ['tortellinis', 'tortellini'],
    ['chilis', 'chili'], ['salamis', 'salami'], ['pepperonis', 'pepperoni'], ['loaves', 'loaf'],
    ['cookies', 'cookie'], ['brownies', 'brownie'], ['quiches', 'quiche'], ['brioches', 'brioche'],
    ['bries', 'brie'], ['octopi', 'octopus'], ['berries', 'berry'], ['tomatoes', 'tomato'], ['limes', 'lime'],
    ['leaves', 'leaf'], ['chilies', 'chili'],
  ])('%s becomes %s', (plural, one) => expect(singular(plural)).toBe(one));
  it.each(['hummus', 'couscous', 'asparagus', 'molasses', 'watercress', 'swiss', 'brie', 'kiwi'])(
    '%s still matches itself', (w) => expect(singular(w)).toBe(singular(singular(w))),
  );
  it('plural and singular lines match each other', () => {
    for (const [food, line] of [['octopus', '1 lb octopi'], ['brie', '4 oz bries'], ['hummus', '1 cup hummus'],
      ['couscous', '1 cup couscous'], ['asparagus', '1 bunch asparagus'], ['molasses', '2 tbsp molasses']]) {
      expect(matchFood(food, line)).not.toBeNull();
    }
  });
});
