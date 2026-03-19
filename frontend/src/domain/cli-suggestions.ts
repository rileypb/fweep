import { getActiveFragment } from './cli-suggestion-fragments';
import {
  getCanonicalDirectionToken,
  hasCommaAfterLastPrecedingToken,
  hasMalformedPseudoRoomContinuation,
  isPseudoRoomLead,
  mergeSuggestions,
  suggestionResolution,
} from './cli-suggestion-grammar-helpers';
import {
  createCreateWhichIsSuggestions,
  getCreateAndConnectIntroResolution,
  getCreateCommandResolution,
} from './cli-suggestion-create-helpers';
import {
  getConnectCommandResolution,
  getParserBackedConnectTailResolution,
} from './cli-suggestion-connect-helpers';
import {
  getParserBackedDisconnectResolution,
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
  createDefaultSuggestions,
  createDirectionSuggestions,
  createHelpTopicSuggestions,
  createKeywordSuggestions,
  createPlaceholderSuggestion,
  createTerminalKeywordSuggestions,
} from './cli-suggestion-options';
import {
  createRoomSuggestions,
  getLeadingRoomReferenceResolution,
  getRoomReferenceResolution,
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
  const lastPrecedingToken = fragment.precedingTokens.at(-1) ?? null;
  const lastToken = lastPrecedingToken?.value.toLowerCase() ?? null;
  const canonicalLastDirection = lastPrecedingToken?.quoted ? null : getCanonicalDirectionToken(lastToken);

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

  if (tokens[0] === 'disconnect') {
    return getParserBackedDisconnectResolution(input, fragment, doc, roomSlotSuggestionHelpers);
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
    && tokens[0] !== 'disconnect'
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
    && tokens[0] !== 'disconnect'
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
    return getConnectCommandResolution(input, fragment, doc, tokens, lastToken, canonicalLastDirection, {
      roomSlotSuggestionHelpers,
      getCreateAndConnectIntroResolution: (
        nextInput,
        nextFragment,
        nextDoc,
        nextTokens,
        nextLastToken,
        nextCanonicalLastDirection,
      ) => getCreateAndConnectIntroResolution(nextInput, nextFragment, nextDoc, nextTokens, nextLastToken, nextCanonicalLastDirection, {
        roomSlotSuggestionHelpers,
        getParserBackedCreateContinuationSuggestions,
        getParserBackedConnectTailResolution,
        getSuggestionsForCommandContext,
      }),
    });
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
