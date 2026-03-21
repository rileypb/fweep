import { Delaunay } from 'd3-delaunay';
import { clamp01, sampleSeamlessFractalNoise, type SeamlessFractalNoiseOptions } from './seamless-noise';

export type ContourMeshTextureTheme = 'light' | 'dark';

export const CONTOUR_MESH_TILE_SIZE = 512;
export const CONTOUR_MESH_POINT_COUNT = 420;

interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

interface ThemePalette {
  readonly base: Rgb;
  readonly line: Rgb;
  readonly contourLand: Rgb;
  readonly contourWater: Rgb;
  readonly waterDeep: Rgb;
  readonly waterShallow: Rgb;
  readonly fillLow: Rgb;
  readonly fillHigh: Rgb;
  readonly fillDeep: Rgb;
}

interface MeshPoint {
  readonly x: number;
  readonly y: number;
  readonly baseIndex: number;
}

interface MeshTriangle {
  readonly vertices: readonly [readonly [number, number], readonly [number, number], readonly [number, number]];
  readonly fillMix: number;
}

export interface ContourMeshVertex {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly baseIndex: number;
  readonly elevation: number;
}

export interface ContourMeshEdge {
  readonly id: string;
  readonly vertexIds: readonly [string, string];
  readonly faceIds: readonly string[];
}

export interface ContourMeshFace {
  readonly id: string;
  readonly vertexIds: readonly [string, string, string];
  readonly edgeIds: readonly [string, string, string];
  readonly adjacentFaceIds: readonly string[];
  readonly vertices: readonly [readonly [number, number], readonly [number, number], readonly [number, number]];
  readonly centroid: readonly [number, number];
  readonly fillMix: number;
  readonly elevation: number;
  readonly isWater: boolean;
}

export interface ContourMeshTopology {
  readonly vertices: readonly ContourMeshVertex[];
  readonly edges: readonly ContourMeshEdge[];
  readonly faces: readonly ContourMeshFace[];
}

export interface ContourMeshSubdivisionPoint {
  readonly x: number;
  readonly y: number;
  readonly elevation: number;
}

export interface ContourMeshEdgeSubdivision {
  readonly edgeId: string;
  readonly vertexIds: readonly [string, string];
  readonly diff: number;
  readonly points: readonly ContourMeshSubdivisionPoint[];
}

export interface ContourMeshContourSegment {
  readonly elevation: number;
  readonly start: readonly [number, number];
  readonly end: readonly [number, number];
}

interface ContourMeshContourPolyline {
  readonly elevation: number;
  readonly points: readonly (readonly [number, number])[];
}

export interface ContourMeshSubface {
  readonly faceId: string;
  readonly elevation: number;
  readonly isWater: boolean;
  readonly vertices: readonly [readonly [number, number], readonly [number, number], readonly [number, number]];
  readonly elevations: readonly [number, number, number];
}

export interface ContourMeshFillPolygon {
  readonly vertices: readonly (readonly [number, number])[];
  readonly averageElevation: number;
}

export interface ContourMeshFaceFillPolygons {
  readonly land: ContourMeshFillPolygon | null;
  readonly water: ContourMeshFillPolygon | null;
}

interface ContourMeshElevationConfig {
  readonly broad: SeamlessFractalNoiseOptions;
  readonly detail: SeamlessFractalNoiseOptions;
  readonly detailWeight: number;
  readonly gamma: number;
}

export const CONTOUR_MESH_ELEVATION_CONFIG: ContourMeshElevationConfig = {
  broad: { cycleX: 1, cycleY: 1, octaves: 1, persistence: 0.5, lacunarity: 2 },
  detail: { cycleX: 1, cycleY: 1, octaves: 2, persistence: 0.5, lacunarity: 2 },
  detailWeight: 0.08,
  gamma: 1.15,
};

export const CONTOUR_MESH_WATER_LEVEL = 48;
export const CONTOUR_MESH_CONTOUR_INTERVAL = 4;
const CONTOUR_MESH_WATER_DEPTH_GAMMA = 1.6;
const CONTOUR_MESH_RENDER_DARKNESS = 0.11;
const CONTOUR_MESH_LIGHT_VECTOR = (() => {
  const x = -1;
  const y = -1;
  const z = 0.3;
  const length = Math.hypot(x, y, z) || 1;
  return { x: x / length, y: y / length, z: z / length };
})();

function halton(index: number, base: number): number {
  let result = 0;
  let factor = 1 / base;
  let current = index;

  while (current > 0) {
    result += factor * (current % base);
    current = Math.floor(current / base);
    factor /= base;
  }

  return result;
}

function hashTriangle(a: number, b: number, c: number, seed: number): number {
  let hash = (seed >>> 0) ^ 0x9e3779b9;
  const sorted = [a, b, c].sort((left, right) => left - right);
  for (const value of sorted) {
    hash ^= value + 0x9e3779b9 + (hash << 6) + (hash >>> 2);
  }
  return hash >>> 0;
}

function getPalette(theme: ContourMeshTextureTheme): ThemePalette {
  return theme === 'dark'
    ? {
      base: { r: 40, g: 42, b: 38 },
      line: { r: 116, g: 121, b: 112 },
      contourLand: { r: 223, g: 228, b: 214 },
      contourWater: { r: 28, g: 31, b: 44 },
      waterDeep: { r: 51, g: 59, b: 91 },
      waterShallow: { r: 82, g: 88, b: 118 },
      fillDeep: { r: 48, g: 50, b: 45 },
      fillLow: { r: 58, g: 61, b: 55 },
      fillHigh: { r: 82, g: 86, b: 79 },
    }
    : {
      base: { r: 230, g: 230, b: 230 },
      line: { r: 132, g: 132, b: 132 },
      contourLand: { r: 230, g: 233, b: 232 },
      contourWater: { r: 27, g: 40, b: 73 },
      waterDeep: { r: 56, g: 95, b: 183 },
      waterShallow: { r: 139, g: 174, b: 215 },
      fillDeep: { r: 145, g: 171, b: 137 },
      fillLow: { r: 207, g: 220, b: 198 },
      fillHigh: { r: 177, g: 201, b: 173 },
    };
}

function mixRgb(left: Rgb, right: Rgb, amount: number): Rgb {
  return {
    r: left.r + ((right.r - left.r) * amount),
    g: left.g + ((right.g - left.g) * amount),
    b: left.b + ((right.b - left.b) * amount),
  };
}

function scaleRgb(color: Rgb, factor: number): Rgb {
  return {
    r: color.r * factor,
    g: color.g * factor,
    b: color.b * factor,
  };
}

function toCssRgb(color: Rgb): string {
  return `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`;
}

function fadeRgbTowardBase(color: Rgb, base: Rgb, darkness: number = CONTOUR_MESH_RENDER_DARKNESS): Rgb {
  return mixRgb(base, color, darkness);
}

function getWaterDepthMix(elevation: number): number {
  const normalizedElevation = clamp01(elevation / Math.max(CONTOUR_MESH_WATER_LEVEL, 1));
  return Math.pow(normalizedElevation, CONTOUR_MESH_WATER_DEPTH_GAMMA);
}

function coordinateKey(value: number): string {
  return value.toFixed(6);
}

function getVertexId(x: number, y: number): string {
  return `${coordinateKey(x)}:${coordinateKey(y)}`;
}

function getEdgeId(firstVertexId: string, secondVertexId: string): string {
  return [firstVertexId, secondVertexId].sort().join('|');
}

function intersectsCenterTile(vertices: readonly [readonly [number, number], readonly [number, number], readonly [number, number]]): boolean {
  const xs = vertices.map(([x]) => x);
  const ys = vertices.map(([, y]) => y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return maxX > 0 && minX < 1 && maxY > 0 && minY < 1;
}

export function getContourMeshBaseColor(theme: ContourMeshTextureTheme): string {
  return toCssRgb(getPalette(theme).base);
}

export function sampleContourMeshElevation(seed: number, x: number, y: number): number {
  const broad = sampleSeamlessFractalNoise(seed, x, y, CONTOUR_MESH_ELEVATION_CONFIG.broad);
  const detail = sampleSeamlessFractalNoise(seed + 1009, x, y, CONTOUR_MESH_ELEVATION_CONFIG.detail);
  const combined = (((broad * (1 - CONTOUR_MESH_ELEVATION_CONFIG.detailWeight))
    + (detail * CONTOUR_MESH_ELEVATION_CONFIG.detailWeight)) + 1) / 2;

  return Math.floor(100 * Math.pow(clamp01(combined), CONTOUR_MESH_ELEVATION_CONFIG.gamma));
}

export function generateContourMeshBasePoints(
  seed: number,
  pointCount: number = CONTOUR_MESH_POINT_COUNT,
): readonly MeshPoint[] {
  const skip = 1 + ((seed >>> 0) % 10000);
  const points: MeshPoint[] = [];

  for (let index = 0; index < pointCount; index += 1) {
    const haltonIndex = skip + index;
    points.push({
      x: halton(haltonIndex, 2),
      y: halton(haltonIndex, 3),
      baseIndex: index,
    });
  }

  return points;
}

export function generateContourMeshTopology(
  seed: number,
  pointCount: number = CONTOUR_MESH_POINT_COUNT,
): ContourMeshTopology {
  const basePoints = generateContourMeshBasePoints(seed, pointCount);
  const repeatedPoints: MeshPoint[] = [];

  for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
    for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
      for (const point of basePoints) {
        repeatedPoints.push({
          x: point.x + offsetX,
          y: point.y + offsetY,
          baseIndex: point.baseIndex,
        });
      }
    }
  }

  const delaunay = Delaunay.from(repeatedPoints, (point) => point.x, (point) => point.y);
  const vertexMap = new Map<string, ContourMeshVertex>();
  const edgeMap = new Map<string, { id: string; vertexIds: [string, string]; faceIds: string[] }>();
  const faces: ContourMeshFace[] = [];

  function ensureVertex(x: number, y: number, baseIndex: number): string {
    const id = getVertexId(x, y);
    if (!vertexMap.has(id)) {
      vertexMap.set(id, {
        id,
        x,
        y,
        baseIndex,
        elevation: sampleContourMeshElevation(seed, ((x % 1) + 1) % 1, ((y % 1) + 1) % 1),
      });
    }
    return id;
  }

  for (let triangleIndex = 0; triangleIndex < delaunay.triangles.length; triangleIndex += 3) {
    const pointA = repeatedPoints[delaunay.triangles[triangleIndex]];
    const pointB = repeatedPoints[delaunay.triangles[triangleIndex + 1]];
    const pointC = repeatedPoints[delaunay.triangles[triangleIndex + 2]];
    if (!pointA || !pointB || !pointC) {
      continue;
    }

    const centroidX = (pointA.x + pointB.x + pointC.x) / 3;
    const centroidY = (pointA.y + pointB.y + pointC.y) / 3;
    if (centroidX < 0 || centroidX >= 1 || centroidY < 0 || centroidY >= 1) {
      continue;
    }

    const fillHash = hashTriangle(pointA.baseIndex, pointB.baseIndex, pointC.baseIndex, seed);
    const fillMix = ((fillHash % 1000) / 999) * 0.9;

    for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        const vertices = [
          [pointA.x - offsetX, pointA.y - offsetY],
          [pointB.x - offsetX, pointB.y - offsetY],
          [pointC.x - offsetX, pointC.y - offsetY],
        ] as const;

        if (!intersectsCenterTile(vertices)) {
          continue;
        }

        const wrappedPoints = [
          { x: vertices[0][0], y: vertices[0][1], baseIndex: pointA.baseIndex },
          { x: vertices[1][0], y: vertices[1][1], baseIndex: pointB.baseIndex },
          { x: vertices[2][0], y: vertices[2][1], baseIndex: pointC.baseIndex },
        ] as const;
        const vertexIds = [
          ensureVertex(wrappedPoints[0].x, wrappedPoints[0].y, wrappedPoints[0].baseIndex),
          ensureVertex(wrappedPoints[1].x, wrappedPoints[1].y, wrappedPoints[1].baseIndex),
          ensureVertex(wrappedPoints[2].x, wrappedPoints[2].y, wrappedPoints[2].baseIndex),
        ] as const;
        const vertexElevations = vertexIds.map((vertexId) => vertexMap.get(vertexId)?.elevation ?? 0);
        const faceId = `face:${vertexIds.slice().sort().join('|')}`;
        const edgeIds = [
          getEdgeId(vertexIds[0], vertexIds[1]),
          getEdgeId(vertexIds[1], vertexIds[2]),
          getEdgeId(vertexIds[2], vertexIds[0]),
        ] as const;

        for (const edgeId of edgeIds) {
          const firstSeparator = edgeId.indexOf('|');
          const vertexPair: [string, string] = [
            edgeId.slice(0, firstSeparator),
            edgeId.slice(firstSeparator + 1),
          ];
          const existing = edgeMap.get(edgeId);
          if (existing) {
            if (!existing.faceIds.includes(faceId)) {
              existing.faceIds.push(faceId);
            }
          } else {
            edgeMap.set(edgeId, {
              id: edgeId,
              vertexIds: vertexPair,
              faceIds: [faceId],
            });
          }
        }

        faces.push({
          id: faceId,
          vertexIds,
          edgeIds,
          adjacentFaceIds: [],
          vertices,
          centroid: [
            (vertices[0][0] + vertices[1][0] + vertices[2][0]) / 3,
            (vertices[0][1] + vertices[1][1] + vertices[2][1]) / 3,
          ],
          fillMix,
          elevation: Math.min(...vertexElevations),
          isWater: Math.min(...vertexElevations) < CONTOUR_MESH_WATER_LEVEL,
        });
      }
    }
  }

  const facesById = new Map(faces.map((face) => [face.id, face]));
  const resolvedEdges: ContourMeshEdge[] = Array.from(edgeMap.values()).map((edge) => ({
    id: edge.id,
    vertexIds: edge.vertexIds,
    faceIds: edge.faceIds.slice().sort(),
  }));

  const resolvedFaces = faces.map((face) => {
    const adjacentFaceIds = new Set<string>();
    for (const edgeId of face.edgeIds) {
      const edge = edgeMap.get(edgeId);
      if (!edge) {
        continue;
      }
      for (const faceId of edge.faceIds) {
        if (faceId !== face.id && facesById.has(faceId)) {
          adjacentFaceIds.add(faceId);
        }
      }
    }

    return {
      ...face,
      adjacentFaceIds: Array.from(adjacentFaceIds).sort(),
    };
  });

  return {
    vertices: Array.from(vertexMap.values()).sort((left, right) => left.id.localeCompare(right.id)),
    edges: resolvedEdges.sort((left, right) => left.id.localeCompare(right.id)),
    faces: resolvedFaces.sort((left, right) => left.id.localeCompare(right.id)),
  };
}

export function generateContourMeshTriangles(
  seed: number,
  pointCount: number = CONTOUR_MESH_POINT_COUNT,
): readonly MeshTriangle[] {
  return generateContourMeshTopology(seed, pointCount).faces.map((face) => ({
    vertices: face.vertices,
    fillMix: face.elevation / 100,
  }));
}

export function generateContourMeshEdgeSubdivisions(
  topology: ContourMeshTopology,
): readonly ContourMeshEdgeSubdivision[] {
  const verticesById = new Map(topology.vertices.map((vertex) => [vertex.id, vertex]));

  return topology.edges.map((edge) => {
    const start = verticesById.get(edge.vertexIds[0]);
    const end = verticesById.get(edge.vertexIds[1]);
    if (!start || !end) {
      return {
        edgeId: edge.id,
        vertexIds: edge.vertexIds,
        diff: 0,
        points: [],
      };
    }

    const diff = end.elevation - start.elevation;
    const steps = Math.abs(diff);
    const points: ContourMeshSubdivisionPoint[] = [];

    if (steps === 0) {
      points.push(
        { x: start.x, y: start.y, elevation: start.elevation },
        { x: end.x, y: end.y, elevation: end.elevation },
      );
    } else {
      for (let step = 0; step <= steps; step += 1) {
        const t = step / steps;
        points.push({
          x: start.x + ((end.x - start.x) * t),
          y: start.y + ((end.y - start.y) * t),
          elevation: diff > 0 ? start.elevation + step : start.elevation - step,
        });
      }
    }

    return {
      edgeId: edge.id,
      vertexIds: edge.vertexIds,
      diff,
      points,
    };
  });
}

function getSubdivisionPointKey(point: ContourMeshSubdivisionPoint): string {
  return `${coordinateKey(point.x)}:${coordinateKey(point.y)}:${point.elevation}`;
}

function toTriangleVertices(
  first: ContourMeshSubdivisionPoint,
  second: ContourMeshSubdivisionPoint,
  third: ContourMeshSubdivisionPoint,
): [readonly [number, number], readonly [number, number], readonly [number, number]] {
  return [
    [first.x, first.y],
    [second.x, second.y],
    [third.x, third.y],
  ] as const;
}

export function calculateContourMeshSubfaceLighting(subface: ContourMeshSubface): number {
  const [a, b, c] = subface.vertices;
  const [za, zb, zc] = subface.elevations;

  const abx = (b[0] - a[0]) * 100;
  const aby = (b[1] - a[1]) * 100;
  const abz = zb - za;
  const acx = (c[0] - a[0]) * 100;
  const acy = (c[1] - a[1]) * 100;
  const acz = zc - za;

  let nx = (aby * acz) - (abz * acy);
  let ny = (abz * acx) - (abx * acz);
  let nz = (abx * acy) - (aby * acx);
  if (nz < 0) {
    nx *= -1;
    ny *= -1;
    nz *= -1;
  }

  const length = Math.hypot(nx, ny, nz) || 1;
  const dot = ((nx / length) * CONTOUR_MESH_LIGHT_VECTOR.x)
    + ((ny / length) * CONTOUR_MESH_LIGHT_VECTOR.y)
    + ((nz / length) * CONTOUR_MESH_LIGHT_VECTOR.z);

  return Math.min(1, Math.max(0, 0.6 + (0.3 * dot)));
}

export function generateContourMeshSubfaces(
  topology: ContourMeshTopology,
): readonly ContourMeshSubface[] {
  const verticesById = new Map(topology.vertices.map((vertex) => [vertex.id, vertex]));
  const subfaces: ContourMeshSubface[] = [];

  for (const face of topology.faces) {
    const corners = face.vertexIds.map((vertexId) => {
      const vertex = verticesById.get(vertexId);
      if (!vertex) {
        throw new Error(`Missing contour mesh vertex ${vertexId}.`);
      }

      return {
        x: vertex.x,
        y: vertex.y,
        elevation: vertex.elevation,
      };
    }) as readonly ScalarCorner[];

    const minElevation = Math.min(...corners.map((corner) => corner.elevation));
    const maxElevation = Math.max(...corners.map((corner) => corner.elevation));

    for (let band = minElevation; band <= maxElevation; band += 1) {
      const lowerClipped = clipPolygonByElevation(corners, band, true);
      const bandPolygon = clipPolygonByUpperElevation(lowerClipped, band + 1);
      if (bandPolygon.length < 3) {
        continue;
      }

      const anchor = bandPolygon[0];
      for (let index = 1; index < bandPolygon.length - 1; index += 1) {
        const first = anchor;
        const second = bandPolygon[index];
        const third = bandPolygon[index + 1];
        const vertices = toTriangleVertices(first, second, third);
        const uniqueKeys = new Set(vertices.map(([x, y]) => `${coordinateKey(x)}:${coordinateKey(y)}`));
        if (uniqueKeys.size < 3) {
          continue;
        }

        subfaces.push({
          faceId: face.id,
          elevation: band,
          isWater: band < CONTOUR_MESH_WATER_LEVEL,
          vertices,
          elevations: [first.elevation, second.elevation, third.elevation],
        });
      }
    }
  }

  return subfaces;
}

export function generateContourMeshContourSegments(
  topology: ContourMeshTopology,
  interval: number = CONTOUR_MESH_CONTOUR_INTERVAL,
): readonly ContourMeshContourSegment[] {
  const subdivisions = generateContourMeshEdgeSubdivisions(topology);
  const subdivisionsByEdgeId = new Map(subdivisions.map((subdivision) => [subdivision.edgeId, subdivision]));
  const segments: ContourMeshContourSegment[] = [];

  for (const face of topology.faces) {
    const pointsByElevation = new Map<number, ContourMeshSubdivisionPoint[]>();

    for (const edgeId of face.edgeIds) {
      const subdivision = subdivisionsByEdgeId.get(edgeId);
      if (!subdivision) {
        continue;
      }

      for (const point of subdivision.points) {
        if (point.elevation <= face.elevation || point.elevation % interval !== 0) {
          continue;
        }

        const existing = pointsByElevation.get(point.elevation) ?? [];
        if (!existing.some((candidate) => getSubdivisionPointKey(candidate) === getSubdivisionPointKey(point))) {
          existing.push(point);
        }
        pointsByElevation.set(point.elevation, existing);
      }
    }

    for (const [elevation, points] of pointsByElevation.entries()) {
      if (points.length !== 2) {
        continue;
      }

      segments.push({
        elevation,
        start: [points[0].x, points[0].y],
        end: [points[1].x, points[1].y],
      });
    }
  }

  return segments;
}

function getPointKey(point: readonly [number, number]): string {
  return `${coordinateKey(point[0])}:${coordinateKey(point[1])}`;
}

function generateContourMeshContourPolylines(
  segments: readonly ContourMeshContourSegment[],
): readonly ContourMeshContourPolyline[] {
  const polylines: ContourMeshContourPolyline[] = [];
  const segmentsByElevation = new Map<number, ContourMeshContourSegment[]>();

  for (const segment of segments) {
    const existing = segmentsByElevation.get(segment.elevation) ?? [];
    existing.push(segment);
    segmentsByElevation.set(segment.elevation, existing);
  }

  for (const [elevation, elevationSegments] of segmentsByElevation.entries()) {
    const endpointMap = new Map<string, number[]>();
    const used = new Set<number>();

    for (let index = 0; index < elevationSegments.length; index += 1) {
      const segment = elevationSegments[index];
      for (const point of [segment.start, segment.end] as const) {
        const key = getPointKey(point);
        const existing = endpointMap.get(key) ?? [];
        existing.push(index);
        endpointMap.set(key, existing);
      }
    }

    const buildPolyline = (seedIndex: number): readonly (readonly [number, number])[] => {
      const seed = elevationSegments[seedIndex];
      const points: (readonly [number, number])[] = [seed.start, seed.end];
      used.add(seedIndex);

      const extend = (atStart: boolean): void => {
        while (true) {
          const currentPoint = atStart ? points[0] : points[points.length - 1];
          const candidateIndexes = endpointMap.get(getPointKey(currentPoint)) ?? [];
          const nextIndex = candidateIndexes.find((candidateIndex) => !used.has(candidateIndex));
          if (nextIndex === undefined) {
            return;
          }

          used.add(nextIndex);
          const nextSegment = elevationSegments[nextIndex];
          const nextPoint = getPointKey(nextSegment.start) === getPointKey(currentPoint)
            ? nextSegment.end
            : nextSegment.start;

          if (atStart) {
            points.unshift(nextPoint);
          } else {
            points.push(nextPoint);
          }
        }
      };

      extend(true);
      extend(false);
      return points;
    };

    const endpointIndexes = elevationSegments
      .map((_, index) => index)
      .filter((index) => {
        const segment = elevationSegments[index];
        const startDegree = (endpointMap.get(getPointKey(segment.start)) ?? []).length;
        const endDegree = (endpointMap.get(getPointKey(segment.end)) ?? []).length;
        return startDegree === 1 || endDegree === 1;
      });

    for (const index of endpointIndexes) {
      if (used.has(index)) {
        continue;
      }

      polylines.push({
        elevation,
        points: buildPolyline(index),
      });
    }

    for (let index = 0; index < elevationSegments.length; index += 1) {
      if (used.has(index)) {
        continue;
      }

      polylines.push({
        elevation,
        points: buildPolyline(index),
      });
    }
  }

  return polylines;
}

function strokeContourPolyline(
  context: CanvasRenderingContext2D,
  points: readonly (readonly [number, number])[],
  width: number,
  height: number,
  smooth: boolean,
): void {
  if (points.length < 2) {
    return;
  }

  const drawPoints = (() => {
    if (!smooth || points.length < 3) {
      return points;
    }

    const result: (readonly [number, number])[] = [points[0]];
    for (let index = 0; index < points.length - 1; index += 1) {
      const current = points[index];
      const next = points[index + 1];
      result.push([
        (current[0] * 0.75) + (next[0] * 0.25),
        (current[1] * 0.75) + (next[1] * 0.25),
      ] as const);
      result.push([
        (current[0] * 0.25) + (next[0] * 0.75),
        (current[1] * 0.25) + (next[1] * 0.75),
      ] as const);
    }
    result.push(points[points.length - 1]);
    return result;
  })();

  context.beginPath();
  context.moveTo(drawPoints[0][0] * width, drawPoints[0][1] * height);
  for (let index = 1; index < drawPoints.length; index += 1) {
    context.lineTo(drawPoints[index][0] * width, drawPoints[index][1] * height);
  }
  context.stroke();
}

interface ScalarCorner {
  readonly x: number;
  readonly y: number;
  readonly elevation: number;
}

function clipPolygonByElevation(
  polygon: readonly ScalarCorner[],
  threshold: number,
  keepAbove: boolean,
): ScalarCorner[] {
  const result: ScalarCorner[] = [];
  const isInside = (point: ScalarCorner): boolean => (keepAbove ? point.elevation >= threshold : point.elevation < threshold);

  const getIntersection = (start: ScalarCorner, end: ScalarCorner): ScalarCorner => {
    const denominator = end.elevation - start.elevation;
    const t = denominator === 0 ? 0 : (threshold - start.elevation) / denominator;
    return {
      x: start.x + ((end.x - start.x) * t),
      y: start.y + ((end.y - start.y) * t),
      elevation: threshold,
    };
  };

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const currentInside = isInside(current);
    const nextInside = isInside(next);

    if (currentInside && nextInside) {
      result.push(next);
    } else if (currentInside && !nextInside) {
      result.push(getIntersection(current, next));
    } else if (!currentInside && nextInside) {
      result.push(getIntersection(current, next));
      result.push(next);
    }
  }

  return result;
}

function clipPolygonByUpperElevation(
  polygon: readonly ScalarCorner[],
  threshold: number,
): ScalarCorner[] {
  const result: ScalarCorner[] = [];
  const isInside = (point: ScalarCorner): boolean => point.elevation < threshold;

  const getIntersection = (start: ScalarCorner, end: ScalarCorner): ScalarCorner => {
    const denominator = end.elevation - start.elevation;
    const t = denominator === 0 ? 0 : (threshold - start.elevation) / denominator;
    return {
      x: start.x + ((end.x - start.x) * t),
      y: start.y + ((end.y - start.y) * t),
      elevation: threshold,
    };
  };

  for (let index = 0; index < polygon.length; index += 1) {
    const current = polygon[index];
    const next = polygon[(index + 1) % polygon.length];
    const currentInside = isInside(current);
    const nextInside = isInside(next);

    if (currentInside && nextInside) {
      result.push(next);
    } else if (currentInside && !nextInside) {
      result.push(getIntersection(current, next));
    } else if (!currentInside && nextInside) {
      result.push(getIntersection(current, next));
      result.push(next);
    }
  }

  return result;
}

function toFillPolygon(points: readonly ScalarCorner[]): ContourMeshFillPolygon | null {
  if (points.length < 3) {
    return null;
  }

  return {
    vertices: points.map((point) => [point.x, point.y] as const),
    averageElevation: points.reduce((sum, point) => sum + point.elevation, 0) / points.length,
  };
}

export function getContourMeshFaceFillPolygons(
  face: ContourMeshFace,
  verticesById: ReadonlyMap<string, ContourMeshVertex>,
  waterLevel: number = CONTOUR_MESH_WATER_LEVEL,
): ContourMeshFaceFillPolygons {
  const corners = face.vertexIds.map((vertexId) => {
    const vertex = verticesById.get(vertexId);
    if (!vertex) {
      throw new Error(`Missing contour mesh vertex ${vertexId}.`);
    }

    return {
      x: vertex.x,
      y: vertex.y,
      elevation: vertex.elevation,
    };
  }) as readonly ScalarCorner[];

  return {
    land: toFillPolygon(clipPolygonByElevation(corners, waterLevel, true)),
    water: toFillPolygon(clipPolygonByElevation(corners, waterLevel, false)),
  };
}

function fillPolygon(
  context: CanvasRenderingContext2D,
  polygon: ContourMeshFillPolygon,
  width: number,
  height: number,
  color: Rgb,
): void {
  context.beginPath();
  context.moveTo(polygon.vertices[0][0] * width, polygon.vertices[0][1] * height);
  for (let index = 1; index < polygon.vertices.length; index += 1) {
    context.lineTo(polygon.vertices[index][0] * width, polygon.vertices[index][1] * height);
  }
  context.closePath();
  context.fillStyle = toCssRgb(color);
  context.fill();
}

function getContourMeshSubfaceFillColor(
  subface: ContourMeshSubface,
  palette: ThemePalette,
): Rgb {
  const baseFill = subface.isWater
    ? mixRgb(
      palette.waterDeep,
      palette.waterShallow,
      getWaterDepthMix(subface.elevation),
    )
    : (() => {
      const landBase = mixRgb(
        palette.fillDeep,
        palette.fillLow,
        clamp01((subface.elevation - CONTOUR_MESH_WATER_LEVEL) / 30),
      );
      return mixRgb(landBase, palette.fillHigh, clamp01((subface.elevation - CONTOUR_MESH_WATER_LEVEL - 10) / 50));
    })();

  const color = subface.isWater
    ? baseFill
    : scaleRgb(baseFill, calculateContourMeshSubfaceLighting(subface));

  return fadeRgbTowardBase(color, palette.base);
}

function fillImageData(data: Uint8ClampedArray, color: Rgb): void {
  const red = Math.round(color.r);
  const green = Math.round(color.g);
  const blue = Math.round(color.b);

  for (let index = 0; index < data.length; index += 4) {
    data[index] = red;
    data[index + 1] = green;
    data[index + 2] = blue;
    data[index + 3] = 255;
  }
}

function writePixel(data: Uint8ClampedArray, width: number, x: number, y: number, color: Rgb): void {
  const offset = ((y * width) + x) * 4;
  data[offset] = Math.round(color.r);
  data[offset + 1] = Math.round(color.g);
  data[offset + 2] = Math.round(color.b);
  data[offset + 3] = 255;
}

function getBarycentricWeights(
  point: readonly [number, number],
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
): readonly [number, number, number] | null {
  const denominator = ((b[1] - c[1]) * (a[0] - c[0])) + ((c[0] - b[0]) * (a[1] - c[1]));
  if (Math.abs(denominator) < 1e-8) {
    return null;
  }

  const w1 = (((b[1] - c[1]) * (point[0] - c[0])) + ((c[0] - b[0]) * (point[1] - c[1]))) / denominator;
  const w2 = (((c[1] - a[1]) * (point[0] - c[0])) + ((a[0] - c[0]) * (point[1] - c[1]))) / denominator;
  const w3 = 1 - w1 - w2;
  return [w1, w2, w3];
}

function mixVertexColors(
  first: Rgb,
  second: Rgb,
  third: Rgb,
  weights: readonly [number, number, number],
): Rgb {
  return {
    r: (first.r * weights[0]) + (second.r * weights[1]) + (third.r * weights[2]),
    g: (first.g * weights[0]) + (second.g * weights[1]) + (third.g * weights[2]),
    b: (first.b * weights[0]) + (second.b * weights[1]) + (third.b * weights[2]),
  };
}

function drawInterpolatedTriangleToImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  vertices: readonly [readonly [number, number], readonly [number, number], readonly [number, number]],
  colors: readonly [Rgb, Rgb, Rgb],
): void {
  const scaledVertices = [
    [vertices[0][0] * width, vertices[0][1] * height] as const,
    [vertices[1][0] * width, vertices[1][1] * height] as const,
    [vertices[2][0] * width, vertices[2][1] * height] as const,
  ] as const;

  const minX = Math.max(0, Math.floor(Math.min(scaledVertices[0][0], scaledVertices[1][0], scaledVertices[2][0])));
  const maxX = Math.min(width - 1, Math.ceil(Math.max(scaledVertices[0][0], scaledVertices[1][0], scaledVertices[2][0])));
  const minY = Math.max(0, Math.floor(Math.min(scaledVertices[0][1], scaledVertices[1][1], scaledVertices[2][1])));
  const maxY = Math.min(height - 1, Math.ceil(Math.max(scaledVertices[0][1], scaledVertices[1][1], scaledVertices[2][1])));

  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const weights = getBarycentricWeights(
        [x + 0.5, y + 0.5],
        scaledVertices[0],
        scaledVertices[1],
        scaledVertices[2],
      );

      if (!weights) {
        continue;
      }

      const epsilon = -1e-5;
      if (weights[0] < epsilon || weights[1] < epsilon || weights[2] < epsilon) {
        continue;
      }

      writePixel(data, width, x, y, mixVertexColors(colors[0], colors[1], colors[2], weights));
    }
  }
}

export function renderContourMeshTextureTile(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  theme: ContourMeshTextureTheme,
  seed: number,
): void {
  const palette = getPalette(theme);
  context.clearRect(0, 0, width, height);
  context.fillStyle = toCssRgb(palette.base);
  context.fillRect(0, 0, width, height);

  const topology = generateContourMeshTopology(seed);
  const verticesById = new Map(topology.vertices.map((vertex) => [vertex.id, vertex]));
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.lineWidth = theme === 'dark' ? 0.9 : 0.8;
  context.strokeStyle = toCssRgb(palette.line);

  const subfaces = generateContourMeshSubfaces(topology);
  if (subfaces.length > 0) {
    const imageData = context.createImageData(width, height);
    fillImageData(imageData.data, palette.base);

    const colorSumsByVertexKey = new Map<string, { r: number; g: number; b: number; count: number }>();
    for (const subface of subfaces) {
      const fill = getContourMeshSubfaceFillColor(subface, palette);
      for (const [x, y] of subface.vertices) {
        const key = `${subface.isWater ? 'water' : 'land'}:${getVertexId(x, y)}`;
        const existing = colorSumsByVertexKey.get(key) ?? { r: 0, g: 0, b: 0, count: 0 };
        existing.r += fill.r;
        existing.g += fill.g;
        existing.b += fill.b;
        existing.count += 1;
        colorSumsByVertexKey.set(key, existing);
      }
    }

    const averagedColorsByVertexKey = new Map<string, Rgb>();
    for (const [key, sum] of colorSumsByVertexKey.entries()) {
      averagedColorsByVertexKey.set(key, {
        r: sum.r / sum.count,
        g: sum.g / sum.count,
        b: sum.b / sum.count,
      });
    }

    for (const subface of subfaces) {
      const fallbackColor = getContourMeshSubfaceFillColor(subface, palette);
      const colors = [
        averagedColorsByVertexKey.get(`${subface.isWater ? 'water' : 'land'}:${getVertexId(subface.vertices[0][0], subface.vertices[0][1])}`) ?? fallbackColor,
        averagedColorsByVertexKey.get(`${subface.isWater ? 'water' : 'land'}:${getVertexId(subface.vertices[1][0], subface.vertices[1][1])}`) ?? fallbackColor,
        averagedColorsByVertexKey.get(`${subface.isWater ? 'water' : 'land'}:${getVertexId(subface.vertices[2][0], subface.vertices[2][1])}`) ?? fallbackColor,
      ] as const;

      drawInterpolatedTriangleToImageData(
        imageData.data,
        width,
        height,
        subface.vertices,
        colors,
      );
    }

    context.putImageData(imageData, 0, 0);
  } else {
    for (const face of topology.faces) {
      const polygons = getContourMeshFaceFillPolygons(face, verticesById);

      if (polygons.water) {
        fillPolygon(
          context,
          polygons.water,
          width,
          height,
          fadeRgbTowardBase(mixRgb(
            palette.waterDeep,
            palette.waterShallow,
            getWaterDepthMix(polygons.water.averageElevation),
          ), palette.base),
        );
      }

      if (polygons.land) {
        const landBase = mixRgb(
          palette.fillDeep,
          palette.fillLow,
          clamp01((polygons.land.averageElevation - CONTOUR_MESH_WATER_LEVEL) / 30),
        );
        fillPolygon(
          context,
          polygons.land,
          width,
          height,
          fadeRgbTowardBase(
            mixRgb(landBase, palette.fillHigh, clamp01((polygons.land.averageElevation - CONTOUR_MESH_WATER_LEVEL - 10) / 50)),
            palette.base,
          ),
        );
      }
    }
  }

  const contourSegments = generateContourMeshContourSegments(topology);
  const contourPolylines = generateContourMeshContourPolylines(contourSegments);
  context.lineWidth = theme === 'dark' ? 1.1 : 1;
  for (const polyline of contourPolylines) {
    context.strokeStyle = toCssRgb(
      fadeRgbTowardBase(
        polyline.elevation <= CONTOUR_MESH_WATER_LEVEL ? palette.contourWater : palette.contourLand,
        palette.base,
      ),
    );
    strokeContourPolyline(
      context,
      polyline.points,
      width,
      height,
      polyline.elevation !== CONTOUR_MESH_WATER_LEVEL,
    );
  }
}
