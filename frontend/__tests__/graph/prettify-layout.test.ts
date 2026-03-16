import { describe, expect, it } from '@jest/globals';
import { addConnection, addPseudoRoom, addRoom, addStickyNote, addStickyNoteLink, setRoomPositions } from '../../src/domain/map-operations';
import { createConnection, createEmptyMap, createPseudoRoom, createRoom, createStickyNote, createStickyNoteLink } from '../../src/domain/map-types';
import type { MapDocument, Room } from '../../src/domain/map-types';
import {
  computePrettifiedLayoutPositions,
  computePrettifiedRoomPositions,
  PRETTIFY_GRID_SIZE,
  PRETTIFY_HORIZONTAL_SPACING,
} from '../../src/graph/prettify-layout';
import { STICKY_NOTE_WIDTH, getStickyNoteHeight } from '../../src/graph/sticky-note-geometry';

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
  it('returns no positions for an empty map', () => {
    expect(computePrettifiedRoomPositions(createEmptyMap('Empty'))).toEqual({});
  });

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

  it('treats a bidirectional up-down connection like a north-south constraint', () => {
    const { doc, roomA, roomB } = buildBaseDoc(['Cellar', 'Attic']);
    const connection = createConnection(roomA.id, roomB.id, true);
    const connectedDoc = addConnection(doc, connection, 'up', 'down');

    const positions = computePrettifiedRoomPositions(connectedDoc);

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

  it('uses fixed square room widths for square-classic prettify spacing', () => {
    let doc = createEmptyMap('Square Spacing');
    doc = {
      ...doc,
      view: {
        ...doc.view,
        visualStyle: 'square-classic',
      },
    };
    const longRoom = { ...createRoom('A Very Long Room Name That Should Not Push Things Outward'), position: { x: 0, y: 0 } };
    const shortRoom = { ...createRoom('B'), position: { x: 0, y: 0 } };
    doc = addRoom(addRoom(doc, longRoom), shortRoom);
    doc = addConnection(doc, createConnection(longRoom.id, shortRoom.id, true), 'east', 'west');

    const positions = computePrettifiedRoomPositions(doc);

    expect(positions[shortRoom.id].x - positions[longRoom.id].x).toBe(PRETTIFY_HORIZONTAL_SPACING);
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

  it('ignores unsupported directions when deriving layout constraints', () => {
    let doc = createEmptyMap('Unsupported Direction');
    const roomA = { ...createRoom('A'), position: { x: 0, y: 0 } };
    const roomB = { ...createRoom('B'), position: { x: 0, y: 0 } };
    doc = addRoom(addRoom(doc, roomA), roomB);

    const connection = createConnection(roomA.id, roomB.id, true);
    doc = addConnection(doc, connection, 'portal', 'portal');

    const positions = computePrettifiedRoomPositions(doc);

    expect(positions[roomA.id]).not.toEqual(positions[roomB.id]);
    expectSnappedToGrid(getRoomCenterX(roomA, positions[roomA.id].x));
    expectSnappedToGrid(getRoomCenterY(positions[roomA.id].y));
    expectSnappedToGrid(getRoomCenterX(roomB, positions[roomB.id].x));
    expectSnappedToGrid(getRoomCenterY(positions[roomB.id].y));
  });

  it('includes pseudo-rooms in directional prettify layout', () => {
    let doc = createEmptyMap('Pseudo Layout');
    const room = { ...createRoom('Room'), id: 'room-a', position: { x: 0, y: 0 } };
    const pseudoRoom = { ...createPseudoRoom('unknown'), id: 'pseudo-a', position: { x: 0, y: 0 } };
    doc = addRoom(doc, room);
    doc = addPseudoRoom(doc, pseudoRoom);
    doc = addConnection(doc, createConnection(room.id, { kind: 'pseudo-room', id: pseudoRoom.id }, false), 'east');

    const { roomPositions, pseudoRoomPositions } = computePrettifiedLayoutPositions(doc);

    expect(pseudoRoomPositions[pseudoRoom.id]).toBeDefined();
    expect(pseudoRoomPositions[pseudoRoom.id]).not.toEqual(pseudoRoom.position);
    expect(pseudoRoomPositions[pseudoRoom.id]).not.toEqual(roomPositions[room.id]);
    expectSnappedToGrid(getRoomCenterX(room, roomPositions[room.id].x));
    expectSnappedToGrid(getRoomCenterY(roomPositions[room.id].y));
    expectSnappedToGrid(pseudoRoomPositions[pseudoRoom.id].x + 40);
    expectSnappedToGrid(pseudoRoomPositions[pseudoRoom.id].y + 18);
  });

  it('falls back for disconnected rooms and separates overlapping preferred positions', () => {
    let doc = createEmptyMap('Disconnected');
    const roomA = { ...createRoom('A'), position: { x: 0, y: 0 } };
    const roomB = { ...createRoom('B'), position: { x: 0, y: 0 } };
    const roomC = { ...createRoom('C'), position: { x: 0, y: 0 } };
    doc = addRoom(addRoom(addRoom(doc, roomA), roomB), roomC);

    const positions = computePrettifiedRoomPositions(doc);
    const uniquePositions = new Set(
      Object.values(positions).map((position) => `${position.x},${position.y}`),
    );

    expect(uniquePositions.size).toBe(3);
    expect(positions[roomA.id]).not.toEqual(positions[roomB.id]);
    expect(positions[roomB.id]).not.toEqual(positions[roomC.id]);
  });

  it('ignores self-referential direction constraints during layout', () => {
    let doc = createEmptyMap('Self Constraint');
    const room = { ...createRoom('Solo'), position: { x: 80, y: 120 } };
    doc = addRoom(doc, room);
    doc = addConnection(doc, createConnection(room.id, room.id, true), 'north', 'south');

    const positions = computePrettifiedRoomPositions(doc);

    expect(Object.keys(positions)).toEqual([room.id]);
    expectSnappedToGrid(getRoomCenterX(room, positions[room.id].x));
    expectSnappedToGrid(getRoomCenterY(positions[room.id].y));
  });

  it('keeps locked rooms fixed while repositioning unlocked rooms', () => {
    let doc = createEmptyMap('Locked');
    const lockedRoom = { ...createRoom('Locked'), locked: true, position: { x: 400, y: 80 } };
    const freeRoom = { ...createRoom('Free'), position: { x: 0, y: 0 } };
    doc = addRoom(addRoom(doc, lockedRoom), freeRoom);
    doc = addConnection(doc, createConnection(lockedRoom.id, freeRoom.id, true), 'east', 'west');

    const positions = computePrettifiedRoomPositions(doc);

    expect(positions[lockedRoom.id]).toEqual(lockedRoom.position);
    expect(positions[freeRoom.id]).not.toEqual(freeRoom.position);
    expect(positions[freeRoom.id].x).toBeGreaterThan(positions[lockedRoom.id].x);
  });

  it('does not drift when prettified repeatedly for disconnected overlapping rooms', () => {
    let doc = createEmptyMap('Stable Repeat');
    const roomA = { ...createRoom('Alpha'), position: { x: 0, y: 0 } };
    const roomB = { ...createRoom('Beta'), position: { x: 0, y: 0 } };
    const roomC = { ...createRoom('Gamma'), position: { x: 0, y: 0 } };
    doc = addRoom(addRoom(addRoom(doc, roomA), roomB), roomC);

    const firstPositions = computePrettifiedRoomPositions(doc);
    let firstPassDoc = doc;
    firstPassDoc = setRoomPositions(firstPassDoc, firstPositions);

    const secondPositions = computePrettifiedRoomPositions(firstPassDoc);

    expect(secondPositions).toEqual(firstPositions);
  });

  it('moves a linked sticky note near its linked room without overlapping it', () => {
    let doc = createEmptyMap('Linked Note');
    const room = { ...createRoom('Kitchen'), position: { x: 200, y: 200 } };
    const stickyNote = { ...createStickyNote('Remember the lantern'), position: { x: 200, y: 200 } };
    doc = addRoom(doc, room);
    doc = addStickyNote(doc, stickyNote);
    doc = addStickyNoteLink(doc, createStickyNoteLink(stickyNote.id, room.id));

    const { roomPositions, stickyNotePositions } = computePrettifiedLayoutPositions(doc);
    const roomPosition = roomPositions[room.id];
    const stickyNotePosition = stickyNotePositions[stickyNote.id];

    expect(stickyNotePosition).toBeDefined();
    const stickyNoteLeft = stickyNotePosition.x;
    const stickyNoteRight = stickyNoteLeft + STICKY_NOTE_WIDTH;
    const stickyNoteTop = stickyNotePosition.y;
    const stickyNoteBottom = stickyNoteTop + getStickyNoteHeight(stickyNote.text);
    const roomLeft = roomPosition.x;
    const roomRight = roomLeft + estimateRoomWidth(room.name);
    const roomTop = roomPosition.y;
    const roomBottom = roomTop + 36;

    const overlapsHorizontally = stickyNoteLeft < roomRight && stickyNoteRight > roomLeft;
    const overlapsVertically = stickyNoteTop < roomBottom && stickyNoteBottom > roomTop;
    expect(overlapsHorizontally && overlapsVertically).toBe(false);
  });

  it('moves a linked sticky note near its linked pseudo-room without overlapping it', () => {
    let doc = createEmptyMap('Linked Pseudo Note');
    const room = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
    const pseudoRoom = { ...createPseudoRoom('unknown'), position: { x: 260, y: 200 } };
    const stickyNote = { ...createStickyNote('What does this mean?'), position: { x: 20, y: 20 } };
    doc = addRoom(doc, room);
    doc = addPseudoRoom(doc, pseudoRoom);
    doc = addConnection(doc, createConnection(room.id, { kind: 'pseudo-room', id: pseudoRoom.id }, false), 'east');
    doc = addStickyNote(doc, stickyNote);
    doc = addStickyNoteLink(doc, createStickyNoteLink(stickyNote.id, { kind: 'pseudo-room', id: pseudoRoom.id }));

    const { pseudoRoomPositions, stickyNotePositions } = computePrettifiedLayoutPositions(doc);
    const pseudoRoomPosition = pseudoRoomPositions[pseudoRoom.id];
    const stickyNotePosition = stickyNotePositions[stickyNote.id];

    expect(stickyNotePosition).toBeDefined();
    expect(pseudoRoomPosition).toBeDefined();
    expect(stickyNotePosition).not.toEqual(stickyNote.position);

    const stickyNoteLeft = stickyNotePosition.x;
    const stickyNoteRight = stickyNoteLeft + STICKY_NOTE_WIDTH;
    const stickyNoteTop = stickyNotePosition.y;
    const stickyNoteBottom = stickyNoteTop + getStickyNoteHeight(stickyNote.text);
    const pseudoRoomLeft = pseudoRoomPosition.x;
    const pseudoRoomRight = pseudoRoomLeft + 80;
    const pseudoRoomTop = pseudoRoomPosition.y;
    const pseudoRoomBottom = pseudoRoomTop + 36;

    const overlapsHorizontally = stickyNoteLeft < pseudoRoomRight && stickyNoteRight > pseudoRoomLeft;
    const overlapsVertically = stickyNoteTop < pseudoRoomBottom && stickyNoteBottom > pseudoRoomTop;
    expect(overlapsHorizontally && overlapsVertically).toBe(false);

    const initialDistance = Math.hypot(stickyNote.position.x - pseudoRoomPosition.x, stickyNote.position.y - pseudoRoomPosition.y);
    const finalDistance = Math.hypot(stickyNotePosition.x - pseudoRoomPosition.x, stickyNotePosition.y - pseudoRoomPosition.y);
    expect(finalDistance).toBeLessThan(initialDistance);
  });

  it('separates overlapping sticky notes during prettify', () => {
    let doc = createEmptyMap('Overlapping Notes');
    const room = { ...createRoom('Anchor'), position: { x: 320, y: 200 } };
    const stickyNoteA = { ...createStickyNote('First'), position: { x: 320, y: 200 } };
    const stickyNoteB = { ...createStickyNote('Second'), position: { x: 320, y: 200 } };
    doc = addRoom(doc, room);
    doc = addStickyNote(addStickyNote(doc, stickyNoteA), stickyNoteB);

    const { stickyNotePositions } = computePrettifiedLayoutPositions(doc);

    expect(stickyNotePositions[stickyNoteA.id]).not.toEqual(stickyNotePositions[stickyNoteB.id]);
  });
});
