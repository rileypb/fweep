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

export interface MapView {
  readonly pan: Position;
  readonly zoom: number;
  readonly visualStyle: MapVisualStyle;
  readonly showGrid: boolean;
  readonly snapToGrid: boolean;
  readonly useBezierConnections: boolean;
  readonly cliOutputCollapsed: boolean;
}

export const MAP_VISUAL_STYLES = ['default', 'square-classic'] as const;
export type MapVisualStyle = (typeof MAP_VISUAL_STYLES)[number];

/* ---- Background ---- */

export const BACKGROUND_LAYER_CHUNK_SIZE = 256;

export interface BackgroundLayer {
  readonly id: string;
  readonly name: string;
  readonly visible: boolean;
  readonly opacity: number;
  readonly pixelSize: number;
  readonly chunkSize: number;
}

export interface BackgroundReferenceImage {
  readonly id: string;
  readonly name: string;
  readonly mimeType: string;
  readonly dataUrl: string;
  readonly sourceUrl: string | null;
  readonly width: number;
  readonly height: number;
  readonly zoom: number;
}

export interface BackgroundDocument {
  readonly layers: Readonly<Record<string, BackgroundLayer>>;
  readonly activeLayerId: string | null;
  readonly referenceImage: BackgroundReferenceImage | null;
}

/* ---- Room ---- */

export const ROOM_SHAPES = ['rectangle', 'diamond', 'oval', 'octagon', 'pentagon', 'hexagon', 'house', 'box'] as const;
export type RoomShape = (typeof ROOM_SHAPES)[number];
export const ROOM_STROKE_STYLES = ['solid', 'dashed', 'dotted'] as const;
export type RoomStrokeStyle = (typeof ROOM_STROKE_STYLES)[number];
export const DEFAULT_ROOM_STROKE_STYLE: RoomStrokeStyle = 'solid';
export const CONNECTION_ANNOTATION_KINDS = ['in', 'out', 'door', 'locked door', 'text'] as const;
export type KnownConnectionAnnotationKind = (typeof CONNECTION_ANNOTATION_KINDS)[number];

export interface ConnectionAnnotation {
  readonly kind: string;
  readonly text?: string;
}

export interface Room {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly position: Position;
  /** Map from direction label (normalised) → connection ID. */
  readonly directions: Readonly<Record<string, string>>;
  readonly isDark: boolean;
  readonly locked: boolean;
  readonly shape: RoomShape;
  readonly fillColorIndex: number;
  readonly strokeColorIndex: number;
  readonly strokeStyle: RoomStrokeStyle;
}

export const PSEUDO_ROOM_KINDS = ['unknown', 'infinite', 'death', 'nowhere'] as const;
export type PseudoRoomKind = (typeof PSEUDO_ROOM_KINDS)[number];

export interface PseudoRoom {
  readonly id: string;
  readonly kind: PseudoRoomKind;
  readonly position: Position;
}

/* ---- Sticky Note ---- */

export interface StickyNote {
  readonly id: string;
  readonly text: string;
  readonly position: Position;
}

export interface StickyNoteLinkTarget {
  readonly kind: 'room' | 'pseudo-room';
  readonly id: string;
}

export interface StickyNoteLink {
  readonly id: string;
  readonly stickyNoteId: string;
  readonly target: StickyNoteLinkTarget;
}

/* ---- Connection ---- */

export interface Connection {
  readonly id: string;
  readonly sourceRoomId: string;
  readonly target: ConnectionTarget;
  readonly isBidirectional: boolean;
  readonly annotation: ConnectionAnnotation | null;
  readonly startLabel: string;
  readonly endLabel: string;
  readonly strokeColorIndex: number;
  readonly strokeStyle: RoomStrokeStyle;
}

export interface ConnectionTarget {
  readonly kind: 'room' | 'pseudo-room';
  readonly id: string;
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
  readonly view: MapView;
  readonly background: BackgroundDocument;
  readonly cliOutputLines: readonly string[];
  readonly rooms: Readonly<Record<string, Room>>;
  readonly pseudoRooms: Readonly<Record<string, PseudoRoom>>;
  readonly connections: Readonly<Record<string, Connection>>;
  readonly stickyNotes: Readonly<Record<string, StickyNote>>;
  readonly stickyNoteLinks: Readonly<Record<string, StickyNoteLink>>;
  readonly items: Readonly<Record<string, Item>>;
}

/** Current schema version for new maps. */
export const CURRENT_SCHEMA_VERSION = 2;

function getBuildMetadataValue(key: 'VITE_BUILD_RELEASE' | 'VITE_BUILD_SERIAL'): string | undefined {
  const viteValue = import.meta.env?.[key];
  if (typeof viteValue === 'string' && viteValue.trim().length > 0) {
    return viteValue.trim();
  }

  if (typeof process !== 'undefined') {
    const processValue = process.env[key];
    if (typeof processValue === 'string' && processValue.trim().length > 0) {
      return processValue.trim();
    }
  }

  return undefined;
}

const BUILD_RELEASE = getBuildMetadataValue('VITE_BUILD_RELEASE') ?? '0000000';
const BUILD_SERIAL = getBuildMetadataValue('VITE_BUILD_SERIAL') ?? '000000';

export const DEFAULT_CLI_OUTPUT_LINES = [
  '**fweep**',
  'An interactive map creator by Phil Riley',
  `Release ${BUILD_RELEASE} / Serial number ${BUILD_SERIAL}`,
  '',
] as const;

export function createEmptyBackground(): BackgroundDocument {
  return {
    layers: {},
    activeLayerId: null,
    referenceImage: null,
  };
}

export function createBackgroundLayer(name: string): BackgroundLayer {
  return {
    id: crypto.randomUUID(),
    name,
    visible: true,
    opacity: 1,
    pixelSize: 1,
    chunkSize: BACKGROUND_LAYER_CHUNK_SIZE,
  };
}

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
    view: {
      pan: { x: 0, y: 0 },
      zoom: 1,
      visualStyle: 'square-classic',
      showGrid: true,
      snapToGrid: true,
      useBezierConnections: false,
      cliOutputCollapsed: false,
    },
    background: createEmptyBackground(),
    cliOutputLines: [...DEFAULT_CLI_OUTPUT_LINES],
    rooms: {},
    pseudoRooms: {},
    connections: {},
    stickyNotes: {},
    stickyNoteLinks: {},
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
    locked: false,
    shape: 'rectangle',
    fillColorIndex: DEFAULT_ROOM_FILL_COLOR_INDEX,
    strokeColorIndex: DEFAULT_ROOM_STROKE_COLOR_INDEX,
    strokeStyle: DEFAULT_ROOM_STROKE_STYLE,
  };
}

/** Create a new Connection between two rooms. */
export function createConnection(
  sourceRoomId: string,
  target: ConnectionTarget | string,
  isBidirectional = false,
): Connection {
  return {
    id: crypto.randomUUID(),
    sourceRoomId,
    target: typeof target === 'string' ? { kind: 'room', id: target } : target,
    isBidirectional,
    annotation: null,
    startLabel: '',
    endLabel: '',
    strokeColorIndex: DEFAULT_ROOM_STROKE_COLOR_INDEX,
    strokeStyle: DEFAULT_ROOM_STROKE_STYLE,
  };
}

export function createPseudoRoom(kind: PseudoRoomKind): PseudoRoom {
  return {
    id: crypto.randomUUID(),
    kind,
    position: { x: 0, y: 0 },
  };
}

/** Create a new sticky note. */
export function createStickyNote(text: string = ''): StickyNote {
  return {
    id: crypto.randomUUID(),
    text,
    position: { x: 0, y: 0 },
  };
}

/** Create a new sticky-note annotation link to a room or pseudo-room. */
export function createStickyNoteLink(
  stickyNoteId: string,
  target: StickyNoteLinkTarget | string,
): StickyNoteLink {
  return {
    id: crypto.randomUUID(),
    stickyNoteId,
    target: typeof target === 'string' ? { kind: 'room', id: target } : target,
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
