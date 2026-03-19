import { CLI_DIRECTIONS, normalizeDirection } from './directions';
import type { ActiveFragment, CliSuggestion, SuggestionResolution } from './cli-suggestion-types';

export function isDirectionLikePrefix(prefix: string): boolean {
  const normalizedPrefix = normalizeDirection(prefix);
  return CLI_DIRECTIONS.some((direction) => direction.startsWith(normalizedPrefix));
}

export function getCanonicalDirectionToken(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalizedValue = normalizeDirection(value);
  return CLI_DIRECTIONS.find((direction) => direction === normalizedValue) ?? null;
}

export function isExactDirectionToken(value: string | null): boolean {
  return value !== null && (CLI_DIRECTIONS as readonly string[]).includes(value);
}

export function isPseudoRoomLead(tokens: readonly string[]): boolean {
  return (tokens[0] === 'the' && (tokens[1] === 'room' || tokens[1] === 'way'))
    || getCanonicalDirectionToken(tokens[0] ?? null) !== null
    || tokens[0] === 'above'
    || tokens[0] === 'below';
}

export function hasMalformedPseudoRoomContinuation(tokens: readonly string[]): boolean {
  return isPseudoRoomLead(tokens) && tokens.includes('to');
}

export function hasCommaAfterLastPrecedingToken(fragment: ActiveFragment, input: string): boolean {
  const lastToken = fragment.precedingTokens.at(-1);
  if (!lastToken) {
    return false;
  }

  return input.slice(lastToken.end, fragment.caret).includes(',');
}

export function suggestionResolution(suggestions: readonly CliSuggestion[]): SuggestionResolution {
  return { suggestions };
}

export function mergeSuggestions(
  primary: readonly CliSuggestion[],
  secondary: readonly CliSuggestion[],
): readonly CliSuggestion[] {
  const seenIds = new Set(primary.map((suggestion) => suggestion.id));
  return [
    ...primary,
    ...secondary.filter((suggestion) => !seenIds.has(suggestion.id)),
  ];
}
