import { describe, expect, it } from '@jest/globals';
import {
  CONTOUR_MESH_POINT_COUNT,
  CONTOUR_MESH_TILE_SIZE,
  CONTOUR_MESH_WATER_LEVEL,
  generateContourMeshBasePoints,
  generateContourMeshEdgeSubdivisions,
  generateContourMeshTopology,
  generateContourMeshTriangles,
  getContourMeshBaseColor,
  sampleContourMeshElevation,
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
      expect(face.elevation).toBeGreaterThanOrEqual(0);
      expect(face.elevation).toBeLessThanOrEqual(100);
      expect(face.isWater).toBe(face.elevation < CONTOUR_MESH_WATER_LEVEL);
    }
  });

  it('tracks adjacent faces through shared edges', () => {
    const topology = generateContourMeshTopology(12345);

    expect(topology.edges.every((edge) => edge.faceIds.length >= 1 && edge.faceIds.length <= 2)).toBe(true);
    expect(topology.edges.some((edge) => edge.faceIds.length === 2)).toBe(true);
    expect(topology.faces.some((face) => face.adjacentFaceIds.length > 0)).toBe(true);
  });

  it('assigns deterministic elevations to the same wrapped coordinate', () => {
    expect(sampleContourMeshElevation(12345, 0.25, 0.75)).toBe(sampleContourMeshElevation(12345, 0.25, 0.75));
    expect(sampleContourMeshElevation(12345, 0.25, 0.75)).toBe(sampleContourMeshElevation(12345, 1.25, -0.25));
  });

  it('derives face elevation from the minimum corner elevation', () => {
    const topology = generateContourMeshTopology(12345);
    const verticesById = new Map(topology.vertices.map((vertex) => [vertex.id, vertex]));

    for (const face of topology.faces.slice(0, 20)) {
      const cornerElevations = face.vertexIds.map((vertexId) => verticesById.get(vertexId)?.elevation ?? -1);
      expect(face.elevation).toBe(Math.min(...cornerElevations));
    }
  });

  it('classifies both land and water faces from the shared elevation field', () => {
    const topology = generateContourMeshTopology(12345);

    expect(topology.faces.some((face) => face.isWater)).toBe(true);
    expect(topology.faces.some((face) => !face.isWater)).toBe(true);
  });

  it('builds deterministic edge subdivisions from the topology', () => {
    const topology = generateContourMeshTopology(12345);

    expect(generateContourMeshEdgeSubdivisions(topology)).toEqual(generateContourMeshEdgeSubdivisions(topology));
  });

  it('subdivides edges at each integer elevation crossing', () => {
    const topology = generateContourMeshTopology(12345);
    const verticesById = new Map(topology.vertices.map((vertex) => [vertex.id, vertex]));
    const subdivisions = generateContourMeshEdgeSubdivisions(topology);

    expect(subdivisions.length).toBe(topology.edges.length);
    expect(subdivisions.some((subdivision) => Math.abs(subdivision.diff) > 1)).toBe(true);

    for (const subdivision of subdivisions.slice(0, 50)) {
      const start = verticesById.get(subdivision.vertexIds[0]);
      const end = verticesById.get(subdivision.vertexIds[1]);
      expect(start).toBeDefined();
      expect(end).toBeDefined();
      expect(subdivision.points.length).toBe(Math.max(Math.abs(subdivision.diff), 1) + 1);

      if (!start || !end) {
        continue;
      }

      expect(subdivision.points[0]).toEqual({
        x: start.x,
        y: start.y,
        elevation: start.elevation,
      });
      expect(subdivision.points[subdivision.points.length - 1]).toEqual({
        x: end.x,
        y: end.y,
        elevation: end.elevation,
      });
    }
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
