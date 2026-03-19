import { describe, expect, it } from '@jest/globals';
import {
  getCanonicalDirectionToken,
  hasCommaAfterLastPrecedingToken,
  hasMalformedPseudoRoomContinuation,
  isDirectionLikePrefix,
  isExactDirectionToken,
  isPseudoRoomLead,
  mergeSuggestions,
  suggestionResolution,
} from '../../src/domain/cli-suggestion-grammar-helpers';

describe('cli suggestion grammar helpers', () => {
  it('recognizes direction prefixes and canonical direction tokens', () => {
    expect(isDirectionLikePrefix('n')).toBe(true);
    expect(isDirectionLikePrefix('sw')).toBe(true);
    expect(isDirectionLikePrefix('kit')).toBe(false);

    expect(getCanonicalDirectionToken('n')).toBe('north');
    expect(getCanonicalDirectionToken('north')).toBe('north');
    expect(getCanonicalDirectionToken('kit')).toBeNull();
  });

  it('distinguishes exact direction tokens and pseudo-room leads', () => {
    expect(isExactDirectionToken('north')).toBe(true);
    expect(isExactDirectionToken('n')).toBe(false);

    expect(isPseudoRoomLead(['north'])).toBe(true);
    expect(isPseudoRoomLead(['above'])).toBe(true);
    expect(isPseudoRoomLead(['the', 'room'])).toBe(true);
    expect(isPseudoRoomLead(['kitchen'])).toBe(false);
  });

  it('detects malformed pseudo-room continuations', () => {
    expect(hasMalformedPseudoRoomContinuation(['north', 'of', 'cellar', 'to'])).toBe(true);
    expect(hasMalformedPseudoRoomContinuation(['kitchen', 'to'])).toBe(false);
  });

  it('detects commas after the last preceding token', () => {
    const fragment = {
      start: 15,
      end: 15,
      caret: 15,
      prefix: '',
      tokenIndex: 2,
      precedingTokens: [
        { value: 'create', start: 0, end: 6 },
        { value: 'pantry', start: 7, end: 13 },
      ],
    };

    expect(hasCommaAfterLastPrecedingToken(fragment, 'create pantry, ')).toBe(true);
    expect(hasCommaAfterLastPrecedingToken(fragment, 'create pantry ')).toBe(false);
  });

  it('wraps and merges suggestions predictably', () => {
    const primary = [{ id: 'a', kind: 'command' as const, label: 'a', insertText: 'a', detail: null }];
    const secondary = [
      { id: 'a', kind: 'command' as const, label: 'a', insertText: 'a', detail: null },
      { id: 'b', kind: 'command' as const, label: 'b', insertText: 'b', detail: null },
    ];

    expect(suggestionResolution(primary)).toEqual({ suggestions: primary });
    expect(mergeSuggestions(primary, secondary)).toEqual([
      primary[0],
      secondary[1],
    ]);
  });
});
