import {
  generatePaperTexturePixelBuffer,
  PAPER_TEXTURE_CHUNK_MAP_SIZE,
  type PaperTextureTheme,
} from './perlin-paper-texture-core';

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

const workerScope = self as typeof globalThis & {
  onmessage: ((event: MessageEvent<PaperTextureWorkerRequest>) => void) | null;
  postMessage: (message: PaperTextureWorkerResponse, transfer?: Transferable[]) => void;
};

workerScope.onmessage = (event: MessageEvent<PaperTextureWorkerRequest>) => {
  const { requestId, seed, theme, chunkX, chunkY } = event.data;
  const data = generatePaperTexturePixelBuffer(
    PAPER_TEXTURE_CHUNK_MAP_SIZE,
    PAPER_TEXTURE_CHUNK_MAP_SIZE,
    theme,
    {
      mapOriginX: chunkX * PAPER_TEXTURE_CHUNK_MAP_SIZE,
      mapOriginY: chunkY * PAPER_TEXTURE_CHUNK_MAP_SIZE,
      pixelsPerMapUnit: 1,
    },
    seed,
  );

  const response: PaperTextureWorkerResponse = {
    requestId,
    theme,
    chunkX,
    chunkY,
    width: PAPER_TEXTURE_CHUNK_MAP_SIZE,
    height: PAPER_TEXTURE_CHUNK_MAP_SIZE,
    data,
  };

  workerScope.postMessage(response, [data.buffer]);
};

export {};
