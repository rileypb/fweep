import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  ensurePaperTextureChunk,
  getCachedPaperTextureChunk,
  PAPER_TEXTURE_CHUNK_MAP_SIZE,
  RUNTIME_PAPER_TEXTURE_SEED,
  drawPaperTexture,
  getPaperTextureBaseColor,
} from '../../src/graph/perlin-paper-texture';

describe('perlin-paper-texture', () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        __FWEEP_ENABLE_TEST_PAPER_TEXTURE_CANVAS__?: boolean;
      }
    ).__FWEEP_ENABLE_TEST_PAPER_TEXTURE_CANVAS__ = true;
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
      fillRect: jest.fn<(x: number, y: number, width: number, height: number) => void>(),
      createImageData: (width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
      }),
      putImageData: jest.fn<(imageData: ImageData, dx: number, dy: number) => void>(),
      drawImage: jest.fn<(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number) => void>(),
      fillStyle: '',
    }) as unknown as CanvasRenderingContext2D);
  });

  afterEach(() => {
    delete (
      globalThis as typeof globalThis & {
        __FWEEP_ENABLE_TEST_PAPER_TEXTURE_CANVAS__?: boolean;
      }
    ).__FWEEP_ENABLE_TEST_PAPER_TEXTURE_CANVAS__;
    jest.restoreAllMocks();
  });

  it('uses a numeric runtime seed', () => {
    expect(Number.isInteger(RUNTIME_PAPER_TEXTURE_SEED)).toBe(true);
    expect(RUNTIME_PAPER_TEXTURE_SEED).toBeGreaterThanOrEqual(0);
  });

  it('returns a theme-specific base color', () => {
    const baseColor = getPaperTextureBaseColor('light');

    expect(baseColor).toMatch(/^rgb\(/);
  });

  it('uses different palettes for light and dark themes', () => {
    const lightStyle = getPaperTextureBaseColor('light');
    const darkStyle = getPaperTextureBaseColor('dark');

    expect(lightStyle).not.toBe(darkStyle);
  });

  it('samples the generated texture directly into the export canvas', () => {
    const fillRect = jest.fn<(x: number, y: number, width: number, height: number) => void>();
    const putImageData = jest.fn<(imageData: ImageData, dx: number, dy: number) => void>();
    const context = {
      fillRect,
      createImageData: (width: number, height: number) => ({
        data: new Uint8ClampedArray(width * height * 4),
        width,
        height,
      }),
      putImageData,
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D;

    drawPaperTexture(context, 260, 130, 'light', {
      mapOriginX: 25,
      mapOriginY: 50,
      pixelsPerMapUnit: 2,
    });

    expect(fillRect).toHaveBeenCalledWith(0, 0, 260, 130);
    expect(putImageData).toHaveBeenCalledWith(expect.objectContaining({
      width: 260,
      height: 130,
    }), 0, 0);
  });

  it('changes the sampled pixels when the map origin changes', () => {
    const firstImageData = {
      data: new Uint8ClampedArray(64 * 64 * 4),
      width: 64,
      height: 64,
    };
    const secondImageData = {
      data: new Uint8ClampedArray(64 * 64 * 4),
      width: 64,
      height: 64,
    };
    const createImageData = jest.fn<(_: number, __: number) => ImageData>()
      .mockReturnValueOnce(firstImageData as unknown as ImageData)
      .mockReturnValueOnce(secondImageData as unknown as ImageData);
    const context = {
      fillRect: jest.fn<(x: number, y: number, width: number, height: number) => void>(),
      createImageData,
      putImageData: jest.fn<(imageData: ImageData, dx: number, dy: number) => void>(),
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D;

    drawPaperTexture(context, 64, 64, 'light', { mapOriginX: 0, mapOriginY: 0, pixelsPerMapUnit: 1 });
    drawPaperTexture(context, 64, 64, 'light', { mapOriginX: 200, mapOriginY: 200, pixelsPerMapUnit: 1 });

    expect(Array.from(firstImageData.data)).not.toEqual(Array.from(secondImageData.data));
  });

  it('caches world-space texture chunks by theme and chunk coordinate', () => {
    const firstChunk = ensurePaperTextureChunk('light', 0, 0);
    const sameChunk = ensurePaperTextureChunk('light', 0, 0);
    const differentChunk = ensurePaperTextureChunk('light', 1, 0);

    expect(firstChunk).toBeTruthy();
    expect(firstChunk).toBe(sameChunk);
    expect(firstChunk).not.toBe(differentChunk);
    expect(getCachedPaperTextureChunk('light', 0, 0)).toBe(firstChunk);
  });

  it('uses the shared chunk size when generating cached chunks', () => {
    const chunk = ensurePaperTextureChunk('dark', 2, 3);

    expect(chunk).toMatchObject({
      width: PAPER_TEXTURE_CHUNK_MAP_SIZE,
      height: PAPER_TEXTURE_CHUNK_MAP_SIZE,
    });
    expect(RUNTIME_PAPER_TEXTURE_SEED).toBeGreaterThanOrEqual(0);
  });
});
