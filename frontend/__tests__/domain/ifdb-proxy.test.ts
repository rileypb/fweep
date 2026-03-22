import { describe, expect, it, jest } from '@jest/globals';
import {
  buildIfdbUpstreamUrl,
  IFDB_PROXY_USER_AGENT,
  proxyIfdbRequest,
} from '../../../shared/ifdb-proxy';

describe('buildIfdbUpstreamUrl', () => {
  it('builds the IFDB search API URL from the local proxy request URL', () => {
    const upstreamUrl = buildIfdbUpstreamUrl(
      new URL('http://localhost:5173/api/ifdb/search?query=bureau'),
    );

    expect(upstreamUrl).toBe('https://ifdb.org/search?json=&searchfor=bureau');
  });

  it('builds the IFDB viewgame API URL from the local proxy request URL', () => {
    const upstreamUrl = buildIfdbUpstreamUrl(
      new URL('http://localhost:5173/api/ifdb/viewgame?tuid=abc123'),
    );

    expect(upstreamUrl).toBe('https://ifdb.org/viewgame?json=&id=abc123');
  });

  it('rejects overly long search queries', () => {
    const overlyLongQuery = 'a'.repeat(121);

    expect(() => buildIfdbUpstreamUrl(
      new URL(`http://localhost:5173/api/ifdb/search?query=${overlyLongQuery}`),
    )).toThrow('Query parameter "query" must be at most 120 characters long.');
  });

  it('rejects overly long viewgame ids', () => {
    const overlyLongTuid = 'a'.repeat(65);

    expect(() => buildIfdbUpstreamUrl(
      new URL(`http://localhost:5173/api/ifdb/viewgame?tuid=${overlyLongTuid}`),
    )).toThrow('Query parameter "tuid" must be at most 64 characters long.');
  });
});

describe('proxyIfdbRequest', () => {
  it('proxies IFDB search requests with a custom user-agent header', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      {
        status: 200,
        headers: {
          get: (headerName: string) => (
            headerName.toLowerCase() === 'content-type'
              ? 'application/json; charset=utf-8'
              : null
          ),
        },
        text: async () => JSON.stringify({ games: [] }),
      } as Response,
    );

    const response = await proxyIfdbRequest(
      new URL('http://localhost:5173/api/ifdb/search?query=bureau'),
      fetchMock,
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('https://ifdb.org/search?json=&searchfor=bureau');
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: {
        accept: 'application/json',
        'user-agent': IFDB_PROXY_USER_AGENT,
      },
    });
    expect(response.status).toBe(200);
    expect(response.contentType).toBe('application/json; charset=utf-8');
    expect(JSON.parse(response.body)).toEqual({ games: [] });
  });

  it('passes an abort signal to the upstream fetch for timeouts', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue(
      {
        status: 200,
        headers: {
          get: () => 'application/json; charset=utf-8',
        },
        text: async () => JSON.stringify({ games: [] }),
      } as unknown as Response,
    );

    await proxyIfdbRequest(
      new URL('http://localhost:5173/api/ifdb/search?query=bureau'),
      fetchMock,
    );

    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      signal: expect.any(Object),
    });
  });

  it('returns a 400 response when the search query is missing', async () => {
    const fetchMock = jest.fn<typeof fetch>();

    const response = await proxyIfdbRequest(
      new URL('http://localhost:5173/api/ifdb/search'),
      fetchMock,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: 'Missing required query parameter "query".',
    });
  });

  it('returns a 400 response when the viewgame tuid is missing', async () => {
    const fetchMock = jest.fn<typeof fetch>();

    const response = await proxyIfdbRequest(
      new URL('http://localhost:5173/api/ifdb/viewgame'),
      fetchMock,
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(400);
    expect(JSON.parse(response.body)).toEqual({
      error: 'Missing required query parameter "tuid".',
    });
  });
});
