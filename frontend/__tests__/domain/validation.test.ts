import { describe, it, expect } from '@jest/globals';
import {
  createEmptyMap,
  createRoom,
  createConnection,
  createItem,
  type MapDocument,
  type Room,
  type Connection,
  type Item,
} from '../../src/domain/map-types';
import { addRoom, addConnection, addItem } from '../../src/domain/map-operations';
import { validateMap, type ValidationResult } from '../../src/domain/validation';

/** Build a valid two-room map for tests to mutate. */
function validMap(): MapDocument {
  const doc = createEmptyMap('Valid');
  const r1 = createRoom('A');
  const r2 = createRoom('B');
  let d = addRoom(addRoom(doc, r1), r2);
  const conn = createConnection(r1.id, r2.id, true);
  d = addConnection(d, conn, 'north', 'south');
  const item = createItem('Sword', r1.id);
  d = addItem(d, item);
  return d;
}

describe('validateMap', () => {
  it('returns no errors or warnings for a valid map', () => {
    const result = validateMap(validMap());
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  /* ---- Errors ---- */

  it('reports an error when a connection references a missing source room', () => {
    const d = validMap();
    const badConn: Connection = {
      id: 'bad-conn',
      sourceRoomId: 'missing-room',
      targetRoomId: Object.keys(d.rooms)[0],
      isBidirectional: false,
    };
    const broken: MapDocument = {
      ...d,
      connections: { ...d.connections, [badConn.id]: badConn },
    };
    const result = validateMap(broken);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors.some((e) => /source room/i.test(e.message))).toBe(true);
  });

  it('reports an error when a connection references a missing target room', () => {
    const d = validMap();
    const badConn: Connection = {
      id: 'bad-conn',
      sourceRoomId: Object.keys(d.rooms)[0],
      targetRoomId: 'missing-room',
      isBidirectional: false,
    };
    const broken: MapDocument = {
      ...d,
      connections: { ...d.connections, [badConn.id]: badConn },
    };
    const result = validateMap(broken);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors.some((e) => /target room/i.test(e.message))).toBe(true);
  });

  it('reports an error when a room direction binding references a missing connection', () => {
    const d = validMap();
    const roomId = Object.keys(d.rooms)[0];
    const room = d.rooms[roomId];
    const broken: MapDocument = {
      ...d,
      rooms: {
        ...d.rooms,
        [roomId]: {
          ...room,
          directions: { ...room.directions, west: 'nonexistent-conn' },
        },
      },
    };
    const result = validateMap(broken);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors.some((e) => /direction.*binding/i.test(e.message))).toBe(true);
  });

  it('reports an error when an item references a missing room', () => {
    const d = validMap();
    const badItem: Item = {
      id: 'orphan-item',
      name: 'Ghost',
      description: '',
      roomId: 'nonexistent-room',
      isScenery: false,
      isContainer: false,
      isSupporter: false,
      isLightSource: false,
    };
    const broken: MapDocument = {
      ...d,
      items: { ...d.items, [badItem.id]: badItem },
    };
    const result = validateMap(broken);
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors.some((e) => /item.*room/i.test(e.message))).toBe(true);
  });

  /* ---- Warnings ---- */

  it('warns about unreachable rooms (rooms with no connections)', () => {
    const doc = createEmptyMap('Lonely');
    const r1 = createRoom('Connected A');
    const r2 = createRoom('Connected B');
    const r3 = createRoom('Island');
    let d = addRoom(addRoom(addRoom(doc, r1), r2), r3);
    const conn = createConnection(r1.id, r2.id);
    d = addConnection(d, conn, 'east');

    const result = validateMap(d);
    expect(result.warnings.length).toBeGreaterThanOrEqual(1);
    expect(result.warnings.some((w) => w.message.includes(r3.name))).toBe(true);
  });

  it('does not warn about unreachable rooms when there is only one room', () => {
    const doc = createEmptyMap('Solo');
    const room = createRoom('Only Room');
    const d = addRoom(doc, room);

    const result = validateMap(d);
    expect(result.warnings).toHaveLength(0);
  });

  /* ---- Structured result ---- */

  it('returns structured error objects with entityId and message', () => {
    const d = validMap();
    const badItem: Item = {
      id: 'bad-item',
      name: 'Phantom',
      description: '',
      roomId: 'void',
      isScenery: false,
      isContainer: false,
      isSupporter: false,
      isLightSource: false,
    };
    const broken: MapDocument = {
      ...d,
      items: { ...d.items, [badItem.id]: badItem },
    };
    const result = validateMap(broken);
    const err = result.errors.find((e) => e.entityId === 'bad-item');
    expect(err).toBeDefined();
    expect(err!.entityType).toBe('item');
    expect(err!.message).toBeTruthy();
  });
});
