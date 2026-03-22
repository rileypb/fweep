import type { AssociatedGameMetadata } from './map-types';

export interface IfdbDownloadLink {
  readonly title: string;
  readonly url: string;
  readonly format: string;
  readonly lastUpdated?: string | null;
}

export interface IfdbViewGameDownloadLinkRecord {
  readonly url: string;
  readonly playOnlineUrl?: string | null;
  readonly title: string;
  readonly desc?: string | null;
  readonly isGame?: boolean | null;
  readonly format: string;
  readonly lastUpdated?: string | null;
}

export interface IfdbViewGameResponsePayload {
  readonly identification?: {
    readonly ifids?: readonly string[] | null;
    readonly format?: string | null;
  } | null;
  readonly bibliographic?: {
    readonly title?: string | null;
    readonly author?: string | null;
  } | null;
  readonly ifdb?: {
    readonly tuid?: string | null;
    readonly downloads?: {
      readonly links?: readonly IfdbViewGameDownloadLinkRecord[] | null;
    } | null;
  } | null;
}

export interface IfdbSearchResultRecord {
  readonly tuid: string;
  readonly title: string;
  readonly author?: string | null;
  readonly link?: string | null;
  readonly coverArtLink?: string | null;
  readonly published?: string | {
    readonly machine?: string | null;
    readonly printable?: string | null;
  } | null;
  readonly averageRating?: number | null;
}

export interface NormalizedIfdbSearchResult {
  readonly tuid: string;
  readonly title: string;
  readonly author: string | null;
  readonly ifdbLink: string | null;
  readonly coverArtUrl: string | null;
  readonly published: string | null;
  readonly publishedDisplay: string | null;
  readonly publishedYear: string | null;
  readonly averageRating: number | null;
}

export interface IfdbSearchResponsePayload {
  readonly games?: readonly IfdbSearchResultRecord[];
}

const IFDB_FORMAT_PRIORITY: Readonly<Record<string, number>> = {
  glulx: 0,
  zcode: 1,
  tads: 2,
  hugo: 3,
  adrift: 4,
  adrift4: 4,
};

function normalizeIfdbFormat(format: string): string {
  return format.trim().toLowerCase();
}

function getPrimaryIfdbSupportedFormat(format: string): string | null {
  const normalizedFormat = normalizeIfdbFormat(format);
  if (normalizedFormat in IFDB_FORMAT_PRIORITY) {
    return normalizedFormat;
  }

  const formatParts = normalizedFormat.split(/[\/,+\s-]+/).filter((part) => part.length > 0);
  for (const part of formatParts) {
    if (part in IFDB_FORMAT_PRIORITY) {
      return part;
    }
  }

  return null;
}

function getIfdbDownloadPriority(download: IfdbDownloadLink): number {
  const primaryFormat = getPrimaryIfdbSupportedFormat(download.format);
  return primaryFormat === null
    ? Number.POSITIVE_INFINITY
    : IFDB_FORMAT_PRIORITY[primaryFormat];
}

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function getPublishedYear(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const yearMatch = /^(\d{4})/.exec(value);
  return yearMatch?.[1] ?? null;
}

function normalizePublishedValue(
  value: IfdbSearchResultRecord['published'],
): { readonly machine: string | null; readonly display: string | null } {
  if (typeof value === 'string' || value === null || value === undefined) {
    const normalizedValue = normalizeOptionalString(value);
    return {
      machine: normalizedValue,
      display: normalizedValue,
    };
  }

  return {
    machine: normalizeOptionalString(value.machine),
    display: normalizeOptionalString(value.printable),
  };
}

function getIfdbDownloadTimestamp(download: IfdbDownloadLink): number {
  if (!download.lastUpdated) {
    return Number.NEGATIVE_INFINITY;
  }

  const timestamp = Date.parse(download.lastUpdated);
  return Number.isFinite(timestamp) ? timestamp : Number.NEGATIVE_INFINITY;
}

function extractStoryUrlFromPlayOnlineUrl(playOnlineUrl: string | null): string | null {
  if (playOnlineUrl === null) {
    return null;
  }

  try {
    const parsedUrl = new URL(playOnlineUrl);
    return normalizeOptionalString(parsedUrl.searchParams.get('story'));
  } catch {
    return null;
  }
}

export function selectPreferredIfdbDownload(downloads: readonly IfdbDownloadLink[]): IfdbDownloadLink | null {
  if (downloads.length === 0) {
    return null;
  }

  const supportedDownloads = downloads.filter((download) => Number.isFinite(getIfdbDownloadPriority(download)));
  if (supportedDownloads.length === 0) {
    return null;
  }

  return [...supportedDownloads].sort((left, right) => {
    const priorityDifference = getIfdbDownloadPriority(left) - getIfdbDownloadPriority(right);
    if (priorityDifference !== 0) {
      return priorityDifference;
    }

    const timestampDifference = getIfdbDownloadTimestamp(right) - getIfdbDownloadTimestamp(left);
    if (timestampDifference !== 0) {
      return timestampDifference;
    }

    return 0;
  })[0];
}

export function normalizeIfdbSearchResults(
  results: readonly IfdbSearchResultRecord[],
): readonly NormalizedIfdbSearchResult[] {
  return results.map((result) => {
    const published = normalizePublishedValue(result.published);

    return {
      tuid: result.tuid,
      title: result.title,
      author: normalizeOptionalString(result.author),
      ifdbLink: normalizeOptionalString(result.link),
      coverArtUrl: normalizeOptionalString(result.coverArtLink),
      published: published.machine,
      publishedDisplay: published.display,
      publishedYear: getPublishedYear(published.machine),
      averageRating: result.averageRating ?? null,
    };
  });
}

export function parseIfdbSearchResponse(
  payload: IfdbSearchResponsePayload,
): readonly NormalizedIfdbSearchResult[] {
  return normalizeIfdbSearchResults(payload.games ?? []);
}

export function parseIfdbViewGameResponse(
  payload: IfdbViewGameResponsePayload,
): AssociatedGameMetadata {
  const playableDownloads = (payload.ifdb?.downloads?.links ?? [])
    .filter((download) => download.isGame === true)
    .map((download) => ({
      title: download.title,
      url: extractStoryUrlFromPlayOnlineUrl(normalizeOptionalString(download.playOnlineUrl))
        ?? download.url,
      format: download.format,
      lastUpdated: download.lastUpdated ?? null,
    }));
  const selectedDownload = selectPreferredIfdbDownload(playableDownloads);
  const normalizedSelectedFormat = selectedDownload === null
    ? null
    : getPrimaryIfdbSupportedFormat(selectedDownload.format);

  return {
    sourceType: 'ifdb',
    tuid: normalizeOptionalString(payload.ifdb?.tuid) ?? null,
    ifid: normalizeOptionalString(payload.identification?.ifids?.[0]) ?? null,
    title: normalizeOptionalString(payload.bibliographic?.title) ?? 'Untitled game',
    author: normalizeOptionalString(payload.bibliographic?.author),
    storyUrl: selectedDownload?.url ?? null,
    format: normalizedSelectedFormat,
  };
}
