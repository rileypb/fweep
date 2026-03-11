import { describe, expect, it } from '@jest/globals';
import { parseCliCommandDescription } from '../../src/domain/cli-command';

describe('parseCliCommandDescription', () => {
  it('describes create commands', () => {
    expect(parseCliCommandDescription('create Kitchen')).toBe('create a room called Kitchen');
  });

  it('describes delete commands', () => {
    expect(parseCliCommandDescription('delete Kitchen')).toBe('delete the room called Kitchen');
  });

  it('describes edit commands', () => {
    expect(parseCliCommandDescription('edit Kitchen')).toBe('open the room editor for Kitchen');
  });

  it('describes undo and redo commands', () => {
    expect(parseCliCommandDescription('undo')).toBe('undo the previous command');
    expect(parseCliCommandDescription('redo')).toBe('redo the previous command');
  });

  it('describes one-way connections', () => {
    expect(parseCliCommandDescription('connect Kitchen east one-way to Hallway')).toBe(
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
  });

  it('describes relative create commands using the inverse source direction', () => {
    expect(parseCliCommandDescription('create Kitchen east of Hallway')).toBe(
      'create a room called Kitchen and create a two-way connection from Kitchen going west to Hallway going east',
    );
    expect(parseCliCommandDescription('create Kitchen n of Hallway')).toBe(
      'create a room called Kitchen and create a two-way connection from Kitchen going south to Hallway going north',
    );
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
  });

  it('normalizes tabs and repeated spaces', () => {
    expect(parseCliCommandDescription('create\t\tGreat    Hall')).toBe('create a room called Great Hall');
  });

  it('returns null for malformed commands', () => {
    expect(parseCliCommandDescription('create')).toBeNull();
    expect(parseCliCommandDescription('connect Kitchen east one-way Hallway')).toBeNull();
    expect(parseCliCommandDescription('create and connect Kitchen east of Hallway')).toBeNull();
    expect(parseCliCommandDescription('connect "Kitchen east to Hallway')).toBeNull();
  });
});
