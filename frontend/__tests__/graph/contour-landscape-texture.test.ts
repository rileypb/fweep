import { describe, expect, it } from '@jest/globals';
import {
  CONTOUR_LANDSCAPE_TILE_SIZE,
  getContourLandscapeBaseColor,
} from '../../src/graph/contour-landscape-texture';
import { generateContourLandscapeTextureTilePixelBuffer } from '../../src/graph/contour-landscape-texture-core';

describe('contour-landscape-texture', () => {
  it('returns a theme-specific base color', () => {
    expect(getContourLandscapeBaseColor('light')).toMatch(/^rgb\(/);
  });

  it('uses different palettes for light and dark themes', () => {
    expect(getContourLandscapeBaseColor('light')).not.toBe(getContourLandscapeBaseColor('dark'));
  });

  it('uses the shared tile size for contour textures', () => {
    expect(CONTOUR_LANDSCAPE_TILE_SIZE).toBeGreaterThanOrEqual(256);
  });

  it('generates different tile pixels for different seeds', () => {
    const first = generateContourLandscapeTextureTilePixelBuffer(48, 48, 'light', 123, 'contour');
    const second = generateContourLandscapeTextureTilePixelBuffer(48, 48, 'light', 456, 'contour');

    expect(Array.from(first)).not.toEqual(Array.from(second));
  });

  it('matches opposite edges so the tile can repeat seamlessly', () => {
    const size = 40;
    const tile = generateContourLandscapeTextureTilePixelBuffer(size, size, 'light', 12345, 'antique');
    const pixelAt = (x: number, y: number): number[] => {
      const index = ((y * size) + x) * 4;
      return Array.from(tile.slice(index, index + 4));
    };

    for (let index = 0; index < size; index += 1) {
      expect(pixelAt(0, index)).toEqual(pixelAt(size - 1, index));
      expect(pixelAt(index, 0)).toEqual(pixelAt(index, size - 1));
    }
  });

  it('renders antique differently from contour for the same seed', () => {
    const contour = generateContourLandscapeTextureTilePixelBuffer(48, 48, 'light', 12345, 'contour');
    const antique = generateContourLandscapeTextureTilePixelBuffer(48, 48, 'light', 12345, 'antique');

    expect(Array.from(antique)).not.toEqual(Array.from(contour));
  });
});
