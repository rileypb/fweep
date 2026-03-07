import { describe, it, expect, beforeEach } from '@jest/globals';
import { createEmptyMap, createRoom } from '../../src/domain/map-types';
import type { MapDocument } from '../../src/domain/map-types';
import { addRoom, renameRoom } from '../../src/domain/map-operations';

describe('renameRoom', () => {
  let doc: MapDocument;
  const room = { ...createRoom('Kitchen'), id: 'r1' };

  beforeEach(() => {
    doc = addRoom(createEmptyMap('Test'), room);
  });

  it('updates the room name', () => {
    const result = renameRoom(doc, 'r1', 'Pantry');
    expect(result.rooms['r1'].name).toBe('Pantry');
  });

  it('does not mutate the original document', () => {
    const result = renameRoom(doc, 'r1', 'Pantry');
    expect(doc.rooms['r1'].name).toBe('Kitchen');
    expect(result).not.toBe(doc);
  });

  it('updates the updatedAt timestamp', () => {
    const before = doc.metadata.updatedAt;
    const result = renameRoom(doc, 'r1', 'Pantry');
    expect(result.metadata.updatedAt >= before).toBe(true);
  });

  it('throws when room does not exist', () => {
    expect(() => renameRoom(doc, 'nonexistent', 'X')).toThrow(/not found/i);
  });

  it('allows renaming to an empty string', () => {
    const result = renameRoom(doc, 'r1', '');
    expect(result.rooms['r1'].name).toBe('');
  });
});
