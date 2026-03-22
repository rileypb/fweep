const IFDB_BASE_URL = 'https://ifdb.org';
const MAX_SEARCH_QUERY_LENGTH = 120;
const MAX_VIEWGAME_TUID_LENGTH = 64;
const IFDB_REQUEST_TIMEOUT_MS = 5_000;

export const IFDB_PROXY_USER_AGENT = 'fweep-ifdb-proxy/1.0 (+https://github.com/rileypb/fweep)';

export interface IfdbProxyResult {
  readonly status: number;
  readonly contentType: string;
  readonly body: string;
}

function createJsonErrorResult(status: number, message: string): IfdbProxyResult {
  return {
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify({ error: message }),
  };
}

function requireSearchParam(url: URL, key: string, maxLength: number): string | null {
  const value = url.searchParams.get(key)?.trim() ?? '';
  if (value.length === 0) {
    return null;
  }

  if (value.length > maxLength) {
    throw new Error(`Query parameter "${key}" must be at most ${maxLength} characters long.`);
  }

  return value;
}

function createTimeoutSignal(timeoutMs: number): AbortSignal | undefined {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }

  return undefined;
}

export function buildIfdbUpstreamUrl(requestUrl: URL): string {
  if (requestUrl.pathname === '/api/ifdb/search') {
    const query = requireSearchParam(requestUrl, 'query', MAX_SEARCH_QUERY_LENGTH);
    if (query === null) {
      throw new Error('Missing required query parameter "query".');
    }

    const params = new URLSearchParams({
      json: '',
      searchfor: query,
    });
    return `${IFDB_BASE_URL}/search?${params.toString()}`;
  }

  if (requestUrl.pathname === '/api/ifdb/viewgame') {
    const tuid = requireSearchParam(requestUrl, 'tuid', MAX_VIEWGAME_TUID_LENGTH);
    if (tuid === null) {
      throw new Error('Missing required query parameter "tuid".');
    }

    const params = new URLSearchParams({
      json: '',
      id: tuid,
    });
    return `${IFDB_BASE_URL}/viewgame?${params.toString()}`;
  }

  throw new Error(`Unsupported IFDB proxy path: ${requestUrl.pathname}`);
}

export async function proxyIfdbRequest(
  requestUrl: URL,
  fetchImpl: typeof fetch = fetch,
): Promise<IfdbProxyResult> {
  let upstreamUrl: string;
  try {
    upstreamUrl = buildIfdbUpstreamUrl(requestUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid IFDB proxy request.';
    const status = message.startsWith('Missing required query parameter') ? 400 : 404;
    return createJsonErrorResult(status, message);
  }

  const upstreamResponse = await fetchImpl(upstreamUrl, {
    headers: {
      accept: 'application/json',
      'user-agent': IFDB_PROXY_USER_AGENT,
    },
    signal: createTimeoutSignal(IFDB_REQUEST_TIMEOUT_MS),
  });

  return {
    status: upstreamResponse.status,
    contentType: upstreamResponse.headers.get('content-type') ?? 'application/json; charset=utf-8',
    body: await upstreamResponse.text(),
  };
}
