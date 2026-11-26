import 'server-only';
import { fakeLocationsResponse } from './fake';
import { krogerGet } from './http';
import { isKrogerFake } from './token';

export interface KrogerLocation {
  id: string;
  name: string;
  address: string;
  chain: string;
}

interface LocationsResponse {
  data?: {
    locationId: string;
    chain?: string;
    name?: string;
    address?: { addressLine1?: string; city?: string; state?: string; zipCode?: string };
  }[];
}

/** Kroger-family stores near a ZIP code, Fred Meyer first. */
export async function findLocations(zip: string): Promise<KrogerLocation[]> {
  const body = isKrogerFake()
    ? (fakeLocationsResponse(zip) as LocationsResponse)
    : await krogerGet<LocationsResponse>('/locations', { 'filter.zipCode.near': zip, 'filter.limit': '10' });
  const all = (body.data ?? []).map((l) => {
    const a = l.address ?? {};
    const street = [a.addressLine1, a.city].filter(Boolean).join(', ');
    const region = [a.state, a.zipCode].filter(Boolean).join(' ');
    return {
      id: l.locationId,
      name: l.name ?? 'Store',
      address: [street, region].filter(Boolean).join(', '),
      chain: l.chain ?? '',
    };
  });
  // Array.sort is stable: Fred Meyer first, the rest keep Kroger's nearest-first order.
  return all.sort((x, y) => Number(y.chain === 'FRED') - Number(x.chain === 'FRED'));
}
