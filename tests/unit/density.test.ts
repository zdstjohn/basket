import { describe, expect, it } from 'vitest';
import { eachGrams, eachGramsKnown, gramsPerMl } from '@/lib/domain/density';

describe('gramsPerMl', () => {
  it('knows the pinned pantry foods', () => {
    expect(gramsPerMl('honey')).toBe(1.42);
    expect(gramsPerMl('olive oil')).toBe(0.92);
    expect(gramsPerMl('all-purpose flour')).toBe(0.53);
    expect(gramsPerMl('sugar')).toBe(0.85);
    expect(gramsPerMl('light brown sugar')).toBe(0.9);
    expect(gramsPerMl('salt')).toBe(1.2);
    expect(gramsPerMl('kosher salt')).toBe(0.8);
    expect(gramsPerMl('paprika')).toBe(0.5);
    expect(gramsPerMl('garlic powder')).toBe(0.5);
    expect(gramsPerMl('dried oregano')).toBe(0.2);
    expect(gramsPerMl('peanut butter')).toBe(1.1);
    expect(gramsPerMl('butter')).toBe(0.96);
    expect(gramsPerMl('chicken broth')).toBe(1);
    expect(gramsPerMl('dijon mustard')).toBe(1.05);
  });
  it('defaults to water', () => {
    expect(gramsPerMl('something unheard of')).toBe(1);
  });
  it('does not match a keyword inside another word', () => {
    expect(gramsPerMl('unsalted butter')).toBe(0.96);
  });
  it('knows sauces that contain a lighter word', () => {
    for (const n of ['pasta sauce', 'marinara', 'cheese sauce', 'pesto', 'orange juice', 'tomato paste', 'salsa']) {
      expect(gramsPerMl(n)).toBeGreaterThanOrEqual(1);
    }
    expect(eachGramsKnown('tomato paste')).toBeNull();
    expect(eachGramsKnown('orange juice')).toBeNull();
    expect(eachGramsKnown('tomato')).toBe(150);
  });
  it('knows light, airy foods (I2)', () => {
    for (const n of ['baby spinach', 'kale', 'arugula', 'romaine lettuce']) expect(gramsPerMl(n)).toBeLessThan(0.2);
    expect(gramsPerMl('shredded cheese')).toBe(0.47);
    expect(gramsPerMl('cheddar cheese')).toBe(0.47);
    expect(gramsPerMl('cream cheese')).toBe(1);
    expect(gramsPerMl('breadcrumbs')).toBe(0.45);
    expect(gramsPerMl('chopped walnuts')).toBe(0.5);
    expect(gramsPerMl('penne pasta')).toBe(0.45);
    expect(gramsPerMl('blueberries')).toBe(0.63);
  });
});

describe('eachGrams', () => {
  it('knows typical items', () => {
    expect(eachGrams('yellow onion')).toBe(225);
    expect(eachGrams('lemon')).toBe(100);
    expect(eachGrams('eggs')).toBe(50);
    expect(eachGrams('egg')).toBe(50);
  });
  it('defaults to 150 g, and says when it does not know', () => {
    expect(eachGrams('dragonfruit')).toBe(150);
    expect(eachGramsKnown('dragonfruit')).toBeNull();
    expect(eachGramsKnown('hamburger buns')).toBeNull();
    expect(eachGramsKnown('lemon')).toBe(100);
  });
});
