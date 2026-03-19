import { describe, it, expect } from '@jest/globals';
import {
  CLI_DIRECTIONS,
  normalizeDirection,
  STANDARD_DIRECTIONS,
  isStandardDirection,
  oppositeDirection,
} from '../../src/domain/directions';

describe('STANDARD_DIRECTIONS', () => {
  it('includes all compass directions, up/down, and in/out', () => {
    const expected = [
      'north', 'south', 'east', 'west',
      'northeast', 'northwest', 'southeast', 'southwest',
      'up', 'down', 'in', 'out',
    ];
    for (const dir of expected) {
      expect(STANDARD_DIRECTIONS).toContain(dir);
    }
  });
});

describe('CLI_DIRECTIONS', () => {
  it('includes compass directions and up/down, but not in/out', () => {
    expect(CLI_DIRECTIONS).toEqual(expect.arrayContaining([
      'north', 'south', 'east', 'west',
      'northeast', 'northwest', 'southeast', 'southwest',
      'up', 'down',
    ]));
    expect(CLI_DIRECTIONS).not.toEqual(expect.arrayContaining(['in', 'out']));
  });
});

describe('normalizeDirection', () => {
  it('lowercases direction labels', () => {
    expect(normalizeDirection('North')).toBe('north');
    expect(normalizeDirection('SOUTHEAST')).toBe('southeast');
  });

  it('trims whitespace', () => {
    expect(normalizeDirection('  west  ')).toBe('west');
  });

  it('expands common abbreviations', () => {
    expect(normalizeDirection('n')).toBe('north');
    expect(normalizeDirection('s')).toBe('south');
    expect(normalizeDirection('e')).toBe('east');
    expect(normalizeDirection('w')).toBe('west');
    expect(normalizeDirection('ne')).toBe('northeast');
    expect(normalizeDirection('nw')).toBe('northwest');
    expect(normalizeDirection('se')).toBe('southeast');
    expect(normalizeDirection('sw')).toBe('southwest');
    expect(normalizeDirection('u')).toBe('up');
    expect(normalizeDirection('d')).toBe('down');
  });

  it('preserves custom directions as-is (lowercased)', () => {
    expect(normalizeDirection('Aft')).toBe('aft');
    expect(normalizeDirection('fore')).toBe('fore');
  });
});

describe('isStandardDirection', () => {
  it('returns true for standard directions', () => {
    expect(isStandardDirection('north')).toBe(true);
    expect(isStandardDirection('up')).toBe(true);
  });

  it('returns false for custom directions', () => {
    expect(isStandardDirection('aft')).toBe(false);
    expect(isStandardDirection('fore')).toBe(false);
  });
});

describe('oppositeDirection', () => {
  it.each([
    ['north', 'south'],
    ['south', 'north'],
    ['east', 'west'],
    ['west', 'east'],
    ['northeast', 'southwest'],
    ['southwest', 'northeast'],
    ['northwest', 'southeast'],
    ['southeast', 'northwest'],
    ['up', 'down'],
    ['down', 'up'],
  ])('returns %s → %s', (input, expected) => {
    expect(oppositeDirection(input)).toBe(expected);
  });

  it('still returns in/out opposites for non-CLI direction semantics', () => {
    expect(oppositeDirection('in')).toBe('out');
    expect(oppositeDirection('out')).toBe('in');
  });

  it('returns undefined for custom directions', () => {
    expect(oppositeDirection('aft')).toBeUndefined();
    expect(oppositeDirection('fore')).toBeUndefined();
  });
});
