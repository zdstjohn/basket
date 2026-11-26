import 'server-only';
import chickenThighs from '@/tests/fixtures/kroger/products-chicken-thighs.json';
import empty from '@/tests/fixtures/kroger/products-empty.json';
import locations from '@/tests/fixtures/kroger/locations-98402.json';

/** Stand-ins for the two Kroger responses (KROGER_FAKE=1), served from tests/fixtures/kroger. */
export const fakeLocationsResponse = (zip: string): unknown => (zip === '98402' ? locations : empty);

export const fakeProductsResponse = (term: string): unknown =>
  term.toLowerCase().includes('chicken thigh') ? chickenThighs : empty;
