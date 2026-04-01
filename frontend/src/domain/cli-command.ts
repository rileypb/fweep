import { CLI_DIRECTIONS, normalizeDirection, oppositeDirection } from './directions';
import { parseCliHelpTopic, type CliHelpTopic } from './cli-help';
import type { PseudoRoomKind } from './map-types';

export interface CliRoomReference {
  readonly text: string;
  readonly exact: boolean;
}

export interface CliRoomAdjective {
  readonly kind: 'lighting';
  readonly text: 'dark' | 'lit';
  readonly isDark: boolean;
}

export type CliCommand =
  | { readonly kind: 'help'; readonly topic: CliHelpTopic | null }
  | { readonly kind: 'arrange' }
  | { readonly kind: 'choose-game' }
  | {
    readonly kind: 'zoom';
    readonly mode: 'relative' | 'reset' | 'absolute';
    readonly direction?: 'in' | 'out';
    readonly zoomPercent?: number;
  }
  | { readonly kind: 'navigate'; readonly direction: string }
  | { readonly kind: 'create'; readonly roomName: string; readonly adjective: CliRoomAdjective | null }
  | { readonly kind: 'put-items'; readonly itemNames: readonly string[]; readonly room: CliRoomReference }
  | { readonly kind: 'take-items'; readonly itemNames: readonly string[]; readonly room: CliRoomReference }
  | { readonly kind: 'take-all-items'; readonly room: CliRoomReference }
  | {
    readonly kind: 'create-pseudo-room';
    readonly pseudoKind: PseudoRoomKind;
    readonly sourceRoom: CliRoomReference | null;
    readonly sourceDirection: string;
  }
  | { readonly kind: 'delete'; readonly room: CliRoomReference }
  | { readonly kind: 'edit'; readonly room: CliRoomReference }
  | { readonly kind: 'describe'; readonly room: CliRoomReference | null }
  | { readonly kind: 'show'; readonly room: CliRoomReference }
  | { readonly kind: 'set-room-adjective'; readonly room: CliRoomReference; readonly adjective: CliRoomAdjective }
  | {
    readonly kind: 'selected-room-relative-connect';
    readonly sourceRoom: CliRoomReference | null;
    readonly sourceDirection: string;
    readonly targetRoom: CliRoomReference;
  }
  | {
    readonly kind: 'set-connection-annotation';
    readonly sourceRoom: CliRoomReference;
    readonly targetRoom: CliRoomReference;
    readonly annotation: 'door' | 'locked door' | null;
  }
  | { readonly kind: 'notate'; readonly room: CliRoomReference | null; readonly noteText: string }
  | {
    readonly kind: 'connect';
    readonly sourceRoom: CliRoomReference;
    readonly sourceDirection: string;
    readonly targetRoom: CliRoomReference;
    readonly targetDirection: string | null;
    readonly oneWay: boolean;
  }
  | {
    readonly kind: 'disconnect';
    readonly sourceRoom: CliRoomReference;
    readonly sourceDirection: string | null;
    readonly targetRoom: CliRoomReference;
  }
  | {
    readonly kind: 'create-and-connect';
    readonly sourceRoomName: string;
    readonly adjective: CliRoomAdjective | null;
    readonly sourceDirection: string;
    readonly targetRoom: CliRoomReference;
    readonly targetDirection: string | null;
    readonly oneWay: boolean;
  }
  | { readonly kind: 'undo' }
  | { readonly kind: 'redo' };

export const CLI_COMMAND_FORMS = [
  'help/h',
  'arrange/arr/prettify',
  'choose [a] game',
  'zoom in/out/reset/<percent>',
  'go <direction>',
  '<direction>',
  'create/c <room name>',
  '<direction> of <room name> is unknown',
  '<direction> of <room name> is <room name>',
  '<direction> is unknown',
  'above/below <room name> is unknown',
  'above/below <room name> is <room name>',
  'above/below is unknown',
  'the room <direction> of <room name> is unknown',
  'the room above/below <room name> is unknown',
  '<direction> of <room name> goes on forever',
  '<direction> goes on forever',
  'above/below <room name> goes on forever',
  'above/below goes on forever',
  'the way <direction> of <room name> goes on forever',
  'the way above/below <room name> goes on forever',
  '<direction> of <room name> lies death',
  '<direction> lies death',
  'above/below <room name> lies death',
  'above/below lies death',
  'the way <direction> of <room name> lies death',
  'the way above/below <room name> lies death',
  '<direction> of <room name> leads nowhere',
  '<direction> leads nowhere',
  'above/below <room name> leads nowhere',
  'above/below leads nowhere',
  'the way <direction> of <room name> leads nowhere',
  'the way above/below <room name> leads nowhere',
  '<direction> of <room name> leads to somewhere else',
  '<direction> leads to somewhere else',
  'above/below <room name> leads to somewhere else',
  'above/below leads to somewhere else',
  'the way <direction> of <room name> leads to somewhere else',
  'the way above/below <room name> leads to somewhere else',
  'delete/d/del <room name>',
  'edit/e/ed <room name>',
  'describe [<room name>]',
  'show/select/s/go to <room name>',
  '<direction>/above/below is <room name>',
  '<room name> to <room name> is [a] door',
  '<room name> to <room name> is [a] locked door',
  '<room name> to <room name> is clear',
  '<room name> is dark',
  '<room name> is lit',
  'create/c <room name>, which is <adjective>',
  'create/c <room name>, which is <adjective>, <direction> of <room name>',
  'create and connect <room name>, which is <adjective>, <direction> to <room name> [<direction>]',
  'put/drop <item> in <room name>',
  'put/drop <item>, <item>, and <item> in <room name>',
  'take/get <item> from <room name>',
  'take/get <item>, <item>, and <item> from <room name>',
  'take/get all from <room name>',
  'notate/annotate/ann with <note text>',
  'notate/annotate/ann <room name> with <note text>',
  'connect/con <room name> <direction> [one-way] to <room name> [<direction>]',
  'disconnect <room name> [<direction>] from <room name>',
  'create and connect <room name> <direction> [one-way] to <room name> [<direction>]',
  'create/c <room name> <direction> of <room name>',
  'create/c <room name> above/below <room name>',
  'undo/redo',
] as const;

export interface CliCommandSuggestionSpec {
  readonly id: string;
  readonly insertText: string;
  readonly matchTerms: readonly string[];
  readonly descriptionInput: string;
}

export const CLI_COMMAND_SUGGESTION_SPECS: readonly CliCommandSuggestionSpec[] = [
  { id: 'help', insertText: 'help', matchTerms: ['help', 'h'], descriptionInput: 'help' },
  { id: 'arrange', insertText: 'arrange', matchTerms: ['arrange', 'arr', 'prettify'], descriptionInput: 'arrange' },
  { id: 'choose-game', insertText: 'choose game', matchTerms: ['choose game', 'choose a game'], descriptionInput: 'choose game' },
  { id: 'zoom', insertText: 'zoom', matchTerms: ['zoom'], descriptionInput: 'zoom in' },
  { id: 'go', insertText: 'go', matchTerms: ['go'], descriptionInput: 'go north' },
  { id: 'show', insertText: 'show', matchTerms: ['show', 'select', 's', 'go to'], descriptionInput: 'show Kitchen' },
  { id: 'create', insertText: 'create', matchTerms: ['create', 'c'], descriptionInput: 'create Kitchen' },
  { id: 'create-and-connect', insertText: 'create and connect', matchTerms: ['create and connect'], descriptionInput: 'create and connect Kitchen north to Hallway' },
  { id: 'connect', insertText: 'connect', matchTerms: ['connect', 'con'], descriptionInput: 'connect Kitchen north to Hallway' },
  { id: 'disconnect', insertText: 'disconnect', matchTerms: ['disconnect'], descriptionInput: 'disconnect Kitchen from Hallway' },
  { id: 'delete', insertText: 'delete', matchTerms: ['delete', 'd', 'del'], descriptionInput: 'delete Kitchen' },
  { id: 'edit', insertText: 'edit', matchTerms: ['edit', 'e', 'ed'], descriptionInput: 'edit Kitchen' },
  { id: 'describe', insertText: 'describe', matchTerms: ['describe'], descriptionInput: 'describe Kitchen' },
  { id: 'notate', insertText: 'notate', matchTerms: ['notate', 'annotate', 'ann'], descriptionInput: 'notate Kitchen with Treasure here' },
  { id: 'put', insertText: 'put', matchTerms: ['put', 'drop'], descriptionInput: 'put lantern in Kitchen' },
  { id: 'take', insertText: 'take', matchTerms: ['take', 'get'], descriptionInput: 'take lantern from Kitchen' },
  { id: 'undo', insertText: 'undo', matchTerms: ['undo'], descriptionInput: 'undo' },
  { id: 'redo', insertText: 'redo', matchTerms: ['redo'], descriptionInput: 'redo' },
] as const;

interface Token {
  readonly value: string;
  readonly quoted: boolean;
}

const DIRECTION_WORDS = new Set<string>(CLI_DIRECTIONS);
function normalizeCliWhitespace(input: string): string {
  return input.replace(/\t/g, ' ').replace(/ {2,}/g, ' ').trim();
}

function tokenizeCliInput(input: string): Token[] | null {
  const tokens: Token[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index];
    if (char === ' ') {
      index += 1;
      continue;
    }

    if (char === ',') {
      tokens.push({ value: ',', quoted: false });
      index += 1;
      continue;
    }

    if (char === '"') {
      let value = '';
      let closed = false;
      index += 1;
      while (index < input.length) {
        const current = input[index];
        if (current === '\\') {
          const next = input[index + 1];
          if (next === '"' || next === '\\') {
            value += next;
            index += 2;
            continue;
          }

          return null;
        }

        if (current === '"') {
          index += 1;
          tokens.push({ value, quoted: true });
          closed = true;
          break;
        }

        value += current;
        index += 1;
      }

      if (!closed) {
        return null;
      }
      continue;
    }

    let value = '';
    while (index < input.length && input[index] !== ' ' && input[index] !== ',') {
      if (input[index] === '"') {
        return null;
      }
      value += input[index];
      index += 1;
    }
    tokens.push({ value, quoted: false });
  }

  return tokens;
}

function isTokenValue(token: Token | undefined, expected: string): boolean {
  return token !== undefined && token.value.toLowerCase() === expected;
}

function isCommaToken(token: Token | undefined): boolean {
  return token !== undefined && !token.quoted && token.value === ',';
}

function isFirstWordAlias(token: Token | undefined, ...acceptedValues: readonly string[]): boolean {
  return token !== undefined && acceptedValues.some((acceptedValue) => token.value.toLowerCase() === acceptedValue);
}

function isDirectionToken(token: Token | undefined): boolean {
  return token !== undefined && !token.quoted && DIRECTION_WORDS.has(normalizeDirection(token.value));
}

function parseRoomAdjective(token: Token | undefined): CliRoomAdjective | null {
  if (isTokenValue(token, 'dark')) {
    return {
      kind: 'lighting',
      text: 'dark',
      isDark: true,
    };
  }

  if (isTokenValue(token, 'lit')) {
    return {
      kind: 'lighting',
      text: 'lit',
      isDark: false,
    };
  }

  return null;
}

function parseZoomPercentToken(token: Token | undefined): number | null {
  if (token === undefined || token.quoted) {
    return null;
  }

  const match = /^([+-]?(?:\d+(?:\.\d+)?|\.\d+))%?$/.exec(token.value.trim());
  if (match === null) {
    return null;
  }

  const numericValue = Number.parseFloat(match[1] ?? '');
  return Number.isFinite(numericValue) ? numericValue : null;
}

function parseWhichIsAdjectiveClause(
  tokens: readonly Token[],
  startIndex: number,
): { adjective: CliRoomAdjective; nextIndex: number } | null {
  if (!isTokenValue(tokens[startIndex], 'which') || !isTokenValue(tokens[startIndex + 1], 'is')) {
    return null;
  }

  const adjective = parseRoomAdjective(tokens[startIndex + 2]);
  if (adjective === null) {
    return null;
  }

  return {
    adjective,
    nextIndex: startIndex + 3,
  };
}

function isOneWayMarker(tokens: readonly Token[], index: number): { matched: boolean; nextIndex: number } {
  if (isTokenValue(tokens[index], 'one-way') || isTokenValue(tokens[index], 'oneway')) {
    return { matched: true, nextIndex: index + 1 };
  }

  if (isTokenValue(tokens[index], 'one') && isTokenValue(tokens[index + 1], 'way')) {
    return { matched: true, nextIndex: index + 2 };
  }

  return { matched: false, nextIndex: index };
}

function readRoomName(
  tokens: readonly Token[],
  startIndex: number,
  stopAt: (token: Token) => boolean,
): { reference: CliRoomReference; nextIndex: number } | null {
  const parts: string[] = [];
  let exact = false;
  let index = startIndex;

  while (index < tokens.length && !stopAt(tokens[index])) {
    parts.push(tokens[index].value);
    exact ||= tokens[index].quoted;
    index += 1;
  }

  if (parts.length === 0) {
    return null;
  }

  return {
    reference: {
      text: normalizeCliWhitespace(parts.join(' ')),
      exact,
    },
    nextIndex: index,
  };
}

interface ParsedConnectTail {
  readonly sourceRoom: CliRoomReference;
  readonly sourceDirection: string;
  readonly targetRoom: CliRoomReference;
  readonly targetDirection: string | null;
  readonly oneWay: boolean;
}

function parseConnectTailFromSourceReference(
  tokens: readonly Token[],
  startIndex: number,
  sourceRoom: CliRoomReference,
): ParsedConnectTail | null {
  const sourceDirectionToken = tokens[startIndex];
  if (!isDirectionToken(sourceDirectionToken)) {
    return null;
  }

  const sourceDirection = normalizeDirection(sourceDirectionToken.value);
  let index = startIndex + 1;

  const oneWayMarker = isOneWayMarker(tokens, index);
  if (oneWayMarker.matched) {
    index = oneWayMarker.nextIndex;
    if (!isTokenValue(tokens[index], 'to')) {
      return null;
    }
    index += 1;

    const targetRoom = readRoomName(tokens, index, () => false);
    if (targetRoom === null || targetRoom.nextIndex !== tokens.length) {
      return null;
    }

    return {
      sourceRoom,
      sourceDirection,
      targetRoom: targetRoom.reference,
      targetDirection: null,
      oneWay: true,
    };
  }

  if (!isTokenValue(tokens[index], 'to')) {
    return null;
  }
  index += 1;

  const toIndex = index;
  let targetDirection: string | null = null;
  if (tokens.length - index >= 2 && isDirectionToken(tokens[tokens.length - 1])) {
    targetDirection = normalizeDirection(tokens[tokens.length - 1].value);
  }

  const targetRoomEnd = targetDirection === null ? tokens.length : tokens.length - 1;
  const targetRoom = readRoomName(tokens.slice(toIndex, targetRoomEnd), 0, () => false);
  if (targetRoom === null) {
    return null;
  }

  return {
    sourceRoom,
    sourceDirection,
    targetRoom: targetRoom.reference,
    targetDirection: targetDirection ?? oppositeDirection(sourceDirection) ?? null,
    oneWay: false,
  };
}

interface ParsedDirectionReference {
  readonly sourceDirection: string;
  readonly sourceRoom: CliRoomReference | null;
  readonly nextIndex: number;
}

function parseDirectionReference(tokens: readonly Token[], startIndex: number): ParsedDirectionReference | null {
  const directionToken = tokens[startIndex];
  if (!isDirectionToken(directionToken)) {
    return null;
  }

  if (!isTokenValue(tokens[startIndex + 1], 'of')) {
    return null;
  }

  const sourceRoom = readRoomName(tokens, startIndex + 2, (token) => (
    isTokenValue(token, 'is') || isTokenValue(token, 'goes') || isTokenValue(token, 'lies') || isTokenValue(token, 'leads')
  ));
  if (sourceRoom === null) {
    return null;
  }

  return {
    sourceDirection: normalizeDirection(directionToken.value),
    sourceRoom: sourceRoom.reference,
    nextIndex: sourceRoom.nextIndex,
  };
}

function parseVerticalPseudoDirectionReference(tokens: readonly Token[], startIndex: number): ParsedDirectionReference | null {
  const directionToken = tokens[startIndex];
  if (directionToken === undefined || directionToken.quoted) {
    return null;
  }

  const lowered = directionToken.value.toLowerCase();
  if (lowered !== 'above' && lowered !== 'below') {
    return null;
  }

  const sourceRoom = readRoomName(tokens, startIndex + 1, (token) => (
    isTokenValue(token, 'is') || isTokenValue(token, 'goes') || isTokenValue(token, 'lies') || isTokenValue(token, 'leads')
  ));
  if (sourceRoom === null) {
    return null;
  }

  return {
    sourceDirection: lowered === 'above' ? 'up' : 'down',
    sourceRoom: sourceRoom.reference,
    nextIndex: sourceRoom.nextIndex,
  };
}

function parseSelectedRoomPseudoDirectionReference(
  tokens: readonly Token[],
  startIndex: number,
): ParsedDirectionReference | null {
  const directionToken = tokens[startIndex];
  if (directionToken === undefined || directionToken.quoted) {
    return null;
  }

  if (isDirectionToken(directionToken)) {
    return {
      sourceDirection: normalizeDirection(directionToken.value),
      sourceRoom: null,
      nextIndex: startIndex + 1,
    };
  }

  if (isTokenValue(directionToken, 'above') || isTokenValue(directionToken, 'below')) {
    return {
      sourceDirection: isTokenValue(directionToken, 'above') ? 'up' : 'down',
      sourceRoom: null,
      nextIndex: startIndex + 1,
    };
  }

  return null;
}

function parsePseudoRoomCommand(
  tokens: readonly Token[],
): Extract<CliCommand, { kind: 'create-pseudo-room' | 'selected-room-relative-connect' | 'connect' }> | null {
  const parseUnknownOrConnect = (
    startIndex: number,
  ): Extract<CliCommand, { kind: 'create-pseudo-room' | 'selected-room-relative-connect' | 'connect' }> | null => {
    const directionReference = parseDirectionReference(tokens, startIndex)
      ?? parseVerticalPseudoDirectionReference(tokens, startIndex)
      ?? parseSelectedRoomPseudoDirectionReference(tokens, startIndex);
    if (directionReference === null) {
      return null;
    }
    if (!isTokenValue(tokens[directionReference.nextIndex], 'is')) {
      return null;
    }

    if (
      isTokenValue(tokens[directionReference.nextIndex + 1], 'unknown')
      && directionReference.nextIndex + 2 === tokens.length
    ) {
      return {
        kind: 'create-pseudo-room' as const,
        pseudoKind: 'unknown' as const,
        sourceRoom: directionReference.sourceRoom,
        sourceDirection: directionReference.sourceDirection,
      };
    }

    const targetRoom = readRoomName(tokens, directionReference.nextIndex + 1, () => false);
    if (targetRoom === null || targetRoom.nextIndex !== tokens.length) {
      return null;
    }

    if (directionReference.sourceRoom === null) {
      if (tokens.length === directionReference.nextIndex + 2 && parseRoomAdjective(tokens[directionReference.nextIndex + 1]) !== null) {
        return null;
      }

      return {
        kind: 'selected-room-relative-connect',
        sourceRoom: null,
        sourceDirection: directionReference.sourceDirection,
        targetRoom: targetRoom.reference,
      };
    }

    return {
      kind: 'selected-room-relative-connect',
      sourceRoom: directionReference.sourceRoom,
      sourceDirection: directionReference.sourceDirection,
      targetRoom: targetRoom.reference,
    };
  };

  const parseInfinite = (startIndex: number) => {
    const directionReference = parseDirectionReference(tokens, startIndex)
      ?? parseVerticalPseudoDirectionReference(tokens, startIndex)
      ?? parseSelectedRoomPseudoDirectionReference(tokens, startIndex);
    if (directionReference === null) {
      return null;
    }
    if (
      !isTokenValue(tokens[directionReference.nextIndex], 'goes')
      || !isTokenValue(tokens[directionReference.nextIndex + 1], 'on')
      || !isTokenValue(tokens[directionReference.nextIndex + 2], 'forever')
      || directionReference.nextIndex + 3 !== tokens.length
    ) {
      return null;
    }

    return {
      kind: 'create-pseudo-room' as const,
      pseudoKind: 'infinite' as const,
      sourceRoom: directionReference.sourceRoom,
      sourceDirection: directionReference.sourceDirection,
    };
  };

  const parseDeath = (startIndex: number) => {
    const directionReference = parseDirectionReference(tokens, startIndex)
      ?? parseVerticalPseudoDirectionReference(tokens, startIndex)
      ?? parseSelectedRoomPseudoDirectionReference(tokens, startIndex);
    if (directionReference === null) {
      return null;
    }
    if (
      !isTokenValue(tokens[directionReference.nextIndex], 'lies')
      || !isTokenValue(tokens[directionReference.nextIndex + 1], 'death')
      || directionReference.nextIndex + 2 !== tokens.length
    ) {
      return null;
    }

    return {
      kind: 'create-pseudo-room' as const,
      pseudoKind: 'death' as const,
      sourceRoom: directionReference.sourceRoom,
      sourceDirection: directionReference.sourceDirection,
    };
  };

  const parseNowhere = (startIndex: number) => {
    const directionReference = parseDirectionReference(tokens, startIndex)
      ?? parseVerticalPseudoDirectionReference(tokens, startIndex)
      ?? parseSelectedRoomPseudoDirectionReference(tokens, startIndex);
    if (directionReference === null) {
      return null;
    }
    if (
      !isTokenValue(tokens[directionReference.nextIndex], 'leads')
      || !isTokenValue(tokens[directionReference.nextIndex + 1], 'nowhere')
      || directionReference.nextIndex + 2 !== tokens.length
    ) {
      return null;
    }

    return {
      kind: 'create-pseudo-room' as const,
      pseudoKind: 'nowhere' as const,
      sourceRoom: directionReference.sourceRoom,
      sourceDirection: directionReference.sourceDirection,
    };
  };

  const parseElsewhere = (startIndex: number) => {
    const directionReference = parseDirectionReference(tokens, startIndex)
      ?? parseVerticalPseudoDirectionReference(tokens, startIndex)
      ?? parseSelectedRoomPseudoDirectionReference(tokens, startIndex);
    if (directionReference === null) {
      return null;
    }
    if (
      !isTokenValue(tokens[directionReference.nextIndex], 'leads')
      || !isTokenValue(tokens[directionReference.nextIndex + 1], 'to')
      || !isTokenValue(tokens[directionReference.nextIndex + 2], 'somewhere')
      || !isTokenValue(tokens[directionReference.nextIndex + 3], 'else')
      || directionReference.nextIndex + 4 !== tokens.length
    ) {
      return null;
    }

    return {
      kind: 'create-pseudo-room' as const,
      pseudoKind: 'elsewhere' as const,
      sourceRoom: directionReference.sourceRoom,
      sourceDirection: directionReference.sourceDirection,
    };
  };

  if (isTokenValue(tokens[0], 'the') && isTokenValue(tokens[1], 'room')) {
    return parseUnknownOrConnect(2);
  }

  if (isTokenValue(tokens[0], 'the') && isTokenValue(tokens[1], 'way')) {
    return parseInfinite(2) ?? parseDeath(2) ?? parseNowhere(2) ?? parseElsewhere(2);
  }

  return parseUnknownOrConnect(0) ?? parseInfinite(0) ?? parseDeath(0) ?? parseNowhere(0) ?? parseElsewhere(0);
}

function parseConnectTail(tokens: readonly Token[], startIndex: number): ParsedConnectTail | null {
  const sourceRoom = readRoomName(tokens, startIndex, isDirectionToken);
  if (sourceRoom === null) {
    return null;
  }
  return parseConnectTailFromSourceReference(tokens, sourceRoom.nextIndex, sourceRoom.reference);
}

function trimLeadingConjunction(tokens: readonly Token[]): readonly Token[] {
  if (tokens.length > 0 && isTokenValue(tokens[0], 'and')) {
    return tokens.slice(1);
  }

  return tokens;
}

function parseItemNameList(tokens: readonly Token[]): readonly string[] | null {
  if (tokens.length === 0) {
    return null;
  }

  const itemNames: string[] = [];
  let segmentStart = 0;

  for (let index = 0; index <= tokens.length; index += 1) {
    const isBoundary = index === tokens.length || isCommaToken(tokens[index]);
    if (!isBoundary) {
      continue;
    }

    const segmentTokens = trimLeadingConjunction(tokens.slice(segmentStart, index));
    if (segmentTokens.length === 0) {
      return null;
    }

    const itemName = normalizeCliWhitespace(segmentTokens.map((token) => token.value).join(' '));
    if (itemName.length === 0) {
      return null;
    }
    if (itemName.toLowerCase() === 'all') {
      return null;
    }

    itemNames.push(itemName);
    segmentStart = index + 1;
  }

  return itemNames;
}

function parseItemTransferCommand(
  tokens: readonly Token[],
  kind: 'put-items' | 'take-items',
  preposition: 'in' | 'from',
): Extract<CliCommand, { kind: 'put-items' | 'take-items' }> | null {
  const prepositionIndex = tokens.findIndex((token, index) => index > 0 && isTokenValue(token, preposition));
  if (prepositionIndex <= 1) {
    return null;
  }

  const itemNames = parseItemNameList(tokens.slice(1, prepositionIndex));
  if (itemNames === null || itemNames.length === 0) {
    return null;
  }

  const room = readRoomName(tokens, prepositionIndex + 1, () => false);
  if (room === null || room.nextIndex !== tokens.length) {
    return null;
  }

  return {
    kind,
    itemNames,
    room: room.reference,
  };
}

function formatCliList(values: readonly string[]): string {
  if (values.length === 0) {
    return '';
  }

  if (values.length === 1) {
    return values[0];
  }

  if (values.length === 2) {
    return `${values[0]} and ${values[1]}`;
  }

  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`;
}

function parseCreateRelativeCommand(tokens: readonly Token[]): Extract<CliCommand, { kind: 'create-and-connect' }> | null {
  const commaIndex = tokens.findIndex((token, index) => index > 1 && isCommaToken(token));
  if (commaIndex !== -1) {
    const sourceRoom = readRoomName(tokens, 1, (token) => token === tokens[commaIndex]);
    if (sourceRoom === null || sourceRoom.nextIndex !== commaIndex) {
      return null;
    }

    const adjectiveClause = parseWhichIsAdjectiveClause(tokens, commaIndex + 1);
    if (adjectiveClause === null || !isCommaToken(tokens[adjectiveClause.nextIndex])) {
      return null;
    }

    const index = adjectiveClause.nextIndex + 1;
    if (isTokenValue(tokens[index], 'above') || isTokenValue(tokens[index], 'below')) {
      const targetRoom = readRoomName(tokens, index + 1, () => false);
      if (targetRoom === null || targetRoom.nextIndex !== tokens.length) {
        return null;
      }

      return {
        kind: 'create-and-connect',
        sourceRoomName: sourceRoom.reference.text,
        adjective: adjectiveClause.adjective,
        sourceDirection: isTokenValue(tokens[index], 'above') ? 'down' : 'up',
        targetRoom: targetRoom.reference,
        targetDirection: isTokenValue(tokens[index], 'above') ? 'up' : 'down',
        oneWay: false,
      };
    }

    if (!isDirectionToken(tokens[index]) || !isTokenValue(tokens[index + 1], 'of')) {
      return null;
    }

    const relationDirection = normalizeDirection(tokens[index]!.value);
    const sourceDirection = oppositeDirection(relationDirection);
    if (sourceDirection === null || sourceDirection === undefined) {
      return null;
    }

    const targetRoom = readRoomName(tokens, index + 2, () => false);
    if (targetRoom === null || targetRoom.nextIndex !== tokens.length) {
      return null;
    }

    return {
      kind: 'create-and-connect',
      sourceRoomName: sourceRoom.reference.text,
      adjective: adjectiveClause.adjective,
      sourceDirection,
      targetRoom: targetRoom.reference,
      targetDirection: relationDirection,
      oneWay: false,
    };
  }

  const aboveBelowIndex = tokens.findIndex((token, index) =>
    index > 1 && !token.quoted && (isTokenValue(token, 'above') || isTokenValue(token, 'below')),
  );
  if (aboveBelowIndex !== -1) {
    const sourceRoom = readRoomName(tokens, 1, (token) => token === tokens[aboveBelowIndex]);
    if (sourceRoom === null || sourceRoom.nextIndex !== aboveBelowIndex) {
      return null;
    }

    const targetRoom = readRoomName(tokens, aboveBelowIndex + 1, () => false);
    if (targetRoom === null || targetRoom.nextIndex !== tokens.length) {
      return null;
    }

    return {
      kind: 'create-and-connect',
      sourceRoomName: sourceRoom.reference.text,
      adjective: null,
      sourceDirection: isTokenValue(tokens[aboveBelowIndex], 'above') ? 'down' : 'up',
      targetRoom: targetRoom.reference,
      targetDirection: isTokenValue(tokens[aboveBelowIndex], 'above') ? 'up' : 'down',
      oneWay: false,
    };
  }

  const relationDirectionIndex = tokens.findIndex((token, index) =>
    index > 1 && isDirectionToken(token) && isTokenValue(tokens[index + 1], 'of'),
  );
  if (relationDirectionIndex === -1) {
    return null;
  }

  const sourceRoom = readRoomName(tokens, 1, (token) => token === tokens[relationDirectionIndex]);
  if (sourceRoom === null) {
    return null;
  }

  const relationDirectionToken = tokens[relationDirectionIndex];
  if (!isDirectionToken(relationDirectionToken)) {
    return null;
  }

  const relationDirection = normalizeDirection(relationDirectionToken.value);
  const sourceDirection = oppositeDirection(relationDirection);
  if (sourceDirection === null || sourceDirection === undefined) {
    return null;
  }

  const targetRoom = readRoomName(tokens, relationDirectionIndex + 2, () => false);
  if (targetRoom === null || targetRoom.nextIndex !== tokens.length) {
    return null;
  }

  return {
    kind: 'create-and-connect',
    sourceRoomName: sourceRoom.reference.text,
    adjective: null,
    sourceDirection,
    targetRoom: targetRoom.reference,
    targetDirection: relationDirection,
    oneWay: false,
  };
}

function parseCreateAndConnectCommand(tokens: readonly Token[]): Extract<CliCommand, { kind: 'create-and-connect' }> | null {
  const sourceRoom = readRoomName(tokens, 3, (token) => isCommaToken(token) || isDirectionToken(token));
  if (sourceRoom === null) {
    return null;
  }

  let adjective: CliRoomAdjective | null = null;
  let index = sourceRoom.nextIndex;
  if (isCommaToken(tokens[index])) {
    const adjectiveClause = parseWhichIsAdjectiveClause(tokens, index + 1);
    if (adjectiveClause === null || !isCommaToken(tokens[adjectiveClause.nextIndex])) {
      return null;
    }
    adjective = adjectiveClause.adjective;
    index = adjectiveClause.nextIndex + 1;
  }

  const tail = parseConnectTailFromSourceReference(tokens, index, sourceRoom.reference);
  if (tail === null) {
    return null;
  }

  return {
    kind: 'create-and-connect',
    sourceRoomName: tail.sourceRoom.text,
    adjective,
    sourceDirection: tail.sourceDirection,
    targetRoom: tail.targetRoom,
    targetDirection: tail.targetDirection,
    oneWay: tail.oneWay,
  };
}

function parseCreateCommand(tokens: readonly Token[]): Extract<CliCommand, { kind: 'create' }> | null {
  const roomName = readRoomName(tokens, 1, isCommaToken);
  if (roomName === null) {
    return null;
  }

  if (roomName.nextIndex === tokens.length) {
    return {
      kind: 'create',
      roomName: roomName.reference.text,
      adjective: null,
    };
  }

  if (!isCommaToken(tokens[roomName.nextIndex])) {
    return null;
  }

  const adjectiveClause = parseWhichIsAdjectiveClause(tokens, roomName.nextIndex + 1);
  if (adjectiveClause === null || adjectiveClause.nextIndex !== tokens.length) {
    return null;
  }

  return {
    kind: 'create',
    roomName: roomName.reference.text,
    adjective: adjectiveClause.adjective,
  };
}

function parseConnectionAnnotationCommand(
  tokens: readonly Token[],
): Extract<CliCommand, { kind: 'set-connection-annotation' }> | null {
  const isIndex = tokens.findIndex((token, index) => index > 1 && isTokenValue(token, 'is'));
  if (isIndex === -1) {
    return null;
  }

  const toIndex = tokens.findIndex((token, index) => index > 0 && index < isIndex && isTokenValue(token, 'to'));
  if (toIndex === -1) {
    return null;
  }

  const sourceRoom = readRoomName(tokens, 0, (token) => token === tokens[toIndex]);
  if (sourceRoom === null || sourceRoom.nextIndex !== toIndex) {
    return null;
  }

  const targetRoom = readRoomName(tokens, toIndex + 1, (token) => token === tokens[isIndex]);
  if (targetRoom === null || targetRoom.nextIndex !== isIndex) {
    return null;
  }

  const tailTokens = tokens.slice(isIndex + 1).map((token) => token.value.toLowerCase());
  if (tailTokens.length === 1 && tailTokens[0] === 'clear') {
    return {
      kind: 'set-connection-annotation',
      sourceRoom: sourceRoom.reference,
      targetRoom: targetRoom.reference,
      annotation: null,
    };
  }

  if ((tailTokens.length === 1 && tailTokens[0] === 'door') || (tailTokens.length === 2 && tailTokens[0] === 'a' && tailTokens[1] === 'door')) {
    return {
      kind: 'set-connection-annotation',
      sourceRoom: sourceRoom.reference,
      targetRoom: targetRoom.reference,
      annotation: 'door',
    };
  }

  if (
    (tailTokens.length === 1 && tailTokens[0] === 'locked')
    || (tailTokens.length === 2 && tailTokens[0] === 'locked' && tailTokens[1] === 'door')
    || (tailTokens.length === 3 && tailTokens[0] === 'a' && tailTokens[1] === 'locked' && tailTokens[2] === 'door')
  ) {
    return {
      kind: 'set-connection-annotation',
      sourceRoom: sourceRoom.reference,
      targetRoom: targetRoom.reference,
      annotation: 'locked door',
    };
  }

  return null;
}

function parseDisconnectCommand(tokens: readonly Token[]): Extract<CliCommand, { kind: 'disconnect' }> | null {
  if (!isTokenValue(tokens[0], 'disconnect')) {
    return null;
  }

  const fromIndex = tokens.findIndex((token, index) => index > 0 && isTokenValue(token, 'from'));
  if (fromIndex === -1) {
    return null;
  }

  let sourceDirection: string | null = null;
  let sourceRoom: ReturnType<typeof readRoomName> = null;
  const possibleDirectionToken = tokens[fromIndex - 1];
  if (fromIndex > 1 && isDirectionToken(possibleDirectionToken)) {
    sourceRoom = readRoomName(tokens, 1, (token) => token === possibleDirectionToken);
    if (sourceRoom !== null && sourceRoom.nextIndex === fromIndex - 1) {
      sourceDirection = normalizeDirection(possibleDirectionToken.value);
    } else {
      sourceRoom = null;
    }
  }

  if (sourceRoom === null) {
    sourceRoom = readRoomName(tokens, 1, (token) => token === tokens[fromIndex]);
    if (sourceRoom !== null && sourceRoom.nextIndex !== fromIndex) {
      sourceRoom = null;
    }
  }

  if (sourceRoom === null) {
    return null;
  }

  const targetRoom = readRoomName(tokens, fromIndex + 1, () => false);
  if (targetRoom === null || targetRoom.nextIndex !== tokens.length) {
    return null;
  }

  return {
    kind: 'disconnect',
    sourceRoom: sourceRoom.reference,
    sourceDirection,
    targetRoom: targetRoom.reference,
  };
}

function parseSelectedRoomRelativeConnectCommand(
  tokens: readonly Token[],
): Extract<CliCommand, { kind: 'selected-room-relative-connect' }> | null {
  if (tokens.length < 3 || !isTokenValue(tokens[1], 'is')) {
    return null;
  }

  const directionToken = tokens[0];
  if (!isDirectionToken(directionToken) && !isTokenValue(directionToken, 'above') && !isTokenValue(directionToken, 'below')) {
    return null;
  }

  if (tokens.length === 3 && parseRoomAdjective(tokens[2]) !== null) {
    return null;
  }

  const targetRoom = readRoomName(tokens, 2, () => false);
  if (targetRoom === null || targetRoom.nextIndex !== tokens.length) {
    return null;
  }

  return {
    kind: 'selected-room-relative-connect',
    sourceRoom: null,
    sourceDirection: isTokenValue(directionToken, 'above')
      ? 'up'
      : isTokenValue(directionToken, 'below')
        ? 'down'
        : normalizeDirection(directionToken!.value),
    targetRoom: targetRoom.reference,
  };
}

export function parseCliCommand(input: string): CliCommand | null {
  const normalized = normalizeCliWhitespace(input);
  if (normalized.length === 0) {
    return null;
  }

  const tokens = tokenizeCliInput(normalized);
  if (tokens === null || tokens.length === 0) {
    return null;
  }

  if (tokens.length === 1 && isTokenValue(tokens[0], 'undo')) {
    return { kind: 'undo' };
  }

  if (tokens.length === 1 && isTokenValue(tokens[0], 'redo')) {
    return { kind: 'redo' };
  }

  if (isFirstWordAlias(tokens[0], 'help', 'h')) {
    if (tokens.length === 1) {
      return { kind: 'help', topic: null };
    }

    if (tokens.length === 2) {
      const topic = parseCliHelpTopic(tokens[1].value);
      return topic === null ? null : { kind: 'help', topic };
    }

    return null;
  }

  if (tokens.length === 1 && (isFirstWordAlias(tokens[0], 'arrange', 'arr') || isTokenValue(tokens[0], 'prettify'))) {
    return { kind: 'arrange' };
  }

  if (
    (tokens.length === 2 && isTokenValue(tokens[0], 'choose') && isTokenValue(tokens[1], 'game'))
    || (tokens.length === 3 && isTokenValue(tokens[0], 'choose') && isTokenValue(tokens[1], 'a') && isTokenValue(tokens[2], 'game'))
  ) {
    return { kind: 'choose-game' };
  }

  if (
    tokens.length === 2
    && isTokenValue(tokens[0], 'zoom')
    && (isTokenValue(tokens[1], 'in') || isTokenValue(tokens[1], 'out') || isTokenValue(tokens[1], 'reset'))
  ) {
    return {
      kind: 'zoom',
      mode: isTokenValue(tokens[1], 'reset') ? 'reset' : 'relative',
      direction: isTokenValue(tokens[1], 'in')
        ? 'in'
        : isTokenValue(tokens[1], 'out')
          ? 'out'
          : undefined,
    };
  }

  if (tokens.length === 2 && isTokenValue(tokens[0], 'zoom')) {
    const zoomPercent = parseZoomPercentToken(tokens[1]);
    if (zoomPercent !== null) {
      return {
        kind: 'zoom',
        mode: 'absolute',
        zoomPercent,
      };
    }
  }

  if (tokens.length === 1 && isDirectionToken(tokens[0])) {
    return {
      kind: 'navigate',
      direction: normalizeDirection(tokens[0].value),
    };
  }

  if (tokens.length === 2 && isTokenValue(tokens[0], 'go') && isDirectionToken(tokens[1])) {
    return {
      kind: 'navigate',
      direction: normalizeDirection(tokens[1].value),
    };
  }

  const pseudoRoomCommand = parsePseudoRoomCommand(tokens);
  if (pseudoRoomCommand !== null) {
    return pseudoRoomCommand;
  }

  if (isFirstWordAlias(tokens[0], 'create', 'c') && isTokenValue(tokens[1], 'and') && isFirstWordAlias(tokens[2], 'connect', 'con')) {
    const createAndConnectCommand = parseCreateAndConnectCommand(tokens);
    if (createAndConnectCommand === null) {
      return null;
    }

    return createAndConnectCommand;
  }

  if (isFirstWordAlias(tokens[0], 'create', 'c')) {
    const relativeCommand = parseCreateRelativeCommand(tokens);
    if (relativeCommand !== null) {
      return relativeCommand;
    }
  }

  if (isFirstWordAlias(tokens[0], 'connect', 'con')) {
    const tail = parseConnectTail(tokens, 1);
    if (tail === null) {
      return null;
    }

    return {
      kind: 'connect',
      ...tail,
    };
  }

  const disconnectCommand = parseDisconnectCommand(tokens);
  if (disconnectCommand !== null) {
    return disconnectCommand;
  }

  if (isFirstWordAlias(tokens[0], 'create', 'c')) {
    return parseCreateCommand(tokens);
  }

  if (isFirstWordAlias(tokens[0], 'put', 'drop')) {
    return parseItemTransferCommand(tokens, 'put-items', 'in');
  }

  if (isFirstWordAlias(tokens[0], 'take', 'get')) {
    if (isTokenValue(tokens[1], 'all') && isTokenValue(tokens[2], 'from')) {
      const room = readRoomName(tokens, 3, () => false);
      if (room === null || room.nextIndex !== tokens.length) {
        return null;
      }

      return {
        kind: 'take-all-items',
        room: room.reference,
      };
    }

    return parseItemTransferCommand(tokens, 'take-items', 'from');
  }

  if (isFirstWordAlias(tokens[0], 'delete', 'd', 'del')) {
    const roomName = readRoomName(tokens, 1, () => false);
    if (roomName === null || roomName.nextIndex !== tokens.length) {
      return null;
    }

    return {
      kind: 'delete',
      room: roomName.reference,
    };
  }

  if (isFirstWordAlias(tokens[0], 'edit', 'e', 'ed')) {
    const roomName = readRoomName(tokens, 1, () => false);
    if (roomName === null || roomName.nextIndex !== tokens.length) {
      return null;
    }

    return {
      kind: 'edit',
      room: roomName.reference,
    };
  }

  if (isTokenValue(tokens[0], 'describe')) {
    if (tokens.length === 1) {
      return {
        kind: 'describe',
        room: null,
      };
    }

    const roomName = readRoomName(tokens, 1, () => false);
    if (roomName === null || roomName.nextIndex !== tokens.length) {
      return null;
    }

    return {
      kind: 'describe',
      room: roomName.reference,
    };
  }

  if (isFirstWordAlias(tokens[0], 'show', 'select', 's')) {
    const roomName = readRoomName(tokens, 1, () => false);
    if (roomName === null || roomName.nextIndex !== tokens.length) {
      return null;
    }

    return {
      kind: 'show',
      room: roomName.reference,
    };
  }

  if (isTokenValue(tokens[0], 'go') && isTokenValue(tokens[1], 'to')) {
    const roomName = readRoomName(tokens, 2, () => false);
    if (roomName === null || roomName.nextIndex !== tokens.length) {
      return null;
    }

    return {
      kind: 'show',
      room: roomName.reference,
    };
  }

  const connectionAnnotationCommand = parseConnectionAnnotationCommand(tokens);
  if (connectionAnnotationCommand !== null) {
    return connectionAnnotationCommand;
  }

  const selectedRoomRelativeConnectCommand = parseSelectedRoomRelativeConnectCommand(tokens);
  if (selectedRoomRelativeConnectCommand !== null) {
    return selectedRoomRelativeConnectCommand;
  }

  const lightingRoom = readRoomName(tokens, 0, (token) => isTokenValue(token, 'is'));
  if (
    lightingRoom !== null
    && isTokenValue(tokens[lightingRoom.nextIndex], 'is')
    && lightingRoom.nextIndex + 2 === tokens.length
  ) {
    const adjective = parseRoomAdjective(tokens[lightingRoom.nextIndex + 1]);
    if (adjective !== null) {
      return {
        kind: 'set-room-adjective',
        room: lightingRoom.reference,
        adjective,
      };
    }
  }

  if (isFirstWordAlias(tokens[0], 'notate', 'annotate', 'ann')) {
    const withIndex = tokens.findIndex((token, index) => index > 0 && isTokenValue(token, 'with'));
    if (withIndex === -1) {
      return null;
    }

    const roomName = withIndex === 1
      ? null
      : readRoomName(tokens, 1, (token) => token === tokens[withIndex]);
    if (withIndex > 1 && (roomName === null || roomName.nextIndex !== withIndex)) {
      return null;
    }

    const noteText = readRoomName(tokens, withIndex + 1, () => false);
    if (noteText === null || noteText.nextIndex !== tokens.length) {
      return null;
    }

    return {
      kind: 'notate',
      room: roomName?.reference ?? null,
      noteText: noteText.reference.text,
    };
  }

  return null;
}

function describeCliCommand(command: CliCommand): string {
  switch (command.kind) {
    case 'help':
      return command.topic === null
        ? 'list the available CLI help topics'
        : `show CLI help for ${command.topic}`;
    case 'arrange':
      return 'rearrange the map layout';
    case 'choose-game':
      return 'open the game chooser';
    case 'zoom':
      if (command.mode === 'relative') {
        return command.direction === 'in' ? 'zoom the map in' : 'zoom the map out';
      }

      if (command.mode === 'reset') {
        return 'reset the map zoom to 1:1';
      }

      return `set the map zoom to ${command.zoomPercent}%`;
    case 'navigate':
      return `move in the selected room's ${command.direction} direction`;
    case 'create':
      return command.adjective === null
        ? `create a room called ${command.roomName}`
        : `create a room called ${command.roomName} and mark it as ${command.adjective.text}`;
    case 'put-items':
      return `put ${formatCliList(command.itemNames)} in ${command.room.text}`;
    case 'take-items':
      return `take ${formatCliList(command.itemNames)} from ${command.room.text}`;
    case 'take-all-items':
      return `take all from ${command.room.text}`;
    case 'delete':
      return `delete the room called ${command.room.text}`;
    case 'create-pseudo-room':
      if (command.sourceRoom === null) {
        if (command.pseudoKind === 'unknown') {
          return `mark the ${command.sourceDirection} exit from the selected room as unknown`;
        }
        if (command.pseudoKind === 'infinite') {
          return `mark the ${command.sourceDirection} exit from the selected room as going on forever`;
        }
        if (command.pseudoKind === 'death') {
          return `mark the ${command.sourceDirection} exit from the selected room as death`;
        }
        if (command.pseudoKind === 'nowhere') {
          return `mark the ${command.sourceDirection} exit from the selected room as leading nowhere`;
        }
        return `mark the ${command.sourceDirection} exit from the selected room as leading to somewhere else`;
      }
      if (command.pseudoKind === 'unknown') {
        return `mark the ${command.sourceDirection} exit from ${command.sourceRoom.text} as unknown`;
      }
      if (command.pseudoKind === 'infinite') {
        return `mark the ${command.sourceDirection} exit from ${command.sourceRoom.text} as going on forever`;
      }
      if (command.pseudoKind === 'death') {
        return `mark the ${command.sourceDirection} exit from ${command.sourceRoom.text} as death`;
      }
      if (command.pseudoKind === 'elsewhere') {
        return `mark the ${command.sourceDirection} exit from ${command.sourceRoom.text} as leading to somewhere else`;
      }
      return `mark the ${command.sourceDirection} exit from ${command.sourceRoom.text} as leading nowhere`;
    case 'edit':
      return `open the room editor for ${command.room.text}`;
    case 'describe':
      return command.room === null
        ? 'describe the exits from the selected room'
        : `describe the exits from ${command.room.text}`;
    case 'show':
      return `scroll the map to ${command.room.text}`;
    case 'set-room-adjective':
      return `mark ${command.room.text} as ${command.adjective.text}`;
    case 'selected-room-relative-connect':
      return command.sourceRoom === null
        ? `connect the selected room going ${command.sourceDirection} to ${command.targetRoom.text}, creating it if needed`
        : `connect ${command.sourceRoom.text} going ${command.sourceDirection} to ${command.targetRoom.text}, creating it if needed`;
    case 'set-connection-annotation':
      if (command.annotation === 'door') {
        return `mark all connections between ${command.sourceRoom.text} and ${command.targetRoom.text} as doors`;
      }
      if (command.annotation === 'locked door') {
        return `mark all connections between ${command.sourceRoom.text} and ${command.targetRoom.text} as locked doors`;
      }
      return `clear all connection annotations between ${command.sourceRoom.text} and ${command.targetRoom.text}`;
    case 'notate':
      return command.room === null
        ? `create a sticky note on the selected room saying ${command.noteText}`
        : `create a sticky note on ${command.room.text} saying ${command.noteText}`;
    case 'undo':
      return 'undo the previous command';
    case 'redo':
      return 'redo the previous command';
    case 'connect':
      if (command.oneWay) {
        return `create a one-way connection from ${command.sourceRoom.text} going ${command.sourceDirection} to ${command.targetRoom.text}`;
      }

      return `create a two-way connection from ${command.sourceRoom.text} going ${command.sourceDirection} to ${command.targetRoom.text} going ${command.targetDirection}`;
    case 'disconnect':
      return command.sourceDirection === null
        ? `delete the connection between ${command.sourceRoom.text} and ${command.targetRoom.text}`
        : `delete the connection from ${command.sourceRoom.text} going ${command.sourceDirection} to ${command.targetRoom.text}`;
    case 'create-and-connect':
      if (command.oneWay) {
        const prefix = command.adjective === null
          ? `create a room called ${command.sourceRoomName}`
          : `create a room called ${command.sourceRoomName} and mark it as ${command.adjective.text}`;
        return `${prefix} and create a one-way connection from ${command.sourceRoomName} going ${command.sourceDirection} to ${command.targetRoom.text}`;
      }

      {
        const prefix = command.adjective === null
          ? `create a room called ${command.sourceRoomName}`
          : `create a room called ${command.sourceRoomName} and mark it as ${command.adjective.text}`;
        return `${prefix} and create a two-way connection from ${command.sourceRoomName} going ${command.sourceDirection} to ${command.targetRoom.text} going ${command.targetDirection}`;
      }
  }
}

export function parseCliCommandDescription(input: string): string | null {
  const command = parseCliCommand(input);
  return command === null ? null : describeCliCommand(command);
}
