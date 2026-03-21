import { describe, expect, it } from '@jest/globals';
import { PAPER_TEXTURE_TILE_SIZE, getPaperTextureBaseColor } from '../../src/graph/perlin-paper-texture';
import { generatePaperTextureTilePixelBuffer } from '../../src/graph/perlin-paper-texture-core';

describe('perlin-paper-texture', () => {
  it('returns a theme-specific base color', () => {
    const baseColor = getPaperTextureBaseColor('light');

    expect(baseColor).toMatch(/^rgb\(/);
  });

  it('uses different palettes for light and dark themes', () => {
    const lightStyle = getPaperTextureBaseColor('light');
    const darkStyle = getPaperTextureBaseColor('dark');

    expect(lightStyle).not.toBe(darkStyle);
  });

  it('uses the shared tile size for seamless paper textures', () => {
    expect(PAPER_TEXTURE_TILE_SIZE).toBeGreaterThanOrEqual(256);
  });

  it('generates different tile pixels for different seeds', () => {
    const first = generatePaperTextureTilePixelBuffer(48, 48, 'light', 123);
    const second = generatePaperTextureTilePixelBuffer(48, 48, 'light', 456);

    expect(Array.from(first)).not.toEqual(Array.from(second));
  });

  it('matches opposite edges so the tile can repeat seamlessly', () => {
    const size = 40;
    const tile = generatePaperTextureTilePixelBuffer(size, size, 'light', 12345);
    const pixelAt = (x: number, y: number): number[] => {
      const index = ((y * size) + x) * 4;
      return Array.from(tile.slice(index, index + 4));
    };

    for (let index = 0; index < size; index += 1) {
      expect(pixelAt(0, index)).toEqual(pixelAt(size - 1, index));
      expect(pixelAt(index, 0)).toEqual(pixelAt(index, size - 1));
    }
  });
});
