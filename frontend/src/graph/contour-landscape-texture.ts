import { blobToCanvas, canvasToBlob, createSizedCanvas } from '../components/map-background-raster';
import { loadTextureTile, saveTextureTile, type TextureTileLocation } from '../storage/map-store';
import {
  CONTOUR_LANDSCAPE_TILE_SIZE,
  generateContourLandscapeTextureTilePixelBuffer,
  getContourLandscapeBaseColor,
  type ContourLandscapeTextureCanvasTheme,
  type ContourLandscapeTextureTheme,
} from './contour-landscape-texture-core';

export {
  CONTOUR_LANDSCAPE_TILE_SIZE,
  getContourLandscapeBaseColor,
  type ContourLandscapeTextureCanvasTheme,
  type ContourLandscapeTextureTheme,
};

export const CONTOUR_LANDSCAPE_GENERATOR_VERSION = 1;
export const CONTOUR_LANDSCAPE_RENDER_SCALE = 3;

export interface ContourLandscapeTextureTileRequest {
  readonly mapId: string;
  readonly textureSeed: number;
  readonly theme: ContourLandscapeTextureTheme;
  readonly canvasTheme: ContourLandscapeTextureCanvasTheme;
}

interface CachedContourLandscapeTextureTile {
  readonly blob: Blob;
  readonly canvas: HTMLCanvasElement;
}

const contourLandscapeTextureTileCache = new Map<string, Promise<CachedContourLandscapeTextureTile>>();

function shouldBypassPersistedContourTextureTiles(): boolean {
  return import.meta.env?.DEV === true;
}

function getContourLandscapeTextureTileLocation(
  request: ContourLandscapeTextureTileRequest,
): TextureTileLocation {
  return {
    mapId: request.mapId,
    canvasTheme: request.canvasTheme,
    themeVariant: request.theme,
    textureSeed: request.textureSeed,
    generatorVersion: CONTOUR_LANDSCAPE_GENERATOR_VERSION,
    tileSize: CONTOUR_LANDSCAPE_TILE_SIZE,
  };
}

function getContourLandscapeTextureTileCacheKey(request: ContourLandscapeTextureTileRequest): string {
  const location = getContourLandscapeTextureTileLocation(request);
  return [
    location.mapId,
    location.canvasTheme,
    location.themeVariant,
    location.textureSeed,
    location.generatorVersion,
    location.tileSize,
  ].join(':');
}

function createContourLandscapeTextureTileCanvas(data: Uint8ClampedArray): HTMLCanvasElement {
  const canvas = createSizedCanvas(CONTOUR_LANDSCAPE_TILE_SIZE, CONTOUR_LANDSCAPE_TILE_SIZE);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create contour landscape texture canvas.');
  }

  const image = context.createImageData(CONTOUR_LANDSCAPE_TILE_SIZE, CONTOUR_LANDSCAPE_TILE_SIZE);
  image.data.set(data);
  context.putImageData(image, 0, 0);
  return canvas;
}

async function generateContourLandscapeTextureTile(
  request: ContourLandscapeTextureTileRequest,
): Promise<CachedContourLandscapeTextureTile> {
  const data = generateContourLandscapeTextureTilePixelBuffer(
    CONTOUR_LANDSCAPE_TILE_SIZE,
    CONTOUR_LANDSCAPE_TILE_SIZE,
    request.theme,
    request.textureSeed,
    request.canvasTheme,
  );
  const canvas = createContourLandscapeTextureTileCanvas(data);
  const blob = await canvasToBlob(canvas);
  if (!shouldBypassPersistedContourTextureTiles()) {
    await saveTextureTile(getContourLandscapeTextureTileLocation(request), blob);
  }
  return { blob, canvas };
}

async function loadStoredContourLandscapeTextureTile(
  request: ContourLandscapeTextureTileRequest,
): Promise<CachedContourLandscapeTextureTile | null> {
  if (shouldBypassPersistedContourTextureTiles()) {
    return null;
  }

  const stored = await loadTextureTile(getContourLandscapeTextureTileLocation(request));
  if (!stored) {
    return null;
  }

  return {
    blob: stored.blob,
    canvas: await blobToCanvas(stored.blob),
  };
}

async function ensureContourLandscapeTextureTile(
  request: ContourLandscapeTextureTileRequest,
): Promise<CachedContourLandscapeTextureTile> {
  const cacheKey = getContourLandscapeTextureTileCacheKey(request);
  const cached = contourLandscapeTextureTileCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const inflight = (async () => {
    const stored = await loadStoredContourLandscapeTextureTile(request);
    if (stored) {
      return stored;
    }

    return generateContourLandscapeTextureTile(request);
  })();

  contourLandscapeTextureTileCache.set(cacheKey, inflight);
  inflight.catch(() => {
    contourLandscapeTextureTileCache.delete(cacheKey);
  });
  return inflight;
}

export async function ensureContourLandscapeTextureTileBlob(
  request: ContourLandscapeTextureTileRequest,
): Promise<Blob> {
  const tile = await ensureContourLandscapeTextureTile(request);
  return tile.blob;
}

export async function drawContourLandscapeTexture(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme: ContourLandscapeTextureTheme,
  request: ContourLandscapeTextureTileRequest,
): Promise<void> {
  context.fillStyle = getContourLandscapeBaseColor(theme);
  context.fillRect(0, 0, width, height);

  if (width <= 0 || height <= 0) {
    return;
  }

  const tile = await ensureContourLandscapeTextureTile(request);
  const scaledTileSize = CONTOUR_LANDSCAPE_TILE_SIZE * CONTOUR_LANDSCAPE_RENDER_SCALE;

  for (let y = 0; y < height; y += scaledTileSize) {
    for (let x = 0; x < width; x += scaledTileSize) {
      context.drawImage(tile.canvas, x, y, scaledTileSize, scaledTileSize);
    }
  }
}
