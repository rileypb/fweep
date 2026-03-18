import { describe, expect, it } from '@jest/globals';
import {
  getParserNextSymbolsBeforeSlot,
  getParserNextSymbolsForFragment,
  getParserNextSymbolsForRawFragmentInput,
  getParserNextSymbolsForTokens,
} from '../../src/domain/cli-suggestion-parser-helpers';

describe('cli suggestion parser helpers', () => {
  it('normalizes command aliases before querying parser symbols', () => {
    expect(getParserNextSymbolsForTokens(['s']).map((entry) => entry.key)).toContain('slot:ROOM_REF');
    expect(getParserNextSymbolsForTokens(['ann']).map((entry) => entry.key)).toContain('slot:ROOM_REF');
    expect(getParserNextSymbolsForTokens(['arr']).map((entry) => entry.key)).toContain('end');
  });

  it('queries parser state from preceding fragment tokens', () => {
    const fragment = {
      start: 3,
      end: 3,
      caret: 3,
      prefix: '',
      tokenIndex: 1,
      precedingTokens: [{ value: 'go', start: 0, end: 2 }],
    };

    expect(getParserNextSymbolsForFragment(fragment).map((entry) => entry.key)).toEqual(
      expect.arrayContaining(['slot:DIRECTION', 'keyword:to']),
    );
  });

  it('queries raw input up to the caret for partial keywords', () => {
    const fragment = {
      start: 6,
      end: 7,
      caret: 7,
      prefix: 'o',
      tokenIndex: 1,
      precedingTokens: [{ value: 'north', start: 0, end: 5 }],
    };

    expect(getParserNextSymbolsForRawFragmentInput('north o', fragment).map((entry) => entry.key)).toEqual(['keyword:of']);
  });

  it('queries parser state before a room slot boundary', () => {
    const fragment = {
      start: 6,
      end: 8,
      caret: 8,
      prefix: 'ki',
      tokenIndex: 1,
      precedingTokens: [{ value: 'show', start: 0, end: 4 }],
    };

    expect(getParserNextSymbolsBeforeSlot(fragment, 1).map((entry) => entry.key)).toContain('slot:ROOM_REF');
  });
});
