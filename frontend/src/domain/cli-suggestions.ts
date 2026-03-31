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

function getItemSlotTextInfo(input: string, fragment: ActiveFragment, slotStart: number): {
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
  const itemSlotText = getItemSlotTextInfo(input, fragment, slotStart);
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
  const itemSlotText = getItemSlotTextInfo(input, { ...fragment, caret: fragment.start }, slotStart);
  const normalizedTypedItemText = normalizeItemReferenceText(itemSlotText.text);
  if (normalizedTypedItemText.length === 0) {
    return false;
  }

  return Object.values(doc.items).some(
    (item) => normalizeItemReferenceText(item.name) === normalizedTypedItemText,
  );
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
  const itemSlotText = getItemSlotTextInfo(input, { ...fragment, caret: slotCaret }, slotStart);

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
  const roomSlotText = getItemSlotTextInfo(input, fragment, slotStart);
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
      ...createKeywordSuggestions(prefix, ['above', 'below']),
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

  if (tokens[0] === 'zoom' && fragment.tokenIndex === 1) {
    const shouldSuggestZoomNumberPlaceholder = fragment.prefix.length === 0
      || /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)%?$/.test(fragment.prefix);
    return suggestionResolution([
      ...(shouldSuggestZoomNumberPlaceholder ? createPlaceholderSuggestion('<number>') : []),
      ...createKeywordSuggestions(prefix, ['in', 'out', 'reset']),
    ]);
  }

  if (tokens[0] === 'zoom') {
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
    && canonicalLastDirection === null
    && tokens[0] !== 'above'
    && tokens[0] !== 'below'
    && !isPseudoRoomLead(tokens)
    && tokens[0] !== 'go'
    && tokens[0] !== 'show'
    && tokens[0] !== 'select'
    && tokens[0] !== 'delete'
    && tokens[0] !== 'd'
    && tokens[0] !== 'del'
    && tokens[0] !== 'edit'
    && tokens[0] !== 'ed'
    && tokens[0] !== 'notate'
    && tokens[0] !== 'annotate'
    && tokens[0] !== 'ann'
    && tokens[0] !== 'put'
    && tokens[0] !== 'drop'
    && tokens[0] !== 'take'
    && tokens[0] !== 'get'
    && tokens[0] !== 'connect'
    && tokens[0] !== 'disconnect'
    && tokens[0] !== 'con'
    && tokens[0] !== 'create'
    && tokens[0] !== 'describe'
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
    && (
      !isPseudoRoomLead(tokens)
      || (
        (getCanonicalDirectionToken(tokens[0] ?? null) !== null || tokens[0] === 'above' || tokens[0] === 'below')
        && (fragment.tokenIndex === 1 || tokens[1] === 'is')
      )
    )
    && tokens[0] !== 'go'
    && tokens[0] !== 'show'
    && tokens[0] !== 'select'
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
    && tokens[0] !== 'drop'
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
    && tokens[0] !== 'describe'
    && tokens[0] !== 'help'
    && tokens[0] !== 'h'
    && tokens[0] !== 'undo'
    && tokens[0] !== 'redo'
  ) {
    const roomLeadResolution = getRoomLeadResolution(input, fragment, doc, tokens, lastToken, roomSlotSuggestionHelpers);
    if (roomLeadResolution !== null) {
      const pseudoRoomResolution = getPseudoRoomResolution(input, fragment, doc, tokens, roomSlotSuggestionHelpers);
      if (pseudoRoomResolution !== null) {
        return {
          ...roomLeadResolution,
          suggestions: mergeSuggestions(roomLeadResolution.suggestions, pseudoRoomResolution.suggestions),
        };
      }

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

  if (tokens[0] === 'show' || tokens[0] === 'select' || tokens[0] === 's') {
    if (tokens[0] === 'select') {
      return getRoomReferenceResolution(input, fragment, doc, 1, roomSlotSuggestionHelpers);
    }

    return getParserBackedSingleRoomCommandResolution(input, fragment, doc, 1, roomSlotSuggestionHelpers);
  }

  if (tokens[0] === 'describe') {
    return getParserBackedSingleRoomCommandResolution(input, fragment, doc, 1, roomSlotSuggestionHelpers);
  }

  if (tokens[0] === 'delete' || tokens[0] === 'd' || tokens[0] === 'del' || tokens[0] === 'edit' || tokens[0] === 'ed') {
    return getParserBackedSingleRoomCommandResolution(input, fragment, doc, 1, roomSlotSuggestionHelpers);
  }

  if (tokens[0] === 'notate' || tokens[0] === 'annotate' || tokens[0] === 'ann') {
    return getParserBackedNotateResolution(input, fragment, doc, roomSlotSuggestionHelpers);
  }

  if (tokens[0] === 'put' || tokens[0] === 'drop') {
    if (tokens.includes('in')) {
      const inIndex = tokens.indexOf('in');
      if (fragment.tokenIndex > inIndex) {
        return getParserBackedRoomSlotAfterKeywordResolution(input, fragment, doc, inIndex + 1, roomSlotSuggestionHelpers);
      }
      return suggestionResolution([]);
    }

    const placeholderSuggestions = createPlaceholderSuggestion('<item name>');
    return suggestionResolution(
      fragment.tokenIndex > 1
        ? mergeSuggestions(placeholderSuggestions, createCaretKeywordSuggestions(fragment, ['in']))
        : placeholderSuggestions,
    );
  }

  if (tokens[0] === 'take' || tokens[0] === 'get') {
    if (tokens[1] === 'all' && fragment.tokenIndex === 2) {
      return suggestionResolution(createKeywordSuggestions(prefix, ['from']));
    }

    if (tokens.includes('from')) {
      const fromIndex = tokens.indexOf('from');
      if (fragment.tokenIndex > fromIndex) {
        if (tokens[1] === 'all') {
          return getParserBackedRoomSlotAfterKeywordResolution(input, fragment, doc, fromIndex + 1, roomSlotSuggestionHelpers);
        }
        const matchingItemRooms = getRoomsContainingMatchingItems(input, fragment, doc, 1, fromIndex);
        if (matchingItemRooms.length === 0) {
          return suggestionResolution([]);
        }
        return getScopedRoomReferenceResolution(input, fragment, matchingItemRooms, fromIndex + 1);
      }
      return suggestionResolution([]);
    }

    const itemResolution = getItemReferenceResolution(input, fragment, doc, 1);
    if (fragment.tokenIndex === 1) {
      return {
        ...itemResolution,
        suggestions: mergeSuggestions(itemResolution.suggestions, createKeywordSuggestions(prefix, ['all'])),
      };
    }

    const shouldSuggestFrom = (
      fragment.tokenIndex > 1
      && hasCompletedItemReferenceBeforeFragment(input, fragment, doc, 1)
    );

    return {
      ...itemResolution,
      suggestions: shouldSuggestFrom
        ? mergeSuggestions(itemResolution.suggestions, createCaretKeywordSuggestions(fragment, ['from']))
        : itemResolution.suggestions,
    };
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

  if (
    lastToken === 'unknown'
    || lastToken === 'forever'
    || lastToken === 'nowhere'
    || lastToken === 'death'
    || (lastToken === 'else' && tokens.includes('leads') && tokens.includes('somewhere'))
  ) {
    return suggestionResolution([]);
  }

  if (lastToken === 'dark' || lastToken === 'lit') {
    return suggestionResolution([]);
  }

  if (lastToken === 'lies') {
    return suggestionResolution(createKeywordSuggestions(prefix, ['death']));
  }

  if (lastToken === 'leads') {
    return suggestionResolution(createKeywordSuggestions(prefix, ['nowhere', 'to somewhere else']));
  }

  if (lastToken === 'to' && tokens.includes('leads')) {
    return suggestionResolution(createKeywordSuggestions(prefix, ['somewhere else']));
  }

  if (lastToken === 'somewhere' && tokens.includes('leads')) {
    return suggestionResolution(createKeywordSuggestions(prefix, ['else']));
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
