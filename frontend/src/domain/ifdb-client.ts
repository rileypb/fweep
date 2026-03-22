import {
  parseIfdbSearchResponse,
  parseIfdbViewGameResponse,
  type IfdbSearchResponsePayload,
  type IfdbViewGameResponsePayload,
  type NormalizedIfdbSearchResult,
} from './ifdb';
import type { AssociatedGameMetadata } from './map-types';

function getIfdbProxyBaseUrl(): string {
  const viteValue = import.meta.env?.VITE_IFDB_PROXY_BASE_URL;
  if (typeof viteValue === 'string' && viteValue.trim().length > 0) {
    return viteValue.trim().replace(/\/+$/, '');
  }

  const processEnv = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  const processValue = processEnv?.VITE_IFDB_PROXY_BASE_URL;
  if (typeof processValue === 'string' && processValue.trim().length > 0) {
    return processValue.trim().replace(/\/+$/, '');
  }

  return '';
}

function buildIfdbProxyUrl(pathname: string, params: URLSearchParams): string {
  const baseUrl = getIfdbProxyBaseUrl();
  const pathWithQuery = `${pathname}?${params.toString()}`;
  return baseUrl.length > 0 ? `${baseUrl}${pathWithQuery}` : pathWithQuery;
}

function buildIfdbSearchUrl(query: string): string {
  const params = new URLSearchParams({
    query,
  });
  return buildIfdbProxyUrl('/api/ifdb/search', params);
}

function buildIfdbViewGameUrl(tuid: string): string {
  const params = new URLSearchParams({
    tuid,
  });
  return buildIfdbProxyUrl('/api/ifdb/viewgame', params);
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
