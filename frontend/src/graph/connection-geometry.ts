import type { Room, Connection } from '../domain/map-types';
import { normalizeDirection } from '../domain/directions';

/* ---- Constants ---- */

/** Estimated room node dimensions (matches CSS .room-node min-width + padding). */
export const ROOM_WIDTH = 80;
export const ROOM_HEIGHT = 36;

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
const HANDLE_OFFSETS: Readonly<Record<string, { dx: number; dy: number }>> = {
  north:     { dx: ROOM_WIDTH / 2, dy: 0 },
  northeast: { dx: ROOM_WIDTH,     dy: 0 },
  east:      { dx: ROOM_WIDTH,     dy: ROOM_HEIGHT / 2 },
  southeast: { dx: ROOM_WIDTH,     dy: ROOM_HEIGHT },
  south:     { dx: ROOM_WIDTH / 2, dy: ROOM_HEIGHT },
  southwest: { dx: 0,              dy: ROOM_HEIGHT },
  west:      { dx: 0,              dy: ROOM_HEIGHT / 2 },
  northwest: { dx: 0,              dy: 0 },
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

/* ---- Public functions ---- */

/**
 * Return the absolute position of a compass direction handle for a room.
 * Returns `undefined` if the direction has no visual handle (e.g. "up", "down").
 */
export function getHandlePosition(roomPosition: Point, direction: string): Point | undefined {
  const offset = HANDLE_OFFSETS[direction];
  if (!offset) return undefined;
  return { x: roomPosition.x + offset.dx, y: roomPosition.y + offset.dy };
}

/** Return the center point of a room. */
export function getRoomCenter(roomPosition: Point): Point {
  return {
    x: roomPosition.x + ROOM_WIDTH / 2,
    y: roomPosition.y + ROOM_HEIGHT / 2,
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
    if (cid === connectionId && HANDLE_OFFSETS[dir] !== undefined) {
      directions.push(dir);
    }
  }

  // Check if there's a non-compass direction that normalizes to a compass one
  for (const [dir, cid] of Object.entries(room.directions)) {
    if (cid === connectionId) {
      const normalized = normalizeDirection(dir);
      if (HANDLE_OFFSETS[normalized] !== undefined && !directions.includes(normalized)) {
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
    ? getHandlePosition(srcRoom.position, srcDir)!
    : getRoomCenter(srcRoom.position);

  // Target endpoint
  const tgtEnd = tgtDir
    ? getHandlePosition(tgtRoom.position, tgtDir)!
    : getRoomCenter(tgtRoom.position);

  // Build points array
  const points: Point[] = [srcStart];

  // Source stub
  if (srcDir) {
    const stub = getStubEndpoint(srcStart, srcDir, stubLength);
    if (stub) points.push(stub);
  }

  // Target stub (in reverse — the stub extends outward from the target handle)
  if (tgtDir) {
    const stub = getStubEndpoint(tgtEnd, tgtDir, stubLength);
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
): Point[] {
  const handlePos = getHandlePosition(srcRoom.position, sourceDirection);
  if (!handlePos) {
    // Fallback to center
    const center = getRoomCenter(srcRoom.position);
    return [center, { x: cursorX, y: cursorY }];
  }

  const points: Point[] = [handlePos];

  const stub = getStubEndpoint(handlePos, sourceDirection, stubLength);
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
