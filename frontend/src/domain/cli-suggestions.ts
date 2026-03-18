import { getActiveFragment } from './cli-suggestion-fragments';
import {
  getCanonicalDirectionToken,
  hasCommaAfterLastPrecedingToken,
  hasMalformedPseudoRoomContinuation,
  isExactDirectionToken,
  isDirectionLikePrefix,
  isPseudoRoomLead,
  mergeSuggestions,
  suggestionResolution,
} from './cli-suggestion-grammar-helpers';
import { listCliSuggestionNextSymbols } from './cli-suggestion-parser';
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

const roomSlotSuggestionHelpers = {
  createPlaceholderSuggestion,
  mergeSuggestions,
} as const;

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

function getParserNextSymbolsForTokens(tokens: readonly string[]): readonly ReturnType<typeof listCliSuggestionNextSymbols>[number][] {
  const parserTokens = normalizeParserTokens(tokens);
  return listCliSuggestionNextSymbols(parserTokens.join(' '));
}

function getParserNextSymbolsForFragment(fragment: ActiveFragment): readonly ReturnType<typeof listCliSuggestionNextSymbols>[number][] {
  return getParserNextSymbolsForTokens(fragment.precedingTokens.map((token) => token.value.toLowerCase()));
}

function getParserNextSymbolsBeforeSlot(fragment: ActiveFragment, slotStartTokenIndex: number): readonly ReturnType<typeof listCliSuggestionNextSymbols>[number][] {
  return getParserNextSymbolsForTokens(
    fragment.precedingTokens
      .slice(0, slotStartTokenIndex)
      .map((token) => token.value.toLowerCase()),
  );
}

function getParserBackedHelpTopicResolution(fragment: ActiveFragment): SuggestionResolution | null {
  const nextSymbols = getParserNextSymbolsForFragment(fragment);
  const hasHelpTopicSlot = nextSymbols.some((entry) => entry.symbol.kind === 'slot' && entry.symbol.slotType === 'HELP_TOPIC');
  if (!hasHelpTopicSlot) {
    return null;
  }

  return suggestionResolution(createHelpTopicSuggestions(fragment.prefix));
}

function getParserBackedGoResolution(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
): SuggestionResolution | null {
  const nextSymbols = tokensAtRoomSlot(fragment)
    ? getParserNextSymbolsBeforeSlot(fragment, 2)
    : getParserNextSymbolsForFragment(fragment);
  const hasDirectionSlot = nextSymbols.some((entry) => entry.symbol.kind === 'slot' && entry.symbol.slotType === 'DIRECTION');
  const hasToKeyword = nextSymbols.some((entry) => entry.symbol.kind === 'keyword' && entry.symbol.text === 'to');
  const hasRoomSlot = nextSymbols.some((entry) => entry.symbol.kind === 'slot' && entry.symbol.slotType === 'ROOM_REF');

  if (hasRoomSlot) {
    return getRoomReferenceResolution(input, fragment, doc, 2, roomSlotSuggestionHelpers);
  }

  if (hasDirectionSlot || hasToKeyword) {
    return suggestionResolution([
      ...(hasDirectionSlot ? createDirectionSuggestions(fragment.prefix) : []),
      ...(hasToKeyword ? createKeywordSuggestions(fragment.prefix, ['to']) : []),
    ]);
  }

  return null;
}

function tokensAtRoomSlot(fragment: ActiveFragment): boolean {
  return fragment.precedingTokens[0]?.value.toLowerCase() === 'go'
    && fragment.precedingTokens[1]?.value.toLowerCase() === 'to';
}

function getParserBackedSingleRoomCommandResolution(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
  slotStartTokenIndex: number,
): SuggestionResolution {
  const nextSymbols = getParserNextSymbolsBeforeSlot(fragment, slotStartTokenIndex);
  const hasRoomSlot = nextSymbols.some((entry) => entry.symbol.kind === 'slot' && entry.symbol.slotType === 'ROOM_REF');
  if (hasRoomSlot) {
    return getRoomReferenceResolution(input, fragment, doc, slotStartTokenIndex, roomSlotSuggestionHelpers);
  }

  return suggestionResolution([]);
}

function getParserBackedNotateResolution(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
): SuggestionResolution {
  if (fragment.precedingTokens.some((token) => token.value.toLowerCase() === 'with')) {
    return suggestionResolution([]);
  }

  const nextSymbols = getParserNextSymbolsBeforeSlot(fragment, 1);
  const hasRoomSlot = nextSymbols.some((entry) => entry.symbol.kind === 'slot' && entry.symbol.slotType === 'ROOM_REF');

  if (hasRoomSlot) {
    return getRoomReferenceResolutionWithFallback(
      input,
      fragment,
      doc,
      1,
      createKeywordSuggestions(fragment.prefix, ['with']),
      roomSlotSuggestionHelpers,
    );
  }

  return suggestionResolution([]);
}

function getParserBackedRoomSlotAfterKeywordResolution(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
  slotStartTokenIndex: number,
): SuggestionResolution {
  const nextSymbols = getParserNextSymbolsBeforeSlot(fragment, slotStartTokenIndex);
  const hasRoomSlot = nextSymbols.some((entry) => entry.symbol.kind === 'slot' && entry.symbol.slotType === 'ROOM_REF');
  if (!hasRoomSlot) {
    return suggestionResolution([]);
  }

  return getParserBackedSingleRoomCommandResolution(input, fragment, doc, slotStartTokenIndex);
}

function getParserBackedTerminalCommandResolution(fragment: ActiveFragment): SuggestionResolution | null {
  if (fragment.tokenIndex >= 1) {
    return suggestionResolution([]);
  }

  const nextSymbols = getParserNextSymbolsForFragment(fragment);
  if (nextSymbols.length === 0) {
    return suggestionResolution([]);
  }

  return null;
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
      ...createKeywordSuggestions(prefix, ['the']),
      ...createRoomSuggestions(doc, prefix),
    ]);
  }

  if ((tokens[0] === 'help' || tokens[0] === 'h') && fragment.tokenIndex === 1) {
    const parserBackedHelpResolution = getParserBackedHelpTopicResolution(fragment);
    if (parserBackedHelpResolution !== null) {
      return parserBackedHelpResolution;
    }

    return suggestionResolution(createHelpTopicSuggestions(prefix));
  }

  if (tokens[0] === 'help' || tokens[0] === 'h') {
    return suggestionResolution([]);
  }

  if (
    tokens[0] === 'arrange'
    || tokens[0] === 'arr'
    || tokens[0] === 'prettify'
    || tokens[0] === 'undo'
    || tokens[0] === 'redo'
  ) {
    const parserBackedTerminalResolution = getParserBackedTerminalCommandResolution(fragment);
    if (parserBackedTerminalResolution !== null) {
      return parserBackedTerminalResolution;
    }
  }

  if (tokens[0] === 'the' && fragment.tokenIndex === 1) {
    return suggestionResolution(createKeywordSuggestions(prefix, ['room', 'way']));
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
    const parserBackedGoResolution = getParserBackedGoResolution(input, fragment, doc);
    if (parserBackedGoResolution !== null) {
      return parserBackedGoResolution;
    }

    return suggestionResolution([
      ...createDirectionSuggestions(prefix),
      ...createKeywordSuggestions(prefix, ['to']),
    ]);
  }

  if (tokens[0] === 'go' && tokens[1] === 'to') {
    const parserBackedGoResolution = getParserBackedGoResolution(input, fragment, doc);
    if (parserBackedGoResolution !== null) {
      return parserBackedGoResolution;
    }

    return getRoomReferenceResolution(input, fragment, doc, 2, roomSlotSuggestionHelpers);
  }

  if (tokens[0] === 'show' || tokens[0] === 's') {
    return getParserBackedSingleRoomCommandResolution(input, fragment, doc, 1);
  }

  if (tokens[0] === 'delete' || tokens[0] === 'd' || tokens[0] === 'del' || tokens[0] === 'edit' || tokens[0] === 'ed') {
    return getParserBackedSingleRoomCommandResolution(input, fragment, doc, 1);
  }

  if (tokens[0] === 'notate' || tokens[0] === 'annotate' || tokens[0] === 'ann') {
    return getParserBackedNotateResolution(input, fragment, doc);
  }

  if (tokens[0] === 'put') {
    if (tokens.includes('in')) {
      const inIndex = tokens.indexOf('in');
      if (fragment.tokenIndex > inIndex) {
        return getParserBackedRoomSlotAfterKeywordResolution(input, fragment, doc, inIndex + 1);
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
        return getParserBackedRoomSlotAfterKeywordResolution(input, fragment, doc, fromIndex + 1);
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
      && !isExactDirectionToken(lastToken)
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

    if (getCanonicalDirectionToken(tokens[2] ?? null) !== null && !tokens.includes('of')) {
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

    if (getCanonicalDirectionToken(tokens[2] ?? null) !== null && !tokens.includes('of')) {
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
