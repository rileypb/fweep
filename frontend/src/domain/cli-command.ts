import { normalizeDirection, oppositeDirection } from './directions';

export type CliCommand =
  | { readonly kind: 'create'; readonly roomName: string }
  | { readonly kind: 'delete'; readonly roomName: string }
  | { readonly kind: 'edit'; readonly roomName: string }
  | { readonly kind: 'show'; readonly roomName: string }
  | { readonly kind: 'notate'; readonly roomName: string; readonly noteText: string }
  | {
    readonly kind: 'connect';
    readonly sourceRoomName: string;
    readonly sourceDirection: string;
    readonly targetRoomName: string;
    readonly targetDirection: string | null;
    readonly oneWay: boolean;
  }
  | {
    readonly kind: 'create-and-connect';
    readonly sourceRoomName: string;
    readonly sourceDirection: string;
    readonly targetRoomName: string;
    readonly targetDirection: string | null;
    readonly oneWay: boolean;
  }
  | { readonly kind: 'undo' }
  | { readonly kind: 'redo' };

interface Token {
  readonly value: string;
  readonly quoted: boolean;
}

const DIRECTION_WORDS = new Set([
  'north',
  'south',
  'east',
  'west',
  'up',
  'down',
  'in',
  'out',
  'southwest',
  'southeast',
  'northwest',
  'northeast',
]);

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
    while (index < input.length && input[index] !== ' ') {
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

function isDirectionToken(token: Token | undefined): boolean {
  return token !== undefined && !token.quoted && DIRECTION_WORDS.has(normalizeDirection(token.value));
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

function readRoomName(tokens: readonly Token[], startIndex: number, stopAt: (token: Token) => boolean): { value: string; nextIndex: number } | null {
  const parts: string[] = [];
  let index = startIndex;

  while (index < tokens.length && !stopAt(tokens[index])) {
    parts.push(tokens[index].value);
    index += 1;
  }

  if (parts.length === 0) {
    return null;
  }

  return {
    value: normalizeCliWhitespace(parts.join(' ')),
    nextIndex: index,
  };
}

function parseConnectTail(tokens: readonly Token[], startIndex: number): Omit<Extract<CliCommand, { kind: 'connect' | 'create-and-connect' }>, 'kind'> | null {
  const sourceRoom = readRoomName(tokens, startIndex, isDirectionToken);
  if (sourceRoom === null) {
    return null;
  }

  const sourceDirectionToken = tokens[sourceRoom.nextIndex];
  if (!isDirectionToken(sourceDirectionToken)) {
    return null;
  }

  const sourceDirection = normalizeDirection(sourceDirectionToken.value);
  let index = sourceRoom.nextIndex + 1;

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
      sourceRoomName: sourceRoom.value,
      sourceDirection,
      targetRoomName: targetRoom.value,
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
    sourceRoomName: sourceRoom.value,
    sourceDirection,
    targetRoomName: targetRoom.value,
    targetDirection: targetDirection ?? oppositeDirection(sourceDirection) ?? null,
    oneWay: false,
  };
}

function parseCreateRelativeCommand(tokens: readonly Token[]): Extract<CliCommand, { kind: 'create-and-connect' }> | null {
  const aboveBelowIndex = tokens.findIndex((token, index) =>
    index > 0 && !token.quoted && (isTokenValue(token, 'above') || isTokenValue(token, 'below')),
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
      sourceRoomName: sourceRoom.value,
      sourceDirection: isTokenValue(tokens[aboveBelowIndex], 'above') ? 'down' : 'up',
      targetRoomName: targetRoom.value,
      targetDirection: isTokenValue(tokens[aboveBelowIndex], 'above') ? 'up' : 'down',
      oneWay: false,
    };
  }

  const sourceRoom = readRoomName(tokens, 1, isDirectionToken);
  if (sourceRoom === null) {
    return null;
  }

  const relationDirectionToken = tokens[sourceRoom.nextIndex];
  if (!isDirectionToken(relationDirectionToken)) {
    return null;
  }

  const relationDirection = normalizeDirection(relationDirectionToken.value);
  const sourceDirection = oppositeDirection(relationDirection);
  if (sourceDirection === null || sourceDirection === undefined) {
    return null;
  }

  const ofIndex = sourceRoom.nextIndex + 1;
  if (!isTokenValue(tokens[ofIndex], 'of')) {
    return null;
  }

  const targetRoom = readRoomName(tokens, ofIndex + 1, () => false);
  if (targetRoom === null || targetRoom.nextIndex !== tokens.length) {
    return null;
  }

  return {
    kind: 'create-and-connect',
    sourceRoomName: sourceRoom.value,
    sourceDirection,
    targetRoomName: targetRoom.value,
    targetDirection: relationDirection,
    oneWay: false,
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

  if (isTokenValue(tokens[0], 'create') && isTokenValue(tokens[1], 'and') && isTokenValue(tokens[2], 'connect')) {
    const tail = parseConnectTail(tokens, 3);
    if (tail === null) {
      return null;
    }

    return {
      kind: 'create-and-connect',
      ...tail,
    };
  }

  if (isTokenValue(tokens[0], 'create')) {
    const relativeCommand = parseCreateRelativeCommand(tokens);
    if (relativeCommand !== null) {
      return relativeCommand;
    }
  }

  if (isTokenValue(tokens[0], 'connect')) {
    const tail = parseConnectTail(tokens, 1);
    if (tail === null) {
      return null;
    }

    return {
      kind: 'connect',
      ...tail,
    };
  }

  if (isTokenValue(tokens[0], 'create')) {
    const roomName = readRoomName(tokens, 1, () => false);
    if (roomName === null || roomName.nextIndex !== tokens.length) {
      return null;
    }

    return {
      kind: 'create',
      roomName: roomName.value,
    };
  }

  if (isTokenValue(tokens[0], 'delete')) {
    const roomName = readRoomName(tokens, 1, () => false);
    if (roomName === null || roomName.nextIndex !== tokens.length) {
      return null;
    }

    return {
      kind: 'delete',
      roomName: roomName.value,
    };
  }

  if (isTokenValue(tokens[0], 'edit')) {
    const roomName = readRoomName(tokens, 1, () => false);
    if (roomName === null || roomName.nextIndex !== tokens.length) {
      return null;
    }

    return {
      kind: 'edit',
      roomName: roomName.value,
    };
  }

  if (isTokenValue(tokens[0], 'show')) {
    const roomName = readRoomName(tokens, 1, () => false);
    if (roomName === null || roomName.nextIndex !== tokens.length) {
      return null;
    }

    return {
      kind: 'show',
      roomName: roomName.value,
    };
  }

  if (isTokenValue(tokens[0], 'notate') || isTokenValue(tokens[0], 'annotate')) {
    const withIndex = tokens.findIndex((token, index) => index > 0 && isTokenValue(token, 'with'));
    if (withIndex === -1) {
      return null;
    }

    const roomName = readRoomName(tokens, 1, (token) => token === tokens[withIndex]);
    if (roomName === null || roomName.nextIndex !== withIndex) {
      return null;
    }

    const noteText = readRoomName(tokens, withIndex + 1, () => false);
    if (noteText === null || noteText.nextIndex !== tokens.length) {
      return null;
    }

    return {
      kind: 'notate',
      roomName: roomName.value,
      noteText: noteText.value,
    };
  }

  return null;
}

function describeCliCommand(command: CliCommand): string {
  switch (command.kind) {
    case 'create':
      return `create a room called ${command.roomName}`;
    case 'delete':
      return `delete the room called ${command.roomName}`;
    case 'edit':
      return `open the room editor for ${command.roomName}`;
    case 'show':
      return `scroll the map to ${command.roomName}`;
    case 'notate':
      return `create a sticky note on ${command.roomName} saying ${command.noteText}`;
    case 'undo':
      return 'undo the previous command';
    case 'redo':
      return 'redo the previous command';
    case 'connect':
      if (command.oneWay) {
        return `create a one-way connection from ${command.sourceRoomName} going ${command.sourceDirection} to ${command.targetRoomName}`;
      }

      return `create a two-way connection from ${command.sourceRoomName} going ${command.sourceDirection} to ${command.targetRoomName} going ${command.targetDirection}`;
    case 'create-and-connect':
      if (command.oneWay) {
        return `create a room called ${command.sourceRoomName} and create a one-way connection from ${command.sourceRoomName} going ${command.sourceDirection} to ${command.targetRoomName}`;
      }

      return `create a room called ${command.sourceRoomName} and create a two-way connection from ${command.sourceRoomName} going ${command.sourceDirection} to ${command.targetRoomName} going ${command.targetDirection}`;
  }
}

export function parseCliCommandDescription(input: string): string | null {
  const command = parseCliCommand(input);
  return command === null ? null : describeCliCommand(command);
}
