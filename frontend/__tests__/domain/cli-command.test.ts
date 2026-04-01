import { describe, expect, it } from '@jest/globals';
import { parseCliCommand, parseCliCommandDescription } from '../../src/domain/cli-command';

describe('parseCliCommandDescription', () => {
  it('describes help commands', () => {
    expect(parseCliCommandDescription('help')).toBe('list the available CLI help topics');
    expect(parseCliCommandDescription('h')).toBe('list the available CLI help topics');
    expect(parseCliCommandDescription('help rooms')).toBe('show CLI help for rooms');
  });

  it('describes arrange commands', () => {
    expect(parseCliCommandDescription('arrange')).toBe('rearrange the map layout');
    expect(parseCliCommandDescription('arr')).toBe('rearrange the map layout');
    expect(parseCliCommandDescription('prettify')).toBe('rearrange the map layout');
  });

  it('describes choose-game commands', () => {
    expect(parseCliCommand('choose game')).toEqual({ kind: 'choose-game' });
    expect(parseCliCommand('choose a game')).toEqual({ kind: 'choose-game' });
    expect(parseCliCommandDescription('choose game')).toBe('open the game chooser');
    expect(parseCliCommandDescription('choose a game')).toBe('open the game chooser');
  });

  it('describes zoom commands', () => {
    expect(parseCliCommandDescription('zoom in')).toBe('zoom the map in');
    expect(parseCliCommandDescription('zoom out')).toBe('zoom the map out');
    expect(parseCliCommandDescription('zoom reset')).toBe('reset the map zoom to 1:1');
    expect(parseCliCommandDescription('zoom 200')).toBe('set the map zoom to 200%');
    expect(parseCliCommandDescription('zoom 200%')).toBe('set the map zoom to 200%');
  });

  it('describes create commands', () => {
    expect(parseCliCommandDescription('create Kitchen')).toBe('create a room called Kitchen');
    expect(parseCliCommandDescription('c Kitchen')).toBe('create a room called Kitchen');
    expect(parseCliCommandDescription('create Kitchen, which is dark')).toBe(
      'create a room called Kitchen and mark it as dark',
    );
  });

  it('describes pseudo-room unknown commands', () => {
    expect(parseCliCommandDescription('west of Bedroom is unknown')).toBe(
      'mark the west exit from Bedroom as unknown',
    );
    expect(parseCliCommandDescription('west of Bedroom is Kitchen')).toBe(
      'connect Bedroom going west to Kitchen, creating it if needed',
    );
    expect(parseCliCommandDescription('west is unknown')).toBe(
      'mark the west exit from the selected room as unknown',
    );
    expect(parseCliCommandDescription('the room west of Bedroom is unknown')).toBe(
      'mark the west exit from Bedroom as unknown',
    );
    expect(parseCliCommandDescription('Above Bedroom is unknown')).toBe(
      'mark the up exit from Bedroom as unknown',
    );
    expect(parseCliCommandDescription('the room below Bedroom is unknown')).toBe(
      'mark the down exit from Bedroom as unknown',
    );
  });

  it('describes pseudo-room infinite commands', () => {
    expect(parseCliCommandDescription('east of Kitchen goes on forever')).toBe(
      'mark the east exit from Kitchen as going on forever',
    );
    expect(parseCliCommandDescription('east goes on forever')).toBe(
      'mark the east exit from the selected room as going on forever',
    );
    expect(parseCliCommandDescription('the way east of Kitchen goes on forever')).toBe(
      'mark the east exit from Kitchen as going on forever',
    );
    expect(parseCliCommandDescription('Above Kitchen goes on forever')).toBe(
      'mark the up exit from Kitchen as going on forever',
    );
    expect(parseCliCommandDescription('the way below Kitchen goes on forever')).toBe(
      'mark the down exit from Kitchen as going on forever',
    );
  });

  it('describes pseudo-room death commands', () => {
    expect(parseCliCommandDescription('west of Castle lies death')).toBe(
      'mark the west exit from Castle as death',
    );
    expect(parseCliCommandDescription('west lies death')).toBe(
      'mark the west exit from the selected room as death',
    );
    expect(parseCliCommandDescription('Above Kitchen lies death')).toBe(
      'mark the up exit from Kitchen as death',
    );
    expect(parseCliCommandDescription('the way east of Kitchen lies death')).toBe(
      'mark the east exit from Kitchen as death',
    );
  });

  it('describes pseudo-room nowhere commands', () => {
    expect(parseCliCommandDescription('west of Castle leads nowhere')).toBe(
      'mark the west exit from Castle as leading nowhere',
    );
    expect(parseCliCommandDescription('west leads nowhere')).toBe(
      'mark the west exit from the selected room as leading nowhere',
    );
    expect(parseCliCommandDescription('Above Kitchen leads nowhere')).toBe(
      'mark the up exit from Kitchen as leading nowhere',
    );
    expect(parseCliCommandDescription('the way east of Kitchen leads nowhere')).toBe(
      'mark the east exit from Kitchen as leading nowhere',
    );
  });

  it('describes pseudo-room somewhere-else commands', () => {
    expect(parseCliCommandDescription('west of Castle leads to somewhere else')).toBe(
      'mark the west exit from Castle as leading to somewhere else',
    );
    expect(parseCliCommandDescription('west leads to somewhere else')).toBe(
      'mark the west exit from the selected room as leading to somewhere else',
    );
    expect(parseCliCommandDescription('Above Kitchen leads to somewhere else')).toBe(
      'mark the up exit from Kitchen as leading to somewhere else',
    );
    expect(parseCliCommandDescription('the way east of Kitchen leads to somewhere else')).toBe(
      'mark the east exit from Kitchen as leading to somewhere else',
    );
  });

  it('describes delete commands', () => {
    expect(parseCliCommandDescription('delete Kitchen')).toBe('delete the room called Kitchen');
    expect(parseCliCommandDescription('d Kitchen')).toBe('delete the room called Kitchen');
    expect(parseCliCommandDescription('del Kitchen')).toBe('delete the room called Kitchen');
  });

  it('describes edit commands', () => {
    expect(parseCliCommandDescription('edit Kitchen')).toBe('open the room editor for Kitchen');
    expect(parseCliCommandDescription('e Kitchen')).toBe('open the room editor for Kitchen');
    expect(parseCliCommandDescription('ed Kitchen')).toBe('open the room editor for Kitchen');
  });

  it('describes show commands', () => {
    expect(parseCliCommandDescription('show Kitchen')).toBe('scroll the map to Kitchen');
    expect(parseCliCommandDescription('select Kitchen')).toBe('scroll the map to Kitchen');
    expect(parseCliCommandDescription('s Kitchen')).toBe('scroll the map to Kitchen');
    expect(parseCliCommandDescription('go to Kitchen')).toBe('scroll the map to Kitchen');
  });

  it('describes describe commands', () => {
    expect(parseCliCommandDescription('describe')).toBe('describe the exits from the selected room');
    expect(parseCliCommandDescription('describe Kitchen')).toBe('describe the exits from Kitchen');
  });

  it('describes room lighting commands', () => {
    expect(parseCliCommandDescription('Kitchen is dark')).toBe('mark Kitchen as dark');
    expect(parseCliCommandDescription('Kitchen is lit')).toBe('mark Kitchen as lit');
  });

  it('describes selected-room relative connect commands', () => {
    expect(parseCliCommandDescription('north is Kitchen')).toBe(
      'connect the selected room going north to Kitchen, creating it if needed',
    );
    expect(parseCliCommandDescription('above is Attic')).toBe(
      'connect the selected room going up to Attic, creating it if needed',
    );
    expect(parseCliCommandDescription('north of Bedroom is Kitchen')).toBe(
      'connect Bedroom going north to Kitchen, creating it if needed',
    );
    expect(parseCliCommandDescription('below Bedroom is Cellar')).toBe(
      'connect Bedroom going down to Cellar, creating it if needed',
    );
    expect(parseCliCommandDescription('above Bedroom is Attic, which is dark')).toBe(
      'connect Bedroom going up to Attic, creating it if needed, and mark Attic as dark',
    );
    expect(parseCliCommandDescription('north is Hallway, which is lit')).toBe(
      'connect the selected room going north to Hallway, creating it if needed, and mark Hallway as lit',
    );
  });

  it('describes connection annotation commands', () => {
    expect(parseCliCommandDescription('Bedroom to Bathroom is a door')).toBe(
      'mark all connections between Bedroom and Bathroom as doors',
    );
    expect(parseCliCommandDescription('Bedroom to Bathroom is door')).toBe(
      'mark all connections between Bedroom and Bathroom as doors',
    );
    expect(parseCliCommandDescription('Bedroom to Bathroom is a locked door')).toBe(
      'mark all connections between Bedroom and Bathroom as locked doors',
    );
    expect(parseCliCommandDescription('Bedroom to Bathroom is locked')).toBe(
      'mark all connections between Bedroom and Bathroom as locked doors',
    );
    expect(parseCliCommandDescription('Bedroom to Bathroom is locked door')).toBe(
      'mark all connections between Bedroom and Bathroom as locked doors',
    );
    expect(parseCliCommandDescription('Bedroom to Bathroom is clear')).toBe(
      'clear all connection annotations between Bedroom and Bathroom',
    );
  });

  it('describes notate commands', () => {
    expect(parseCliCommandDescription('notate Kitchen with this room has nice wallpaper')).toBe(
      'create a sticky note on Kitchen saying this room has nice wallpaper',
    );
    expect(parseCliCommandDescription('annotate Kitchen with this room has nice wallpaper')).toBe(
      'create a sticky note on Kitchen saying this room has nice wallpaper',
    );
    expect(parseCliCommandDescription('ann Kitchen with this room has nice wallpaper')).toBe(
      'create a sticky note on Kitchen saying this room has nice wallpaper',
    );
    expect(parseCliCommandDescription('annotate with this room has nice wallpaper')).toBe(
      'create a sticky note on the selected room saying this room has nice wallpaper',
    );
  });

  it('describes put-item commands', () => {
    expect(parseCliCommandDescription('put lantern in Kitchen')).toBe(
      'put lantern in Kitchen',
    );
    expect(parseCliCommandDescription('put lantern, key, and sword in Kitchen')).toBe(
      'put lantern, key, and sword in Kitchen',
    );
    expect(parseCliCommandDescription('put "red book, volume 2" in Library')).toBe(
      'put red book, volume 2 in Library',
    );
  });

  it('describes take-item commands', () => {
    expect(parseCliCommandDescription('take lantern from Kitchen')).toBe(
      'take lantern from Kitchen',
    );
    expect(parseCliCommandDescription('get lantern from Kitchen')).toBe(
      'take lantern from Kitchen',
    );
    expect(parseCliCommandDescription('take lantern, key, and sword from Kitchen')).toBe(
      'take lantern, key, and sword from Kitchen',
    );
    expect(parseCliCommandDescription('take all from Kitchen')).toBe(
      'take all from Kitchen',
    );
    expect(parseCliCommandDescription('get all from Kitchen')).toBe(
      'take all from Kitchen',
    );
  });

  it('describes undo and redo commands', () => {
    expect(parseCliCommandDescription('undo')).toBe('undo the previous command');
    expect(parseCliCommandDescription('redo')).toBe('redo the previous command');
  });

  it('describes one-way connections', () => {
    expect(parseCliCommandDescription('connect Kitchen east one-way to Hallway')).toBe(
      'create a one-way connection from Kitchen going east to Hallway',
    );
    expect(parseCliCommandDescription('con Kitchen east one-way to Hallway')).toBe(
      'create a one-way connection from Kitchen going east to Hallway',
    );
  });

  it('accepts oneway and one way as one-way synonyms', () => {
    expect(parseCliCommandDescription('connect Kitchen east oneway to Hallway')).toBe(
      'create a one-way connection from Kitchen going east to Hallway',
    );
    expect(parseCliCommandDescription('connect Kitchen east one way to Hallway')).toBe(
      'create a one-way connection from Kitchen going east to Hallway',
    );
  });

  it('accepts short direction aliases', () => {
    expect(parseCliCommandDescription('connect Kitchen e to Hallway')).toBe(
      'create a two-way connection from Kitchen going east to Hallway going west',
    );
    expect(parseCliCommandDescription('connect Cellar u one-way to Attic')).toBe(
      'create a one-way connection from Cellar going up to Attic',
    );
  });

  it('describes two-way connections with explicit target direction', () => {
    expect(parseCliCommandDescription('connect Kitchen east to Hallway west')).toBe(
      'create a two-way connection from Kitchen going east to Hallway going west',
    );
  });

  it('describes two-way connections with default inverse direction', () => {
    expect(parseCliCommandDescription('connect Kitchen east to Hallway')).toBe(
      'create a two-way connection from Kitchen going east to Hallway going west',
    );
  });

  it('describes disconnect commands', () => {
    expect(parseCliCommandDescription('disconnect Kitchen from Hallway')).toBe(
      'delete the connection between Kitchen and Hallway',
    );
    expect(parseCliCommandDescription('disconnect Kitchen east from Hallway')).toBe(
      'delete the connection from Kitchen going east to Hallway',
    );
  });

  it('describes create-and-connect commands', () => {
    expect(parseCliCommandDescription('create and connect Kitchen east to Hallway')).toBe(
      'create a room called Kitchen and create a two-way connection from Kitchen going east to Hallway going west',
    );
    expect(parseCliCommandDescription('create and connect Kitchen, which is dark, east to Hallway')).toBe(
      'create a room called Kitchen and mark it as dark and create a two-way connection from Kitchen going east to Hallway going west',
    );
    expect(parseCliCommandDescription('c and connect Kitchen east to Hallway')).toBe(
      'create a room called Kitchen and create a two-way connection from Kitchen going east to Hallway going west',
    );
    expect(parseCliCommandDescription('create and con Kitchen east to Hallway')).toBe(
      'create a room called Kitchen and create a two-way connection from Kitchen going east to Hallway going west',
    );
    expect(parseCliCommandDescription('c and con Kitchen east to Hallway')).toBe(
      'create a room called Kitchen and create a two-way connection from Kitchen going east to Hallway going west',
    );
  });

  it('describes relative create commands using the inverse source direction', () => {
    expect(parseCliCommandDescription('create Kitchen east of Hallway')).toBe(
      'create a room called Kitchen and create a two-way connection from Kitchen going west to Hallway going east',
    );
    expect(parseCliCommandDescription('create Kitchen, which is dark, east of Hallway')).toBe(
      'create a room called Kitchen and mark it as dark and create a two-way connection from Kitchen going west to Hallway going east',
    );
    expect(parseCliCommandDescription('create Kitchen n of Hallway')).toBe(
      'create a room called Kitchen and create a two-way connection from Kitchen going south to Hallway going north',
    );
    expect(parseCliCommandDescription('create north gate e of four')).toBe(
      'create a room called north gate and create a two-way connection from north gate going west to four going east',
    );
  });

  it('falls back to plain create when a relative-create pattern would leave the new room name empty', () => {
    expect(parseCliCommandDescription('create east of eden')).toBe('create a room called east of eden');
  });

  it('describes relative vertical create commands using bidirectional above/below syntax', () => {
    expect(parseCliCommandDescription('create Kitchen above Hallway')).toBe(
      'create a room called Kitchen and create a two-way connection from Kitchen going down to Hallway going up',
    );
    expect(parseCliCommandDescription('create Kitchen below Hallway')).toBe(
      'create a room called Kitchen and create a two-way connection from Kitchen going up to Hallway going down',
    );
  });

  it('supports quoted names and escaped quotes', () => {
    expect(parseCliCommandDescription('connect "Living Room \\"East\\"" east to "Dining Room"')).toBe(
      'create a two-way connection from Living Room "East" going east to Dining Room going west',
    );
    expect(parseCliCommandDescription('create "Living Room, East", which is dark')).toBe(
      'create a room called Living Room, East and mark it as dark',
    );
  });

  it('treats quoted direction words as room names instead of syntax', () => {
    expect(parseCliCommandDescription('connect "north" east to Hallway')).toBe(
      'create a two-way connection from north going east to Hallway going west',
    );
  });

  it('treats quoted relation words as room names in relative create commands', () => {
    expect(parseCliCommandDescription('create "above" east of Hallway')).toBe(
      'create a room called above and create a two-way connection from above going west to Hallway going east',
    );
    expect(parseCliCommandDescription('create Kitchen above "below"')).toBe(
      'create a room called Kitchen and create a two-way connection from Kitchen going down to below going up',
    );
  });

  it('does not parse a quoted target direction as syntax', () => {
    expect(parseCliCommandDescription('connect Kitchen east to Hallway "west"')).toBe(
      'create a two-way connection from Kitchen going east to Hallway west going west',
    );
  });

  it('normalizes tabs and repeated spaces', () => {
    expect(parseCliCommandDescription('create\t\tGreat    Hall')).toBe('create a room called Great Hall');
  });

  it('returns null for malformed commands', () => {
    expect(parseCliCommandDescription('create')).toBeNull();
    expect(parseCliCommandDescription('connect Kitchen east one-way Hallway')).toBeNull();
    expect(parseCliCommandDescription('create and connect Kitchen east of Hallway')).toBeNull();
    expect(parseCliCommandDescription('connect "Kitchen east to Hallway')).toBeNull();
    expect(parseCliCommandDescription('create "A\\q"')).toBeNull();
    expect(parseCliCommandDescription('create Ki"tchen')).toBeNull();
    expect(parseCliCommandDescription('bedroom west is unknown')).toBeNull();
    expect(parseCliCommandDescription('kitchen east goes on forever')).toBeNull();
    expect(parseCliCommandDescription("bedroom's west exit is unknown")).toBeNull();
    expect(parseCliCommandDescription('the way east of kitchen continues indefinitely')).toBeNull();
    expect(parseCliCommandDescription('put in Kitchen')).toBeNull();
    expect(parseCliCommandDescription('take lantern from')).toBeNull();
    expect(parseCliCommandDescription('put all in Kitchen')).toBeNull();
  });
});

describe('parseCliCommand', () => {
  it('parses zoom commands', () => {
    expect(parseCliCommand('zoom in')).toEqual({ kind: 'zoom', mode: 'relative', direction: 'in' });
    expect(parseCliCommand('zoom out')).toEqual({ kind: 'zoom', mode: 'relative', direction: 'out' });
    expect(parseCliCommand('zoom reset')).toEqual({ kind: 'zoom', mode: 'reset', direction: undefined });
    expect(parseCliCommand('zoom 200')).toEqual({ kind: 'zoom', mode: 'absolute', zoomPercent: 200 });
    expect(parseCliCommand('zoom 200%')).toEqual({ kind: 'zoom', mode: 'absolute', zoomPercent: 200 });
    expect(parseCliCommand('zoom -25%')).toEqual({ kind: 'zoom', mode: 'absolute', zoomPercent: -25 });
  });

  it('parses the-way pseudo-room terminal commands', () => {
    expect(parseCliCommand('the way east of Kitchen lies death')).toEqual({
      kind: 'create-pseudo-room',
      pseudoKind: 'death',
      sourceRoom: { text: 'Kitchen', exact: false },
      sourceDirection: 'east',
    });

    expect(parseCliCommand('the way east of Kitchen leads nowhere')).toEqual({
      kind: 'create-pseudo-room',
      pseudoKind: 'nowhere',
      sourceRoom: { text: 'Kitchen', exact: false },
      sourceDirection: 'east',
    });

    expect(parseCliCommand('the way east of Kitchen leads to somewhere else')).toEqual({
      kind: 'create-pseudo-room',
      pseudoKind: 'elsewhere',
      sourceRoom: { text: 'Kitchen', exact: false },
      sourceDirection: 'east',
    });
  });

  it('parses selected-room pseudo-room terminal commands', () => {
    expect(parseCliCommand('west is unknown')).toEqual({
      kind: 'create-pseudo-room',
      pseudoKind: 'unknown',
      sourceRoom: null,
      sourceDirection: 'west',
    });

    expect(parseCliCommand('north goes on forever')).toEqual({
      kind: 'create-pseudo-room',
      pseudoKind: 'infinite',
      sourceRoom: null,
      sourceDirection: 'north',
    });

    expect(parseCliCommand('above lies death')).toEqual({
      kind: 'create-pseudo-room',
      pseudoKind: 'death',
      sourceRoom: null,
      sourceDirection: 'up',
    });

    expect(parseCliCommand('below leads nowhere')).toEqual({
      kind: 'create-pseudo-room',
      pseudoKind: 'nowhere',
      sourceRoom: null,
      sourceDirection: 'down',
    });

    expect(parseCliCommand('east leads to somewhere else')).toEqual({
      kind: 'create-pseudo-room',
      pseudoKind: 'elsewhere',
      sourceRoom: null,
      sourceDirection: 'east',
    });
  });

  it('parses select as a show synonym', () => {
    expect(parseCliCommand('select Kitchen')).toEqual({
      kind: 'show',
      room: { text: 'Kitchen', exact: false },
    });
  });

  it('parses connection annotation commands', () => {
    expect(parseCliCommand('Bedroom to Bathroom is a door')).toEqual({
      kind: 'set-connection-annotation',
      sourceRoom: { text: 'Bedroom', exact: false },
      targetRoom: { text: 'Bathroom', exact: false },
      annotation: 'door',
    });

    expect(parseCliCommand('Bedroom to Bathroom is door')).toEqual({
      kind: 'set-connection-annotation',
      sourceRoom: { text: 'Bedroom', exact: false },
      targetRoom: { text: 'Bathroom', exact: false },
      annotation: 'door',
    });

    expect(parseCliCommand('Bedroom to Bathroom is a locked door')).toEqual({
      kind: 'set-connection-annotation',
      sourceRoom: { text: 'Bedroom', exact: false },
      targetRoom: { text: 'Bathroom', exact: false },
      annotation: 'locked door',
    });

    expect(parseCliCommand('Bedroom to Bathroom is locked')).toEqual({
      kind: 'set-connection-annotation',
      sourceRoom: { text: 'Bedroom', exact: false },
      targetRoom: { text: 'Bathroom', exact: false },
      annotation: 'locked door',
    });

    expect(parseCliCommand('Bedroom to Bathroom is locked door')).toEqual({
      kind: 'set-connection-annotation',
      sourceRoom: { text: 'Bedroom', exact: false },
      targetRoom: { text: 'Bathroom', exact: false },
      annotation: 'locked door',
    });

    expect(parseCliCommand('Bedroom to Bathroom is clear')).toEqual({
      kind: 'set-connection-annotation',
      sourceRoom: { text: 'Bedroom', exact: false },
      targetRoom: { text: 'Bathroom', exact: false },
      annotation: null,
    });
  });

  it('parses put-item lists', () => {
    expect(parseCliCommand('put lantern in Kitchen')).toEqual({
      kind: 'put-items',
      itemNames: ['lantern'],
      room: { text: 'Kitchen', exact: false },
    });

    expect(parseCliCommand('drop lantern in Kitchen')).toEqual({
      kind: 'put-items',
      itemNames: ['lantern'],
      room: { text: 'Kitchen', exact: false },
    });

    expect(parseCliCommand('put lantern, key, and sword in Kitchen')).toEqual({
      kind: 'put-items',
      itemNames: ['lantern', 'key', 'sword'],
      room: { text: 'Kitchen', exact: false },
    });
  });

  it('parses take-item lists', () => {
    expect(parseCliCommand('take lantern from Kitchen')).toEqual({
      kind: 'take-items',
      itemNames: ['lantern'],
      room: { text: 'Kitchen', exact: false },
    });

    expect(parseCliCommand('get lantern from Kitchen')).toEqual({
      kind: 'take-items',
      itemNames: ['lantern'],
      room: { text: 'Kitchen', exact: false },
    });

    expect(parseCliCommand('take lantern, key, and sword from Kitchen')).toEqual({
      kind: 'take-items',
      itemNames: ['lantern', 'key', 'sword'],
      room: { text: 'Kitchen', exact: false },
    });

    expect(parseCliCommand('take all from Kitchen')).toEqual({
      kind: 'take-all-items',
      room: { text: 'Kitchen', exact: false },
    });

    expect(parseCliCommand('get all from Kitchen')).toEqual({
      kind: 'take-all-items',
      room: { text: 'Kitchen', exact: false },
    });
  });

  it('does not treat in and out as CLI directions', () => {
    expect(parseCliCommand('go in')).toBeNull();
    expect(parseCliCommand('go out')).toBeNull();
    expect(parseCliCommand('in')).toBeNull();
    expect(parseCliCommand('out')).toBeNull();
  });

  it('parses disconnect commands', () => {
    expect(parseCliCommand('disconnect Kitchen from Hallway')).toEqual({
      kind: 'disconnect',
      sourceRoom: { text: 'Kitchen', exact: false },
      sourceDirection: null,
      targetRoom: { text: 'Hallway', exact: false },
    });

    expect(parseCliCommand('disconnect Kitchen east from Hallway')).toEqual({
      kind: 'disconnect',
      sourceRoom: { text: 'Kitchen', exact: false },
      sourceDirection: 'east',
      targetRoom: { text: 'Hallway', exact: false },
    });
  });

  it('parses describe commands', () => {
    expect(parseCliCommand('describe')).toEqual({
      kind: 'describe',
      room: null,
    });

    expect(parseCliCommand('describe Kitchen')).toEqual({
      kind: 'describe',
      room: { text: 'Kitchen', exact: false },
    });
  });

  it('parses selected-room relative connect commands', () => {
    expect(parseCliCommand('north is Kitchen')).toEqual({
      kind: 'selected-room-relative-connect',
      sourceRoom: null,
      sourceDirection: 'north',
      targetRoom: { text: 'Kitchen', exact: false },
      adjective: null,
    });

    expect(parseCliCommand('below is Cellar')).toEqual({
      kind: 'selected-room-relative-connect',
      sourceRoom: null,
      sourceDirection: 'down',
      targetRoom: { text: 'Cellar', exact: false },
      adjective: null,
    });
    expect(parseCliCommand('north of Bedroom is Kitchen')).toEqual({
      kind: 'selected-room-relative-connect',
      sourceRoom: { text: 'Bedroom', exact: false },
      sourceDirection: 'north',
      targetRoom: { text: 'Kitchen', exact: false },
      adjective: null,
    });
    expect(parseCliCommand('above Bedroom is Attic')).toEqual({
      kind: 'selected-room-relative-connect',
      sourceRoom: { text: 'Bedroom', exact: false },
      sourceDirection: 'up',
      targetRoom: { text: 'Attic', exact: false },
      adjective: null,
    });
    expect(parseCliCommand('above Bedroom is Attic, which is dark')).toEqual({
      kind: 'selected-room-relative-connect',
      sourceRoom: { text: 'Bedroom', exact: false },
      sourceDirection: 'up',
      targetRoom: { text: 'Attic', exact: false },
      adjective: { kind: 'lighting', text: 'dark', isDark: true },
    });
    expect(parseCliCommand('below is Cellar, which is lit')).toEqual({
      kind: 'selected-room-relative-connect',
      sourceRoom: null,
      sourceDirection: 'down',
      targetRoom: { text: 'Cellar', exact: false },
      adjective: { kind: 'lighting', text: 'lit', isDark: false },
    });
  });

  it('preserves north is dark as a room-lighting phrase', () => {
    expect(parseCliCommand('north is dark')).toEqual({
      kind: 'set-room-adjective',
      room: { text: 'north', exact: false },
      adjective: { kind: 'lighting', text: 'dark', isDark: true },
    });
  });

  it('parses notate commands with and without an explicit room', () => {
    expect(parseCliCommand('notate Kitchen with hello')).toEqual({
      kind: 'notate',
      room: { text: 'Kitchen', exact: false },
      noteText: 'hello',
    });
    expect(parseCliCommand('ann "Kitchen" with hello')).toEqual({
      kind: 'notate',
      room: { text: 'Kitchen', exact: true },
      noteText: 'hello',
    });
    expect(parseCliCommand('annotate with hello')).toEqual({
      kind: 'notate',
      room: null,
      noteText: 'hello',
    });
    expect(parseCliCommand('ann with hello there')).toEqual({
      kind: 'notate',
      room: null,
      noteText: 'hello there',
    });
  });
});
