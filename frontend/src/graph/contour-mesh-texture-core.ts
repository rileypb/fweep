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

export const CONTOUR_MESH_WATER_LEVEL = 44;
export const CONTOUR_MESH_CONTOUR_INTERVAL = 4;

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
      base: { r: 232, g: 227, b: 208 },
      line: { r: 123, g: 111, b: 84 },
      contourLand: { r: 245, g: 243, b: 234 },
      contourWater: { r: 41, g: 38, b: 57 },
      waterDeep: { r: 103, g: 108, b: 178 },
      waterShallow: { r: 146, g: 147, b: 192 },
      fillDeep: { r: 177, g: 170, b: 149 },
      fillLow: { r: 223, g: 218, b: 201 },
      fillHigh: { r: 197, g: 190, b: 170 },
    };
}

function mixRgb(left: Rgb, right: Rgb, amount: number): Rgb {
  return {
    r: left.r + ((right.r - left.r) * amount),
    g: left.g + ((right.g - left.g) * amount),
    b: left.b + ((right.b - left.b) * amount),
  };
}

function toCssRgb(color: Rgb): string {
  return `rgb(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)})`;
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

  for (const face of topology.faces) {
    const polygons = getContourMeshFaceFillPolygons(face, verticesById);

    if (polygons.water) {
      fillPolygon(
        context,
        polygons.water,
        width,
        height,
        mixRgb(
          palette.waterDeep,
          palette.waterShallow,
          clamp01(polygons.water.averageElevation / Math.max(CONTOUR_MESH_WATER_LEVEL, 1)),
        ),
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
        mixRgb(landBase, palette.fillHigh, clamp01((polygons.land.averageElevation - CONTOUR_MESH_WATER_LEVEL - 10) / 50)),
      );
    }

    context.beginPath();
    context.moveTo(face.vertices[0][0] * width, face.vertices[0][1] * height);
    context.lineTo(face.vertices[1][0] * width, face.vertices[1][1] * height);
    context.lineTo(face.vertices[2][0] * width, face.vertices[2][1] * height);
    context.closePath();
    context.stroke();
  }

  const contourSegments = generateContourMeshContourSegments(topology);
  context.lineWidth = theme === 'dark' ? 1.1 : 1;
  for (const segment of contourSegments) {
    context.beginPath();
    context.strokeStyle = toCssRgb(segment.elevation <= CONTOUR_MESH_WATER_LEVEL ? palette.contourWater : palette.contourLand);
    context.moveTo(segment.start[0] * width, segment.start[1] * height);
    context.lineTo(segment.end[0] * width, segment.end[1] * height);
    context.stroke();
  }
}
