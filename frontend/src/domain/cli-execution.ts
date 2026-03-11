import type { MapDocument, Position, Room } from './map-types';

const GRID_SIZE = 40;
const CLI_ROOM_OFFSET_CELLS = 2;

export interface CreateRoomCliPlan {
  readonly roomName: string;
  readonly position: Position;
}

function normalizeCliName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
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
