import {
  parseIfdbSearchResponse,
  parseIfdbViewGameResponse,
  type IfdbSearchResponsePayload,
  type IfdbViewGameResponsePayload,
  type NormalizedIfdbSearchResult,
} from './ifdb';
import type { AssociatedGameMetadata } from './map-types';

export const IFDB_PROXY_PING_INTERVAL_MS = 15 * 60 * 1_000;

export interface IfdbProxyPingOptions {
  readonly force?: boolean;
}

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
  const query = params.toString();
  const pathWithQuery = query.length > 0 ? `${pathname}?${query}` : pathname;
  return baseUrl.length > 0 ? `${baseUrl}${pathWithQuery}` : pathWithQuery;
}

function isDevelopmentBuild(): boolean {
  const testGlobals = globalThis as {
    __FWEEP_TEST_DEV__?: boolean;
    process?: { env?: Record<string, string | undefined> };
  };
  const nodeEnv = testGlobals.process?.env?.NODE_ENV;
  if (nodeEnv === 'production') {
    return false;
  }

  if (nodeEnv === 'test') {
    return true;
  }

  if (import.meta.env?.DEV === true || testGlobals.__FWEEP_TEST_DEV__ === true) {
    return true;
  }

  return false;
}

function buildIfdbSearchUrl(query: string): string {
  const params = new URLSearchParams({
    query,
  });
  return buildIfdbProxyUrl('/api/ifdb/search', params);
}

function buildIfdbPingUrl(): string {
  return buildIfdbProxyUrl('/api/ifdb/ping', new URLSearchParams());
}

function buildIfdbViewGameUrl(tuid: string): string {
  const params = new URLSearchParams({
    tuid,
  });
  return buildIfdbProxyUrl('/api/ifdb/viewgame', params);
}

export async function pingIfdbProxy(
  fetchImpl: typeof fetch = fetch,
  options?: IfdbProxyPingOptions,
): Promise<void> {
  if (options?.force !== true && isDevelopmentBuild()) {
    return;
  }

  const response = await fetchImpl(buildIfdbPingUrl(), {
    cache: 'no-store',
    keepalive: true,
  });
  if (!response.ok) {
    throw new Error(`IFDB ping failed with status ${response.status}.`);
  }
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
