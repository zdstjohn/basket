import { expect, it } from 'vitest';
import {
  everyoneLiked,
  summarize,
  verdictWords,
  savedLine,
  latestAnswer,
  lastHad,
  mealLine,
  searchLine,
  isRetired,
  dinnerToAsk,
  orderFavorites,
  ASK_DAYS,
  type Dinner,
  type Verdict,
  type Vote,
} from '@/lib/domain/verdicts';
import { dinnerDate } from '@/lib/domain/weeks';

const v = (votes: Record<string, Vote>, mealId = 'm', eatenOn = '2026-11-25'): Verdict => ({
  mealId,
  eatenOn,
  status: 'answered',
  votes,
});
const answered = (mealId: string, eatenOn: string, votes: Record<string, Vote> = { a: 'up' }): Verdict =>
  v(votes, mealId, eatenOn);
const skipped = (mealId: string, eatenOn: string): Verdict => ({ mealId, eatenOn, status: 'skipped', votes: {} });
const d = (mealId: string, date: string): Dinner => ({ mealId, date });
const rows = (...ids: string[]) => ids.map((id) => ({ id }));

const verdicts: Verdict[] = [
  answered('liked', '2026-11-20', { a: 'up', b: 'up' }),
  answered('liked2', '2026-11-20', { a: 'up' }),
  answered('mixed', '2026-11-20', { a: 'up', b: 'down', c: 'down' }),
  answered('retired', '2026-11-10', { a: 'down', b: 'down', c: 'up' }),
  answered('retired', '2026-11-24', { a: 'down', b: 'down', c: 'up', d: 'skip' }),
];

it('has a three day ask window', () => expect(ASK_DAYS).toBe(3));
it.each([
  [{ a: 'up', b: 'up' }, 'Everyone liked it'],
  [{ a: 'up', b: 'up', c: 'up', d: 'up', e: 'down' }, '4 of 5 liked it'],
  [{ a: 'up', b: 'up', c: 'up', d: 'down', e: 'skip' }, '3 of 4 liked it · 1 didn’t try'],
  [{ a: 'up', b: 'skip' }, 'Everyone liked it · 1 didn’t try'],
  [{ a: 'skip' }, null],
  [{}, null],
])('%j → %s', (votes, words) => expect(verdictWords(v(votes as Record<string, Vote>))).toBe(words));
it('a skipped dinner has no words', () => expect(verdictWords({ ...v({ a: 'up' }), status: 'skipped' })).toBeNull());
it('counts stored votes even for people who have since left', () => {
  expect(summarize(v({ gone: 'up', a: 'down' }))).toEqual({ liked: 1, tried: 2, didntTry: 0 });
});
it('writes the favorites line', () => {
  expect(mealLine({ verdict: v({ a: 'up' }), lastHad: '2026-11-22', timesPlanned: 3 })).toEqual({ strong: 'Everyone liked it', rest: 'last had Nov 22' });
  expect(mealLine({ verdict: v({ a: 'up' }), lastHad: null, timesPlanned: 3 })).toEqual({ strong: 'Everyone liked it', rest: null });
  expect(mealLine({ verdict: null, lastHad: '2026-11-03', timesPlanned: 2 })).toEqual({ strong: 'Made 2 times', rest: 'last had Nov 3' });
  expect(mealLine({ verdict: null, lastHad: '2026-11-03', timesPlanned: 0 })).toEqual({ strong: 'Made 1 time', rest: 'last had Nov 3' });
  expect(mealLine({ verdict: null, lastHad: null, timesPlanned: 1 })).toEqual({ strong: 'Made 1 time', rest: null });
  expect(mealLine({ verdict: null, lastHad: null, timesPlanned: 0 })).toEqual({ strong: 'Not made yet', rest: null });
  expect(searchLine({ verdict: v({ a: 'up' }), lastHad: '2026-11-22' })).toBe('You’ve made this. Everyone liked it · last had Nov 22');
  expect(searchLine({ verdict: null, lastHad: null })).toBe('You’ve made this.');
});
it('finds the latest date strictly before today', () => {
  const ds = [d('m', '2026-11-20'), d('m', '2026-11-25'), d('m', '2026-11-26'), d('x', '2026-11-24')];
  expect(lastHad(ds, 'm', '2026-11-26')).toBe('2026-11-25');
  expect(lastHad(ds, 'm', '2026-11-20')).toBeNull();
  expect(lastHad(ds, 'none', '2026-11-26')).toBeNull();
});
it('asks about the most recent unanswered dinner of the last three days, never today or later', () => {
  const dinners = [d('m1', '2026-11-22'), d('m2', '2026-11-23'), d('m3', '2026-11-25'), d('m4', '2026-11-26'), d('m5', '2026-11-27')];
  expect(dinnerToAsk(dinners, [], '2026-11-26')).toEqual(d('m3', '2026-11-25'));
  expect(dinnerToAsk(dinners, [answered('m3', '2026-11-25')], '2026-11-26')).toEqual(d('m2', '2026-11-23'));
  expect(dinnerToAsk(dinners, [skipped('m3', '2026-11-25'), skipped('m2', '2026-11-23')], '2026-11-26')).toBeNull();
  expect(dinnerToAsk([d('m1', '2026-11-22')], [], '2026-11-26')).toBeNull(); // four days ago
});
it('asks across the week boundary', () => {
  expect(dinnerToAsk([d('m1', dinnerDate('2026-11-22', 'sat'))], [], '2026-11-29')).toEqual(d('m1', '2026-11-28'));
});
it('treats the same meal on two nights as two dinners', () => {
  expect(dinnerToAsk([d('m1', '2026-11-24'), d('m1', '2026-11-25')], [answered('m1', '2026-11-25')], '2026-11-26')).toEqual(d('m1', '2026-11-24'));
});
it('retires a meal most people disliked on its two latest dinners, and brings it back after a good one', () => {
  const bad1 = answered('m', '2026-11-10', { a: 'down', b: 'down', c: 'up' });
  const bad2 = answered('m', '2026-11-24', { a: 'down', b: 'down', c: 'up', d: 'skip' });
  expect(isRetired([bad1], 'm')).toBe(false);
  expect(isRetired([bad1, bad2], 'm')).toBe(true);
  expect(isRetired([bad1, bad2, answered('m', '2026-11-25', { a: 'up', b: 'up' })], 'm')).toBe(false);
  expect(isRetired([bad1, bad2, skipped('m', '2026-11-25')], 'm')).toBe(true);
  expect(isRetired([answered('m', '2026-11-10', { a: 'up', b: 'down' }), bad2], 'm')).toBe(false); // half is not "most"
});
it('orders favorites: liked, unanswered, the rest, retired last, otherwise as given', () => {
  expect(orderFavorites(rows('retired', 'none', 'liked', 'mixed', 'liked2'), verdicts).map((r) => r.id)).toEqual(['liked', 'liked2', 'none', 'mixed', 'retired']);
});
it('starts everyone on liked', () => expect(everyoneLiked([{ id: 'a' }, { id: 'b' }])).toEqual({ a: 'up', b: 'up' }));
it('an answer where nobody tried it is no answer', () => {
  const nobody = answered('m', '2026-11-25', { a: 'skip' });
  const good = answered('m', '2026-11-20', { a: 'up' });
  expect(latestAnswer([nobody, good], 'm')).toEqual(good);
  expect(latestAnswer([skipped('m', '2026-11-25')], 'm')).toBeNull();
  expect(orderFavorites(rows('x', 'liked'), [answered('x', '2026-11-25', { a: 'skip' }), ...verdicts]).map((r) => r.id)).toEqual(['liked', 'x']);
});
it('words the line shown after answering', () => {
  expect(savedLine(v({ a: 'up', b: 'up' }), 'Tuscan white bean soup')).toBe('Everyone liked Tuscan white bean soup.');
  expect(savedLine(v({ a: 'up', b: 'down' }), 'Tacos')).toBe('Tacos: 1 of 2 liked it.');
  expect(savedLine(v({ a: 'up', b: 'skip' }), 'Tacos')).toBe('Tacos: Everyone liked it · 1 didn’t try.');
});
