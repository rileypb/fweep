import {
  getCanonicalDirectionToken,
  hasMalformedPseudoRoomContinuation,
  isPseudoRoomLead,
  mergeSuggestions,
  suggestionResolution,
} from './cli-suggestion-grammar-helpers';
import { getParserNextSymbolsForFragment } from './cli-suggestion-parser-helpers';
import {
  createConnectionAnnotationSuggestions,
  createKeywordSuggestions,
  createPlaceholderSuggestion,
  createTerminalKeywordSuggestions,
} from './cli-suggestion-options';
import { createCreateWhichIsSuggestions } from './cli-suggestion-create-helpers';
import {
  getConnectedRoomReferenceResolution,
  getRoomReferenceResolution,
  type RoomSlotSuggestionHelpers,
} from './cli-suggestion-room-slots';
import { parseCliCommand } from './cli-command';
import type { ActiveFragment, SuggestionResolution } from './cli-suggestion-types';
import type { MapDocument } from './map-types';

function isSelectedRoomRelativeDirectionLead(tokens: readonly string[]): boolean {
  const firstToken = tokens[0] ?? null;
  return getCanonicalDirectionToken(firstToken) !== null || firstToken === 'above' || firstToken === 'below';
}

function shouldOfferSelectedRoomRelativeIs(prefix: string): boolean {
  const normalizedPrefix = prefix.trim().toLowerCase();
  return normalizedPrefix.length === 0 || 'is'.startsWith(normalizedPrefix);
}

function parseRelativeConnectWithoutAdjective(input: string): Extract<
  ReturnType<typeof parseCliCommand>,
  { kind: 'selected-room-relative-connect' }
> | null {
  const parsed = parseCliCommand(input);
  return parsed?.kind === 'selected-room-relative-connect' && parsed.adjective === null
    ? parsed
    : null;
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
  const trimmedBeforeFragment = input.slice(0, fragment.start).trimEnd();
  const trimmedCurrentInput = input.slice(0, fragment.caret).trimEnd();
  const relativeConnectIsIndex = tokens.lastIndexOf('is');

  if (lastToken === 'which') {
    const baseInput = trimmedBeforeFragment.endsWith(',')
      ? trimmedBeforeFragment.slice(0, -1).trimEnd()
      : '';
    if (baseInput.length > 0 && parseRelativeConnectWithoutAdjective(baseInput) !== null) {
      return suggestionResolution(createKeywordSuggestions(fragment.prefix, ['is']));
    }
  }

  if (tokens.at(-2) === 'which' && lastToken === 'is') {
    const whichIndex = trimmedBeforeFragment.toLowerCase().lastIndexOf('which');
    const baseInput = whichIndex >= 0
      ? trimmedBeforeFragment.slice(0, whichIndex).trimEnd().replace(/,$/, '').trimEnd()
      : '';
    if (baseInput.length > 0 && parseRelativeConnectWithoutAdjective(baseInput) !== null) {
      return suggestionResolution(createTerminalKeywordSuggestions(fragment.prefix, ['dark', 'lit']));
    }
  }

  if ((lastToken === 'dark' || lastToken === 'lit')) {
    const whichIsIndex = trimmedBeforeFragment.toLowerCase().lastIndexOf('which is');
    const baseInput = whichIsIndex >= 0
      ? trimmedBeforeFragment.slice(0, whichIsIndex).trimEnd().replace(/,$/, '').trimEnd()
      : '';
    if (baseInput.length > 0 && parseRelativeConnectWithoutAdjective(baseInput) !== null) {
      return suggestionResolution([]);
    }
  }

  if (trimmedBeforeFragment.endsWith(',')) {
    const baseInput = trimmedBeforeFragment.slice(0, -1).trimEnd();
    if (baseInput.length > 0 && parseRelativeConnectWithoutAdjective(baseInput) !== null) {
      return suggestionResolution(createCreateWhichIsSuggestions(fragment.prefix));
    }
  }

  if (trimmedCurrentInput.length > 0 && parseRelativeConnectWithoutAdjective(trimmedCurrentInput) !== null) {
    return suggestionResolution(createCreateWhichIsSuggestions(fragment.prefix));
  }

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

  if (lastToken === 'is' && isSelectedRoomRelativeDirectionLead(tokens)) {
    const roomResolution = getRoomReferenceResolution(
      input,
      fragment,
      doc,
      Math.max(relativeConnectIsIndex + 1, 2),
      roomSlotSuggestionHelpers,
    );
    return {
      ...roomResolution,
      suggestions: mergeSuggestions(
        mergeSuggestions(createPlaceholderSuggestion('<room>'), roomResolution.suggestions),
        createKeywordSuggestions(fragment.prefix, ['unknown']),
      ),
    };
  }

  if (
    relativeConnectIsIndex >= 1
    && fragment.tokenIndex >= relativeConnectIsIndex + 1
    && isSelectedRoomRelativeDirectionLead(tokens)
  ) {
    const roomResolution = getRoomReferenceResolution(
      input,
      fragment,
      doc,
      relativeConnectIsIndex + 1,
      roomSlotSuggestionHelpers,
    );
    return {
      ...roomResolution,
      suggestions: mergeSuggestions(
        mergeSuggestions(createPlaceholderSuggestion('<room>'), roomResolution.suggestions),
        createKeywordSuggestions(fragment.prefix, ['unknown']),
      ),
    };
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

  if (fragment.tokenIndex === 1 && isSelectedRoomRelativeDirectionLead(tokens)) {
    if (!shouldOfferSelectedRoomRelativeIs(fragment.prefix)) {
      return null;
    }
    return suggestionResolution(createKeywordSuggestions(fragment.prefix, ['is']));
  }

  if (fragment.tokenIndex >= 1) {
    return suggestionResolution(createKeywordSuggestions(fragment.prefix, ['is', 'to']));
  }

  return null;
}
