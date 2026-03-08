import { BACKGROUND_LAYER_CHUNK_SIZE } from '../domain/map-types';
import type { DrawingToolState } from '../state/editor-store';

export interface ChunkCoordinates {
  readonly chunkX: number;
  readonly chunkY: number;
}

export interface MapPixelPoint {
  readonly x: number;
  readonly y: number;
}

export interface ChunkLoadResult extends ChunkCoordinates {
  readonly key: string;
  readonly blob: Blob;
}

export function supportsRasterCanvas(): boolean {
  return !window.navigator.userAgent.toLowerCase().includes('jsdom');
}

export function createRasterCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = BACKGROUND_LAYER_CHUNK_SIZE;
  canvas.height = BACKGROUND_LAYER_CHUNK_SIZE;
  return canvas;
}

export async function blobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  const canvas = createRasterCanvas();
  if (typeof createImageBitmap !== 'function') {
    return canvas;
  }
  const bitmap = await createImageBitmap(blob);
  const context = canvas.getContext('2d');
  if (!context) {
    return canvas;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return canvas;
}

export async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    if (typeof canvas.toBlob !== 'function') {
      resolve(new Blob([], { type: 'image/png' }));
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Failed to serialize background chunk.'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

export function isCanvasEmpty(canvas: HTMLCanvasElement): boolean {
  const context = canvas.getContext('2d');
  if (!context) {
    return true;
  }

  const imageData = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 3; index < imageData.length; index += 4) {
    if (imageData[index] !== 0) {
      return false;
    }
  }

  return true;
}

export function getChunkCoordinatesForPoint(point: MapPixelPoint): ChunkCoordinates {
  return {
    chunkX: Math.floor(point.x / BACKGROUND_LAYER_CHUNK_SIZE),
    chunkY: Math.floor(point.y / BACKGROUND_LAYER_CHUNK_SIZE),
  };
}

export function getLocalChunkPoint(point: MapPixelPoint, coordinates: ChunkCoordinates): MapPixelPoint {
  return {
    x: point.x - (coordinates.chunkX * BACKGROUND_LAYER_CHUNK_SIZE),
    y: point.y - (coordinates.chunkY * BACKGROUND_LAYER_CHUNK_SIZE),
  };
}

export function getToolStampRadius(toolState: DrawingToolState): number {
  return Math.max(toolState.size / 2, 0.5);
}

export function usesHardEdgeStamp(toolState: DrawingToolState): boolean {
  const isBrushLike = toolState.tool === 'brush' || toolState.tool === 'eraser' || toolState.tool === 'line';
  return isBrushLike && toolState.softness <= 0;
}

export function getChunkCoverageForPoint(point: MapPixelPoint, radius: number): ChunkCoordinates[] {
  const minChunkX = Math.floor((point.x - radius) / BACKGROUND_LAYER_CHUNK_SIZE);
  const maxChunkX = Math.floor((point.x + radius) / BACKGROUND_LAYER_CHUNK_SIZE);
  const minChunkY = Math.floor((point.y - radius) / BACKGROUND_LAYER_CHUNK_SIZE);
  const maxChunkY = Math.floor((point.y + radius) / BACKGROUND_LAYER_CHUNK_SIZE);
  const chunks: ChunkCoordinates[] = [];

  for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY += 1) {
    for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
      chunks.push({ chunkX, chunkY });
    }
  }

  return chunks;
}

export function getInterpolatedLinePoints(start: MapPixelPoint, end: MapPixelPoint): MapPixelPoint[] {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const steps = Math.max(Math.abs(deltaX), Math.abs(deltaY), 1);
  const points: MapPixelPoint[] = [];

  for (let step = 0; step <= steps; step += 1) {
    const progress = step / steps;
    points.push({
      x: Math.round(start.x + (deltaX * progress)),
      y: Math.round(start.y + (deltaY * progress)),
    });
  }

  return points;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function drawSoftStamp(
  context: CanvasRenderingContext2D,
  point: MapPixelPoint,
  size: number,
  colorRgbHex: string,
  opacity: number,
  softness: number,
  erase: boolean,
): void {
  const radius = Math.max(size / 2, 0.5);
  const innerRadius = radius * (1 - softness);
  const gradient = context.createRadialGradient(point.x, point.y, innerRadius, point.x, point.y, radius);
  const alpha = clamp(opacity, 0, 1);
  const rgba = erase ? hexToRgba('#000000', alpha) : hexToRgba(colorRgbHex, alpha);
  const edgeRgba = erase ? hexToRgba('#000000', 0) : hexToRgba(colorRgbHex, 0);

  context.globalCompositeOperation = 'source-over';

  gradient.addColorStop(0, rgba);
  gradient.addColorStop(1, edgeRgba);
  context.fillStyle = gradient;
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.fill();
}

function drawHardStamp(
  context: CanvasRenderingContext2D,
  point: MapPixelPoint,
  size: number,
  colorRgbHex: string,
  opacity: number,
  erase: boolean,
): void {
  context.globalCompositeOperation = 'source-over';
  context.fillStyle = erase ? hexToRgba('#000000', clamp(opacity, 0, 1)) : hexToRgba(colorRgbHex, clamp(opacity, 0, 1));
  context.beginPath();
  context.arc(point.x, point.y, Math.max(size / 2, 0.5), 0, Math.PI * 2);
  context.fill();
}

export function compositeStrokePreview(
  targetCanvas: HTMLCanvasElement,
  baseCanvas: HTMLCanvasElement,
  strokeCanvas: HTMLCanvasElement,
  toolState: DrawingToolState,
): void {
  const context = targetCanvas.getContext('2d');
  if (!context) {
    return;
  }

  context.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
  context.drawImage(baseCanvas, 0, 0);
  context.globalAlpha = clamp(toolState.opacity, 0, 1);
  context.globalCompositeOperation = toolState.tool === 'eraser' ? 'destination-out' : 'source-over';
  context.drawImage(strokeCanvas, 0, 0);
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
}

export function drawStrokeSegment(
  canvas: HTMLCanvasElement,
  toolState: DrawingToolState,
  startPoint: MapPixelPoint,
  endPoint: MapPixelPoint,
): void {
  let context: CanvasRenderingContext2D | null = null;
  try {
    context = canvas.getContext('2d');
  } catch {
    context = null;
  }
  if (!context) {
    return;
  }

  context.imageSmoothingEnabled = false;
  const points = getInterpolatedLinePoints(startPoint, endPoint);
  const isBrushLike = toolState.tool === 'brush' || toolState.tool === 'eraser' || toolState.tool === 'line';
  const usesHardEdgeBrushStamp = usesHardEdgeStamp(toolState);

  for (const point of points) {
    if (usesHardEdgeBrushStamp) {
      drawHardStamp(
        context,
        point,
        toolState.size,
        toolState.colorRgbHex,
        toolState.opacity,
        toolState.tool === 'eraser',
      );
      continue;
    }

    if (isBrushLike) {
      drawSoftStamp(
        context,
        point,
        toolState.size,
        toolState.colorRgbHex,
        toolState.opacity,
        toolState.tool === 'brush' ? toolState.softness : toolState.softness,
        toolState.tool === 'eraser',
      );
      continue;
    }

    drawHardStamp(
      context,
      point,
      toolState.size,
      toolState.colorRgbHex,
      toolState.opacity,
      false,
    );
  }

  context.globalCompositeOperation = 'source-over';
}

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = normalizeHexColor(hex);
  const red = Number.parseInt(normalized.slice(1, 3), 16);
  const green = Number.parseInt(normalized.slice(3, 5), 16);
  const blue = Number.parseInt(normalized.slice(5, 7), 16);
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export function normalizeHexColor(hex: string): string {
  const trimmed = hex.trim();
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  const compact = withHash.toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(compact)) {
    return compact;
  }
  if (/^#[0-9a-f]{3}$/.test(compact)) {
    return `#${compact[1]}${compact[1]}${compact[2]}${compact[2]}${compact[3]}${compact[3]}`;
  }
  return '#000000';
}
