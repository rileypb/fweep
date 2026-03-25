import { describe, expect, it, jest } from '@jest/globals';
import { pingIfdbProxy, searchIfdbGames, viewIfdbGame } from '../../src/domain/ifdb-client';

function getTestProcessEnv(): Record<string, string | undefined> {
  const processValue = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process;
  if (!processValue) {
    throw new Error('Expected process.env to be available in tests.');
  }

  processValue.env ??= {};
  return processValue.env;
}

describe('searchIfdbGames', () => {
  it('uses the configured production IFDB proxy base URL when present', async () => {
    const processEnv = getTestProcessEnv();
    const originalNodeEnv = processEnv.NODE_ENV;
    const originalBaseUrl = processEnv.VITE_IFDB_PROXY_BASE_URL;
    processEnv.NODE_ENV = 'production';
    processEnv.VITE_IFDB_PROXY_BASE_URL = 'https://fweep-ifdb-proxy.vercel.app/';

    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({ games: [] }),
    } as Response);

    try {
      await searchIfdbGames('example game', fetchMock);

      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        'https://fweep-ifdb-proxy.vercel.app/api/ifdb/search?query=example+game',
      );
    } finally {
      if (originalNodeEnv === undefined) {
        delete processEnv.NODE_ENV;
      } else {
        processEnv.NODE_ENV = originalNodeEnv;
      }
      if (originalBaseUrl === undefined) {
        delete processEnv.VITE_IFDB_PROXY_BASE_URL;
      } else {
        processEnv.VITE_IFDB_PROXY_BASE_URL = originalBaseUrl;
      }
    }
  });

  it('requests the local IFDB proxy search endpoint and returns normalized results', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        games: [
          {
            tuid: 'abc123',
            title: 'The Example Game',
            author: 'Pat Example',
            published: {
              machine: '2024-10-15',
              printable: 'October 15, 2024',
            },
            averageRating: 4.25,
          },
        ],
      }),
    } as Response);

    const results = await searchIfdbGames('example game', fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/ifdb/search?query=example+game');
    expect(results).toEqual([
      {
        tuid: 'abc123',
        title: 'The Example Game',
        author: 'Pat Example',
        published: '2024-10-15',
        publishedDisplay: 'October 15, 2024',
        publishedYear: '2024',
        averageRating: 4.25,
        coverArtUrl: null,
        ifdbLink: null,
      },
    ]);
  });

  it('throws when the IFDB search request fails', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);

    await expect(searchIfdbGames('example game', fetchMock)).rejects.toThrow(
      'IFDB search failed with status 503.',
    );
  });
});

describe('pingIfdbProxy', () => {
  it('uses the configured production IFDB proxy base URL when present', async () => {
    const processEnv = getTestProcessEnv();
    const originalBaseUrl = processEnv.VITE_IFDB_PROXY_BASE_URL;
    processEnv.VITE_IFDB_PROXY_BASE_URL = 'https://fweep-ifdb-proxy.vercel.app/';

    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
    } as Response);

    try {
      await pingIfdbProxy(fetchMock, { force: true });

      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        'https://fweep-ifdb-proxy.vercel.app/api/ifdb/ping',
      );
    } finally {
      if (originalBaseUrl === undefined) {
        delete processEnv.VITE_IFDB_PROXY_BASE_URL;
      } else {
        processEnv.VITE_IFDB_PROXY_BASE_URL = originalBaseUrl;
      }
    }
  });

  it('does not send a ping in development mode', async () => {
    (globalThis as { __FWEEP_TEST_DEV__?: boolean }).__FWEEP_TEST_DEV__ = true;
    const fetchMock = jest.fn<typeof fetch>();

    try {
      await pingIfdbProxy(fetchMock);

      expect(fetchMock).not.toHaveBeenCalled();
    } finally {
      (globalThis as { __FWEEP_TEST_DEV__?: boolean }).__FWEEP_TEST_DEV__ = false;
    }
  });

  it('requests the local IFDB proxy ping endpoint in production mode', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
    } as Response);

    await pingIfdbProxy(fetchMock, { force: true });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/ifdb/ping');
  });

  it('throws when the IFDB ping request fails', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);

    await expect(pingIfdbProxy(fetchMock, { force: true })).rejects.toThrow(
      'IFDB ping failed with status 503.',
    );
  });
});

describe('viewIfdbGame', () => {
  it('uses the configured production IFDB proxy base URL for viewgame requests when present', async () => {
    const processEnv = getTestProcessEnv();
    const originalBaseUrl = processEnv.VITE_IFDB_PROXY_BASE_URL;
    processEnv.VITE_IFDB_PROXY_BASE_URL = 'https://fweep-ifdb-proxy.vercel.app';

    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        identification: {
          ifids: ['IFID-123'],
        },
        bibliographic: {
          title: 'The Example Game',
          author: 'Pat Example',
        },
        ifdb: {
          tuid: 'abc123',
          downloads: {
            links: [
              {
                title: 'Playable Glulx release',
                url: 'https://example.com/game.ulx',
                format: 'glulx',
                isGame: true,
              },
            ],
          },
        },
      }),
    } as Response);

    try {
      await viewIfdbGame('abc123', fetchMock);

      expect(fetchMock.mock.calls[0]?.[0]).toBe(
        'https://fweep-ifdb-proxy.vercel.app/api/ifdb/viewgame?tuid=abc123',
      );
    } finally {
      if (originalBaseUrl === undefined) {
        delete processEnv.VITE_IFDB_PROXY_BASE_URL;
      } else {
        processEnv.VITE_IFDB_PROXY_BASE_URL = originalBaseUrl;
      }
    }
  });

  it('requests the local IFDB proxy viewgame endpoint and returns associated-game metadata', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        identification: {
          ifids: ['IFID-123'],
        },
        bibliographic: {
          title: 'The Example Game',
          author: 'Pat Example',
        },
        ifdb: {
          tuid: 'abc123',
          downloads: {
            links: [
              {
                title: 'Playable Glulx release',
                url: 'https://example.com/game.ulx',
                format: 'glulx',
                isGame: true,
              },
            ],
          },
        },
      }),
    } as Response);

    const result = await viewIfdbGame('abc123', fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/ifdb/viewgame?tuid=abc123');
    expect(result).toEqual({
      sourceType: 'ifdb',
      tuid: 'abc123',
      ifid: 'IFID-123',
      title: 'The Example Game',
      author: 'Pat Example',
      storyUrl: 'https://example.com/game.ulx',
      format: 'glulx',
    });
  });

  it('throws when the IFDB viewgame request fails', async () => {
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue({
      ok: false,
      status: 404,
    } as Response);

    await expect(viewIfdbGame('abc123', fetchMock)).rejects.toThrow(
      'IFDB viewgame failed with status 404.',
    );
  });
});
