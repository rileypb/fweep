import { describe, expect, it } from '@jest/globals';
import { addConnection, addRoom } from '../../src/domain/map-operations';
import { describeRoomForCli } from '../../src/domain/cli-room-description';
import { createConnection, createEmptyMap, createRoom } from '../../src/domain/map-types';

describe('cli room description', () => {
  it('describes outgoing exits and calls out one-way passages', () => {
    let doc = createEmptyMap('Describe Map');
    doc = addRoom(doc, { ...createRoom('parlor'), id: 'parlor', position: { x: 0, y: 0 } });
    doc = addRoom(doc, { ...createRoom('kitchen'), id: 'kitchen', position: { x: 1, y: 0 } });
    doc = addRoom(doc, { ...createRoom('attic'), id: 'attic', position: { x: 0, y: -1 } });

    doc = addConnection(doc, { ...createConnection('parlor', 'kitchen', true), id: 'east-connection' }, 'east', 'west');
    doc = addConnection(doc, { ...createConnection('parlor', 'attic', false), id: 'up-connection' }, 'up');

    expect(describeRoomForCli(doc, 'parlor')).toBe(
      'From the parlor, one can go east or up. The passage up is one-way, however.',
    );
  });

  it('uses plural phrasing when multiple exits are one-way', () => {
    let doc = createEmptyMap('Describe Map');
    doc = addRoom(doc, { ...createRoom('dining room'), id: 'dining-room', position: { x: 0, y: 0 } });
    doc = addRoom(doc, { ...createRoom('kitchen'), id: 'kitchen', position: { x: -1, y: 0 } });
    doc = addRoom(doc, { ...createRoom('cellar'), id: 'cellar', position: { x: 0, y: 1 } });
    doc = addRoom(doc, { ...createRoom('attic'), id: 'attic', position: { x: 0, y: -1 } });

    doc = addConnection(doc, { ...createConnection('dining-room', 'kitchen', false), id: 'west-connection' }, 'west');
    doc = addConnection(doc, { ...createConnection('dining-room', 'cellar', true), id: 'down-connection' }, 'down', 'up');
    doc = addConnection(doc, { ...createConnection('dining-room', 'attic', false), id: 'up-connection' }, 'up');

    expect(describeRoomForCli(doc, 'dining-room')).toBe(
      'From the dining room, one can go west, down, or up. The passages west and up are one-way, however.',
    );
  });

  it('handles rooms with no outgoing exits', () => {
    let doc = createEmptyMap('Describe Map');
    doc = addRoom(doc, { ...createRoom('cellar'), id: 'cellar', position: { x: 0, y: 0 } });

    expect(describeRoomForCli(doc, 'cellar')).toBe('From the cellar, one cannot go anywhere.');
  });
});
