import { describe, it, expect } from '@jest/globals';
import { createEmptyMap, createRoom, createConnection, CURRENT_SCHEMA_VERSION } from '../../src/domain/map-types';

describe('createEmptyMap', () => {
  it('creates a map with the given name', () => {
    const doc = createEmptyMap('Test Map');
    expect(doc.metadata.name).toBe('Test Map');
  });

  it('assigns a unique ID', () => {
    const a = createEmptyMap('A');
    const b = createEmptyMap('B');
    expect(a.metadata.id).toBeTruthy();
    expect(b.metadata.id).toBeTruthy();
    expect(a.metadata.id).not.toBe(b.metadata.id);
  });

  it('uses the current schema version', () => {
    const doc = createEmptyMap('Versioned');
    expect(doc.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('sets createdAt and updatedAt to the same ISO timestamp', () => {
    const doc = createEmptyMap('Timestamps');
    expect(doc.metadata.createdAt).toBe(doc.metadata.updatedAt);
    // Verify it's a valid ISO date
    expect(new Date(doc.metadata.createdAt).toISOString()).toBe(doc.metadata.createdAt);
  });

  it('initialises with empty rooms, connections, and items', () => {
    const doc = createEmptyMap('Empty');
    expect(doc.view).toEqual({
      pan: { x: 0, y: 0 },
      showGrid: true,
      snapToGrid: true,
      useBezierConnections: false,
    });
    expect(doc.background).toEqual({
      layers: {},
      activeLayerId: null,
    });
    expect(doc.rooms).toEqual({});
    expect(doc.connections).toEqual({});
    expect(doc.items).toEqual({});
  });
});

describe('createRoom', () => {
  it('initialises default room styling', () => {
    const room = createRoom('Kitchen');

    expect(room.fillColorIndex).toBe(0);
    expect(room.strokeColorIndex).toBe(0);
    expect(room.strokeStyle).toBe('solid');
  });
});

describe('createConnection', () => {
  it('initialises default connection styling and annotation', () => {
    const connection = createConnection('room-a', 'room-b');

    expect(connection.annotation).toBeNull();
    expect(connection.startLabel).toBe('');
    expect(connection.endLabel).toBe('');
    expect(connection.strokeColorIndex).toBe(0);
    expect(connection.strokeStyle).toBe('solid');
  });
});
