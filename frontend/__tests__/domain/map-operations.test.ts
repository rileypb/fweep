import { describe, it, expect } from '@jest/globals';
import {
  createEmptyMap,
  createRoom,
  createConnection,
  createPseudoRoom,
  createItem,
  createStickyNote,
  createStickyNoteLink,
} from '../../src/domain/map-types';
import {
  addRoom,
  addPseudoRoom,
  addConnection,
  addItem,
  addStickyNote,
  addStickyNoteLink,
  convertPseudoRoomToRoom,
  deleteRoom,
  deleteConnection,
  deleteStickyNote,
  deleteStickyNoteLink,
  deleteItem,
  describeRoom,
  describeItem,
  moveRoom,
  moveStickyNote,
  setConnectionAnnotation,
  setConnectionLabels,
  setConnectionStyle,
  setRoomDark,
  setRoomLocked,
  setRoomStyle,
  setRoomPositions,
  setRoomShape,
  setRoomsLocked,
  setStickyNotePositions,
  setStickyNoteText,
  rerouteConnectionEndpoint,
} from '../../src/domain/map-operations';

/* ------------------------------------------------------------------ */
/*  addRoom                                                            */
/* ------------------------------------------------------------------ */
describe('addRoom', () => {
  it('returns a new document containing the room', () => {
    const doc = createEmptyMap('Test');
    const room = createRoom('Kitchen');
    const next = addRoom(doc, room);

    expect(next.rooms[room.id]).toEqual(room);
  });

  it('does not mutate the original document', () => {
    const doc = createEmptyMap('Test');
    const room = createRoom('Library');
    const next = addRoom(doc, room);

    expect(doc.rooms[room.id]).toBeUndefined();
    expect(next).not.toBe(doc);
  });

  it('preserves existing rooms', () => {
    const doc = createEmptyMap('Test');
    const r1 = createRoom('Room A');
    const r2 = createRoom('Room B');

    const step1 = addRoom(doc, r1);
    const step2 = addRoom(step1, r2);

    expect(step2.rooms[r1.id]).toEqual(r1);
    expect(step2.rooms[r2.id]).toEqual(r2);
  });

  it('throws if a room with the same ID already exists', () => {
    const doc = createEmptyMap('Test');
    const room = createRoom('Dup');
    const next = addRoom(doc, room);

    expect(() => addRoom(next, room)).toThrow(/already exists/i);
  });

  it('updates the document updatedAt timestamp', () => {
    const doc = createEmptyMap('Test');
    const backdated = {
      ...doc,
      metadata: { ...doc.metadata, updatedAt: '2020-01-01T00:00:00.000Z' },
    };
    const room = createRoom('Timed');
    const next = addRoom(backdated, room);

    expect(next.metadata.updatedAt).not.toBe(backdated.metadata.updatedAt);
  });
});

/* ------------------------------------------------------------------ */
/*  addConnection                                                      */
/* ------------------------------------------------------------------ */
describe('addConnection', () => {
  function twoRoomDoc() {
    const doc = createEmptyMap('Test');
    const r1 = createRoom('Room A');
    const r2 = createRoom('Room B');
    return { doc: addRoom(addRoom(doc, r1), r2), r1, r2 };
  }

  it('adds a one-way connection and binds the source direction', () => {
    const { doc, r1, r2 } = twoRoomDoc();
    const conn = createConnection(r1.id, r2.id, false);
    const next = addConnection(doc, conn, 'north');

    expect(next.connections[conn.id]).toEqual(conn);
    expect(next.rooms[r1.id].directions['north']).toBe(conn.id);
    // Target room should NOT have a reverse binding
    expect(next.rooms[r2.id].directions['south']).toBeUndefined();
  });

  it('adds a bidirectional connection and binds both directions', () => {
    const { doc, r1, r2 } = twoRoomDoc();
    const conn = createConnection(r1.id, r2.id, true);
    const next = addConnection(doc, conn, 'north', 'south');

    expect(next.connections[conn.id]).toEqual(conn);
    expect(next.rooms[r1.id].directions['north']).toBe(conn.id);
    expect(next.rooms[r2.id].directions['south']).toBe(conn.id);
  });

  it('does not mutate the original document', () => {
    const { doc, r1, r2 } = twoRoomDoc();
    const conn = createConnection(r1.id, r2.id);
    addConnection(doc, conn, 'east');

    expect(doc.connections[conn.id]).toBeUndefined();
    expect(doc.rooms[r1.id].directions['east']).toBeUndefined();
  });

  it('throws if source room does not exist', () => {
    const { doc, r2 } = twoRoomDoc();
    const conn = createConnection('no-such-room', r2.id);

    expect(() => addConnection(doc, conn, 'north')).toThrow(/source room/i);
  });

  it('throws if target room does not exist', () => {
    const { doc, r1 } = twoRoomDoc();
    const conn = createConnection(r1.id, 'no-such-room');

    expect(() => addConnection(doc, conn, 'north')).toThrow(/target room/i);
  });

  it('throws if the source direction is already bound', () => {
    const { doc, r1, r2 } = twoRoomDoc();
    const c1 = createConnection(r1.id, r2.id);
    const step1 = addConnection(doc, c1, 'north');

    const c2 = createConnection(r1.id, r2.id);
    expect(() => addConnection(step1, c2, 'north')).toThrow(/already bound/i);
  });

  it('throws if bidirectional but no reverse direction is provided', () => {
    const { doc, r1, r2 } = twoRoomDoc();
    const conn = createConnection(r1.id, r2.id, true);

    expect(() => addConnection(doc, conn, 'north')).toThrow(/reverse direction/i);
  });

  it('throws if the target direction is already bound to a different connection', () => {
    const { doc, r1, r2 } = twoRoomDoc();
    const first = createConnection(r1.id, r2.id, true);
    const withFirst = addConnection(doc, first, 'north', 'south');
    const second = createConnection(r1.id, r2.id, true);

    expect(() => addConnection(withFirst, second, 'east', 'south')).toThrow(/already bound/i);
  });

  it('allows multiple directions in the same room to point to the same connection', () => {
    const { doc, r1, r2 } = twoRoomDoc();
    const conn = createConnection(r1.id, r2.id);
    const step1 = addConnection(doc, conn, 'north');
    // Manually add a second binding for the same connection
    const step2 = addConnection(
      step1,
      // Reuse same connection by adding another binding (via a helper or updated call)
      conn,
      'up',
    );

    expect(step2.rooms[r1.id].directions['north']).toBe(conn.id);
    expect(step2.rooms[r1.id].directions['up']).toBe(conn.id);
  });
});

/* ------------------------------------------------------------------ */
/*  addItem                                                            */
/* ------------------------------------------------------------------ */
describe('addItem', () => {
  function oneRoomDoc() {
    const doc = createEmptyMap('Test');
    const room = createRoom('Room A');
    return { doc: addRoom(doc, room), room };
  }

  it('adds an item to the document', () => {
    const { doc, room } = oneRoomDoc();
    const item = createItem('Sword', room.id);
    const next = addItem(doc, item);

    expect(next.items[item.id]).toEqual(item);
  });

  it('does not mutate the original document', () => {
    const { doc, room } = oneRoomDoc();
    const item = createItem('Shield', room.id);
    addItem(doc, item);

    expect(doc.items[item.id]).toBeUndefined();
  });

  it('throws if the room does not exist', () => {
    const doc = createEmptyMap('Test');
    const item = createItem('Orphan', 'no-such-room');

    expect(() => addItem(doc, item)).toThrow(/room.*not found/i);
  });

  it('throws if an item with the same ID already exists', () => {
    const { doc, room } = oneRoomDoc();
    const item = createItem('Dup', room.id);
    const next = addItem(doc, item);

    expect(() => addItem(next, item)).toThrow(/already exists/i);
  });

  it('preserves existing items', () => {
    const { doc, room } = oneRoomDoc();
    const i1 = createItem('A', room.id);
    const i2 = createItem('B', room.id);

    const step1 = addItem(doc, i1);
    const step2 = addItem(step1, i2);

    expect(step2.items[i1.id]).toEqual(i1);
    expect(step2.items[i2.id]).toEqual(i2);
  });
});

describe('sticky notes', () => {
  it('adds sticky notes and links them to rooms', () => {
    const doc = createEmptyMap('Test');
    const room = createRoom('Kitchen');
    const stickyNote = createStickyNote('Remember the lantern.');
    const withRoom = addRoom(doc, room);
    const withStickyNote = addStickyNote(withRoom, { ...stickyNote, position: { x: 40, y: 80 } });
    const stickyNoteLink = createStickyNoteLink(stickyNote.id, room.id);
    const linked = addStickyNoteLink(withStickyNote, stickyNoteLink);

    expect(linked.stickyNotes[stickyNote.id].text).toBe('Remember the lantern.');
    expect(linked.stickyNoteLinks[stickyNoteLink.id]).toEqual(stickyNoteLink);
  });

  it('deletes sticky-note links when the note is deleted', () => {
    const doc = createEmptyMap('Test');
    const room = createRoom('Kitchen');
    const stickyNote = createStickyNote('Remember the lantern.');
    const withRoom = addRoom(doc, room);
    const withStickyNote = addStickyNote(withRoom, stickyNote);
    const stickyNoteLink = createStickyNoteLink(stickyNote.id, room.id);
    const linked = addStickyNoteLink(withStickyNote, stickyNoteLink);
    const deleted = deleteStickyNote(linked, stickyNote.id);

    expect(deleted.stickyNotes[stickyNote.id]).toBeUndefined();
    expect(deleted.stickyNoteLinks[stickyNoteLink.id]).toBeUndefined();
  });

  it('throws when linking a missing sticky note to a room', () => {
    const doc = addRoom(createEmptyMap('Test'), createRoom('Kitchen'));

    expect(() => addStickyNoteLink(doc, createStickyNoteLink('missing-note', Object.keys(doc.rooms)[0]))).toThrow(/sticky note/i);
  });

  it('throws when linking a sticky note to a missing room', () => {
    const stickyNote = createStickyNote('Remember the lantern.');
    const doc = addStickyNote(createEmptyMap('Test'), stickyNote);

    expect(() => addStickyNoteLink(doc, createStickyNoteLink(stickyNote.id, 'missing-room'))).toThrow(/room/i);
  });

  it('keeps the original document when adding a duplicate sticky-note link', () => {
    const doc = createEmptyMap('Test');
    const room = createRoom('Kitchen');
    const stickyNote = createStickyNote('Remember the lantern.');
    const withRoom = addRoom(doc, room);
    const withStickyNote = addStickyNote(withRoom, stickyNote);
    const firstLink = createStickyNoteLink(stickyNote.id, room.id);
    const linked = addStickyNoteLink(withStickyNote, firstLink);
    const duplicateLink = createStickyNoteLink(stickyNote.id, room.id);

    const next = addStickyNoteLink(linked, duplicateLink);

    expect(next).toBe(linked);
    expect(next.metadata.updatedAt).toBe(linked.metadata.updatedAt);
    expect(next.stickyNoteLinks).toEqual(linked.stickyNoteLinks);
    expect(next.stickyNoteLinks[duplicateLink.id]).toBeUndefined();
  });

  it('adds sticky-note links to pseudo-rooms', () => {
    const stickyNote = createStickyNote('This needs context.');
    const pseudoRoom = { ...createPseudoRoom('unknown'), position: { x: 240, y: 120 } };
    let doc = addPseudoRoom(createEmptyMap('Test'), pseudoRoom);
    doc = addStickyNote(doc, stickyNote);

    const stickyNoteLink = createStickyNoteLink(stickyNote.id, { kind: 'pseudo-room', id: pseudoRoom.id });
    const next = addStickyNoteLink(doc, stickyNoteLink);

    expect(next.stickyNoteLinks[stickyNoteLink.id]).toEqual(stickyNoteLink);
  });

  it('updates sticky note text', () => {
    const doc = createEmptyMap('Test');
    const stickyNote = createStickyNote('');
    const withStickyNote = addStickyNote(doc, stickyNote);
    const updated = setStickyNoteText(withStickyNote, stickyNote.id, 'A hidden panel is here.');

    expect(updated.stickyNotes[stickyNote.id].text).toBe('A hidden panel is here.');
  });

  it('returns the original document when sticky note positions do not change', () => {
    const stickyNote = { ...createStickyNote('Keep still'), position: { x: 40, y: 80 } };
    const doc = addStickyNote(createEmptyMap('Test'), stickyNote);

    const next = setStickyNotePositions(doc, {
      [stickyNote.id]: { x: 40, y: 80 },
    });

    expect(next).toBe(doc);
  });

  it('throws when moving a missing sticky note', () => {
    expect(() => moveStickyNote(createEmptyMap('Test'), 'missing-note', { x: 10, y: 20 })).toThrow(/not found/i);
  });

  it('throws when setting positions for a missing sticky note', () => {
    expect(() => setStickyNotePositions(createEmptyMap('Test'), { 'missing-note': { x: 10, y: 20 } })).toThrow(/not found/i);
  });

  it('throws when setting text for a missing sticky note', () => {
    expect(() => setStickyNoteText(createEmptyMap('Test'), 'missing-note', 'Hidden door')).toThrow(/not found/i);
  });

  it('throws when deleting a missing sticky note', () => {
    expect(() => deleteStickyNote(createEmptyMap('Test'), 'missing-note')).toThrow(/not found/i);
  });

  it('throws when deleting a missing sticky-note link', () => {
    expect(() => deleteStickyNoteLink(createEmptyMap('Test'), 'missing-link')).toThrow(/not found/i);
  });
});

describe('room locking', () => {
  it('updates a room lock state', () => {
    const room = createRoom('Kitchen');
    const doc = addRoom(createEmptyMap('Test'), room);

    const next = setRoomLocked(doc, room.id, true);

    expect(next.rooms[room.id].locked).toBe(true);
  });

  it('returns the original document when a room lock state already matches', () => {
    const room = createRoom('Kitchen');
    const doc = addRoom(createEmptyMap('Test'), room);

    const next = setRoomLocked(doc, room.id, false);

    expect(next).toBe(doc);
  });

  it('updates multiple room lock states at once', () => {
    const roomA = createRoom('A');
    const roomB = createRoom('B');
    let doc = addRoom(createEmptyMap('Test'), roomA);
    doc = addRoom(doc, roomB);

    const next = setRoomsLocked(doc, [roomA.id, roomB.id], true);

    expect(next.rooms[roomA.id].locked).toBe(true);
    expect(next.rooms[roomB.id].locked).toBe(true);
  });

  it('returns the original document when all room lock states already match', () => {
    const roomA = { ...createRoom('A'), locked: true };
    const roomB = { ...createRoom('B'), locked: true };
    let doc = addRoom(createEmptyMap('Test'), roomA);
    doc = addRoom(doc, roomB);

    const next = setRoomsLocked(doc, [roomA.id, roomB.id], true);

    expect(next).toBe(doc);
  });

  it('does not move a locked room', () => {
    const room = { ...createRoom('Kitchen'), locked: true, position: { x: 80, y: 120 } };
    const doc = addRoom(createEmptyMap('Test'), room);

    const next = moveRoom(doc, room.id, { x: 200, y: 240 });

    expect(next.rooms[room.id].position).toEqual({ x: 80, y: 120 });
  });

  it('ignores locked rooms when moving multiple rooms', () => {
    const lockedRoom = { ...createRoom('Locked'), locked: true, position: { x: 80, y: 120 } };
    const freeRoom = { ...createRoom('Free'), position: { x: 200, y: 120 } };
    let doc = addRoom(createEmptyMap('Test'), lockedRoom);
    doc = addRoom(doc, freeRoom);

    const next = setRoomPositions(doc, {
      [lockedRoom.id]: { x: 160, y: 200 },
      [freeRoom.id]: { x: 280, y: 200 },
    });

    expect(next.rooms[lockedRoom.id].position).toEqual({ x: 80, y: 120 });
    expect(next.rooms[freeRoom.id].position).toEqual({ x: 280, y: 200 });
  });

  it('returns the original document when supplied room positions are unchanged', () => {
    const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
    const doc = addRoom(createEmptyMap('Test'), room);

    const next = setRoomPositions(doc, {
      [room.id]: { x: 80, y: 120 },
    });

    expect(next).toBe(doc);
  });
});

describe('setRoomShape', () => {
  it('updates the room shape', () => {
    const doc = createEmptyMap('Test');
    const room = createRoom('Gallery');
    const withRoom = addRoom(doc, room);

    const next = setRoomShape(withRoom, room.id, 'diamond');

    expect(next.rooms[room.id].shape).toBe('diamond');
    expect(withRoom.rooms[room.id].shape).toBe(room.shape);
  });
});

/* ------------------------------------------------------------------ */
/*  deleteRoom                                                         */
/* ------------------------------------------------------------------ */
describe('deleteRoom', () => {
  it('removes the room from the document', () => {
    const doc = createEmptyMap('Test');
    const room = createRoom('Doomed');
    const withRoom = addRoom(doc, room);

    const next = deleteRoom(withRoom, room.id);
    expect(next.rooms[room.id]).toBeUndefined();
  });

  it('does not mutate the original document', () => {
    const doc = createEmptyMap('Test');
    const room = createRoom('Survivor');
    const withRoom = addRoom(doc, room);
    deleteRoom(withRoom, room.id);

    expect(withRoom.rooms[room.id]).toBeDefined();
  });

  it('removes connections where the room is source or target', () => {
    const doc = createEmptyMap('Test');
    const r1 = createRoom('A');
    const r2 = createRoom('B');
    const r3 = createRoom('C');
    let d = addRoom(addRoom(addRoom(doc, r1), r2), r3);

    const c1 = createConnection(r1.id, r2.id);
    const c2 = createConnection(r3.id, r1.id);
    d = addConnection(d, c1, 'north');
    d = addConnection(d, c2, 'east');

    const next = deleteRoom(d, r1.id);
    expect(next.connections[c1.id]).toBeUndefined();
    expect(next.connections[c2.id]).toBeUndefined();
  });

  it('removes direction bindings in other rooms that referenced deleted connections', () => {
    const doc = createEmptyMap('Test');
    const r1 = createRoom('A');
    const r2 = createRoom('B');
    let d = addRoom(addRoom(doc, r1), r2);

    const conn = createConnection(r1.id, r2.id, true);
    d = addConnection(d, conn, 'north', 'south');

    const next = deleteRoom(d, r1.id);
    // r2's "south" binding should be gone
    expect(next.rooms[r2.id].directions['south']).toBeUndefined();
  });

  it('removes items that were in the deleted room', () => {
    const doc = createEmptyMap('Test');
    const room = createRoom('Room');
    let d = addRoom(doc, room);
    const item = createItem('Lost Sword', room.id);
    d = addItem(d, item);

    const next = deleteRoom(d, room.id);
    expect(next.items[item.id]).toBeUndefined();
  });

  it('removes only sticky-note links attached to the deleted room', () => {
    const kitchen = createRoom('Kitchen');
    const hall = createRoom('Hall');
    const note = createStickyNote('Mind the draft.');
    let doc = addRoom(addRoom(createEmptyMap('Test'), kitchen), hall);
    doc = addStickyNote(doc, note);
    const kitchenLink = createStickyNoteLink(note.id, kitchen.id);
    const hallLink = createStickyNoteLink(note.id, hall.id);
    doc = addStickyNoteLink(doc, kitchenLink);
    doc = addStickyNoteLink(doc, hallLink);

    const next = deleteRoom(doc, kitchen.id);

    expect(next.stickyNoteLinks[kitchenLink.id]).toBeUndefined();
    expect(next.stickyNoteLinks[hallLink.id]).toEqual(hallLink);
  });

  it('removes sticky-note links attached to pseudo-rooms orphaned by room deletion', () => {
    const kitchen = createRoom('Kitchen');
    const unknown = { ...createPseudoRoom('unknown'), position: { x: 240, y: 120 } };
    const note = createStickyNote('What kind of exit is this?');
    let doc = addRoom(createEmptyMap('Test'), kitchen);
    doc = addPseudoRoom(doc, unknown);
    doc = addConnection(doc, createConnection(kitchen.id, { kind: 'pseudo-room', id: unknown.id }, false), 'west');
    doc = addStickyNote(doc, note);
    const stickyNoteLink = createStickyNoteLink(note.id, { kind: 'pseudo-room', id: unknown.id });
    doc = addStickyNoteLink(doc, stickyNoteLink);

    const next = deleteRoom(doc, kitchen.id);

    expect(next.pseudoRooms[unknown.id]).toBeUndefined();
    expect(next.stickyNoteLinks[stickyNoteLink.id]).toBeUndefined();
  });

  it('throws if the room does not exist', () => {
    const doc = createEmptyMap('Test');
    expect(() => deleteRoom(doc, 'no-such-room')).toThrow(/not found/i);
  });
});

/* ------------------------------------------------------------------ */
/*  deleteConnection                                                   */
/* ------------------------------------------------------------------ */
describe('deleteConnection', () => {
  function connectedDoc() {
    const doc = createEmptyMap('Test');
    const r1 = createRoom('A');
    const r2 = createRoom('B');
    let d = addRoom(addRoom(doc, r1), r2);
    const conn = createConnection(r1.id, r2.id, true);
    d = addConnection(d, conn, 'north', 'south');
    return { doc: d, r1, r2, conn };
  }

  it('removes the connection from the document', () => {
    const { doc, conn } = connectedDoc();
    const next = deleteConnection(doc, conn.id);
    expect(next.connections[conn.id]).toBeUndefined();
  });

  it('removes direction bindings in source room', () => {
    const { doc, r1, conn } = connectedDoc();
    const next = deleteConnection(doc, conn.id);
    expect(next.rooms[r1.id].directions['north']).toBeUndefined();
  });

  it('removes direction bindings in target room', () => {
    const { doc, r2, conn } = connectedDoc();
    const next = deleteConnection(doc, conn.id);
    expect(next.rooms[r2.id].directions['south']).toBeUndefined();
  });

  it('does not mutate the original document', () => {
    const { doc, conn } = connectedDoc();
    deleteConnection(doc, conn.id);
    expect(doc.connections[conn.id]).toBeDefined();
  });

  it('throws if the connection does not exist', () => {
    const doc = createEmptyMap('Test');
    expect(() => deleteConnection(doc, 'no-such-conn')).toThrow(/not found/i);
  });

  it('removes multiple direction bindings that reference the same connection', () => {
    const doc = createEmptyMap('Test');
    const r1 = createRoom('A');
    const r2 = createRoom('B');
    let d = addRoom(addRoom(doc, r1), r2);
    const conn = createConnection(r1.id, r2.id);
    d = addConnection(d, conn, 'north');
    d = addConnection(d, conn, 'up');

    const next = deleteConnection(d, conn.id);
    expect(next.rooms[r1.id].directions['north']).toBeUndefined();
    expect(next.rooms[r1.id].directions['up']).toBeUndefined();
  });

  it('removes sticky-note links attached to a pseudo-room removed with its connection', () => {
    const kitchen = createRoom('Kitchen');
    const pseudoRoom = { ...createPseudoRoom('death'), position: { x: 240, y: 120 } };
    const stickyNote = createStickyNote('Fatal to enter.');
    let doc = addRoom(createEmptyMap('Test'), kitchen);
    doc = addPseudoRoom(doc, pseudoRoom);
    const connection = createConnection(kitchen.id, { kind: 'pseudo-room', id: pseudoRoom.id }, false);
    doc = addConnection(doc, connection, 'west');
    doc = addStickyNote(doc, stickyNote);
    const stickyNoteLink = createStickyNoteLink(stickyNote.id, { kind: 'pseudo-room', id: pseudoRoom.id });
    doc = addStickyNoteLink(doc, stickyNoteLink);

    const next = deleteConnection(doc, connection.id);

    expect(next.pseudoRooms[pseudoRoom.id]).toBeUndefined();
    expect(next.stickyNoteLinks[stickyNoteLink.id]).toBeUndefined();
  });
});

describe('rerouteConnectionEndpoint', () => {
  it('rerouting the target end to a room body keeps only the source direction', () => {
    const kitchen = createRoom('Kitchen');
    const hallway = createRoom('Hallway');
    const cellar = createRoom('Cellar');
    let doc = addRoom(addRoom(addRoom(createEmptyMap('Test'), kitchen), hallway), cellar);
    const connection = createConnection(kitchen.id, hallway.id, true);
    doc = addConnection(doc, connection, 'east', 'west');

    const next = rerouteConnectionEndpoint(doc, connection.id, 'end', cellar.id);

    expect(next.connections[connection.id]).toMatchObject({
      sourceRoomId: kitchen.id,
      target: { kind: 'room', id: cellar.id },
      isBidirectional: false,
    });
    expect(next.rooms[kitchen.id].directions.east).toBe(connection.id);
    expect(next.rooms[hallway.id].directions.west).toBeUndefined();
    expect(next.rooms[cellar.id].directions).toEqual({});
  });

  it('rerouting the end to a room handle converts a one-way connection into a bidirectional one', () => {
    const kitchen = createRoom('Kitchen');
    const hallway = createRoom('Hallway');
    let doc = addRoom(addRoom(createEmptyMap('Test'), kitchen), hallway);
    const connection = createConnection(kitchen.id, hallway.id, false);
    doc = addConnection(doc, connection, 'north');

    const next = rerouteConnectionEndpoint(doc, connection.id, 'end', hallway.id, 'south');

    expect(next.connections[connection.id].isBidirectional).toBe(true);
    expect(next.rooms[kitchen.id].directions.north).toBe(connection.id);
    expect(next.rooms[hallway.id].directions.south).toBe(connection.id);
  });

  it('rerouting the start end to a room body swaps source and target to keep one-way semantics valid', () => {
    const kitchen = createRoom('Kitchen');
    const hallway = createRoom('Hallway');
    const cellar = createRoom('Cellar');
    let doc = addRoom(addRoom(addRoom(createEmptyMap('Test'), kitchen), hallway), cellar);
    const connection = createConnection(kitchen.id, hallway.id, true);
    doc = addConnection(doc, connection, 'east', 'west');

    const next = rerouteConnectionEndpoint(doc, connection.id, 'start', cellar.id);

    expect(next.connections[connection.id]).toMatchObject({
      sourceRoomId: hallway.id,
      target: { kind: 'room', id: cellar.id },
      isBidirectional: false,
    });
    expect(next.rooms[kitchen.id].directions.east).toBeUndefined();
    expect(next.rooms[hallway.id].directions.west).toBe(connection.id);
  });

  it('rejects reroutes onto a direction already occupied by another connection', () => {
    const kitchen = createRoom('Kitchen');
    const hallway = createRoom('Hallway');
    const attic = createRoom('Attic');
    let doc = addRoom(addRoom(addRoom(createEmptyMap('Test'), kitchen), hallway), attic);
    const first = createConnection(kitchen.id, hallway.id, false);
    doc = addConnection(doc, first, 'north');
    const second = createConnection(attic.id, hallway.id, true);
    doc = addConnection(doc, second, 'east', 'south');

    expect(() => rerouteConnectionEndpoint(doc, first.id, 'end', hallway.id, 'south')).toThrow(/already bound/i);
  });

  it('deletes an orphaned pseudo-room when rerouting away from it', () => {
    const kitchen = createRoom('Kitchen');
    const hallway = createRoom('Hallway');
    const unknown = { ...createPseudoRoom('unknown'), position: { x: 240, y: 120 } };
    let doc = addRoom(addRoom(createEmptyMap('Test'), kitchen), hallway);
    doc = addPseudoRoom(doc, unknown);
    const connection = createConnection(kitchen.id, { kind: 'pseudo-room', id: unknown.id }, false);
    doc = addConnection(doc, connection, 'east');

    const next = rerouteConnectionEndpoint(doc, connection.id, 'end', hallway.id, 'west');

    expect(next.pseudoRooms[unknown.id]).toBeUndefined();
    expect(next.connections[connection.id]).toMatchObject({
      target: { kind: 'room', id: hallway.id },
      isBidirectional: true,
    });
    expect(next.rooms[hallway.id].directions.west).toBe(connection.id);
  });
});

describe('convertPseudoRoomToRoom', () => {
  it('retargets sticky-note links from a pseudo-room to the replacement room', () => {
    const pseudoRoom = { ...createPseudoRoom('unknown'), position: { x: 240, y: 120 } };
    const replacementRoom = { ...createRoom('Closet'), position: pseudoRoom.position };
    const stickyNote = createStickyNote('Actually this is a real place.');
    let doc = addPseudoRoom(createEmptyMap('Test'), pseudoRoom);
    doc = addStickyNote(doc, stickyNote);
    const stickyNoteLink = createStickyNoteLink(stickyNote.id, { kind: 'pseudo-room', id: pseudoRoom.id });
    doc = addStickyNoteLink(doc, stickyNoteLink);

    const next = convertPseudoRoomToRoom(doc, pseudoRoom.id, replacementRoom);

    expect(next.pseudoRooms[pseudoRoom.id]).toBeUndefined();
    expect(next.rooms[replacementRoom.id]).toEqual(replacementRoom);
    expect(next.stickyNoteLinks[stickyNoteLink.id]).toMatchObject({
      stickyNoteId: stickyNote.id,
      target: { kind: 'room', id: replacementRoom.id },
    });
  });
});

describe('setRoomDark', () => {
  it('updates the room lighting flag', () => {
    const room = createRoom('Kitchen');
    const doc = addRoom(createEmptyMap('Test'), room);

    const next = setRoomDark(doc, room.id, true);

    expect(next.rooms[room.id]?.isDark).toBe(true);
    expect(doc.rooms[room.id]?.isDark).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  deleteItem                                                         */
/* ------------------------------------------------------------------ */
describe('deleteItem', () => {
  it('removes the item from the document', () => {
    const doc = createEmptyMap('Test');
    const room = createRoom('R');
    let d = addRoom(doc, room);
    const item = createItem('Axe', room.id);
    d = addItem(d, item);

    const next = deleteItem(d, item.id);
    expect(next.items[item.id]).toBeUndefined();
  });

  it('does not mutate the original document', () => {
    const doc = createEmptyMap('Test');
    const room = createRoom('R');
    let d = addRoom(doc, room);
    const item = createItem('Shield', room.id);
    d = addItem(d, item);

    deleteItem(d, item.id);
    expect(d.items[item.id]).toBeDefined();
  });

  it('throws if the item does not exist', () => {
    const doc = createEmptyMap('Test');
    expect(() => deleteItem(doc, 'no-such-item')).toThrow(/not found/i);
  });
});

/* ------------------------------------------------------------------ */
/*  describeRoom                                                       */
/* ------------------------------------------------------------------ */
describe('describeRoom', () => {
  it('sets the description on a room', () => {
    const doc = createEmptyMap('Test');
    const room = createRoom('Hall');
    const d = addRoom(doc, room);

    const next = describeRoom(d, room.id, 'A grand hall with marble floors.');
    expect(next.rooms[room.id].description).toBe('A grand hall with marble floors.');
  });

  it('does not mutate the original document', () => {
    const doc = createEmptyMap('Test');
    const room = createRoom('Hall');
    const d = addRoom(doc, room);

    describeRoom(d, room.id, 'New description');
    expect(d.rooms[room.id].description).toBe('');
  });

  it('throws if the room does not exist', () => {
    const doc = createEmptyMap('Test');
    expect(() => describeRoom(doc, 'nope', 'text')).toThrow(/not found/i);
  });
});

/* ------------------------------------------------------------------ */
/*  describeItem                                                       */
/* ------------------------------------------------------------------ */
describe('describeItem', () => {
  it('sets the description on an item', () => {
    const doc = createEmptyMap('Test');
    const room = createRoom('R');
    let d = addRoom(doc, room);
    const item = createItem('Lantern', room.id);
    d = addItem(d, item);

    const next = describeItem(d, item.id, 'A beaten brass lantern.');
    expect(next.items[item.id].description).toBe('A beaten brass lantern.');
  });

  it('does not mutate the original document', () => {
    const doc = createEmptyMap('Test');
    const room = createRoom('R');
    let d = addRoom(doc, room);
    const item = createItem('Lamp', room.id);
    d = addItem(d, item);

    describeItem(d, item.id, 'Shiny');
    expect(d.items[item.id].description).toBe('');
  });

  it('throws if the item does not exist', () => {
    const doc = createEmptyMap('Test');
    expect(() => describeItem(doc, 'nope', 'text')).toThrow(/not found/i);
  });
});

describe('style and annotation setters', () => {
  it('throws when setting a shape on a missing room', () => {
    expect(() => setRoomShape(createEmptyMap('Test'), 'missing-room', 'diamond')).toThrow(/not found/i);
  });

  it('throws when setting style on a missing room', () => {
    expect(() => setRoomStyle(createEmptyMap('Test'), 'missing-room', { fillColorIndex: 1 })).toThrow(/not found/i);
  });

  it('throws when setting style on a missing connection', () => {
    expect(() => setConnectionStyle(createEmptyMap('Test'), 'missing-connection', { strokeColorIndex: 1 })).toThrow(/not found/i);
  });

  it('throws when setting annotation on a missing connection', () => {
    expect(() => setConnectionAnnotation(createEmptyMap('Test'), 'missing-connection', { kind: 'door' })).toThrow(/not found/i);
  });

  it('throws when setting labels on a missing connection', () => {
    expect(() => setConnectionLabels(createEmptyMap('Test'), 'missing-connection', { startLabel: 'ledge' })).toThrow(/not found/i);
  });
});
