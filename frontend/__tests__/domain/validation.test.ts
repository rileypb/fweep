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

  it('rejects a non-numeric schema version', () => {
    const broken = {
      ...validMap(),
      schemaVersion: '1',
    };

    expect(() => parseUntrustedMapDocument(broken)).toThrow('File does not contain a valid fweep map.');
  });

  it('rejects empty map names', () => {
    const doc = validMap();
    const broken = {
      ...doc,
      metadata: {
        ...doc.metadata,
        name: '   ',
      },
    };

    expect(() => parseUntrustedMapDocument(broken)).toThrow(MapValidationError);
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
          fillColorIndex: 99,
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
    expect(parsed.rooms[roomId].fillColorIndex).toBe(0);
    expect(parsed.rooms[roomId].strokeColorIndex).toBe(0);
    expect(parsed.rooms[roomId].strokeStyle).toBe('solid');
  });

  it('hydrates missing background metadata on legacy maps', () => {
    const doc = validMap();
    const legacyDoc = {
      schemaVersion: doc.schemaVersion,
      metadata: doc.metadata,
      view: doc.view,
      rooms: doc.rooms,
      connections: doc.connections,
      items: doc.items,
    };

    const parsed = parseUntrustedMapDocument(legacyDoc);
    expect(parsed.background).toEqual({
      layers: {},
      activeLayerId: null,
      referenceImage: null,
    });
  });

  it('hydrates missing view metadata on legacy maps', () => {
    const doc = validMap();
    const legacyDoc = {
      schemaVersion: doc.schemaVersion,
      metadata: doc.metadata,
      rooms: doc.rooms,
      connections: doc.connections,
      items: doc.items,
      background: doc.background,
    };

    const parsed = parseUntrustedMapDocument(legacyDoc);
    expect(parsed.view).toEqual({
      pan: { x: 0, y: 0 },
      zoom: 1,
      showGrid: true,
      snapToGrid: true,
      useBezierConnections: false,
    });
  });

  it('rejects invalid view and background container objects', () => {
    const doc = validMap();
    const broken = {
      ...doc,
      view: 'not-an-object',
      background: 'not-an-object',
    };

    expect(() => parseUntrustedMapDocument(broken)).toThrow(MapValidationError);
  });

  it('rejects malformed background layers', () => {
    const doc = validMap();
    const broken = {
      ...doc,
      background: {
        layers: {
          layer1: {
            id: 'layer1',
            name: 'Background',
            visible: true,
            opacity: 2,
            pixelSize: 1,
            chunkSize: 256,
          },
        },
        activeLayerId: 'layer1',
        referenceImage: null,
      },
    };

    expect(() => parseUntrustedMapDocument(broken)).toThrow(MapValidationError);
  });

  it('rejects invalid background layer metadata and unknown active layers', () => {
    const doc = validMap();
    const broken = {
      ...doc,
      background: {
        layers: {
          layer1: {
            id: 'layer1',
            name: 'Background',
            visible: true,
            opacity: 0.5,
            pixelSize: 2,
            chunkSize: 128,
          },
        },
        activeLayerId: 'missing-layer',
        referenceImage: null,
      },
    };

    expect(() => parseUntrustedMapDocument(broken)).toThrow(MapValidationError);
  });

  it('maps legacy direct color values onto palette indices', () => {
    const doc = validMap();
    const roomId = Object.keys(doc.rooms)[0];
    const legacyDoc = {
      ...doc,
      rooms: {
        ...doc.rooms,
        [roomId]: {
          ...doc.rooms[roomId],
          fillColor: '#ffcc00',
          strokeColor: '#166534',
          fillColorIndex: undefined,
          strokeColorIndex: undefined,
        },
      },
    };

    const parsed = parseUntrustedMapDocument(legacyDoc);

    expect(parsed.rooms[roomId].fillColorIndex).toBe(2);
    expect(parsed.rooms[roomId].strokeColorIndex).toBe(4);
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

  it('accepts a structured connection annotation', () => {
    const doc = validMap();
    const connectionId = Object.keys(doc.connections)[0];
    const annotated = {
      ...doc,
      connections: {
        ...doc.connections,
        [connectionId]: {
          ...doc.connections[connectionId],
          annotation: { kind: 'door' },
        },
      },
    };

    const parsed = parseUntrustedMapDocument(annotated);
    expect(parsed.connections[connectionId].annotation).toEqual({ kind: 'door' });
  });

  it('accepts connection endpoint labels', () => {
    const doc = validMap();
    const connectionId = Object.keys(doc.connections)[0];
    const labelled = {
      ...doc,
      connections: {
        ...doc.connections,
        [connectionId]: {
          ...doc.connections[connectionId],
          startLabel: 'cliff edge',
          endLabel: 'bridge',
        },
      },
    };

    const parsed = parseUntrustedMapDocument(labelled);
    expect(parsed.connections[connectionId].startLabel).toBe('cliff edge');
    expect(parsed.connections[connectionId].endLabel).toBe('bridge');
  });

  it('rejects text annotations without text', () => {
    const doc = validMap();
    const connectionId = Object.keys(doc.connections)[0];
    const annotated = {
      ...doc,
      connections: {
        ...doc.connections,
        [connectionId]: {
          ...doc.connections[connectionId],
          annotation: { kind: 'text' },
        },
      },
    };

    expect(() => parseUntrustedMapDocument(annotated)).toThrow(MapValidationError);
  });

  it('rejects invalid room, connection, item, sticky note, and sticky note link fields', () => {
    const doc = validMap();
    const roomId = Object.keys(doc.rooms)[0];
    const secondRoomId = Object.keys(doc.rooms)[1];
    const connectionId = Object.keys(doc.connections)[0];
    const itemId = Object.keys(doc.items)[0];
    const directions = Object.fromEntries(
      Array.from({ length: 65 }, (_, index) => [`dir-${index}`, connectionId]),
    );

    const broken = {
      ...doc,
      rooms: {
        ...doc.rooms,
        [roomId]: {
          ...doc.rooms[roomId],
          shape: 'triangle',
          fillColorIndex: undefined,
          fillColor: 123,
          strokeColorIndex: undefined,
          strokeColor: '#not-a-real-color',
          strokeStyle: 'wavy',
          directions,
        },
      },
      connections: {
        ...doc.connections,
        [connectionId]: {
          ...doc.connections[connectionId],
          id: 'different-connection-id',
          annotation: { kind: 'text', text: 123 },
          startLabel: 5,
          endLabel: false,
          strokeColorIndex: 999,
          strokeStyle: 'wavy',
        },
      },
      items: {
        ...doc.items,
        [itemId]: {
          ...doc.items[itemId],
          id: 'different-item-id',
          description: 'x'.repeat(10_001),
        },
      },
      stickyNotes: {
        note1: {
          id: 'different-note-id',
          text: 'x'.repeat(10_001),
          position: { x: 1, y: 2 },
        },
      },
      stickyNoteLinks: {
        link1: {
          id: 'different-link-id',
          stickyNoteId: 'note1',
          roomId: secondRoomId,
        },
      },
    };

    expect(() => parseUntrustedMapDocument(broken)).toThrow(MapValidationError);
  });

  it('rejects non-object rooms, connections, sticky notes, sticky note links, and items collections', () => {
    const doc = validMap();
    const broken = {
      ...doc,
      rooms: 'bad',
      connections: 'bad',
      stickyNotes: 'bad',
      stickyNoteLinks: 'bad',
      items: 'bad',
    };

    expect(() => parseUntrustedMapDocument(broken)).toThrow(MapValidationError);
  });

  it('rejects non-object item, sticky note, and sticky note link entries', () => {
    const doc = validMap();
    const broken = {
      ...doc,
      items: {
        badItem: 'bad',
      },
      stickyNotes: {
        badNote: 'bad',
      },
      stickyNoteLinks: {
        badLink: 'bad',
      },
    };

    expect(() => parseUntrustedMapDocument(broken)).toThrow(MapValidationError);
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
      ...createConnection('missing-room', Object.keys(d.rooms)[0], false),
      id: 'bad-conn',
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
      ...createConnection(Object.keys(d.rooms)[0], 'missing-room', false),
      id: 'bad-conn',
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

  it('reports errors when sticky note links reference missing sticky notes or rooms', () => {
    const d = validMap();
    const broken: MapDocument = {
      ...d,
      stickyNotes: {},
      stickyNoteLinks: {
        link1: {
          id: 'link1',
          stickyNoteId: 'missing-note',
          roomId: 'missing-room',
        },
      },
    };

    const result = validateMap(broken);
    expect(result.errors.some((e) => /missing sticky note/i.test(e.message))).toBe(true);
    expect(result.errors.some((e) => /missing room/i.test(e.message))).toBe(true);
  });
});
