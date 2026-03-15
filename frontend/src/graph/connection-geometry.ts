import type { Room, Connection, RoomShape } from '../domain/map-types';
import { normalizeDirection } from '../domain/directions';
import { getRoomShapePolygonVertices } from './room-shape-geometry';

/* ---- Constants ---- */

/** Estimated room node dimensions (matches CSS .room-node min-width + padding). */
export const ROOM_WIDTH = 80;
export const ROOM_HEIGHT = 36;
export const ROOM_CORNER_RADIUS = 8;
export const CORNER_HANDLE_INSET = 6;

export interface RoomDimensions {
  readonly width: number;
  readonly height: number;
}

const DEFAULT_ROOM_DIMENSIONS: RoomDimensions = {
  width: ROOM_WIDTH,
  height: ROOM_HEIGHT,
};

/** Default length (px) of the stub segment that extends straight out from a handle. */
export const DEFAULT_STUB_LENGTH = 20;

/** A 2D point. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export type ConnectionRenderGeometry =
  | {
    readonly kind: 'polyline';
    readonly points: readonly Point[];
  }
  | {
    readonly kind: 'quadratic';
    readonly start: Point;
    readonly control: Point;
    readonly end: Point;
  }
  | {
    readonly kind: 'cubic';
    readonly start: Point;
    readonly control1: Point;
    readonly control2: Point;
    readonly end: Point;
  };

const DEFAULT_ARROW_LENGTH = 12;
const DEFAULT_ARROW_WIDTH = 10;
const DEFAULT_ARROW_FRACTIONS = [1 / 3, 2 / 3] as const;

/* ---- Handle position offsets ---- */

/**
 * Offset from a room's top-left corner to the center of each compass handle.
 * Only compass directions that correspond to visible handles are included.
 */
const HANDLE_OFFSET_FACTORS: Readonly<Record<string, { dx: number; dy: number }>> = {
  north:     { dx: 0.5, dy: 0 },
  northeast: { dx: 1,   dy: 0 },
  east:      { dx: 1,   dy: 0.5 },
  southeast: { dx: 1,   dy: 1 },
  south:     { dx: 0.5, dy: 1 },
  southwest: { dx: 0,   dy: 1 },
  west:      { dx: 0,   dy: 0.5 },
  northwest: { dx: 0,   dy: 0 },
};

/* ---- Direction vectors (normalized for consistent stub length) ---- */

const INV_SQRT2 = 1 / Math.sqrt(2);

const DIRECTION_VECTORS: Readonly<Record<string, { vx: number; vy: number }>> = {
  north:     { vx: 0,          vy: -1 },
  northeast: { vx: INV_SQRT2,  vy: -INV_SQRT2 },
  east:      { vx: 1,          vy: 0 },
  southeast: { vx: INV_SQRT2,  vy: INV_SQRT2 },
  south:     { vx: 0,          vy: 1 },
  southwest: { vx: -INV_SQRT2, vy: INV_SQRT2 },
  west:      { vx: -1,         vy: 0 },
  northwest: { vx: -INV_SQRT2, vy: -INV_SQRT2 },
};

const HANDLE_DIRECTION_ORDER = [
  'north',
  'northeast',
  'east',
  'southeast',
  'south',
  'southwest',
  'west',
  'northwest',
] as const;

function isVerticalDirection(direction: string): boolean {
  return direction === 'up' || direction === 'down';
}

function getPolygonEdgeCenters(vertices: Point[]): Point[] {
  return vertices.map((start, index) => {
    const end = vertices[(index + 1) % vertices.length];
    return {
      x: (start.x + end.x) / 2,
      y: (start.y + end.y) / 2,
    };
  });
}

function normalizeVector(vector: Point): Point | undefined {
  const length = Math.hypot(vector.x, vector.y);
  if (length === 0) {
    return undefined;
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  };
}

function getPolygonEdgeOutwardNormals(vertices: Point[]): Point[] {
  const centerSum = vertices.reduce(
    (acc, point) => ({ x: acc.x + point.x, y: acc.y + point.y }),
    { x: 0, y: 0 },
  );
  const center = {
    x: centerSum.x / vertices.length,
    y: centerSum.y / vertices.length,
  };

  return vertices.map((start, index) => {
    const end = vertices[(index + 1) % vertices.length];
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
    const edge = { x: end.x - start.x, y: end.y - start.y };
    const candidateA = normalizeVector({ x: edge.y, y: -edge.x })!;
    const candidateB = { x: -candidateA.x, y: -candidateA.y };
    const toMidpoint = { x: midpoint.x - center.x, y: midpoint.y - center.y };

    return ((candidateA.x * toMidpoint.x) + (candidateA.y * toMidpoint.y)) >= 0
      ? candidateA
      : candidateB;
  });
}

function getPointOnEllipse(theta: number, roomDimensions: RoomDimensions): Point {
  const rx = roomDimensions.width / 2;
  const ry = roomDimensions.height / 2;
  const cx = rx;
  const cy = ry;

  return {
    x: cx + (rx * Math.cos(theta)),
    y: cy + (ry * Math.sin(theta)),
  };
}

function intersectRayWithEllipse(center: Point, vector: Point, roomDimensions: RoomDimensions): Point | undefined {
  const normalizedVector = normalizeVector(vector);
  if (!normalizedVector) {
    return undefined;
  }

  const rx = roomDimensions.width / 2;
  const ry = roomDimensions.height / 2;
  const scale = 1 / Math.sqrt(
    ((normalizedVector.x * normalizedVector.x) / (rx * rx))
      + ((normalizedVector.y * normalizedVector.y) / (ry * ry)),
  );

  return {
    x: center.x + (normalizedVector.x * scale),
    y: center.y + (normalizedVector.y * scale),
  };
}

function isDiagonalDirection(direction: string): boolean {
  const vector = DIRECTION_VECTORS[direction];
  return vector !== undefined && vector.vx !== 0 && vector.vy !== 0;
}

function getDirectionPoint(direction: string): Point | undefined {
  const vector = DIRECTION_VECTORS[direction];
  if (!vector) {
    return undefined;
  }

  return { x: vector.vx, y: vector.vy };
}

function getEllipsePerimeterHandlePoints(roomDimensions: RoomDimensions): Point[] {
  const steps = 720;
  const points: Point[] = [];
  const cumulativeLengths: number[] = [0];

  for (let index = 0; index <= steps; index += 1) {
    const theta = (-Math.PI / 2) + ((Math.PI * 2 * index) / steps);
    points.push(getPointOnEllipse(theta, roomDimensions));
    if (index > 0) {
      const previous = points[index - 1];
      const current = points[index];
      cumulativeLengths.push(
        cumulativeLengths[index - 1] + Math.hypot(current.x - previous.x, current.y - previous.y),
      );
    }
  }

  const totalLength = cumulativeLengths[cumulativeLengths.length - 1];

  return HANDLE_DIRECTION_ORDER.map((_, index) => {
    const targetLength = (totalLength * index) / HANDLE_DIRECTION_ORDER.length;
    let segmentIndex = 1;

    while (segmentIndex < cumulativeLengths.length && cumulativeLengths[segmentIndex] < targetLength) {
      segmentIndex += 1;
    }

    const previousLength = cumulativeLengths[segmentIndex - 1];
    const nextLength = cumulativeLengths[segmentIndex];
    const segmentRatio = nextLength === previousLength
      ? 0
      : (targetLength - previousLength) / (nextLength - previousLength);
    const previousPoint = points[segmentIndex - 1];
    const nextPoint = points[segmentIndex];

    return {
      x: previousPoint.x + ((nextPoint.x - previousPoint.x) * segmentRatio),
      y: previousPoint.y + ((nextPoint.y - previousPoint.y) * segmentRatio),
    };
  });
}

function intersectRayWithPolygon(center: Point, vector: Point, vertices: Point[]): Point | undefined {
  let closestDistance = Number.POSITIVE_INFINITY;
  let closestPoint: Point | undefined;

  for (let index = 0; index < vertices.length; index += 1) {
    const start = vertices[index];
    const end = vertices[(index + 1) % vertices.length];
    const edge = { x: end.x - start.x, y: end.y - start.y };
    const denominator = (vector.x * edge.y) - (vector.y * edge.x);

    if (Math.abs(denominator) < 1e-9) {
      continue;
    }

    const delta = { x: start.x - center.x, y: start.y - center.y };
    const t = ((delta.x * edge.y) - (delta.y * edge.x)) / denominator;
    const u = ((delta.x * vector.y) - (delta.y * vector.x)) / denominator;

    if (t < 0 || u < 0 || u > 1) {
      continue;
    }

    if (t < closestDistance) {
      closestDistance = t;
      closestPoint = {
        x: center.x + (vector.x * t),
        y: center.y + (vector.y * t),
      };
    }
  }

  return closestPoint;
}

function getRoomPerimeterOffsetTowardVector(
  vector: Point,
  roomDimensions: RoomDimensions,
  roomShape: RoomShape,
): Point | undefined {
  const center = { x: roomDimensions.width / 2, y: roomDimensions.height / 2 };
  const normalizedVector = normalizeVector(vector);
  if (!normalizedVector) {
    return undefined;
  }

  if (roomShape === 'diamond') {
    return intersectRayWithPolygon(center, normalizedVector, [
      { x: center.x, y: 0 },
      { x: roomDimensions.width, y: center.y },
      { x: center.x, y: roomDimensions.height },
      { x: 0, y: center.y },
    ]);
  }

  if (roomShape === 'oval') {
    return intersectRayWithEllipse(center, normalizedVector, roomDimensions);
  }

  const polygonVertices = getRoomShapePolygonVertices(roomShape, roomDimensions.width, roomDimensions.height);
  if (polygonVertices) {
    return intersectRayWithPolygon(center, normalizedVector, polygonVertices);
  }

  const halfWidth = roomDimensions.width / 2;
  const halfHeight = roomDimensions.height / 2;
  const tx = normalizedVector.x === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(normalizedVector.x);
  const ty = normalizedVector.y === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(normalizedVector.y);
  const scale = Math.min(tx, ty);

  return {
    x: center.x + (normalizedVector.x * scale),
    y: center.y + (normalizedVector.y * scale),
  };
}

function getShapeHandleOffset(
  direction: string,
  roomDimensions: RoomDimensions,
  roomShape: RoomShape,
): Point | undefined {
  const directionIndex = HANDLE_DIRECTION_ORDER.indexOf(direction as typeof HANDLE_DIRECTION_ORDER[number]);
  if (directionIndex === -1) {
    return undefined;
  }

  const center = { x: roomDimensions.width / 2, y: roomDimensions.height / 2 };

  if (roomShape === 'diamond') {
    const vertices = [
      { x: center.x, y: 0 },
      { x: roomDimensions.width, y: center.y },
      { x: center.x, y: roomDimensions.height },
      { x: 0, y: center.y },
    ];
    const handles = [
      vertices[0],
      { x: (vertices[0].x + vertices[1].x) / 2, y: (vertices[0].y + vertices[1].y) / 2 },
      vertices[1],
      { x: (vertices[1].x + vertices[2].x) / 2, y: (vertices[1].y + vertices[2].y) / 2 },
      vertices[2],
      { x: (vertices[2].x + vertices[3].x) / 2, y: (vertices[2].y + vertices[3].y) / 2 },
      vertices[3],
      { x: (vertices[3].x + vertices[0].x) / 2, y: (vertices[3].y + vertices[0].y) / 2 },
    ];

    return handles[directionIndex];
  }

  if (roomShape === 'oval') {
    if (isDiagonalDirection(direction)) {
      const directionPoint = getDirectionPoint(direction);
      return directionPoint ? intersectRayWithEllipse(center, directionPoint, roomDimensions) : undefined;
    }

    return getEllipsePerimeterHandlePoints(roomDimensions)[directionIndex];
  }

  if (roomShape === 'octagon') {
    return getPolygonEdgeCenters(
      getRoomShapePolygonVertices(roomShape, roomDimensions.width, roomDimensions.height)!,
    )[directionIndex];
  }

  if (roomShape === 'pentagon' || roomShape === 'hexagon' || roomShape === 'house' || roomShape === 'box') {
    const directionPoint = getDirectionPoint(direction);
    if (!directionPoint) {
      return undefined;
    }

    return intersectRayWithPolygon(
      center,
      directionPoint,
      getRoomShapePolygonVertices(roomShape, roomDimensions.width, roomDimensions.height)!,
    );
  }

  return undefined;
}

function getShapeStubVector(
  direction: string,
  roomDimensions: RoomDimensions,
  roomShape: RoomShape,
  handleOffset: Point,
): Point | undefined {
  const directionIndex = HANDLE_DIRECTION_ORDER.indexOf(direction as typeof HANDLE_DIRECTION_ORDER[number]);
  if (directionIndex === -1) {
    return undefined;
  }

  if (roomShape === 'diamond') {
    return DIRECTION_VECTORS[direction]
      ? { x: DIRECTION_VECTORS[direction].vx, y: DIRECTION_VECTORS[direction].vy }
      : undefined;
  }

  if (roomShape === 'oval') {
    return normalizeVector({
      x: handleOffset.x - (roomDimensions.width / 2),
      y: handleOffset.y - (roomDimensions.height / 2),
    });
  }

  if (roomShape === 'octagon') {
    return getPolygonEdgeOutwardNormals(
      getRoomShapePolygonVertices(roomShape, roomDimensions.width, roomDimensions.height)!,
    )[directionIndex];
  }

  if (roomShape === 'pentagon' || roomShape === 'hexagon' || roomShape === 'house' || roomShape === 'box') {
    return normalizeVector({
      x: handleOffset.x - (roomDimensions.width / 2),
      y: handleOffset.y - (roomDimensions.height / 2),
    });
  }

  return undefined;
}

function getStubEndpointForRoom(
  handlePosition: Point,
  direction: string,
  stubLength: number,
  roomDimensions: RoomDimensions,
  roomShape: RoomShape,
): Point | undefined {
  const handleOffset = getHandleOffset(direction, roomDimensions, roomShape);
  if (!handleOffset) {
    return getStubEndpoint(handlePosition, direction, stubLength);
  }

  const vector = roomShape === 'rectangle'
    ? DIRECTION_VECTORS[direction]
      ? { x: DIRECTION_VECTORS[direction].vx, y: DIRECTION_VECTORS[direction].vy }
      : undefined
    : getShapeStubVector(direction, roomDimensions, roomShape, handleOffset);

  if (!vector) {
    return undefined;
  }

  return {
    x: handlePosition.x + (vector.x * stubLength),
    y: handlePosition.y + (vector.y * stubLength),
  };
}

/* ---- Public functions ---- */

/**
 * Return the absolute position of a compass direction handle for a room.
 * Returns `undefined` if the direction has no visual handle (e.g. "up", "down").
 */
export function getHandlePosition(
  roomPosition: Point,
  direction: string,
  roomDimensions: RoomDimensions = DEFAULT_ROOM_DIMENSIONS,
  roomShape: RoomShape = 'rectangle',
): Point | undefined {
  const handleOffset = getHandleOffset(direction, roomDimensions, roomShape);
  if (!handleOffset) return undefined;

  return {
    x: roomPosition.x + handleOffset.x,
    y: roomPosition.y + handleOffset.y,
  };
}

/**
 * Return the local SVG coordinate for a compass handle inside a room shape.
 * These coordinates are the canonical anchor points for both rendered handle
 * circles and connection endpoints.
 */
export function getHandleOffset(
  direction: string,
  roomDimensions: RoomDimensions = DEFAULT_ROOM_DIMENSIONS,
  roomShape: RoomShape = 'rectangle',
): Point | undefined {
  if (roomShape !== 'rectangle') {
    return getShapeHandleOffset(direction, roomDimensions, roomShape);
  }

  const offset = HANDLE_OFFSET_FACTORS[direction];
  if (!offset) return undefined;

  const isLeftCorner = direction === 'northwest' || direction === 'southwest';
  const isRightCorner = direction === 'northeast' || direction === 'southeast';
  const isTopCorner = direction === 'northwest' || direction === 'northeast';
  const isBottomCorner = direction === 'southwest' || direction === 'southeast';

  return {
    x: roomDimensions.width * offset.dx + (isLeftCorner ? CORNER_HANDLE_INSET : 0) - (isRightCorner ? CORNER_HANDLE_INSET : 0),
    y: roomDimensions.height * offset.dy + (isTopCorner ? CORNER_HANDLE_INSET : 0) - (isBottomCorner ? CORNER_HANDLE_INSET : 0),
  };
}

/** Return the center point of a room. */
export function getRoomCenter(
  roomPosition: Point,
  roomDimensions: RoomDimensions = DEFAULT_ROOM_DIMENSIONS,
): Point {
  return {
    x: roomPosition.x + roomDimensions.width / 2,
    y: roomPosition.y + roomDimensions.height / 2,
  };
}

export function getRoomPerimeterPointToward(
  roomPosition: Point,
  towardPoint: Point,
  roomDimensions: RoomDimensions = DEFAULT_ROOM_DIMENSIONS,
  roomShape: RoomShape = 'rectangle',
): Point {
  const center = getRoomCenter(roomPosition, roomDimensions);
  const offset = getRoomPerimeterOffsetTowardVector(
    {
      x: towardPoint.x - center.x,
      y: towardPoint.y - center.y,
    },
    roomDimensions,
    roomShape,
  );

  if (!offset) {
    return center;
  }

  return {
    x: roomPosition.x + offset.x,
    y: roomPosition.y + offset.y,
  };
}

/**
 * Compute the stub endpoint: the point `stubLength` pixels away from a handle
 * in the outward direction.
 * Returns `undefined` for non-compass directions.
 */
export function getStubEndpoint(handlePosition: Point, direction: string, stubLength: number = DEFAULT_STUB_LENGTH): Point | undefined {
  const vec = DIRECTION_VECTORS[direction];
  if (!vec) return undefined;
  return {
    x: handlePosition.x + vec.vx * stubLength,
    y: handlePosition.y + vec.vy * stubLength,
  };
}

/**
 * Find the first direction in a room's direction map that references a given
 * connection ID. Returns `undefined` if no binding is found.
 */
export function findRoomDirectionForConnection(room: Room, connectionId: string): string | undefined {
  return findRoomDirectionsForConnection(room, connectionId)[0];
}

/**
 * Find all distinct directions in a room that reference a given
 * connection ID, preserving insertion order.
 */
function findRoomDirectionsForConnection(room: Room, connectionId: string): string[] {
  const directions: string[] = [];

  for (const [dir, cid] of Object.entries(room.directions)) {
    if (cid === connectionId && (HANDLE_OFFSET_FACTORS[dir] !== undefined || isVerticalDirection(dir))) {
      directions.push(dir);
    }
  }

  // Check if there's a non-canonical direction that normalizes to a supported one.
  for (const [dir, cid] of Object.entries(room.directions)) {
    if (cid === connectionId) {
      const normalized = normalizeDirection(dir);
      if (
        (HANDLE_OFFSET_FACTORS[normalized] !== undefined || isVerticalDirection(normalized))
        && !directions.includes(normalized)
      ) {
        directions.push(normalized);
      }
    }
  }

  return directions;
}

/**
 * Compute the polyline points for a connection between two rooms.
 *
 * Bidirectional path: sourceHandle → sourceStub → targetStub → targetHandle.
 * One-way path: sourceHandle → sourceStub → targetCenter.
 * When a room does not have a compass direction for the connection,
 * the room center is used and the stub is omitted.
 *
 * @param srcRoom  - The source room
 * @param tgtRoom  - The target room
 * @param conn     - The connection object
 * @param stubLength - Length of the straight stub segments
 * @returns An array of points forming the connection polyline
 */
export function computeConnectionPath(
  srcRoom: Room,
  tgtRoom: Room,
  conn: Connection,
  stubLength: number = DEFAULT_STUB_LENGTH,
  srcRoomDimensions: RoomDimensions = DEFAULT_ROOM_DIMENSIONS,
  tgtRoomDimensions: RoomDimensions = DEFAULT_ROOM_DIMENSIONS,
): Point[] {
  const isSelfConnection = conn.target.kind === 'room' && conn.sourceRoomId === conn.target.id;
  const srcDirections = findRoomDirectionsForConnection(srcRoom, conn.id);
  const srcDir = srcDirections[0];
  const isOneWayBetweenDifferentRooms = !conn.isBidirectional && !isSelfConnection;
  const tgtDir = isOneWayBetweenDifferentRooms
    ? undefined
    : isSelfConnection && conn.isBidirectional
      ? srcDirections[1]
      : findRoomDirectionForConnection(tgtRoom, conn.id);

  // Source endpoint
  const srcHandlePosition = srcDir
    ? getHandlePosition(srcRoom.position, srcDir, srcRoomDimensions, srcRoom.shape)
    : undefined;
  const srcStart = srcHandlePosition ?? getRoomCenter(srcRoom.position, srcRoomDimensions);

  // Target endpoint
  const tgtHandlePosition = tgtDir
    ? getHandlePosition(tgtRoom.position, tgtDir, tgtRoomDimensions, tgtRoom.shape)
    : undefined;
  const tgtEnd = tgtHandlePosition ?? getRoomCenter(tgtRoom.position, tgtRoomDimensions);

  // Build points array
  const points: Point[] = [srcStart];

  // Source stub
  if (srcDir && srcHandlePosition) {
    const stub = getStubEndpointForRoom(srcStart, srcDir, stubLength, srcRoomDimensions, srcRoom.shape);
    if (stub) points.push(stub);
  }

  // Target stub (in reverse — the stub extends outward from the target handle)
  if (tgtDir && tgtHandlePosition) {
    const stub = getStubEndpointForRoom(tgtEnd, tgtDir, stubLength, tgtRoomDimensions, tgtRoom.shape);
    if (stub) points.push(stub);
  }

  points.push(tgtEnd);

  return points;
}

/**
 * Compute the polyline points for a connection drag preview.
 * Path: sourceHandle → sourceStub → cursor position.
 */
export function computePreviewPath(
  srcRoom: Room,
  sourceDirection: string,
  cursorX: number,
  cursorY: number,
  stubLength: number = DEFAULT_STUB_LENGTH,
  srcRoomDimensions: RoomDimensions = DEFAULT_ROOM_DIMENSIONS,
): Point[] {
  const handlePos = getHandlePosition(srcRoom.position, sourceDirection, srcRoomDimensions, srcRoom.shape);
  if (!handlePos) {
    // Fallback to center
    const center = getRoomCenter(srcRoom.position, srcRoomDimensions);
    return [center, { x: cursorX, y: cursorY }];
  }

  const points: Point[] = [handlePos];

  const stub = getStubEndpointForRoom(handlePos, sourceDirection, stubLength, srcRoomDimensions, srcRoom.shape);
  if (stub) points.push(stub);

  points.push({ x: cursorX, y: cursorY });

  return points;
}

interface ArrowSegment {
  readonly start: Point;
  readonly end: Point;
  readonly ux: number;
  readonly uy: number;
  readonly px: number;
  readonly py: number;
  readonly length: number;
}

function getLastNonZeroSegment(pts: Point[]): ArrowSegment | undefined {
  if (pts.length < 2) return undefined;

  for (let i = pts.length - 2; i >= 0; i -= 1) {
    const start = pts[i];
    const end = pts[i + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);

    if (length === 0) {
      continue;
    }

    const ux = dx / length;
    const uy = dy / length;
    return {
      start,
      end,
      ux,
      uy,
      px: -uy,
      py: ux,
      length,
    };
  }

  return undefined;
}

function computeArrowheadAtFraction(
  segment: ArrowSegment,
  fraction: number,
  arrowLength: number,
  arrowWidth: number,
): Point[] {
  const centerX = segment.start.x + (segment.end.x - segment.start.x) * fraction;
  const centerY = segment.start.y + (segment.end.y - segment.start.y) * fraction;
  const halfArrowLength = arrowLength / 2;
  const halfArrowWidth = arrowWidth / 2;

  const tip = {
    x: centerX + segment.ux * halfArrowLength,
    y: centerY + segment.uy * halfArrowLength,
  };

  const baseCenter = {
    x: centerX - segment.ux * halfArrowLength,
    y: centerY - segment.uy * halfArrowLength,
  };

  const left = {
    x: baseCenter.x + segment.px * halfArrowWidth,
    y: baseCenter.y + segment.py * halfArrowWidth,
  };

  const right = {
    x: baseCenter.x - segment.px * halfArrowWidth,
    y: baseCenter.y - segment.py * halfArrowWidth,
  };

  return [tip, left, right];
}

/**
 * Compute triangle points for two arrowheads on the last non-zero segment of a
 * polyline, positioned at one-third and two-thirds of the segment length.
 */
export function computeSegmentArrowheadPoints(
  pts: Point[],
  arrowLength: number = DEFAULT_ARROW_LENGTH,
  arrowWidth: number = DEFAULT_ARROW_WIDTH,
): Point[][] {
  const segment = getLastNonZeroSegment(pts);
  if (!segment) return [];

  return DEFAULT_ARROW_FRACTIONS.map((fraction) =>
    computeArrowheadAtFraction(segment, fraction, arrowLength, arrowWidth),
  );
}

/** Convert an array of points to an SVG polyline `points` attribute string. */
export function pointsToSvgString(pts: readonly Point[]): string {
  return pts.map((p) => `${p.x},${p.y}`).join(' ');
}

export function createConnectionRenderGeometry(
  points: readonly Point[],
  isBidirectional: boolean,
  useBezierConnections: boolean,
  isSelfConnection: boolean,
): ConnectionRenderGeometry {
  if (!useBezierConnections || isSelfConnection) {
    return { kind: 'polyline', points };
  }

  if (isBidirectional && points.length >= 4) {
    return {
      kind: 'cubic',
      start: points[0],
      control1: points[1],
      control2: points[2],
      end: points[3],
    };
  }

  if (!isBidirectional && points.length >= 3) {
    return {
      kind: 'quadratic',
      start: points[0],
      control: points[1],
      end: points[points.length - 1],
    };
  }

  return { kind: 'polyline', points };
}

export function connectionGeometryToSvgPath(geometry: ConnectionRenderGeometry): string {
  if (geometry.kind === 'polyline') {
    if (geometry.points.length === 0) {
      return '';
    }

    const [start, ...rest] = geometry.points;
    return `M ${start.x} ${start.y}${rest.map((point) => ` L ${point.x} ${point.y}`).join('')}`;
  }

  if (geometry.kind === 'quadratic') {
    return `M ${geometry.start.x} ${geometry.start.y} Q ${geometry.control.x} ${geometry.control.y} ${geometry.end.x} ${geometry.end.y}`;
  }

  return `M ${geometry.start.x} ${geometry.start.y} C ${geometry.control1.x} ${geometry.control1.y} ${geometry.control2.x} ${geometry.control2.y} ${geometry.end.x} ${geometry.end.y}`;
}

function getQuadraticPoint(start: Point, control: Point, end: Point, t: number): Point {
  const oneMinusT = 1 - t;
  return {
    x: (oneMinusT * oneMinusT * start.x) + (2 * oneMinusT * t * control.x) + (t * t * end.x),
    y: (oneMinusT * oneMinusT * start.y) + (2 * oneMinusT * t * control.y) + (t * t * end.y),
  };
}

function getQuadraticTangent(start: Point, control: Point, end: Point, t: number): Point {
  return {
    x: (2 * (1 - t) * (control.x - start.x)) + (2 * t * (end.x - control.x)),
    y: (2 * (1 - t) * (control.y - start.y)) + (2 * t * (end.y - control.y)),
  };
}

function getCubicPoint(start: Point, control1: Point, control2: Point, end: Point, t: number): Point {
  const oneMinusT = 1 - t;
  return {
    x: (oneMinusT ** 3 * start.x)
      + (3 * oneMinusT * oneMinusT * t * control1.x)
      + (3 * oneMinusT * t * t * control2.x)
      + (t ** 3 * end.x),
    y: (oneMinusT ** 3 * start.y)
      + (3 * oneMinusT * oneMinusT * t * control1.y)
      + (3 * oneMinusT * t * t * control2.y)
      + (t ** 3 * end.y),
  };
}

function getCubicTangent(start: Point, control1: Point, control2: Point, end: Point, t: number): Point {
  const oneMinusT = 1 - t;
  return {
    x: (3 * oneMinusT * oneMinusT * (control1.x - start.x))
      + (6 * oneMinusT * t * (control2.x - control1.x))
      + (3 * t * t * (end.x - control2.x)),
    y: (3 * oneMinusT * oneMinusT * (control1.y - start.y))
      + (6 * oneMinusT * t * (control2.y - control1.y))
      + (3 * t * t * (end.y - control2.y)),
  };
}

function getCurvePointAtT(geometry: Exclude<ConnectionRenderGeometry, { kind: 'polyline' }>, t: number): Point {
  if (geometry.kind === 'quadratic') {
    return getQuadraticPoint(geometry.start, geometry.control, geometry.end, t);
  }

  return getCubicPoint(geometry.start, geometry.control1, geometry.control2, geometry.end, t);
}

function getCurveTangentAtT(geometry: Exclude<ConnectionRenderGeometry, { kind: 'polyline' }>, t: number): Point {
  if (geometry.kind === 'quadratic') {
    return getQuadraticTangent(geometry.start, geometry.control, geometry.end, t);
  }

  return getCubicTangent(geometry.start, geometry.control1, geometry.control2, geometry.end, t);
}

function getPolylineLength(points: readonly Point[]): number {
  let total = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    total += Math.hypot(points[index + 1].x - points[index].x, points[index + 1].y - points[index].y);
  }
  return total;
}

function getCurveLengthTable(geometry: Exclude<ConnectionRenderGeometry, { kind: 'polyline' }>, steps: number = 48): {
  readonly ts: readonly number[];
  readonly lengths: readonly number[];
  readonly totalLength: number;
} {
  const ts: number[] = [0];
  const lengths: number[] = [0];
  let totalLength = 0;
  let previous = getCurvePointAtT(geometry, 0);

  for (let index = 1; index <= steps; index += 1) {
    const t = index / steps;
    const point = getCurvePointAtT(geometry, t);
    totalLength += Math.hypot(point.x - previous.x, point.y - previous.y);
    ts.push(t);
    lengths.push(totalLength);
    previous = point;
  }

  return { ts, lengths, totalLength };
}

function getCurveTAtArcFraction(geometry: Exclude<ConnectionRenderGeometry, { kind: 'polyline' }>, fraction: number): number {
  const clampedFraction = Math.min(1, Math.max(0, fraction));
  const table = getCurveLengthTable(geometry);
  if (table.totalLength === 0) {
    return 0;
  }

  const targetLength = table.totalLength * clampedFraction;

  for (let index = 1; index < table.lengths.length; index += 1) {
    const previousLength = table.lengths[index - 1];
    const currentLength = table.lengths[index];

    if (currentLength < targetLength) {
      continue;
    }

    const previousT = table.ts[index - 1];
    const currentT = table.ts[index];
    const span = currentLength - previousLength;
    const ratio = span === 0 ? 0 : (targetLength - previousLength) / span;
    return previousT + ((currentT - previousT) * ratio);
  }

  return 1;
}

export function getConnectionGeometryLength(geometry: ConnectionRenderGeometry): number {
  if (geometry.kind === 'polyline') {
    return getPolylineLength(geometry.points);
  }

  return getCurveLengthTable(geometry).totalLength;
}

export function sampleConnectionGeometryAtFraction(
  geometry: ConnectionRenderGeometry,
  fraction: number,
): { point: Point; tangent: Point } | null {
  const clampedFraction = Math.min(1, Math.max(0, fraction));

  if (geometry.kind === 'polyline') {
    const totalLength = getPolylineLength(geometry.points);
    if (geometry.points.length === 0) {
      return null;
    }
    if (geometry.points.length === 1 || totalLength === 0) {
      return { point: geometry.points[0], tangent: { x: 1, y: 0 } };
    }

    const targetLength = totalLength * clampedFraction;
    let traversed = 0;

    for (let index = 0; index < geometry.points.length - 1; index += 1) {
      const start = geometry.points[index];
      const end = geometry.points[index + 1];
      const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
      if (segmentLength === 0) {
        continue;
      }

      if (traversed + segmentLength >= targetLength) {
        const segmentFraction = (targetLength - traversed) / segmentLength;
        return {
          point: {
            x: start.x + ((end.x - start.x) * segmentFraction),
            y: start.y + ((end.y - start.y) * segmentFraction),
          },
          tangent: {
            x: end.x - start.x,
            y: end.y - start.y,
          },
        };
      }

      traversed += segmentLength;
    }

    const start = geometry.points[geometry.points.length - 2];
    const end = geometry.points[geometry.points.length - 1];
    return {
      point: end,
      tangent: {
        x: end.x - start.x,
        y: end.y - start.y,
      },
    };
  }

  const t = getCurveTAtArcFraction(geometry, clampedFraction);
  return {
    point: getCurvePointAtT(geometry, t),
    tangent: getCurveTangentAtT(geometry, t),
  };
}

export function flattenConnectionGeometry(
  geometry: ConnectionRenderGeometry,
  segmentCount: number = 48,
): readonly Point[] {
  if (geometry.kind === 'polyline') {
    return geometry.points;
  }

  const clampedSegmentCount = Math.max(2, Math.floor(segmentCount));
  const points: Point[] = [];

  for (let index = 0; index <= clampedSegmentCount; index += 1) {
    const fraction = index / clampedSegmentCount;
    const sample = sampleConnectionGeometryAtFraction(geometry, fraction);
    if (!sample) {
      continue;
    }
    points.push(sample.point);
  }

  return points;
}

export function computeGeometryArrowheadPoints(
  geometry: ConnectionRenderGeometry,
  arrowLength: number = DEFAULT_ARROW_LENGTH,
  arrowWidth: number = DEFAULT_ARROW_WIDTH,
): Point[][] {
  if (geometry.kind === 'polyline') {
    return computeSegmentArrowheadPoints([...geometry.points], arrowLength, arrowWidth);
  }

  return DEFAULT_ARROW_FRACTIONS.flatMap((fraction) => {
    const sample = sampleConnectionGeometryAtFraction(geometry, fraction);
    if (!sample) {
      return [];
    }

    const tangentLength = Math.hypot(sample.tangent.x, sample.tangent.y);
    if (tangentLength === 0) {
      return [];
    }

    const ux = sample.tangent.x / tangentLength;
    const uy = sample.tangent.y / tangentLength;
    const px = -uy;
    const py = ux;
    const halfArrowLength = arrowLength / 2;
    const halfArrowWidth = arrowWidth / 2;
    const tip = {
      x: sample.point.x + (ux * halfArrowLength),
      y: sample.point.y + (uy * halfArrowLength),
    };
    const baseCenter = {
      x: sample.point.x - (ux * halfArrowLength),
      y: sample.point.y - (uy * halfArrowLength),
    };

    return [[
      tip,
      {
        x: baseCenter.x + (px * halfArrowWidth),
        y: baseCenter.y + (py * halfArrowWidth),
      },
      {
        x: baseCenter.x - (px * halfArrowWidth),
        y: baseCenter.y - (py * halfArrowWidth),
      },
    ]];
  });
}
