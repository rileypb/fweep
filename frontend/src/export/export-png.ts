import type { ExportScope } from './export-types';
import { canvasToBlob } from '../components/map-background-raster';

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

export function buildExportPngFilename(mapName: string, scope: ExportScope, date: Date = new Date()): string {
  return `${sanitizeFilenamePart(mapName)}-${scope}-${formatTimestamp(date)}.png`;
}

export async function exportPngToDownload(args: {
  readonly mapName: string;
  readonly scope: ExportScope;
  readonly canvas: HTMLCanvasElement;
}): Promise<void> {
  const blob = await canvasToBlob(args.canvas);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = buildExportPngFilename(args.mapName, args.scope);
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
