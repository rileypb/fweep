import { describe, expect, it, jest } from '@jest/globals';
import { handleIfdbProxyHttpRequest } from '../../../shared/ifdb-proxy-http';

describe('handleIfdbProxyHttpRequest', () => {
  it('returns CORS headers for an allowed origin on GET requests', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue({
      status: 200,
      headers: {
        get: (headerName: string) => (
          headerName.toLowerCase() === 'content-type'
            ? 'application/json; charset=utf-8'
            : null
        ),
      },
      text: async () => JSON.stringify({ games: [] }),
    } as Response);

    const response = await handleIfdbProxyHttpRequest({
      method: 'GET',
      url: '/api/ifdb/search?query=bureau',
      origin: 'https://rileypb.github.io',
      allowedOrigins: ['https://rileypb.github.io'],
      fetchImpl: fetchMock,
    });

    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBe('https://rileypb.github.io');
    expect(response.headers.vary).toBe('Origin');
    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.headers['cache-control']).toBe('public, s-maxage=300, stale-while-revalidate=600');
  });

  it('rejects disallowed cross-origin requests', async () => {
    const fetchMock = jest.fn<typeof fetch>();

    const response = await handleIfdbProxyHttpRequest({
      method: 'GET',
      url: '/api/ifdb/search?query=bureau',
      origin: 'https://evil.example',
      allowedOrigins: ['https://rileypb.github.io'],
      fetchImpl: fetchMock,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
    expect(JSON.parse(response.body)).toEqual({
      error: 'Origin is not allowed to use the IFDB proxy.',
    });
  });

  it('answers OPTIONS requests for allowed origins without hitting IFDB', async () => {
    const fetchMock = jest.fn<typeof fetch>();

    const response = await handleIfdbProxyHttpRequest({
      method: 'OPTIONS',
      url: '/api/ifdb/search?query=bureau',
      origin: 'https://rileypb.github.io',
      allowedOrigins: ['https://rileypb.github.io'],
      fetchImpl: fetchMock,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(204);
    expect(response.headers['access-control-allow-origin']).toBe('https://rileypb.github.io');
    expect(response.headers['access-control-allow-methods']).toBe('GET, OPTIONS');
  });

  it('uses a longer cache policy for viewgame responses', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue({
      status: 200,
      headers: {
        get: (headerName: string) => (
          headerName.toLowerCase() === 'content-type'
            ? 'application/json; charset=utf-8'
            : null
        ),
      },
      text: async () => JSON.stringify({ ifdb: { tuid: 'abc123' } }),
    } as Response);

    const response = await handleIfdbProxyHttpRequest({
      method: 'GET',
      url: '/api/ifdb/viewgame?tuid=abc123',
      origin: 'https://rileypb.github.io',
      allowedOrigins: ['https://rileypb.github.io'],
      fetchImpl: fetchMock,
    });

    expect(response.status).toBe(200);
    expect(response.headers['cache-control']).toBe('public, s-maxage=86400, stale-while-revalidate=604800');
  });
});
