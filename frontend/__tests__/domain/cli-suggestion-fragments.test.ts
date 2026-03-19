import { describe, expect, it } from '@jest/globals';
import { getActiveFragment, tokenizePlainInput } from '../../src/domain/cli-suggestion-fragments';

describe('cli suggestion fragments', () => {
  it('tokenizes plain input with offsets and keeps quote metadata', () => {
    expect(tokenizePlainInput('say "hello", kitchen', 10)).toEqual([
      { value: 'say', start: 10, end: 13, quoted: false },
      { value: 'hello', start: 14, end: 21, quoted: true },
      { value: 'kitchen', start: 23, end: 30, quoted: false },
    ]);
  });

  it('returns an empty fragment for blank input', () => {
    expect(getActiveFragment('', 0)).toEqual({
      start: 0,
      end: 0,
      caret: 0,
      prefix: '',
      normalizedPrefix: '',
      tokenIndex: 0,
      precedingTokens: [],
      quoted: false,
      quoteClosed: true,
    });
  });

  it('returns a trailing empty fragment after whitespace or commas', () => {
    expect(getActiveFragment('connect Kitchen ', 'connect Kitchen '.length)).toMatchObject({
      prefix: '',
      normalizedPrefix: '',
      tokenIndex: 2,
      precedingTokens: [
        { value: 'connect', start: 0, end: 7, quoted: false },
        { value: 'Kitchen', start: 8, end: 15, quoted: false },
      ],
      quoted: false,
      quoteClosed: true,
    });

    expect(getActiveFragment('create pantry, ', 'create pantry, '.length)).toMatchObject({
      prefix: '',
      normalizedPrefix: '',
      tokenIndex: 2,
      quoted: false,
      quoteClosed: true,
    });
  });

  it('returns the active token fragment inside a word', () => {
    expect(getActiveFragment('connect Kitchen nor', 'connect Kitchen nor'.length)).toEqual({
      start: 16,
      end: 19,
      caret: 19,
      prefix: 'nor',
      normalizedPrefix: 'nor',
      tokenIndex: 2,
      precedingTokens: [
        { value: 'connect', start: 0, end: 7, quoted: false },
        { value: 'Kitchen', start: 8, end: 15, quoted: false },
      ],
      quoted: false,
      quoteClosed: true,
    });
  });

  it('returns the active fragment inside an open quoted token', () => {
    expect(getActiveFragment('connect "Key West ', 'connect "Key West '.length)).toEqual({
      start: 8,
      end: 18,
      caret: 18,
      prefix: 'Key West ',
      normalizedPrefix: 'key west ',
      tokenIndex: 1,
      precedingTokens: [
        { value: 'connect', start: 0, end: 7, quoted: false },
      ],
      quoted: true,
      quoteClosed: false,
    });
  });

  it('returns a trailing empty fragment after a closed quoted token', () => {
    expect(getActiveFragment('connect "Key West" ', 'connect "Key West" '.length)).toEqual({
      start: 19,
      end: 19,
      caret: 19,
      prefix: '',
      normalizedPrefix: '',
      tokenIndex: 2,
      precedingTokens: [
        { value: 'connect', start: 0, end: 7, quoted: false },
        { value: 'Key West', start: 8, end: 18, quoted: true },
      ],
      quoted: false,
      quoteClosed: true,
    });
  });

  it('supports escaped quotes inside a quoted token', () => {
    expect(tokenizePlainInput('connect "Living Room \\"East\\""', 0)).toEqual([
      { value: 'connect', start: 0, end: 7, quoted: false },
      { value: 'Living Room "East"', start: 8, end: 30, quoted: true },
    ]);
  });

  it('clamps caret positions into range', () => {
    expect(getActiveFragment('', -5)?.caret).toBe(0);
    expect(getActiveFragment('show kitchen', 999)?.caret).toBe('show kitchen'.length);
  });
});
