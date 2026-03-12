import { describe, expect, it } from '@jest/globals';
import { addRoom } from '../../src/domain/map-operations';
import { createEmptyMap, createRoom } from '../../src/domain/map-types';
import {
  findRoomsByCliName,
  isCliPronounReference,
  planCreateRoomFromCli,
  resolveRoomByCliName,
  resolveRoomByCliReference,
} from '../../src/domain/cli-execution';

describe('planCreateRoomFromCli', () => {
  it('places the first room at the center of the current viewport', () => {
    const doc = createEmptyMap('Test Map');

    expect(planCreateRoomFromCli(doc, 'Kitchen', { width: 800, height: 600 }, { x: 0, y: 0 })).toEqual({
      roomName: 'Kitchen',
      position: { x: 400, y: 320 },
    });
  });

  it('accounts for pan offset when placing the first room', () => {
    const doc = createEmptyMap('Test Map');

    expect(planCreateRoomFromCli(doc, 'Kitchen', { width: 800, height: 600 }, { x: 120, y: -80 })).toEqual({
      roomName: 'Kitchen',
      position: { x: 280, y: 400 },
    });
  });

  it('places subsequent rooms two grid cells east of the most recently created room', () => {
    const room = { ...createRoom('Hallway'), position: { x: 200, y: 120 } };
    const doc = addRoom(createEmptyMap('Test Map'), room);

    expect(planCreateRoomFromCli(doc, 'Kitchen', { width: 800, height: 600 }, { x: 0, y: 0 })).toEqual({
      roomName: 'Kitchen',
      position: { x: 280, y: 120 },
    });
  });

  it('adds numeric suffixes to duplicate names case-insensitively', () => {
    let doc = addRoom(createEmptyMap('Test Map'), { ...createRoom('Kitchen'), position: { x: 0, y: 0 } });
    doc = addRoom(doc, { ...createRoom('Kitchen 2'), position: { x: 80, y: 0 } });

    expect(planCreateRoomFromCli(doc, 'kitchen', { width: 800, height: 600 }, { x: 0, y: 0 })).toEqual({
      roomName: 'kitchen 3',
      position: { x: 160, y: 0 },
    });
  });
});

describe('resolveRoomByCliName', () => {
  it('matches room names case-insensitively', () => {
    const room = { ...createRoom('Kitchen'), position: { x: 0, y: 0 } };
    const doc = addRoom(createEmptyMap('Test Map'), room);

    expect(resolveRoomByCliName(doc, 'kItChEn')).toEqual({ kind: 'one', room });
  });

  it('normalizes repeated whitespace when matching', () => {
    const room = { ...createRoom('Great Hall'), position: { x: 0, y: 0 } };
    const doc = addRoom(createEmptyMap('Test Map'), room);

    expect(resolveRoomByCliName(doc, 'Great   Hall')).toEqual({ kind: 'one', room });
  });

  it('returns null for an unknown room', () => {
    const doc = createEmptyMap('Test Map');

    expect(resolveRoomByCliName(doc, 'Kitchen')).toEqual({ kind: 'none' });
  });

  it('reports multiple matches when duplicate room names exist', () => {
    let doc = addRoom(createEmptyMap('Test Map'), { ...createRoom('Kitchen'), position: { x: 0, y: 0 } });
    doc = addRoom(doc, { ...createRoom('Kitchen'), position: { x: 80, y: 0 } });

    const matches = findRoomsByCliName(doc, 'kitchen');
    expect(resolveRoomByCliName(doc, 'kitchen')).toEqual({ kind: 'multiple', rooms: matches });
  });
});

describe('resolveRoomByCliReference', () => {
  it('resolves it to the bound room id', () => {
    const room = { ...createRoom('Kitchen'), position: { x: 0, y: 0 } };
    const doc = addRoom(createEmptyMap('Test Map'), room);

    expect(resolveRoomByCliReference(doc, 'it', room.id)).toEqual({ kind: 'one', room });
  });

  it('reports an unbound pronoun when it has no room binding', () => {
    const doc = createEmptyMap('Test Map');

    expect(resolveRoomByCliReference(doc, 'it', null)).toEqual({ kind: 'pronoun-unbound' });
  });
});

describe('isCliPronounReference', () => {
  it('matches it case-insensitively', () => {
    expect(isCliPronounReference('it')).toBe(true);
    expect(isCliPronounReference(' IT ')).toBe(true);
    expect(isCliPronounReference('kitchen')).toBe(false);
  });
});
