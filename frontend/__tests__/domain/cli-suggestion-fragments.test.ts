import { describe, expect, it } from '@jest/globals';
import { getActiveFragment, tokenizePlainInput } from '../../src/domain/cli-suggestion-fragments';

describe('cli suggestion fragments', () => {
  it('tokenizes plain input with offsets and ignores commas and quotes', () => {
    expect(tokenizePlainInput('say "hello", kitchen', 10)).toEqual([
      { value: 'say', start: 10, end: 13 },
      { value: 'hello', start: 15, end: 20 },
      { value: 'kitchen', start: 23, end: 30 },
    ]);
  });

  it('returns an empty fragment for blank input', () => {
    expect(getActiveFragment('', 0)).toEqual({
      start: 0,
      end: 0,
      caret: 0,
      prefix: '',
      tokenIndex: 0,
      precedingTokens: [],
    });
  });

  it('returns a trailing empty fragment after whitespace or commas', () => {
    expect(getActiveFragment('connect Kitchen ', 'connect Kitchen '.length)).toMatchObject({
      prefix: '',
      tokenIndex: 2,
      precedingTokens: [
        { value: 'connect', start: 0, end: 7 },
        { value: 'Kitchen', start: 8, end: 15 },
      ],
    });

    expect(getActiveFragment('create pantry, ', 'create pantry, '.length)).toMatchObject({
      prefix: '',
      tokenIndex: 2,
    });
  });

  it('returns the active token fragment inside a word', () => {
    expect(getActiveFragment('connect Kitchen nor', 'connect Kitchen nor'.length)).toEqual({
      start: 16,
      end: 19,
      caret: 19,
      prefix: 'nor',
      tokenIndex: 2,
      precedingTokens: [
        { value: 'connect', start: 0, end: 7 },
        { value: 'Kitchen', start: 8, end: 15 },
      ],
    });
  });

  it('clamps caret positions into range', () => {
    expect(getActiveFragment('', -5)?.caret).toBe(0);
    expect(getActiveFragment('show kitchen', 999)?.caret).toBe('show kitchen'.length);
  });
});
