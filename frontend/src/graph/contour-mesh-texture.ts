import { blobToCanvas, canvasToBlob, createSizedCanvas } from '../components/map-background-raster';
import { loadTextureTile, saveTextureTile, type TextureTileLocation } from '../storage/map-store';
import {
  CONTOUR_MESH_TILE_SIZE,
  getContourMeshBaseColor,
  renderContourMeshTextureTile,
  type ContourMeshTextureTheme,
} from './contour-mesh-texture-core';

export {
  CONTOUR_MESH_TILE_SIZE,
  getContourMeshBaseColor,
  type ContourMeshTextureTheme,
};

export const CONTOUR_MESH_GENERATOR_VERSION = 1;
export const CONTOUR_MESH_RENDER_SCALE = 3;

export interface ContourMeshTextureTileRequest {
  readonly mapId: string;
  readonly textureSeed: number;
  readonly theme: ContourMeshTextureTheme;
}

interface CachedContourMeshTextureTile {
  readonly blob: Blob;
  readonly canvas: HTMLCanvasElement;
}

const contourMeshTextureTileCache = new Map<string, Promise<CachedContourMeshTextureTile>>();

function shouldBypassPersistedContourMeshTextureTiles(): boolean {
  return import.meta.env?.DEV === true;
}

function getContourMeshTextureTileLocation(
  request: ContourMeshTextureTileRequest,
): TextureTileLocation {
  return {
    mapId: request.mapId,
    canvasTheme: 'contour',
    themeVariant: request.theme,
    textureSeed: request.textureSeed,
    generatorVersion: CONTOUR_MESH_GENERATOR_VERSION,
    tileSize: CONTOUR_MESH_TILE_SIZE,
  };
}

function getContourMeshTextureTileCacheKey(request: ContourMeshTextureTileRequest): string {
  const location = getContourMeshTextureTileLocation(request);
  return [
    location.mapId,
    location.canvasTheme,
    location.themeVariant,
    location.textureSeed,
    location.generatorVersion,
    location.tileSize,
  ].join(':');
}

async function generateContourMeshTextureTile(
  request: ContourMeshTextureTileRequest,
): Promise<CachedContourMeshTextureTile> {
  const canvas = createSizedCanvas(CONTOUR_MESH_TILE_SIZE, CONTOUR_MESH_TILE_SIZE);
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Could not create contour mesh texture canvas.');
  }

  renderContourMeshTextureTile(
    context,
    CONTOUR_MESH_TILE_SIZE,
    CONTOUR_MESH_TILE_SIZE,
    request.theme,
    request.textureSeed,
  );

  const blob = await canvasToBlob(canvas);
  if (!shouldBypassPersistedContourMeshTextureTiles()) {
    await saveTextureTile(getContourMeshTextureTileLocation(request), blob);
  }

  return { blob, canvas };
}

async function loadStoredContourMeshTextureTile(
  request: ContourMeshTextureTileRequest,
): Promise<CachedContourMeshTextureTile | null> {
  if (shouldBypassPersistedContourMeshTextureTiles()) {
    return null;
  }

  const stored = await loadTextureTile(getContourMeshTextureTileLocation(request));
  if (!stored) {
    return null;
  }

  return {
    blob: stored.blob,
    canvas: await blobToCanvas(stored.blob),
  };
}

async function ensureContourMeshTextureTile(
  request: ContourMeshTextureTileRequest,
): Promise<CachedContourMeshTextureTile> {
  const cacheKey = getContourMeshTextureTileCacheKey(request);
  const cached = contourMeshTextureTileCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const inflight = (async () => {
    const stored = await loadStoredContourMeshTextureTile(request);
    if (stored) {
      return stored;
    }

    return generateContourMeshTextureTile(request);
  })();

  contourMeshTextureTileCache.set(cacheKey, inflight);
  inflight.catch(() => {
    contourMeshTextureTileCache.delete(cacheKey);
  });
  return inflight;
}

export async function ensureContourMeshTextureTileBlob(
  request: ContourMeshTextureTileRequest,
): Promise<Blob> {
  const tile = await ensureContourMeshTextureTile(request);
  return tile.blob;
}

export async function drawContourMeshTexture(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme: ContourMeshTextureTheme,
  request: ContourMeshTextureTileRequest,
): Promise<void> {
  context.fillStyle = getContourMeshBaseColor(theme);
  context.fillRect(0, 0, width, height);

  if (width <= 0 || height <= 0) {
    return;
  }

  const tile = await ensureContourMeshTextureTile(request);
  const scaledTileSize = CONTOUR_MESH_TILE_SIZE * CONTOUR_MESH_RENDER_SCALE;

  for (let y = 0; y < height; y += scaledTileSize) {
    for (let x = 0; x < width; x += scaledTileSize) {
      context.drawImage(tile.canvas, x, y, scaledTileSize, scaledTileSize);
    }
  }
}
