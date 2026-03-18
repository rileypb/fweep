import { STANDARD_DIRECTIONS, normalizeDirection } from './directions';
import { getActiveFragment } from './cli-suggestion-fragments';
import {
  createCommandSuggestions,
  createConnectionAnnotationSuggestions,
  createDefaultSuggestions,
  createDirectionSuggestions,
  createHelpTopicSuggestions,
  createKeywordSuggestions,
  createPlaceholderSuggestion,
  createTerminalKeywordSuggestions,
} from './cli-suggestion-options';
import {
  createRoomSuggestions,
  getConnectedRoomReferenceResolution,
  getLeadingRoomReferenceResolution,
  getRoomReferenceResolution,
  getRoomReferenceResolutionWithFallback,
} from './cli-suggestion-room-slots';
import type { CliSuggestion, CliSuggestionResult, SuggestionResolution, ActiveFragment } from './cli-suggestion-types';
import type { MapDocument } from './map-types';

export type { CliSuggestion, CliSuggestionResult } from './cli-suggestion-types';

function isDirectionLikePrefix(prefix: string): boolean {
  const normalizedPrefix = normalizeDirection(prefix);
  return STANDARD_DIRECTIONS.some((direction) => direction.startsWith(normalizedPrefix));
}

function getCanonicalDirectionToken(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalizedValue = normalizeDirection(value);
  return STANDARD_DIRECTIONS.find((direction) => direction === normalizedValue) ?? null;
}

function isPseudoRoomLead(tokens: readonly string[]): boolean {
  return (tokens[0] === 'the' && (tokens[1] === 'room' || tokens[1] === 'way'))
    || getCanonicalDirectionToken(tokens[0] ?? null) !== null
    || tokens[0] === 'above'
    || tokens[0] === 'below';
}

function hasMalformedPseudoRoomContinuation(tokens: readonly string[]): boolean {
  return isPseudoRoomLead(tokens) && tokens.includes('to');
}

function suggestionResolution(suggestions: readonly CliSuggestion[]): SuggestionResolution {
  return { suggestions };
}

function mergeSuggestions(
  primary: readonly CliSuggestion[],
  secondary: readonly CliSuggestion[],
): readonly CliSuggestion[] {
  const seenIds = new Set(primary.map((suggestion) => suggestion.id));
  return [
    ...primary,
    ...secondary.filter((suggestion) => !seenIds.has(suggestion.id)),
  ];
}

const roomSlotSuggestionHelpers = {
  createPlaceholderSuggestion,
  mergeSuggestions,
} as const;

function hasCommaAfterLastPrecedingToken(fragment: ActiveFragment, input: string): boolean {
  const lastToken = fragment.precedingTokens.at(-1);
  if (!lastToken) {
    return false;
  }

  return input.slice(lastToken.end, fragment.caret).includes(',');
}

function getSuggestionsForCommandContext(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
): SuggestionResolution {
  const tokens = fragment.precedingTokens.map((token) => token.value.toLowerCase());
  const prefix = fragment.prefix;
  const lastToken = tokens.at(-1) ?? null;
  const canonicalLastDirection = getCanonicalDirectionToken(lastToken);

  if (fragment.tokenIndex === 0) {
    return suggestionResolution([
      ...createCommandSuggestions(prefix),
      ...createDirectionSuggestions(prefix),
      ...createRoomSuggestions(doc, prefix),
    ]);
  }

  if ((tokens[0] === 'help' || tokens[0] === 'h') && fragment.tokenIndex === 1) {
    return suggestionResolution(createHelpTopicSuggestions(prefix));
  }

  if (
    fragment.tokenIndex === 1
    && !isPseudoRoomLead(tokens)
    && tokens[0] !== 'go'
    && tokens[0] !== 'show'
    && tokens[0] !== 'delete'
    && tokens[0] !== 'd'
    && tokens[0] !== 'del'
    && tokens[0] !== 'edit'
    && tokens[0] !== 'ed'
    && tokens[0] !== 'notate'
    && tokens[0] !== 'annotate'
    && tokens[0] !== 'ann'
    && tokens[0] !== 'put'
    && tokens[0] !== 'take'
    && tokens[0] !== 'get'
    && tokens[0] !== 'connect'
    && tokens[0] !== 'con'
    && tokens[0] !== 'create'
    && tokens[0] !== 'arrange'
    && tokens[0] !== 'help'
    && tokens[0] !== 'h'
  ) {
    const leadingRoomResolution = getLeadingRoomReferenceResolution(
      input,
      fragment,
      doc,
      createKeywordSuggestions(prefix, ['is', 'to']),
      roomSlotSuggestionHelpers,
    );
    if (leadingRoomResolution.suggestions.length > 0) {
      return leadingRoomResolution;
    }
  }

  if (tokens[0] === 'go' && fragment.tokenIndex === 1) {
    return suggestionResolution([
      ...createDirectionSuggestions(prefix),
      ...createKeywordSuggestions(prefix, ['to']),
    ]);
  }

  if (tokens[0] === 'go' && tokens[1] === 'to') {
    return getRoomReferenceResolution(input, fragment, doc, 2, roomSlotSuggestionHelpers);
  }

  if (tokens[0] === 'show') {
    return getRoomReferenceResolution(input, fragment, doc, 1, roomSlotSuggestionHelpers);
  }

  if (tokens[0] === 'delete' || tokens[0] === 'd' || tokens[0] === 'del' || tokens[0] === 'edit' || tokens[0] === 'ed') {
    return getRoomReferenceResolution(input, fragment, doc, 1, roomSlotSuggestionHelpers);
  }

  if (tokens[0] === 'notate' || tokens[0] === 'annotate' || tokens[0] === 'ann') {
    if (tokens.includes('with')) {
      return suggestionResolution([]);
    }

    if (fragment.tokenIndex <= 1 || prefix.length > 0) {
      return getRoomReferenceResolution(input, fragment, doc, 1, roomSlotSuggestionHelpers);
    }

    return suggestionResolution(createKeywordSuggestions(prefix, ['with']));
  }

  if (tokens[0] === 'put') {
    if (tokens.includes('in')) {
      const inIndex = tokens.indexOf('in');
      if (fragment.tokenIndex > inIndex) {
        return getRoomReferenceResolution(input, fragment, doc, inIndex + 1, roomSlotSuggestionHelpers);
      }
      return suggestionResolution([]);
    }

    return suggestionResolution(
      fragment.tokenIndex > 1 && prefix.length === 0
        ? createKeywordSuggestions(prefix, ['in'])
        : [],
    );
  }

  if (tokens[0] === 'take' || tokens[0] === 'get') {
    if (tokens[1] === 'all' && fragment.tokenIndex === 2) {
      return suggestionResolution(createKeywordSuggestions(prefix, ['from']));
    }

    if (tokens.includes('from')) {
      const fromIndex = tokens.indexOf('from');
      if (fragment.tokenIndex > fromIndex) {
        return getRoomReferenceResolution(input, fragment, doc, fromIndex + 1, roomSlotSuggestionHelpers);
      }
      return suggestionResolution([]);
    }

    return suggestionResolution(
      fragment.tokenIndex > 1 && prefix.length === 0
        ? createKeywordSuggestions(prefix, ['from'])
        : [],
    );
  }

  const isConnectCommand = tokens[0] === 'connect'
    || tokens[0] === 'con'
    || (tokens[0] === 'create' && tokens[1] === 'and' && (tokens[2] === 'connect' || tokens[2] === 'con'));
  if (isConnectCommand) {
    const isCreateAndConnectIntro = tokens[0] === 'create'
      && tokens[1] === 'and'
      && (tokens[2] === 'connect' || tokens[2] === 'con');
    if (isCreateAndConnectIntro) {
      if (fragment.tokenIndex === 3) {
        return suggestionResolution(createPlaceholderSuggestion('<new room name>'));
      }

      if (lastToken === 'which') {
        return suggestionResolution(createKeywordSuggestions(prefix, ['is']));
      }

      if (tokens.at(-2) === 'which' && lastToken === 'is') {
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
          return getRoomReferenceResolution(input, fragment, doc, createAndConnectToIndex + 1, roomSlotSuggestionHelpers);
        }

        if (fragment.tokenIndex > createAndConnectToIndex + 1) {
          return getRoomReferenceResolutionWithFallback(
            input,
            fragment,
            doc,
            createAndConnectToIndex + 1,
            createDirectionSuggestions(prefix),
            roomSlotSuggestionHelpers,
          );
        }
      }

      if (lastToken === 'one-way' || lastToken === 'oneway' || lastToken === 'way') {
        return suggestionResolution(createKeywordSuggestions(prefix, ['to']));
      }

      if (canonicalLastDirection !== null) {
        return suggestionResolution(createKeywordSuggestions(prefix, ['one-way', 'to']));
      }

      return suggestionResolution([
        ...createDirectionSuggestions(prefix),
        ...createKeywordSuggestions(prefix, [', which is']),
      ]);
    }

    const toIndex = tokens.indexOf('to');
    if (toIndex !== -1) {
      if (fragment.tokenIndex === toIndex + 1 || (lastToken !== null && tokens.indexOf(lastToken) > toIndex && isDirectionLikePrefix(prefix))) {
        return getRoomReferenceResolution(input, fragment, doc, toIndex + 1, roomSlotSuggestionHelpers);
      }

      if (fragment.tokenIndex > toIndex + 1) {
        return getRoomReferenceResolution(input, fragment, doc, toIndex + 1, roomSlotSuggestionHelpers);
      }
      return getRoomReferenceResolution(input, fragment, doc, toIndex + 1, roomSlotSuggestionHelpers);
    }

    if (fragment.tokenIndex === 1) {
      return getRoomReferenceResolution(input, fragment, doc, 1, roomSlotSuggestionHelpers);
    }

    if (
      lastToken !== null
      && !(STANDARD_DIRECTIONS as readonly string[]).includes(lastToken)
      && lastToken !== 'one-way'
      && lastToken !== 'oneway'
      && lastToken !== 'way'
      && lastToken !== 'to'
      && (prefix.length === 0 || !isDirectionLikePrefix(prefix))
    ) {
      const sourceRoomResolution = getRoomReferenceResolutionWithFallback(
        input,
        fragment,
        doc,
        1,
        createDirectionSuggestions(prefix),
        roomSlotSuggestionHelpers,
      );
      if (sourceRoomResolution.suggestions.length > 0) {
        return sourceRoomResolution;
      }
    }

    if (lastToken === 'one-way' || lastToken === 'oneway' || lastToken === 'way') {
      return suggestionResolution(createKeywordSuggestions(prefix, ['to']));
    }

    if (canonicalLastDirection !== null) {
      return suggestionResolution(createKeywordSuggestions(prefix, ['one-way', 'to']));
    }

    if (tokens.length > 1 && (prefix.length === 0 || isDirectionLikePrefix(prefix))) {
      return suggestionResolution(createDirectionSuggestions(prefix));
    }

    if (tokens.length > 1 && prefix.length > 0) {
      return suggestionResolution([]);
    }

    return suggestionResolution(createKeywordSuggestions(prefix, ['one-way', 'to']));
  }

  if (tokens[0] === 'create' || tokens[0] === 'c') {
    if (fragment.tokenIndex === 1) {
      return suggestionResolution(createPlaceholderSuggestion('<new room name>'));
    }

    if (tokens[1] === 'and' && fragment.tokenIndex === 2) {
      return suggestionResolution(createKeywordSuggestions(prefix, ['connect']));
    }

    if (tokens[1] === 'and' && (tokens[2] === 'connect' || tokens[2] === 'con')) {
      return getSuggestionsForCommandContext(
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
      return suggestionResolution(createKeywordSuggestions(prefix, ['is']));
    }

    if (tokens.at(-2) === 'which' && lastToken === 'is') {
      return suggestionResolution(createTerminalKeywordSuggestions(prefix, ['dark', 'lit']));
    }

    if (lastToken === 'dark' || lastToken === 'lit') {
      return hasCommaAfterLastPrecedingToken(fragment, input)
        ? suggestionResolution(createDirectionSuggestions(prefix))
        : suggestionResolution(createKeywordSuggestions(prefix, [',']));
    }

    const ofIndex = tokens.indexOf('of');
    if (ofIndex !== -1 && fragment.tokenIndex === ofIndex + 1) {
      return getRoomReferenceResolution(input, fragment, doc, ofIndex + 1, roomSlotSuggestionHelpers);
    }
    if (ofIndex !== -1 && fragment.tokenIndex > ofIndex + 1) {
      return suggestionResolution([]);
    }

    const verticalCreateIndex = tokens.findIndex((token) => token === 'above' || token === 'below');
    if (verticalCreateIndex !== -1) {
      if (fragment.tokenIndex === verticalCreateIndex + 1 || lastToken === 'above' || lastToken === 'below') {
        return getRoomReferenceResolution(input, fragment, doc, verticalCreateIndex + 1, roomSlotSuggestionHelpers);
      }

      if (fragment.tokenIndex > verticalCreateIndex + 1) {
        return suggestionResolution([]);
      }
    }

    if (fragment.tokenIndex === 2 && prefix.length === 0) {
      return suggestionResolution([
        ...createKeywordSuggestions(prefix, [', which is', 'above', 'below']),
        ...createDirectionSuggestions(prefix),
      ]);
    }

    if (canonicalLastDirection !== null) {
      return suggestionResolution(createKeywordSuggestions(prefix, ['of']));
    }

    if (tokens.length > 1 && (prefix.length === 0 || isDirectionLikePrefix(prefix))) {
      return suggestionResolution(createDirectionSuggestions(prefix));
    }

    return suggestionResolution([
      ...createKeywordSuggestions(prefix, [', which is', 'above', 'below']),
      ...createDirectionSuggestions(prefix),
    ]);
  }

  if (tokens[0] === 'the' && tokens[1] === 'room') {
    if (fragment.tokenIndex === 2) {
      return suggestionResolution([
        ...createDirectionSuggestions(prefix),
        ...createKeywordSuggestions(prefix, ['above', 'below']),
      ]);
    }

    if ((tokens[2] === 'above' || tokens[2] === 'below') && !tokens.includes('is')) {
      return getRoomReferenceResolutionWithFallback(
        input,
        fragment,
        doc,
        3,
        createKeywordSuggestions(prefix, ['is unknown']),
        roomSlotSuggestionHelpers,
      );
    }

    const roomOfIndex = tokens.indexOf('of');
    if (roomOfIndex !== -1) {
      if (fragment.tokenIndex === roomOfIndex) {
        return suggestionResolution(createKeywordSuggestions(prefix, ['of']));
      }

      if (fragment.tokenIndex >= roomOfIndex + 1 && !tokens.includes('is')) {
        return getRoomReferenceResolutionWithFallback(
          input,
          fragment,
          doc,
          roomOfIndex + 1,
          createKeywordSuggestions(prefix, ['is unknown']),
          roomSlotSuggestionHelpers,
        );
      }
    }

    if (getCanonicalDirectionToken(tokens[2] ?? null) !== null) {
      return suggestionResolution(createKeywordSuggestions(prefix, ['of']));
    }
  }

  if (tokens[0] === 'the' && tokens[1] === 'way') {
    const pseudoWaySuggestions = createKeywordSuggestions(prefix, ['goes on forever', 'leads nowhere', 'lies death']);

    if (fragment.tokenIndex === 2) {
      return suggestionResolution([
        ...createDirectionSuggestions(prefix),
        ...createKeywordSuggestions(prefix, ['above', 'below']),
      ]);
    }

    if (
      (tokens[2] === 'above' || tokens[2] === 'below')
      && !tokens.includes('goes')
      && !tokens.includes('leads')
      && !tokens.includes('lies')
    ) {
      return getRoomReferenceResolutionWithFallback(input, fragment, doc, 3, pseudoWaySuggestions, roomSlotSuggestionHelpers);
    }

    const wayOfIndex = tokens.indexOf('of');
    if (wayOfIndex !== -1) {
      if (fragment.tokenIndex === wayOfIndex) {
        return suggestionResolution(createKeywordSuggestions(prefix, ['of']));
      }

      if (
        fragment.tokenIndex >= wayOfIndex + 1
        && !tokens.includes('goes')
        && !tokens.includes('leads')
        && !tokens.includes('lies')
      ) {
        return getRoomReferenceResolutionWithFallback(
          input,
          fragment,
          doc,
          wayOfIndex + 1,
          pseudoWaySuggestions,
          roomSlotSuggestionHelpers,
        );
      }
    }

    if (getCanonicalDirectionToken(tokens[2] ?? null) !== null) {
      return suggestionResolution(createKeywordSuggestions(prefix, ['of']));
    }
  }

  if (fragment.tokenIndex === 1 && getCanonicalDirectionToken(tokens[0] ?? null) !== null) {
    return suggestionResolution(createKeywordSuggestions(prefix, ['of']));
  }

  if (fragment.tokenIndex === 1 && (tokens[0] === 'above' || tokens[0] === 'below')) {
    return getRoomReferenceResolution(input, fragment, doc, 1, roomSlotSuggestionHelpers);
  }

  if (
    (getCanonicalDirectionToken(tokens[0] ?? null) !== null || tokens[0] === 'above' || tokens[0] === 'below')
    && !tokens.includes('to')
    && !tokens.includes('is')
    && !tokens.includes('goes')
    && !tokens.includes('leads')
    && !tokens.includes('lies')
  ) {
    const ofIndex = tokens.indexOf('of');
    const fallbackSuggestions = createKeywordSuggestions(prefix, ['is unknown', 'goes on forever', 'leads nowhere', 'lies death']);

    if (ofIndex !== -1 && fragment.tokenIndex >= ofIndex + 1) {
      return getRoomReferenceResolutionWithFallback(
        input,
        fragment,
        doc,
        ofIndex + 1,
        fallbackSuggestions,
        roomSlotSuggestionHelpers,
      );
    }

    if ((tokens[0] === 'above' || tokens[0] === 'below') && fragment.tokenIndex >= 1) {
      return getRoomReferenceResolutionWithFallback(
        input,
        fragment,
        doc,
        1,
        fallbackSuggestions,
        roomSlotSuggestionHelpers,
      );
    }
  }

  const roomToIndex = tokens.indexOf('to');
  if (
    roomToIndex > 0
    && tokens[0] !== 'go'
    && tokens[0] !== 'connect'
    && tokens[0] !== 'con'
    && tokens[0] !== 'create'
    && !isPseudoRoomLead(tokens)
  ) {
    const sourceRoomText = tokens.slice(0, roomToIndex).join(' ');
    if (fragment.tokenIndex >= roomToIndex + 1 && !tokens.includes('is')) {
      return getConnectedRoomReferenceResolution(
        input,
        fragment,
        doc,
        roomToIndex + 1,
        sourceRoomText,
        createKeywordSuggestions(prefix, ['is']),
        roomSlotSuggestionHelpers,
      );
    }
  }

  if (lastToken === 'of') {
    return getRoomReferenceResolution(input, fragment, doc, fragment.tokenIndex, roomSlotSuggestionHelpers);
  }

  if (lastToken === 'is' && roomToIndex > 0 && !isPseudoRoomLead(tokens)) {
    return suggestionResolution(createConnectionAnnotationSuggestions(prefix));
  }

  if (
    lastToken === 'is'
    && !tokens.includes('to')
    && (
      isPseudoRoomLead(tokens)
    )
  ) {
    return suggestionResolution(createKeywordSuggestions(prefix, ['unknown']));
  }

  if (lastToken === 'is' && hasMalformedPseudoRoomContinuation(tokens)) {
    return suggestionResolution([]);
  }

  if (lastToken === 'is') {
    return suggestionResolution(createTerminalKeywordSuggestions(prefix, ['dark', 'lit']));
  }

  if (lastToken === 'goes') {
    return suggestionResolution(createKeywordSuggestions(prefix, ['on']));
  }

  if (lastToken === 'on') {
    return suggestionResolution(createKeywordSuggestions(prefix, ['forever']));
  }

  if (lastToken === 'unknown' || lastToken === 'forever' || lastToken === 'nowhere' || lastToken === 'death') {
    return suggestionResolution([]);
  }

  if (lastToken === 'dark' || lastToken === 'lit') {
    return suggestionResolution([]);
  }

  if (lastToken === 'lies') {
    return suggestionResolution(createKeywordSuggestions(prefix, ['death']));
  }

  if (lastToken === 'leads') {
    return suggestionResolution(createKeywordSuggestions(prefix, ['nowhere']));
  }

  if (lastToken === 'to') {
    if (isPseudoRoomLead(tokens)) {
      return suggestionResolution([]);
    }
    return getRoomReferenceResolution(input, fragment, doc, fragment.tokenIndex, roomSlotSuggestionHelpers);
  }

  if (hasMalformedPseudoRoomContinuation(tokens)) {
    return suggestionResolution([]);
  }

  if (fragment.tokenIndex >= 1) {
    return suggestionResolution(createKeywordSuggestions(prefix, ['is', 'to']));
  }

  return suggestionResolution([]);
}

export function getCliSuggestions(
  input: string,
  caretPosition: number,
  doc: MapDocument | null,
): CliSuggestionResult | null {
  const fragment = getActiveFragment(input, caretPosition);
  if (fragment === null) {
    return null;
  }

  const resolution = fragment.prefix.length === 0 && fragment.tokenIndex === 0
    ? suggestionResolution(createDefaultSuggestions(doc))
    : getSuggestionsForCommandContext(input, fragment, doc);
  if (resolution.suggestions.length === 0) {
    return null;
  }

  return {
    replaceStart: resolution.replaceStart ?? fragment.start,
    replaceEnd: resolution.replaceEnd ?? fragment.end,
    prefix: resolution.prefix ?? fragment.prefix,
    suggestions: resolution.suggestions,
    highlightedIndex: 0,
  };
}
