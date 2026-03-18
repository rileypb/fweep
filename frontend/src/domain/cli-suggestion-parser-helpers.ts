import { listCliSuggestionNextSymbols, type CliSuggestionNextSymbol } from './cli-suggestion-parser';
import type { ActiveFragment } from './cli-suggestion-types';

function normalizeParserTokens(tokens: readonly string[]): readonly string[] {
  if (tokens[0] === 's') {
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

  if (tokens[0] === 'arr' || tokens[0] === 'prettify') {
    return ['arrange', ...tokens.slice(1)];
  }

  return tokens;
}

export function getParserNextSymbolsForTokens(tokens: readonly string[]): readonly CliSuggestionNextSymbol[] {
  const parserTokens = normalizeParserTokens(tokens);
  return listCliSuggestionNextSymbols(parserTokens.join(' '));
}

export function getParserNextSymbolsForFragment(fragment: ActiveFragment): readonly CliSuggestionNextSymbol[] {
  return getParserNextSymbolsForTokens(fragment.precedingTokens.map((token) => token.value.toLowerCase()));
}

export function getParserNextSymbolsForRawFragmentInput(
  input: string,
  fragment: ActiveFragment,
): readonly CliSuggestionNextSymbol[] {
  return listCliSuggestionNextSymbols(input.slice(0, fragment.caret).trimEnd().toLowerCase());
}

export function getParserNextSymbolsBeforeSlot(
  fragment: ActiveFragment,
  slotStartTokenIndex: number,
): readonly CliSuggestionNextSymbol[] {
  return getParserNextSymbolsForTokens(
    fragment.precedingTokens
      .slice(0, slotStartTokenIndex)
      .map((token) => token.value.toLowerCase()),
  );
}
