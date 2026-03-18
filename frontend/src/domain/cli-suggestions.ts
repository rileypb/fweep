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
import {
  createCreateWhichIsSuggestions,
  getCreateAndConnectIntroResolution,
  getCreateCommandResolution,
  hasCompletedCreateAdjectivePhrase,
} from './cli-suggestion-create-helpers';
import {
  getParserBackedGoResolution,
  getParserBackedHelpTopicResolution,
  getParserBackedNotateResolution,
  getParserBackedRoomSlotAfterKeywordResolution,
  getParserBackedSingleRoomCommandResolution,
} from './cli-suggestion-command-helpers';
import { getPseudoRoomResolution } from './cli-suggestion-pseudo-room-helpers';
import {
  getParserNextSymbolsBeforeSlot,
  getParserNextSymbolsForFragment,
  getParserNextSymbolsForRawFragmentInput,
} from './cli-suggestion-parser-helpers';
import { getRoomLeadResolution } from './cli-suggestion-room-lead-helpers';
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
  type RoomSlotSuggestionHelpers,
} from './cli-suggestion-room-slots';
import type { CliSuggestion, CliSuggestionResult, SuggestionResolution, ActiveFragment } from './cli-suggestion-types';
import type { MapDocument } from './map-types';

export type { CliSuggestion, CliSuggestionResult } from './cli-suggestion-types';

const roomSlotSuggestionHelpers: RoomSlotSuggestionHelpers = {
  createPlaceholderSuggestion,
  mergeSuggestions,
} as const;

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
  input: string,
  fragment: ActiveFragment,
  options?: { readonly disallowNewRoomContinuation?: boolean },
): readonly CliSuggestion[] | null {
  const nextSymbols = getParserNextSymbolsForRawFragmentInput(input, fragment);
  const disallowNewRoomContinuation = options?.disallowNewRoomContinuation ?? false;
  const keywordEntries = nextSymbols.filter(
    (entry): entry is typeof nextSymbols[number] & { symbol: Extract<typeof entry.symbol, { kind: 'keyword' }> } => entry.symbol.kind === 'keyword',
  );

  const hasWhichPhrase = keywordEntries.some(
    (entry) => (
      entry.symbol.text === ','
      && (
        (!disallowNewRoomContinuation && entry.sourceStateIds.includes('CREATE_NEW_ROOM'))
        || (!disallowNewRoomContinuation && entry.sourceStateIds.includes('CREATE_AND_CONNECT_NEW_ROOM'))
      )
    ) || (
      entry.symbol.text === 'which'
      && (
        entry.sourceStateIds.includes('CREATE_NEW_ROOM_COMMA')
        || entry.sourceStateIds.includes('CREATE_AND_CONNECT_COMMA')
      )
    ),
  );
  const hasCommaKeyword = keywordEntries.some(
    (entry) => entry.symbol.text === ','
      && (
        entry.sourceStateIds.includes('CREATE_ADJECTIVE')
        || entry.sourceStateIds.includes('CREATE_AND_CONNECT_ADJECTIVE')
      ),
  );
  const hasIsKeyword = keywordEntries.some(
    (entry) => entry.symbol.text === 'is'
      && (
        entry.sourceStateIds.includes('CREATE_NEW_ROOM_WHICH')
        || entry.sourceStateIds.includes('CREATE_AND_CONNECT_WHICH')
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
  const hasOfKeyword = keywordEntries.some(
    (entry) => entry.symbol.text === 'of' && entry.sourceStateIds.includes('CREATE_DIRECTION'),
  );

  if (
    !hasWhichPhrase
    && !hasCommaKeyword
    && !hasIsKeyword
    && !hasAboveKeyword
    && !hasBelowKeyword
    && !hasDirectionSlot
    && !hasOfKeyword
  ) {
    return null;
  }

  return [
    ...(hasWhichPhrase ? createCreateWhichIsSuggestions(fragment.prefix) : []),
    ...(hasCommaKeyword ? createKeywordSuggestions(fragment.prefix, [',']) : []),
    ...(hasIsKeyword ? createKeywordSuggestions(fragment.prefix, ['is']) : []),
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
    ...(hasOfKeyword ? createKeywordSuggestions(fragment.prefix, ['of']) : []),
  ];
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
    const roomLeadResolution = getRoomLeadResolution(input, fragment, doc, tokens, lastToken, roomSlotSuggestionHelpers);
    if (roomLeadResolution !== null) {
      return roomLeadResolution;
    }
  }

  if (tokens[0] === 'go' && fragment.tokenIndex === 1) {
    const parserBackedGoResolution = getParserBackedGoResolution(input, fragment, doc, roomSlotSuggestionHelpers);
    if (parserBackedGoResolution !== null) {
      return parserBackedGoResolution;
    }

    return suggestionResolution([
      ...createDirectionSuggestions(prefix),
      ...createKeywordSuggestions(prefix, ['to']),
    ]);
  }

  if (tokens[0] === 'go' && tokens[1] === 'to') {
    const parserBackedGoResolution = getParserBackedGoResolution(input, fragment, doc, roomSlotSuggestionHelpers);
    if (parserBackedGoResolution !== null) {
      return parserBackedGoResolution;
    }

    return getRoomReferenceResolution(input, fragment, doc, 2, roomSlotSuggestionHelpers);
  }

  if (tokens[0] === 'show' || tokens[0] === 's') {
    return getParserBackedSingleRoomCommandResolution(input, fragment, doc, 1, roomSlotSuggestionHelpers);
  }

  if (tokens[0] === 'delete' || tokens[0] === 'd' || tokens[0] === 'del' || tokens[0] === 'edit' || tokens[0] === 'ed') {
    return getParserBackedSingleRoomCommandResolution(input, fragment, doc, 1, roomSlotSuggestionHelpers);
  }

  if (tokens[0] === 'notate' || tokens[0] === 'annotate' || tokens[0] === 'ann') {
    return getParserBackedNotateResolution(input, fragment, doc, roomSlotSuggestionHelpers);
  }

  if (tokens[0] === 'put') {
    if (tokens.includes('in')) {
      const inIndex = tokens.indexOf('in');
      if (fragment.tokenIndex > inIndex) {
        return getParserBackedRoomSlotAfterKeywordResolution(input, fragment, doc, inIndex + 1, roomSlotSuggestionHelpers);
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
        return getParserBackedRoomSlotAfterKeywordResolution(input, fragment, doc, fromIndex + 1, roomSlotSuggestionHelpers);
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
      return getCreateAndConnectIntroResolution(input, fragment, doc, tokens, lastToken, canonicalLastDirection, {
        roomSlotSuggestionHelpers,
        getParserBackedCreateContinuationSuggestions,
        getParserBackedConnectTailResolution,
        getSuggestionsForCommandContext,
      });
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
    return getCreateCommandResolution(input, fragment, doc, tokens, lastToken, canonicalLastDirection, {
      roomSlotSuggestionHelpers,
      getParserBackedCreateContinuationSuggestions,
      getParserBackedConnectTailResolution,
      getSuggestionsForCommandContext,
    });
  }

  const pseudoRoomResolution = getPseudoRoomResolution(input, fragment, doc, tokens, roomSlotSuggestionHelpers);
  if (pseudoRoomResolution !== null) {
    return pseudoRoomResolution;
  }

  if (lastToken === 'of') {
    return getRoomReferenceResolution(input, fragment, doc, fragment.tokenIndex, roomSlotSuggestionHelpers);
  }

  if (lastToken === 'is' && hasMalformedPseudoRoomContinuation(tokens)) {
    return suggestionResolution([]);
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

  if (hasMalformedPseudoRoomContinuation(tokens)) {
    return suggestionResolution([]);
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
