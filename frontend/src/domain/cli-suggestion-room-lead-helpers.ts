import {
  hasMalformedPseudoRoomContinuation,
  isPseudoRoomLead,
  suggestionResolution,
} from './cli-suggestion-grammar-helpers';
import { listCliSuggestionNextSymbols } from './cli-suggestion-parser';
import {
  createConnectionAnnotationSuggestions,
  createKeywordSuggestions,
  createTerminalKeywordSuggestions,
} from './cli-suggestion-options';
import {
  getConnectedRoomReferenceResolution,
  getRoomReferenceResolution,
  type RoomSlotSuggestionHelpers,
} from './cli-suggestion-room-slots';
import type { ActiveFragment, SuggestionResolution } from './cli-suggestion-types';
import type { MapDocument } from './map-types';

function getParserNextSymbolsForFragment(fragment: ActiveFragment): readonly ReturnType<typeof listCliSuggestionNextSymbols>[number][] {
  return listCliSuggestionNextSymbols(fragment.precedingTokens.map((token) => token.value.toLowerCase()).join(' '));
}

function getParserBackedRoomLeadResolution(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
  roomSlotSuggestionHelpers: RoomSlotSuggestionHelpers,
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

export function getRoomLeadResolution(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
  tokens: readonly string[],
  lastToken: string | null,
  roomSlotSuggestionHelpers: RoomSlotSuggestionHelpers,
): SuggestionResolution | null {
  const parserBackedRoomLeadResolution = getParserBackedRoomLeadResolution(input, fragment, doc, roomSlotSuggestionHelpers);
  if (parserBackedRoomLeadResolution !== null) {
    return parserBackedRoomLeadResolution;
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
        createKeywordSuggestions(fragment.prefix, ['is']),
        roomSlotSuggestionHelpers,
      );
    }
  }

  if (lastToken === 'is' && roomToIndex > 0 && !isPseudoRoomLead(tokens)) {
    return suggestionResolution(createConnectionAnnotationSuggestions(fragment.prefix));
  }

  if (lastToken === 'is' && hasMalformedPseudoRoomContinuation(tokens)) {
    return suggestionResolution([]);
  }

  if (lastToken === 'is') {
    return suggestionResolution(createTerminalKeywordSuggestions(fragment.prefix, ['dark', 'lit']));
  }

  if (lastToken === 'dark' || lastToken === 'lit') {
    return suggestionResolution([]);
  }

  if (lastToken === 'to') {
    if (isPseudoRoomLead(tokens)) {
      return suggestionResolution([]);
    }

    return getRoomReferenceResolution(input, fragment, doc, fragment.tokenIndex, roomSlotSuggestionHelpers);
  }

  if (fragment.tokenIndex >= 1) {
    return suggestionResolution(createKeywordSuggestions(fragment.prefix, ['is', 'to']));
  }

  return null;
}
