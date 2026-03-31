import { createDirectionSuggestions, createHelpTopicSuggestions, createKeywordSuggestions, createPlaceholderSuggestion } from './cli-suggestion-options';
import {
  getConnectedRoomReferenceResolution,
  getRoomReferenceResolution,
  getRoomReferenceResolutionWithFallback,
  type RoomSlotSuggestionHelpers,
} from './cli-suggestion-room-slots';
import { mergeSuggestions, suggestionResolution } from './cli-suggestion-grammar-helpers';
import type { CliSuggestionNextSymbol } from './cli-suggestion-parser';
import type { ActiveFragment, CliSuggestion, SuggestionResolution } from './cli-suggestion-types';
import type { MapDocument } from './map-types';

export interface CliSuggestionAssemblyContext {
  readonly input: string;
  readonly fragment: ActiveFragment;
  readonly doc: MapDocument | null;
  readonly nextSymbols: readonly CliSuggestionNextSymbol[];
  readonly rawNextSymbols: readonly CliSuggestionNextSymbol[];
}

export type CliSuggestionSlotResolver = (context: CliSuggestionAssemblyContext) => SuggestionResolution | null;

export const roomSlotSuggestionHelpers: RoomSlotSuggestionHelpers = {
  createPlaceholderSuggestion,
  mergeSuggestions,
} as const;

function createCaretKeywordSuggestions(
  fragment: ActiveFragment,
  values: readonly string[],
): readonly CliSuggestion[] {
  return createKeywordSuggestions(fragment.prefix, values).map((suggestion) => ({
    ...suggestion,
    replaceStart: fragment.caret,
    replaceEnd: fragment.caret,
  }));
}

function normalizeItemReferenceText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function tokenizeItemReferenceWords(value: string): readonly string[] {
  return normalizeItemReferenceText(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function itemMatchesReferencePrefix(itemName: string, typedItemText: string, exact: boolean): boolean {
  if (exact) {
    return normalizeItemReferenceText(itemName).startsWith(normalizeItemReferenceText(typedItemText));
  }

  const typedWords = tokenizeItemReferenceWords(typedItemText);
  if (typedWords.length === 0) {
    return false;
  }

  const itemWords = tokenizeItemReferenceWords(itemName);
  return typedWords.every((typedWord) => itemWords.some((itemWord) => itemWord.startsWith(typedWord)));
}

function normalizeRoomReferenceText(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function tokenizeRoomReferenceWords(value: string): readonly string[] {
  return normalizeRoomReferenceText(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function roomMatchesReferencePrefix(roomName: string, typedRoomText: string, exact: boolean): boolean {
  if (exact) {
    return normalizeRoomReferenceText(roomName).startsWith(normalizeRoomReferenceText(typedRoomText));
  }

  const typedWords = tokenizeRoomReferenceWords(typedRoomText);
  if (typedWords.length === 0) {
    return false;
  }

  const roomWords = tokenizeRoomReferenceWords(roomName);
  return typedWords.every((typedWord) => roomWords.some((roomWord) => roomWord.startsWith(typedWord)));
}

function quoteCliSuggestionValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function createItemSuggestion(itemId: string, itemName: string, quoted = false): CliSuggestion {
  return {
    id: `cli-suggestion-item-${itemId}`,
    kind: 'command',
    label: itemName,
    insertText: quoted ? quoteCliSuggestionValue(itemName) : itemName,
    detail: 'Item',
  };
}

function getSlotTextInfo(input: string, fragment: ActiveFragment, slotStart: number): {
  readonly text: string;
  readonly exact: boolean;
  readonly quoteClosed: boolean;
} {
  const rawText = input.slice(slotStart, fragment.caret);
  if (!rawText.startsWith('"')) {
    return {
      text: rawText,
      exact: false,
      quoteClosed: true,
    };
  }

  let text = '';
  let index = 1;
  while (index < rawText.length) {
    const current = rawText[index];
    if (current === '\\') {
      const next = rawText[index + 1];
      if (next === '"' || next === '\\') {
        text += next;
        index += 2;
        continue;
      }

      return {
        text,
        exact: true,
        quoteClosed: false,
      };
    }

    if (current === '"') {
      return {
        text,
        exact: true,
        quoteClosed: true,
      };
    }

    text += current;
    index += 1;
  }

  return {
    text,
    exact: true,
    quoteClosed: false,
  };
}

function getExistingItemSuggestions(doc: MapDocument | null, prefix: string): readonly CliSuggestion[] {
  if (!doc) {
    return [];
  }

  const normalizedPrefix = prefix.toLowerCase();
  return Object.values(doc.items)
    .filter((item) => item.name.toLowerCase().split(/\s+/).some((part) => part.startsWith(normalizedPrefix)))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((item) => createItemSuggestion(item.id, item.name));
}

function getItemReferenceResolution(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
  slotStartTokenIndex: number,
): SuggestionResolution {
  const slotStart = fragment.precedingTokens[slotStartTokenIndex]?.start ?? fragment.start;
  const itemSlotText = getSlotTextInfo(input, fragment, slotStart);
  const normalizedTypedItemText = normalizeItemReferenceText(itemSlotText.text);

  if (normalizedTypedItemText.length === 0) {
    return {
      suggestions: getExistingItemSuggestions(doc, ''),
      replaceStart: slotStart,
      replaceEnd: fragment.end,
      prefix: '',
    };
  }

  if (!doc) {
    return {
      suggestions: [],
      replaceStart: slotStart,
      replaceEnd: fragment.end,
      prefix: normalizedTypedItemText,
    };
  }

  const matchingItems = Object.values(doc.items)
    .filter((item) => itemMatchesReferencePrefix(item.name, itemSlotText.text, itemSlotText.exact))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((item) => createItemSuggestion(item.id, item.name, itemSlotText.exact));

  if (fragment.prefix.length === 0 && itemSlotText.quoteClosed) {
    const hasLongerMatch = matchingItems.some(
      (suggestion) => normalizeItemReferenceText(suggestion.label) !== normalizedTypedItemText,
    );
    if (!hasLongerMatch) {
      return {
        suggestions: [],
        replaceStart: slotStart,
        replaceEnd: fragment.end,
        prefix: normalizedTypedItemText,
      };
    }
  }

  return {
    suggestions: matchingItems,
    replaceStart: slotStart,
    replaceEnd: fragment.end,
    prefix: normalizedTypedItemText,
  };
}

function hasCompletedItemReferenceBeforeFragment(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
  slotStartTokenIndex: number,
): boolean {
  if (doc === null) {
    return false;
  }

  const slotStart = fragment.precedingTokens[slotStartTokenIndex]?.start ?? fragment.start;
  const itemSlotText = getSlotTextInfo(input, { ...fragment, caret: fragment.start }, slotStart);
  const normalizedTypedItemText = normalizeItemReferenceText(itemSlotText.text);
  if (normalizedTypedItemText.length === 0) {
    return false;
  }

  return Object.values(doc.items).some(
    (item) => normalizeItemReferenceText(item.name) === normalizedTypedItemText,
  );
}

function getRoomsContainingMatchingItems(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
  itemSlotStartTokenIndex: number,
  keywordTokenIndex: number,
) {
  if (doc === null) {
    return [];
  }

  const slotStart = fragment.precedingTokens[itemSlotStartTokenIndex]?.start ?? fragment.start;
  const slotCaret = fragment.precedingTokens[keywordTokenIndex]?.start ?? fragment.start;
  const itemSlotText = getSlotTextInfo(input, { ...fragment, caret: slotCaret }, slotStart);

  return Object.values(doc.items)
    .filter((item) => itemMatchesReferencePrefix(item.name, itemSlotText.text, itemSlotText.exact))
    .map((item) => doc.rooms[item.roomId] ?? null)
    .filter((room, index, rooms): room is NonNullable<typeof room> => (
      room !== null
      && rooms.findIndex((candidate) => candidate?.id === room.id) === index
    ))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function getScopedRoomReferenceResolution(
  input: string,
  fragment: ActiveFragment,
  rooms: readonly NonNullable<MapDocument['rooms'][string]>[],
  slotStartTokenIndex: number,
): SuggestionResolution {
  const slotStart = fragment.precedingTokens[slotStartTokenIndex]?.start ?? fragment.start;
  const roomSlotText = getSlotTextInfo(input, fragment, slotStart);
  const normalizedTypedRoomText = normalizeRoomReferenceText(roomSlotText.text);

  if (normalizedTypedRoomText.length === 0) {
    return {
      suggestions: rooms.map((room) => ({
        id: `cli-suggestion-room-${room.id}`,
        kind: 'room' as const,
        label: room.name,
        insertText: roomSlotText.exact ? quoteCliSuggestionValue(room.name) : room.name,
        detail: 'Room',
      })),
      replaceStart: slotStart,
      replaceEnd: fragment.end,
      prefix: '',
    };
  }

  const matchingRooms = rooms
    .filter((room) => roomMatchesReferencePrefix(room.name, roomSlotText.text, roomSlotText.exact))
    .map((room) => ({
      id: `cli-suggestion-room-${room.id}`,
      kind: 'room' as const,
      label: room.name,
      insertText: roomSlotText.exact ? quoteCliSuggestionValue(room.name) : room.name,
      detail: 'Room',
    }));

  if (fragment.prefix.length === 0 && roomSlotText.quoteClosed) {
    const hasLongerMatch = matchingRooms.some(
      (suggestion) => normalizeRoomReferenceText(suggestion.label) !== normalizedTypedRoomText,
    );
    if (!hasLongerMatch) {
      return {
        suggestions: [],
        replaceStart: slotStart,
        replaceEnd: fragment.end,
        prefix: normalizedTypedRoomText,
      };
    }
  }

  return {
    suggestions: matchingRooms,
    replaceStart: slotStart,
    replaceEnd: fragment.end,
    prefix: normalizedTypedRoomText,
  };
}

function collectSourceStateIds(entries: readonly CliSuggestionNextSymbol[], slotType?: string): readonly string[] {
  const stateIds = new Set<string>();
  for (const entry of entries) {
    if (slotType !== undefined && (entry.symbol.kind !== 'slot' || entry.symbol.slotType !== slotType)) {
      continue;
    }
    for (const stateId of entry.sourceStateIds) {
      stateIds.add(stateId);
    }
  }
  return [...stateIds];
}

function hasKeyword(entries: readonly CliSuggestionNextSymbol[], value: string, states?: readonly string[]): boolean {
  return entries.some((entry) => (
    entry.symbol.kind === 'keyword'
    && entry.symbol.text === value
    && (states === undefined || states.some((state) => entry.sourceStateIds.includes(state)))
  ));
}

function hasPhrase(entries: readonly CliSuggestionNextSymbol[], value: string, states?: readonly string[]): boolean {
  return entries.some((entry) => (
    entry.symbol.kind === 'phrase'
    && entry.symbol.text === value
    && (states === undefined || states.some((state) => entry.sourceStateIds.includes(state)))
  ));
}

const roomRefSlotResolver: CliSuggestionSlotResolver = ({ input, fragment, doc, nextSymbols, rawNextSymbols }) => {
  const roomSlotStateIds = collectSourceStateIds(nextSymbols, 'ROOM_REF');
  if (roomSlotStateIds.length === 0) {
    return null;
  }

  if (roomSlotStateIds.some((stateId) => ['SHOW', 'EDIT', 'DELETE', 'DESCRIBE', 'GO_TO', 'DISCONNECT_FROM', 'DISCONNECT_FROM_AFTER_DIRECTION'].includes(stateId))) {
    return getRoomReferenceResolution(input, fragment, doc, 1 + Number(roomSlotStateIds.includes('GO_TO') || roomSlotStateIds.includes('DISCONNECT_FROM') || roomSlotStateIds.includes('DISCONNECT_FROM_AFTER_DIRECTION')), roomSlotSuggestionHelpers);
  }

  if (roomSlotStateIds.some((stateId) => ['NOTATE', 'ANNOTATE'].includes(stateId))) {
    const slotStartTokenIndex = 1;
    if (fragment.prefix.length === 0 && fragment.tokenIndex === slotStartTokenIndex) {
      return suggestionResolution(
        roomSlotSuggestionHelpers.mergeSuggestions(
          roomSlotSuggestionHelpers.createPlaceholderSuggestion('<room>'),
          createKeywordSuggestions(fragment.prefix, ['with']),
        ),
      );
    }

    return getRoomReferenceResolutionWithFallback(
      input,
      fragment,
      doc,
      slotStartTokenIndex,
      createKeywordSuggestions(fragment.prefix, ['with']),
      roomSlotSuggestionHelpers,
    );
  }

  if (roomSlotStateIds.some((stateId) => ['PUT_IN', 'TAKE_ALL_FROM', 'GET_ALL_FROM'].includes(stateId))) {
    const keywordIndex = fragment.precedingTokens.findIndex((token) => (
      token.value.toLowerCase() === 'in' || token.value.toLowerCase() === 'from'
    ));
    return getRoomReferenceResolution(input, fragment, doc, keywordIndex + 1, roomSlotSuggestionHelpers);
  }

  if (roomSlotStateIds.some((stateId) => ['TAKE_FROM', 'GET_FROM'].includes(stateId))) {
    const fromIndex = fragment.precedingTokens.findIndex((token) => token.value.toLowerCase() === 'from');
    const matchingItemRooms = getRoomsContainingMatchingItems(input, fragment, doc, 1, fromIndex);
    if (matchingItemRooms.length === 0) {
      return suggestionResolution([]);
    }
    return getScopedRoomReferenceResolution(input, fragment, matchingItemRooms, fromIndex + 1);
  }

  if (roomSlotStateIds.some((stateId) => ['CONNECT_TO', 'CONNECT_ONE_WAY_TO', 'CREATE_AND_CONNECT_TO', 'CREATE_AND_CONNECT_ONE_WAY_TO'].includes(stateId))) {
    const toIndex = fragment.precedingTokens.findIndex((token) => token.value.toLowerCase() === 'to');
    const fallbackSuggestions = (
      roomSlotStateIds.includes('CONNECT_TO') || roomSlotStateIds.includes('CREATE_AND_CONNECT_TO')
    )
      ? createDirectionSuggestions(fragment.prefix)
      : [];
    return getRoomReferenceResolutionWithFallback(
      input,
      fragment,
      doc,
      toIndex + 1,
      fallbackSuggestions,
      roomSlotSuggestionHelpers,
    );
  }

  if (roomSlotStateIds.some((stateId) => ['CREATE_VERTICAL', 'CREATE_DIRECTION_OF'].includes(stateId))) {
    const slotStartTokenIndex = fragment.precedingTokens.findIndex((token) => (
      token.value.toLowerCase() === 'above'
      || token.value.toLowerCase() === 'below'
      || token.value.toLowerCase() === 'of'
    )) + 1;
    return getRoomReferenceResolution(input, fragment, doc, slotStartTokenIndex, roomSlotSuggestionHelpers);
  }

  const pseudoSlotStateIds = roomSlotStateIds.filter((stateId) => (
    stateId === 'DIRECTION_OF'
    || stateId === 'ABOVE_LEAD'
    || stateId === 'BELOW_LEAD'
    || stateId === 'THE_ROOM_OF'
    || stateId === 'THE_ROOM_VERTICAL'
    || stateId === 'THE_WAY_OF'
    || stateId === 'THE_WAY_VERTICAL'
  ));
  if (pseudoSlotStateIds.length > 0) {
    const roomSlotStartTokenIndex = fragment.precedingTokens.findIndex((token) => token.value.toLowerCase() === 'of') + 1
      || (pseudoSlotStateIds.some((stateId) => stateId.startsWith('THE_')) ? 3 : 1);
    const fallback = pseudoSlotStateIds.some((stateId) => stateId.startsWith('THE_ROOM'))
      ? createKeywordSuggestions(fragment.prefix, ['is unknown'])
      : pseudoSlotStateIds.some((stateId) => stateId.startsWith('THE_WAY'))
        ? createKeywordSuggestions(fragment.prefix, ['goes on forever', 'leads nowhere', 'leads to somewhere else', 'lies death'])
        : createKeywordSuggestions(fragment.prefix, ['is unknown', 'goes on forever', 'leads nowhere', 'leads to somewhere else', 'lies death']);

    if (fragment.prefix.length > 0) {
      return getRoomReferenceResolution(input, fragment, doc, roomSlotStartTokenIndex, roomSlotSuggestionHelpers);
    }

    return getRoomReferenceResolutionWithFallback(
      input,
      fragment,
      doc,
      roomSlotStartTokenIndex,
      fallback,
      roomSlotSuggestionHelpers,
    );
  }

  if (roomSlotStateIds.includes('ROOM_LEAD')) {
    return getRoomReferenceResolutionWithFallback(
      input,
      fragment,
      doc,
      0,
      createKeywordSuggestions(fragment.prefix, ['is', 'to']),
      roomSlotSuggestionHelpers,
    );
  }

  return null;
};

const connectedRoomRefSlotResolver: CliSuggestionSlotResolver = ({ input, fragment, doc, nextSymbols }) => {
  const stateIds = collectSourceStateIds(nextSymbols, 'CONNECTED_ROOM_REF');
  if (stateIds.length === 0) {
    return null;
  }

  return getConnectedRoomReferenceResolution(
    input,
    fragment,
    doc,
    2,
    fragment.precedingTokens[0]?.value ?? '',
    createKeywordSuggestions(fragment.prefix, ['is']),
    roomSlotSuggestionHelpers,
  );
};

const helpTopicSlotResolver: CliSuggestionSlotResolver = ({ fragment, nextSymbols }) => {
  if (!nextSymbols.some((entry) => entry.symbol.kind === 'slot' && entry.symbol.slotType === 'HELP_TOPIC')) {
    return null;
  }

  return suggestionResolution(createHelpTopicSuggestions(fragment.prefix));
};

const directionSlotResolver: CliSuggestionSlotResolver = ({ fragment, nextSymbols, rawNextSymbols }) => {
  const stateIds = collectSourceStateIds(nextSymbols, 'DIRECTION');
  if (stateIds.length === 0) {
    return null;
  }

  if (stateIds.some((stateId) => ['GO', 'CONNECT_SOURCE', 'CONNECT_TARGET_DONE', 'CREATE_AND_CONNECT_TARGET_DONE', 'CREATE_NEW_ROOM', 'CREATE_AND_CONNECT_NEW_ROOM', 'CREATE_AFTER_ADJECTIVE_COMMA', 'CREATE_AND_CONNECT_AFTER_ADJECTIVE_COMMA', 'THE_ROOM', 'THE_WAY'].includes(stateId))) {
    const suggestions = [
      ...createDirectionSuggestions(fragment.prefix),
      ...((stateIds.includes('THE_ROOM') || stateIds.includes('THE_WAY'))
        ? createKeywordSuggestions(fragment.prefix, ['above', 'below'])
        : []),
    ];
    return suggestionResolution(suggestions);
  }

  if (hasKeyword(rawNextSymbols, 'of', ['DIRECTION_LEAD', 'THE_ROOM_DIRECTION', 'THE_WAY_DIRECTION', 'CREATE_DIRECTION'])) {
    return suggestionResolution(createKeywordSuggestions(fragment.prefix, ['of']));
  }

  return null;
};

const newRoomNameSlotResolver: CliSuggestionSlotResolver = ({ fragment, nextSymbols, rawNextSymbols }) => {
  const stateIds = collectSourceStateIds(nextSymbols, 'NEW_ROOM_NAME');
  if (stateIds.length === 0) {
    return null;
  }

  const hasCreateAnd = hasKeyword(rawNextSymbols, 'and', ['CREATE']);
  if (hasCreateAnd && fragment.tokenIndex === 1) {
    return suggestionResolution([
      ...createPlaceholderSuggestion('<new room name>'),
      ...createKeywordSuggestions(fragment.prefix, ['and']),
    ]);
  }

  return suggestionResolution(createPlaceholderSuggestion('<new room name>'));
};

const itemSlotResolver: CliSuggestionSlotResolver = ({ input, fragment, doc, nextSymbols }) => {
  const stateIds = collectSourceStateIds(nextSymbols, 'ITEM');
  if (stateIds.length === 0) {
    return null;
  }

  const itemResolution = getItemReferenceResolution(input, fragment, doc, 1);
  if (fragment.tokenIndex === 1) {
    return {
      ...itemResolution,
      suggestions: mergeSuggestions(itemResolution.suggestions, createKeywordSuggestions(fragment.prefix, ['all'])),
    };
  }

  const shouldSuggestFrom = fragment.tokenIndex > 1 && hasCompletedItemReferenceBeforeFragment(input, fragment, doc, 1);
  return {
    ...itemResolution,
    suggestions: shouldSuggestFrom
      ? mergeSuggestions(itemResolution.suggestions, createCaretKeywordSuggestions(fragment, ['from']))
      : itemResolution.suggestions,
  };
};

const itemListSlotResolver: CliSuggestionSlotResolver = ({ input, fragment, doc, nextSymbols }) => {
  const stateIds = collectSourceStateIds(nextSymbols, 'ITEM_LIST');
  if (stateIds.length === 0) {
    return null;
  }

  const placeholderSuggestions = createPlaceholderSuggestion('<item name>');
  if (fragment.tokenIndex <= 1) {
    return suggestionResolution(placeholderSuggestions);
  }

  return suggestionResolution(
    mergeSuggestions(placeholderSuggestions, createCaretKeywordSuggestions(fragment, ['in'])),
  );
};

export const cliSuggestionSlotResolvers = {
  HELP_TOPIC: helpTopicSlotResolver,
  DIRECTION: directionSlotResolver,
  ROOM_REF: roomRefSlotResolver,
  CONNECTED_ROOM_REF: connectedRoomRefSlotResolver,
  NEW_ROOM_NAME: newRoomNameSlotResolver,
  ITEM: itemSlotResolver,
  ITEM_LIST: itemListSlotResolver,
} as const;
