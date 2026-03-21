import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockBlobToCanvas = jest.fn<typeof import('../../src/components/map-background-raster').blobToCanvas>();
const mockCanvasToBlob = jest.fn<typeof import('../../src/components/map-background-raster').canvasToBlob>();
const mockCreateSizedCanvas = jest.fn<typeof import('../../src/components/map-background-raster').createSizedCanvas>();
const mockLoadTextureTile = jest.fn<typeof import('../../src/storage/map-store').loadTextureTile>();
const mockSaveTextureTile = jest.fn<typeof import('../../src/storage/map-store').saveTextureTile>();
const mockDrawContourMeshTexture = jest.fn<typeof import('../../src/graph/contour-mesh-texture').drawContourMeshTexture>();
const mockEnsureContourMeshTextureTileBlob = jest.fn<typeof import('../../src/graph/contour-mesh-texture').ensureContourMeshTextureTileBlob>();
const mockGenerateContourLandscapeTextureTilePixelBuffer = jest.fn<typeof import('../../src/graph/contour-landscape-texture-core').generateContourLandscapeTextureTilePixelBuffer>();
const mockGetContourLandscapeBaseColor = jest.fn<typeof import('../../src/graph/contour-landscape-texture-core').getContourLandscapeBaseColor>();

await jest.unstable_mockModule('../../src/components/map-background-raster', () => ({
  blobToCanvas: mockBlobToCanvas,
  canvasToBlob: mockCanvasToBlob,
  createSizedCanvas: mockCreateSizedCanvas,
}));

await jest.unstable_mockModule('../../src/storage/map-store', () => ({
  loadTextureTile: mockLoadTextureTile,
  saveTextureTile: mockSaveTextureTile,
}));

await jest.unstable_mockModule('../../src/graph/contour-mesh-texture', () => ({
  drawContourMeshTexture: mockDrawContourMeshTexture,
  ensureContourMeshTextureTileBlob: mockEnsureContourMeshTextureTileBlob,
}));

await jest.unstable_mockModule('../../src/graph/contour-landscape-texture-core', () => ({
  CONTOUR_LANDSCAPE_TILE_SIZE: 512,
  generateContourLandscapeTextureTilePixelBuffer: mockGenerateContourLandscapeTextureTilePixelBuffer,
  getContourLandscapeBaseColor: mockGetContourLandscapeBaseColor,
}));

const {
  CONTOUR_LANDSCAPE_RENDER_SCALE,
  drawContourLandscapeTexture,
  ensureContourLandscapeTextureTileBlob,
} = await import('../../src/graph/contour-landscape-texture');

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

describe('contour-landscape-texture wrapper', () => {
  beforeEach(() => {
    mockBlobToCanvas.mockReset();
    mockCanvasToBlob.mockReset();
    mockCreateSizedCanvas.mockReset();
    mockLoadTextureTile.mockReset();
    mockSaveTextureTile.mockReset();
    mockDrawContourMeshTexture.mockReset();
    mockEnsureContourMeshTextureTileBlob.mockReset();
    mockGenerateContourLandscapeTextureTilePixelBuffer.mockReset();
    mockGetContourLandscapeBaseColor.mockReset();

    mockGetContourLandscapeBaseColor.mockReturnValue('rgb(9, 8, 7)');
    mockGenerateContourLandscapeTextureTilePixelBuffer.mockReturnValue(new Uint8ClampedArray(512 * 512 * 4));
  });

  it('delegates contour tile-blob requests to the contour mesh renderer', async () => {
    const blob = new Blob(['mesh-blob']);
    mockEnsureContourMeshTextureTileBlob.mockResolvedValue(blob);

    const result = await ensureContourLandscapeTextureTileBlob({
      mapId: 'map-contour-blob',
      textureSeed: 5,
      theme: 'light',
      canvasTheme: 'contour',
    });

    expect(result).toBe(blob);
    expect(mockEnsureContourMeshTextureTileBlob).toHaveBeenCalledWith({
      mapId: 'map-contour-blob',
      textureSeed: 5,
      theme: 'light',
    });
    expect(mockGenerateContourLandscapeTextureTilePixelBuffer).not.toHaveBeenCalled();
  });

  it('generates, blobs, and saves an antique landscape tile on a cache miss', async () => {
    const generatedCanvas = createFakeCanvas('landscape');
    const blob = new Blob(['landscape-blob']);

    mockCreateSizedCanvas.mockReturnValue(generatedCanvas);
    mockCanvasToBlob.mockResolvedValue(blob);
    mockLoadTextureTile.mockResolvedValue(undefined);

    const result = await ensureContourLandscapeTextureTileBlob({
      mapId: 'map-antique-generate',
      textureSeed: 6,
      theme: 'light',
      canvasTheme: 'antique',
    });

    expect(result).toBe(blob);
    expect(mockGenerateContourLandscapeTextureTilePixelBuffer).toHaveBeenCalledWith(512, 512, 'light', 6, 'antique');
    expect(mockCanvasToBlob).toHaveBeenCalledWith(generatedCanvas);
    expect(mockSaveTextureTile).toHaveBeenCalledWith({
      mapId: 'map-antique-generate',
      canvasTheme: 'antique',
      themeVariant: 'light',
      textureSeed: 6,
      generatorVersion: 1,
      tileSize: 512,
    }, blob);
  });

  it('reuses a stored antique landscape tile instead of regenerating it', async () => {
    const storedBlob = new Blob(['stored-landscape']);
    const storedCanvas = createFakeCanvas('stored-landscape');

    mockLoadTextureTile.mockResolvedValue({ blob: storedBlob });
    mockBlobToCanvas.mockResolvedValue(storedCanvas);

    const result = await ensureContourLandscapeTextureTileBlob({
      mapId: 'map-antique-stored',
      textureSeed: 7,
      theme: 'dark',
      canvasTheme: 'antique',
    });

    expect(result).toBe(storedBlob);
    expect(mockBlobToCanvas).toHaveBeenCalledWith(storedBlob);
    expect(mockGenerateContourLandscapeTextureTilePixelBuffer).not.toHaveBeenCalled();
    expect(mockSaveTextureTile).not.toHaveBeenCalled();
  });

  it('delegates contour drawing to the contour mesh renderer', async () => {
    const context = createFakeContext();

    await drawContourLandscapeTexture(
      context as unknown as CanvasRenderingContext2D,
      300,
      200,
      'dark',
      {
        mapId: 'map-contour-draw',
        textureSeed: 8,
        theme: 'dark',
        canvasTheme: 'contour',
      },
    );

    expect(mockDrawContourMeshTexture).toHaveBeenCalledWith(
      context,
      300,
      200,
      'dark',
      {
        mapId: 'map-contour-draw',
        textureSeed: 8,
        theme: 'dark',
      },
    );
    expect(context.fillRect).not.toHaveBeenCalled();
  });

  it('fills the base color and skips drawImage when the target size is zero', async () => {
    const context = createFakeContext();

    await drawContourLandscapeTexture(
      context as unknown as CanvasRenderingContext2D,
      0,
      100,
      'light',
      {
        mapId: 'map-antique-zero',
        textureSeed: 9,
        theme: 'light',
        canvasTheme: 'antique',
      },
    );

    expect(context.fillStyle).toBe('rgb(9, 8, 7)');
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 0, 100);
    expect(context.drawImage).not.toHaveBeenCalled();
  });

  it('tiles the generated antique canvas across the requested draw area', async () => {
    const context = createFakeContext();
    const storedBlob = new Blob(['stored-antique']);
    const storedCanvas = createFakeCanvas('stored-antique');

    mockLoadTextureTile.mockResolvedValue({ blob: storedBlob });
    mockBlobToCanvas.mockResolvedValue(storedCanvas);

    await drawContourLandscapeTexture(
      context as unknown as CanvasRenderingContext2D,
      (512 * CONTOUR_LANDSCAPE_RENDER_SCALE) + 40,
      (512 * CONTOUR_LANDSCAPE_RENDER_SCALE) + 20,
      'light',
      {
        mapId: 'map-antique-draw',
        textureSeed: 10,
        theme: 'light',
        canvasTheme: 'antique',
      },
    );

    expect(context.fillRect).toHaveBeenCalledWith(0, 0, (512 * CONTOUR_LANDSCAPE_RENDER_SCALE) + 40, (512 * CONTOUR_LANDSCAPE_RENDER_SCALE) + 20);
    expect(context.drawImage).toHaveBeenCalledTimes(4);
    expect(context.drawImage).toHaveBeenNthCalledWith(1, storedCanvas, 0, 0, 512 * CONTOUR_LANDSCAPE_RENDER_SCALE, 512 * CONTOUR_LANDSCAPE_RENDER_SCALE);
  });
});
