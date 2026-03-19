import { describe, expect, it } from '@jest/globals';
import { addConnection, addItem, addPseudoRoom, addRoom } from '../../src/domain/map-operations';
import { describeRoomForCli } from '../../src/domain/cli-room-description';
import { createConnection, createEmptyMap, createItem, createPseudoRoom, createRoom } from '../../src/domain/map-types';

describe('cli room description', () => {
  it('describes ordinary exits, items, and darkness in separate sections', () => {
    let doc = createEmptyMap('Describe Map');
    doc = addRoom(doc, { ...createRoom('kitchen'), id: 'kitchen', position: { x: 0, y: 0 }, isDark: true });
    doc = addRoom(doc, { ...createRoom('bedroom'), id: 'bedroom', position: { x: 1, y: 0 } });
    doc = addRoom(doc, { ...createRoom('living room'), id: 'living-room', position: { x: -1, y: 1 } });
    doc = addRoom(doc, { ...createRoom('dining room'), id: 'dining-room', position: { x: -1, y: 0 } });
    doc = addConnection(doc, { ...createConnection('kitchen', 'bedroom', true), id: 'east-connection' }, 'east', 'west');
    doc = addConnection(doc, { ...createConnection('kitchen', 'living-room', true), id: 'southwest-connection' }, 'southwest', 'northeast');
    doc = addConnection(
      doc,
      { ...createConnection('kitchen', 'dining-room', true), id: 'west-connection', annotation: { kind: 'door' } },
      'west',
      'east',
    );
    doc = addItem(doc, { ...createItem('lamp', 'kitchen'), id: 'lamp' });

    expect(describeRoomForCli(doc, 'kitchen')).toBe(
      'From kitchen, one can go east to the bedroom, southwest to the living room, or west through a door to the dining room.\n\n'
      + 'You see a lamp here.\n\n'
      + 'It is dark.',
    );
  });

  it('describes ordinary exits and one-way pseudo exits together', () => {
    let doc = createEmptyMap('Describe Map');
    doc = addRoom(doc, { ...createRoom('living room'), id: 'living-room', position: { x: 0, y: 0 } });
    doc = addRoom(doc, { ...createRoom('dining room'), id: 'dining-room', position: { x: 0, y: -1 } });
    doc = addRoom(doc, { ...createRoom('kitchen'), id: 'kitchen', position: { x: 1, y: -1 } });
    doc = addPseudoRoom(doc, { ...createPseudoRoom('unknown'), id: 'unknown-west', position: { x: -1, y: 0 } });
    doc = addConnection(doc, { ...createConnection('living-room', 'dining-room', true), id: 'north-connection' }, 'north', 'south');
    doc = addConnection(doc, { ...createConnection('living-room', 'kitchen', true), id: 'northeast-connection' }, 'northeast', 'southwest');
    doc = addConnection(doc, { ...createConnection('living-room', { kind: 'pseudo-room', id: 'unknown-west' }, false), id: 'west-connection' }, 'west');

    expect(describeRoomForCli(doc, 'living-room')).toBe(
      'From living room, one can go north to the dining room or northeast to the kitchen. To the west is a one-way exit that leads to the unknown.',
    );
  });

  it('handles locked doors, in/out annotations, and multiple one-way exits', () => {
    let doc = createEmptyMap('Describe Map');
    doc = addRoom(doc, { ...createRoom('hall'), id: 'hall', position: { x: 0, y: 0 } });
    doc = addRoom(doc, { ...createRoom('vault'), id: 'vault', position: { x: 1, y: 0 } });
    doc = addRoom(doc, { ...createRoom('cellar'), id: 'cellar', position: { x: 0, y: 1 } });
    doc = addRoom(doc, { ...createRoom('garden'), id: 'garden', position: { x: -1, y: 0 } });
    doc = addRoom(doc, { ...createRoom('attic'), id: 'attic', position: { x: 0, y: -1 } });
    doc = addConnection(
      doc,
      { ...createConnection('hall', 'vault', true), id: 'east-connection', annotation: { kind: 'locked door' } },
      'east',
      'west',
    );
    doc = addConnection(
      doc,
      { ...createConnection('hall', 'cellar', true), id: 'in-connection', annotation: { kind: 'in' } },
      'in',
      'out',
    );
    doc = addConnection(
      doc,
      { ...createConnection('hall', 'garden', true), id: 'out-connection', annotation: { kind: 'out' } },
      'out',
      'in',
    );
    doc = addConnection(doc, { ...createConnection('hall', 'attic', false), id: 'up-connection' }, 'up');

    expect(describeRoomForCli(doc, 'hall')).toBe(
      'From hall, one can go east through a locked door to the vault, in into the cellar, or out to the garden. Up is a one-way exit that leads to the attic.',
    );
  });

  it('describes death, nowhere, and infinite pseudo exits', () => {
    let doc = createEmptyMap('Describe Map');
    doc = addRoom(doc, { ...createRoom('crossroads'), id: 'crossroads', position: { x: 0, y: 0 } });
    doc = addPseudoRoom(doc, { ...createPseudoRoom('death'), id: 'death-east', position: { x: 1, y: 0 } });
    doc = addPseudoRoom(doc, { ...createPseudoRoom('nowhere'), id: 'nowhere-west', position: { x: -1, y: 0 } });
    doc = addPseudoRoom(doc, { ...createPseudoRoom('infinite'), id: 'infinite-north', position: { x: 0, y: -1 } });
    doc = addConnection(doc, { ...createConnection('crossroads', { kind: 'pseudo-room', id: 'death-east' }, false), id: 'east-connection' }, 'east');
    doc = addConnection(doc, { ...createConnection('crossroads', { kind: 'pseudo-room', id: 'nowhere-west' }, false), id: 'west-connection' }, 'west');
    doc = addConnection(doc, { ...createConnection('crossroads', { kind: 'pseudo-room', id: 'infinite-north' }, false), id: 'north-connection' }, 'north');

    expect(describeRoomForCli(doc, 'crossroads')).toBe(
      'To the north is a one-way exit that goes on forever. To the east is a one-way exit that leads to death. To the west is a one-way exit that leads to nowhere.',
    );
  });

  it('handles rooms with no outgoing exits', () => {
    let doc = createEmptyMap('Describe Map');
    doc = addRoom(doc, { ...createRoom('cellar'), id: 'cellar', position: { x: 0, y: 0 } });

    expect(describeRoomForCli(doc, 'cellar')).toBe('From cellar, one cannot go anywhere.');
  });
});
