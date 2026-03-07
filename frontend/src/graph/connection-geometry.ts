import type { Room, Connection, RoomShape } from '../domain/map-types';
import { normalizeDirection } from '../domain/directions';

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

function getOctagonVertices(roomDimensions: RoomDimensions): Point[] {
  const insetX = Math.min(12, roomDimensions.width * 0.18);
  const insetY = Math.min(10, roomDimensions.height * 0.28);

  return [
    { x: insetX, y: 0 },
    { x: roomDimensions.width - insetX, y: 0 },
    { x: roomDimensions.width, y: insetY },
    { x: roomDimensions.width, y: roomDimensions.height - insetY },
    { x: roomDimensions.width - insetX, y: roomDimensions.height },
    { x: insetX, y: roomDimensions.height },
    { x: 0, y: roomDimensions.height - insetY },
    { x: 0, y: insetY },
  ];
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
    return getEllipsePerimeterHandlePoints(roomDimensions)[directionIndex];
  }

  if (roomShape === 'octagon') {
    return getPolygonEdgeCenters(getOctagonVertices(roomDimensions))[directionIndex];
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
    const rx = roomDimensions.width / 2;
    const ry = roomDimensions.height / 2;
    const cx = rx;
    const cy = ry;
    return normalizeVector({
      x: (handleOffset.x - cx) / (rx * rx),
      y: (handleOffset.y - cy) / (ry * ry),
    });
  }

  if (roomShape === 'octagon') {
    return getPolygonEdgeOutwardNormals(getOctagonVertices(roomDimensions))[directionIndex];
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
 * Find the first compass direction in a room's direction map that references a
 * given connection ID.  Returns `undefined` if no compass binding is found.
 */
export function findRoomDirectionForConnection(room: Room, connectionId: string): string | undefined {
  return findRoomDirectionsForConnection(room, connectionId)[0];
}

/**
 * Find all distinct compass directions in a room that reference a given
 * connection ID, preserving insertion order.
 */
function findRoomDirectionsForConnection(room: Room, connectionId: string): string[] {
  const directions: string[] = [];

  for (const [dir, cid] of Object.entries(room.directions)) {
    if (cid === connectionId && HANDLE_OFFSET_FACTORS[dir] !== undefined) {
      directions.push(dir);
    }
  }

  // Check if there's a non-compass direction that normalizes to a compass one
  for (const [dir, cid] of Object.entries(room.directions)) {
    if (cid === connectionId) {
      const normalized = normalizeDirection(dir);
      if (HANDLE_OFFSET_FACTORS[normalized] !== undefined && !directions.includes(normalized)) {
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
  const isSelfConnection = conn.sourceRoomId === conn.targetRoomId;
  const srcDirections = findRoomDirectionsForConnection(srcRoom, conn.id);
  const srcDir = srcDirections[0];
  const isOneWayBetweenDifferentRooms = !conn.isBidirectional && conn.sourceRoomId !== conn.targetRoomId;
  const tgtDir = isOneWayBetweenDifferentRooms
    ? undefined
    : isSelfConnection && conn.isBidirectional
      ? srcDirections[1]
      : findRoomDirectionForConnection(tgtRoom, conn.id);

  // Source endpoint
  const srcStart = srcDir
    ? getHandlePosition(srcRoom.position, srcDir, srcRoomDimensions, srcRoom.shape)!
    : getRoomCenter(srcRoom.position, srcRoomDimensions);

  // Target endpoint
  const tgtEnd = tgtDir
    ? getHandlePosition(tgtRoom.position, tgtDir, tgtRoomDimensions, tgtRoom.shape)!
    : getRoomCenter(tgtRoom.position, tgtRoomDimensions);

  // Build points array
  const points: Point[] = [srcStart];

  // Source stub
  if (srcDir) {
    const stub = getStubEndpointForRoom(srcStart, srcDir, stubLength, srcRoomDimensions, srcRoom.shape);
    if (stub) points.push(stub);
  }

  // Target stub (in reverse — the stub extends outward from the target handle)
  if (tgtDir) {
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
export function pointsToSvgString(pts: Point[]): string {
  return pts.map((p) => `${p.x},${p.y}`).join(' ');
}
