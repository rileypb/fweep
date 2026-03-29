import { getCanonicalDirectionToken, suggestionResolution } from './cli-suggestion-grammar-helpers';
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
import { getRoomSlotWithFallbackResolution } from './cli-suggestion-room-slot-fallback-helpers';
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
  if (fragment.tokenIndex === 1) {
    return getRoomReferenceResolutionWithFallback(
      input,
      fragment,
      doc,
      1,
      createKeywordSuggestions(fragment.prefix, ['with']),
      roomSlotSuggestionHelpers,
    );
  }

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

export function getParserBackedDisconnectResolution(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
  roomSlotSuggestionHelpers: RoomSlotSuggestionHelpers,
): SuggestionResolution {
  const tokens = fragment.precedingTokens.map((token) => token.value.toLowerCase());
  const fromIndex = tokens.indexOf('from');
  const lastPrecedingToken = fragment.precedingTokens.at(-1)?.value.toLowerCase() ?? null;
  const hasCompletedSourceDirection = lastPrecedingToken !== null && getCanonicalDirectionToken(lastPrecedingToken) !== null;

  if (fromIndex !== -1 && fragment.tokenIndex > fromIndex) {
    return getRoomReferenceResolution(input, fragment, doc, fromIndex + 1, roomSlotSuggestionHelpers);
  }

  if (hasCompletedSourceDirection && fragment.prefix.length > 0) {
    return suggestionResolution(createKeywordSuggestions(fragment.prefix, ['from']));
  }

  const sourceRoomResolution = getRoomSlotWithFallbackResolution({
    input,
    fragment,
    doc,
    slotStartTokenIndex: 1,
    fallbackSuggestions: [
      ...createDirectionSuggestions(fragment.prefix),
      ...createKeywordSuggestions(fragment.prefix, ['from']),
    ],
    reservedTailTokens: ['from'],
    roomSlotSuggestionHelpers,
  });
  if (sourceRoomResolution !== null) {
    return sourceRoomResolution;
  }

  const nextSymbols = getParserNextSymbolsForFragment(fragment);
  const hasDirectionSlot = nextSymbols.some((entry) => entry.symbol.kind === 'slot' && entry.symbol.slotType === 'DIRECTION');
  const hasFromKeyword = nextSymbols.some((entry) => entry.symbol.kind === 'keyword' && entry.symbol.text === 'from');

  if (hasDirectionSlot || hasFromKeyword) {
    return getRoomReferenceResolutionWithFallback(
      input,
      fragment,
      doc,
      1,
      [
        ...(hasDirectionSlot ? createDirectionSuggestions(fragment.prefix) : []),
        ...(hasFromKeyword ? createKeywordSuggestions(fragment.prefix, ['from']) : []),
      ],
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
