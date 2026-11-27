import 'server-only';
import blackBeans from '@/tests/fixtures/kroger/products-black-beans.json';
import chickenThighs from '@/tests/fixtures/kroger/products-chicken-thighs.json';
import eggs from '@/tests/fixtures/kroger/products-eggs.json';
import empty from '@/tests/fixtures/kroger/products-empty.json';
import honey from '@/tests/fixtures/kroger/products-honey.json';
import koshersalt from '@/tests/fixtures/kroger/products-kosher-salt.json';
import locations from '@/tests/fixtures/kroger/locations-98402.json';
import milk from '@/tests/fixtures/kroger/products-milk.json';
import oliveOil from '@/tests/fixtures/kroger/products-olive-oil.json';

/** Stand-ins for the two Kroger responses (KROGER_FAKE=1), served from tests/fixtures/kroger. */
export const fakeLocationsResponse = (zip: string): unknown => (zip === '98402' ? locations : empty);

const BY_KEYWORD: [string, unknown][] = [
  ['chicken thigh', chickenThighs],
  ['black bean', blackBeans],
  ['egg', eggs],
  ['milk', milk],
  ['kosher salt', koshersalt],
  ['olive oil', oliveOil],
  ['honey', honey],
];

export const fakeProductsResponse = (term: string): unknown => {
  const t = term.toLowerCase();
  return BY_KEYWORD.find(([k]) => t.includes(k))?.[1] ?? empty;
};

/** The one product the fake cart refuses, so the "some items were rejected" path can be run without Kroger. */
export const FAKE_REJECTED_UPC = '0020000000999';

/** Stand-in for PUT /v1/cart/add (KROGER_FAKE=1): everything is added except FAKE_REJECTED_UPC. */
export const fakeCartResult = (upcs: string[]): { ok: string[]; rejected: string[] } => ({
  ok: upcs.filter((u) => u !== FAKE_REJECTED_UPC),
  rejected: upcs.filter((u) => u === FAKE_REJECTED_UPC),
});
