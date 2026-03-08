import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  blobToCanvas,
  canvasToBlob,
  compositeStrokePreview,
  constrainEllipseToCircle,
  constrainLineToCompassDirection,
  constrainRectangleToSquare,
  createRasterCanvas,
  drawEllipseStroke,
  drawRectangleStroke,
  drawStrokeSegment,
  getBoundsFromPoints,
  getChunkCoordinatesForPoint,
  getChunkCoverageForPoint,
  getChunkCoverageForRect,
  getInterpolatedLinePoints,
  getLocalChunkPoint,
  getToolStampRadius,
  hexToRgba,
  isCanvasEmpty,
  normalizeHexColor,
  supportsRasterCanvas,
  usesHardEdgeStamp,
} from '../../src/components/map-background-raster';
import type { DrawingToolState } from '../../src/state/editor-store';

interface MockGradient {
  addColorStop: jest.Mock<(offset: number, color: string) => void>;
}

interface MockCanvasContext {
  imageSmoothingEnabled: boolean;
  globalCompositeOperation: string;
  globalAlpha: number;
  fillStyle: string | MockGradient;
  clearRect: jest.Mock<(x: number, y: number, width: number, height: number) => void>;
  drawImage: jest.Mock<(...args: unknown[]) => void>;
  getImageData: jest.Mock<(x: number, y: number, width: number, height: number) => ImageData>;
  beginPath: jest.Mock<() => void>;
  rect: jest.Mock<(x: number, y: number, width: number, height: number) => void>;
  ellipse: jest.Mock<(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number) => void>;
  arc: jest.Mock<(x: number, y: number, radius: number, startAngle: number, endAngle: number) => void>;
  fill: jest.Mock<() => void>;
  createRadialGradient: jest.Mock<(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) => MockGradient>;
}

function createMockContext(alphaValues: number[] = []): MockCanvasContext {
  const gradient: MockGradient = {
    addColorStop: jest.fn<(offset: number, color: string) => void>(),
  };

  return {
    imageSmoothingEnabled: true,
    globalCompositeOperation: 'source-over',
    globalAlpha: 1,
    fillStyle: '',
    clearRect: jest.fn<(x: number, y: number, width: number, height: number) => void>(),
    drawImage: jest.fn<(...args: unknown[]) => void>(),
    getImageData: jest.fn<(x: number, y: number, width: number, height: number) => ImageData>(() => ({
      data: Uint8ClampedArray.from(alphaValues.flatMap((alpha) => [0, 0, 0, alpha])),
      width: alphaValues.length,
      height: 1,
      colorSpace: 'srgb',
    } as ImageData)),
    beginPath: jest.fn<() => void>(),
    rect: jest.fn<(x: number, y: number, width: number, height: number) => void>(),
    ellipse: jest.fn<(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number) => void>(),
    arc: jest.fn<(x: number, y: number, radius: number, startAngle: number, endAngle: number) => void>(),
    fill: jest.fn<() => void>(),
    createRadialGradient: jest.fn<(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) => MockGradient>(() => gradient),
  };
}

function createMockCanvas(context: CanvasRenderingContext2D | null, toBlobImpl?: HTMLCanvasElement['toBlob']): HTMLCanvasElement {
  return {
    width: 256,
    height: 256,
    getContext: jest.fn<() => CanvasRenderingContext2D | null>(() => context),
    toBlob: toBlobImpl,
  } as unknown as HTMLCanvasElement;
}

describe('map-background-raster', () => {
  const originalUserAgent = window.navigator.userAgent;
  const originalCreateImageBitmap = globalThis.createImageBitmap;

  beforeEach(() => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: originalUserAgent,
    });
    if (originalCreateImageBitmap === undefined) {
      Reflect.deleteProperty(globalThis, 'createImageBitmap');
    } else {
      globalThis.createImageBitmap = originalCreateImageBitmap;
    }
  });

  it('detects raster canvas support from the user agent', () => {
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0',
    });
    expect(supportsRasterCanvas()).toBe(true);

    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'jsdom/24.0.0',
    });
    expect(supportsRasterCanvas()).toBe(false);
  });

  it('creates a fixed-size raster canvas', () => {
    const canvas = createRasterCanvas();
    expect(canvas.width).toBe(256);
    expect(canvas.height).toBe(256);
  });

  it('returns an empty canvas from blobToCanvas when image bitmaps are unavailable', async () => {
    Reflect.deleteProperty(globalThis, 'createImageBitmap');

    const canvas = await blobToCanvas(new Blob(['x'], { type: 'image/png' }));
    expect(canvas.width).toBe(256);
    expect(canvas.height).toBe(256);
  });

  it('returns an empty canvas from blobToCanvas when no 2d context is available', async () => {
    const bitmap = { close: jest.fn<() => void>() };
    globalThis.createImageBitmap = (jest.fn(async () => bitmap) as unknown) as typeof createImageBitmap;
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    const canvas = await blobToCanvas(new Blob(['x'], { type: 'image/png' }));
    expect(canvas.width).toBe(256);
    expect(bitmap.close).not.toHaveBeenCalled();
  });

  it('draws and closes image bitmaps in blobToCanvas when a 2d context exists', async () => {
    const bitmap = { close: jest.fn<() => void>() };
    const context = createMockContext();
    globalThis.createImageBitmap = (jest.fn(async () => bitmap) as unknown) as typeof createImageBitmap;
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);

    const canvas = await blobToCanvas(new Blob(['x'], { type: 'image/png' }));

    expect(canvas.width).toBe(256);
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 256, 256);
    expect(context.drawImage).toHaveBeenCalledWith(bitmap, 0, 0);
    expect(bitmap.close).toHaveBeenCalled();
  });

  it('falls back to an empty png blob when canvas.toBlob is unavailable', async () => {
    const canvas = createMockCanvas(createMockContext() as unknown as CanvasRenderingContext2D, undefined);
    Reflect.deleteProperty(canvas, 'toBlob');

    const blob = await canvasToBlob(canvas);
    expect(blob.type).toBe('image/png');
  });

  it('rejects canvasToBlob when serialization fails', async () => {
    const canvas = createMockCanvas(
      createMockContext() as unknown as CanvasRenderingContext2D,
      ((callback: BlobCallback) => callback(null)) as HTMLCanvasElement['toBlob'],
    );

    await expect(canvasToBlob(canvas)).rejects.toThrow('Failed to serialize background chunk.');
  });

  it('resolves canvasToBlob when serialization succeeds', async () => {
    const expectedBlob = new Blob(['paint'], { type: 'image/png' });
    const canvas = createMockCanvas(
      createMockContext() as unknown as CanvasRenderingContext2D,
      ((callback: BlobCallback) => callback(expectedBlob)) as HTMLCanvasElement['toBlob'],
    );

    await expect(canvasToBlob(canvas)).resolves.toBe(expectedBlob);
  });

  it('reports a canvas as empty when no 2d context exists', () => {
    expect(isCanvasEmpty(createMockCanvas(null))).toBe(true);
  });

  it('reports a canvas as empty when all pixels are transparent', () => {
    const context = createMockContext([0, 0, 0]);
    expect(isCanvasEmpty(createMockCanvas(context as unknown as CanvasRenderingContext2D))).toBe(true);
  });

  it('reports a canvas as non-empty when any pixel is opaque', () => {
    const context = createMockContext([0, 255, 0]);
    expect(isCanvasEmpty(createMockCanvas(context as unknown as CanvasRenderingContext2D))).toBe(false);
  });

  it('maps world coordinates into chunk and local chunk coordinates', () => {
    expect(getChunkCoordinatesForPoint({ x: 300, y: -20 })).toEqual({ chunkX: 1, chunkY: -1 });
    expect(getLocalChunkPoint({ x: 300, y: -20 }, { chunkX: 1, chunkY: -1 })).toEqual({ x: 44, y: 236 });
  });

  it('keeps a small stamp within one chunk when not near an edge', () => {
    expect(getChunkCoverageForPoint({ x: 100, y: 100 }, 2)).toEqual([{ chunkX: 0, chunkY: 0 }]);
  });

  it('covers diagonal neighboring chunks when a point stamp overlaps both chunk boundaries', () => {
    expect(getChunkCoverageForPoint({ x: 255, y: 255 }, 8)).toEqual([
      { chunkX: 0, chunkY: 0 },
      { chunkX: 1, chunkY: 0 },
      { chunkX: 0, chunkY: 1 },
      { chunkX: 1, chunkY: 1 },
    ]);
  });

  it('covers all chunks touched by a stroked rectangle', () => {
    expect(getChunkCoverageForRect({ left: 250, top: 250, right: 270, bottom: 270 }, 4)).toEqual([
      { chunkX: 0, chunkY: 0 },
      { chunkX: 1, chunkY: 0 },
      { chunkX: 0, chunkY: 1 },
      { chunkX: 1, chunkY: 1 },
    ]);
  });

  it('derives normalized bounds and interpolated line points', () => {
    expect(getBoundsFromPoints({ x: 20, y: 40 }, { x: -5, y: 10 })).toEqual({
      left: -5,
      top: 10,
      right: 20,
      bottom: 40,
    });
    expect(getInterpolatedLinePoints({ x: 0, y: 0 }, { x: 2, y: 1 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
    ]);
  });

  it('handles zero-length lines when interpolating and constraining', () => {
    expect(getInterpolatedLinePoints({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual([{ x: 5, y: 5 }, { x: 5, y: 5 }]);
    expect(constrainLineToCompassDirection({ x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 5, y: 5 });
  });

  it('derives stamp radius from tool size', () => {
    const toolState: DrawingToolState = {
      tool: 'brush',
      colorRgbHex: '#00ff00',
      opacity: 1,
      size: 18,
      softness: 0.5,
      shapeFilled: false,
    };

    expect(getToolStampRadius(toolState)).toBe(9);
  });

  it('detects hard-edge tools only for brush-like tools with zero softness', () => {
    expect(usesHardEdgeStamp({
      tool: 'eraser',
      colorRgbHex: '#000000',
      opacity: 1,
      size: 12,
      softness: 0,
      shapeFilled: false,
    })).toBe(true);
    expect(usesHardEdgeStamp({
      tool: 'line',
      colorRgbHex: '#000000',
      opacity: 1,
      size: 12,
      softness: 0,
      shapeFilled: false,
    })).toBe(true);
    expect(usesHardEdgeStamp({
      tool: 'ellipse',
      colorRgbHex: '#000000',
      opacity: 1,
      size: 12,
      softness: 0.25,
      shapeFilled: false,
    })).toBe(false);
    expect(usesHardEdgeStamp({
      tool: 'pencil',
      colorRgbHex: '#000000',
      opacity: 1,
      size: 1,
      softness: 0,
      shapeFilled: false,
    })).toBe(false);
  });

  it('constrains lines, rectangles, and ellipses to compass-aligned shapes', () => {
    expect(constrainLineToCompassDirection({ x: 10, y: 10 }, { x: 30, y: 13 })).toEqual({ x: 30, y: 10 });
    expect(constrainLineToCompassDirection({ x: 10, y: 10 }, { x: 22, y: 25 })).toEqual({ x: 24, y: 24 });
    expect(constrainRectangleToSquare({ x: 10, y: 10 }, { x: 28, y: 20 })).toEqual({ x: 28, y: 28 });
    expect(constrainEllipseToCircle({ x: 10, y: 10 }, { x: 22, y: 35 })).toEqual({ x: 35, y: 35 });
  });

  it('applies eraser preview composites with destination-out compositing', () => {
    const compositeModes: string[] = [];
    const drawImageMock = jest.fn<(...args: unknown[]) => void>(() => {
      compositeModes.push(context.globalCompositeOperation);
    });
    const context = {
      clearRect: jest.fn<(x: number, y: number, width: number, height: number) => void>(),
      drawImage: drawImageMock,
      globalAlpha: 1,
      globalCompositeOperation: 'source-over',
    } as unknown as CanvasRenderingContext2D;
    const previewCanvas = {
      width: 256,
      height: 256,
      getContext: jest.fn<() => CanvasRenderingContext2D | null>(() => context),
    } as unknown as HTMLCanvasElement;
    const baseCanvas = {} as HTMLCanvasElement;
    const strokeCanvas = {} as HTMLCanvasElement;

    compositeStrokePreview(previewCanvas, baseCanvas, strokeCanvas, {
      tool: 'eraser',
      colorRgbHex: '#000000',
      opacity: 0.4,
      size: 16,
      softness: 0,
      shapeFilled: false,
    });

    expect(drawImageMock.mock.calls[0]).toEqual([baseCanvas, 0, 0]);
    expect(drawImageMock.mock.calls[1]).toEqual([strokeCanvas, 0, 0]);
    expect(compositeModes).toEqual(['source-over', 'destination-out']);
    expect((context as { globalCompositeOperation: string }).globalCompositeOperation).toBe('source-over');
    expect((context as { globalAlpha: number }).globalAlpha).toBe(1);
  });

  it('returns early from compositeStrokePreview when no 2d context exists', () => {
    expect(() => compositeStrokePreview(createMockCanvas(null), {} as HTMLCanvasElement, {} as HTMLCanvasElement, {
      tool: 'brush',
      colorRgbHex: '#000000',
      opacity: 1,
      size: 12,
      softness: 0.5,
      shapeFilled: false,
    })).not.toThrow();
  });

  it('draws soft brush stamps through radial gradients', () => {
    const context = createMockContext();
    const canvas = createMockCanvas(context as unknown as CanvasRenderingContext2D);

    drawStrokeSegment(canvas, {
      tool: 'brush',
      colorRgbHex: '#336699',
      opacity: 0.75,
      size: 8,
      softness: 0.5,
      shapeFilled: false,
    }, { x: 0, y: 0 }, { x: 0, y: 0 });

    expect(context.createRadialGradient).toHaveBeenCalled();
    const gradient = context.createRadialGradient.mock.results[0]?.value as MockGradient;
    expect(gradient.addColorStop).toHaveBeenCalledWith(0, 'rgba(51, 102, 153, 0.75)');
    expect(context.fill).toHaveBeenCalled();
  });

  it('draws hard-edge stroke masks for eraser strokes', () => {
    const context = createMockContext();
    const canvas = createMockCanvas(context as unknown as CanvasRenderingContext2D);

    drawStrokeSegment(canvas, {
      tool: 'eraser',
      colorRgbHex: '#000000',
      opacity: 1,
      size: 16,
      softness: 0,
      shapeFilled: false,
    }, { x: 32, y: 32 }, { x: 32, y: 32 });

    expect(context.fillStyle).toBe('rgba(0, 0, 0, 1)');
    expect(context.arc).toHaveBeenCalled();
    expect(context.fill).toHaveBeenCalled();
  });

  it('returns early from drawStrokeSegment when getContext throws or is missing', () => {
    const throwingCanvas = {
      getContext: jest.fn<() => CanvasRenderingContext2D | null>(() => {
        throw new Error('boom');
      }),
    } as unknown as HTMLCanvasElement;
    expect(() => drawStrokeSegment(throwingCanvas, {
      tool: 'pencil',
      colorRgbHex: '#000000',
      opacity: 1,
      size: 1,
      softness: 0,
      shapeFilled: false,
    }, { x: 0, y: 0 }, { x: 1, y: 1 })).not.toThrow();

    expect(() => drawStrokeSegment(createMockCanvas(null), {
      tool: 'pencil',
      colorRgbHex: '#000000',
      opacity: 1,
      size: 1,
      softness: 0,
      shapeFilled: false,
    }, { x: 0, y: 0 }, { x: 1, y: 1 })).not.toThrow();
  });

  it('draws rectangle and ellipse outlines by delegating to stamped stroke segments', () => {
    const context = createMockContext();
    const canvas = createMockCanvas(context as unknown as CanvasRenderingContext2D);
    const toolState: DrawingToolState = {
      tool: 'rectangle',
      colorRgbHex: '#ff0000',
      opacity: 1,
      size: 2,
      softness: 0,
      shapeFilled: false,
    };

    drawRectangleStroke(canvas, toolState, { x: 10, y: 12 }, { x: 20, y: 18 });
    const rectangleArcCalls = context.arc.mock.calls.length;
    expect(rectangleArcCalls).toBeGreaterThan(0);

    drawEllipseStroke(canvas, { ...toolState, tool: 'ellipse', softness: 0.3 }, { x: 10, y: 12 }, { x: 20, y: 18 });
    expect(context.arc.mock.calls.length).toBeGreaterThan(rectangleArcCalls);
  });

  it('fills rectangle and ellipse interiors when shape fill is enabled', () => {
    const context = createMockContext();
    const canvas = createMockCanvas(context as unknown as CanvasRenderingContext2D);
    const rectangleTool: DrawingToolState = {
      tool: 'rectangle',
      colorRgbHex: '#336699',
      opacity: 1,
      size: 3,
      softness: 0,
      shapeFilled: true,
    };

    drawRectangleStroke(canvas, rectangleTool, { x: 10, y: 12 }, { x: 20, y: 18 });
    expect(context.rect).toHaveBeenCalledWith(10, 12, 10, 6);

    drawEllipseStroke(canvas, { ...rectangleTool, tool: 'ellipse' }, { x: 10, y: 12 }, { x: 20, y: 18 });
    expect(context.ellipse).toHaveBeenCalledWith(15, 15, 5, 3, 0, 0, Math.PI * 2);
  });

  it('formats rgba strings and normalizes hex colors', () => {
    expect(hexToRgba('#336699', 0.5)).toBe('rgba(51, 102, 153, 0.5)');
    expect(normalizeHexColor('336699')).toBe('#336699');
    expect(normalizeHexColor('#369')).toBe('#336699');
    expect(normalizeHexColor('oops')).toBe('#000000');
  });
});
