import {
  handleIfdbProxyHttpRequest,
  parseAllowedProxyOrigins,
} from '../../shared/ifdb-proxy-http';

export interface VercelRequestLike {
  method?: string;
  url?: string;
  headers: Record<string, string | string[] | undefined>;
}

export interface VercelResponseLike {
  status: (statusCode: number) => VercelResponseLike;
  setHeader: (name: string, value: string) => void;
  send: (body: string) => void;
}

function getHeaderValue(
  headers: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = headers[key] ?? headers[key.toLowerCase()];
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export async function handleIfdbVercelRequest(
  request: VercelRequestLike,
  response: VercelResponseLike,
): Promise<void> {
  try {
    const proxyResponse = await handleIfdbProxyHttpRequest({
      method: request.method ?? 'GET',
      url: request.url ?? '/',
      origin: getHeaderValue(request.headers, 'origin'),
      allowedOrigins: parseAllowedProxyOrigins(process.env.IFDB_PROXY_ALLOWED_ORIGINS),
    });

    response.status(proxyResponse.status);
    for (const [headerName, headerValue] of Object.entries(proxyResponse.headers)) {
      response.setHeader(headerName, headerValue);
    }
    response.send(proxyResponse.body);
  } catch (error) {
    response.status(502);
    response.setHeader('content-type', 'application/json; charset=utf-8');
    response.send(JSON.stringify({
      error: error instanceof Error ? error.message : 'IFDB proxy request failed.',
    }));
  }
}
