import { describe, expect, it } from '@jest/globals';
import { addConnection, addPseudoRoom, addRoom, addStickyNote, addStickyNoteLink, setRoomPositions } from '../../src/domain/map-operations';
import { createConnection, createEmptyMap, createPseudoRoom, createRoom, createStickyNote, createStickyNoteLink } from '../../src/domain/map-types';
import type { MapDocument, Room } from '../../src/domain/map-types';
import {
  computePrettifiedLayoutPositions,
  computePrettifiedRoomPositions,
  getConnectedComponentBounds,
  pickMostStablePrettifiedLayout,
  PRETTIFY_GRID_SIZE,
  PRETTIFY_HORIZONTAL_SPACING,
  PRETTIFY_VERTICAL_SPACING,
  TEST_ONLY_PRETTIFY_LAYOUT,
} from '../../src/graph/prettify-layout';
import { getRoomNodeDimensions } from '../../src/graph/room-label-geometry';
import { STICKY_NOTE_WIDTH, getStickyNoteHeight } from '../../src/graph/sticky-note-geometry';

function expectSnappedToGrid(value: number): void {
  expect(Number.isInteger(value / PRETTIFY_GRID_SIZE)).toBe(true);
}

function estimateRoomWidth(name: string): number {
  return getRoomNodeDimensions(createRoom(name), 'default').width;
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
  it('prefers the repeated prettify layout that moves the least from the current layout', () => {
    const currentRoomPositions = {
      'room-a': { x: 0, y: 0 },
      'room-b': { x: 200, y: 0 },
    };
    const candidates = [
      {
        roomPositions: {
          'room-a': { x: 40, y: 0 },
          'room-b': { x: 240, y: 0 },
        },
        pseudoRoomPositions: {},
        stickyNotePositions: {},
      },
      {
        roomPositions: {
          'room-a': { x: 20, y: 0 },
          'room-b': { x: 220, y: 0 },
        },
        pseudoRoomPositions: {},
        stickyNotePositions: {},
      },
    ] as const;

    expect(pickMostStablePrettifiedLayout(candidates, currentRoomPositions, {})).toEqual(candidates[1]);
  });

  it('falls back to the current layout when no stable candidate layouts repeat', () => {
    const currentRoomPositions = {
      'room-a': { x: 40, y: 80 },
    };
    const currentPseudoRoomPositions = {
      'pseudo-a': { x: 140, y: 80 },
    };
    const currentStickyNotePositions = {
      'note-a': { x: 220, y: 120 },
    };

    expect(
      pickMostStablePrettifiedLayout([], currentRoomPositions, currentPseudoRoomPositions, currentStickyNotePositions),
    ).toEqual({
      roomPositions: currentRoomPositions,
      pseudoRoomPositions: currentPseudoRoomPositions,
      stickyNotePositions: currentStickyNotePositions,
    });
  });

  it('returns no positions for an empty map', () => {
    expect(computePrettifiedRoomPositions(createEmptyMap('Empty'))).toEqual({});
  });

  it('places a bidirectional north-south connection on the same x-axis with the target above the source', () => {
    const { doc: initialDoc, roomA, roomB } = createTwoWayConnectionDoc();
    let doc = initialDoc;
    doc = {
      ...doc,
      view: {
        ...doc.view,
        visualStyle: 'default',
      },
    };

    const positions = computePrettifiedRoomPositions(doc);

    expect(positions[roomB.id].x).toBe(positions[roomA.id].x);
    expect(positions[roomB.id].y).toBeLessThan(positions[roomA.id].y);
    expectSnappedToGrid(getRoomCenterX(roomA, positions[roomA.id].x));
    expectSnappedToGrid(getRoomCenterY(positions[roomA.id].y));
    expectSnappedToGrid(getRoomCenterX(roomB, positions[roomB.id].x));
    expectSnappedToGrid(getRoomCenterY(positions[roomB.id].y));
  });

  it('does not create preferred-direction constraints for up/down exits', () => {
    let doc = createEmptyMap('Vertical Freedom');
    const foyer = { ...createRoom('Foyer'), id: 'foyer', position: { x: 0, y: 0 } };
    const garden = { ...createRoom('Garden'), id: 'garden', position: { x: 0, y: 0 } };
    const cellar = { ...createRoom('Cellar'), id: 'cellar', position: { x: 0, y: 0 } };
    doc = addRoom(addRoom(addRoom(doc, foyer), garden), cellar);
    doc = addConnection(doc, createConnection(foyer.id, garden.id, true), 'south', 'north');
    doc = addConnection(doc, createConnection(foyer.id, cellar.id, true), 'down', 'up');

    expect(TEST_ONLY_PRETTIFY_LAYOUT.deriveDirectionConstraints(doc)).toEqual([
      {
        fromRoomId: foyer.id,
        toRoomId: garden.id,
        delta: { x: 0, y: PRETTIFY_VERTICAL_SPACING },
      },
      {
        fromRoomId: garden.id,
        toRoomId: foyer.id,
        delta: { x: 0, y: -PRETTIFY_VERTICAL_SPACING },
      },
    ]);
  });

  it('creates proximity constraints for up/down exits without assigning them compass placement', () => {
    let doc = createEmptyMap('Vertical Proximity');
    const foyer = { ...createRoom('Foyer'), id: 'foyer', position: { x: 0, y: 0 } };
    const cellar = { ...createRoom('Cellar'), id: 'cellar', position: { x: 0, y: 0 } };
    doc = addRoom(addRoom(doc, foyer), cellar);
    doc = addConnection(doc, createConnection(foyer.id, cellar.id, true), 'down', 'up');

    expect(TEST_ONLY_PRETTIFY_LAYOUT.deriveVerticalProximityConstraints(doc)).toEqual([
      {
        fromRoomId: foyer.id,
        toRoomId: cellar.id,
        delta: { x: 0, y: 0 },
        springMultiplier: 0.45,
      },
      {
        fromRoomId: cellar.id,
        toRoomId: foyer.id,
        delta: { x: 0, y: 0 },
        springMultiplier: 0.45,
      },
    ]);
  });

  it('does not use up/down exits to connect layout components', () => {
    let doc = createEmptyMap('Vertical Component Split');
    const foyer = { ...createRoom('Foyer'), id: 'foyer', position: { x: 0, y: 0 } };
    const garden = { ...createRoom('Garden'), id: 'garden', position: { x: 0, y: 0 } };
    const cellar = { ...createRoom('Cellar'), id: 'cellar', position: { x: 0, y: 0 } };
    doc = addRoom(addRoom(addRoom(doc, foyer), garden), cellar);
    doc = addConnection(doc, createConnection(foyer.id, garden.id, true), 'south', 'north');
    doc = addConnection(doc, createConnection(foyer.id, cellar.id, true), 'down', 'up');

    expect(TEST_ONLY_PRETTIFY_LAYOUT.deriveConnectionConnectivityConstraints(doc)).toEqual([
      {
        fromRoomId: foyer.id,
        toRoomId: garden.id,
        delta: { x: 0, y: 0 },
      },
      {
        fromRoomId: garden.id,
        toRoomId: foyer.id,
        delta: { x: 0, y: 0 },
      },
    ]);
  });

  it('still places rooms connected only by up/down on distinct positions', () => {
    const { doc, roomA, roomB } = buildBaseDoc(['Cellar', 'Attic']);
    const connection = createConnection(roomA.id, roomB.id, true);
    const connectedDoc = addConnection(doc, connection, 'up', 'down');

    const positions = computePrettifiedRoomPositions(connectedDoc);

    expect(positions[roomA.id]).not.toEqual(positions[roomB.id]);
  });

  it('keeps up/down-connected rooms near their anchor room without forcing north-south placement', () => {
    let doc = createEmptyMap('Vertical Nearby');
    const quire = { ...createRoom('Quire'), id: 'quire', position: { x: 400, y: 240 } };
    const nightStairs = { ...createRoom('Night Stairs'), id: 'night-stairs', position: { x: 440, y: 260 } };
    const sanctuary = { ...createRoom('Sanctuary'), id: 'sanctuary', position: { x: 600, y: 240 } };
    doc = addRoom(addRoom(addRoom(doc, quire), nightStairs), sanctuary);
    doc = addConnection(doc, createConnection(quire.id, sanctuary.id, true), 'east', 'west');
    doc = addConnection(doc, createConnection(quire.id, nightStairs.id, true), 'up', 'down');

    const positions = computePrettifiedRoomPositions(doc);
    const quireCenterX = getRoomCenterX(quire, positions[quire.id].x);
    const quireCenterY = getRoomCenterY(positions[quire.id].y);
    const nightStairsCenterX = getRoomCenterX(nightStairs, positions[nightStairs.id].x);
    const nightStairsCenterY = getRoomCenterY(positions[nightStairs.id].y);
    const sanctuaryCenterX = getRoomCenterX(sanctuary, positions[sanctuary.id].x);
    const sanctuaryCenterY = getRoomCenterY(positions[sanctuary.id].y);

    const nightStairsDistanceToQuire = Math.hypot(nightStairsCenterX - quireCenterX, nightStairsCenterY - quireCenterY);
    const nightStairsDistanceToSanctuary = Math.hypot(nightStairsCenterX - sanctuaryCenterX, nightStairsCenterY - sanctuaryCenterY);

    expect(nightStairsDistanceToQuire).toBeLessThan(nightStairsDistanceToSanctuary);
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
    doc = {
      ...doc,
      view: {
        ...doc.view,
        visualStyle: 'default',
      },
    };

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
    doc = {
      ...doc,
      view: {
        ...doc.view,
        visualStyle: 'default',
      },
    };

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
    doc = {
      ...doc,
      view: {
        ...doc.view,
        visualStyle: 'default',
      },
    };

    const { roomPositions, pseudoRoomPositions } = computePrettifiedLayoutPositions(doc);

    expect(pseudoRoomPositions[pseudoRoom.id]).toBeDefined();
    expect(pseudoRoomPositions[pseudoRoom.id]).not.toEqual(pseudoRoom.position);
    expect(pseudoRoomPositions[pseudoRoom.id]).not.toEqual(roomPositions[room.id]);
    expectSnappedToGrid(getRoomCenterX(room, roomPositions[room.id].x));
    expectSnappedToGrid(getRoomCenterY(roomPositions[room.id].y));
    expect(pseudoRoomPositions[pseudoRoom.id].x).toBeGreaterThan(roomPositions[room.id].x);
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
    doc = {
      ...doc,
      view: {
        ...doc.view,
        visualStyle: 'default',
      },
    };

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

  it('keeps extra-locked rooms fixed while repositioning the rest of the component', () => {
    let doc = createEmptyMap('Extra Locked');
    const anchorRoom = { ...createRoom('Anchor'), position: { x: 480, y: 80 } };
    const movingRoom = { ...createRoom('Moving'), position: { x: 0, y: 0 } };
    doc = addRoom(addRoom(doc, anchorRoom), movingRoom);
    doc = addConnection(doc, createConnection(anchorRoom.id, movingRoom.id, true), 'east', 'west');

    const positions = computePrettifiedRoomPositions(doc, new Set([anchorRoom.id]));

    expect(positions[anchorRoom.id]).toEqual(anchorRoom.position);
    expect(positions[movingRoom.id]).not.toEqual(movingRoom.position);
    expect(positions[movingRoom.id].x).toBeGreaterThan(positions[anchorRoom.id].x);
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

  it('does not walk when prettified repeatedly for a connected layout', () => {
    let doc = createEmptyMap('Connected Stable Repeat');
    const roomA = { ...createRoom('Alpha'), position: { x: 0, y: 0 } };
    const roomB = { ...createRoom('Beta'), position: { x: 320, y: 200 } };
    const roomC = { ...createRoom('Gamma'), position: { x: 640, y: 0 } };
    doc = addRoom(addRoom(addRoom(doc, roomA), roomB), roomC);
    doc = addConnection(doc, createConnection(roomA.id, roomB.id, true), 'east', 'west');
    doc = addConnection(doc, createConnection(roomB.id, roomC.id, true), 'east', 'west');

    const firstPositions = computePrettifiedRoomPositions(doc);
    let nextDoc = setRoomPositions(doc, firstPositions);

    for (let iteration = 0; iteration < 4; iteration += 1) {
      const nextPositions = computePrettifiedRoomPositions(nextDoc);
      expect(nextPositions).toEqual(firstPositions);
      nextDoc = setRoomPositions(nextDoc, nextPositions);
    }
  });

  it('does not walk when prettified repeatedly for a room with an attached pseudo-room', () => {
    let doc = createEmptyMap('Pseudo Stable Repeat');
    const room = { ...createRoom('Alpha'), position: { x: 320, y: 200 } };
    const pseudoRoom = { ...createPseudoRoom('unknown'), position: { x: 0, y: 0 } };
    doc = addRoom(doc, room);
    doc = addPseudoRoom(doc, pseudoRoom);
    doc = addConnection(doc, createConnection(room.id, { kind: 'pseudo-room', id: pseudoRoom.id }, false), 'east');

    const firstPass = computePrettifiedLayoutPositions(doc);
    let nextDoc = {
      ...doc,
      rooms: {
        ...doc.rooms,
        [room.id]: {
          ...doc.rooms[room.id],
          position: firstPass.roomPositions[room.id],
        },
      },
      pseudoRooms: {
        ...doc.pseudoRooms,
        [pseudoRoom.id]: {
          ...doc.pseudoRooms[pseudoRoom.id],
          position: firstPass.pseudoRoomPositions[pseudoRoom.id],
        },
      },
    };

    for (let iteration = 0; iteration < 4; iteration += 1) {
      const nextPass = computePrettifiedLayoutPositions(nextDoc);
      expect(nextPass.roomPositions).toEqual(firstPass.roomPositions);
      expect(nextPass.pseudoRoomPositions).toEqual(firstPass.pseudoRoomPositions);
      nextDoc = {
        ...nextDoc,
        rooms: {
          ...nextDoc.rooms,
          [room.id]: {
            ...nextDoc.rooms[room.id],
            position: nextPass.roomPositions[room.id],
          },
        },
        pseudoRooms: {
          ...nextDoc.pseudoRooms,
          [pseudoRoom.id]: {
            ...nextDoc.pseudoRooms[pseudoRoom.id],
            position: nextPass.pseudoRoomPositions[pseudoRoom.id],
          },
        },
      };
    }
  });

  it('does not walk when prettified repeatedly for a room with clustered pseudo-room exits', () => {
    let doc = createEmptyMap('Pseudo Cluster Stable Repeat');
    const bathroom = { ...createRoom('bathroom'), position: { x: 320, y: 320 } };
    const death = { ...createPseudoRoom('death'), id: 'pseudo-death', position: { x: 0, y: 0 } };
    const infinite = { ...createPseudoRoom('infinite'), id: 'pseudo-infinite', position: { x: 0, y: 0 } };
    const unknown = { ...createPseudoRoom('unknown'), id: 'pseudo-unknown', position: { x: 0, y: 0 } };
    const nowhere = { ...createPseudoRoom('nowhere'), id: 'pseudo-nowhere', position: { x: 0, y: 0 } };
    doc = addRoom(doc, bathroom);
    doc = addPseudoRoom(addPseudoRoom(addPseudoRoom(addPseudoRoom(doc, death), infinite), unknown), nowhere);
    doc = addConnection(doc, createConnection(bathroom.id, { kind: 'pseudo-room', id: death.id }, false), 'east');
    doc = addConnection(doc, createConnection(bathroom.id, { kind: 'pseudo-room', id: infinite.id }, false), 'south');
    doc = addConnection(doc, createConnection(bathroom.id, { kind: 'pseudo-room', id: unknown.id }, false), 'north');
    doc = addConnection(doc, createConnection(bathroom.id, { kind: 'pseudo-room', id: nowhere.id }, false), 'southeast');

    const firstPass = computePrettifiedLayoutPositions(doc);
    let nextDoc = {
      ...doc,
      rooms: {
        ...doc.rooms,
        [bathroom.id]: {
          ...doc.rooms[bathroom.id],
          position: firstPass.roomPositions[bathroom.id],
        },
      },
      pseudoRooms: Object.fromEntries(
        Object.entries(doc.pseudoRooms).map(([pseudoRoomId, pseudoRoom]) => [
          pseudoRoomId,
          {
            ...pseudoRoom,
            position: firstPass.pseudoRoomPositions[pseudoRoomId],
          },
        ]),
      ),
    };

    for (let iteration = 0; iteration < 4; iteration += 1) {
      const nextPass = computePrettifiedLayoutPositions(nextDoc);
      expect(nextPass.roomPositions).toEqual(firstPass.roomPositions);
      expect(nextPass.pseudoRoomPositions).toEqual(firstPass.pseudoRoomPositions);
      nextDoc = {
        ...nextDoc,
        rooms: {
          ...nextDoc.rooms,
          [bathroom.id]: {
            ...nextDoc.rooms[bathroom.id],
            position: nextPass.roomPositions[bathroom.id],
          },
        },
        pseudoRooms: Object.fromEntries(
          Object.entries(nextDoc.pseudoRooms).map(([pseudoRoomId, pseudoRoom]) => [
            pseudoRoomId,
            {
              ...pseudoRoom,
              position: nextPass.pseudoRoomPositions[pseudoRoomId],
            },
          ]),
        ),
      };
    }
  });

  it('does not walk when prettified repeatedly for a sticky note linked to both a room and a pseudo-room', () => {
    let doc = createEmptyMap('Sticky Note Multi-Link Stable Repeat');
    const room = { ...createRoom('Kitchen'), position: { x: 320, y: 200 } };
    const pseudoRoom = { ...createPseudoRoom('unknown'), position: { x: 520, y: 200 } };
    const stickyNote = { ...createStickyNote('Check this exit carefully'), position: { x: 120, y: 120 } };
    doc = addRoom(doc, room);
    doc = addPseudoRoom(doc, pseudoRoom);
    doc = addConnection(doc, createConnection(room.id, { kind: 'pseudo-room', id: pseudoRoom.id }, false), 'east');
    doc = addStickyNote(doc, stickyNote);
    doc = addStickyNoteLink(doc, createStickyNoteLink(stickyNote.id, room.id));
    doc = addStickyNoteLink(doc, createStickyNoteLink(stickyNote.id, { kind: 'pseudo-room', id: pseudoRoom.id }));

    const firstPass = computePrettifiedLayoutPositions(doc);
    let nextDoc = {
      ...doc,
      rooms: {
        ...doc.rooms,
        [room.id]: {
          ...doc.rooms[room.id],
          position: firstPass.roomPositions[room.id],
        },
      },
      pseudoRooms: {
        ...doc.pseudoRooms,
        [pseudoRoom.id]: {
          ...doc.pseudoRooms[pseudoRoom.id],
          position: firstPass.pseudoRoomPositions[pseudoRoom.id],
        },
      },
      stickyNotes: {
        ...doc.stickyNotes,
        [stickyNote.id]: {
          ...doc.stickyNotes[stickyNote.id],
          position: firstPass.stickyNotePositions[stickyNote.id],
        },
      },
    };

    for (let iteration = 0; iteration < 4; iteration += 1) {
      const nextPass = computePrettifiedLayoutPositions(nextDoc);
      expect(nextPass.roomPositions).toEqual(firstPass.roomPositions);
      expect(nextPass.pseudoRoomPositions).toEqual(firstPass.pseudoRoomPositions);
      expect(nextPass.stickyNotePositions).toEqual(firstPass.stickyNotePositions);
      nextDoc = {
        ...nextDoc,
        rooms: {
          ...nextDoc.rooms,
          [room.id]: {
            ...nextDoc.rooms[room.id],
            position: nextPass.roomPositions[room.id],
          },
        },
        pseudoRooms: {
          ...nextDoc.pseudoRooms,
          [pseudoRoom.id]: {
            ...nextDoc.pseudoRooms[pseudoRoom.id],
            position: nextPass.pseudoRoomPositions[pseudoRoom.id],
          },
        },
        stickyNotes: {
          ...nextDoc.stickyNotes,
          [stickyNote.id]: {
            ...nextDoc.stickyNotes[stickyNote.id],
            position: nextPass.stickyNotePositions[stickyNote.id],
          },
        },
      };
    }
  });

  it('keeps a multi-linked sticky note in the same connected component across repeated prettify passes', () => {
    let doc = createEmptyMap('Sticky Note Bridge Stable Repeat');
    const roomA = { ...createRoom('Alpha'), id: 'alpha', position: { x: 120, y: 200 } };
    const roomB = { ...createRoom('Beta'), id: 'beta', position: { x: 620, y: 200 } };
    const pseudoRoom = { ...createPseudoRoom('unknown'), id: 'unknown-exit', position: { x: 820, y: 200 } };
    const stickyNote = { ...createStickyNote('Bridge note'), id: 'bridge-note', position: { x: 420, y: 120 } };
    doc = addRoom(addRoom(doc, roomA), roomB);
    doc = addPseudoRoom(doc, pseudoRoom);
    doc = addConnection(doc, createConnection(roomB.id, { kind: 'pseudo-room', id: pseudoRoom.id }, false), 'east');
    doc = addStickyNote(doc, stickyNote);
    doc = addStickyNoteLink(doc, createStickyNoteLink(stickyNote.id, roomA.id));
    doc = addStickyNoteLink(doc, createStickyNoteLink(stickyNote.id, { kind: 'pseudo-room', id: pseudoRoom.id }));

    const expectJoinedComponent = (currentDoc: MapDocument) => {
      const bounds = getConnectedComponentBounds(currentDoc);
      const noteComponent = bounds.find((component) => component.roomIds.includes(stickyNote.id));
      expect(noteComponent?.roomIds).toEqual([roomA.id, roomB.id, stickyNote.id, pseudoRoom.id]);
    };

    const firstPass = computePrettifiedLayoutPositions(doc);
    expectJoinedComponent(doc);
    let nextDoc = {
      ...doc,
      rooms: {
        ...doc.rooms,
        [roomA.id]: { ...doc.rooms[roomA.id], position: firstPass.roomPositions[roomA.id] },
        [roomB.id]: { ...doc.rooms[roomB.id], position: firstPass.roomPositions[roomB.id] },
      },
      pseudoRooms: {
        ...doc.pseudoRooms,
        [pseudoRoom.id]: { ...doc.pseudoRooms[pseudoRoom.id], position: firstPass.pseudoRoomPositions[pseudoRoom.id] },
      },
      stickyNotes: {
        ...doc.stickyNotes,
        [stickyNote.id]: { ...doc.stickyNotes[stickyNote.id], position: firstPass.stickyNotePositions[stickyNote.id] },
      },
    };

    for (let iteration = 0; iteration < 4; iteration += 1) {
      const nextPass = computePrettifiedLayoutPositions(nextDoc);
      nextDoc = {
        ...nextDoc,
        rooms: {
          ...nextDoc.rooms,
          [roomA.id]: { ...nextDoc.rooms[roomA.id], position: nextPass.roomPositions[roomA.id] },
          [roomB.id]: { ...nextDoc.rooms[roomB.id], position: nextPass.roomPositions[roomB.id] },
        },
        pseudoRooms: {
          ...nextDoc.pseudoRooms,
          [pseudoRoom.id]: { ...nextDoc.pseudoRooms[pseudoRoom.id], position: nextPass.pseudoRoomPositions[pseudoRoom.id] },
        },
        stickyNotes: {
          ...nextDoc.stickyNotes,
          [stickyNote.id]: { ...nextDoc.stickyNotes[stickyNote.id], position: nextPass.stickyNotePositions[stickyNote.id] },
        },
      };
      expectJoinedComponent(nextDoc);
    }
  });

  it('does not walk when prettified repeatedly for a sticky note linked to two rooms', () => {
    let doc = createEmptyMap('Sticky Note Two Room Stable Repeat');
    const room1 = { ...createRoom('Room 1'), id: 'room-1', position: { x: 120, y: 120 } };
    const room2 = { ...createRoom('Room 2'), id: 'room-2', position: { x: 160, y: 420 } };
    const stickyNote = { ...createStickyNote('Note'), id: 'note', position: { x: 360, y: 120 } };
    doc = addRoom(addRoom(doc, room1), room2);
    doc = addStickyNote(doc, stickyNote);
    doc = addStickyNoteLink(doc, createStickyNoteLink(stickyNote.id, room1.id));
    doc = addStickyNoteLink(doc, createStickyNoteLink(stickyNote.id, room2.id));

    const firstPass = computePrettifiedLayoutPositions(doc);
    let nextDoc = {
      ...doc,
      rooms: {
        ...doc.rooms,
        [room1.id]: { ...doc.rooms[room1.id], position: firstPass.roomPositions[room1.id] },
        [room2.id]: { ...doc.rooms[room2.id], position: firstPass.roomPositions[room2.id] },
      },
      stickyNotes: {
        ...doc.stickyNotes,
        [stickyNote.id]: { ...doc.stickyNotes[stickyNote.id], position: firstPass.stickyNotePositions[stickyNote.id] },
      },
    };

    for (let iteration = 0; iteration < 4; iteration += 1) {
      const nextPass = computePrettifiedLayoutPositions(nextDoc);
      expect(nextPass.roomPositions).toEqual(firstPass.roomPositions);
      expect(nextPass.stickyNotePositions).toEqual(firstPass.stickyNotePositions);
      nextDoc = {
        ...nextDoc,
        rooms: {
          ...nextDoc.rooms,
          [room1.id]: { ...nextDoc.rooms[room1.id], position: nextPass.roomPositions[room1.id] },
          [room2.id]: { ...nextDoc.rooms[room2.id], position: nextPass.roomPositions[room2.id] },
        },
        stickyNotes: {
          ...nextDoc.stickyNotes,
          [stickyNote.id]: { ...nextDoc.stickyNotes[stickyNote.id], position: nextPass.stickyNotePositions[stickyNote.id] },
        },
      };
    }
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

  it('snaps an unlinked sticky note to the prettify grid even without any rooms', () => {
    let doc = createEmptyMap('Sticky Only');
    const stickyNote = { ...createStickyNote('Solo note'), position: { x: 33, y: 47 } };
    doc = addStickyNote(doc, stickyNote);

    const firstPass = computePrettifiedLayoutPositions(doc);
    const secondPassDoc: MapDocument = {
      ...doc,
      stickyNotes: {
        ...doc.stickyNotes,
        [stickyNote.id]: {
          ...doc.stickyNotes[stickyNote.id],
          position: firstPass.stickyNotePositions[stickyNote.id],
        },
      },
    };
    const secondPass = computePrettifiedLayoutPositions(secondPassDoc);

    expect(firstPass.roomPositions).toEqual({});
    expect(firstPass.pseudoRoomPositions).toEqual({});
    expect(firstPass.stickyNotePositions[stickyNote.id]).toBeDefined();
    expect(firstPass.stickyNotePositions[stickyNote.id]).not.toEqual(stickyNote.position);
    expect(secondPass.stickyNotePositions).toEqual(firstPass.stickyNotePositions);
  });

  it('keeps extra-locked sticky notes fixed during prettify', () => {
    let doc = createEmptyMap('Locked Note');
    const room = { ...createRoom('Room'), position: { x: 200, y: 200 } };
    const stickyNote = { ...createStickyNote('Pinned reminder'), position: { x: 620, y: 420 } };
    doc = addRoom(doc, room);
    doc = addStickyNote(doc, stickyNote);
    doc = addStickyNoteLink(doc, createStickyNoteLink(stickyNote.id, room.id));

    const layout = computePrettifiedLayoutPositions(doc, new Set([stickyNote.id]));

    expect(layout.stickyNotePositions[stickyNote.id]).toEqual(stickyNote.position);
    expect(layout.roomPositions[room.id]).toBeDefined();
  });

  it('ignores sticky-note links whose targets are missing from the layout', () => {
    let doc = createEmptyMap('Broken Sticky Note Link');
    const room = { ...createRoom('Kitchen'), position: { x: 200, y: 200 } };
    const stickyNote = { ...createStickyNote('Investigate'), position: { x: 15, y: 25 } };
    doc = addRoom(doc, room);
    doc = addStickyNote(doc, stickyNote);
    doc = {
      ...doc,
      stickyNoteLinks: {
        broken: {
          ...createStickyNoteLink(stickyNote.id, room.id),
          id: 'broken',
          target: { kind: 'room', id: 'missing-room' },
        },
      },
    };

    const layout = computePrettifiedLayoutPositions(doc as MapDocument);

    expect(layout.roomPositions[room.id]).toBeDefined();
    expect(layout.stickyNotePositions[stickyNote.id]).toBeDefined();
    expect(layout.stickyNotePositions[stickyNote.id]).not.toEqual(room.position);
  });

  it('keeps sticky-note-connected component bounds stable when the note moves between linked rooms', () => {
    let doc = createEmptyMap('Sticky Connectivity Bounds');
    const room1 = { ...createRoom('Room 1'), id: 'room-1', position: { x: 0, y: 0 } };
    const room2 = { ...createRoom('Room 2'), id: 'room-2', position: { x: 1200, y: 900 } };
    const room3 = { ...createRoom('Room 3'), id: 'room-3', position: { x: 420, y: 520 } };
    const room4 = { ...createRoom('Room 4'), id: 'room-4', position: { x: 760, y: 220 } };
    const note = { ...createStickyNote('Note'), id: 'note-1', position: { x: 180, y: 20 } };
    doc = addRoom(addRoom(addRoom(addRoom(doc, room1), room2), room3), room4);
    doc = addStickyNote(doc, note);
    doc = addConnection(doc, createConnection(room3.id, { kind: 'room', id: room4.id }, false), 'east');
    doc = addStickyNoteLink(doc, createStickyNoteLink(note.id, room1.id));
    doc = addStickyNoteLink(doc, createStickyNoteLink(note.id, room2.id));

    const initialBounds = getConnectedComponentBounds(doc);
    expect(initialBounds).toHaveLength(2);
    const initialNoteComponent = initialBounds.find((bounds) => bounds.roomIds.includes(note.id));
    expect(initialNoteComponent?.roomIds).toEqual([note.id, room1.id, room2.id]);

    const movedNoteDoc: MapDocument = {
      ...doc,
      stickyNotes: {
        ...doc.stickyNotes,
        [note.id]: {
          ...note,
          position: { x: 560, y: 980 },
        },
      },
    };
    const movedBounds = getConnectedComponentBounds(movedNoteDoc);
    expect(movedBounds).toHaveLength(2);
    const movedNoteComponent = movedBounds.find((bounds) => bounds.roomIds.includes(note.id));
    expect(movedNoteComponent?.roomIds).toEqual([note.id, room1.id, room2.id]);
  });

  it('covers exported prettify-layout helper branches directly', () => {
    let doc = createEmptyMap('Helper Branches');
    const alpha = { ...createRoom('Alpha'), id: 'alpha', position: { x: 0, y: 0 } };
    const beta = { ...createRoom('Beta'), id: 'beta', position: { x: 0, y: 0 } };
    const pseudo = { ...createPseudoRoom('unknown'), id: 'pseudo', position: { x: 160, y: 0 } };
    const noteA = { ...createStickyNote('A'), id: 'note-a', position: { x: 0, y: 0 } };
    const noteB = { ...createStickyNote('B'), id: 'note-b', position: { x: 0, y: 0 } };
    doc = addRoom(addRoom(doc, alpha), beta);
    doc = addPseudoRoom(doc, pseudo);
    doc = addStickyNote(addStickyNote(doc, noteA), noteB);
    doc = addConnection(doc, createConnection(alpha.id, { kind: 'pseudo-room', id: pseudo.id }, false), 'east');
    doc = addStickyNoteLink(doc, createStickyNoteLink(noteA.id, alpha.id));
    doc = addStickyNoteLink(doc, createStickyNoteLink(noteA.id, { kind: 'pseudo-room', id: pseudo.id }));
    doc = addStickyNoteLink(doc, createStickyNoteLink(noteB.id, alpha.id));

    expect(TEST_ONLY_PRETTIFY_LAYOUT.estimateRoomWidth(alpha, 'default')).toBeGreaterThan(0);
    expect(TEST_ONLY_PRETTIFY_LAYOUT.getLayoutRoom(doc, alpha.id)?.id).toBe(alpha.id);
    expect(TEST_ONLY_PRETTIFY_LAYOUT.getLayoutRoom(doc, pseudo.id)?.id).toBe(pseudo.id);
    expect(TEST_ONLY_PRETTIFY_LAYOUT.getLayoutRoom(doc, 'missing')).toBeNull();
    expect(TEST_ONLY_PRETTIFY_LAYOUT.getLayoutPosition(doc, noteA.id)).toEqual(noteA.position);
    expect(TEST_ONLY_PRETTIFY_LAYOUT.getLayoutPosition(doc, 'missing')).toBeNull();
    expect(TEST_ONLY_PRETTIFY_LAYOUT.getLayoutNodeDimensions(doc, 'missing', 'default')).toEqual({ width: 0, height: 0 });

    const stickyConstraints = TEST_ONLY_PRETTIFY_LAYOUT.deriveStickyNoteConstraints(doc);
    expect(stickyConstraints).toHaveLength(3);
    expect(stickyConstraints[0]?.toRoomId).toBeDefined();
    const stickyConnectivityConstraints = TEST_ONLY_PRETTIFY_LAYOUT.deriveStickyNoteConnectivityConstraints(doc);
    expect(stickyConnectivityConstraints).toHaveLength(3);

    expect(TEST_ONLY_PRETTIFY_LAYOUT.positionsEqual({ a: { x: 0, y: 0 } }, {})).toBe(false);
    expect(TEST_ONLY_PRETTIFY_LAYOUT.positionsEqual({ a: { x: 0, y: 0 } }, { b: { x: 0, y: 0 } })).toBe(false);
    expect(TEST_ONLY_PRETTIFY_LAYOUT.positionsEqual({ a: { x: 0, y: 0 } }, { a: { x: 20, y: 0 } })).toBe(false);
    expect(TEST_ONLY_PRETTIFY_LAYOUT.positionsEqual({ a: { x: 0, y: 0 } }, { a: { x: 0, y: 0 } })).toBe(true);

    expect(TEST_ONLY_PRETTIFY_LAYOUT.getLayoutMovementScore(
      {
        roomPositions: { gamma: { x: 10, y: 10 } },
        pseudoRoomPositions: { delta: { x: 10, y: 10 } },
        stickyNotePositions: { epsilon: { x: 10, y: 10 } },
      },
      {},
      {},
      {},
    )).toBe(0);

    const disconnectedSeeds = TEST_ONLY_PRETTIFY_LAYOUT.computeSeedPositions(['alpha', 'beta'], []);
    expect(disconnectedSeeds.get('alpha')).toEqual({ x: 0, y: 0 });
    expect(disconnectedSeeds.get('beta')).toEqual({ x: 0, y: 0 });

    const missingCentroid = TEST_ONLY_PRETTIFY_LAYOUT.computePlacedCentroid(
      ['alpha', 'missing'],
      new Map([[alpha.id, alpha.position]]),
      doc,
    );
    expect(Number.isFinite(missingCentroid.x)).toBe(true);
    expect(Number.isFinite(missingCentroid.y)).toBe(true);

    const overlappingPlaced = new Map<string, { x: number; y: number }>([
      [alpha.id, { x: 0, y: 0 }],
    ]);
    expect(TEST_ONLY_PRETTIFY_LAYOUT.overlapsPlacedRooms(alpha.id, { x: 0, y: 0 }, overlappingPlaced, doc)).toBe(false);
    expect(TEST_ONLY_PRETTIFY_LAYOUT.overlapsPlacedRooms(beta.id, { x: 0, y: 0 }, overlappingPlaced, doc)).toBe(true);

    const noOpenPositionDoc = {
      ...doc,
      rooms: {
        blocker1: { ...createRoom('Blocker 1'), id: 'blocker1', position: { x: -240, y: -240 } },
        blocker2: { ...createRoom('Blocker 2'), id: 'blocker2', position: { x: -240, y: 0 } },
        blocker3: { ...createRoom('Blocker 3'), id: 'blocker3', position: { x: -240, y: 240 } },
        blocker4: { ...createRoom('Blocker 4'), id: 'blocker4', position: { x: 0, y: -240 } },
        center: { ...createRoom('Center'), id: 'center', position: { x: 0, y: 0 } },
        blocker5: { ...createRoom('Blocker 5'), id: 'blocker5', position: { x: 0, y: 240 } },
        blocker6: { ...createRoom('Blocker 6'), id: 'blocker6', position: { x: 240, y: -240 } },
        blocker7: { ...createRoom('Blocker 7'), id: 'blocker7', position: { x: 240, y: 0 } },
        blocker8: { ...createRoom('Blocker 8'), id: 'blocker8', position: { x: 240, y: 240 } },
      },
      pseudoRooms: {},
      stickyNotes: {},
    };
    const noOpenPlaced = new Map(
      Object.entries(noOpenPositionDoc.rooms).map(([id, room]) => [id, room.position] as const),
    );
    const preferredBlocked = TEST_ONLY_PRETTIFY_LAYOUT.findNearestOpenPosition(
      'center',
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      noOpenPlaced,
      noOpenPositionDoc,
    );
    expect(preferredBlocked).toEqual({ x: 0, y: 0 });

    expect(TEST_ONLY_PRETTIFY_LAYOUT.canTranslateComponent(['alpha'], { x: 0, y: 0 }, new Map([[alpha.id, alpha.position]]), doc)).toBe(true);
    expect(TEST_ONLY_PRETTIFY_LAYOUT.canTranslateComponent(['alpha'], { x: 20, y: 20 }, new Map(), doc)).toBe(false);

    const overlappingComponentPositions = new Map<string, { x: number; y: number }>([
      [alpha.id, { x: 0, y: 0 }],
      [beta.id, { x: 20, y: 0 }],
    ]);
    expect(TEST_ONLY_PRETTIFY_LAYOUT.doComponentsOverlap(
      [alpha.id],
      [beta.id],
      overlappingComponentPositions,
      doc,
    )).toBe(true);
    TEST_ONLY_PRETTIFY_LAYOUT.separateOverlappingComponents(
      TEST_ONLY_PRETTIFY_LAYOUT.createComponentPlacementGroups([[alpha.id], [beta.id]]),
      new Set(),
      overlappingComponentPositions,
      doc,
    );
    expect(overlappingComponentPositions.get(alpha.id)).toEqual({ x: 0, y: 0 });
    expect(overlappingComponentPositions.get(beta.id)).not.toEqual({ x: 20, y: 0 });
    expect(TEST_ONLY_PRETTIFY_LAYOUT.doComponentsOverlap(
      [alpha.id],
      [beta.id],
      overlappingComponentPositions,
      doc,
    )).toBe(false);

    const separatedAnchors = TEST_ONLY_PRETTIFY_LAYOUT.separateOverlappingComponentAnchors(
      [
        { roomIds: [alpha.id], key: alpha.id, targetCentroid: { x: 0, y: 0 } },
        { roomIds: [beta.id], key: beta.id, targetCentroid: { x: 0, y: 0 } },
      ],
      new Set(),
      new Map([
        [alpha.id, { x: 0, y: 0 }],
        [beta.id, { x: 0, y: 0 }],
      ]),
      doc,
    );
    expect(separatedAnchors[0]?.targetCentroid).toEqual({ x: 0, y: 0 });
    expect(separatedAnchors[1]?.targetCentroid).not.toEqual({ x: 0, y: 0 });

    const translatableDoc = createEmptyMap('Translate');
    const translateRoomA = { ...createRoom('A'), id: 'ta', position: { x: 0, y: 0 } };
    const translateRoomB = { ...createRoom('B'), id: 'tb', position: { x: 400, y: 0 } };
    const translatePlaced = new Map<string, { x: number; y: number }>([
      [translateRoomA.id, translateRoomA.position],
      [translateRoomB.id, translateRoomB.position],
    ]);
    const translateDoc = addRoom(addRoom(translatableDoc, translateRoomA), translateRoomB);
    expect(TEST_ONLY_PRETTIFY_LAYOUT.canTranslateComponent([translateRoomA.id], { x: 20, y: 0 }, translatePlaced, translateDoc)).toBe(true);

    const stickyBounds = TEST_ONLY_PRETTIFY_LAYOUT.getStickyNoteBounds(noteA, noteA.position);
    expect(stickyBounds.left).toBe(noteA.position.x);
    expect(TEST_ONLY_PRETTIFY_LAYOUT.getStickyNoteDimensions(noteA).width).toBe(STICKY_NOTE_WIDTH);
    const stickyCenter = TEST_ONLY_PRETTIFY_LAYOUT.toStickyNoteCenter(noteA, noteA.position);
    expect(TEST_ONLY_PRETTIFY_LAYOUT.toStickyNoteTopLeft(noteA, stickyCenter)).toEqual(noteA.position);
    const roomBounds = TEST_ONLY_PRETTIFY_LAYOUT.getRoomBounds(alpha, alpha.position, 'default');
    expect(roomBounds.left).toBe(alpha.position.x);
    expect(TEST_ONLY_PRETTIFY_LAYOUT.intersectsWithGap(stickyBounds, roomBounds, 0)).toBe(true);
    expect(TEST_ONLY_PRETTIFY_LAYOUT.intersectsWithGap(
      { left: 0, top: 0, right: 10, bottom: 10 },
      { left: 50, top: 50, right: 60, bottom: 60 },
      0,
    )).toBe(false);

    const layoutPositions = {
      [alpha.id]: alpha.position,
      [pseudo.id]: pseudo.position,
    };
    expect(TEST_ONLY_PRETTIFY_LAYOUT.overlapsRoomOrStickyNote(noteA.id, noteA.position, layoutPositions, new Map(), doc)).toBe(true);
    expect(TEST_ONLY_PRETTIFY_LAYOUT.overlapsRoomOrStickyNote(noteA.id, { x: 600, y: 600 }, layoutPositions, new Map([[noteB.id, { x: 600, y: 600 }]]), doc)).toBe(true);

    const nearestSticky = TEST_ONLY_PRETTIFY_LAYOUT.findNearestOpenStickyNotePosition(
      noteA.id,
      alpha.position,
      noteA.position,
      layoutPositions,
      new Map([[noteB.id, noteB.position]]),
      doc,
    );
    expect(nearestSticky).not.toEqual(alpha.position);

    const preferredSticky = TEST_ONLY_PRETTIFY_LAYOUT.getPreferredStickyNotePosition(noteA.id, layoutPositions, doc);
    expect(preferredSticky).not.toEqual(noteA.position);

    const brokenStickyDoc = {
      ...doc,
      stickyNoteLinks: {
        broken: { ...createStickyNoteLink(noteA.id, alpha.id), id: 'broken', target: { kind: 'room', id: 'missing' } },
      },
    };
    expect(TEST_ONLY_PRETTIFY_LAYOUT.buildStickyNoteLayoutConstraints(brokenStickyDoc as MapDocument, layoutPositions, [noteA.id])).toEqual([]);

    const relaxedSticky = TEST_ONLY_PRETTIFY_LAYOUT.relaxStickyNotePositions(doc, layoutPositions, [noteA.id, noteB.id]);
    expect(relaxedSticky.get(noteA.id)).toBeDefined();

    const placedSticky = TEST_ONLY_PRETTIFY_LAYOUT.computePrettifiedStickyNotePositions(doc, { [alpha.id]: alpha.position }, { [pseudo.id]: pseudo.position });
    expect(placedSticky[noteA.id]).toBeDefined();

    const stableEmpty = TEST_ONLY_PRETTIFY_LAYOUT.computeStablePrettifiedPositions(
      {
        ...createEmptyMap('Stable Empty'),
        rooms: {},
        pseudoRooms: {},
        stickyNotes: {},
      },
      new Set(),
    );
    expect(stableEmpty).toEqual({
      roomPositions: {},
      pseudoRoomPositions: {},
      stickyNotePositions: {},
    });
  });
});
