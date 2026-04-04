import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import {
  BUCKET_FILL_MAX_RADIUS,
  blobToCanvas,
  canvasToBlob,
  compositeStrokePreview,
  constrainEllipseToCircle,
  constrainLineToCompassDirection,
  constrainRectangleToSquare,
  createSizedCanvas,
  drawBucketFill,
  drawMapObstacleMask,
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
import { createConnection, createRoom } from '../../src/domain/map-types';
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
  moveTo: jest.Mock<(x: number, y: number) => void>;
  lineTo: jest.Mock<(x: number, y: number) => void>;
  closePath: jest.Mock<() => void>;
  quadraticCurveTo: jest.Mock<(cpx: number, cpy: number, x: number, y: number) => void>;
  rect: jest.Mock<(x: number, y: number, width: number, height: number) => void>;
  ellipse: jest.Mock<(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number) => void>;
  arc: jest.Mock<(x: number, y: number, radius: number, startAngle: number, endAngle: number) => void>;
  fill: jest.Mock<() => void>;
  stroke: jest.Mock<() => void>;
  lineWidth?: number;
  strokeStyle?: string;
  lineCap?: CanvasLineCap;
  lineJoin?: CanvasLineJoin;
  setLineDash: jest.Mock<(segments: number[]) => void>;
  createRadialGradient: jest.Mock<(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) => MockGradient>;
  createImageData: jest.Mock<(width: number, height: number) => ImageData>;
  putImageData: jest.Mock<(imageData: ImageData, dx: number, dy: number) => void>;
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
    moveTo: jest.fn<(x: number, y: number) => void>(),
    lineTo: jest.fn<(x: number, y: number) => void>(),
    closePath: jest.fn<() => void>(),
    quadraticCurveTo: jest.fn<(cpx: number, cpy: number, x: number, y: number) => void>(),
    rect: jest.fn<(x: number, y: number, width: number, height: number) => void>(),
    ellipse: jest.fn<(x: number, y: number, radiusX: number, radiusY: number, rotation: number, startAngle: number, endAngle: number) => void>(),
    arc: jest.fn<(x: number, y: number, radius: number, startAngle: number, endAngle: number) => void>(),
    fill: jest.fn<() => void>(),
    stroke: jest.fn<() => void>(),
    setLineDash: jest.fn<(segments: number[]) => void>(),
    createRadialGradient: jest.fn<(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) => MockGradient>(() => gradient),
    createImageData: jest.fn<(width: number, height: number) => ImageData>((width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
      colorSpace: 'srgb',
    } as ImageData)),
    putImageData: jest.fn<(imageData: ImageData, dx: number, dy: number) => void>(),
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

  it('creates arbitrary-sized canvases for temporary bucket fill work', () => {
    const canvas = createSizedCanvas(33, 44);
    expect(canvas.width).toBe(33);
    expect(canvas.height).toBe(44);
  });

  it('returns an empty canvas from blobToCanvas when image bitmaps are unavailable', async () => {
    Reflect.deleteProperty(globalThis, 'createImageBitmap');

    const canvas = await blobToCanvas(new Blob(['x'], { type: 'image/png' }));
    expect(canvas.width).toBe(256);
    expect(canvas.height).toBe(256);
  });

  it('returns an empty canvas from blobToCanvas when no 2d context is available', async () => {
    const bitmap = { width: 512, height: 512, close: jest.fn<() => void>() };
    globalThis.createImageBitmap = (jest.fn(async () => bitmap) as unknown) as typeof createImageBitmap;
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    const canvas = await blobToCanvas(new Blob(['x'], { type: 'image/png' }));
    expect(canvas.width).toBe(512);
    expect(canvas.height).toBe(512);
    expect(bitmap.close).toHaveBeenCalled();
  });

  it('draws and closes image bitmaps in blobToCanvas when a 2d context exists', async () => {
    const bitmap = { width: 512, height: 512, close: jest.fn<() => void>() };
    const context = createMockContext();
    globalThis.createImageBitmap = (jest.fn(async () => bitmap) as unknown) as typeof createImageBitmap;
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context as unknown as CanvasRenderingContext2D);

    const canvas = await blobToCanvas(new Blob(['x'], { type: 'image/png' }));

    expect(canvas.width).toBe(512);
    expect(canvas.height).toBe(512);
    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 512, 512);
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
      fillColorRgbHex: '#00ff00',
      opacity: 1,
      size: 18,
      softness: 0.5,
      shapeFilled: false,
      bucketTolerance: 0,
      bucketObeyMap: false,
    };

    expect(getToolStampRadius(toolState)).toBe(9);
  });

  it('detects hard-edge tools only for brush-like tools with zero softness', () => {
    expect(usesHardEdgeStamp({
      tool: 'eraser',
      colorRgbHex: '#000000',
      fillColorRgbHex: '#000000',
      opacity: 1,
      size: 12,
      softness: 0,
      shapeFilled: false,
      bucketTolerance: 0,
      bucketObeyMap: false,
    })).toBe(true);
    expect(usesHardEdgeStamp({
      tool: 'line',
      colorRgbHex: '#000000',
      fillColorRgbHex: '#000000',
      opacity: 1,
      size: 12,
      softness: 0,
      shapeFilled: false,
      bucketTolerance: 0,
      bucketObeyMap: false,
    })).toBe(true);
    expect(usesHardEdgeStamp({
      tool: 'ellipse',
      colorRgbHex: '#000000',
      fillColorRgbHex: '#000000',
      opacity: 1,
      size: 12,
      softness: 0.25,
      shapeFilled: false,
      bucketTolerance: 0,
      bucketObeyMap: false,
    })).toBe(false);
    expect(usesHardEdgeStamp({
      tool: 'pencil',
      colorRgbHex: '#000000',
      fillColorRgbHex: '#000000',
      opacity: 1,
      size: 1,
      softness: 0,
      shapeFilled: false,
      bucketTolerance: 0,
      bucketObeyMap: false,
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
      fillColorRgbHex: '#000000',
      opacity: 0.4,
      size: 16,
      softness: 0,
      shapeFilled: false,
      bucketTolerance: 0,
      bucketObeyMap: false,
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
      fillColorRgbHex: '#000000',
      opacity: 1,
      size: 12,
      softness: 0.5,
      shapeFilled: false,
      bucketTolerance: 0,
      bucketObeyMap: false,
    })).not.toThrow();
  });

  it('draws soft brush stamps through radial gradients', () => {
    const context = createMockContext();
    const canvas = createMockCanvas(context as unknown as CanvasRenderingContext2D);

    drawStrokeSegment(canvas, {
      tool: 'brush',
      colorRgbHex: '#336699',
      fillColorRgbHex: '#336699',
      opacity: 0.75,
      size: 8,
      softness: 0.5,
      shapeFilled: false,
      bucketTolerance: 0,
      bucketObeyMap: false,
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
      fillColorRgbHex: '#000000',
      opacity: 1,
      size: 16,
      softness: 0,
      shapeFilled: false,
      bucketTolerance: 0,
      bucketObeyMap: false,
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
      fillColorRgbHex: '#000000',
      opacity: 1,
      size: 1,
      softness: 0,
      shapeFilled: false,
      bucketTolerance: 0,
      bucketObeyMap: false,
    }, { x: 0, y: 0 }, { x: 1, y: 1 })).not.toThrow();

    expect(() => drawStrokeSegment(createMockCanvas(null), {
      tool: 'pencil',
      colorRgbHex: '#000000',
      fillColorRgbHex: '#000000',
      opacity: 1,
      size: 1,
      softness: 0,
      shapeFilled: false,
      bucketTolerance: 0,
      bucketObeyMap: false,
    }, { x: 0, y: 0 }, { x: 1, y: 1 })).not.toThrow();
  });

  it('draws rectangle and ellipse outlines by delegating to stamped stroke segments', () => {
    const context = createMockContext();
    const canvas = createMockCanvas(context as unknown as CanvasRenderingContext2D);
    const toolState: DrawingToolState = {
      tool: 'rectangle',
      colorRgbHex: '#ff0000',
      fillColorRgbHex: '#ff0000',
      opacity: 1,
      size: 2,
      softness: 0,
      shapeFilled: false,
      bucketTolerance: 0,
      bucketObeyMap: false,
    };

    drawRectangleStroke(canvas, toolState, { x: 10, y: 12 }, { x: 20, y: 18 });
    const rectangleArcCalls = context.arc.mock.calls.length;
    expect(rectangleArcCalls).toBeGreaterThan(0);

    drawEllipseStroke(canvas, { ...toolState, tool: 'ellipse', softness: 0.3 }, { x: 10, y: 12 }, { x: 20, y: 18 });
    expect(context.arc.mock.calls.length).toBeGreaterThan(rectangleArcCalls);
  });

  it('fills rectangle and ellipse interiors when shape fill is enabled', () => {
    const context = createMockContext();
    const fillStylesAtFillTime: Array<string | MockGradient> = [];
    context.fill.mockImplementation(() => {
      fillStylesAtFillTime.push(context.fillStyle);
    });
    const canvas = createMockCanvas(context as unknown as CanvasRenderingContext2D);
    const rectangleTool: DrawingToolState = {
      tool: 'rectangle',
      colorRgbHex: '#336699',
      fillColorRgbHex: '#884422',
      opacity: 1,
      size: 3,
      softness: 0,
      shapeFilled: true,
      bucketTolerance: 0,
      bucketObeyMap: false,
    };

    drawRectangleStroke(canvas, rectangleTool, { x: 10, y: 12 }, { x: 20, y: 18 });
    expect(context.rect).toHaveBeenCalledWith(10, 12, 10, 6);
    expect(fillStylesAtFillTime).toContain('rgba(136, 68, 34, 1)');

    drawEllipseStroke(canvas, { ...rectangleTool, tool: 'ellipse' }, { x: 10, y: 12 }, { x: 20, y: 18 });
    expect(context.ellipse).toHaveBeenCalledWith(15, 15, 5, 3, 0, 0, Math.PI * 2);
  });

  it('formats rgba strings and normalizes hex colors', () => {
    expect(hexToRgba('#336699', 0.5)).toBe('rgba(51, 102, 153, 0.5)');
    expect(normalizeHexColor('336699')).toBe('#336699');
    expect(normalizeHexColor('#369')).toBe('#336699');
    expect(normalizeHexColor('oops')).toBe('#000000');
  });

  it('draws a bounded bucket fill into a target canvas', () => {
    const width = 5;
    const height = 5;
    const sourceContext = createMockContext();
    const targetContext = createMockContext();
    const sourcePixels = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = ((y * width) + x) * 4;
        sourcePixels[offset + 3] = 255;
      }
    }

    const wallOffset = ((2 * width) + 3) * 4;
    sourcePixels[wallOffset] = 255;
    sourcePixels[wallOffset + 3] = 255;

    sourceContext.getImageData.mockReturnValue({
      data: sourcePixels,
      width,
      height,
      colorSpace: 'srgb',
    } as ImageData);

    const sourceCanvas = {
      width,
      height,
      getContext: jest.fn<() => CanvasRenderingContext2D | null>(() => sourceContext as unknown as CanvasRenderingContext2D),
    } as unknown as HTMLCanvasElement;
    const targetCanvas = {
      width,
      height,
      getContext: jest.fn<() => CanvasRenderingContext2D | null>(() => targetContext as unknown as CanvasRenderingContext2D),
    } as unknown as HTMLCanvasElement;

    const changed = drawBucketFill(sourceCanvas, targetCanvas, { x: 2, y: 2 }, '#336699', 1, 0);

    expect(changed).toBe(true);
    expect(targetContext.putImageData).toHaveBeenCalled();
    const imageData = targetContext.putImageData.mock.calls[0]?.[0] as ImageData;
    const filledCenter = ((2 * width) + 2) * 4;
    expect(Array.from(imageData.data.slice(filledCenter, filledCenter + 4))).toEqual([51, 102, 153, 255]);
    const outsideRadius = ((0 * width) + 2) * 4;
    expect(Array.from(imageData.data.slice(outsideRadius, outsideRadius + 4))).toEqual([0, 0, 0, 0]);
    const wallPixel = ((2 * width) + 3) * 4;
    expect(Array.from(imageData.data.slice(wallPixel, wallPixel + 4))).toEqual([0, 0, 0, 0]);
  });

  it('returns false when bucket fill has no valid target', () => {
    const context = createMockContext();
    const sourceCanvas = createMockCanvas(context as unknown as CanvasRenderingContext2D);
    const targetCanvas = createMockCanvas(context as unknown as CanvasRenderingContext2D);
    context.getImageData.mockReturnValue({
      data: Uint8ClampedArray.from([51, 102, 153, 255]),
      width: 1,
      height: 1,
      colorSpace: 'srgb',
    } as ImageData);

    expect(drawBucketFill(sourceCanvas, targetCanvas, { x: -1, y: 0 }, '#336699', BUCKET_FILL_MAX_RADIUS, 0)).toBe(false);
    expect(drawBucketFill(sourceCanvas, targetCanvas, { x: 0, y: 0 }, '#336699', BUCKET_FILL_MAX_RADIUS, 0)).toBe(false);
    expect(drawBucketFill(createMockCanvas(null), targetCanvas, { x: 0, y: 0 }, '#000000', BUCKET_FILL_MAX_RADIUS, 0)).toBe(false);
  });

  it('respects obstacle pixels during bucket fill', () => {
    const width = 3;
    const height = 1;
    const sourceContext = createMockContext();
    const targetContext = createMockContext();
    const obstacleContext = createMockContext();
    sourceContext.getImageData.mockReturnValue({
      data: Uint8ClampedArray.from([
        100, 100, 100, 255,
        100, 100, 100, 255,
        100, 100, 100, 255,
      ]),
      width,
      height,
      colorSpace: 'srgb',
    } as ImageData);
    obstacleContext.getImageData.mockReturnValue({
      data: Uint8ClampedArray.from([
        0, 0, 0, 0,
        0, 0, 0, 255,
        0, 0, 0, 0,
      ]),
      width,
      height,
      colorSpace: 'srgb',
    } as ImageData);

    const sourceCanvas = {
      width,
      height,
      getContext: jest.fn<() => CanvasRenderingContext2D | null>(() => sourceContext as unknown as CanvasRenderingContext2D),
    } as unknown as HTMLCanvasElement;
    const targetCanvas = {
      width,
      height,
      getContext: jest.fn<() => CanvasRenderingContext2D | null>(() => targetContext as unknown as CanvasRenderingContext2D),
    } as unknown as HTMLCanvasElement;
    const obstacleCanvas = {
      width,
      height,
      getContext: jest.fn<() => CanvasRenderingContext2D | null>(() => obstacleContext as unknown as CanvasRenderingContext2D),
    } as unknown as HTMLCanvasElement;

    expect(drawBucketFill(sourceCanvas, targetCanvas, { x: 0, y: 0 }, '#336699', BUCKET_FILL_MAX_RADIUS, 0, obstacleCanvas)).toBe(true);
    const imageData = targetContext.putImageData.mock.calls[0]?.[0] as ImageData;
    expect(Array.from(imageData.data.slice(0, 12))).toEqual([
      51, 102, 153, 255,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ]);
  });

  it('draws room bodies and continuous connection barriers into the map obstacle mask', () => {
    const context = createMockContext();
    const canvas = createMockCanvas(context as unknown as CanvasRenderingContext2D);
    const roomA = { ...createRoom('Alpha'), id: 'room-a', position: { x: 10, y: 20 }, shape: 'oval' as const };
    const roomB = { ...createRoom('Beta'), id: 'room-b', position: { x: 120, y: 20 }, shape: 'diamond' as const, directions: { west: 'conn-1' } };
    const connection = { ...createConnection(roomA.id, roomB.id, true), id: 'conn-1', strokeStyle: 'dashed' as const };
    const roomAWithDirections = { ...roomA, directions: { east: connection.id } };

    drawMapObstacleMask(
      canvas,
      { [roomA.id]: roomAWithDirections, [roomB.id]: roomB },
      { [connection.id]: connection },
      { x: 0, y: 0 },
    );

    expect(context.fill).toHaveBeenCalled();
    expect(context.stroke).toHaveBeenCalled();
    expect(context.setLineDash).toHaveBeenCalledWith([]);
  });

  it('bucket fill tolerance expands across near-matching pixels', () => {
    const width = 3;
    const height = 1;
    const sourceContext = createMockContext();
    const targetContext = createMockContext();
    const sourcePixels = Uint8ClampedArray.from([
      100, 100, 100, 255,
      108, 104, 97, 255,
      140, 140, 140, 255,
    ]);
    sourceContext.getImageData.mockReturnValue({
      data: sourcePixels,
      width,
      height,
      colorSpace: 'srgb',
    } as ImageData);

    const sourceCanvas = {
      width,
      height,
      getContext: jest.fn<() => CanvasRenderingContext2D | null>(() => sourceContext as unknown as CanvasRenderingContext2D),
    } as unknown as HTMLCanvasElement;
    const targetCanvas = {
      width,
      height,
      getContext: jest.fn<() => CanvasRenderingContext2D | null>(() => targetContext as unknown as CanvasRenderingContext2D),
    } as unknown as HTMLCanvasElement;

    expect(drawBucketFill(sourceCanvas, targetCanvas, { x: 0, y: 0 }, '#336699', BUCKET_FILL_MAX_RADIUS, 0)).toBe(true);
    let imageData = targetContext.putImageData.mock.calls[0]?.[0] as ImageData;
    expect(Array.from(imageData.data.slice(0, 12))).toEqual([
      51, 102, 153, 255,
      0, 0, 0, 0,
      0, 0, 0, 0,
    ]);

    targetContext.putImageData.mockClear();
    expect(drawBucketFill(sourceCanvas, targetCanvas, { x: 0, y: 0 }, '#336699', BUCKET_FILL_MAX_RADIUS, 10)).toBe(true);
    imageData = targetContext.putImageData.mock.calls[0]?.[0] as ImageData;
    expect(Array.from(imageData.data.slice(0, 12))).toEqual([
      51, 102, 153, 255,
      51, 102, 153, 255,
      0, 0, 0, 0,
    ]);
  });
});
