import type { MapDocument, Position, Room } from './map-types';

const GRID_SIZE = 40;
const CLI_ROOM_OFFSET_CELLS = 2;

export interface CreateRoomCliPlan {
  readonly roomName: string;
  readonly position: Position;
}

export type CliRoomMatch =
  | { readonly kind: 'pronoun-unbound' }
  | { readonly kind: 'none' }
  | { readonly kind: 'one'; readonly room: Room }
  | { readonly kind: 'multiple'; readonly rooms: readonly Room[] };

function normalizeCliName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

function tokenizeCliNameWords(name: string): string[] {
  return normalizeCliName(name)
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
}

function getCliNameWordSet(name: string): Set<string> {
  return new Set(tokenizeCliNameWords(name));
}

export function isCliPronounReference(requestedName: string): boolean {
  return normalizeCliName(requestedName) === 'it';
}

export function findRoomsByCliName(doc: MapDocument, requestedName: string): readonly Room[] {
  return findRoomsByCliNameWithMode(doc, requestedName, false);
}

function findRoomsByCliNameWithMode(doc: MapDocument, requestedName: string, exact: boolean): readonly Room[] {
  if (exact) {
    const normalizedRequestedName = normalizeCliName(requestedName);
    if (normalizedRequestedName.length === 0) {
      return [];
    }

    return Object.values(doc.rooms).filter((room) => normalizeCliName(room.name) === normalizedRequestedName);
  }

  const requestedWordSet = getCliNameWordSet(requestedName);
  if (requestedWordSet.size === 0) {
    return [];
  }

  return Object.values(doc.rooms).filter((room) => {
    const roomWordSet = getCliNameWordSet(room.name);
    return [...requestedWordSet].every((requestedWord) => roomWordSet.has(requestedWord));
  });
}

export function resolveRoomByCliName(doc: MapDocument, requestedName: string, exact = false): CliRoomMatch {
  const matches = findRoomsByCliNameWithMode(doc, requestedName, exact);
  if (matches.length === 0) {
    return { kind: 'none' };
  }
  if (matches.length === 1) {
    return { kind: 'one', room: matches[0] };
  }

  return { kind: 'multiple', rooms: matches };
}

export function resolveRoomByCliReference(
  doc: MapDocument,
  requestedName: string,
  exact: boolean,
  pronounRoomId: string | null,
): CliRoomMatch {
  if (!isCliPronounReference(requestedName)) {
    return resolveRoomByCliName(doc, requestedName, exact);
  }

  if (pronounRoomId === null) {
    return { kind: 'pronoun-unbound' };
  }

  const room = doc.rooms[pronounRoomId];
  return room ? { kind: 'one', room } : { kind: 'pronoun-unbound' };
}

function getExistingRoomNames(doc: MapDocument): Set<string> {
  return new Set(Object.values(doc.rooms).map((room) => normalizeCliName(room.name)));
}

function resolveUniqueRoomName(doc: MapDocument, requestedName: string): string {
  const normalizedRequestedName = normalizeCliName(requestedName);
  const existingNames = getExistingRoomNames(doc);
  if (!existingNames.has(normalizedRequestedName)) {
    return requestedName;
  }

  let index = 2;
  while (existingNames.has(normalizeCliName(`${requestedName} ${index}`))) {
    index += 1;
  }

  return `${requestedName} ${index}`;
}

function getMostRecentlyCreatedRoom(doc: MapDocument): Room | null {
  const rooms = Object.values(doc.rooms);
  return rooms.length === 0 ? null : rooms[rooms.length - 1];
}

function snapToGrid(value: number): number {
  return Math.round(value / GRID_SIZE) * GRID_SIZE;
}

export function planCreateRoomFromCli(
  doc: MapDocument,
  requestedName: string,
  viewportSize: { readonly width: number; readonly height: number },
  panOffset: Position,
): CreateRoomCliPlan {
  const roomName = resolveUniqueRoomName(doc, requestedName);
  const previousRoom = getMostRecentlyCreatedRoom(doc);

  if (previousRoom !== null) {
    return {
      roomName,
      position: {
        x: previousRoom.position.x + (GRID_SIZE * CLI_ROOM_OFFSET_CELLS),
        y: previousRoom.position.y,
      },
    };
  }

  return {
    roomName,
    position: {
      x: snapToGrid((viewportSize.width / 2) - panOffset.x),
      y: snapToGrid((viewportSize.height / 2) - panOffset.y),
    },
  };
}
