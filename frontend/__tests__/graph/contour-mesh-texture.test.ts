import { describe, expect, it } from '@jest/globals';
import {
  CONTOUR_MESH_POINT_COUNT,
  CONTOUR_MESH_TILE_SIZE,
  generateContourMeshBasePoints,
  generateContourMeshTopology,
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

  it('builds a deterministic topology model for the same seed', () => {
    expect(generateContourMeshTopology(12345)).toEqual(generateContourMeshTopology(12345));
  });

  it('creates faces, edges, and vertices from the triangulation', () => {
    const topology = generateContourMeshTopology(12345);

    expect(topology.vertices.length).toBeGreaterThan(0);
    expect(topology.edges.length).toBeGreaterThan(0);
    expect(topology.faces.length).toBeGreaterThan(0);

    for (const face of topology.faces) {
      expect(face.vertexIds).toHaveLength(3);
      expect(face.edgeIds).toHaveLength(3);
    }
  });

  it('tracks adjacent faces through shared edges', () => {
    const topology = generateContourMeshTopology(12345);

    expect(topology.edges.every((edge) => edge.faceIds.length >= 1 && edge.faceIds.length <= 2)).toBe(true);
    expect(topology.edges.some((edge) => edge.faceIds.length === 2)).toBe(true);
    expect(topology.faces.some((face) => face.adjacentFaceIds.length > 0)).toBe(true);
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
