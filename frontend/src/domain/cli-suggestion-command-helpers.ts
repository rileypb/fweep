import { suggestionResolution } from './cli-suggestion-grammar-helpers';
import {
  getParserNextSymbolsBeforeSlot,
  getParserNextSymbolsForFragment,
} from './cli-suggestion-parser-helpers';
import {
  createDirectionSuggestions,
  createHelpTopicSuggestions,
  createKeywordSuggestions,
} from './cli-suggestion-options';
import {
  getRoomReferenceResolution,
  getRoomReferenceResolutionWithFallback,
  type RoomSlotSuggestionHelpers,
} from './cli-suggestion-room-slots';
import type { ActiveFragment, SuggestionResolution } from './cli-suggestion-types';
import type { MapDocument } from './map-types';

export function getParserBackedHelpTopicResolution(fragment: ActiveFragment): SuggestionResolution | null {
  const nextSymbols = getParserNextSymbolsForFragment(fragment);
  const hasHelpTopicSlot = nextSymbols.some((entry) => entry.symbol.kind === 'slot' && entry.symbol.slotType === 'HELP_TOPIC');
  if (!hasHelpTopicSlot) {
    return null;
  }

  return suggestionResolution(createHelpTopicSuggestions(fragment.prefix));
}

function tokensAtGoRoomSlot(fragment: ActiveFragment): boolean {
  return fragment.precedingTokens[0]?.value.toLowerCase() === 'go'
    && fragment.precedingTokens[1]?.value.toLowerCase() === 'to';
}

export function getParserBackedGoResolution(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
  roomSlotSuggestionHelpers: RoomSlotSuggestionHelpers,
): SuggestionResolution | null {
  const nextSymbols = tokensAtGoRoomSlot(fragment)
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

export function getParserBackedSingleRoomCommandResolution(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
  slotStartTokenIndex: number,
  roomSlotSuggestionHelpers: RoomSlotSuggestionHelpers,
): SuggestionResolution {
  const nextSymbols = getParserNextSymbolsBeforeSlot(fragment, slotStartTokenIndex);
  const hasRoomSlot = nextSymbols.some((entry) => entry.symbol.kind === 'slot' && entry.symbol.slotType === 'ROOM_REF');
  if (hasRoomSlot) {
    return getRoomReferenceResolution(input, fragment, doc, slotStartTokenIndex, roomSlotSuggestionHelpers);
  }

  return suggestionResolution([]);
}

export function getParserBackedNotateResolution(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
  roomSlotSuggestionHelpers: RoomSlotSuggestionHelpers,
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

export function getParserBackedRoomSlotAfterKeywordResolution(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
  slotStartTokenIndex: number,
  roomSlotSuggestionHelpers: RoomSlotSuggestionHelpers,
): SuggestionResolution {
  const nextSymbols = getParserNextSymbolsBeforeSlot(fragment, slotStartTokenIndex);
  const hasRoomSlot = nextSymbols.some((entry) => entry.symbol.kind === 'slot' && entry.symbol.slotType === 'ROOM_REF');
  if (!hasRoomSlot) {
    return suggestionResolution([]);
  }

  return getParserBackedSingleRoomCommandResolution(input, fragment, doc, slotStartTokenIndex, roomSlotSuggestionHelpers);
}
