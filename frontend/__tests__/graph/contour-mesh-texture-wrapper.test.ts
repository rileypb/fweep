import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { TextureTileRecord } from '../../src/storage/map-store';

const mockBlobToCanvas = jest.fn<typeof import('../../src/components/map-background-raster').blobToCanvas>();
const mockCanvasToBlob = jest.fn<typeof import('../../src/components/map-background-raster').canvasToBlob>();
const mockCreateSizedCanvas = jest.fn<typeof import('../../src/components/map-background-raster').createSizedCanvas>();
const mockLoadTextureTile = jest.fn<typeof import('../../src/storage/map-store').loadTextureTile>();
const mockSaveTextureTile = jest.fn<typeof import('../../src/storage/map-store').saveTextureTile>();
const mockRenderContourMeshTextureTile = jest.fn<typeof import('../../src/graph/contour-mesh-texture-core').renderContourMeshTextureTile>();
const mockGetContourMeshBaseColor = jest.fn<typeof import('../../src/graph/contour-mesh-texture-core').getContourMeshBaseColor>();

await jest.unstable_mockModule('../../src/components/map-background-raster', () => ({
  blobToCanvas: mockBlobToCanvas,
  canvasToBlob: mockCanvasToBlob,
  createSizedCanvas: mockCreateSizedCanvas,
}));

await jest.unstable_mockModule('../../src/storage/map-store', () => ({
  loadTextureTile: mockLoadTextureTile,
  saveTextureTile: mockSaveTextureTile,
}));

await jest.unstable_mockModule('../../src/graph/contour-mesh-texture-core', () => ({
  CONTOUR_MESH_TILE_SIZE: 512,
  getContourMeshBaseColor: mockGetContourMeshBaseColor,
  renderContourMeshTextureTile: mockRenderContourMeshTextureTile,
}));

const {
  CONTOUR_MESH_RENDER_SCALE,
  drawContourMeshTexture,
  ensureContourMeshTextureTileBlob,
} = await import('../../src/graph/contour-mesh-texture');

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
  const context = {};
  return {
    dataset: { label },
    getContext: jest.fn(() => context),
  } as unknown as HTMLCanvasElement;
}

function createStoredTextureTileRecord(blob: Blob): TextureTileRecord {
  return {
    key: 'stored-texture-tile',
    mapId: 'stored-map',
    canvasTheme: 'contour',
    themeVariant: 'light',
    textureSeed: 0,
    generatorVersion: 1,
    tileSize: 512,
    blob,
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('contour-mesh-texture wrapper', () => {
  beforeEach(() => {
    mockBlobToCanvas.mockReset();
    mockCanvasToBlob.mockReset();
    mockCreateSizedCanvas.mockReset();
    mockLoadTextureTile.mockReset();
    mockSaveTextureTile.mockReset();
    mockRenderContourMeshTextureTile.mockReset();
    mockGetContourMeshBaseColor.mockReset();

    mockGetContourMeshBaseColor.mockReturnValue('rgb(1, 2, 3)');
  });

  it('generates, renders, blobs, and saves a contour mesh tile on a cache miss', async () => {
    const generatedCanvas = createFakeCanvas('generated');
    const blob = new Blob(['mesh']);

    mockCreateSizedCanvas.mockReturnValue(generatedCanvas);
    mockCanvasToBlob.mockResolvedValue(blob);
    mockLoadTextureTile.mockResolvedValue(undefined);

    const result = await ensureContourMeshTextureTileBlob({
      mapId: 'map-generate',
      textureSeed: 123,
      theme: 'light',
    });

    expect(result).toBe(blob);
    expect(mockCreateSizedCanvas).toHaveBeenCalledWith(512, 512);
    expect(mockRenderContourMeshTextureTile).toHaveBeenCalledWith(
      expect.anything(),
      512,
      512,
      'light',
      123,
    );
    expect(mockCanvasToBlob.mock.calls[0]?.[0]).toBe(generatedCanvas);
    expect(mockSaveTextureTile).toHaveBeenCalledWith({
      mapId: 'map-generate',
      canvasTheme: 'contour',
      themeVariant: 'light',
      textureSeed: 123,
      generatorVersion: 1,
      tileSize: 512,
    }, blob);
  });

  it('reuses a stored contour mesh tile instead of regenerating it', async () => {
    const storedBlob = new Blob(['stored']);
    const storedCanvas = createFakeCanvas('stored');

    mockLoadTextureTile.mockResolvedValue(createStoredTextureTileRecord(storedBlob));
    mockBlobToCanvas.mockResolvedValue(storedCanvas);

    const result = await ensureContourMeshTextureTileBlob({
      mapId: 'map-stored',
      textureSeed: 456,
      theme: 'dark',
    });

    expect(result).toBe(storedBlob);
    expect(mockBlobToCanvas).toHaveBeenCalledWith(storedBlob);
    expect(mockCreateSizedCanvas).not.toHaveBeenCalled();
    expect(mockRenderContourMeshTextureTile).not.toHaveBeenCalled();
    expect(mockCanvasToBlob).not.toHaveBeenCalled();
    expect(mockSaveTextureTile).not.toHaveBeenCalled();
  });

  it('memoizes in-flight tile generation for the same request key', async () => {
    const generatedCanvas = createFakeCanvas('memoized');
    const blob = new Blob(['memoized']);

    mockCreateSizedCanvas.mockReturnValue(generatedCanvas);
    mockCanvasToBlob.mockResolvedValue(blob);
    mockLoadTextureTile.mockResolvedValue(undefined);

    const request = {
      mapId: 'map-cache',
      textureSeed: 789,
      theme: 'light' as const,
    };

    const [first, second] = await Promise.all([
      ensureContourMeshTextureTileBlob(request),
      ensureContourMeshTextureTileBlob(request),
    ]);

    expect(first).toBe(blob);
    expect(second).toBe(blob);
    expect(mockLoadTextureTile).toHaveBeenCalledTimes(1);
    expect(mockCreateSizedCanvas).toHaveBeenCalledTimes(1);
    expect(mockCanvasToBlob).toHaveBeenCalledTimes(1);
  });

  it('fills the base color and skips drawImage when drawing a zero-sized target', async () => {
    const context = createFakeContext();

    await drawContourMeshTexture(
      context as unknown as CanvasRenderingContext2D,
      0,
      200,
      'light',
      { mapId: 'map-zero', textureSeed: 1, theme: 'light' },
    );

    expect(context.fillStyle).toBe('rgb(1, 2, 3)');
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 0, 200);
    expect(context.drawImage).not.toHaveBeenCalled();
  });

  it('tiles the cached mesh canvas across the requested draw area', async () => {
    const context = createFakeContext();
    const storedBlob = new Blob(['stored']);
    const storedCanvas = createFakeCanvas('tile');

    mockLoadTextureTile.mockResolvedValue(createStoredTextureTileRecord(storedBlob));
    mockBlobToCanvas.mockResolvedValue(storedCanvas);

    await drawContourMeshTexture(
      context as unknown as CanvasRenderingContext2D,
      (512 * CONTOUR_MESH_RENDER_SCALE) + 10,
      (512 * CONTOUR_MESH_RENDER_SCALE) + 20,
      'dark',
      { mapId: 'map-draw', textureSeed: 2, theme: 'dark' },
    );

    expect(context.fillRect).toHaveBeenCalledWith(0, 0, (512 * CONTOUR_MESH_RENDER_SCALE) + 10, (512 * CONTOUR_MESH_RENDER_SCALE) + 20);
    expect(context.drawImage).toHaveBeenCalledTimes(4);
    expect(context.drawImage).toHaveBeenNthCalledWith(1, storedCanvas, 0, 0, 512 * CONTOUR_MESH_RENDER_SCALE, 512 * CONTOUR_MESH_RENDER_SCALE);
  });
});
