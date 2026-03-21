import { blobToCanvas, canvasToBlob, createSizedCanvas } from '../components/map-background-raster';
import { loadTextureTile, saveTextureTile, type TextureTileLocation } from '../storage/map-store';
import {
  generatePaperTextureTilePixelBuffer,
  getPaperTextureBaseColor,
  PAPER_TEXTURE_TILE_SIZE,
  type PaperTextureTheme,
} from './perlin-paper-texture-core';

export {
  getPaperTextureBaseColor,
  PAPER_TEXTURE_TILE_SIZE,
  type PaperTextureTheme,
};

export const PAPER_TEXTURE_GENERATOR_VERSION = 1;

export interface PaperTextureTileRequest {
  readonly mapId: string;
  readonly textureSeed: number;
  readonly theme: PaperTextureTheme;
}

interface CachedPaperTextureTile {
  readonly blob: Blob;
  readonly canvas: HTMLCanvasElement;
}

const paperTextureTileCache = new Map<string, Promise<CachedPaperTextureTile>>();

function getPaperTextureTileLocation(request: PaperTextureTileRequest): TextureTileLocation {
  return {
    mapId: request.mapId,
    canvasTheme: 'paper',
    themeVariant: request.theme,
    textureSeed: request.textureSeed,
    generatorVersion: PAPER_TEXTURE_GENERATOR_VERSION,
    tileSize: PAPER_TEXTURE_TILE_SIZE,
  };
}

function getPaperTextureTileCacheKey(request: PaperTextureTileRequest): string {
  const location = getPaperTextureTileLocation(request);
  return [
    location.mapId,
    location.canvasTheme,
    location.themeVariant,
    location.textureSeed,
    location.generatorVersion,
    location.tileSize,
  ].join(':');
}

function createPaperTextureTileCanvas(data: Uint8ClampedArray): HTMLCanvasElement {
  const canvas = createSizedCanvas(PAPER_TEXTURE_TILE_SIZE, PAPER_TEXTURE_TILE_SIZE);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create paper texture canvas.');
  }

  const image = context.createImageData(PAPER_TEXTURE_TILE_SIZE, PAPER_TEXTURE_TILE_SIZE);
  image.data.set(data);
  context.putImageData(image, 0, 0);
  return canvas;
}

async function generatePaperTextureTile(request: PaperTextureTileRequest): Promise<CachedPaperTextureTile> {
  const data = generatePaperTextureTilePixelBuffer(
    PAPER_TEXTURE_TILE_SIZE,
    PAPER_TEXTURE_TILE_SIZE,
    request.theme,
    request.textureSeed,
  );
  const canvas = createPaperTextureTileCanvas(data);
  const blob = await canvasToBlob(canvas);
  await saveTextureTile(getPaperTextureTileLocation(request), blob);
  return { blob, canvas };
}

async function loadStoredPaperTextureTile(request: PaperTextureTileRequest): Promise<CachedPaperTextureTile | null> {
  const stored = await loadTextureTile(getPaperTextureTileLocation(request));
  if (!stored) {
    return null;
  }

  return {
    blob: stored.blob,
    canvas: await blobToCanvas(stored.blob),
  };
}

async function ensurePaperTextureTile(request: PaperTextureTileRequest): Promise<CachedPaperTextureTile> {
  const cacheKey = getPaperTextureTileCacheKey(request);
  const cached = paperTextureTileCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const inflight = (async () => {
    const stored = await loadStoredPaperTextureTile(request);
    if (stored) {
      return stored;
    }

    return generatePaperTextureTile(request);
  })();

  paperTextureTileCache.set(cacheKey, inflight);
  inflight.catch(() => {
    paperTextureTileCache.delete(cacheKey);
  });
  return inflight;
}

export async function ensurePaperTextureTileBlob(request: PaperTextureTileRequest): Promise<Blob> {
  const tile = await ensurePaperTextureTile(request);
  return tile.blob;
}

export async function drawPaperTexture(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme: PaperTextureTheme,
  request: PaperTextureTileRequest,
): Promise<void> {
  context.fillStyle = getPaperTextureBaseColor(theme);
  context.fillRect(0, 0, width, height);

  if (width <= 0 || height <= 0) {
    return;
  }

  const tile = await ensurePaperTextureTile(request);
  const pattern = context.createPattern(tile.canvas, 'repeat');
  if (!pattern) {
    return;
  }

  context.fillStyle = pattern;
  context.fillRect(0, 0, width, height);
}
