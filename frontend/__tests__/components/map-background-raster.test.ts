import { describe, expect, it, jest } from '@jest/globals';
import {
  compositeStrokePreview,
  constrainLineToCompassDirection,
  constrainRectangleToSquare,
  drawStrokeSegment,
  getChunkCoverageForPoint,
  getToolStampRadius,
  usesHardEdgeStamp,
} from '../../src/components/map-background-raster';
import type { DrawingToolState } from '../../src/state/editor-store';

describe('map-background-raster', () => {
  it('keeps a small stamp within one chunk when not near an edge', () => {
    const chunks = getChunkCoverageForPoint({ x: 100, y: 100 }, 2);
    expect(chunks).toEqual([{ chunkX: 0, chunkY: 0 }]);
  });

  it('covers adjacent chunks when a stamp overlaps a vertical chunk boundary', () => {
    const chunks = getChunkCoverageForPoint({ x: 255, y: 100 }, 8);
    expect(chunks).toEqual([
      { chunkX: 0, chunkY: 0 },
      { chunkX: 1, chunkY: 0 },
    ]);
  });

  it('covers diagonal neighboring chunks when a stamp overlaps both chunk boundaries', () => {
    const chunks = getChunkCoverageForPoint({ x: 255, y: 255 }, 8);
    expect(chunks).toEqual([
      { chunkX: 0, chunkY: 0 },
      { chunkX: 1, chunkY: 0 },
      { chunkX: 0, chunkY: 1 },
      { chunkX: 1, chunkY: 1 },
    ]);
  });

  it('derives stamp radius from tool size', () => {
    const toolState: DrawingToolState = {
      tool: 'brush',
      colorRgbHex: '#00ff00',
      opacity: 1,
      size: 18,
      softness: 0.5,
    };

    expect(getToolStampRadius(toolState)).toBe(9);
  });

  it('uses a hard-edge stamp for eraser strokes when softness is zero', () => {
    expect(usesHardEdgeStamp({
      tool: 'eraser',
      colorRgbHex: '#000000',
      opacity: 1,
      size: 12,
      softness: 0,
    })).toBe(true);
  });

  it('uses a hard-edge stamp for line strokes when softness is zero', () => {
    expect(usesHardEdgeStamp({
      tool: 'line',
      colorRgbHex: '#000000',
      opacity: 1,
      size: 12,
      softness: 0,
    })).toBe(true);
  });

  it('constrains a line to the nearest horizontal compass direction', () => {
    expect(constrainLineToCompassDirection(
      { x: 10, y: 10 },
      { x: 30, y: 13 },
    )).toEqual({ x: 30, y: 10 });
  });

  it('constrains a line to the nearest diagonal compass direction', () => {
    expect(constrainLineToCompassDirection(
      { x: 10, y: 10 },
      { x: 22, y: 25 },
    )).toEqual({ x: 24, y: 24 });
  });

  it('constrains a rectangle drag to a square when shift is held', () => {
    expect(constrainRectangleToSquare(
      { x: 10, y: 10 },
      { x: 28, y: 20 },
    )).toEqual({ x: 28, y: 28 });
  });

  it('draws eraser stroke masks with source-over compositing', () => {
    const context = {
      imageSmoothingEnabled: true,
      globalCompositeOperation: 'source-over',
      fillStyle: '',
      beginPath: jest.fn<() => void>(),
      arc: jest.fn<(x: number, y: number, radius: number, startAngle: number, endAngle: number) => void>(),
      fill: jest.fn<() => void>(),
      createRadialGradient: jest.fn(),
    } as unknown as CanvasRenderingContext2D;
    const canvas = {
      getContext: jest.fn<() => CanvasRenderingContext2D | null>(() => context),
    } as unknown as HTMLCanvasElement;

    drawStrokeSegment(canvas, {
      tool: 'eraser',
      colorRgbHex: '#000000',
      opacity: 1,
      size: 16,
      softness: 0,
    }, { x: 32, y: 32 }, { x: 32, y: 32 });

    expect(context.globalCompositeOperation).toBe('source-over');
    expect(context.fillStyle).toBe('rgba(0, 0, 0, 1)');
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
    });

    expect(drawImageMock.mock.calls[0]).toEqual([baseCanvas, 0, 0]);
    expect(drawImageMock.mock.calls[1]).toEqual([strokeCanvas, 0, 0]);
    expect(compositeModes).toEqual(['source-over', 'destination-out']);
    expect(context.globalCompositeOperation).toBe('source-over');
    expect(context.globalAlpha).toBe(1);
  });
});
