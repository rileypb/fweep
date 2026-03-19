import { describe, expect, it } from '@jest/globals';
import { createConnection, createEmptyMap, createPseudoRoom, createRoom } from '../../src/domain/map-types';
import {
  getConnectionTargetPosition,
  getConnectionTargetRoom,
  getPseudoRoomGlyph,
  getPseudoRoomNodeDimensions,
  getPseudoRoomSymbolLayout,
  getPseudoRoomSymbolLayoutForRoom,
  insetPseudoRoomConnectionEndpoint,
  isPseudoRoom,
  isPseudoRoomTarget,
  toPseudoRoomVisualRoom,
} from '../../src/domain/pseudo-room-helpers';
import { addPseudoRoom, addRoom } from '../../src/domain/map-operations';

describe('pseudo-room-helpers', () => {
  it('recognizes pseudo-room targets', () => {
    expect(isPseudoRoomTarget({ kind: 'pseudo-room', id: 'pseudo-1' })).toBe(true);
    expect(isPseudoRoomTarget({ kind: 'room', id: 'room-1' })).toBe(false);
  });

  it('returns glyphs for every pseudo-room kind', () => {
    expect(getPseudoRoomGlyph('unknown')).toBe('?');
    expect(getPseudoRoomGlyph('infinite')).toBe('∞');
    expect(getPseudoRoomGlyph('death')).toBe('☠');
    expect(getPseudoRoomGlyph('nowhere')).toBe('✕');
  });

  it('creates a visual room wrapper for pseudo-rooms and supports position overrides', () => {
    const pseudoRoom = { ...createPseudoRoom('death'), id: 'pseudo-1', position: { x: 10, y: 20 } };

    expect(toPseudoRoomVisualRoom(pseudoRoom)).toMatchObject({
      id: 'pseudo-1',
      name: '☠',
      position: { x: 10, y: 20 },
      shape: 'oval',
      directions: {},
      strokeStyle: 'solid',
    });
    expect(toPseudoRoomVisualRoom(pseudoRoom, { position: { x: 30, y: 40 } }).position).toEqual({ x: 30, y: 40 });
  });

  it('computes pseudo-room symbol layout from the visual room geometry', () => {
    const pseudoRoom = { ...createPseudoRoom('nowhere'), position: { x: 0, y: 0 } };
    const visualRoom = toPseudoRoomVisualRoom(pseudoRoom);

    expect(getPseudoRoomSymbolLayout(pseudoRoom, 'default')).toEqual(
      getPseudoRoomSymbolLayoutForRoom(visualRoom, 'default'),
    );
    expect(getPseudoRoomSymbolLayout(pseudoRoom, 'default').size).toBe(26);
  });

  it('scales pseudo-room dimensions down from normal room size', () => {
    const pseudoRoom = { ...createPseudoRoom('unknown'), position: { x: 0, y: 0 } };

    expect(getPseudoRoomNodeDimensions(pseudoRoom, 'default')).toEqual({ width: 51, height: 29 });
    expect(getPseudoRoomNodeDimensions(pseudoRoom, 'square-classic')).toEqual({ width: 42, height: 42 });
  });

  it('resolves connection targets and positions for rooms and pseudo-rooms', () => {
    const room = { ...createRoom('Kitchen'), id: 'room-1', position: { x: 10, y: 20 } };
    const pseudoRoom = { ...createPseudoRoom('unknown'), id: 'pseudo-1', position: { x: 30, y: 40 } };
    let doc = addRoom(createEmptyMap('Test'), room);
    doc = addPseudoRoom(doc, pseudoRoom);

    const roomConnection = createConnection(room.id, room.id, false);
    const pseudoConnection = createConnection(room.id, { kind: 'pseudo-room', id: pseudoRoom.id }, false);
    const missingConnection = createConnection(room.id, { kind: 'pseudo-room', id: 'missing' }, false);

    expect(getConnectionTargetRoom(doc, roomConnection)).toEqual(room);
    expect(getConnectionTargetRoom(doc, pseudoConnection)).toEqual(pseudoRoom);
    expect(getConnectionTargetRoom(doc, missingConnection)).toBeNull();
    expect(getConnectionTargetPosition(doc, roomConnection)).toEqual({ x: 10, y: 20 });
    expect(getConnectionTargetPosition(doc, pseudoConnection)).toEqual({ x: 30, y: 40 });
    expect(getConnectionTargetPosition(doc, missingConnection)).toBeNull();
  });

  it('distinguishes rooms from pseudo-rooms', () => {
    expect(isPseudoRoom(createRoom('Kitchen'))).toBe(false);
    expect(isPseudoRoom(createPseudoRoom('unknown'))).toBe(true);
    expect(isPseudoRoom(null)).toBe(false);
  });

  it('insets pseudo-room endpoints and leaves other cases unchanged', () => {
    const roomConnection = createConnection('room-1', 'room-2', false);
    const pseudoConnection = createConnection('room-1', { kind: 'pseudo-room', id: 'pseudo-1' }, false);

    expect(insetPseudoRoomConnectionEndpoint(roomConnection, [{ x: 0, y: 0 }, { x: 100, y: 0 }])).toEqual([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
    expect(insetPseudoRoomConnectionEndpoint(pseudoConnection, [{ x: 0, y: 0 }])).toEqual([{ x: 0, y: 0 }]);
    expect(insetPseudoRoomConnectionEndpoint(pseudoConnection, [{ x: 5, y: 5 }, { x: 5, y: 5 }])).toEqual([
      { x: 5, y: 5 },
      { x: 5, y: 5 },
    ]);
    expect(insetPseudoRoomConnectionEndpoint(pseudoConnection, [{ x: 0, y: 0 }, { x: 100, y: 0 }])).toEqual([
      { x: 0, y: 0 },
      { x: 79, y: 0 },
    ]);
  });
});
