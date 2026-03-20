import {
  generatePaperTexturePixelBuffer,
  getPaperTextureBaseColor,
  PAPER_TEXTURE_CHUNK_MAP_SIZE,
  type PaperTextureRenderOptions,
  type PaperTextureTheme,
} from './perlin-paper-texture-core';

export {
  getPaperTextureBaseColor,
  PAPER_TEXTURE_CHUNK_MAP_SIZE,
  type PaperTextureRenderOptions,
  type PaperTextureTheme,
};

export const RUNTIME_PAPER_TEXTURE_SEED = Math.floor(Math.random() * 0x7fffffff);

const MAX_CACHED_PAPER_TEXTURE_CHUNKS = 192;
type CachedPaperTextureChunk = HTMLCanvasElement | null;

interface PaperTextureWorkerRequest {
  readonly requestId: number;
  readonly seed: number;
  readonly theme: PaperTextureTheme;
  readonly chunkX: number;
  readonly chunkY: number;
}

interface PaperTextureWorkerResponse {
  readonly requestId: number;
  readonly theme: PaperTextureTheme;
  readonly chunkX: number;
  readonly chunkY: number;
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

const paperTextureChunkCache = new Map<string, CachedPaperTextureChunk>();
const paperTextureChunkInflightRequests = new Map<string, Promise<CachedPaperTextureChunk>>();
const pendingWorkerRequests = new Map<number, {
  readonly theme: PaperTextureTheme;
  readonly chunkX: number;
  readonly chunkY: number;
  readonly resolve: (chunk: CachedPaperTextureChunk) => void;
  readonly reject: (error: unknown) => void;
}>();
let nextPaperTextureWorkerRequestId = 1;
let paperTextureWorker: Worker | null | undefined;

function canUseRuntimePaperTextureCanvas(): boolean {
  if (typeof document === 'undefined') {
    return false;
  }

  if (
    typeof navigator !== 'undefined'
    && /\bjsdom\b/i.test(navigator.userAgent)
    && !(
      globalThis as typeof globalThis & {
        __FWEEP_ENABLE_TEST_PAPER_TEXTURE_CANVAS__?: boolean;
      }
    ).__FWEEP_ENABLE_TEST_PAPER_TEXTURE_CANVAS__
  ) {
    return false;
  }

  return true;
}

function canUsePaperTextureWorker(): boolean {
  if (!canUseRuntimePaperTextureCanvas()) {
    return false;
  }

  if (typeof Worker === 'undefined') {
    return false;
  }

  return true;
}

function getPaperTextureChunkCacheKey(theme: PaperTextureTheme, chunkX: number, chunkY: number): string {
  return `${RUNTIME_PAPER_TEXTURE_SEED}:${theme}:${chunkX}:${chunkY}`;
}

function trimPaperTextureChunkCache(): void {
  while (paperTextureChunkCache.size > MAX_CACHED_PAPER_TEXTURE_CHUNKS) {
    const oldestKey = paperTextureChunkCache.keys().next().value;
    if (oldestKey === undefined) {
      return;
    }
    paperTextureChunkCache.delete(oldestKey);
  }
}

function createPaperTextureChunkCanvas(width: number, height: number, data: Uint8ClampedArray): CachedPaperTextureChunk {
  if (!canUseRuntimePaperTextureCanvas()) {
    return null;
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) {
    return null;
  }

  const image = context.createImageData(width, height);
  image.data.set(data);
  context.putImageData(image, 0, 0);
  return canvas;
}

function storePaperTextureChunk(
  theme: PaperTextureTheme,
  chunkX: number,
  chunkY: number,
  chunk: CachedPaperTextureChunk,
): CachedPaperTextureChunk {
  const key = getPaperTextureChunkCacheKey(theme, chunkX, chunkY);
  paperTextureChunkCache.set(key, chunk);
  trimPaperTextureChunkCache();
  return chunk;
}

function getPaperTextureWorker(): Worker | null {
  if (paperTextureWorker !== undefined) {
    return paperTextureWorker;
  }

  if (!canUsePaperTextureWorker()) {
    paperTextureWorker = null;
    return paperTextureWorker;
  }

  const worker = new Worker(new URL('./perlin-paper-texture-worker.ts', import.meta.url), { type: 'module' });
  worker.onmessage = (event: MessageEvent<PaperTextureWorkerResponse>) => {
    const pending = pendingWorkerRequests.get(event.data.requestId);
    if (!pending) {
      return;
    }

    pendingWorkerRequests.delete(event.data.requestId);
    const chunk = createPaperTextureChunkCanvas(event.data.width, event.data.height, event.data.data);
    const storedChunk = storePaperTextureChunk(event.data.theme, event.data.chunkX, event.data.chunkY, chunk);
    paperTextureChunkInflightRequests.delete(getPaperTextureChunkCacheKey(event.data.theme, event.data.chunkX, event.data.chunkY));
    pending.resolve(storedChunk);
  };
  worker.onerror = (event) => {
    const error = event.error ?? new Error(event.message);
    for (const [requestId, pending] of pendingWorkerRequests) {
      pendingWorkerRequests.delete(requestId);
      paperTextureChunkInflightRequests.delete(getPaperTextureChunkCacheKey(pending.theme, pending.chunkX, pending.chunkY));
      pending.reject(error);
    }
  };
  paperTextureWorker = worker;
  return worker;
}

export function getCachedPaperTextureChunk(
  theme: PaperTextureTheme,
  chunkX: number,
  chunkY: number,
): CachedPaperTextureChunk | undefined {
  const key = getPaperTextureChunkCacheKey(theme, chunkX, chunkY);
  const cached = paperTextureChunkCache.get(key);
  if (cached === undefined) {
    return undefined;
  }

  paperTextureChunkCache.delete(key);
  paperTextureChunkCache.set(key, cached);
  return cached;
}

export function ensurePaperTextureChunk(
  theme: PaperTextureTheme,
  chunkX: number,
  chunkY: number,
): CachedPaperTextureChunk {
  const existing = getCachedPaperTextureChunk(theme, chunkX, chunkY);
  if (existing !== undefined) {
    return existing;
  }

  if (!canUseRuntimePaperTextureCanvas()) {
    return storePaperTextureChunk(theme, chunkX, chunkY, null);
  }

  const data = generatePaperTexturePixelBuffer(
    PAPER_TEXTURE_CHUNK_MAP_SIZE,
    PAPER_TEXTURE_CHUNK_MAP_SIZE,
    theme,
    {
      mapOriginX: chunkX * PAPER_TEXTURE_CHUNK_MAP_SIZE,
      mapOriginY: chunkY * PAPER_TEXTURE_CHUNK_MAP_SIZE,
      pixelsPerMapUnit: 1,
    },
    RUNTIME_PAPER_TEXTURE_SEED,
  );
  const chunk = createPaperTextureChunkCanvas(PAPER_TEXTURE_CHUNK_MAP_SIZE, PAPER_TEXTURE_CHUNK_MAP_SIZE, data);
  return storePaperTextureChunk(theme, chunkX, chunkY, chunk);
}

export function requestPaperTextureChunk(
  theme: PaperTextureTheme,
  chunkX: number,
  chunkY: number,
): Promise<CachedPaperTextureChunk> {
  const existing = getCachedPaperTextureChunk(theme, chunkX, chunkY);
  if (existing !== undefined) {
    return Promise.resolve(existing);
  }

  const key = getPaperTextureChunkCacheKey(theme, chunkX, chunkY);
  const inflight = paperTextureChunkInflightRequests.get(key);
  if (inflight) {
    return inflight;
  }

  const worker = getPaperTextureWorker();
  if (!worker) {
    const fallback = Promise.resolve(ensurePaperTextureChunk(theme, chunkX, chunkY));
    paperTextureChunkInflightRequests.set(key, fallback);
    fallback.finally(() => {
      paperTextureChunkInflightRequests.delete(key);
    }).catch(() => {});
    return fallback;
  }

  const promise = new Promise<CachedPaperTextureChunk>((resolve, reject) => {
    const requestId = nextPaperTextureWorkerRequestId;
    nextPaperTextureWorkerRequestId += 1;
    pendingWorkerRequests.set(requestId, { theme, chunkX, chunkY, resolve, reject });
    const request: PaperTextureWorkerRequest = { requestId, seed: RUNTIME_PAPER_TEXTURE_SEED, theme, chunkX, chunkY };
    worker.postMessage(request);
  });

  paperTextureChunkInflightRequests.set(key, promise);
  promise.finally(() => {
    paperTextureChunkInflightRequests.delete(key);
  }).catch(() => {});
  return promise;
}

export function drawPaperTexture(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme: PaperTextureTheme,
  options: PaperTextureRenderOptions = {},
): void {
  context.fillStyle = getPaperTextureBaseColor(theme);
  context.fillRect(0, 0, width, height);

  if (width <= 0 || height <= 0) {
    return;
  }

  const image = context.createImageData(width, height);
  image.data.set(generatePaperTexturePixelBuffer(width, height, theme, options, RUNTIME_PAPER_TEXTURE_SEED));
  context.putImageData(image, 0, 0);
}
