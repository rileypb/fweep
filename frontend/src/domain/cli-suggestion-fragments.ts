import type { ActiveFragment, Token } from './cli-suggestion-types';

interface TokenizationResult {
  readonly tokens: readonly Token[];
  readonly openQuotedToken: Token | null;
}

function isWhitespace(character: string | undefined): boolean {
  return character !== undefined && /\s/.test(character);
}

function isTokenDelimiter(character: string | undefined): boolean {
  return character === undefined || isWhitespace(character) || character === ',';
}

function decodeQuotedValue(raw: string): string {
  let value = '';
  let index = raw.startsWith('"') ? 1 : 0;

  while (index < raw.length) {
    const current = raw[index];
    if (current === '\\') {
      const next = raw[index + 1];
      if (next === '"' || next === '\\') {
        value += next;
        index += 2;
        continue;
      }

      value += current;
      index += 1;
      continue;
    }

    if (current === '"') {
      break;
    }

    value += current;
    index += 1;
  }

  return value;
}

function tokenizeSuggestionInput(
  input: string,
  offset = 0,
  options?: { readonly includeCommas?: boolean },
): TokenizationResult {
  const includeCommas = options?.includeCommas ?? false;
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index];
    if (isWhitespace(char)) {
      index += 1;
      continue;
    }

    if (char === ',') {
      if (includeCommas) {
        tokens.push({
          value: ',',
          start: index + offset,
          end: index + offset + 1,
          quoted: false,
        });
      }
      index += 1;
      continue;
    }

    if (char === '"') {
      const quotedStart = index;
      index += 1;
      let value = '';

      while (index < input.length) {
        const current = input[index];
        if (current === '\\') {
          const next = input[index + 1];
          if (next === '"' || next === '\\') {
            value += next;
            index += 2;
            continue;
          }

          return {
            tokens,
            openQuotedToken: {
              value,
              start: quotedStart + offset,
              end: input.length + offset,
              quoted: true,
            },
          };
        }

        if (current === '"') {
          index += 1;
          tokens.push({
            value,
            start: quotedStart + offset,
            end: index + offset,
            quoted: true,
          });
          break;
        }

        value += current;
        index += 1;
      }

      if (index >= input.length && input[input.length - 1] !== '"') {
        return {
          tokens,
          openQuotedToken: {
            value,
            start: quotedStart + offset,
            end: input.length + offset,
            quoted: true,
          },
        };
      }

      continue;
    }

    const tokenStart = index;
    let value = '';
    while (index < input.length && !isTokenDelimiter(input[index]) && input[index] !== '"') {
      value += input[index];
      index += 1;
    }

    if (value.length > 0) {
      tokens.push({
        value,
        start: tokenStart + offset,
        end: index + offset,
        quoted: false,
      });
    }

    if (input[index] === '"') {
      continue;
    }
  }

  return { tokens, openQuotedToken: null };
}

function createFragment(
  start: number,
  end: number,
  caret: number,
  prefix: string,
  tokenIndex: number,
  precedingTokens: readonly Token[],
  quoted: boolean,
  quoteClosed: boolean,
): ActiveFragment {
  return {
    start,
    end,
    caret,
    prefix,
    normalizedPrefix: prefix.toLowerCase(),
    tokenIndex,
    precedingTokens,
    quoted,
    quoteClosed,
  };
}

export function tokenizePlainInput(input: string, offset = 0): readonly Token[] {
  return tokenizeSuggestionInput(input, offset).tokens;
}

export function tokenizeSuggestionInputWithCommas(input: string, offset = 0): readonly Token[] {
  return tokenizeSuggestionInput(input, offset, { includeCommas: true }).tokens;
}

export function getActiveFragment(input: string, caretPosition: number): ActiveFragment | null {
  const safeCaretPosition = Math.max(0, Math.min(caretPosition, input.length));
  if (input.trim().length === 0) {
    return createFragment(safeCaretPosition, safeCaretPosition, safeCaretPosition, '', 0, [], false, true);
  }

  const { tokens, openQuotedToken } = tokenizeSuggestionInput(input);
  if (
    openQuotedToken !== null
    && safeCaretPosition >= openQuotedToken.start
    && safeCaretPosition <= openQuotedToken.end
  ) {
    const precedingTokens = tokens.filter((token) => token.end <= openQuotedToken.start);
    const rawPrefix = input.slice(openQuotedToken.start, safeCaretPosition);
    return createFragment(
      openQuotedToken.start,
      openQuotedToken.end,
      safeCaretPosition,
      decodeQuotedValue(rawPrefix),
      precedingTokens.length,
      precedingTokens,
      true,
      false,
    );
  }

  const hasTrailingDelimiter = safeCaretPosition > 0 && isTokenDelimiter(input[safeCaretPosition - 1]);
  if (hasTrailingDelimiter) {
    const precedingTokens = tokens.filter((token) => token.end <= safeCaretPosition);
    return createFragment(
      safeCaretPosition,
      safeCaretPosition,
      safeCaretPosition,
      '',
      precedingTokens.length,
      precedingTokens,
      false,
      true,
    );
  }

  const activeToken = tokens.find((token) => token.start < safeCaretPosition && safeCaretPosition <= token.end) ?? null;
  if (activeToken === null) {
    return null;
  }

  const precedingTokens = tokens.filter((token) => token.end <= activeToken.start);
  const prefix = activeToken.quoted
    ? decodeQuotedValue(input.slice(activeToken.start, safeCaretPosition))
    : input.slice(activeToken.start, safeCaretPosition);

  return createFragment(
    activeToken.start,
    activeToken.end,
    safeCaretPosition,
    prefix,
    precedingTokens.length,
    precedingTokens,
    activeToken.quoted ?? false,
    !(activeToken.quoted ?? false) || safeCaretPosition >= activeToken.end,
  );
}
