import { Delaunay } from 'd3-delaunay';

export type ContourMeshTextureTheme = 'light' | 'dark';

export const CONTOUR_MESH_TILE_SIZE = 512;
export const CONTOUR_MESH_POINT_COUNT = 220;

interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

interface ThemePalette {
  readonly base: Rgb;
  readonly line: Rgb;
  readonly fillLow: Rgb;
  readonly fillHigh: Rgb;
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
      fillLow: { r: 58, g: 61, b: 55 },
      fillHigh: { r: 82, g: 86, b: 79 },
    }
    : {
      base: { r: 232, g: 227, b: 208 },
      line: { r: 123, g: 111, b: 84 },
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

export function generateContourMeshTriangles(
  seed: number,
  pointCount: number = CONTOUR_MESH_POINT_COUNT,
): readonly MeshTriangle[] {
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
  const triangles: MeshTriangle[] = [];

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

        triangles.push({
          vertices,
          fillMix,
        });
      }
    }
  }

  return triangles;
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

  const triangles = generateContourMeshTriangles(seed);
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.lineWidth = theme === 'dark' ? 0.9 : 0.8;
  context.strokeStyle = toCssRgb(palette.line);

  for (const triangle of triangles) {
    const fill = mixRgb(palette.fillLow, palette.fillHigh, triangle.fillMix);
    context.beginPath();
    context.moveTo(triangle.vertices[0][0] * width, triangle.vertices[0][1] * height);
    context.lineTo(triangle.vertices[1][0] * width, triangle.vertices[1][1] * height);
    context.lineTo(triangle.vertices[2][0] * width, triangle.vertices[2][1] * height);
    context.closePath();
    context.fillStyle = toCssRgb(fill);
    context.fill();
    context.stroke();
  }
}
