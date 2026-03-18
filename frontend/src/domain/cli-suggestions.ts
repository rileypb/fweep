import { CLI_COMMAND_SUGGESTION_SPECS, parseCliCommandDescription } from './cli-command';
import { STANDARD_DIRECTIONS, normalizeDirection } from './directions';
import { getCliHelpTopics } from './cli-help';
import type { MapDocument } from './map-types';

export type CliSuggestionKind = 'command' | 'room' | 'direction' | 'help-topic' | 'placeholder';

export interface CliSuggestion {
  readonly id: string;
  readonly kind: CliSuggestionKind;
  readonly label: string;
  readonly insertText: string;
  readonly detail: string | null;
}

export interface CliSuggestionResult {
  readonly replaceStart: number;
  readonly replaceEnd: number;
  readonly prefix: string;
  readonly suggestions: readonly CliSuggestion[];
  readonly highlightedIndex: number;
}

interface Token {
  readonly value: string;
  readonly start: number;
  readonly end: number;
}

interface ActiveFragment {
  readonly start: number;
  readonly end: number;
  readonly caret: number;
  readonly prefix: string;
  readonly tokenIndex: number;
  readonly precedingTokens: readonly Token[];
}

interface SuggestionResolution {
  readonly suggestions: readonly CliSuggestion[];
  readonly replaceStart?: number;
  readonly replaceEnd?: number;
  readonly prefix?: string;
}

const DEFAULT_COMMAND_IDS = ['create', 'connect', 'show', 'edit', 'arrange', 'help'] as const;
const DEFAULT_DIRECTIONS = ['north', 'south', 'east', 'west'] as const;

function tokenizePlainInput(input: string, offset = 0): readonly Token[] {
  return Array.from(input.matchAll(/[^\s,"]+/g)).map((match) => {
    const value = match[0] ?? '';
    const start = (match.index ?? 0) + offset;
    return {
      value,
      start,
      end: start + value.length,
    };
  });
}

function isFragmentDelimiter(character: string | undefined): boolean {
  return character === undefined || /\s|,|"/.test(character);
}

function getActiveFragment(input: string, caretPosition: number): ActiveFragment | null {
  const safeCaretPosition = Math.max(0, Math.min(caretPosition, input.length));
  if (input.trim().length === 0) {
    return {
      start: safeCaretPosition,
      end: safeCaretPosition,
      caret: safeCaretPosition,
      prefix: '',
      tokenIndex: 0,
      precedingTokens: [],
    };
  }

  let start = safeCaretPosition;
  const hasTrailingDelimiter = safeCaretPosition > 0 && isFragmentDelimiter(input[safeCaretPosition - 1]);
  if (hasTrailingDelimiter) {
    const precedingTokens = tokenizePlainInput(input.slice(0, safeCaretPosition));
    return {
      start: safeCaretPosition,
      end: safeCaretPosition,
      caret: safeCaretPosition,
      prefix: '',
      tokenIndex: precedingTokens.length,
      precedingTokens,
    };
  }

  while (start > 0 && !isFragmentDelimiter(input[start - 1])) {
    start -= 1;
  }

  const prefix = input.slice(start, safeCaretPosition);
  if (prefix.trim().length === 0) {
    return null;
  }

  let end = safeCaretPosition;
  while (end < input.length && !isFragmentDelimiter(input[end])) {
    end += 1;
  }

  return {
    start,
    end,
    caret: safeCaretPosition,
    prefix,
    tokenIndex: tokenizePlainInput(input.slice(0, start)).length,
    precedingTokens: tokenizePlainInput(input.slice(0, start)),
  };
}

function startsWithNormalized(value: string, prefix: string): boolean {
  return value.toLowerCase().startsWith(prefix.toLowerCase());
}

function createKeywordSuggestions(prefix: string, values: readonly string[]): readonly CliSuggestion[] {
  const normalizedPrefix = prefix.toLowerCase();
  return values
    .filter((value) => normalizedPrefix.length === 0 || value.toLowerCase().startsWith(normalizedPrefix))
    .map((value) => ({
      id: `cli-suggestion-keyword-${value.replace(/\s+/g, '-')}`,
      kind: 'command' as const,
      label: value,
      insertText: value,
      detail: null,
    }));
}

function createPlaceholderSuggestion(label: string): readonly CliSuggestion[] {
  return [{
    id: `cli-suggestion-placeholder-${label.replace(/[^\w]+/g, '-').toLowerCase()}`,
    kind: 'placeholder' as const,
    label,
    insertText: '',
    detail: null,
  }];
}

function createCommandSuggestions(prefix: string): readonly CliSuggestion[] {
  const normalizedPrefix = prefix.toLowerCase();

  return CLI_COMMAND_SUGGESTION_SPECS
    .filter((spec) => {
      if (normalizedPrefix === 'e' && spec.id === 'edit') {
        return false;
      }
      if (normalizedPrefix === 's' && spec.id === 'show') {
        return false;
      }
      return spec.matchTerms.some((term) => term.startsWith(normalizedPrefix));
    })
    .sort((left, right) => {
      const leftExact = left.insertText.startsWith(normalizedPrefix) ? 0 : 1;
      const rightExact = right.insertText.startsWith(normalizedPrefix) ? 0 : 1;
      if (leftExact !== rightExact) {
        return leftExact - rightExact;
      }

      if (left.insertText.length !== right.insertText.length) {
        return left.insertText.length - right.insertText.length;
      }

      return left.insertText.localeCompare(right.insertText);
    })
    .map((spec) => ({
      id: `cli-suggestion-command-${spec.id}`,
      kind: 'command' as const,
      label: spec.insertText,
      insertText: spec.insertText,
      detail: parseCliCommandDescription(spec.descriptionInput),
    }));
}

function createDefaultSuggestions(doc: MapDocument | null): readonly CliSuggestion[] {
  const commandSuggestions = DEFAULT_COMMAND_IDS
    .map((commandId) => CLI_COMMAND_SUGGESTION_SPECS.find((spec) => spec.id === commandId) ?? null)
    .filter((spec): spec is NonNullable<typeof spec> => spec !== null)
    .map((spec) => ({
      id: `cli-suggestion-command-${spec.id}`,
      kind: 'command' as const,
      label: spec.insertText,
      insertText: spec.insertText,
      detail: parseCliCommandDescription(spec.descriptionInput),
    }));

  const directionSuggestions = DEFAULT_DIRECTIONS.map((direction) => ({
    id: `cli-suggestion-direction-${direction}`,
    kind: 'direction' as const,
    label: direction,
    insertText: direction,
    detail: 'Direction',
  }));

  const roomSuggestions = doc === null ? [] : createPlaceholderSuggestion('<room>');

  return [...commandSuggestions, ...directionSuggestions, ...roomSuggestions];
}

function createDirectionSuggestions(prefix: string): readonly CliSuggestion[] {
  const normalizedPrefix = prefix.toLowerCase();
  return STANDARD_DIRECTIONS
    .filter((direction) => startsWithNormalized(direction, normalizedPrefix) || startsWithNormalized(direction[0] ?? '', normalizedPrefix))
    .sort((left, right) => left.localeCompare(right))
    .map((direction) => ({
      id: `cli-suggestion-direction-${direction}`,
      kind: 'direction' as const,
      label: direction,
      insertText: direction,
      detail: 'Direction',
    }));
}

function createConnectionAnnotationSuggestions(prefix: string): readonly CliSuggestion[] {
  return createKeywordSuggestions(prefix, ['door', 'locked door', 'clear']);
}

function createRoomSuggestions(doc: MapDocument | null, prefix: string): readonly CliSuggestion[] {
  if (!doc) {
    return [];
  }

  const normalizedPrefix = prefix.toLowerCase();
  return Object.values(doc.rooms)
    .filter((room) => room.name.toLowerCase().split(/\s+/).some((part) => part.startsWith(normalizedPrefix)))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((room) => ({
      id: `cli-suggestion-room-${room.id}`,
      kind: 'room' as const,
      label: room.name,
      insertText: room.name,
      detail: 'Room',
    }));
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

function roomMatchesReferencePrefix(roomName: string, typedRoomText: string): boolean {
  const typedWords = tokenizeRoomReferenceWords(typedRoomText);
  if (typedWords.length === 0) {
    return false;
  }

  const roomWords = tokenizeRoomReferenceWords(roomName);
  return typedWords.every((typedWord) => roomWords.some((roomWord) => roomWord.startsWith(typedWord)));
}

function getRoomReferenceResolution(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
  slotStartTokenIndex: number,
): SuggestionResolution {
  const slotStart = fragment.precedingTokens[slotStartTokenIndex]?.start ?? fragment.start;
  const typedRoomText = input.slice(slotStart, fragment.caret);
  const normalizedTypedRoomText = normalizeRoomReferenceText(typedRoomText);

  if (normalizedTypedRoomText.length === 0) {
    return {
      suggestions: createPlaceholderSuggestion('<room>'),
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
    .filter((room) => roomMatchesReferencePrefix(room.name, typedRoomText))
    .sort((left, right) => left.name.localeCompare(right.name))
    .map((room) => ({
      id: `cli-suggestion-room-${room.id}`,
      kind: 'room' as const,
      label: room.name,
      insertText: room.name,
      detail: 'Room',
    }));

  if (fragment.prefix.length === 0) {
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

function createHelpTopicSuggestions(prefix: string): readonly CliSuggestion[] {
  const normalizedPrefix = prefix.toLowerCase();
  return getCliHelpTopics()
    .filter((topic) => topic.startsWith(normalizedPrefix))
    .map((topic) => ({
      id: `cli-suggestion-help-${topic}`,
      kind: 'help-topic' as const,
      label: topic,
      insertText: topic,
      detail: 'Help topic',
    }));
}

function isDirectionLikePrefix(prefix: string): boolean {
  const normalizedPrefix = normalizeDirection(prefix);
  return STANDARD_DIRECTIONS.some((direction) => direction.startsWith(normalizedPrefix));
}

function getCanonicalDirectionToken(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalizedValue = normalizeDirection(value);
  return STANDARD_DIRECTIONS.includes(normalizedValue) ? normalizedValue : null;
}

function isPseudoRoomLead(tokens: readonly string[]): boolean {
  return (tokens[0] === 'the' && (tokens[1] === 'room' || tokens[1] === 'way'))
    || getCanonicalDirectionToken(tokens[0] ?? null) !== null
    || tokens[0] === 'above'
    || tokens[0] === 'below';
}

function hasMalformedPseudoRoomContinuation(tokens: readonly string[]): boolean {
  return isPseudoRoomLead(tokens) && tokens.includes('to');
}

function suggestionResolution(suggestions: readonly CliSuggestion[]): SuggestionResolution {
  return { suggestions };
}

function mergeSuggestions(
  primary: readonly CliSuggestion[],
  secondary: readonly CliSuggestion[],
): readonly CliSuggestion[] {
  const seenIds = new Set(primary.map((suggestion) => suggestion.id));
  return [
    ...primary,
    ...secondary.filter((suggestion) => !seenIds.has(suggestion.id)),
  ];
}

function getRoomReferenceResolutionWithFallback(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
  slotStartTokenIndex: number,
  fallbackSuggestions: readonly CliSuggestion[],
): SuggestionResolution {
  const roomResolution = getRoomReferenceResolution(input, fragment, doc, slotStartTokenIndex);
  const slotStart = fragment.precedingTokens[slotStartTokenIndex]?.start ?? fragment.start;
  const typedRoomText = input.slice(slotStart, fragment.caret);
  const hasTypedRoomText = normalizeRoomReferenceText(typedRoomText).length > 0;
  const shouldOfferFallback = hasTypedRoomText && fragment.prefix.length === 0;

  if (!shouldOfferFallback) {
    return roomResolution;
  }

  if (roomResolution.suggestions.length === 0) {
    return {
      suggestions: fallbackSuggestions,
      replaceStart: fragment.start,
      replaceEnd: fragment.end,
      prefix: fragment.prefix,
    };
  }

  return {
    suggestions: mergeSuggestions(roomResolution.suggestions, fallbackSuggestions),
    replaceStart: roomResolution.replaceStart,
    replaceEnd: roomResolution.replaceEnd,
    prefix: roomResolution.prefix,
  };
}

function getLeadingRoomReferenceResolution(
  input: string,
  fragment: ActiveFragment,
  doc: MapDocument | null,
  fallbackSuggestions: readonly CliSuggestion[],
): SuggestionResolution {
  const syntheticFragment: ActiveFragment = {
    ...fragment,
    precedingTokens: [{ value: '', start: 0, end: 0 }],
  };

  const roomResolution = getRoomReferenceResolution(input, syntheticFragment, doc, 0);
  if (roomResolution.suggestions.length > 0) {
    if (fragment.prefix.length === 0) {
      return {
        suggestions: mergeSuggestions(roomResolution.suggestions, fallbackSuggestions),
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

function hasCommaAfterLastPrecedingToken(fragment: ActiveFragment, input: string): boolean {
  const lastToken = fragment.precedingTokens.at(-1);
  if (!lastToken) {
    return false;
  }

  return input.slice(lastToken.end, fragment.caret).includes(',');
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
      ...createRoomSuggestions(doc, prefix),
    ]);
  }

  if ((tokens[0] === 'help' || tokens[0] === 'h') && fragment.tokenIndex === 1) {
    return suggestionResolution(createHelpTopicSuggestions(prefix));
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
    );
    if (leadingRoomResolution.suggestions.length > 0) {
      return leadingRoomResolution;
    }
  }

  if (tokens[0] === 'go' && fragment.tokenIndex === 1) {
    return suggestionResolution([
      ...createDirectionSuggestions(prefix),
      ...createKeywordSuggestions(prefix, ['to']),
    ]);
  }

  if (tokens[0] === 'go' && tokens[1] === 'to') {
    return getRoomReferenceResolution(input, fragment, doc, 2);
  }

  if (tokens[0] === 'show') {
    return getRoomReferenceResolution(input, fragment, doc, 1);
  }

  if (tokens[0] === 'delete' || tokens[0] === 'd' || tokens[0] === 'del' || tokens[0] === 'edit' || tokens[0] === 'ed') {
    return getRoomReferenceResolution(input, fragment, doc, 1);
  }

  if (tokens[0] === 'notate' || tokens[0] === 'annotate' || tokens[0] === 'ann') {
    if (tokens.includes('with')) {
      return suggestionResolution([]);
    }

    if (fragment.tokenIndex <= 1 || prefix.length > 0) {
      return getRoomReferenceResolution(input, fragment, doc, 1);
    }

    return suggestionResolution(createKeywordSuggestions(prefix, ['with']));
  }

  if (tokens[0] === 'put') {
    if (tokens.includes('in')) {
      const inIndex = tokens.indexOf('in');
      if (fragment.tokenIndex > inIndex) {
        return getRoomReferenceResolution(input, fragment, doc, inIndex + 1);
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
        return getRoomReferenceResolution(input, fragment, doc, fromIndex + 1);
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
      if (fragment.tokenIndex === 3) {
        return suggestionResolution(createPlaceholderSuggestion('<new room name>'));
      }

      if (lastToken === 'which') {
        return suggestionResolution(createKeywordSuggestions(prefix, ['is']));
      }

      if (tokens.at(-2) === 'which' && lastToken === 'is') {
        return suggestionResolution(createKeywordSuggestions(prefix, ['dark', 'lit']));
      }

      if (lastToken === 'dark' || lastToken === 'lit') {
        return hasCommaAfterLastPrecedingToken(fragment, input)
          ? suggestionResolution(createDirectionSuggestions(prefix))
          : suggestionResolution(createKeywordSuggestions(prefix, [',']));
      }

      const createAndConnectToIndex = tokens.indexOf('to');
      if (createAndConnectToIndex !== -1) {
        if (fragment.tokenIndex === createAndConnectToIndex + 1) {
          return getRoomReferenceResolution(input, fragment, doc, createAndConnectToIndex + 1);
        }

        if (fragment.tokenIndex > createAndConnectToIndex + 1) {
          return getRoomReferenceResolutionWithFallback(
            input,
            fragment,
            doc,
            createAndConnectToIndex + 1,
            createDirectionSuggestions(prefix),
          );
        }
      }

      if (lastToken === 'one-way' || lastToken === 'oneway' || lastToken === 'way') {
        return suggestionResolution(createKeywordSuggestions(prefix, ['to']));
      }

      if (canonicalLastDirection !== null) {
        return suggestionResolution(createKeywordSuggestions(prefix, ['one-way', 'to']));
      }

      return suggestionResolution([
        ...createDirectionSuggestions(prefix),
        ...createKeywordSuggestions(prefix, [', which is']),
      ]);
    }

    const toIndex = tokens.indexOf('to');
    if (toIndex !== -1) {
      if (fragment.tokenIndex === toIndex + 1 || (lastToken !== null && tokens.indexOf(lastToken) > toIndex && isDirectionLikePrefix(prefix))) {
        return getRoomReferenceResolution(input, fragment, doc, toIndex + 1);
      }

      if (fragment.tokenIndex > toIndex + 1) {
        return getRoomReferenceResolution(input, fragment, doc, toIndex + 1);
      }
      return getRoomReferenceResolution(input, fragment, doc, toIndex + 1);
    }

    if (fragment.tokenIndex === 1) {
      return getRoomReferenceResolution(input, fragment, doc, 1);
    }

    if (
      lastToken !== null
      && !(STANDARD_DIRECTIONS as readonly string[]).includes(lastToken)
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
      );
      if (sourceRoomResolution.suggestions.length > 0) {
        return sourceRoomResolution;
      }
    }

    if (lastToken === 'one-way' || lastToken === 'oneway' || lastToken === 'way') {
      return suggestionResolution(createKeywordSuggestions(prefix, ['to']));
    }

    if (canonicalLastDirection !== null) {
      return suggestionResolution(createKeywordSuggestions(prefix, ['one-way', 'to']));
    }

    if (tokens.length > 1 && (prefix.length === 0 || isDirectionLikePrefix(prefix))) {
      return suggestionResolution(createDirectionSuggestions(prefix));
    }

    return suggestionResolution(createKeywordSuggestions(prefix, ['one-way', 'to']));
  }

  if (tokens[0] === 'create' || tokens[0] === 'c') {
    if (fragment.tokenIndex === 1) {
      return suggestionResolution(createPlaceholderSuggestion('<new room name>'));
    }

    if (tokens[1] === 'and' && fragment.tokenIndex === 2) {
      return suggestionResolution(createKeywordSuggestions(prefix, ['connect']));
    }

    if (tokens[1] === 'and' && (tokens[2] === 'connect' || tokens[2] === 'con')) {
      return getSuggestionsForCommandContext(
        input,
        {
          ...fragment,
          precedingTokens: [{ value: 'connect', start: fragment.start, end: fragment.start }, ...fragment.precedingTokens.slice(3)],
          tokenIndex: Math.max(fragment.tokenIndex - 3, 0),
        },
        doc,
      );
    }

    if (lastToken === 'which') {
      return suggestionResolution(createKeywordSuggestions(prefix, ['is']));
    }

    if (tokens.at(-2) === 'which' && lastToken === 'is') {
      return suggestionResolution(createKeywordSuggestions(prefix, ['dark', 'lit']));
    }

    if (lastToken === 'dark' || lastToken === 'lit') {
      return hasCommaAfterLastPrecedingToken(fragment, input)
        ? suggestionResolution(createDirectionSuggestions(prefix))
        : suggestionResolution(createKeywordSuggestions(prefix, [',']));
    }

    const ofIndex = tokens.indexOf('of');
    if (ofIndex !== -1 && fragment.tokenIndex === ofIndex + 1) {
      return getRoomReferenceResolution(input, fragment, doc, ofIndex + 1);
    }
    if (ofIndex !== -1 && fragment.tokenIndex > ofIndex + 1) {
      return suggestionResolution([]);
    }

    const verticalCreateIndex = tokens.findIndex((token) => token === 'above' || token === 'below');
    if (verticalCreateIndex !== -1) {
      if (fragment.tokenIndex === verticalCreateIndex + 1 || lastToken === 'above' || lastToken === 'below') {
        return getRoomReferenceResolution(input, fragment, doc, verticalCreateIndex + 1);
      }

      if (fragment.tokenIndex > verticalCreateIndex + 1) {
        return suggestionResolution([]);
      }
    }

    if (fragment.tokenIndex === 2 && prefix.length === 0) {
      return suggestionResolution([
        ...createKeywordSuggestions(prefix, [', which is', 'above', 'below']),
        ...createDirectionSuggestions(prefix),
      ]);
    }

    if (canonicalLastDirection !== null) {
      return suggestionResolution(createKeywordSuggestions(prefix, ['of']));
    }

    if (tokens.length > 1 && (prefix.length === 0 || isDirectionLikePrefix(prefix))) {
      return suggestionResolution(createDirectionSuggestions(prefix));
    }

    return suggestionResolution([
      ...createKeywordSuggestions(prefix, [', which is', 'above', 'below']),
      ...createDirectionSuggestions(prefix),
    ]);
  }

  if (tokens[0] === 'the' && tokens[1] === 'room') {
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
        );
      }
    }

    if (getCanonicalDirectionToken(tokens[2] ?? null) !== null) {
      return suggestionResolution(createKeywordSuggestions(prefix, ['of']));
    }
  }

  if (tokens[0] === 'the' && tokens[1] === 'way') {
    const pseudoWaySuggestions = createKeywordSuggestions(prefix, ['goes on forever', 'leads nowhere', 'lies death']);

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
      return getRoomReferenceResolutionWithFallback(input, fragment, doc, 3, pseudoWaySuggestions);
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
        return getRoomReferenceResolutionWithFallback(input, fragment, doc, wayOfIndex + 1, pseudoWaySuggestions);
      }
    }

    if (getCanonicalDirectionToken(tokens[2] ?? null) !== null) {
      return suggestionResolution(createKeywordSuggestions(prefix, ['of']));
    }
  }

  if (fragment.tokenIndex === 1 && getCanonicalDirectionToken(tokens[0] ?? null) !== null) {
    return suggestionResolution(createKeywordSuggestions(prefix, ['of']));
  }

  if (fragment.tokenIndex === 1 && (tokens[0] === 'above' || tokens[0] === 'below')) {
    return getRoomReferenceResolution(input, fragment, doc, 1);
  }

  if (
    (getCanonicalDirectionToken(tokens[0] ?? null) !== null || tokens[0] === 'above' || tokens[0] === 'below')
    && !tokens.includes('to')
    && !tokens.includes('is')
    && !tokens.includes('goes')
    && !tokens.includes('leads')
    && !tokens.includes('lies')
  ) {
    const ofIndex = tokens.indexOf('of');
    const fallbackSuggestions = createKeywordSuggestions(prefix, ['is unknown', 'goes on forever', 'leads nowhere', 'lies death']);

    if (ofIndex !== -1 && fragment.tokenIndex >= ofIndex + 1) {
      return getRoomReferenceResolutionWithFallback(input, fragment, doc, ofIndex + 1, fallbackSuggestions);
    }

    if ((tokens[0] === 'above' || tokens[0] === 'below') && fragment.tokenIndex >= 1) {
      return getRoomReferenceResolutionWithFallback(input, fragment, doc, 1, fallbackSuggestions);
    }
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
    if (fragment.tokenIndex >= roomToIndex + 1 && !tokens.includes('is')) {
      return getRoomReferenceResolutionWithFallback(
        input,
        fragment,
        doc,
        roomToIndex + 1,
        createKeywordSuggestions(prefix, ['is']),
      );
    }
  }

  if (lastToken === 'of') {
    return getRoomReferenceResolution(input, fragment, doc, fragment.tokenIndex);
  }

  if (lastToken === 'is' && roomToIndex > 0 && !isPseudoRoomLead(tokens)) {
    return suggestionResolution(createConnectionAnnotationSuggestions(prefix));
  }

  if (
    lastToken === 'is'
    && !tokens.includes('to')
    && (
      isPseudoRoomLead(tokens)
    )
  ) {
    return suggestionResolution(createKeywordSuggestions(prefix, ['unknown']));
  }

  if (lastToken === 'is' && hasMalformedPseudoRoomContinuation(tokens)) {
    return suggestionResolution([]);
  }

  if (lastToken === 'is') {
    return suggestionResolution(createKeywordSuggestions(prefix, ['dark', 'lit']));
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

  if (lastToken === 'lies') {
    return suggestionResolution(createKeywordSuggestions(prefix, ['death']));
  }

  if (lastToken === 'leads') {
    return suggestionResolution(createKeywordSuggestions(prefix, ['nowhere']));
  }

  if (lastToken === 'to') {
    if (isPseudoRoomLead(tokens)) {
      return suggestionResolution([]);
    }
    return getRoomReferenceResolution(input, fragment, doc, fragment.tokenIndex);
  }

  if (hasMalformedPseudoRoomContinuation(tokens)) {
    return suggestionResolution([]);
  }

  if (fragment.tokenIndex >= 1) {
    return suggestionResolution(createKeywordSuggestions(prefix, ['is', 'to']));
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
