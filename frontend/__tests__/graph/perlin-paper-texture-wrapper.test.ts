import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockBlobToCanvas = jest.fn<typeof import('../../src/components/map-background-raster').blobToCanvas>();
const mockCanvasToBlob = jest.fn<typeof import('../../src/components/map-background-raster').canvasToBlob>();
const mockCreateSizedCanvas = jest.fn<typeof import('../../src/components/map-background-raster').createSizedCanvas>();
const mockLoadTextureTile = jest.fn<typeof import('../../src/storage/map-store').loadTextureTile>();
const mockSaveTextureTile = jest.fn<typeof import('../../src/storage/map-store').saveTextureTile>();
const mockGeneratePaperTextureTilePixelBuffer = jest.fn<typeof import('../../src/graph/perlin-paper-texture-core').generatePaperTextureTilePixelBuffer>();
const mockGetPaperTextureBaseColor = jest.fn<typeof import('../../src/graph/perlin-paper-texture-core').getPaperTextureBaseColor>();

await jest.unstable_mockModule('../../src/components/map-background-raster', () => ({
  blobToCanvas: mockBlobToCanvas,
  canvasToBlob: mockCanvasToBlob,
  createSizedCanvas: mockCreateSizedCanvas,
}));

await jest.unstable_mockModule('../../src/storage/map-store', () => ({
  loadTextureTile: mockLoadTextureTile,
  saveTextureTile: mockSaveTextureTile,
}));

await jest.unstable_mockModule('../../src/graph/perlin-paper-texture-core', () => ({
  PAPER_TEXTURE_TILE_SIZE: 512,
  generatePaperTextureTilePixelBuffer: mockGeneratePaperTextureTilePixelBuffer,
  getPaperTextureBaseColor: mockGetPaperTextureBaseColor,
}));

const {
  PAPER_TEXTURE_RENDER_SCALE,
  drawPaperTexture,
  ensurePaperTextureTileBlob,
} = await import('../../src/graph/perlin-paper-texture');

type FakeContext = {
  readonly fillRect: ReturnType<typeof jest.fn>;
  readonly drawImage: ReturnType<typeof jest.fn>;
  fillStyle: string;
};

function createFakeContext(): FakeContext {
  return {
    fillRect: jest.fn(),
    drawImage: jest.fn(),
    fillStyle: '',
  };
}

function createFakeCanvas(label: string): HTMLCanvasElement {
  const context = {
    createImageData: jest.fn((width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
    })),
    putImageData: jest.fn(),
  };
  return {
    dataset: { label },
    getContext: jest.fn(() => context),
  } as unknown as HTMLCanvasElement;
}

describe('perlin-paper-texture wrapper', () => {
  beforeEach(() => {
    mockBlobToCanvas.mockReset();
    mockCanvasToBlob.mockReset();
    mockCreateSizedCanvas.mockReset();
    mockLoadTextureTile.mockReset();
    mockSaveTextureTile.mockReset();
    mockGeneratePaperTextureTilePixelBuffer.mockReset();
    mockGetPaperTextureBaseColor.mockReset();

    mockGetPaperTextureBaseColor.mockReturnValue('rgb(7, 8, 9)');
    mockGeneratePaperTextureTilePixelBuffer.mockReturnValue(new Uint8ClampedArray(512 * 512 * 4));
  });

  it('generates, blobs, and saves a paper texture tile on a cache miss', async () => {
    const generatedCanvas = createFakeCanvas('generated-paper');
    const blob = new Blob(['paper']);

    mockCreateSizedCanvas.mockReturnValue(generatedCanvas);
    mockCanvasToBlob.mockResolvedValue(blob);
    mockLoadTextureTile.mockResolvedValue(undefined);

    const result = await ensurePaperTextureTileBlob({
      mapId: 'paper-generate',
      textureSeed: 101,
      theme: 'light',
    });

    expect(result).toBe(blob);
    expect(mockCreateSizedCanvas).toHaveBeenCalledWith(512, 512);
    expect(mockGeneratePaperTextureTilePixelBuffer).toHaveBeenCalledWith(512, 512, 'light', 101);
    expect(mockCanvasToBlob).toHaveBeenCalledWith(generatedCanvas);
    expect(mockSaveTextureTile).toHaveBeenCalledWith({
      mapId: 'paper-generate',
      canvasTheme: 'paper',
      themeVariant: 'light',
      textureSeed: 101,
      generatorVersion: 1,
      tileSize: 512,
    }, blob);
  });

  it('reuses a stored paper texture tile instead of regenerating it', async () => {
    const storedBlob = new Blob(['stored-paper']);
    const storedCanvas = createFakeCanvas('stored-paper');

    mockLoadTextureTile.mockResolvedValue({ blob: storedBlob });
    mockBlobToCanvas.mockResolvedValue(storedCanvas);

    const result = await ensurePaperTextureTileBlob({
      mapId: 'paper-stored',
      textureSeed: 202,
      theme: 'dark',
    });

    expect(result).toBe(storedBlob);
    expect(mockBlobToCanvas).toHaveBeenCalledWith(storedBlob);
    expect(mockGeneratePaperTextureTilePixelBuffer).not.toHaveBeenCalled();
    expect(mockSaveTextureTile).not.toHaveBeenCalled();
  });

  it('memoizes in-flight paper tile generation for the same request key', async () => {
    const generatedCanvas = createFakeCanvas('memo-paper');
    const blob = new Blob(['memo-paper']);

    mockCreateSizedCanvas.mockReturnValue(generatedCanvas);
    mockCanvasToBlob.mockResolvedValue(blob);
    mockLoadTextureTile.mockResolvedValue(undefined);

    const request = {
      mapId: 'paper-cache',
      textureSeed: 303,
      theme: 'light' as const,
    };

    const [first, second] = await Promise.all([
      ensurePaperTextureTileBlob(request),
      ensurePaperTextureTileBlob(request),
    ]);

    expect(first).toBe(blob);
    expect(second).toBe(blob);
    expect(mockLoadTextureTile).toHaveBeenCalledTimes(1);
    expect(mockCreateSizedCanvas).toHaveBeenCalledTimes(1);
    expect(mockCanvasToBlob).toHaveBeenCalledTimes(1);
  });

  it('fills the base color and skips drawImage for a zero-sized draw target', async () => {
    const context = createFakeContext();

    await drawPaperTexture(
      context as unknown as CanvasRenderingContext2D,
      0,
      120,
      'light',
      { mapId: 'paper-zero', textureSeed: 404, theme: 'light' },
    );

    expect(context.fillStyle).toBe('rgb(7, 8, 9)');
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 0, 120);
    expect(context.drawImage).not.toHaveBeenCalled();
  });

  it('tiles the cached paper canvas across the requested draw area', async () => {
    const context = createFakeContext();
    const storedBlob = new Blob(['stored-paper-draw']);
    const storedCanvas = createFakeCanvas('stored-paper-draw');

    mockLoadTextureTile.mockResolvedValue({ blob: storedBlob });
    mockBlobToCanvas.mockResolvedValue(storedCanvas);

    await drawPaperTexture(
      context as unknown as CanvasRenderingContext2D,
      (512 * PAPER_TEXTURE_RENDER_SCALE) + 30,
      (512 * PAPER_TEXTURE_RENDER_SCALE) + 15,
      'dark',
      { mapId: 'paper-draw', textureSeed: 505, theme: 'dark' },
    );

    expect(context.fillRect).toHaveBeenCalledWith(0, 0, (512 * PAPER_TEXTURE_RENDER_SCALE) + 30, (512 * PAPER_TEXTURE_RENDER_SCALE) + 15);
    expect(context.drawImage).toHaveBeenCalledTimes(4);
    expect(context.drawImage).toHaveBeenNthCalledWith(1, storedCanvas, 0, 0, 512 * PAPER_TEXTURE_RENDER_SCALE, 512 * PAPER_TEXTURE_RENDER_SCALE);
  });
});
