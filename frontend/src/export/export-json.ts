import type { MapDocument } from '../domain/map-types';

function sanitizeFilenamePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'map';
}

function formatTimestamp(date: Date): string {
  const pad = (value: number): string => value.toString().padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
  ].join('-') + `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

export function buildExportJsonFilename(mapName: string, date: Date = new Date()): string {
  return `${sanitizeFilenamePart(mapName)}-${formatTimestamp(date)}.json`;
}

export async function exportMapJsonToDownload(mapName: string, doc: MapDocument): Promise<void> {
  const blob = new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = buildExportJsonFilename(mapName);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
