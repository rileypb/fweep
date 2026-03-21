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
      waterDeep: { r: 51, g: 59, b: 91 },
      waterShallow: { r: 82, g: 88, b: 118 },
      fillDeep: { r: 48, g: 50, b: 45 },
      fillLow: { r: 58, g: 61, b: 55 },
      fillHigh: { r: 82, g: 86, b: 79 },
    }
    : {
      base: { r: 232, g: 227, b: 208 },
      line: { r: 123, g: 111, b: 84 },
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
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.lineWidth = theme === 'dark' ? 0.9 : 0.8;
  context.strokeStyle = toCssRgb(palette.line);

  for (const face of topology.faces) {
    const fill = face.isWater
      ? mixRgb(
        palette.waterDeep,
        palette.waterShallow,
        clamp01(face.elevation / Math.max(CONTOUR_MESH_WATER_LEVEL, 1)),
      )
      : (() => {
        const fillBase = mixRgb(palette.fillDeep, palette.fillLow, clamp01((face.elevation - CONTOUR_MESH_WATER_LEVEL) / 30));
        return mixRgb(fillBase, palette.fillHigh, clamp01((face.elevation - CONTOUR_MESH_WATER_LEVEL - 10) / 50));
      })();
    context.beginPath();
    context.moveTo(face.vertices[0][0] * width, face.vertices[0][1] * height);
    context.lineTo(face.vertices[1][0] * width, face.vertices[1][1] * height);
    context.lineTo(face.vertices[2][0] * width, face.vertices[2][1] * height);
    context.closePath();
    context.fillStyle = toCssRgb(fill);
    context.fill();
    context.stroke();
  }
}
