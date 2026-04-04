import {
  BACKGROUND_LAYER_CHUNK_SIZE,
  type Connection,
  type Room,
  type RoomStrokeStyle,
} from '../domain/map-types';
import type { DrawingToolState } from '../state/editor-store';
import {
  computeConnectionPath,
  ROOM_CORNER_RADIUS,
  ROOM_HEIGHT,
} from '../graph/connection-geometry';
import { getRoomNodeWidth } from '../graph/minimap-geometry';
import { traceRoomShapePath } from '../graph/room-shape-geometry';

export interface ChunkCoordinates {
  readonly chunkX: number;
  readonly chunkY: number;
}

export interface MapPixelPoint {
  readonly x: number;
  readonly y: number;
}

export interface MapPixelRect {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface ChunkLoadResult extends ChunkCoordinates {
  readonly key: string;
  readonly blob: Blob;
}

export const BUCKET_FILL_MAX_RADIUS = 512;
const OBSTACLE_CONNECTION_WIDTH = 4;

export function supportsRasterCanvas(): boolean {
  return !window.navigator.userAgent.toLowerCase().includes('jsdom');
}

export function createRasterCanvas(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = BACKGROUND_LAYER_CHUNK_SIZE;
  canvas.height = BACKGROUND_LAYER_CHUNK_SIZE;
  return canvas;
}

export function createSizedCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function drawRoomObstaclePath(
  context: CanvasRenderingContext2D,
  room: Room,
  offsetX: number,
  offsetY: number,
): void {
  const left = room.position.x - offsetX;
  const top = room.position.y - offsetY;
  const width = getRoomNodeWidth(room);
  const height = ROOM_HEIGHT;

  context.beginPath();
  traceRoomShapePath(context, room.shape, left, top, width, height, ROOM_CORNER_RADIUS);
}

export function drawMapObstacleMask(
  canvas: HTMLCanvasElement,
  rooms: Readonly<Record<string, Room>>,
  connections: Readonly<Record<string, Connection>>,
  offset: MapPixelPoint,
): void {
  const context = canvas.getContext('2d');
  if (!context) {
    return;
  }

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#000000';
  context.strokeStyle = '#000000';
  context.lineCap = 'round';
  context.lineJoin = 'round';

  Object.values(rooms).forEach((room) => {
    drawRoomObstaclePath(context, room, offset.x, offset.y);
    context.fill();
  });

  Object.values(connections).forEach((connection) => {
    const sourceRoom = rooms[connection.sourceRoomId];
    const targetRoom = connection.target.kind === 'room' ? rooms[connection.target.id] : null;
    if (!sourceRoom || !targetRoom) {
      return;
    }

    const sourceDimensions = { width: getRoomNodeWidth(sourceRoom), height: ROOM_HEIGHT };
    const targetDimensions = { width: getRoomNodeWidth(targetRoom), height: ROOM_HEIGHT };
    const points = computeConnectionPath(
      sourceRoom,
      targetRoom,
      connection,
      undefined,
      sourceDimensions,
      targetDimensions,
    );

    if (points.length < 2) {
      return;
    }

    context.beginPath();
    context.moveTo(points[0].x - offset.x, points[0].y - offset.y);
    for (let index = 1; index < points.length; index += 1) {
      context.lineTo(points[index].x - offset.x, points[index].y - offset.y);
    }
    context.lineWidth = OBSTACLE_CONNECTION_WIDTH;
    // Obey-map fill treats every rendered connection as a continuous barrier,
    // even when the visible stroke style is dashed or dotted.
    context.setLineDash([]);
    context.stroke();
  });

  context.setLineDash([]);
}

export async function blobToCanvas(blob: Blob): Promise<HTMLCanvasElement> {
  if (typeof createImageBitmap !== 'function') {
    return createRasterCanvas();
  }
  const bitmap = await createImageBitmap(blob);
  const canvas = createSizedCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext('2d');
  if (!context) {
    bitmap.close();
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
  const isBrushLike = toolState.tool === 'brush' || toolState.tool === 'eraser' || toolState.tool === 'line' || toolState.tool === 'rectangle' || toolState.tool === 'ellipse';
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

export function getChunkCoverageForRect(rect: MapPixelRect, radius: number): ChunkCoordinates[] {
  const minChunkX = Math.floor((rect.left - radius) / BACKGROUND_LAYER_CHUNK_SIZE);
  const maxChunkX = Math.floor((rect.right + radius) / BACKGROUND_LAYER_CHUNK_SIZE);
  const minChunkY = Math.floor((rect.top - radius) / BACKGROUND_LAYER_CHUNK_SIZE);
  const maxChunkY = Math.floor((rect.bottom + radius) / BACKGROUND_LAYER_CHUNK_SIZE);
  const chunks: ChunkCoordinates[] = [];

  for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY += 1) {
    for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX += 1) {
      chunks.push({ chunkX, chunkY });
    }
  }

  return chunks;
}

export function getBoundsFromPoints(start: MapPixelPoint, end: MapPixelPoint): MapPixelRect {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x),
    bottom: Math.max(start.y, end.y),
  };
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

export function constrainLineToCompassDirection(start: MapPixelPoint, end: MapPixelPoint): MapPixelPoint {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  if (deltaX === 0 && deltaY === 0) {
    return end;
  }

  const angle = Math.atan2(deltaY, deltaX);
  const snappedAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  const distance = Math.hypot(deltaX, deltaY);

  return {
    x: Math.round(start.x + (Math.cos(snappedAngle) * distance)),
    y: Math.round(start.y + (Math.sin(snappedAngle) * distance)),
  };
}

export function constrainRectangleToSquare(start: MapPixelPoint, end: MapPixelPoint): MapPixelPoint {
  const deltaX = end.x - start.x;
  const deltaY = end.y - start.y;
  const size = Math.max(Math.abs(deltaX), Math.abs(deltaY));

  return {
    x: start.x + (deltaX < 0 ? -size : size),
    y: start.y + (deltaY < 0 ? -size : size),
  };
}

export function constrainEllipseToCircle(start: MapPixelPoint, end: MapPixelPoint): MapPixelPoint {
  return constrainRectangleToSquare(start, end);
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

function fillShapeInterior(
  context: CanvasRenderingContext2D,
  toolState: DrawingToolState,
  fillPath: () => void,
): void {
  context.globalCompositeOperation = 'source-over';
  context.fillStyle = hexToRgba(toolState.fillColorRgbHex, clamp(toolState.opacity, 0, 1));
  context.beginPath();
  fillPath();
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
  const isBrushLike = toolState.tool === 'brush' || toolState.tool === 'eraser' || toolState.tool === 'line' || toolState.tool === 'rectangle' || toolState.tool === 'ellipse';
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

export function drawRectangleStroke(
  canvas: HTMLCanvasElement,
  toolState: DrawingToolState,
  startPoint: MapPixelPoint,
  endPoint: MapPixelPoint,
): void {
  const bounds = getBoundsFromPoints(startPoint, endPoint);
  const context = canvas.getContext('2d');

  if (context && toolState.shapeFilled) {
    fillShapeInterior(context, toolState, () => {
      context.rect(
        bounds.left,
        bounds.top,
        Math.max(bounds.right - bounds.left, 1),
        Math.max(bounds.bottom - bounds.top, 1),
      );
    });
  }

  drawStrokeSegment(canvas, toolState, { x: bounds.left, y: bounds.top }, { x: bounds.right, y: bounds.top });
  drawStrokeSegment(canvas, toolState, { x: bounds.right, y: bounds.top }, { x: bounds.right, y: bounds.bottom });
  drawStrokeSegment(canvas, toolState, { x: bounds.right, y: bounds.bottom }, { x: bounds.left, y: bounds.bottom });
  drawStrokeSegment(canvas, toolState, { x: bounds.left, y: bounds.bottom }, { x: bounds.left, y: bounds.top });
}

export function drawEllipseStroke(
  canvas: HTMLCanvasElement,
  toolState: DrawingToolState,
  startPoint: MapPixelPoint,
  endPoint: MapPixelPoint,
): void {
  const bounds = getBoundsFromPoints(startPoint, endPoint);
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;
  const radiusX = Math.max((bounds.right - bounds.left) / 2, 0.5);
  const radiusY = Math.max((bounds.bottom - bounds.top) / 2, 0.5);
  const context = canvas.getContext('2d');

  if (context && toolState.shapeFilled) {
    fillShapeInterior(context, toolState, () => {
      context.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, Math.PI * 2);
    });
  }

  const circumference = Math.PI * (3 * (radiusX + radiusY) - Math.sqrt(((3 * radiusX) + radiusY) * (radiusX + (3 * radiusY))));
  const steps = Math.max(Math.ceil(circumference), 12);
  let previousPoint: MapPixelPoint | null = null;

  for (let index = 0; index <= steps; index += 1) {
    const angle = (index / steps) * Math.PI * 2;
    const point: MapPixelPoint = {
      x: Math.round(centerX + (Math.cos(angle) * radiusX)),
      y: Math.round(centerY + (Math.sin(angle) * radiusY)),
    };
    if (previousPoint) {
      drawStrokeSegment(canvas, toolState, previousPoint, point);
    }
    previousPoint = point;
  }
}

function parseRgbHex(hex: string): { red: number; green: number; blue: number } {
  const normalized = normalizeHexColor(hex);
  return {
    red: Number.parseInt(normalized.slice(1, 3), 16),
    green: Number.parseInt(normalized.slice(3, 5), 16),
    blue: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

export function drawBucketFill(
  sourceCanvas: HTMLCanvasElement,
  targetCanvas: HTMLCanvasElement,
  startPoint: MapPixelPoint,
  colorRgbHex: string,
  maxRadius: number = BUCKET_FILL_MAX_RADIUS,
  tolerance: number = 0,
  obstacleCanvas?: HTMLCanvasElement,
): boolean {
  const sourceContext = sourceCanvas.getContext('2d');
  const targetContext = targetCanvas.getContext('2d');
  const obstacleContext = obstacleCanvas?.getContext('2d') ?? null;
  if (!sourceContext || !targetContext) {
    return false;
  }

  const startX = Math.round(startPoint.x);
  const startY = Math.round(startPoint.y);
  if (
    startX < 0
    || startY < 0
    || startX >= sourceCanvas.width
    || startY >= sourceCanvas.height
  ) {
    return false;
  }

  const sourceImage = sourceContext.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
  const targetImage = targetContext.createImageData(sourceCanvas.width, sourceCanvas.height);
  const sourceData = sourceImage.data;
  const targetData = targetImage.data;
  const obstacleData = obstacleContext?.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height).data;
  const width = sourceCanvas.width;
  const height = sourceCanvas.height;
  const startIndex = ((startY * width) + startX) * 4;
  if (obstacleData && obstacleData[startIndex + 3] !== 0) {
    return false;
  }
  const targetRed = sourceData[startIndex];
  const targetGreen = sourceData[startIndex + 1];
  const targetBlue = sourceData[startIndex + 2];
  const targetAlpha = sourceData[startIndex + 3];
  const { red, green, blue } = parseRgbHex(colorRgbHex);
  const clampedTolerance = clamp(tolerance, 0, 255);

  if (
    targetRed === red
    && targetGreen === green
    && targetBlue === blue
    && targetAlpha === 255
  ) {
    return false;
  }

  const radiusSquared = maxRadius * maxRadius;
  const visited = new Uint8Array(width * height);
  const stack: Array<{ x: number; y: number }> = [{ x: startX, y: startY }];
  let changed = false;

  while (stack.length > 0) {
    const current = stack.pop()!;
    const { x, y } = current;

    if (x < 0 || y < 0 || x >= width || y >= height) {
      continue;
    }

    const dx = x - startX;
    const dy = y - startY;
    if ((dx * dx) + (dy * dy) > radiusSquared) {
      continue;
    }

    const pixelIndex = (y * width) + x;
    if (visited[pixelIndex] === 1) {
      continue;
    }
    visited[pixelIndex] = 1;

    const offset = pixelIndex * 4;
    if (obstacleData && obstacleData[offset + 3] !== 0) {
      continue;
    }
    if (
      Math.abs(sourceData[offset] - targetRed) > clampedTolerance
      || Math.abs(sourceData[offset + 1] - targetGreen) > clampedTolerance
      || Math.abs(sourceData[offset + 2] - targetBlue) > clampedTolerance
      || Math.abs(sourceData[offset + 3] - targetAlpha) > clampedTolerance
    ) {
      continue;
    }

    targetData[offset] = red;
    targetData[offset + 1] = green;
    targetData[offset + 2] = blue;
    targetData[offset + 3] = 255;
    changed = true;

    stack.push({ x: x + 1, y });
    stack.push({ x: x - 1, y });
    stack.push({ x, y: y + 1 });
    stack.push({ x, y: y - 1 });
  }

  if (!changed) {
    return false;
  }

  targetContext.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
  targetContext.putImageData(targetImage, 0, 0);
  return true;
}

export function hexToRgba(hex: string, alpha: number): string {
  const normalized = normalizeHexColor(hex);
  const { red, green, blue } = parseRgbHex(normalized);
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
