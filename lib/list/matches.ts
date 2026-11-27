import type { Candidate } from '@/lib/domain/packages';

/** One cached Fred Meyer search: what a food found at one store. Browser-safe (no server-only imports). */
export interface MatchRow {
  canonical: string;
  locationId: string;
  term: string;
  candidates: Candidate[];
  /** When the search ran (ISO). */
  fetchedAt: string;
}

/** The household's remembered product (UPC) and search wording for a food. */
export interface Choice {
  canonical: string;
  upc: string | null;
  searchTerm: string | null;
}

/** A cached search older than this is looked up again. */
export const MATCH_MAX_AGE_MS = 24 * 60 * 60 * 1000;
