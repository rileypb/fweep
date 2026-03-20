import {
  getCanonicalDirectionToken,
  suggestionResolution,
} from './cli-suggestion-grammar-helpers';
import {
  getParserNextSymbolsForFragment,
  getParserNextSymbolsForRawFragmentInput,
} from './cli-suggestion-parser-helpers';
import {
  createDirectionSuggestions,
  createKeywordSuggestions,
} from './cli-suggestion-options';
import {
  getRoomReferenceResolution,
  getRoomReferenceResolutionWithFallback,
  type RoomSlotSuggestionHelpers,
} from './cli-suggestion-room-slots';
import type { ActiveFragment, SuggestionResolution } from './cli-suggestion-types';
import type { MapDocument } from './map-types';

const unknownPseudoRoomSuggestions = ['is unknown'] as const;
const pseudoWaySuggestionTexts = ['goes on forever', 'leads nowhere', 'leads to somewhere else', 'lies death'] as const;
const pseudoRoomSuggestionTexts = ['is unknown', 'goes on forever', 'leads nowhere', 'leads to somewhere else', 'lies death'] as const;

function getParserBackedPseudoRoomResolution(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
  roomSlotSuggestionHelpers: RoomSlotSuggestionHelpers,
): SuggestionResolution | null {
  const rawNextSymbols = getParserNextSymbolsForRawFragmentInput(input, fragment);
  const slotAwareNextSymbols = fragment.prefix.length > 0
    ? getParserNextSymbolsForFragment(fragment)
    : rawNextSymbols;
  const keywordEntries = rawNextSymbols.filter(
    (entry): entry is typeof rawNextSymbols[number] & { symbol: Extract<typeof entry.symbol, { kind: 'keyword' }> } => entry.symbol.kind === 'keyword',
  );
  const phraseEntries = rawNextSymbols.filter(
    (entry): entry is typeof rawNextSymbols[number] & { symbol: Extract<typeof entry.symbol, { kind: 'phrase' }> } => entry.symbol.kind === 'phrase',
  );
  const roomSlotEntries = slotAwareNextSymbols.filter(
    (entry): entry is typeof slotAwareNextSymbols[number] & { symbol: Extract<typeof entry.symbol, { kind: 'slot' }> } =>
      entry.symbol.kind === 'slot' && entry.symbol.slotType === 'ROOM_REF',
  );

  const hasTheRoomLeadState = rawNextSymbols.some(
    (entry) => entry.symbol.kind === 'slot' && entry.symbol.slotType === 'DIRECTION' && entry.sourceStateIds.includes('THE_ROOM'),
  );
  const hasTheWayLeadState = rawNextSymbols.some(
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
  const hasTheRoomTerminalKeyword = keywordEntries.some(
    (entry) => entry.sourceStateIds.includes('THE_ROOM_OF_ROOM') || entry.sourceStateIds.includes('THE_ROOM_VERTICAL_ROOM'),
  );
  const hasTheWayTerminalKeyword = keywordEntries.some(
    (entry) => entry.sourceStateIds.includes('THE_WAY_OF_ROOM') || entry.sourceStateIds.includes('THE_WAY_VERTICAL_ROOM'),
  );
  const hasGenericPseudoTerminalKeyword = keywordEntries.some(
    (entry) => entry.sourceStateIds.includes('DIRECTION_OF_ROOM')
      || entry.sourceStateIds.includes('ABOVE_ROOM')
      || entry.sourceStateIds.includes('BELOW_ROOM'),
  );
  const hasUnknownKeyword = keywordEntries.some(
    (entry) => entry.symbol.text === 'unknown' && entry.sourceStateIds.includes('PSEUDO_IS'),
  );
  const hasOnKeyword = keywordEntries.some(
    (entry) => entry.symbol.text === 'on' && entry.sourceStateIds.includes('PSEUDO_GOES'),
  );
  const hasForeverKeyword = keywordEntries.some(
    (entry) => entry.symbol.text === 'forever' && entry.sourceStateIds.includes('PSEUDO_GOES_ON'),
  );
  const hasNowhereKeyword = keywordEntries.some(
    (entry) => entry.symbol.text === 'nowhere' && entry.sourceStateIds.includes('PSEUDO_LEADS'),
  );
  const hasSomewhereElsePhrase = phraseEntries.some(
    (entry) => entry.symbol.text === 'to somewhere else' && entry.sourceStateIds.includes('PSEUDO_LEADS'),
  );
  const hasDeathKeyword = keywordEntries.some(
    (entry) => entry.symbol.text === 'death' && entry.sourceStateIds.includes('PSEUDO_LIES'),
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
    if (fragment.prefix.length > 0) {
      return getRoomReferenceResolution(input, fragment, doc, roomSlotStartTokenIndex, roomSlotSuggestionHelpers);
    }

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
    if (fragment.prefix.length > 0) {
      return getRoomReferenceResolution(input, fragment, doc, roomSlotStartTokenIndex, roomSlotSuggestionHelpers);
    }

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
    if (fragment.prefix.length > 0) {
      return getRoomReferenceResolution(input, fragment, doc, roomSlotStartTokenIndex, roomSlotSuggestionHelpers);
    }

    return getRoomReferenceResolutionWithFallback(
      input,
      fragment,
      doc,
      roomSlotStartTokenIndex,
      createKeywordSuggestions(fragment.prefix, pseudoRoomSuggestionTexts),
      roomSlotSuggestionHelpers,
    );
  }

  if (hasTheRoomTerminalKeyword) {
    return suggestionResolution(createKeywordSuggestions(fragment.prefix, unknownPseudoRoomSuggestions));
  }

  if (hasTheWayTerminalKeyword) {
    return suggestionResolution(createKeywordSuggestions(fragment.prefix, pseudoWaySuggestionTexts));
  }

  if (hasGenericPseudoTerminalKeyword) {
    return suggestionResolution(createKeywordSuggestions(fragment.prefix, pseudoRoomSuggestionTexts));
  }

  if (hasUnknownKeyword) {
    return suggestionResolution(createKeywordSuggestions(fragment.prefix, ['unknown']));
  }

  if (hasOnKeyword) {
    return suggestionResolution(createKeywordSuggestions(fragment.prefix, ['on']));
  }

  if (hasForeverKeyword) {
    return suggestionResolution(createKeywordSuggestions(fragment.prefix, ['forever']));
  }

  if (hasNowhereKeyword) {
    return suggestionResolution(createKeywordSuggestions(fragment.prefix, ['nowhere', 'to somewhere else']));
  }

  if (hasSomewhereElsePhrase) {
    return suggestionResolution(createKeywordSuggestions(fragment.prefix, ['to somewhere else']));
  }

  if (hasDeathKeyword) {
    return suggestionResolution(createKeywordSuggestions(fragment.prefix, ['death']));
  }

  return null;
}

export function getPseudoRoomResolution(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
  tokens: readonly string[],
  roomSlotSuggestionHelpers: RoomSlotSuggestionHelpers,
): SuggestionResolution | null {
  const prefix = fragment.prefix;

  if (tokens[0] === 'the' && tokens[1] === 'room') {
    const parserBackedPseudoRoomResolution = getParserBackedPseudoRoomResolution(input, fragment, doc, roomSlotSuggestionHelpers);
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

    return null;
  }

  if (tokens[0] === 'the' && tokens[1] === 'way') {
    const parserBackedPseudoRoomResolution = getParserBackedPseudoRoomResolution(input, fragment, doc, roomSlotSuggestionHelpers);
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

    return null;
  }

  if (fragment.tokenIndex === 1 && getCanonicalDirectionToken(tokens[0] ?? null) !== null) {
    const parserBackedPseudoRoomResolution = getParserBackedPseudoRoomResolution(input, fragment, doc, roomSlotSuggestionHelpers);
    if (parserBackedPseudoRoomResolution !== null) {
      return parserBackedPseudoRoomResolution;
    }

    return suggestionResolution(createKeywordSuggestions(prefix, ['of']));
  }

  if (fragment.tokenIndex === 1 && (tokens[0] === 'above' || tokens[0] === 'below')) {
    const parserBackedPseudoRoomResolution = getParserBackedPseudoRoomResolution(input, fragment, doc, roomSlotSuggestionHelpers);
    if (parserBackedPseudoRoomResolution !== null) {
      return parserBackedPseudoRoomResolution;
    }

    return getRoomReferenceResolution(input, fragment, doc, 1, roomSlotSuggestionHelpers);
  }

  const isGenericPseudoLead = (getCanonicalDirectionToken(tokens[0] ?? null) !== null || tokens[0] === 'above' || tokens[0] === 'below')
    && !tokens.includes('to');

  if (isGenericPseudoLead) {
    const parserBackedPseudoRoomResolution = getParserBackedPseudoRoomResolution(input, fragment, doc, roomSlotSuggestionHelpers);
    if (parserBackedPseudoRoomResolution !== null) {
      return parserBackedPseudoRoomResolution;
    }
  }

  if (
    isGenericPseudoLead
    && !tokens.includes('is')
    && !tokens.includes('goes')
    && !tokens.includes('leads')
    && !tokens.includes('lies')
  ) {
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

  return null;
}
