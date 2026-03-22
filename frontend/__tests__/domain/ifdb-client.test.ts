import { describe, expect, it, jest } from '@jest/globals';
import { searchIfdbGames, viewIfdbGame } from '../../src/domain/ifdb-client';

describe('searchIfdbGames', () => {
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

describe('viewIfdbGame', () => {
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
