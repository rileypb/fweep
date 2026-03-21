import { describe, expect, it, jest } from '@jest/globals';
import {
  calculateContourMeshSubfaceLighting,
  CONTOUR_MESH_POINT_COUNT,
  CONTOUR_MESH_CONTOUR_INTERVAL,
  CONTOUR_MESH_TILE_SIZE,
  CONTOUR_MESH_WATER_LEVEL,
  generateContourMeshBasePoints,
  generateContourMeshContourSegments,
  generateContourMeshEdgeSubdivisions,
  getContourMeshFaceFillPolygons,
  generateContourMeshSubfaces,
  generateContourMeshTopology,
  generateContourMeshTriangles,
  getContourMeshBaseColor,
  renderContourMeshTextureTile,
  sampleContourMeshElevation,
} from '../../src/graph/contour-mesh-texture-core';

type FakeContext = {
  readonly clearRect: ReturnType<typeof jest.fn>;
  readonly fillRect: ReturnType<typeof jest.fn>;
  readonly beginPath: ReturnType<typeof jest.fn>;
  readonly moveTo: ReturnType<typeof jest.fn>;
  readonly lineTo: ReturnType<typeof jest.fn>;
  readonly closePath: ReturnType<typeof jest.fn>;
  readonly fill: ReturnType<typeof jest.fn>;
  readonly stroke: ReturnType<typeof jest.fn>;
  readonly putImageData: ReturnType<typeof jest.fn>;
  readonly createImageData: ReturnType<typeof jest.fn>;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  lineJoin: CanvasLineJoin;
  lineCap: CanvasLineCap;
};

function createFakeContext(): FakeContext {
  return {
    clearRect: jest.fn(),
    fillRect: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    closePath: jest.fn(),
    fill: jest.fn(),
    stroke: jest.fn(),
    putImageData: jest.fn(),
    createImageData: jest.fn((width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
      width,
      height,
    })),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineJoin: 'miter',
    lineCap: 'butt',
  };
}

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

  it('splits mixed faces into separate land and water fill polygons at sea level', () => {
    const topology = generateContourMeshTopology(12345);
    const verticesById = new Map(topology.vertices.map((vertex) => [vertex.id, vertex]));
    const mixedFace = topology.faces.find((face) => {
      const elevations = face.vertexIds.map((vertexId) => verticesById.get(vertexId)?.elevation ?? 0);
      return elevations.some((elevation) => elevation < CONTOUR_MESH_WATER_LEVEL)
        && elevations.some((elevation) => elevation >= CONTOUR_MESH_WATER_LEVEL);
    });

    expect(mixedFace).toBeDefined();
    if (!mixedFace) {
      return;
    }

    const polygons = getContourMeshFaceFillPolygons(mixedFace, verticesById);
    expect(polygons.land).not.toBeNull();
    expect(polygons.water).not.toBeNull();
    expect((polygons.land?.vertices.length ?? 0)).toBeGreaterThanOrEqual(3);
    expect((polygons.water?.vertices.length ?? 0)).toBeGreaterThanOrEqual(3);
  });

  it('returns only a land polygon for an entirely land face', () => {
    const topology = generateContourMeshTopology(12345);
    const verticesById = new Map(topology.vertices.map((vertex) => [vertex.id, vertex]));
    const landFace = topology.faces.find((face) => !face.isWater);

    expect(landFace).toBeDefined();
    if (!landFace) {
      return;
    }

    const polygons = getContourMeshFaceFillPolygons(landFace, verticesById);
    expect(polygons.land).not.toBeNull();
    expect(polygons.water).toBeNull();
  });

  it('returns only a water polygon for an entirely water face', () => {
    const topology = generateContourMeshTopology(12345);
    const verticesById = new Map(topology.vertices.map((vertex) => [vertex.id, vertex]));
    const waterFace = topology.faces.find((face) => face.vertexIds.every((vertexId) => (
      (verticesById.get(vertexId)?.elevation ?? Infinity) < CONTOUR_MESH_WATER_LEVEL
    )));

    expect(waterFace).toBeDefined();
    if (!waterFace) {
      return;
    }

    const polygons = getContourMeshFaceFillPolygons(waterFace, verticesById);
    expect(polygons.land).toBeNull();
    expect(polygons.water).not.toBeNull();
  });

  it('throws if a face fill polygon is requested with a missing vertex reference', () => {
    const topology = generateContourMeshTopology(12345);
    const verticesById = new Map(topology.vertices.map((vertex) => [vertex.id, vertex]));
    const someFace = topology.faces[0];

    expect(someFace).toBeDefined();
    if (!someFace) {
      return;
    }

    verticesById.delete(someFace.vertexIds[0]);
    expect(() => getContourMeshFaceFillPolygons(someFace, verticesById)).toThrow(/Missing contour mesh vertex/);
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

  it('builds deterministic contour segments from face subdivisions', () => {
    const topology = generateContourMeshTopology(12345);

    expect(generateContourMeshContourSegments(topology)).toEqual(generateContourMeshContourSegments(topology));
  });

  it('builds deterministic subfaces from the subdivided contour mesh', () => {
    const topology = generateContourMeshTopology(12345);

    expect(generateContourMeshSubfaces(topology)).toEqual(generateContourMeshSubfaces(topology));
  });

  it('creates subfaces with unit elevation bands', () => {
    const topology = generateContourMeshTopology(12345);
    const subfaces = generateContourMeshSubfaces(topology);

    expect(subfaces.length).toBeGreaterThan(0);
    expect(subfaces.some((subface) => subface.isWater)).toBe(true);
    expect(subfaces.some((subface) => !subface.isWater)).toBe(true);

    for (const subface of subfaces.slice(0, 80)) {
      expect(subface.vertices).toHaveLength(3);
      expect(subface.elevations).toHaveLength(3);
      expect(subface.elevation).toBeGreaterThanOrEqual(0);
      expect(subface.elevation).toBeLessThanOrEqual(100);
    }
  });

  it('computes deterministic bounded lighting for subfaces', () => {
    const topology = generateContourMeshTopology(12345);
    const subface = generateContourMeshSubfaces(topology)[0];

    expect(subface).toBeDefined();
    if (!subface) {
      return;
    }

    const first = calculateContourMeshSubfaceLighting(subface);
    const second = calculateContourMeshSubfaceLighting(subface);
    expect(first).toBe(second);
    expect(first).toBeGreaterThanOrEqual(0);
    expect(first).toBeLessThanOrEqual(1);
  });

  it('creates contour segments only at interval-aligned elevations above the face floor', () => {
    const topology = generateContourMeshTopology(12345);
    const segments = generateContourMeshContourSegments(topology);

    expect(segments.length).toBeGreaterThan(0);
    for (const segment of segments.slice(0, 80)) {
      expect(segment.elevation % CONTOUR_MESH_CONTOUR_INTERVAL).toBe(0);
      expect(segment.start).not.toEqual(segment.end);
    }

    expect(topology.faces.some((face) => face.isWater)).toBe(true);
    expect(topology.faces.some((face) => !face.isWater)).toBe(true);
  });

  it('renders deterministic image data for the same seed and theme', () => {
    const firstContext = createFakeContext();
    const secondContext = createFakeContext();

    renderContourMeshTextureTile(firstContext as unknown as CanvasRenderingContext2D, 32, 32, 'light', 12345);
    renderContourMeshTextureTile(secondContext as unknown as CanvasRenderingContext2D, 32, 32, 'light', 12345);

    expect(firstContext.putImageData).toHaveBeenCalledTimes(1);
    expect(secondContext.putImageData).toHaveBeenCalledTimes(1);

    const firstImageData = firstContext.putImageData.mock.calls[0]?.[0] as ImageData;
    const secondImageData = secondContext.putImageData.mock.calls[0]?.[0] as ImageData;
    expect(Array.from(firstImageData.data)).toEqual(Array.from(secondImageData.data));
  });

  it('renders different image data when the seed changes', () => {
    const firstContext = createFakeContext();
    const secondContext = createFakeContext();

    renderContourMeshTextureTile(firstContext as unknown as CanvasRenderingContext2D, 32, 32, 'light', 12345);
    renderContourMeshTextureTile(secondContext as unknown as CanvasRenderingContext2D, 32, 32, 'light', 54321);

    const firstImageData = firstContext.putImageData.mock.calls[0]?.[0] as ImageData;
    const secondImageData = secondContext.putImageData.mock.calls[0]?.[0] as ImageData;
    expect(Array.from(firstImageData.data)).not.toEqual(Array.from(secondImageData.data));
  });

  it('renders different image data for light and dark themes', () => {
    const lightContext = createFakeContext();
    const darkContext = createFakeContext();

    renderContourMeshTextureTile(lightContext as unknown as CanvasRenderingContext2D, 32, 32, 'light', 12345);
    renderContourMeshTextureTile(darkContext as unknown as CanvasRenderingContext2D, 32, 32, 'dark', 12345);

    const lightImageData = lightContext.putImageData.mock.calls[0]?.[0] as ImageData;
    const darkImageData = darkContext.putImageData.mock.calls[0]?.[0] as ImageData;
    expect(Array.from(lightImageData.data)).not.toEqual(Array.from(darkImageData.data));
  });

  it('fills the backing image data and draws contour strokes during rendering', () => {
    const context = createFakeContext();

    renderContourMeshTextureTile(context as unknown as CanvasRenderingContext2D, 24, 24, 'light', 12345);

    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 24, 24);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 24, 24);
    expect(context.createImageData).toHaveBeenCalledWith(24, 24);
    expect(context.putImageData).toHaveBeenCalledWith(expect.objectContaining({ width: 24, height: 24 }), 0, 0);
    expect(context.stroke).toHaveBeenCalled();

    const imageData = context.putImageData.mock.calls[0]?.[0] as ImageData;
    const uniqueAlphaValues = new Set(Array.from(imageData.data).filter((_, index) => (index % 4) === 3));
    expect(uniqueAlphaValues).toEqual(new Set([255]));
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
