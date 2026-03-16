import { describe, it, expect } from '@jest/globals';
import {
  createRoom,
  createConnection,
  createItem,
  type Room,
  type Connection,
  type Item,
} from '../../src/domain/map-types';

describe('createRoom', () => {
  it('creates a room with the given name and a unique ID', () => {
    const room = createRoom('Kitchen');
    expect(room.id).toBeTruthy();
    expect(room.name).toBe('Kitchen');
  });

  it('assigns unique IDs to different rooms', () => {
    const a = createRoom('A');
    const b = createRoom('B');
    expect(a.id).not.toBe(b.id);
  });

  it('starts with an empty description', () => {
    const room = createRoom('Hall');
    expect(room.description).toBe('');
  });

  it('starts with an empty directions map', () => {
    const room = createRoom('Foyer');
    expect(room.directions).toEqual({});
  });

  it('starts with isDark set to false', () => {
    const room = createRoom('Cellar');
    expect(room.isDark).toBe(false);
  });

  it('starts with box as the default shape', () => {
    const room = createRoom('Gallery');
    expect(room.shape).toBe('box');
  });

  it('starts with a default position at 0,0', () => {
    const room = createRoom('Origin');
    expect(room.position).toEqual({ x: 0, y: 0 });
  });
});

describe('createConnection', () => {
  it('creates a connection between two rooms', () => {
    const conn = createConnection('room-a', 'room-b');
    expect(conn.id).toBeTruthy();
    expect(conn.sourceRoomId).toBe('room-a');
    expect(conn.target).toEqual({ kind: 'room', id: 'room-b' });
  });

  it('defaults to one-way (not bidirectional)', () => {
    const conn = createConnection('room-a', 'room-b');
    expect(conn.isBidirectional).toBe(false);
  });

  it('starts with default styling', () => {
    const conn = createConnection('room-a', 'room-b');
    expect(conn.annotation).toBeNull();
    expect(conn.strokeColorIndex).toBe(0);
    expect(conn.strokeStyle).toBe('solid');
  });

  it('can be created as bidirectional', () => {
    const conn = createConnection('room-a', 'room-b', true);
    expect(conn.isBidirectional).toBe(true);
  });

  it('assigns unique IDs to different connections', () => {
    const a = createConnection('r1', 'r2');
    const b = createConnection('r3', 'r4');
    expect(a.id).not.toBe(b.id);
  });
});

describe('createItem', () => {
  it('creates an item with the given name and room ID', () => {
    const item = createItem('Brass Lantern', 'room-1');
    expect(item.id).toBeTruthy();
    expect(item.name).toBe('Brass Lantern');
    expect(item.roomId).toBe('room-1');
  });

  it('starts with an empty description', () => {
    const item = createItem('Key', 'room-1');
    expect(item.description).toBe('');
  });

  it('defaults all flags to false', () => {
    const item = createItem('Sword', 'room-1');
    expect(item.isScenery).toBe(false);
    expect(item.isContainer).toBe(false);
    expect(item.isSupporter).toBe(false);
    expect(item.isLightSource).toBe(false);
  });

  it('assigns unique IDs to different items', () => {
    const a = createItem('A', 'r1');
    const b = createItem('B', 'r2');
    expect(a.id).not.toBe(b.id);
  });
});
