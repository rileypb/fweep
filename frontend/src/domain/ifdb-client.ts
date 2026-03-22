import {
  parseIfdbSearchResponse,
  parseIfdbViewGameResponse,
  type IfdbSearchResponsePayload,
  type IfdbViewGameResponsePayload,
  type NormalizedIfdbSearchResult,
} from './ifdb';
import type { AssociatedGameMetadata } from './map-types';

function buildIfdbSearchUrl(query: string): string {
  const params = new URLSearchParams({
    query,
  });
  return `/api/ifdb/search?${params.toString()}`;
}

function buildIfdbViewGameUrl(tuid: string): string {
  const params = new URLSearchParams({
    tuid,
  });
  return `/api/ifdb/viewgame?${params.toString()}`;
}

export async function searchIfdbGames(
  query: string,
  fetchImpl: typeof fetch = fetch,
): Promise<readonly NormalizedIfdbSearchResult[]> {
  const response = await fetchImpl(buildIfdbSearchUrl(query));
  if (!response.ok) {
    throw new Error(`IFDB search failed with status ${response.status}.`);
  }

  const payload = await response.json() as IfdbSearchResponsePayload;
  return parseIfdbSearchResponse(payload);
}

export async function viewIfdbGame(
  tuid: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AssociatedGameMetadata> {
  const response = await fetchImpl(buildIfdbViewGameUrl(tuid));
  if (!response.ok) {
    throw new Error(`IFDB viewgame failed with status ${response.status}.`);
  }

  const payload = await response.json() as IfdbViewGameResponsePayload;
  return parseIfdbViewGameResponse(payload);
}
