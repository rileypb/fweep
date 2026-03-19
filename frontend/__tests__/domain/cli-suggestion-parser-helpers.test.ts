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
      normalizedPrefix: '',
      tokenIndex: 1,
      precedingTokens: [{ value: 'go', start: 0, end: 2, quoted: false }],
      quoted: false,
      quoteClosed: true,
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
      normalizedPrefix: 'o',
      tokenIndex: 1,
      precedingTokens: [{ value: 'north', start: 0, end: 5, quoted: false }],
      quoted: false,
      quoteClosed: true,
    };

    expect(getParserNextSymbolsForRawFragmentInput('north o', fragment).map((entry) => entry.key)).toEqual(['keyword:of']);
  });

  it('queries parser state before a room slot boundary', () => {
    const fragment = {
      start: 6,
      end: 8,
      caret: 8,
      prefix: 'ki',
      normalizedPrefix: 'ki',
      tokenIndex: 1,
      precedingTokens: [{ value: 'show', start: 0, end: 4, quoted: false }],
      quoted: false,
      quoteClosed: true,
    };

    expect(getParserNextSymbolsBeforeSlot(fragment, 1).map((entry) => entry.key)).toContain('slot:ROOM_REF');
  });

  it('does not let an open quoted slot advance grammar state', () => {
    const fragment = {
      start: 8,
      end: 17,
      caret: 17,
      prefix: '"Key West ',
      normalizedPrefix: 'key west',
      tokenIndex: 1,
      precedingTokens: [{ value: 'connect', start: 0, end: 7, quoted: false }],
      quoted: true,
      quoteClosed: false,
    };

    expect(getParserNextSymbolsForFragment(fragment).map((entry) => entry.key)).toContain('slot:ROOM_REF');
    expect(getParserNextSymbolsForFragment(fragment).map((entry) => entry.key)).not.toContain('slot:DIRECTION');
    expect(getParserNextSymbolsForFragment(fragment).map((entry) => entry.key)).not.toContain('keyword:to');
  });
});
