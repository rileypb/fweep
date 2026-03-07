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
  for (const [dir, cid] of Object.entries(room.directions)) {
    if (cid === connectionId && HANDLE_OFFSETS[dir] !== undefined) {
      return dir;
    }
  }
  // Check if there's a non-compass direction that normalizes to a compass one
  for (const [dir, cid] of Object.entries(room.directions)) {
    if (cid === connectionId) {
      const normalized = normalizeDirection(dir);
      if (HANDLE_OFFSETS[normalized] !== undefined) {
        return normalized;
      }
    }
  }
  return undefined;
}

/**
 * Compute the polyline points for a connection between two rooms.
 *
 * The path is: sourceHandle → sourceStub → targetStub → targetHandle.
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
  const srcDir = findRoomDirectionForConnection(srcRoom, conn.id);
  const tgtDir = findRoomDirectionForConnection(tgtRoom, conn.id);

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

/** Convert an array of points to an SVG polyline `points` attribute string. */
export function pointsToSvgString(pts: Point[]): string {
  return pts.map((p) => `${p.x},${p.y}`).join(' ');
}
