import { describe, expect, it } from '@jest/globals';
import {
  CURRENT_SCHEMA_VERSION,
  createConnection,
  createEmptyMap,
  createItem,
  createRoom,
  type Connection,
  type Item,
  type MapDocument,
} from '../../src/domain/map-types';
import { addConnection, addItem, addRoom } from '../../src/domain/map-operations';
import {
  MapValidationError,
  parseUntrustedMapDocument,
  validateMap,
  type ValidationResult,
} from '../../src/domain/validation';

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

describe('parseUntrustedMapDocument', () => {
  it('rejects non-object input', () => {
    expect(() => parseUntrustedMapDocument(null)).toThrow(MapValidationError);
    expect(() => parseUntrustedMapDocument('bad')).toThrow('File does not contain a valid fweep map.');
  });

  it('rejects unsupported schema versions', () => {
    const doc = {
      ...validMap(),
      schemaVersion: CURRENT_SCHEMA_VERSION + 1,
    };

    expect(() => parseUntrustedMapDocument(doc)).toThrow('This fweep map uses an unsupported schema version.');
  });

  it('rejects missing metadata fields', () => {
    const doc = validMap();
    const broken = {
      ...doc,
      metadata: {
        ...doc.metadata,
        updatedAt: 123,
      },
    };

    expect(() => parseUntrustedMapDocument(broken)).toThrow('File does not contain a valid fweep map.');
  });

  it('rejects non-finite room positions', () => {
    const doc = validMap();
    const roomId = Object.keys(doc.rooms)[0];
    const broken = {
      ...doc,
      rooms: {
        ...doc.rooms,
        [roomId]: {
          ...doc.rooms[roomId],
          position: { x: Number.NaN, y: 0 },
        },
      },
    };

    expect(() => parseUntrustedMapDocument(broken)).toThrow('File does not contain a valid fweep map.');
  });

  it('rejects direction bindings with non-string values', () => {
    const doc = validMap();
    const roomId = Object.keys(doc.rooms)[0];
    const broken = {
      ...doc,
      rooms: {
        ...doc.rooms,
        [roomId]: {
          ...doc.rooms[roomId],
          directions: { north: 42 },
        },
      },
    };

    expect(() => parseUntrustedMapDocument(broken)).toThrow(MapValidationError);
  });

  it('rejects invalid room colors', () => {
    const doc = validMap();
    const roomId = Object.keys(doc.rooms)[0];
    const broken = {
      ...doc,
      rooms: {
        ...doc.rooms,
        [roomId]: {
          ...doc.rooms[roomId],
          fillColor: 'red',
        },
      },
    };

    expect(() => parseUntrustedMapDocument(broken)).toThrow(MapValidationError);
  });

  it('rejects connection entries with non-boolean directionality', () => {
    const doc = validMap();
    const connectionId = Object.keys(doc.connections)[0];
    const broken = {
      ...doc,
      connections: {
        ...doc.connections,
        [connectionId]: {
          ...doc.connections[connectionId],
          isBidirectional: 'yes',
        },
      },
    };

    expect(() => parseUntrustedMapDocument(broken)).toThrow(MapValidationError);
  });

  it('rejects item entries with missing boolean flags', () => {
    const doc = validMap();
    const itemId = Object.keys(doc.items)[0];
    const { isScenery: _isScenery, ...rest } = doc.items[itemId];
    const broken = {
      ...doc,
      items: {
        ...doc.items,
        [itemId]: rest,
      },
    };

    expect(() => parseUntrustedMapDocument(broken)).toThrow(MapValidationError);
  });

  it('rejects record entries whose internal ids do not match their keys', () => {
    const doc = validMap();
    const roomId = Object.keys(doc.rooms)[0];
    const broken = {
      ...doc,
      rooms: {
        ...doc.rooms,
        [roomId]: {
          ...doc.rooms[roomId],
          id: 'different-id',
        },
      },
    };

    expect(() => parseUntrustedMapDocument(broken)).toThrow(MapValidationError);
  });

  it('hydrates missing legacy room shape and style fields', () => {
    const doc = createEmptyMap('Legacy');
    const roomId = crypto.randomUUID();
    const legacyDoc = {
      ...doc,
      rooms: {
        [roomId]: {
          id: roomId,
          name: 'Kitchen',
          description: '',
          position: { x: 0, y: 0 },
          directions: {},
          isDark: false,
        },
      },
      connections: {},
      items: {},
    };

    const parsed = parseUntrustedMapDocument(legacyDoc);

    expect(parsed.rooms[roomId].shape).toBe('rectangle');
    expect(parsed.rooms[roomId].fillColor).toBe('#ffffff');
    expect(parsed.rooms[roomId].strokeColor).toBe('#6366f1');
    expect(parsed.rooms[roomId].strokeStyle).toBe('solid');
  });

  it('rejects overlong map names', () => {
    const doc = {
      ...validMap(),
      metadata: {
        ...validMap().metadata,
        name: 'x'.repeat(201),
      },
    };

    expect(() => parseUntrustedMapDocument(doc)).toThrow(MapValidationError);
  });
});

describe('validateMap', () => {
  it('returns no errors or warnings for a valid map', () => {
    const result = validateMap(validMap());
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

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
    expect(result.errors.some((e) => /item.*room/i.test(e.message))).toBe(true);
  });

  it('warns about unreachable rooms', () => {
    const doc = createEmptyMap('Lonely');
    const r1 = createRoom('Connected A');
    const r2 = createRoom('Connected B');
    const r3 = createRoom('Island');
    let d = addRoom(addRoom(addRoom(doc, r1), r2), r3);
    const conn = createConnection(r1.id, r2.id);
    d = addConnection(d, conn, 'east');

    const result = validateMap(d);
    expect(result.warnings.some((w) => w.message.includes(r3.name))).toBe(true);
  });

  it('returns structured issues with paths', () => {
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
    const result: ValidationResult = validateMap(broken);
    const err = result.errors.find((e) => e.entityId === 'bad-item');
    expect(err).toBeDefined();
    expect(err?.path).toBe(`items.${badItem.id}.roomId`);
  });
});
