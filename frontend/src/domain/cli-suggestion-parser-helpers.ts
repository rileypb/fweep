import {
  listCliSuggestionNextSymbols,
  listCliSuggestionNextSymbolsForTokens,
  type CliSuggestionNextSymbol,
  type CliSuggestionParseToken,
} from './cli-suggestion-parser';
import type { ActiveFragment, Token } from './cli-suggestion-types';

function normalizeParserTokenValues(tokens: readonly string[]): readonly string[] {
  if (tokens[0] === 's') {
    return ['show', ...tokens.slice(1)];
  }

  if (tokens[0] === 'select') {
    return ['show', ...tokens.slice(1)];
  }

  if (tokens[0] === 'e' || tokens[0] === 'ed') {
    return ['edit', ...tokens.slice(1)];
  }

  if (tokens[0] === 'd' || tokens[0] === 'del') {
    return ['delete', ...tokens.slice(1)];
  }

  if (tokens[0] === 'h') {
    return ['help', ...tokens.slice(1)];
  }

  if (tokens[0] === 'ann') {
    return ['annotate', ...tokens.slice(1)];
  }

  if (tokens[0] === 'drop') {
    return ['put', ...tokens.slice(1)];
  }

  if (tokens[0] === 'arr' || tokens[0] === 'prettify') {
    return ['arrange', ...tokens.slice(1)];
  }

  return tokens;
}

function normalizeParserTokens(tokens: readonly Token[]): readonly CliSuggestionParseToken[] {
  const normalizedValues = normalizeParserTokenValues(tokens.map((token) => token.value.toLowerCase()));

  return tokens.map((token, index) => ({
    text: normalizedValues[index] ?? token.value,
    normalizedText: (normalizedValues[index] ?? token.value).toLowerCase(),
    quoted: token.quoted ?? false,
  }));
}

function createSyntheticTokens(values: readonly string[]): readonly Token[] {
  return values.map((value) => ({ value, start: 0, end: value.length, quoted: false }));
}

export function getParserNextSymbolsForTokens(tokens: readonly string[]): readonly CliSuggestionNextSymbol[] {
  return listCliSuggestionNextSymbolsForTokens(normalizeParserTokens(createSyntheticTokens(tokens)));
}

export function getParserNextSymbolsForFragment(fragment: ActiveFragment): readonly CliSuggestionNextSymbol[] {
  if ((fragment.quoted ?? false) && fragment.quoteClosed === false) {
    return getParserNextSymbolsBeforeSlot(fragment, fragment.tokenIndex);
  }

  return listCliSuggestionNextSymbolsForTokens(normalizeParserTokens(fragment.precedingTokens));
}

export function getParserNextSymbolsForRawFragmentInput(
  input: string,
  fragment: ActiveFragment,
): readonly CliSuggestionNextSymbol[] {
  if ((fragment.quoted ?? false) && fragment.quoteClosed === false) {
    return getParserNextSymbolsBeforeSlot(fragment, fragment.tokenIndex);
  }

  return listCliSuggestionNextSymbols(input.slice(0, fragment.caret).trimEnd().toLowerCase());
}

export function getParserNextSymbolsBeforeSlot(
  fragment: ActiveFragment,
  slotStartTokenIndex: number,
): readonly CliSuggestionNextSymbol[] {
  return listCliSuggestionNextSymbolsForTokens(
    normalizeParserTokens(fragment.precedingTokens.slice(0, slotStartTokenIndex)),
  );
}
