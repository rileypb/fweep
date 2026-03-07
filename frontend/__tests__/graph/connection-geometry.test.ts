import { describe, it, expect } from '@jest/globals';
import {
  getHandlePosition,
  getRoomCenter,
  getStubEndpoint,
  findRoomDirectionForConnection,
  computeConnectionPath,
  computePreviewPath,
  pointsToSvgString,
  ROOM_WIDTH,
  ROOM_HEIGHT,
  DEFAULT_STUB_LENGTH,
} from '../../src/graph/connection-geometry';
import { createRoom, createConnection } from '../../src/domain/map-types';
import type { Room } from '../../src/domain/map-types';

function roomAt(name: string, x: number, y: number, directions: Record<string, string> = {}): Room {
  return { ...createRoom(name), position: { x, y }, directions };
}

describe('getHandlePosition', () => {
  const pos = { x: 100, y: 200 };

  it('returns the north handle at top-center', () => {
    expect(getHandlePosition(pos, 'north')).toEqual({ x: 100 + ROOM_WIDTH / 2, y: 200 });
  });

  it('returns the east handle at right-center', () => {
    expect(getHandlePosition(pos, 'east')).toEqual({ x: 100 + ROOM_WIDTH, y: 200 + ROOM_HEIGHT / 2 });
  });

  it('returns the south handle at bottom-center', () => {
    expect(getHandlePosition(pos, 'south')).toEqual({ x: 100 + ROOM_WIDTH / 2, y: 200 + ROOM_HEIGHT });
  });

  it('returns the west handle at left-center', () => {
    expect(getHandlePosition(pos, 'west')).toEqual({ x: 100, y: 200 + ROOM_HEIGHT / 2 });
  });

  it('returns the northeast handle at top-right', () => {
    expect(getHandlePosition(pos, 'northeast')).toEqual({ x: 100 + ROOM_WIDTH, y: 200 });
  });

  it('returns the southwest handle at bottom-left', () => {
    expect(getHandlePosition(pos, 'southwest')).toEqual({ x: 100, y: 200 + ROOM_HEIGHT });
  });

  it('returns undefined for non-compass directions like "up"', () => {
    expect(getHandlePosition(pos, 'up')).toBeUndefined();
  });

  it('returns undefined for unknown directions', () => {
    expect(getHandlePosition(pos, 'aft')).toBeUndefined();
  });
});

describe('getRoomCenter', () => {
  it('returns the center of the room', () => {
    expect(getRoomCenter({ x: 100, y: 200 })).toEqual({
      x: 100 + ROOM_WIDTH / 2,
      y: 200 + ROOM_HEIGHT / 2,
    });
  });
});

describe('getStubEndpoint', () => {
  it('extends north (upward)', () => {
    const handle = { x: 140, y: 200 };
    const stub = getStubEndpoint(handle, 'north', 20);
    expect(stub).toEqual({ x: 140, y: 180 });
  });

  it('extends south (downward)', () => {
    const handle = { x: 140, y: 236 };
    const stub = getStubEndpoint(handle, 'south', 20);
    expect(stub).toEqual({ x: 140, y: 256 });
  });

  it('extends east (rightward)', () => {
    const handle = { x: 180, y: 218 };
    const stub = getStubEndpoint(handle, 'east', 20);
    expect(stub).toEqual({ x: 200, y: 218 });
  });

  it('extends diagonally northeast with consistent length', () => {
    const handle = { x: 180, y: 200 };
    const stub = getStubEndpoint(handle, 'northeast', 20)!;
    // Distance should be 20
    const dx = stub.x - handle.x;
    const dy = stub.y - handle.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    expect(dist).toBeCloseTo(20, 5);
    // Should go right and up
    expect(dx).toBeGreaterThan(0);
    expect(dy).toBeLessThan(0);
  });

  it('returns undefined for non-compass directions', () => {
    expect(getStubEndpoint({ x: 0, y: 0 }, 'up', 20)).toBeUndefined();
  });

  it('uses default stub length when not specified', () => {
    const handle = { x: 140, y: 200 };
    const stub = getStubEndpoint(handle, 'north');
    expect(stub).toEqual({ x: 140, y: 200 - DEFAULT_STUB_LENGTH });
  });
});

describe('findRoomDirectionForConnection', () => {
  it('finds a compass direction bound to a connection', () => {
    const room = roomAt('A', 0, 0, { north: 'conn-1', east: 'conn-2' });
    expect(findRoomDirectionForConnection(room, 'conn-1')).toBe('north');
    expect(findRoomDirectionForConnection(room, 'conn-2')).toBe('east');
  });

  it('returns undefined when the connection is not bound', () => {
    const room = roomAt('A', 0, 0, { north: 'conn-1' });
    expect(findRoomDirectionForConnection(room, 'conn-99')).toBeUndefined();
  });

  it('returns undefined when the room has no directions', () => {
    const room = roomAt('A', 0, 0);
    expect(findRoomDirectionForConnection(room, 'conn-1')).toBeUndefined();
  });
});

describe('computeConnectionPath', () => {
  it('produces a 4-point polyline for a connection with both compass directions', () => {
    const connId = 'conn-1';
    const srcRoom = roomAt('A', 0, 200, { north: connId });
    const tgtRoom = roomAt('B', 0, 0, { south: connId });
    const conn: ReturnType<typeof createConnection> = {
      id: connId,
      sourceRoomId: srcRoom.id,
      targetRoomId: tgtRoom.id,
      isBidirectional: true,
    };

    const points = computeConnectionPath(srcRoom, tgtRoom, conn, 20);

    expect(points).toHaveLength(4);
    // First point: source north handle
    expect(points[0]).toEqual(getHandlePosition(srcRoom.position, 'north'));
    // Last point: target south handle
    expect(points[3]).toEqual(getHandlePosition(tgtRoom.position, 'south'));
    // Second point: stub going north (up) from source handle
    expect(points[1].x).toEqual(points[0].x);
    expect(points[1].y).toBeLessThan(points[0].y);
    // Third point: stub going south (down) from target handle
    expect(points[2].x).toEqual(points[3].x);
    expect(points[2].y).toBeGreaterThan(points[3].y);
  });

  it('falls back to room center when direction has no compass handle', () => {
    const connId = 'conn-1';
    const srcRoom = roomAt('A', 0, 200, { up: connId });
    const tgtRoom = roomAt('B', 0, 0, { down: connId });
    const conn = { id: connId, sourceRoomId: srcRoom.id, targetRoomId: tgtRoom.id, isBidirectional: true };

    const points = computeConnectionPath(srcRoom, tgtRoom, conn, 20);

    // No handles, so both fallback to center, no stubs ⇒ 2 points
    expect(points).toHaveLength(2);
    expect(points[0]).toEqual(getRoomCenter(srcRoom.position));
    expect(points[1]).toEqual(getRoomCenter(tgtRoom.position));
  });

  it('handles a connection with only source compass direction', () => {
    const connId = 'conn-1';
    const srcRoom = roomAt('A', 0, 200, { east: connId });
    const tgtRoom = roomAt('B', 200, 200); // no binding for this connection
    const conn = { id: connId, sourceRoomId: srcRoom.id, targetRoomId: tgtRoom.id, isBidirectional: false };

    const points = computeConnectionPath(srcRoom, tgtRoom, conn, 20);

    // Source handle + source stub + target center = 3 points
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual(getHandlePosition(srcRoom.position, 'east'));
    expect(points[2]).toEqual(getRoomCenter(tgtRoom.position));
  });
});

describe('computePreviewPath', () => {
  it('produces handle → stub → cursor for a compass direction', () => {
    const room = roomAt('A', 0, 200);
    const points = computePreviewPath(room, 'north', 40, 50, 20);

    expect(points).toHaveLength(3);
    expect(points[0]).toEqual(getHandlePosition(room.position, 'north'));
    // Stub goes up from handle
    expect(points[1].y).toBeLessThan(points[0].y);
    // Last point is cursor
    expect(points[2]).toEqual({ x: 40, y: 50 });
  });

  it('falls back to center → cursor for non-compass', () => {
    const room = roomAt('A', 0, 200);
    const points = computePreviewPath(room, 'up', 40, 50, 20);

    expect(points).toHaveLength(2);
    expect(points[0]).toEqual(getRoomCenter(room.position));
    expect(points[1]).toEqual({ x: 40, y: 50 });
  });
});

describe('pointsToSvgString', () => {
  it('converts points to SVG polyline format', () => {
    const pts = [{ x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 60 }];
    expect(pointsToSvgString(pts)).toBe('10,20 30,40 50,60');
  });
});
