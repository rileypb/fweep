import { describe, expect, it, jest } from '@jest/globals';
import {
  getPseudoRoomSymbolDefinition,
  pseudoRoomPathCommandsToSvgPath,
  tracePseudoRoomPathCommands,
} from '../../src/domain/pseudo-room-symbols';

describe('pseudo-room-symbols', () => {
  it('returns symbol definitions for each pseudo-room kind', () => {
    expect(getPseudoRoomSymbolDefinition('unknown')).toMatchObject({
      viewBoxSize: 640,
      paths: [],
      filledPaths: [expect.objectContaining({ d: expect.stringContaining('M224 224') })],
    });
    expect(getPseudoRoomSymbolDefinition('infinite')).toMatchObject({
      viewBoxSize: 640,
      paths: [],
      filledPaths: [expect.objectContaining({ d: expect.stringContaining('M0 320') })],
    });
    expect(getPseudoRoomSymbolDefinition('death')).toMatchObject({
      viewBoxSize: 640,
      paths: [],
      filledPaths: [expect.objectContaining({ d: expect.stringContaining('M480 491.4') })],
    });
    expect(getPseudoRoomSymbolDefinition('nowhere')).toMatchObject({
      viewBoxSize: 640,
      paths: [],
      filledPaths: [expect.objectContaining({ d: expect.stringContaining('M504.6 148.5') })],
    });
  });

  it('serializes pseudo-room path commands to SVG syntax', () => {
    expect(pseudoRoomPathCommandsToSvgPath([
      { type: 'M', x: 1, y: 2 },
      { type: 'L', x: 3, y: 4 },
      { type: 'Q', cx: 5, cy: 6, x: 7, y: 8 },
      { type: 'C', c1x: 9, c1y: 10, c2x: 11, c2y: 12, x: 13, y: 14 },
      { type: 'Z' },
    ])).toBe('M1 2 L3 4 Q5 6 7 8 C9 10 11 12 13 14 Z');
  });

  it('traces every supported command type onto a canvas context', () => {
    const context = {
      moveTo: jest.fn<(x: number, y: number) => void>(),
      lineTo: jest.fn<(x: number, y: number) => void>(),
      quadraticCurveTo: jest.fn<(cx: number, cy: number, x: number, y: number) => void>(),
      bezierCurveTo: jest.fn<(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) => void>(),
      closePath: jest.fn<() => void>(),
    } as unknown as CanvasRenderingContext2D;

    tracePseudoRoomPathCommands(context, [
      { type: 'M', x: 1, y: 2 },
      { type: 'L', x: 3, y: 4 },
      { type: 'Q', cx: 5, cy: 6, x: 7, y: 8 },
      { type: 'C', c1x: 9, c1y: 10, c2x: 11, c2y: 12, x: 13, y: 14 },
      { type: 'Z' },
    ]);

    expect(context.moveTo).toHaveBeenCalledWith(1, 2);
    expect(context.lineTo).toHaveBeenCalledWith(3, 4);
    expect(context.quadraticCurveTo).toHaveBeenCalledWith(5, 6, 7, 8);
    expect(context.bezierCurveTo).toHaveBeenCalledWith(9, 10, 11, 12, 13, 14);
    expect(context.closePath).toHaveBeenCalled();
  });
});
