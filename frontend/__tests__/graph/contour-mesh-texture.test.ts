import { describe, expect, it } from '@jest/globals';
import {
  CONTOUR_MESH_POINT_COUNT,
  CONTOUR_MESH_TILE_SIZE,
  generateContourMeshBasePoints,
  generateContourMeshTriangles,
  getContourMeshBaseColor,
} from '../../src/graph/contour-mesh-texture-core';

describe('contour-mesh-texture', () => {
  it('returns a theme-specific base color', () => {
    expect(getContourMeshBaseColor('light')).toMatch(/^rgb\(/);
    expect(getContourMeshBaseColor('light')).not.toBe(getContourMeshBaseColor('dark'));
  });

  it('uses a large shared tile size for the contour mesh texture', () => {
    expect(CONTOUR_MESH_TILE_SIZE).toBeGreaterThanOrEqual(256);
  });

  it('generates a stable Halton-style point set for a given seed', () => {
    const first = generateContourMeshBasePoints(12345);
    const second = generateContourMeshBasePoints(12345);

    expect(first).toEqual(second);
    expect(first).toHaveLength(CONTOUR_MESH_POINT_COUNT);
  });

  it('changes the point set when the seed changes', () => {
    expect(generateContourMeshBasePoints(12345)).not.toEqual(generateContourMeshBasePoints(54321));
  });

  it('produces deterministic triangles for the same seed', () => {
    expect(generateContourMeshTriangles(12345)).toEqual(generateContourMeshTriangles(12345));
  });

  it('produces different triangles for different seeds', () => {
    expect(generateContourMeshTriangles(12345)).not.toEqual(generateContourMeshTriangles(54321));
  });

  it('keeps all rendered triangle vertices in the repeatable neighborhood of the center tile', () => {
    const triangles = generateContourMeshTriangles(12345);

    expect(triangles.length).toBeGreaterThan(0);
    for (const triangle of triangles) {
      for (const [x, y] of triangle.vertices) {
        expect(x).toBeGreaterThanOrEqual(-1);
        expect(x).toBeLessThanOrEqual(2);
        expect(y).toBeGreaterThanOrEqual(-1);
        expect(y).toBeLessThanOrEqual(2);
      }
    }
  });
});
