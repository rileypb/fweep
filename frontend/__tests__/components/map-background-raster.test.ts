import { describe, expect, it } from '@jest/globals';
import { getChunkCoverageForPoint, getToolStampRadius } from '../../src/components/map-background-raster';
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
});
