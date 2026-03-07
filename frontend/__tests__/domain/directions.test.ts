import { describe, it, expect } from '@jest/globals';
import {
  normalizeDirection,
  STANDARD_DIRECTIONS,
  isStandardDirection,
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
