import type { ActiveFragment, Token } from './cli-suggestion-types';

export function tokenizePlainInput(input: string, offset = 0): readonly Token[] {
  return Array.from(input.matchAll(/[^\s,"]+/g)).map((match) => {
    const value = match[0] ?? '';
    const start = (match.index ?? 0) + offset;
    return {
      value,
      start,
      end: start + value.length,
    };
  });
}

function isFragmentDelimiter(character: string | undefined): boolean {
  return character === undefined || /\s|,|"/.test(character);
}

export function getActiveFragment(input: string, caretPosition: number): ActiveFragment | null {
  const safeCaretPosition = Math.max(0, Math.min(caretPosition, input.length));
  if (input.trim().length === 0) {
    return {
      start: safeCaretPosition,
      end: safeCaretPosition,
      caret: safeCaretPosition,
      prefix: '',
      tokenIndex: 0,
      precedingTokens: [],
    };
  }

  let start = safeCaretPosition;
  const hasTrailingDelimiter = safeCaretPosition > 0 && isFragmentDelimiter(input[safeCaretPosition - 1]);
  if (hasTrailingDelimiter) {
    const precedingTokens = tokenizePlainInput(input.slice(0, safeCaretPosition));
    return {
      start: safeCaretPosition,
      end: safeCaretPosition,
      caret: safeCaretPosition,
      prefix: '',
      tokenIndex: precedingTokens.length,
      precedingTokens,
    };
  }

  while (start > 0 && !isFragmentDelimiter(input[start - 1])) {
    start -= 1;
  }

  const prefix = input.slice(start, safeCaretPosition);
  if (prefix.trim().length === 0) {
    return null;
  }

  let end = safeCaretPosition;
  while (end < input.length && !isFragmentDelimiter(input[end])) {
    end += 1;
  }

  return {
    start,
    end,
    caret: safeCaretPosition,
    prefix,
    tokenIndex: tokenizePlainInput(input.slice(0, start)).length,
    precedingTokens: tokenizePlainInput(input.slice(0, start)),
  };
}
