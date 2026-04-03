import { describe, expect, it } from '@jest/globals';
import {
  parseIfdbSearchResponse,
  parseIfdbViewGameResponse,
  normalizeIfdbSearchResults,
  selectPreferredIfdbDownload,
} from '../../src/domain/ifdb';

describe('selectPreferredIfdbDownload', () => {
  it('prefers a glulx download over a zcode download', () => {
    const selected = selectPreferredIfdbDownload([
      {
        title: 'Z-code release',
        url: 'https://example.com/game.z8',
        format: 'zcode',
      },
      {
        title: 'Glulx release',
        url: 'https://example.com/game.ulx',
        format: 'glulx',
      },
    ]);

    expect(selected).toEqual({
      title: 'Glulx release',
      url: 'https://example.com/game.ulx',
      format: 'glulx',
    });
  });

  it('prefers the newest download among equally preferred formats', () => {
    const selected = selectPreferredIfdbDownload([
      {
        title: 'Older Glulx release',
        url: 'https://example.com/game-old.ulx',
        format: 'glulx',
        lastUpdated: '2022-05-01',
      },
      {
        title: 'Newer Glulx release',
        url: 'https://example.com/game-new.ulx',
        format: 'glulx',
        lastUpdated: '2024-10-15',
      },
    ]);

    expect(selected).toEqual({
      title: 'Newer Glulx release',
      url: 'https://example.com/game-new.ulx',
      format: 'glulx',
      lastUpdated: '2024-10-15',
    });
  });

  it('returns null when no supported download formats are available', () => {
    const selected = selectPreferredIfdbDownload([
      {
        title: 'Windows executable',
        url: 'https://example.com/game.exe',
        format: 'windows executable',
      },
      {
        title: 'Transcript',
        url: 'https://example.com/transcript.txt',
        format: 'plain text',
      },
    ]);

    expect(selected).toBeNull();
  });

  it('treats blorb/glulx as a supported glulx download format', () => {
    const selected = selectPreferredIfdbDownload([
      {
        title: 'Galaxy Jones story file',
        url: 'https://example.com/GalaxyJones.zip',
        format: 'blorb/glulx',
      },
    ]);

    expect(selected).toEqual({
      title: 'Galaxy Jones story file',
      url: 'https://example.com/GalaxyJones.zip',
      format: 'blorb/glulx',
    });
  });
});

describe('normalizeIfdbSearchResults', () => {
  it('normalizes IFDB search results into a UI-friendly shape', () => {
    const normalized = normalizeIfdbSearchResults([
      {
        tuid: 'abc123',
        title: 'The Example Game',
        author: 'Pat Example',
        link: 'https://ifdb.org/viewgame?id=abc123',
        coverArtLink: 'https://ifdb.org/coverart?id=abc123&version=4',
        published: {
          machine: '2024-10-15',
          printable: 'October 15, 2024',
        },
        averageRating: 4.25,
      },
      {
        tuid: 'def456',
        title: 'Untitled Mystery',
      },
    ]);

    expect(normalized).toEqual([
      {
        tuid: 'abc123',
        title: 'The Example Game',
        author: 'Pat Example',
        ifdbLink: 'https://ifdb.org/viewgame?id=abc123',
        coverArtUrl: 'https://ifdb.org/coverart?id=abc123&version=4',
        published: '2024-10-15',
        publishedDisplay: 'October 15, 2024',
        publishedYear: '2024',
        averageRating: 4.25,
        isPlayable: null,
      },
      {
        tuid: 'def456',
        title: 'Untitled Mystery',
        author: null,
        ifdbLink: null,
        coverArtUrl: null,
        published: null,
        publishedDisplay: null,
        publishedYear: null,
        averageRating: null,
        isPlayable: null,
      },
    ]);
  });
});

describe('parseIfdbSearchResponse', () => {
  it('extracts and normalizes search results from the IFDB API response payload', () => {
    const normalized = parseIfdbSearchResponse({
      games: [
        {
          tuid: 'abc123',
          title: 'The Example Game',
          author: 'Pat Example',
          link: 'https://ifdb.org/viewgame?id=abc123',
          coverArtLink: 'https://ifdb.org/coverart?id=abc123&version=4',
          published: '2024-10-15',
          averageRating: 4.25,
        },
      ],
    });

    expect(normalized).toEqual([
      {
        tuid: 'abc123',
        title: 'The Example Game',
        author: 'Pat Example',
        ifdbLink: 'https://ifdb.org/viewgame?id=abc123',
        coverArtUrl: 'https://ifdb.org/coverart?id=abc123&version=4',
        published: '2024-10-15',
        publishedDisplay: '2024-10-15',
        publishedYear: '2024',
        averageRating: 4.25,
        isPlayable: null,
      },
    ]);
  });

  it('returns an empty result set when the IFDB response has no games array', () => {
    expect(parseIfdbSearchResponse({})).toEqual([]);
  });
});

describe('parseIfdbViewGameResponse', () => {
  it('extracts associated-game metadata and prefers a playable glulx download', () => {
    const normalized = parseIfdbViewGameResponse({
      identification: {
        ifids: ['IFID-123', 'IFID-456'],
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
              title: 'Manual PDF',
              url: 'https://example.com/manual.pdf',
              format: 'pdf',
              isGame: false,
            },
            {
              title: 'Z-code release',
              url: 'https://example.com/game.z8',
              format: 'zcode',
              isGame: true,
            },
            {
              title: 'Glulx release',
              url: 'https://example.com/game.ulx',
              format: 'glulx',
              isGame: true,
            },
          ],
        },
      },
    });

    expect(normalized).toEqual({
      sourceType: 'ifdb',
      tuid: 'abc123',
      ifid: 'IFID-123',
      title: 'The Example Game',
      author: 'Pat Example',
      storyUrl: 'https://example.com/game.ulx',
      format: 'glulx',
    });
  });

  it('returns null story metadata when the listing has no supported playable download', () => {
    const normalized = parseIfdbViewGameResponse({
      identification: {
        ifids: ['IFID-123'],
      },
      bibliographic: {
        title: 'The Example Game',
      },
      ifdb: {
        tuid: 'abc123',
        downloads: {
          links: [
            {
              title: 'Manual PDF',
              url: 'https://example.com/manual.pdf',
              format: 'pdf',
              isGame: false,
            },
          ],
        },
      },
    });

    expect(normalized).toEqual({
      sourceType: 'ifdb',
      tuid: 'abc123',
      ifid: 'IFID-123',
      title: 'The Example Game',
      author: null,
      storyUrl: null,
      format: null,
    });
  });

  it('prefers the playable story URL extracted from a playOnlineUrl over the raw zip download URL', () => {
    const normalized = parseIfdbViewGameResponse({
      identification: {
        ifids: ['8E621A76-873D-4820-82FC-12FC699572B3'],
      },
      bibliographic: {
        title: 'Galaxy Jones',
        author: 'Phil Riley',
      },
      ifdb: {
        tuid: 'mzawg3zqq4urfjkl',
        downloads: {
          links: [
            {
              title: 'Story file',
              url: 'https://ifarchive.org/if-archive/games/springthing/2023/GalaxyJones.zip',
              playOnlineUrl: 'https://iplayif.com/?story=https%3A%2F%2Funbox.ifarchive.org%2F%3Furl%3Dhttps%253A%252F%252Fifarchive.org%252Fif-archive%252Fgames%252Fspringthing%252F2023%252FGalaxyJones.zip%26open%3DGalaxyJones%252FGalaxy%2BJones.gblorb',
              format: 'blorb/glulx',
              isGame: true,
            },
          ],
        },
      },
    });

    expect(normalized).toEqual({
      sourceType: 'ifdb',
      tuid: 'mzawg3zqq4urfjkl',
      ifid: '8E621A76-873D-4820-82FC-12FC699572B3',
      title: 'Galaxy Jones',
      author: 'Phil Riley',
      storyUrl: 'https://unbox.ifarchive.org/?url=https%3A%2F%2Fifarchive.org%2Fif-archive%2Fgames%2Fspringthing%2F2023%2FGalaxyJones.zip&open=GalaxyJones%2FGalaxy+Jones.gblorb',
      format: 'glulx',
    });
  });
});
