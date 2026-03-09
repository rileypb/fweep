import { describe, it, expect } from '@jest/globals';
import {
  getHandleOffset,
  getHandlePosition,
  getRoomCenter,
  getRoomPerimeterPointToward,
  getStubEndpoint,
  findRoomDirectionForConnection,
  computeConnectionPath,
  computeSegmentArrowheadPoints,
  createConnectionRenderGeometry,
  connectionGeometryToSvgPath,
  getConnectionGeometryLength,
  sampleConnectionGeometryAtFraction,
  computeGeometryArrowheadPoints,
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

function expectPointOnCenterRay(point: { x: number; y: number }, center: { x: number; y: number }, quadrant: 'northeast' | 'southeast' | 'southwest' | 'northwest'): void {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  expect(Math.abs(Math.abs(dx) - Math.abs(dy))).toBeCloseTo(0, 5);

  if (quadrant === 'northeast') {
    expect(dx).toBeGreaterThan(0);
    expect(dy).toBeLessThan(0);
  } else if (quadrant === 'southeast') {
    expect(dx).toBeGreaterThan(0);
    expect(dy).toBeGreaterThan(0);
  } else if (quadrant === 'southwest') {
    expect(dx).toBeLessThan(0);
    expect(dy).toBeGreaterThan(0);
  } else {
    expect(dx).toBeLessThan(0);
    expect(dy).toBeLessThan(0);
  }
}

describe('getHandleOffset', () => {
  it('returns local SVG coordinates for edge handles', () => {
    expect(getHandleOffset('north')).toEqual({ x: ROOM_WIDTH / 2, y: 0 });
    expect(getHandleOffset('east')).toEqual({ x: ROOM_WIDTH, y: ROOM_HEIGHT / 2 });
  });

  it('returns inset local SVG coordinates for corner handles', () => {
    expect(getHandleOffset('northwest')).toEqual({ x: 6, y: 6 });
    expect(getHandleOffset('southeast')).toEqual({ x: ROOM_WIDTH - 6, y: ROOM_HEIGHT - 6 });
  });

  it('uses diamond border intersections for diagonal handles', () => {
    const offset = getHandleOffset('northeast', { width: ROOM_WIDTH, height: ROOM_HEIGHT }, 'diamond');

    expect(offset).toEqual({ x: 60, y: 9 });
  });

  it('uses center-ray border intersections for oval diagonal handles', () => {
    const offset = getHandleOffset('northeast', { width: ROOM_WIDTH, height: ROOM_HEIGHT }, 'oval');

    expect(offset).toBeDefined();
    expectPointOnCenterRay(offset!, { x: ROOM_WIDTH / 2, y: ROOM_HEIGHT / 2 }, 'northeast');
  });

  it('places octagon handles at side centers', () => {
    const offset = getHandleOffset('northeast', { width: ROOM_WIDTH, height: ROOM_HEIGHT }, 'octagon');

    expect(offset?.x).toBeCloseTo(74, 2);
    expect(offset?.y).toBeCloseTo(5, 2);
  });

  it('supports pentagon, hexagon, house, and box handles', () => {
    const pentagonNorth = getHandleOffset('north', { width: ROOM_WIDTH, height: ROOM_HEIGHT }, 'pentagon');
    const hexagonEast = getHandleOffset('east', { width: ROOM_WIDTH, height: ROOM_HEIGHT }, 'hexagon');
    const houseNorth = getHandleOffset('north', { width: ROOM_WIDTH, height: ROOM_HEIGHT }, 'house');
    const boxEast = getHandleOffset('east', { width: ROOM_WIDTH, height: ROOM_HEIGHT }, 'box');

    expect(pentagonNorth?.x).toBeCloseTo(ROOM_WIDTH / 2, 1);
    expect(pentagonNorth?.y).toBeCloseTo(0, 1);
    expect(hexagonEast?.x).toBeCloseTo(ROOM_WIDTH, 1);
    expect(hexagonEast?.y).toBeCloseTo(ROOM_HEIGHT / 2, 1);
    expect(houseNorth?.x).toBeCloseTo(ROOM_WIDTH / 2, 1);
    expect(houseNorth?.y).toBeCloseTo(0, 1);
    expect(boxEast?.x).toBeGreaterThan(ROOM_WIDTH - 8);
    expect(boxEast?.y).toBeGreaterThan(ROOM_HEIGHT / 3);
  });

  it('uses sampled ellipse perimeter points for oval cardinal handles', () => {
    const north = getHandleOffset('north', { width: ROOM_WIDTH, height: ROOM_HEIGHT }, 'oval');
    const east = getHandleOffset('east', { width: ROOM_WIDTH, height: ROOM_HEIGHT }, 'oval');

    expect(north?.x).toBeCloseTo(40, 1);
    expect(north?.y).toBeCloseTo(0, 1);
    expect(east?.x).toBeCloseTo(80, 1);
    expect(east?.y).toBeCloseTo(18, 1);
  });

  it('returns undefined for unsupported directions on non-rectangular rooms', () => {
    expect(getHandleOffset('up', { width: ROOM_WIDTH, height: ROOM_HEIGHT }, 'oval')).toBeUndefined();
    expect(getHandleOffset('portal', { width: ROOM_WIDTH, height: ROOM_HEIGHT }, 'octagon')).toBeUndefined();
  });
});

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
    expect(getHandlePosition(pos, 'northeast')).toEqual({ x: 100 + ROOM_WIDTH - 6, y: 200 + 6 });
  });

  it('returns the southwest handle at bottom-left', () => {
    expect(getHandlePosition(pos, 'southwest')).toEqual({ x: 100 + 6, y: 200 + ROOM_HEIGHT - 6 });
  });

  it('returns undefined for non-compass directions like "up"', () => {
    expect(getHandlePosition(pos, 'up')).toBeUndefined();
  });

  it('returns undefined for unknown directions', () => {
    expect(getHandlePosition(pos, 'aft')).toBeUndefined();
  });

  it('uses the provided room dimensions when computing handle positions', () => {
    expect(getHandlePosition(pos, 'north', { width: 140, height: 40 })).toEqual({ x: 170, y: 200 });
    expect(getHandlePosition(pos, 'east', { width: 140, height: 40 })).toEqual({ x: 240, y: 220 });
  });

  it('uses the room shape when computing handle positions', () => {
    const handle = getHandlePosition(pos, 'northeast', { width: 80, height: 36 }, 'diamond');

    expect(handle).toEqual({ x: 160, y: 209 });
  });

  it('insets corner handles to match the rounded room border', () => {
    expect(getHandlePosition(pos, 'northwest')).toEqual({ x: 106, y: 206 });
    expect(getHandlePosition(pos, 'southeast')).toEqual({ x: 174, y: 230 });
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

describe('getRoomPerimeterPointToward', () => {
  it('returns the rectangle perimeter point in the direction of the target point', () => {
    expect(
      getRoomPerimeterPointToward({ x: 100, y: 200 }, { x: 500, y: 218 }),
    ).toEqual({ x: 180, y: 218 });
  });

  it('returns the room center when the target point is the center', () => {
    const center = getRoomCenter({ x: 100, y: 200 });

    expect(getRoomPerimeterPointToward({ x: 100, y: 200 }, center)).toEqual(center);
  });

  it('supports non-rectangular room shapes', () => {
    const point = getRoomPerimeterPointToward(
      { x: 100, y: 200 },
      { x: 500, y: 500 },
      { width: ROOM_WIDTH, height: ROOM_HEIGHT },
      'diamond',
    );

    expect(point.x).toBeGreaterThan(140);
    expect(point.y).toBeGreaterThan(218);
    expect(point.x).toBeLessThanOrEqual(180);
    expect(point.y).toBeLessThanOrEqual(236);
  });

  it('supports house and box room perimeters', () => {
    const housePoint = getRoomPerimeterPointToward(
      { x: 100, y: 200 },
      { x: 140, y: 120 },
      { width: ROOM_WIDTH, height: ROOM_HEIGHT },
      'house',
    );
    const boxPoint = getRoomPerimeterPointToward(
      { x: 100, y: 200 },
      { x: 240, y: 218 },
      { width: ROOM_WIDTH, height: ROOM_HEIGHT },
      'box',
    );

    expect(housePoint.y).toBeLessThanOrEqual(200);
    expect(boxPoint.x).toBeGreaterThan(170);
    expect(boxPoint.y).toBeGreaterThanOrEqual(208);
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

  it('normalizes shorthand non-compass aliases to compass handles', () => {
    const room = roomAt('A', 0, 0, { ne: 'conn-1' });
    expect(findRoomDirectionForConnection(room, 'conn-1')).toBe('northeast');
  });
});

describe('computeConnectionPath', () => {
  it('produces a 4-point polyline for a connection with both compass directions', () => {
    const connId = 'conn-1';
    const srcRoom = roomAt('A', 0, 200, { north: connId });
    const tgtRoom = roomAt('B', 0, 0, { south: connId });
    const conn: ReturnType<typeof createConnection> = {
      ...createConnection(srcRoom.id, tgtRoom.id, true),
      id: connId,
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
    const conn = { ...createConnection(srcRoom.id, tgtRoom.id, true), id: connId };

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
    const conn = { ...createConnection(srcRoom.id, tgtRoom.id, false), id: connId };

    const points = computeConnectionPath(srcRoom, tgtRoom, conn, 20);

    // Source handle + source stub + target center = 3 points
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual(getHandlePosition(srcRoom.position, 'east'));
    expect(points[2]).toEqual(getRoomCenter(tgtRoom.position));
  });

  it('draws a one-way connection to the target room center even when the target has a compass binding', () => {
    const connId = 'conn-1';
    const srcRoom = roomAt('A', 0, 200, { north: connId });
    const tgtRoom = roomAt('B', 0, 0, { east: connId });
    const conn = { ...createConnection(srcRoom.id, tgtRoom.id, false), id: connId };

    const points = computeConnectionPath(srcRoom, tgtRoom, conn, 20);

    expect(points).toHaveLength(3);
    expect(points[0]).toEqual(getHandlePosition(srcRoom.position, 'north'));
    expect(points[2]).toEqual(getRoomCenter(tgtRoom.position));
  });

  it('uses distinct source and target directions for a bidirectional self-connection', () => {
    const connId = 'conn-1';
    const room = roomAt('A', 80, 200, { north: connId, east: connId });
    const conn = { ...createConnection(room.id, room.id, true), id: connId };

    const points = computeConnectionPath(room, room, conn, 20);

    expect(points).toEqual([
      { x: 120, y: 200 },
      { x: 120, y: 180 },
      { x: 180, y: 218 },
      { x: 160, y: 218 },
    ]);
  });

  it('uses measured room widths when aiming at the top-center handle', () => {
    const connId = 'conn-1';
    const srcRoom = roomAt('Long Source', 100, 200, { north: connId });
    const tgtRoom = roomAt('Target', 100, 0, { south: connId });
    const conn = { ...createConnection(srcRoom.id, tgtRoom.id, true), id: connId };

    const points = computeConnectionPath(
      srcRoom,
      tgtRoom,
      conn,
      20,
      { width: 180, height: ROOM_HEIGHT },
      { width: ROOM_WIDTH, height: ROOM_HEIGHT },
    );

    expect(points[0]).toEqual({ x: 190, y: 200 });
    expect(points[3]).toEqual({ x: 140, y: 36 });
  });

  it('uses a radial center-to-handle vector for oval diagonal stubs', () => {
    const connId = 'conn-1';
    const srcRoom = { ...roomAt('Oval', 0, 200, { northeast: connId }), shape: 'oval' as const };
    const tgtRoom = roomAt('Target', 200, 0);
    const conn = { ...createConnection(srcRoom.id, tgtRoom.id, false), id: connId };

    const points = computeConnectionPath(srcRoom, tgtRoom, conn, 20);

    const dx = points[1].x - points[0].x;
    const dy = points[1].y - points[0].y;
    const center = getRoomCenter(srcRoom.position);
    const handleDx = points[0].x - center.x;
    const handleDy = points[0].y - center.y;

    expect(Math.hypot(dx, dy)).toBeCloseTo(20, 5);
    expect((dx * handleDy) - (dy * handleDx)).toBeCloseTo(0, 5);
    expect(dx).toBeGreaterThan(0);
    expect(points[1].y).toBeLessThan(points[0].y);
  });

  it('uses the octagon side normal for diagonal stubs', () => {
    const connId = 'conn-1';
    const srcRoom = { ...roomAt('Octagon', 0, 200, { northeast: connId }), shape: 'octagon' as const };
    const tgtRoom = roomAt('Target', 200, 0);
    const conn = { ...createConnection(srcRoom.id, tgtRoom.id, false), id: connId };

    const points = computeConnectionPath(srcRoom, tgtRoom, conn, 20);

    expect(points[1].x - points[0].x).toBeGreaterThan(12);
    expect(points[1].y - points[0].y).toBeLessThan(-12);
    expect(Math.abs((points[1].x - points[0].x) - -(points[1].y - points[0].y))).toBeGreaterThan(1);
  });

  it('uses sampled oval perimeter handles for cardinal bidirectional paths', () => {
    const connId = 'conn-oval-cardinal';
    const srcRoom = { ...roomAt('Oval A', 0, 200, { north: connId }), shape: 'oval' as const };
    const tgtRoom = { ...roomAt('Oval B', 0, 0, { south: connId }), shape: 'oval' as const };
    const conn = { ...createConnection(srcRoom.id, tgtRoom.id, true), id: connId };

    const points = computeConnectionPath(srcRoom, tgtRoom, conn, 20);

    expect(points[0].x).toBeCloseTo(40, 1);
    expect(points[0].y).toBeCloseTo(200, 1);
    expect(points[1].x).toBeCloseTo(40, 1);
    expect(points[1].y).toBeLessThan(points[0].y);
    expect(points[3].x).toBeCloseTo(40, 1);
    expect(points[3].y).toBeCloseTo(36, 1);
  });

  it('falls back to the room center when an unsupported direction is normalized into no visual handle', () => {
    const connId = 'conn-weird';
    const srcRoom = roomAt('A', 0, 200, { portal: connId });
    const tgtRoom = roomAt('B', 200, 200);
    const conn = { ...createConnection(srcRoom.id, tgtRoom.id, false), id: connId };

    const points = computeConnectionPath(srcRoom, tgtRoom, conn, 20);

    expect(points).toEqual([
      getRoomCenter(srcRoom.position),
      getRoomCenter(tgtRoom.position),
    ]);
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

  it('uses shape-aware stub vectors for octagon diagonal previews', () => {
    const room = { ...roomAt('Octagon', 0, 200), shape: 'octagon' as const };
    const points = computePreviewPath(room, 'northeast', 200, 0, 20);

    expect(points).toHaveLength(3);
    expect(points[1].x).toBeGreaterThan(points[0].x);
    expect(points[1].y).toBeLessThan(points[0].y);
  });
});

describe('computeSegmentArrowheadPoints', () => {
  it('places arrowheads at one-third and two-thirds of the last segment', () => {
    const pts = [
      { x: 120, y: 200 },
      { x: 120, y: 180 },
      { x: 120, y: 18 },
    ];

    const arrows = computeSegmentArrowheadPoints(pts, 12, 10);

    expect(arrows).toHaveLength(2);

    expect(arrows[0]).toEqual([
      { x: 120, y: 120 },
      { x: 125, y: 132 },
      { x: 115, y: 132 },
    ]);

    expect(arrows[1]).toEqual([
      { x: 120, y: 66 },
      { x: 125, y: 78 },
      { x: 115, y: 78 },
    ]);
  });

  it('returns an empty array when no non-zero segment exists', () => {
    expect(computeSegmentArrowheadPoints([{ x: 1, y: 1 }, { x: 1, y: 1 }])).toEqual([]);
  });

  it('uses the last non-zero segment when the polyline ends with repeated points', () => {
    const arrows = computeSegmentArrowheadPoints([
      { x: 0, y: 0 },
      { x: 30, y: 0 },
      { x: 30, y: 0 },
    ], 12, 10);

    expect(arrows).toEqual([
      [
        { x: 16, y: 0 },
        { x: 4, y: 5 },
        { x: 4, y: -5 },
      ],
      [
        { x: 26, y: 0 },
        { x: 14, y: 5 },
        { x: 14, y: -5 },
      ],
    ]);
  });
});

describe('pointsToSvgString', () => {
  it('converts points to SVG polyline format', () => {
    const pts = [{ x: 10, y: 20 }, { x: 30, y: 40 }, { x: 50, y: 60 }];
    expect(pointsToSvgString(pts)).toBe('10,20 30,40 50,60');
  });
});

describe('createConnectionRenderGeometry', () => {
  const polylinePoints = [
    { x: 0, y: 0 },
    { x: 10, y: 10 },
    { x: 20, y: 0 },
    { x: 30, y: 10 },
  ] as const;

  it('returns a polyline when bezier connections are disabled', () => {
    expect(createConnectionRenderGeometry(polylinePoints, true, false, false)).toEqual({
      kind: 'polyline',
      points: polylinePoints,
    });
  });

  it('returns a polyline for self-connections even when bezier connections are enabled', () => {
    expect(createConnectionRenderGeometry(polylinePoints, true, true, true)).toEqual({
      kind: 'polyline',
      points: polylinePoints,
    });
  });

  it('returns a cubic geometry for bidirectional paths with four points', () => {
    expect(createConnectionRenderGeometry(polylinePoints, true, true, false)).toEqual({
      kind: 'cubic',
      start: polylinePoints[0],
      control1: polylinePoints[1],
      control2: polylinePoints[2],
      end: polylinePoints[3],
    });
  });

  it('returns a quadratic geometry for one-way paths with at least three points', () => {
    expect(
      createConnectionRenderGeometry(polylinePoints.slice(0, 3), false, true, false),
    ).toEqual({
      kind: 'quadratic',
      start: polylinePoints[0],
      control: polylinePoints[1],
      end: polylinePoints[2],
    });
  });

  it('falls back to a polyline when there are too few points for a curve', () => {
    expect(
      createConnectionRenderGeometry(polylinePoints.slice(0, 2), false, true, false),
    ).toEqual({
      kind: 'polyline',
      points: polylinePoints.slice(0, 2),
    });
  });
});

describe('connectionGeometryToSvgPath', () => {
  it('returns an empty string for an empty polyline', () => {
    expect(connectionGeometryToSvgPath({ kind: 'polyline', points: [] })).toBe('');
  });

  it('serializes a polyline path', () => {
    expect(
      connectionGeometryToSvgPath({
        kind: 'polyline',
        points: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }],
      }),
    ).toBe('M 1 2 L 3 4 L 5 6');
  });

  it('serializes a quadratic path', () => {
    expect(
      connectionGeometryToSvgPath({
        kind: 'quadratic',
        start: { x: 1, y: 2 },
        control: { x: 3, y: 4 },
        end: { x: 5, y: 6 },
      }),
    ).toBe('M 1 2 Q 3 4 5 6');
  });

  it('serializes a cubic path', () => {
    expect(
      connectionGeometryToSvgPath({
        kind: 'cubic',
        start: { x: 1, y: 2 },
        control1: { x: 3, y: 4 },
        control2: { x: 5, y: 6 },
        end: { x: 7, y: 8 },
      }),
    ).toBe('M 1 2 C 3 4 5 6 7 8');
  });
});

describe('getConnectionGeometryLength', () => {
  it('returns the total length of a polyline', () => {
    expect(
      getConnectionGeometryLength({
        kind: 'polyline',
        points: [{ x: 0, y: 0 }, { x: 3, y: 4 }, { x: 6, y: 8 }],
      }),
    ).toBeCloseTo(10, 5);
  });

  it('returns a positive sampled length for a quadratic curve', () => {
    expect(
      getConnectionGeometryLength({
        kind: 'quadratic',
        start: { x: 0, y: 0 },
        control: { x: 10, y: 10 },
        end: { x: 20, y: 0 },
      }),
    ).toBeGreaterThan(20);
  });
});

describe('sampleConnectionGeometryAtFraction', () => {
  it('returns null for an empty polyline', () => {
    expect(sampleConnectionGeometryAtFraction({ kind: 'polyline', points: [] }, 0.5)).toBeNull();
  });

  it('returns the sole point for a one-point polyline', () => {
    expect(
      sampleConnectionGeometryAtFraction({ kind: 'polyline', points: [{ x: 4, y: 5 }] }, 0.5),
    ).toEqual({
      point: { x: 4, y: 5 },
      tangent: { x: 1, y: 0 },
    });
  });

  it('skips zero-length polyline segments and samples the remaining segment', () => {
    expect(
      sampleConnectionGeometryAtFraction({
        kind: 'polyline',
        points: [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 10, y: 0 }],
      }, 0.5),
    ).toEqual({
      point: { x: 5, y: 0 },
      tangent: { x: 10, y: 0 },
    });
  });

  it('returns the last point and tangent when sampling beyond the final non-zero segment', () => {
    expect(
      sampleConnectionGeometryAtFraction({
        kind: 'polyline',
        points: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 0 }],
      }, 1),
    ).toEqual({
      point: { x: 10, y: 0 },
      tangent: { x: 10, y: 0 },
    });
  });

  it('clamps curve fractions and samples quadratic geometry', () => {
    const sample = sampleConnectionGeometryAtFraction({
      kind: 'quadratic',
      start: { x: 0, y: 0 },
      control: { x: 10, y: 10 },
      end: { x: 20, y: 0 },
    }, 2);

    expect(sample?.point.x).toBeCloseTo(20, 3);
    expect(sample?.point.y).toBeCloseTo(0, 3);
    expect(sample?.tangent.x).toBeGreaterThan(0);
  });

  it('samples cubic geometry', () => {
    const sample = sampleConnectionGeometryAtFraction({
      kind: 'cubic',
      start: { x: 0, y: 0 },
      control1: { x: 0, y: 10 },
      control2: { x: 10, y: 10 },
      end: { x: 10, y: 0 },
    }, 0.5);

    expect(sample).not.toBeNull();
    expect(sample!.point.x).toBeGreaterThan(3);
    expect(sample!.point.x).toBeLessThan(7);
    expect(sample!.point.y).toBeGreaterThan(5);
  });
});

describe('computeGeometryArrowheadPoints', () => {
  it('delegates polyline geometry to segment arrowhead generation', () => {
    expect(
      computeGeometryArrowheadPoints({
        kind: 'polyline',
        points: [{ x: 0, y: 0 }, { x: 30, y: 0 }],
      }, 12, 10),
    ).toEqual([
      [
        { x: 16, y: 0 },
        { x: 4, y: 5 },
        { x: 4, y: -5 },
      ],
      [
        { x: 26, y: 0 },
        { x: 14, y: 5 },
        { x: 14, y: -5 },
      ],
    ]);
  });

  it('returns no arrowheads for a zero-length quadratic tangent', () => {
    expect(
      computeGeometryArrowheadPoints({
        kind: 'quadratic',
        start: { x: 0, y: 0 },
        control: { x: 0, y: 0 },
        end: { x: 0, y: 0 },
      }),
    ).toEqual([]);
  });

  it('returns two arrowheads for quadratic geometry', () => {
    const arrows = computeGeometryArrowheadPoints({
      kind: 'quadratic',
      start: { x: 0, y: 0 },
      control: { x: 10, y: 10 },
      end: { x: 20, y: 0 },
    });

    expect(arrows).toHaveLength(2);
    expect(arrows[0]).toHaveLength(3);
    expect(arrows[1]).toHaveLength(3);
  });

  it('returns two arrowheads for cubic geometry', () => {
    const arrows = computeGeometryArrowheadPoints({
      kind: 'cubic',
      start: { x: 0, y: 0 },
      control1: { x: 0, y: 10 },
      control2: { x: 10, y: 10 },
      end: { x: 10, y: 0 },
    });

    expect(arrows).toHaveLength(2);
    expect(arrows[0][0].y).toBeGreaterThan(0);
    expect(arrows[1][0].x).toBeGreaterThan(arrows[0][0].x);
  });
});
