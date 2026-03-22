import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { render, waitFor } from '@testing-library/react';

const mockCreateSizedCanvas = jest.fn<typeof import('../../src/components/map-background-raster').createSizedCanvas>();
const mockDrawPaperTexture = jest.fn<typeof import('../../src/graph/perlin-paper-texture').drawPaperTexture>();
const mockGetPaperTextureBaseColor = jest.fn<typeof import('../../src/graph/perlin-paper-texture').getPaperTextureBaseColor>();
const mockDrawContourLandscapeTexture = jest.fn<typeof import('../../src/graph/contour-landscape-texture').drawContourLandscapeTexture>();
const mockGetContourLandscapeBaseColor = jest.fn<typeof import('../../src/graph/contour-landscape-texture').getContourLandscapeBaseColor>();

await jest.unstable_mockModule('../../src/components/map-background-raster', () => ({
  createSizedCanvas: mockCreateSizedCanvas,
}));

await jest.unstable_mockModule('../../src/graph/perlin-paper-texture', () => ({
  drawPaperTexture: mockDrawPaperTexture,
  getPaperTextureBaseColor: mockGetPaperTextureBaseColor,
}));

await jest.unstable_mockModule('../../src/graph/contour-landscape-texture', () => ({
  drawContourLandscapeTexture: mockDrawContourLandscapeTexture,
  getContourLandscapeBaseColor: mockGetContourLandscapeBaseColor,
}));

const { MapCanvasThemeLayer } = await import('../../src/components/map-canvas-theme-layer');

function createContext2d() {
  return {
    setTransform: jest.fn(),
    clearRect: jest.fn(),
    fillRect: jest.fn(),
    drawImage: jest.fn(),
    scale: jest.fn(),
    fillStyle: '',
  };
}

describe('MapCanvasThemeLayer', () => {
  const originalUserAgent = navigator.userAgent;
  const originalDevicePixelRatio = globalThis.devicePixelRatio;
  const originalGetContext = HTMLCanvasElement.prototype.getContext;

  beforeEach(() => {
    mockCreateSizedCanvas.mockReset();
    mockDrawPaperTexture.mockReset();
    mockGetPaperTextureBaseColor.mockReset();
    mockDrawContourLandscapeTexture.mockReset();
    mockGetContourLandscapeBaseColor.mockReset();

    mockGetPaperTextureBaseColor.mockReturnValue('rgb(1, 2, 3)');
    mockGetContourLandscapeBaseColor.mockReturnValue('rgb(4, 5, 6)');

    Object.defineProperty(globalThis, 'devicePixelRatio', {
      configurable: true,
      writable: true,
      value: 2,
    });
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (test browser)',
    });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent,
    });
    Object.defineProperty(globalThis, 'devicePixelRatio', {
      configurable: true,
      writable: true,
      value: originalDevicePixelRatio,
    });
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  it('sizes and paints the visible canvas for the default theme without drawing textures', async () => {
    const visibleContext = createContext2d();
    HTMLCanvasElement.prototype.getContext = jest.fn(() => visibleContext) as unknown as typeof HTMLCanvasElement.prototype.getContext;

    const { getByTestId } = render(
      <MapCanvasThemeLayer
        mapId="map-1"
        textureSeed={123}
        canvasTheme="default"
        theme="dark"
        panOffset={{ x: 0, y: 0 }}
        zoom={1}
        canvasRect={new DOMRect(0, 0, 120, 80)}
      />,
    );

    await waitFor(() => {
      expect(visibleContext.fillRect).toHaveBeenCalledWith(0, 0, 240, 160);
    });

    const canvas = getByTestId('map-canvas-theme-layer') as HTMLCanvasElement;
    expect(canvas.width).toBe(240);
    expect(canvas.height).toBe(160);
    expect(canvas).toHaveStyle({ backgroundColor: '#282828' });
    expect(mockDrawPaperTexture).not.toHaveBeenCalled();
    expect(mockDrawContourLandscapeTexture).not.toHaveBeenCalled();
  });

  it('draws the paper texture into a buffer canvas and composites it onto the visible canvas', async () => {
    const visibleContext = createContext2d();
    const bufferContext = createContext2d();
    HTMLCanvasElement.prototype.getContext = jest.fn(() => visibleContext) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    const bufferCanvas = {
      getContext: jest.fn(() => bufferContext),
    } as unknown as HTMLCanvasElement;
    mockCreateSizedCanvas.mockReturnValue(bufferCanvas);

    render(
      <MapCanvasThemeLayer
        mapId="map-2"
        textureSeed={456}
        canvasTheme="paper"
        theme="light"
        panOffset={{ x: 10, y: -15 }}
        zoom={1.5}
        canvasRect={new DOMRect(0, 0, 100, 60)}
      />,
    );

    await waitFor(() => {
      expect(mockDrawPaperTexture).toHaveBeenCalledTimes(1);
    });

    expect(mockCreateSizedCanvas).toHaveBeenCalledWith(200, 120);
    expect(bufferContext.scale).toHaveBeenCalledWith(2, 2);
    expect(mockDrawPaperTexture).toHaveBeenCalledWith(
      expect.anything(),
      100,
      60,
      'light',
      { mapId: 'map-2', textureSeed: 456, theme: 'light' },
      { scaleMultiplier: 1.5, originX: 10, originY: -15 },
    );
    expect(visibleContext.drawImage).toHaveBeenCalledWith(bufferCanvas, 0, 0);
  });

  it('skips compositing when the buffer canvas cannot provide a rendering context', async () => {
    const visibleContext = createContext2d();
    HTMLCanvasElement.prototype.getContext = jest.fn(() => visibleContext) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    mockCreateSizedCanvas.mockReturnValue({
      getContext: jest.fn(() => null),
    } as unknown as HTMLCanvasElement);

    render(
      <MapCanvasThemeLayer
        mapId="map-3"
        textureSeed={789}
        canvasTheme="contour"
        theme="light"
        panOffset={{ x: 0, y: 0 }}
        zoom={1}
        canvasRect={new DOMRect(0, 0, 90, 50)}
      />,
    );

    await waitFor(() => {
      expect(visibleContext.fillRect).toHaveBeenCalled();
    });

    expect(mockDrawContourLandscapeTexture).not.toHaveBeenCalled();
    expect(visibleContext.drawImage).not.toHaveBeenCalled();
  });
});
