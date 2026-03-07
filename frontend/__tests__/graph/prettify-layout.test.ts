import { describe, expect, it } from '@jest/globals';
import { addConnection, addRoom } from '../../src/domain/map-operations';
import { createConnection, createEmptyMap, createRoom } from '../../src/domain/map-types';
import type { MapDocument, Room } from '../../src/domain/map-types';
import { computePrettifiedRoomPositions, PRETTIFY_GRID_SIZE } from '../../src/graph/prettify-layout';

function expectSnappedToGrid(value: number): void {
  expect(Number.isInteger(value / PRETTIFY_GRID_SIZE)).toBe(true);
}

function estimateRoomWidth(name: string): number {
  return Math.max(80, Math.round((name.length * 6.78) + 24));
}

function getRoomCenterX(room: Room, x: number): number {
  return x + (estimateRoomWidth(room.name) / 2);
}

function getRoomCenterY(y: number): number {
  return y + 18;
}

function createTwoWayConnectionDoc(): { doc: MapDocument; roomA: Room; roomB: Room } {
  const { doc, roomA, roomB } = buildBaseDoc(['Room A', 'Room B']);
  const connection = createConnection(roomA.id, roomB.id, true);

  return {
    doc: addConnection(doc, connection, 'north', 'south'),
    roomA,
    roomB,
  };
}

function buildBaseDoc(names: readonly string[]): { doc: MapDocument; roomA: Room; roomB: Room } {
  let doc = createEmptyMap('Layout Test');
  const rooms = names.map((name, index) => ({
    key: `room${String.fromCharCode(65 + index)}`,
    room: {
      ...createRoom(name),
      position: { x: index * 40, y: index * 40 },
    },
  }));

  for (const { room } of rooms) {
    doc = addRoom(doc, room);
  }

  return {
    doc,
    roomA: rooms[0].room,
    roomB: rooms[1].room,
  };
}

describe('computePrettifiedRoomPositions', () => {
  it('places a bidirectional north-south connection on the same x-axis with the target above the source', () => {
    const { doc, roomA, roomB } = createTwoWayConnectionDoc();

    const positions = computePrettifiedRoomPositions(doc);

    expect(positions[roomB.id].x).toBe(positions[roomA.id].x);
    expect(positions[roomB.id].y).toBeLessThan(positions[roomA.id].y);
    expectSnappedToGrid(getRoomCenterX(roomA, positions[roomA.id].x));
    expectSnappedToGrid(getRoomCenterY(positions[roomA.id].y));
    expectSnappedToGrid(getRoomCenterX(roomB, positions[roomB.id].x));
    expectSnappedToGrid(getRoomCenterY(positions[roomB.id].y));
  });

  it('keeps an orthogonal chain aligned after relaxation', () => {
    let doc = createEmptyMap('Chain');
    const roomA = { ...createRoom('A'), position: { x: 400, y: 120 } };
    const roomB = { ...createRoom('B'), position: { x: 0, y: 0 } };
    const roomC = { ...createRoom('C'), position: { x: 80, y: 280 } };
    doc = addRoom(addRoom(addRoom(doc, roomA), roomB), roomC);

    const connectionAB = createConnection(roomA.id, roomB.id, true);
    doc = addConnection(doc, connectionAB, 'north', 'south');

    const connectionBC = createConnection(roomB.id, roomC.id, true);
    doc = addConnection(doc, connectionBC, 'east', 'west');

    const positions = computePrettifiedRoomPositions(doc);

    expect(positions[roomB.id].x).toBe(positions[roomA.id].x);
    expect(positions[roomB.id].y).toBeLessThan(positions[roomA.id].y);
    expect(positions[roomC.id].y).toBe(positions[roomB.id].y);
    expect(positions[roomC.id].x).toBeGreaterThan(positions[roomB.id].x);
  });

  it('aligns room centers even when names have different widths', () => {
    let doc = createEmptyMap('Mixed Widths');
    const shortRoom = { ...createRoom('A'), position: { x: 0, y: 320 } };
    const longRoom = { ...createRoom('A Very Long Room Name'), position: { x: 320, y: 40 } };
    doc = addRoom(addRoom(doc, shortRoom), longRoom);
    doc = addConnection(doc, createConnection(shortRoom.id, longRoom.id, true), 'north', 'south');

    const positions = computePrettifiedRoomPositions(doc);

    expect(getRoomCenterX(shortRoom, positions[shortRoom.id].x)).toBe(
      getRoomCenterX(longRoom, positions[longRoom.id].x),
    );
    expect(positions[longRoom.id].y).toBeLessThan(positions[shortRoom.id].y);
  });

  it('keeps rooms on unique snapped positions for a cyclic layout', () => {
    let doc = createEmptyMap('Cycle');
    const roomA = createRoom('A');
    const roomB = createRoom('B');
    const roomC = createRoom('C');
    const roomD = createRoom('D');
    doc = addRoom(addRoom(addRoom(addRoom(doc, roomA), roomB), roomC), roomD);

    doc = addConnection(doc, createConnection(roomA.id, roomB.id, true), 'east', 'west');
    doc = addConnection(doc, createConnection(roomB.id, roomD.id, true), 'north', 'south');
    doc = addConnection(doc, createConnection(roomA.id, roomC.id, true), 'north', 'south');
    doc = addConnection(doc, createConnection(roomC.id, roomD.id, true), 'east', 'west');

    const positions = computePrettifiedRoomPositions(doc);
    const uniquePositions = new Set(
      Object.values(positions).map((position) => `${position.x},${position.y}`),
    );

    expect(uniquePositions.size).toBe(4);
  });
});
