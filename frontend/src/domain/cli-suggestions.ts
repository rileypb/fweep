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
const unknownPseudoRoomSuggestions = ['is unknown'] as const;
const pseudoWaySuggestionTexts = ['goes on forever', 'leads nowhere', 'lies death'] as const;
const pseudoRoomSuggestionTexts = ['is unknown', 'goes on forever', 'leads nowhere', 'lies death'] as const;

function createCreateWhichIsSuggestions(prefix: string): readonly CliSuggestion[] {
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

function hasCompletedCreateAdjectivePhrase(tokens: readonly string[]): boolean {
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

function getParserBackedRoomLeadResolution(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
): SuggestionResolution | null {
  const nextSymbols = getParserNextSymbolsForFragment(fragment);
  const keywordEntries = nextSymbols.filter(
    (entry): entry is typeof nextSymbols[number] & { symbol: Extract<typeof entry.symbol, { kind: 'keyword' }> } => entry.symbol.kind === 'keyword',
  );
  const hasRoomLeadKeyword = keywordEntries.some(
    (entry) => (entry.symbol.text === 'is' || entry.symbol.text === 'to') && entry.sourceStateIds.includes('ROOM_LEAD'),
  );
  const hasRoomLightingKeyword = keywordEntries.some(
    (entry) => (entry.symbol.text === 'dark' || entry.symbol.text === 'lit') && entry.sourceStateIds.includes('ROOM_LEAD_IS'),
  );
  const hasRoomToRoomIsKeyword = keywordEntries.some(
    (entry) => entry.symbol.text === 'is' && entry.sourceStateIds.includes('ROOM_TO_ROOM'),
  );
  const hasConnectedRoomSlot = nextSymbols.some(
    (entry) => entry.symbol.kind === 'slot'
      && entry.symbol.slotType === 'CONNECTED_ROOM_REF'
      && entry.sourceStateIds.includes('ROOM_LEAD_TO'),
  );
  const hasConnectionAnnotationKeyword = keywordEntries.some(
    (entry) => (entry.symbol.text === 'door' || entry.symbol.text === 'clear') && entry.sourceStateIds.includes('ROOM_TO_ROOM_IS'),
  )
    || nextSymbols.some((entry) => entry.symbol.kind === 'phrase' && entry.symbol.text === 'locked door');

  if (hasConnectionAnnotationKeyword) {
    return suggestionResolution(createConnectionAnnotationSuggestions(fragment.prefix));
  }

  if (hasRoomToRoomIsKeyword) {
    return suggestionResolution(createKeywordSuggestions(fragment.prefix, ['is']));
  }

  if (hasConnectedRoomSlot) {
    const roomToIndex = fragment.precedingTokens.findIndex((token) => token.value.toLowerCase() === 'to');
    if (roomToIndex === -1) {
      return suggestionResolution([]);
    }

    const sourceRoomText = fragment.precedingTokens
      .slice(0, roomToIndex)
      .map((token) => token.value)
      .join(' ');
    return getConnectedRoomReferenceResolution(
      input,
      fragment,
      doc,
      roomToIndex + 1,
      sourceRoomText,
      createKeywordSuggestions(fragment.prefix, ['is']),
      roomSlotSuggestionHelpers,
    );
  }

  if (hasRoomLightingKeyword) {
    return suggestionResolution(createTerminalKeywordSuggestions(fragment.prefix, ['dark', 'lit']));
  }

  if (hasRoomLeadKeyword) {
    return suggestionResolution(createKeywordSuggestions(fragment.prefix, ['is', 'to']));
  }

  return null;
}

function getParserBackedPseudoRoomResolution(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
): SuggestionResolution | null {
  const nextSymbols = getParserNextSymbolsForFragment(fragment);
  const keywordEntries = nextSymbols.filter(
    (entry): entry is typeof nextSymbols[number] & { symbol: Extract<typeof entry.symbol, { kind: 'keyword' }> } => entry.symbol.kind === 'keyword',
  );
  const roomSlotEntries = nextSymbols.filter(
    (entry): entry is typeof nextSymbols[number] & { symbol: Extract<typeof entry.symbol, { kind: 'slot' }> } =>
      entry.symbol.kind === 'slot' && entry.symbol.slotType === 'ROOM_REF',
  );

  const hasTheRoomLeadState = nextSymbols.some(
    (entry) => entry.symbol.kind === 'slot' && entry.symbol.slotType === 'DIRECTION' && entry.sourceStateIds.includes('THE_ROOM'),
  );
  const hasTheWayLeadState = nextSymbols.some(
    (entry) => entry.symbol.kind === 'slot' && entry.symbol.slotType === 'DIRECTION' && entry.sourceStateIds.includes('THE_WAY'),
  );
  const hasOfKeyword = keywordEntries.some(
    (entry) => entry.symbol.text === 'of'
      && (
        entry.sourceStateIds.includes('DIRECTION_LEAD')
        || entry.sourceStateIds.includes('THE_ROOM_DIRECTION')
        || entry.sourceStateIds.includes('THE_WAY_DIRECTION')
      ),
  );
  const hasTheRoomRoomSlot = roomSlotEntries.some(
    (entry) => entry.sourceStateIds.includes('THE_ROOM_OF') || entry.sourceStateIds.includes('THE_ROOM_VERTICAL'),
  );
  const hasTheWayRoomSlot = roomSlotEntries.some(
    (entry) => entry.sourceStateIds.includes('THE_WAY_OF') || entry.sourceStateIds.includes('THE_WAY_VERTICAL'),
  );
  const hasGenericPseudoRoomSlot = roomSlotEntries.some(
    (entry) => entry.sourceStateIds.includes('DIRECTION_OF')
      || entry.sourceStateIds.includes('ABOVE_LEAD')
      || entry.sourceStateIds.includes('BELOW_LEAD'),
  );

  if (hasTheRoomLeadState) {
    return suggestionResolution([
      ...createDirectionSuggestions(fragment.prefix),
      ...createKeywordSuggestions(fragment.prefix, ['above', 'below']),
    ]);
  }

  if (hasTheWayLeadState) {
    return suggestionResolution([
      ...createDirectionSuggestions(fragment.prefix),
      ...createKeywordSuggestions(fragment.prefix, ['above', 'below']),
    ]);
  }

  if (hasOfKeyword) {
    return suggestionResolution(createKeywordSuggestions(fragment.prefix, ['of']));
  }

  if (hasTheRoomRoomSlot) {
    const roomSlotStartTokenIndex = fragment.precedingTokens.findIndex((token) => token.value.toLowerCase() === 'of') + 1 || 3;
    return getRoomReferenceResolutionWithFallback(
      input,
      fragment,
      doc,
      roomSlotStartTokenIndex,
      createKeywordSuggestions(fragment.prefix, unknownPseudoRoomSuggestions),
      roomSlotSuggestionHelpers,
    );
  }

  if (hasTheWayRoomSlot) {
    const roomSlotStartTokenIndex = fragment.precedingTokens.findIndex((token) => token.value.toLowerCase() === 'of') + 1 || 3;
    return getRoomReferenceResolutionWithFallback(
      input,
      fragment,
      doc,
      roomSlotStartTokenIndex,
      createKeywordSuggestions(fragment.prefix, pseudoWaySuggestionTexts),
      roomSlotSuggestionHelpers,
    );
  }

  if (hasGenericPseudoRoomSlot) {
    const roomSlotStartTokenIndex = fragment.precedingTokens.findIndex((token) => token.value.toLowerCase() === 'of') + 1 || 1;
    return getRoomReferenceResolutionWithFallback(
      input,
      fragment,
      doc,
      roomSlotStartTokenIndex,
      createKeywordSuggestions(fragment.prefix, pseudoRoomSuggestionTexts),
      roomSlotSuggestionHelpers,
    );
  }

  return null;
}

function getParserBackedConnectTailResolution(fragment: ActiveFragment, canonicalLastDirection: string | null): SuggestionResolution | null {
  const nextSymbols = getParserNextSymbolsForFragment(fragment);
  const hasOneWayPhrase = nextSymbols.some(
    (entry) => entry.symbol.kind === 'phrase'
      && entry.symbol.text === 'one-way'
      && (
        entry.sourceStateIds.includes('CONNECT_DIRECTION')
        || entry.sourceStateIds.includes('CREATE_AND_CONNECT_DIRECTION')
      ),
  );
  const hasToKeyword = nextSymbols.some(
    (entry) => entry.symbol.kind === 'keyword'
      && entry.symbol.text === 'to'
      && (
        entry.sourceStateIds.includes('CONNECT_DIRECTION')
        || entry.sourceStateIds.includes('CONNECT_ONE_WAY')
        || entry.sourceStateIds.includes('CREATE_AND_CONNECT_DIRECTION')
        || entry.sourceStateIds.includes('CREATE_AND_CONNECT_ONE_WAY')
      ),
  );

  if (!hasOneWayPhrase && !hasToKeyword && canonicalLastDirection !== null) {
    return suggestionResolution(createKeywordSuggestions(fragment.prefix, ['one-way', 'to']));
  }

  if (
    !hasOneWayPhrase
    && !hasToKeyword
    && (fragment.precedingTokens.at(-1)?.value.toLowerCase() === 'one-way'
      || fragment.precedingTokens.at(-1)?.value.toLowerCase() === 'oneway'
      || fragment.precedingTokens.at(-1)?.value.toLowerCase() === 'way')
  ) {
    return suggestionResolution(createKeywordSuggestions(fragment.prefix, ['to']));
  }

  if (!hasOneWayPhrase && !hasToKeyword) {
    return null;
  }

  return suggestionResolution([
    ...(hasOneWayPhrase ? createKeywordSuggestions(fragment.prefix, ['one-way']) : []),
    ...(hasToKeyword ? createKeywordSuggestions(fragment.prefix, ['to']) : []),
  ]);
}

function getParserBackedCreateContinuationSuggestions(
  fragment: ActiveFragment,
  options?: { readonly disallowNewRoomContinuation?: boolean },
): readonly CliSuggestion[] | null {
  const nextSymbols = getParserNextSymbolsForFragment(fragment);
  const disallowNewRoomContinuation = options?.disallowNewRoomContinuation ?? false;
  const keywordEntries = nextSymbols.filter(
    (entry): entry is typeof nextSymbols[number] & { symbol: Extract<typeof entry.symbol, { kind: 'keyword' }> } => entry.symbol.kind === 'keyword',
  );

  const hasWhichPhrase = nextSymbols.some(
    (entry) => entry.symbol.kind === 'phrase'
      && entry.symbol.text === ', which is'
      && (
        (!disallowNewRoomContinuation && entry.sourceStateIds.includes('CREATE_NEW_ROOM'))
        || (!disallowNewRoomContinuation && entry.sourceStateIds.includes('CREATE_AND_CONNECT_NEW_ROOM'))
      ),
  );
  const hasAboveKeyword = keywordEntries.some(
    (entry) => entry.symbol.text === 'above'
      && !disallowNewRoomContinuation
      && entry.sourceStateIds.includes('CREATE_NEW_ROOM'),
  );
  const hasBelowKeyword = keywordEntries.some(
    (entry) => entry.symbol.text === 'below'
      && !disallowNewRoomContinuation
      && entry.sourceStateIds.includes('CREATE_NEW_ROOM'),
  );
  const hasDirectionSlot = nextSymbols.some(
    (entry) => entry.symbol.kind === 'slot'
      && entry.symbol.slotType === 'DIRECTION'
      && (
        (!disallowNewRoomContinuation && entry.sourceStateIds.includes('CREATE_NEW_ROOM'))
        || entry.sourceStateIds.includes('CREATE_AFTER_ADJECTIVE_COMMA')
        || (!disallowNewRoomContinuation && entry.sourceStateIds.includes('CREATE_AND_CONNECT_NEW_ROOM'))
        || entry.sourceStateIds.includes('CREATE_AND_CONNECT_AFTER_ADJECTIVE_COMMA')
      ),
  );
  const hasCommaKeyword = keywordEntries.some(
    (entry) => entry.symbol.text === ','
      && (
        entry.sourceStateIds.includes('CREATE_ADJECTIVE')
        || entry.sourceStateIds.includes('CREATE_AND_CONNECT_ADJECTIVE')
      ),
  );
  const hasOfKeyword = keywordEntries.some(
    (entry) => entry.symbol.text === 'of' && entry.sourceStateIds.includes('CREATE_DIRECTION'),
  );

  if (!hasWhichPhrase && !hasAboveKeyword && !hasBelowKeyword && !hasDirectionSlot && !hasCommaKeyword && !hasOfKeyword) {
    return null;
  }

  return [
    ...(hasWhichPhrase ? createKeywordSuggestions(fragment.prefix, [', which is']) : []),
    ...((hasAboveKeyword || hasBelowKeyword)
      ? createKeywordSuggestions(
        fragment.prefix,
        [
          ...(hasAboveKeyword ? ['above'] : []),
          ...(hasBelowKeyword ? ['below'] : []),
        ],
      )
      : []),
    ...(hasDirectionSlot ? createDirectionSuggestions(fragment.prefix) : []),
    ...(hasCommaKeyword ? createKeywordSuggestions(fragment.prefix, [',']) : []),
    ...(hasOfKeyword ? createKeywordSuggestions(fragment.prefix, ['of']) : []),
  ];
}

function getCreateAndConnectIntroResolution(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
  tokens: readonly string[],
  lastToken: string | null,
  canonicalLastDirection: string | null,
): SuggestionResolution {
  const prefix = fragment.prefix;
  const hasCompletedCreateAndConnectAdjectivePhrase = hasCompletedCreateAdjectivePhrase(tokens);
  const parserBackedCreateAndConnectContinuationSuggestions = getParserBackedCreateContinuationSuggestions(fragment, {
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

  const parserBackedConnectTailResolution = getParserBackedConnectTailResolution(fragment, canonicalLastDirection);
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

function getCreateCommandResolution(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
  tokens: readonly string[],
  lastToken: string | null,
  canonicalLastDirection: string | null,
): SuggestionResolution {
  const prefix = fragment.prefix;
  const hasCompletedCreatePhrase = hasCompletedCreateAdjectivePhrase(tokens);
  const parserBackedCreateContinuationSuggestions = getParserBackedCreateContinuationSuggestions(fragment, {
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

  if (
    tokens[0] !== 'the'
    && !isPseudoRoomLead(tokens)
    && tokens[0] !== 'go'
    && tokens[0] !== 'show'
    && tokens[0] !== 's'
    && tokens[0] !== 'delete'
    && tokens[0] !== 'd'
    && tokens[0] !== 'del'
    && tokens[0] !== 'edit'
    && tokens[0] !== 'e'
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
    && tokens[0] !== 'c'
    && tokens[0] !== 'arrange'
    && tokens[0] !== 'arr'
    && tokens[0] !== 'prettify'
    && tokens[0] !== 'help'
    && tokens[0] !== 'h'
    && tokens[0] !== 'undo'
    && tokens[0] !== 'redo'
  ) {
    const parserBackedRoomLeadResolution = getParserBackedRoomLeadResolution(input, fragment, doc);
    if (parserBackedRoomLeadResolution !== null) {
      return parserBackedRoomLeadResolution;
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
      return getCreateAndConnectIntroResolution(input, fragment, doc, tokens, lastToken, canonicalLastDirection);
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

    const parserBackedConnectTailResolution = getParserBackedConnectTailResolution(fragment, canonicalLastDirection);
    if (parserBackedConnectTailResolution !== null) {
      return parserBackedConnectTailResolution;
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
    return getCreateCommandResolution(input, fragment, doc, tokens, lastToken, canonicalLastDirection);
  }

  if (tokens[0] === 'the' && tokens[1] === 'room') {
    const parserBackedPseudoRoomResolution = getParserBackedPseudoRoomResolution(input, fragment, doc);
    if (parserBackedPseudoRoomResolution !== null) {
      return parserBackedPseudoRoomResolution;
    }

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
    const parserBackedPseudoRoomResolution = getParserBackedPseudoRoomResolution(input, fragment, doc);
    if (parserBackedPseudoRoomResolution !== null) {
      return parserBackedPseudoRoomResolution;
    }

    const pseudoWaySuggestions = createKeywordSuggestions(prefix, pseudoWaySuggestionTexts);

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
    const parserBackedPseudoRoomResolution = getParserBackedPseudoRoomResolution(input, fragment, doc);
    if (parserBackedPseudoRoomResolution !== null) {
      return parserBackedPseudoRoomResolution;
    }

    return suggestionResolution(createKeywordSuggestions(prefix, ['of']));
  }

  if (fragment.tokenIndex === 1 && (tokens[0] === 'above' || tokens[0] === 'below')) {
    const parserBackedPseudoRoomResolution = getParserBackedPseudoRoomResolution(input, fragment, doc);
    if (parserBackedPseudoRoomResolution !== null) {
      return parserBackedPseudoRoomResolution;
    }

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
    const parserBackedPseudoRoomResolution = getParserBackedPseudoRoomResolution(input, fragment, doc);
    if (parserBackedPseudoRoomResolution !== null) {
      return parserBackedPseudoRoomResolution;
    }

    const ofIndex = tokens.indexOf('of');
    const fallbackSuggestions = createKeywordSuggestions(prefix, pseudoRoomSuggestionTexts);

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
