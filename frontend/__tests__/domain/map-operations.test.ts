import { describe, it, expect } from '@jest/globals';
import {
  createEmptyMap,
  createRoom,
  createConnection,
  createItem,
} from '../../src/domain/map-types';
import {
  addRoom,
  addConnection,
  addItem,
  deleteRoom,
  deleteConnection,
  deleteItem,
  describeRoom,
  describeItem,
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
