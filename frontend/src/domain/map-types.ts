import {
  DEFAULT_ROOM_FILL_COLOR_INDEX,
  DEFAULT_ROOM_STROKE_COLOR_INDEX,
} from './room-color-palette';

/** Minimal metadata for a persisted map, used by the selection dialog and storage layer. */
export interface MapMetadata {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;   // ISO-8601
  readonly updatedAt: string;   // ISO-8601
}

/* ---- Position ---- */

export interface Position {
  readonly x: number;
  readonly y: number;
}

/* ---- Room ---- */

export const ROOM_SHAPES = ['rectangle', 'diamond', 'oval', 'octagon'] as const;
export type RoomShape = (typeof ROOM_SHAPES)[number];
export const ROOM_STROKE_STYLES = ['solid', 'dashed', 'dotted'] as const;
export type RoomStrokeStyle = (typeof ROOM_STROKE_STYLES)[number];
export const DEFAULT_ROOM_STROKE_STYLE: RoomStrokeStyle = 'solid';

export interface Room {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly position: Position;
  /** Map from direction label (normalised) → connection ID. */
  readonly directions: Readonly<Record<string, string>>;
  readonly isDark: boolean;
  readonly shape: RoomShape;
  readonly fillColorIndex: number;
  readonly strokeColorIndex: number;
  readonly strokeStyle: RoomStrokeStyle;
}

/* ---- Connection ---- */

export interface Connection {
  readonly id: string;
  readonly sourceRoomId: string;
  readonly targetRoomId: string;
  readonly isBidirectional: boolean;
  readonly strokeColorIndex: number;
  readonly strokeStyle: RoomStrokeStyle;
}

/* ---- Item ---- */

export interface Item {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly roomId: string;
  readonly isScenery: boolean;
  readonly isContainer: boolean;
  readonly isSupporter: boolean;
  readonly isLightSource: boolean;
}

/* ---- MapDocument ---- */

/** Top-level persisted map document. */
export interface MapDocument {
  readonly schemaVersion: number;
  readonly metadata: MapMetadata;
  readonly rooms: Readonly<Record<string, Room>>;
  readonly connections: Readonly<Record<string, Connection>>;
  readonly items: Readonly<Record<string, Item>>;
}

/** Current schema version for new maps. */
export const CURRENT_SCHEMA_VERSION = 1;

/* ---- Factory functions ---- */

/** Create a fresh, empty MapDocument with the given name. */
export function createEmptyMap(name: string): MapDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    metadata: {
      id: crypto.randomUUID(),
      name,
      createdAt: now,
      updatedAt: now,
    },
    rooms: {},
    connections: {},
    items: {},
  };
}

/** Create a new Room with sensible defaults. */
export function createRoom(name: string): Room {
  return {
    id: crypto.randomUUID(),
    name,
    description: '',
    position: { x: 0, y: 0 },
    directions: {},
    isDark: false,
    shape: 'rectangle',
    fillColorIndex: DEFAULT_ROOM_FILL_COLOR_INDEX,
    strokeColorIndex: DEFAULT_ROOM_STROKE_COLOR_INDEX,
    strokeStyle: DEFAULT_ROOM_STROKE_STYLE,
  };
}

/** Create a new Connection between two rooms. */
export function createConnection(
  sourceRoomId: string,
  targetRoomId: string,
  isBidirectional = false,
): Connection {
  return {
    id: crypto.randomUUID(),
    sourceRoomId,
    targetRoomId,
    isBidirectional,
    strokeColorIndex: DEFAULT_ROOM_STROKE_COLOR_INDEX,
    strokeStyle: DEFAULT_ROOM_STROKE_STYLE,
  };
}

/** Create a new Item placed in a room. */
export function createItem(name: string, roomId: string): Item {
  return {
    id: crypto.randomUUID(),
    name,
    description: '',
    roomId,
    isScenery: false,
    isContainer: false,
    isSupporter: false,
    isLightSource: false,
  };
}
