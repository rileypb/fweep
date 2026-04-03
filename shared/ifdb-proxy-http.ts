import { proxyIfdbRequest, type IfdbProxyResult } from './ifdb-proxy';

export interface IfdbProxyHttpRequest {
  readonly method: string;
  readonly url: string;
  readonly origin?: string;
  readonly allowedOrigins?: readonly string[];
  readonly fetchImpl?: typeof fetch;
}

export interface IfdbProxyHttpResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly body: string;
}

function createJsonResponse(
  status: number,
  body: Record<string, string>,
  corsHeaders: Readonly<Record<string, string>>,
): IfdbProxyHttpResponse {
  return {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      ...corsHeaders,
    },
    body: JSON.stringify(body),
  };
}

function normalizeAllowedOrigins(allowedOrigins: readonly string[]): readonly string[] {
  return allowedOrigins
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

function buildCorsHeaders(
  requestOrigin: string | undefined,
  allowedOrigins: readonly string[],
): Readonly<Record<string, string>> {
  if (requestOrigin === undefined || requestOrigin.length === 0) {
    return {};
  }

  if (allowedOrigins.length === 0 || allowedOrigins.includes(requestOrigin)) {
    return {
      'access-control-allow-origin': requestOrigin,
      'access-control-allow-methods': 'GET, OPTIONS',
      vary: 'Origin',
    };
  }

  return {};
}

function buildCacheControlHeader(requestUrl: URL): string {
  if (requestUrl.pathname === '/api/ifdb/ping') {
    return 'no-store';
  }

  if (requestUrl.pathname === '/api/ifdb/viewgame') {
    return 'public, s-maxage=86400, stale-while-revalidate=604800';
  }

  return 'public, s-maxage=300, stale-while-revalidate=600';
}

export function parseAllowedProxyOrigins(rawValue: string | undefined): readonly string[] {
  if (rawValue === undefined) {
    return [];
  }

  return normalizeAllowedOrigins(rawValue.split(','));
}

export async function handleIfdbProxyHttpRequest(
  request: IfdbProxyHttpRequest,
): Promise<IfdbProxyHttpResponse> {
  const parsedRequestUrl = new URL(request.url, 'http://localhost');
  const allowedOrigins = normalizeAllowedOrigins(request.allowedOrigins ?? []);
  const requestOrigin = request.origin?.trim();

  if (requestOrigin && allowedOrigins.length > 0 && !allowedOrigins.includes(requestOrigin)) {
    return createJsonResponse(
      403,
      { error: 'Origin is not allowed to use the IFDB proxy.' },
      {},
    );
  }

  const corsHeaders = buildCorsHeaders(requestOrigin, allowedOrigins);

  if (request.method === 'OPTIONS') {
    return {
      status: 204,
      headers: corsHeaders,
      body: '',
    };
  }

  if (request.method !== 'GET') {
    return createJsonResponse(405, { error: 'Method not allowed.' }, corsHeaders);
  }

  if (parsedRequestUrl.pathname === '/api/ifdb/ping') {
    return {
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': buildCacheControlHeader(parsedRequestUrl),
        ...corsHeaders,
      },
      body: '{}',
    };
  }

  let proxyResult: IfdbProxyResult;
  try {
    proxyResult = await proxyIfdbRequest(
      parsedRequestUrl,
      request.fetchImpl,
    );
  } catch (error) {
    return createJsonResponse(
      502,
      {
        error: error instanceof Error ? error.message : 'IFDB proxy request failed.',
      },
      corsHeaders,
    );
  }

  return {
    status: proxyResult.status,
    headers: {
      'content-type': proxyResult.contentType,
      'cache-control': buildCacheControlHeader(parsedRequestUrl),
      ...corsHeaders,
    },
    body: proxyResult.body,
  };
}
