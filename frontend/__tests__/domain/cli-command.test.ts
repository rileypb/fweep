import { describe, expect, it } from '@jest/globals';
import { parseCliCommandDescription } from '../../src/domain/cli-command';

describe('parseCliCommandDescription', () => {
  it('describes help commands', () => {
    expect(parseCliCommandDescription('help')).toBe('list the available CLI command forms');
    expect(parseCliCommandDescription('h')).toBe('list the available CLI command forms');
  });

  it('describes arrange commands', () => {
    expect(parseCliCommandDescription('arrange')).toBe('rearrange the map layout');
    expect(parseCliCommandDescription('arr')).toBe('rearrange the map layout');
    expect(parseCliCommandDescription('prettify')).toBe('rearrange the map layout');
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
    expect(parseCliCommandDescription('Above Kitchen lies death')).toBe(
      'mark the up exit from Kitchen as death',
    );
  });

  it('describes pseudo-room nowhere commands', () => {
    expect(parseCliCommandDescription('west of Castle leads nowhere')).toBe(
      'mark the west exit from Castle as leading nowhere',
    );
    expect(parseCliCommandDescription('Above Kitchen leads nowhere')).toBe(
      'mark the up exit from Kitchen as leading nowhere',
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
    expect(parseCliCommandDescription('s Kitchen')).toBe('scroll the map to Kitchen');
  });

  it('describes room lighting commands', () => {
    expect(parseCliCommandDescription('Kitchen is dark')).toBe('mark Kitchen as dark');
    expect(parseCliCommandDescription('Kitchen is lit')).toBe('mark Kitchen as lit');
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
  });
});
