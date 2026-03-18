import { createDirectionSuggestions, createKeywordSuggestions, createPlaceholderSuggestion, createTerminalKeywordSuggestions } from './cli-suggestion-options';
import { suggestionResolution, hasCommaAfterLastPrecedingToken } from './cli-suggestion-grammar-helpers';
import { getRoomReferenceResolution, getRoomReferenceResolutionWithFallback } from './cli-suggestion-room-slots';
import type { ActiveFragment, CliSuggestion, SuggestionResolution } from './cli-suggestion-types';
import type { MapDocument } from './map-types';

interface RoomSlotSuggestionHelpers {
  readonly createPlaceholderSuggestion: typeof createPlaceholderSuggestion;
  readonly mergeSuggestions: (primary: readonly CliSuggestion[], secondary: readonly CliSuggestion[]) => readonly CliSuggestion[];
}

interface CreateResolutionDependencies {
  readonly roomSlotSuggestionHelpers: RoomSlotSuggestionHelpers;
  readonly getParserBackedCreateContinuationSuggestions: (
    input: string,
    fragment: ActiveFragment,
    options?: { readonly disallowNewRoomContinuation?: boolean },
  ) => readonly CliSuggestion[] | null;
  readonly getParserBackedConnectTailResolution: (
    fragment: ActiveFragment,
    canonicalLastDirection: string | null,
  ) => SuggestionResolution | null;
  readonly getSuggestionsForCommandContext: (
    input: string,
    fragment: ActiveFragment,
    doc: MapDocument | null,
  ) => SuggestionResolution;
}

export function createCreateWhichIsSuggestions(prefix: string): readonly CliSuggestion[] {
  const normalizedPrefix = prefix.toLowerCase();
  const matchText = 'which is';
  if (normalizedPrefix.length > 0 && !matchText.startsWith(normalizedPrefix)) {
    return [];
  }

  return [{
    id: 'cli-suggestion-keyword-create-which-is',
    kind: 'command',
    label: ', which is',
    insertText: 'which is',
    detail: null,
  }];
}

export function hasCompletedCreateAdjectivePhrase(tokens: readonly string[]): boolean {
  for (let index = 0; index < tokens.length - 2; index += 1) {
    if (
      tokens[index] === 'which'
      && tokens[index + 1] === 'is'
      && (tokens[index + 2] === 'dark' || tokens[index + 2] === 'lit')
    ) {
      return true;
    }
  }

  return false;
}

export function getCreateCommandResolution(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
  tokens: readonly string[],
  lastToken: string | null,
  canonicalLastDirection: string | null,
  dependencies: CreateResolutionDependencies,
): SuggestionResolution {
  const prefix = fragment.prefix;
  const hasCompletedCreatePhrase = hasCompletedCreateAdjectivePhrase(tokens);
  const parserBackedCreateContinuationSuggestions = dependencies.getParserBackedCreateContinuationSuggestions(input, fragment, {
    disallowNewRoomContinuation: hasCompletedCreatePhrase,
  });

  if (fragment.tokenIndex === 1) {
    return suggestionResolution([
      ...createPlaceholderSuggestion('<new room name>'),
      ...createKeywordSuggestions(prefix, ['and']),
    ]);
  }

  if (tokens[1] === 'and' && fragment.tokenIndex === 2) {
    return suggestionResolution(createKeywordSuggestions(prefix, ['connect']));
  }

  if (tokens[1] === 'and' && (tokens[2] === 'connect' || tokens[2] === 'con')) {
    return dependencies.getSuggestionsForCommandContext(
      input,
      {
        ...fragment,
        precedingTokens: [{ value: 'connect', start: fragment.start, end: fragment.start }, ...fragment.precedingTokens.slice(3)],
        tokenIndex: Math.max(fragment.tokenIndex - 3, 0),
      },
      doc,
    );
  }

  if (lastToken === 'which') {
    if (hasCompletedCreatePhrase) {
      return suggestionResolution([]);
    }
    return suggestionResolution(createKeywordSuggestions(prefix, ['is']));
  }

  const trimmedBeforeFragment = input.slice(0, fragment.start).trimEnd().toLowerCase();
  if (trimmedBeforeFragment.endsWith(',') && !hasCompletedCreatePhrase) {
    return suggestionResolution([
      ...createCreateWhichIsSuggestions(prefix),
      ...createKeywordSuggestions(prefix, ['above', 'below']),
      ...createDirectionSuggestions(prefix),
    ]);
  }

  if (tokens.at(-2) === 'which' && lastToken === 'is') {
    if (hasCompletedCreatePhrase) {
      return suggestionResolution([]);
    }
    return suggestionResolution(createTerminalKeywordSuggestions(prefix, ['dark', 'lit']));
  }

  if (lastToken === 'dark' || lastToken === 'lit') {
    return hasCommaAfterLastPrecedingToken(fragment, input)
      ? suggestionResolution(createDirectionSuggestions(prefix))
      : suggestionResolution(createKeywordSuggestions(prefix, [',']));
  }

  const ofIndex = tokens.indexOf('of');
  if (ofIndex !== -1 && fragment.tokenIndex === ofIndex + 1) {
    return getRoomReferenceResolution(input, fragment, doc, ofIndex + 1, dependencies.roomSlotSuggestionHelpers);
  }
  if (ofIndex !== -1 && fragment.tokenIndex > ofIndex + 1) {
    return suggestionResolution([]);
  }

  const verticalCreateIndex = tokens.findIndex((token) => token === 'above' || token === 'below');
  if (verticalCreateIndex !== -1) {
    if (fragment.tokenIndex === verticalCreateIndex + 1 || lastToken === 'above' || lastToken === 'below') {
      return getRoomReferenceResolution(input, fragment, doc, verticalCreateIndex + 1, dependencies.roomSlotSuggestionHelpers);
    }

    if (fragment.tokenIndex > verticalCreateIndex + 1) {
      return suggestionResolution([]);
    }
  }

  const isStillTypingCreateRoomName = tokens.length > 1
    && canonicalLastDirection === null
    && verticalCreateIndex === -1
    && ofIndex === -1
    && !trimmedBeforeFragment.endsWith(',')
    && lastToken !== 'which'
    && !(tokens.at(-2) === 'which' && lastToken === 'is')
    && lastToken !== 'dark'
    && lastToken !== 'lit';

  if (isStillTypingCreateRoomName) {
    return suggestionResolution([
      ...createPlaceholderSuggestion('<new room name>'),
      ...(parserBackedCreateContinuationSuggestions ?? [
        ...createKeywordSuggestions(prefix, [', which is', 'above', 'below']),
        ...createDirectionSuggestions(prefix),
      ]),
    ]);
  }

  if (parserBackedCreateContinuationSuggestions !== null) {
    return suggestionResolution(parserBackedCreateContinuationSuggestions);
  }

  if (hasCompletedCreatePhrase && canonicalLastDirection !== null) {
    return trimmedBeforeFragment.endsWith(',')
      ? suggestionResolution([])
      : suggestionResolution(createKeywordSuggestions(prefix, ['of']));
  }

  return suggestionResolution([
    ...createKeywordSuggestions(prefix, [', which is', 'above', 'below']),
    ...createDirectionSuggestions(prefix),
  ]);
}

export function getCreateAndConnectIntroResolution(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
  tokens: readonly string[],
  lastToken: string | null,
  canonicalLastDirection: string | null,
  dependencies: CreateResolutionDependencies,
): SuggestionResolution {
  const prefix = fragment.prefix;
  const hasCompletedCreateAndConnectAdjectivePhrase = hasCompletedCreateAdjectivePhrase(tokens);
  const parserBackedCreateAndConnectContinuationSuggestions = dependencies.getParserBackedCreateContinuationSuggestions(input, fragment, {
    disallowNewRoomContinuation: hasCompletedCreateAndConnectAdjectivePhrase,
  });

  if (fragment.tokenIndex === 3) {
    return suggestionResolution(createPlaceholderSuggestion('<new room name>'));
  }

  if (lastToken === 'which') {
    if (hasCompletedCreateAndConnectAdjectivePhrase) {
      return suggestionResolution([]);
    }
    return suggestionResolution(createKeywordSuggestions(prefix, ['is']));
  }

  if (tokens.at(-2) === 'which' && lastToken === 'is') {
    if (hasCompletedCreateAndConnectAdjectivePhrase) {
      return suggestionResolution([]);
    }
    return suggestionResolution(createTerminalKeywordSuggestions(prefix, ['dark', 'lit']));
  }

  if (lastToken === 'dark' || lastToken === 'lit') {
    return hasCommaAfterLastPrecedingToken(fragment, input)
      ? suggestionResolution(createDirectionSuggestions(prefix))
      : suggestionResolution(createKeywordSuggestions(prefix, [',']));
  }

  const createAndConnectToIndex = tokens.indexOf('to');
  if (createAndConnectToIndex !== -1) {
    if (fragment.tokenIndex === createAndConnectToIndex + 1) {
      return getRoomReferenceResolution(input, fragment, doc, createAndConnectToIndex + 1, dependencies.roomSlotSuggestionHelpers);
    }

    if (fragment.tokenIndex > createAndConnectToIndex + 1) {
      if (tokens.includes('one-way') || tokens.includes('oneway')) {
        return suggestionResolution([]);
      }

      return getRoomReferenceResolutionWithFallback(
        input,
        fragment,
        doc,
        createAndConnectToIndex + 1,
        createDirectionSuggestions(prefix),
        dependencies.roomSlotSuggestionHelpers,
      );
    }
  }

  const parserBackedConnectTailResolution = dependencies.getParserBackedConnectTailResolution(fragment, canonicalLastDirection);
  if (parserBackedConnectTailResolution !== null) {
    return parserBackedConnectTailResolution;
  }

  const isStillTypingCreateAndConnectRoomName = tokens.length > 3
    && canonicalLastDirection === null
    && tokens.indexOf('to') === -1
    && !input.slice(0, fragment.start).trimEnd().endsWith(',')
    && lastToken !== 'which'
    && !(tokens.at(-2) === 'which' && lastToken === 'is')
    && lastToken !== 'dark'
    && lastToken !== 'lit';
  if (isStillTypingCreateAndConnectRoomName) {
    return suggestionResolution([
      ...createPlaceholderSuggestion('<new room name>'),
      ...(parserBackedCreateAndConnectContinuationSuggestions ?? [
        ...createKeywordSuggestions(prefix, [', which is']),
        ...createDirectionSuggestions(prefix),
      ]),
    ]);
  }

  if (parserBackedCreateAndConnectContinuationSuggestions !== null) {
    return suggestionResolution(parserBackedCreateAndConnectContinuationSuggestions);
  }

  return suggestionResolution([
    ...createDirectionSuggestions(prefix),
    ...createKeywordSuggestions(prefix, [', which is']),
  ]);
}
