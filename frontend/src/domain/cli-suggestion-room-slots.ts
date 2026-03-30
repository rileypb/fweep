import { findRoomsByCliName } from './cli-execution';
import type { MapDocument, Room } from './map-types';
import type { ActiveFragment, CliSuggestion, SuggestionResolution } from './cli-suggestion-types';

export interface RoomSlotSuggestionHelpers {
  readonly createPlaceholderSuggestion: (label: string) => readonly CliSuggestion[];
  readonly mergeSuggestions: (
    primary: readonly CliSuggestion[],
    secondary: readonly CliSuggestion[],
  ) => readonly CliSuggestion[];
}

export function normalizeRoomReferenceText(value: string): string {
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

function createRoomSuggestion(room: Room, quoted = false): CliSuggestion {
  return {
    id: `cli-suggestion-room-${room.id}`,
    kind: 'room',
    label: room.name,
    insertText: quoted ? quoteCliSuggestionValue(room.name) : room.name,
    detail: 'Room',
  };
}

export function createRoomSuggestions(doc: MapDocument | null, prefix: string): readonly CliSuggestion[] {
  if (!doc) {
    return [];
  }

  const normalizedPrefix = prefix.toLowerCase();
  return Object.values(doc.rooms)
    .filter((room) => room.name.toLowerCase().split(/\s+/).some((part) => part.startsWith(normalizedPrefix)))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((room) => createRoomSuggestion(room));
}

function createRoomSuggestionsFromRooms(rooms: readonly Room[], quoted = false): readonly CliSuggestion[] {
  return rooms
    .slice()
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((room) => createRoomSuggestion(room, quoted));
}

interface RoomSlotTextInfo {
  readonly text: string;
  readonly exact: boolean;
  readonly quoteClosed: boolean;
}

function getRoomSlotTextInfo(input: string, fragment: ActiveFragment, slotStart: number): RoomSlotTextInfo {
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

function getConnectedRooms(doc: MapDocument, sourceRoom: Room): readonly Room[] {
  const connectedRoomIds = new Set<string>();
  for (const connection of Object.values(doc.connections)) {
    if (connection.sourceRoomId === sourceRoom.id && connection.target.kind === 'room') {
      connectedRoomIds.add(connection.target.id);
    }
    if (connection.target.kind === 'room' && connection.target.id === sourceRoom.id) {
      connectedRoomIds.add(connection.sourceRoomId);
    }
  }

  return [...connectedRoomIds]
    .map((roomId) => doc.rooms[roomId] ?? null)
    .filter((room): room is Room => room !== null);
}

export function hasCompletedRoomReferenceBeforeFragment(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
  slotStartTokenIndex: number,
): boolean {
  if (doc === null) {
    return false;
  }

  const slotStart = fragment.precedingTokens[slotStartTokenIndex]?.start ?? fragment.start;
  const roomSlotText = getRoomSlotTextInfo(input, { ...fragment, caret: fragment.start }, slotStart);
  const normalizedTypedRoomText = normalizeRoomReferenceText(roomSlotText.text);
  if (normalizedTypedRoomText.length === 0) {
    return false;
  }

  return Object.values(doc.rooms).some(
    (room) => normalizeRoomReferenceText(room.name) === normalizedTypedRoomText,
  );
}

export function getRoomReferenceResolution(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
  slotStartTokenIndex: number,
  helpers: RoomSlotSuggestionHelpers,
): SuggestionResolution {
  const slotStart = fragment.precedingTokens[slotStartTokenIndex]?.start ?? fragment.start;
  const roomSlotText = getRoomSlotTextInfo(input, fragment, slotStart);
  const normalizedTypedRoomText = normalizeRoomReferenceText(roomSlotText.text);

  if (normalizedTypedRoomText.length === 0) {
    return {
      suggestions: helpers.createPlaceholderSuggestion('<room>'),
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
      prefix: normalizedTypedRoomText,
    };
  }

  const matchingRooms = Object.values(doc.rooms)
    .filter((room) => roomMatchesReferencePrefix(room.name, roomSlotText.text, roomSlotText.exact))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((room) => createRoomSuggestion(room, roomSlotText.exact));

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

export function getRoomReferenceResolutionWithFallback(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
  slotStartTokenIndex: number,
  fallbackSuggestions: readonly CliSuggestion[],
  helpers: RoomSlotSuggestionHelpers,
): SuggestionResolution {
  const roomResolution = getRoomReferenceResolution(input, fragment, doc, slotStartTokenIndex, helpers);
  const slotStart = fragment.precedingTokens[slotStartTokenIndex]?.start ?? fragment.start;
  const roomSlotText = getRoomSlotTextInfo(input, fragment, slotStart);
  const hasTypedRoomText = normalizeRoomReferenceText(roomSlotText.text).length > 0;
  const shouldOfferFallback = hasTypedRoomText && fragment.prefix.length === 0 && roomSlotText.quoteClosed;

  if (
    !shouldOfferFallback
    && roomSlotText.quoteClosed
    && hasCompletedRoomReferenceBeforeFragment(input, fragment, doc, slotStartTokenIndex)
  ) {
    return {
      suggestions: fallbackSuggestions,
      replaceStart: fragment.start,
      replaceEnd: fragment.end,
      prefix: fragment.prefix,
    };
  }

  if (!shouldOfferFallback) {
    return roomResolution;
  }

  if (roomResolution.suggestions.length === 0) {
    return {
      suggestions: fallbackSuggestions.map((suggestion) => ({
        ...suggestion,
        replaceStart: fragment.start,
        replaceEnd: fragment.end,
      })),
      replaceStart: fragment.start,
      replaceEnd: fragment.end,
      prefix: fragment.prefix,
    };
  }

  return {
    suggestions: helpers.mergeSuggestions(
      roomResolution.suggestions,
      fallbackSuggestions.map((suggestion) => ({
        ...suggestion,
        replaceStart: fragment.start,
        replaceEnd: fragment.end,
      })),
    ),
    replaceStart: roomResolution.replaceStart,
    replaceEnd: roomResolution.replaceEnd,
    prefix: roomResolution.prefix,
  };
}

export function getLeadingRoomReferenceResolution(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
  fallbackSuggestions: readonly CliSuggestion[],
  helpers: RoomSlotSuggestionHelpers,
): SuggestionResolution {
  const syntheticFragment: ActiveFragment = {
    ...fragment,
    precedingTokens: [{ value: '', start: 0, end: 0 }],
  };

  const roomResolution = getRoomReferenceResolution(input, syntheticFragment, doc, 0, helpers);
  if (roomResolution.suggestions.length > 0) {
    if (fragment.prefix.length === 0) {
      return {
        suggestions: helpers.mergeSuggestions(roomResolution.suggestions, fallbackSuggestions),
        replaceStart: roomResolution.replaceStart,
        replaceEnd: roomResolution.replaceEnd,
        prefix: roomResolution.prefix,
      };
    }

    return roomResolution;
  }

  return {
    suggestions: fallbackSuggestions,
    replaceStart: fragment.start,
    replaceEnd: fragment.end,
    prefix: fragment.prefix,
  };
}

export function getConnectedRoomReferenceResolution(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
  slotStartTokenIndex: number,
  sourceRoomText: string,
  fallbackSuggestions: readonly CliSuggestion[],
  helpers: RoomSlotSuggestionHelpers,
): SuggestionResolution {
  if (doc === null) {
    return getRoomReferenceResolution(input, fragment, doc, slotStartTokenIndex, helpers);
  }

  const sourceRooms = findRoomsByCliName(doc, sourceRoomText);
  if (sourceRooms.length !== 1) {
    return getRoomReferenceResolutionWithFallback(
      input,
      fragment,
      doc,
      slotStartTokenIndex,
      fallbackSuggestions,
      helpers,
    );
  }

  const connectedRooms = getConnectedRooms(doc, sourceRooms[0]);
  if (connectedRooms.length === 0) {
    return {
      suggestions: helpers.createPlaceholderSuggestion(`<no rooms connected to ${sourceRooms[0].name}>`),
      replaceStart: fragment.precedingTokens[slotStartTokenIndex]?.start ?? fragment.start,
      replaceEnd: fragment.end,
      prefix: fragment.prefix,
    };
  }

  const slotStart = fragment.precedingTokens[slotStartTokenIndex]?.start ?? fragment.start;
  const roomSlotText = getRoomSlotTextInfo(input, fragment, slotStart);
  const normalizedTypedRoomText = normalizeRoomReferenceText(roomSlotText.text);

  if (normalizedTypedRoomText.length === 0) {
    return {
      suggestions: createRoomSuggestionsFromRooms(connectedRooms, roomSlotText.exact),
      replaceStart: slotStart,
      replaceEnd: fragment.end,
      prefix: '',
    };
  }

  const matchingRooms = createRoomSuggestionsFromRooms(
    connectedRooms.filter((room) => roomMatchesReferencePrefix(room.name, roomSlotText.text, roomSlotText.exact)),
    roomSlotText.exact,
  );

  if (fragment.prefix.length === 0 && roomSlotText.quoteClosed) {
    const hasLongerMatch = matchingRooms.some(
      (suggestion) => normalizeRoomReferenceText(suggestion.label) !== normalizedTypedRoomText,
    );
    if (!hasLongerMatch) {
      return {
        suggestions: fallbackSuggestions,
        replaceStart: fragment.caret,
        replaceEnd: fragment.caret,
        prefix: '',
      };
    }
  }

  return {
    suggestions: fragment.prefix.length === 0 && fallbackSuggestions.length > 0
      ? helpers.mergeSuggestions(matchingRooms, fallbackSuggestions)
      : matchingRooms,
    replaceStart: slotStart,
    replaceEnd: fragment.end,
    prefix: normalizedTypedRoomText,
  };
}
