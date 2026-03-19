import { create } from 'zustand';
import type {
  BackgroundReferenceImage,
  ConnectionAnnotation,
  Item,
  MapDocument,
  MapVisualStyle,
  Position,
  PseudoRoomKind,
  RoomShape,
  RoomStrokeStyle,
} from '../domain/map-types';
import { createBackgroundLayer, createItem, createPseudoRoom, createRoom, createConnection, createStickyNote, createStickyNoteLink } from '../domain/map-types';
import type { StickyNoteLinkTarget } from '../domain/map-types';
import type { ExportRegion } from '../export/export-types';
import {
  addRoom,
  addPseudoRoom,
  addConnection,
  addStickyNote,
  addStickyNoteLink,
  addItem as domainAddItem,
  convertPseudoRoomToRoom as domainConvertPseudoRoomToRoom,
  renameRoom as domainRenameRoom,
  deleteRoom as domainDeleteRoom,
  deleteConnection as domainDeleteConnection,
  deleteStickyNote as domainDeleteStickyNote,
  deleteStickyNoteLink as domainDeleteStickyNoteLink,
  deleteItem as domainDeleteItem,
  moveRoom as domainMoveRoom,
  movePseudoRoom as domainMovePseudoRoom,
  moveStickyNote as domainMoveStickyNote,
  rerouteConnectionEndpoint as domainRerouteConnectionEndpoint,
  describeRoom as domainDescribeRoom,
  setStickyNoteText as domainSetStickyNoteText,
  setRoomShape as domainSetRoomShape,
  setRoomStyle as domainSetRoomStyle,
  setConnectionAnnotation as domainSetConnectionAnnotation,
  setConnectionLabels as domainSetConnectionLabels,
  setConnectionStyle as domainSetConnectionStyle,
  setRoomDark as domainSetRoomDark,
  setPseudoRoomKind as domainSetPseudoRoomKind,
  setRoomsLocked as domainSetRoomsLocked,
  setRoomPositions as domainSetRoomPositions,
  setPseudoRoomPositions as domainSetPseudoRoomPositions,
  setStickyNotePositions as domainSetStickyNotePositions,
} from '../domain/map-operations';
import { normalizeDirection, oppositeDirection } from '../domain/directions';
import { computePrettifiedLayoutPositions } from '../graph/prettify-layout';
import { getRoomNodeWidth } from '../graph/room-label-geometry';
import { getStickyNoteHeight } from '../graph/sticky-note-geometry';
import { restoreBackgroundChunks, type RasterChunkHistoryEntry } from '../storage/map-store';
import { commitDocumentChange, pushHistoryEntry } from './editor-store-history';
import {
  filterConnectionSelectionForDoc,
  filterPseudoRoomSelectionForDoc,
  filterSelectionForDoc,
  filterStickyNoteLinkSelectionForDoc,
  filterStickyNoteSelectionForDoc,
} from './editor-store-selection';
import {
  getDefaultEditorViewState,
  getLoadedDocumentState,
  getUnloadedDocumentState,
  patchDocumentView,
} from './editor-store-view';

/** Grid size in pixels used for snapping room positions. */
const GRID_SIZE = 40;

/** Snap a value to the nearest multiple of `step`. */
function snapToGrid(value: number, step: number = GRID_SIZE): number {
  return Math.round(value / step) * step;
}

/** Snap a position to the nearest grid point. */
export function snapPosition(pos: Position): Position {
  return {
    x: snapToGrid(pos.x),
    y: snapToGrid(pos.y),
  };
}

function maybeSnapPosition(pos: Position, snapToGridEnabled: boolean): Position {
  return snapToGridEnabled ? snapPosition(pos) : pos;
}

function clampBackgroundReferenceImageZoom(zoom: number): number {
  return Math.min(Math.max(zoom, 0.05), 20);
}

function normalizeEntityName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function findMatchingItemIdsInRoom(
  items: Readonly<Record<string, Item>>,
  roomId: string,
  itemNames: readonly string[],
): {
  readonly removedItemIds: readonly string[];
  readonly missingItemNames: readonly string[];
} {
  const availableItems = Object.values(items)
    .filter((item) => item.roomId === roomId)
    .map((item) => ({
      id: item.id,
      normalizedName: normalizeEntityName(item.name),
    }));
  const usedItemIds = new Set<string>();
  const removedItemIds: string[] = [];
  const missingItemNames: string[] = [];

  for (const itemName of itemNames) {
    const normalizedName = normalizeEntityName(itemName);
    const matchingItem = availableItems.find((item) => item.normalizedName === normalizedName && !usedItemIds.has(item.id));
    if (matchingItem === undefined) {
      missingItemNames.push(itemName);
      continue;
    }

    usedItemIds.add(matchingItem.id);
    removedItemIds.push(matchingItem.id);
  }

  return { removedItemIds, missingItemNames };
}

function getStickyNotePlacementForRoom(
  doc: MapDocument,
  roomId: string,
  text: string,
  snapToGridEnabled: boolean,
): Position {
  const room = doc.rooms[roomId];
  const noteHeight = getStickyNoteHeight(text);
  const preferred = {
    x: room.position.x + getRoomNodeWidth(room) + GRID_SIZE,
    y: room.position.y + Math.round((36 - noteHeight) / 2),
  };
  return maybeSnapPosition(preferred, snapToGridEnabled);
}

/** State for an in-progress connection drag from a direction handle. */
export interface ConnectionDrag {
  readonly sourceRoomId: string;
  readonly sourceDirection: string;
  readonly cursorX: number;
  readonly cursorY: number;
}

export interface StickyNoteLinkDrag {
  readonly sourceStickyNoteId: string;
  readonly cursorX: number;
  readonly cursorY: number;
}

export interface ConnectionEndpointDrag {
  readonly connectionId: string;
  readonly endpoint: 'start' | 'end';
  readonly cursorX: number;
  readonly cursorY: number;
}

/** State for a room being actively dragged (before commit). */
export interface RoomDrag {
  readonly roomIds: readonly string[];
  readonly dx: number;
  readonly dy: number;
}

export interface StickyNoteDrag {
  readonly stickyNoteIds: readonly string[];
  readonly dx: number;
  readonly dy: number;
}

export interface SelectionDrag {
  readonly roomIds: readonly string[];
  readonly pseudoRoomIds: readonly string[];
  readonly stickyNoteIds: readonly string[];
  readonly dx: number;
  readonly dy: number;
}

export interface HistoryOptions {
  readonly historyMergeKey?: string;
}

export type DrawingTool = 'pencil' | 'brush' | 'eraser' | 'bucket' | 'line' | 'rectangle' | 'ellipse';
export type CanvasInteractionMode = 'map' | 'draw';

export interface DrawingToolState {
  readonly tool: DrawingTool;
  readonly colorRgbHex: string;
  readonly fillColorRgbHex: string;
  readonly opacity: number;
  readonly size: number;
  readonly softness: number;
  readonly shapeFilled: boolean;
  readonly bucketTolerance: number;
  readonly bucketObeyMap: boolean;
}

export interface ActiveStroke {
  readonly mapId: string;
  readonly layerId: string;
  readonly tool: DrawingTool;
}

export interface BackgroundStrokeHistoryEntry {
  readonly kind: 'background-stroke';
  readonly mapId: string;
  readonly layerId: string;
  readonly chunks: readonly RasterChunkHistoryEntry[];
}

export interface DocumentHistoryEntry {
  readonly kind: 'document';
  readonly before: MapDocument;
  readonly after: MapDocument;
}

export type EditorHistoryEntry = DocumentHistoryEntry | BackgroundStrokeHistoryEntry;

export interface ExportRegionDraft {
  readonly start: Position;
  readonly current: Position;
}

export interface EditorState {
  /** The currently loaded map document, or null when no map is open. */
  doc: MapDocument | null;

  /** Prior editor history entries available for undo. */
  pastEntries: readonly EditorHistoryEntry[];

  /** Future editor history entries available for redo. */
  futureEntries: readonly EditorHistoryEntry[];

  /** Whether an undo operation is currently available. */
  canUndo: boolean;

  /** Whether a redo operation is currently available. */
  canRedo: boolean;

  /** Internal merge key used to coalesce related edits into one history step. */
  lastHistoryMergeKey: string | null;

  /** The currently selected room IDs. */
  selectedRoomIds: readonly string[];

  /** The currently selected pseudo-room IDs. */
  selectedPseudoRoomIds: readonly string[];

  /** The currently selected sticky note IDs. */
  selectedStickyNoteIds: readonly string[];

  /** The currently selected connection IDs. */
  selectedConnectionIds: readonly string[];

  /** The currently selected sticky-note link IDs. */
  selectedStickyNoteLinkIds: readonly string[];

  /** Whether room movement and placement snap to the grid. */
  snapToGridEnabled: boolean;

  /** Whether the current map shows the background grid. */
  showGridEnabled: boolean;

  /** Whether the current map renders non-self connections as bezier curves. */
  useBezierConnectionsEnabled: boolean;

  /** Whether the CLI output log is collapsed. */
  cliOutputCollapsedEnabled: boolean;

  /** The persisted pan offset for the current map. */
  mapPanOffset: Position;

  /** The persisted zoom level for the current map. */
  mapZoom: number;

  /** The persisted visual style for the current map. */
  mapVisualStyle: MapVisualStyle;

  /** Active connection drag state, or null when not dragging. */
  connectionDrag: ConnectionDrag | null;

  /** Active sticky-note link drag state, or null when not dragging. */
  stickyNoteLinkDrag: StickyNoteLinkDrag | null;

  /** Active connection-endpoint reroute drag state, or null when not rerouting. */
  connectionEndpointDrag: ConnectionEndpointDrag | null;

  /** Active mixed node drag state, or null when not dragging selected rooms/notes. */
  selectionDrag: SelectionDrag | null;

  /** Draft region currently being dragged for export. */
  exportRegionDraft: ExportRegionDraft | null;

  /** Committed export region in map-space coordinates. */
  exportRegion: ExportRegion | null;

  /** Active drawing tool state. */
  drawingToolState: DrawingToolState;

  /** Whether empty-canvas primary interactions edit the map or draw on the background. */
  canvasInteractionMode: CanvasInteractionMode;

  /** Active background stroke state. */
  activeStroke: ActiveStroke | null;

  /** Monotonic revision for background redraws. */
  backgroundRevision: number;

  /** Load a map document into the editor. */
  loadDocument: (doc: MapDocument) => void;

  /** Clear the active document. */
  unloadDocument: () => void;

  /** Restore the previous document snapshot. */
  undo: () => void;

  /** Reapply a document snapshot previously restored by undo. */
  redo: () => void;

  /** Create a new room at the given canvas position (snapped to grid). Returns the room ID. */
  addRoomAtPosition: (name: string, position: Position, options?: HistoryOptions) => string;

  /** Create a new room from the room editor draft in a single history step. Returns the room ID. */
  createRoomFromEditorDraft: (
    position: Position,
    draft: {
      name: string;
      shape: RoomShape;
      isDark: boolean;
      fillColorIndex: number;
      strokeColorIndex: number;
      strokeStyle: RoomStrokeStyle;
    },
  ) => string;

  /** Create a pseudo-room and connect it from an existing room in a single history step. */
  createPseudoRoomAndConnect: (
    kind: PseudoRoomKind,
    position: Position,
    sourceRoomId: string,
    sourceDirection: string,
  ) => { pseudoRoomId: string; connectionId: string };

  /** Create or replace a pseudo-room exit from a room in a single history step. */
  setPseudoRoomExit: (
    sourceRoomId: string,
    sourceDirection: string,
    kind: PseudoRoomKind,
  ) => { pseudoRoomId: string; connectionId: string };

  /** Convert a pseudo-room into a standard room in place. */
  convertPseudoRoomToRoom: (
    pseudoRoomId: string,
    draft: {
      name: string;
      shape: RoomShape;
      isDark: boolean;
      fillColorIndex: number;
      strokeColorIndex: number;
      strokeStyle: RoomStrokeStyle;
    },
  ) => string;

  /** Create a new sticky note at the given canvas position (snapped to grid). Returns the note ID. */
  addStickyNoteAtPosition: (text: string, position: Position) => string;

  /** Create a sticky note linked to a room in a single history step. Returns the note ID. */
  addStickyNoteForRoom: (roomId: string, text: string) => string;

  /** Create one or more items in a room in a single history step. */
  addItemsToRoom: (roomId: string, itemNames: readonly string[]) => readonly string[];

  /** Remove named items from a room in a single history step. */
  removeItemsFromRoom: (
    roomId: string,
    itemNames: readonly string[],
  ) => {
    readonly removedItemIds: readonly string[];
    readonly missingItemNames: readonly string[];
  };

  /** Remove every item from a room in a single history step. */
  removeAllItemsFromRoom: (roomId: string) => readonly string[];

  /** Create or replace a connection between two rooms and select it. */
  connectRooms: (
    sourceRoomId: string,
    sourceDirection: string,
    targetRoomId: string,
    options: {
      oneWay: boolean;
      targetDirection: string | null;
    },
  ) => string;

  /** Delete a single connection. */
  deleteConnection: (connectionId: string) => void;

  /** Create a room and immediately connect it in a single history entry. */
  createRoomAndConnect: (
    name: string,
    position: Position,
    targetRoomId: string,
    options: {
      sourceDirection: string;
      oneWay: boolean;
      targetDirection: string | null;
    } & HistoryOptions,
  ) => { roomId: string; connectionId: string };

  /** Rename an existing room. */
  renameRoom: (roomId: string, name: string, options?: HistoryOptions) => void;

  /** Update an existing room's description. */
  describeRoom: (roomId: string, description: string, options?: HistoryOptions) => void;

  /** Update an existing sticky note's text. */
  setStickyNoteText: (stickyNoteId: string, text: string, options?: HistoryOptions) => void;

  /** Update an existing room's shape. */
  setRoomShape: (roomId: string, shape: RoomShape) => void;

  /** Update an existing room's lighting. */
  setRoomDark: (roomId: string, isDark: boolean, options?: HistoryOptions) => void;

  /** Update an existing room's visual styling. */
  setRoomStyle: (
    roomId: string,
    style: {
      fillColorIndex?: number;
      strokeColorIndex?: number;
      strokeStyle?: RoomStrokeStyle;
    },
  ) => void;

  /** Apply a room editor draft in a single history step. */
  applyRoomEditorDraft: (
    roomId: string,
    draft: {
      name: string;
      shape: RoomShape;
      isDark: boolean;
      fillColorIndex: number;
      strokeColorIndex: number;
      strokeStyle: RoomStrokeStyle;
    },
  ) => void;

  /** Apply a connection editor draft in a single history step. */
  applyConnectionEditorDraft: (
    connectionId: string,
    draft: {
      strokeColorIndex: number;
      strokeStyle: RoomStrokeStyle;
      annotation: ConnectionAnnotation | null;
      startLabel: string;
      endLabel: string;
    },
  ) => void;

  /** Update an existing connection's visual styling. */
  setConnectionStyle: (
    connectionId: string,
    style: {
      strokeColorIndex?: number;
      strokeStyle?: RoomStrokeStyle;
    },
  ) => void;

  /** Update an existing connection's annotation. */
  setConnectionAnnotation: (connectionId: string, annotation: ConnectionAnnotation | null) => void;

  /** Update several existing connections' annotations in one history step. */
  setConnectionAnnotations: (connectionIds: readonly string[], annotation: ConnectionAnnotation | null) => void;

  /** Update an existing connection's endpoint labels. */
  setConnectionLabels: (
    connectionId: string,
    labels: {
      startLabel?: string;
      endLabel?: string;
    },
  ) => void;

  /** Delete an existing room and cascade-remove its connections and items. */
  removeRoom: (roomId: string) => void;

  /** Delete all currently selected rooms. */
  removeSelectedRooms: () => void;

  /** Delete all currently selected sticky notes. */
  removeSelectedStickyNotes: () => void;

  /** Delete all currently selected connections. */
  removeSelectedConnections: () => void;

  /** Delete all currently selected sticky-note links. */
  removeSelectedStickyNoteLinks: () => void;

  /** Delete all currently selected entities in a single history step. */
  removeSelectedEntities: () => void;

  /** Replace the current room selection with a single room. */
  selectRoom: (roomId: string) => void;

  /** Replace the current selection with a single pseudo-room. */
  selectPseudoRoom: (pseudoRoomId: string) => void;

  /** Replace the current selection with a single connection. */
  selectConnection: (connectionId: string) => void;

  /** Replace the current selection with a single sticky note. */
  selectStickyNote: (stickyNoteId: string) => void;

  /** Replace the current selection with a single sticky-note link. */
  selectStickyNoteLink: (stickyNoteLinkId: string) => void;

  /** Add a connection to the current selection. */
  addConnectionToSelection: (connectionId: string) => void;

  /** Add a room to the current selection. */
  addRoomToSelection: (roomId: string) => void;

  /** Add a pseudo-room to the current selection. */
  addPseudoRoomToSelection: (pseudoRoomId: string) => void;

  /** Add a sticky note to the current selection. */
  addStickyNoteToSelection: (stickyNoteId: string) => void;

  /** Add a sticky-note link to the current selection. */
  addStickyNoteLinkToSelection: (stickyNoteLinkId: string) => void;

  /** Replace the current selection with the provided room IDs. */
  setSelectedRoomIds: (roomIds: readonly string[]) => void;

  /** Replace the current selection with the provided sticky note IDs. */
  setSelectedStickyNoteIds: (stickyNoteIds: readonly string[]) => void;

  /** Replace the current selection with the provided entity IDs. */
  setSelection: (
    roomIds: readonly string[],
    stickyNoteIds: readonly string[],
    connectionIds: readonly string[],
    stickyNoteLinkIds: readonly string[],
  ) => void;

  /** Clear the current room selection. */
  clearRoomSelection: () => void;

  /** Clear the current pseudo-room selection. */
  clearPseudoRoomSelection: () => void;

  /** Clear the current connection selection. */
  clearConnectionSelection: () => void;

  /** Clear the current sticky note selection. */
  clearStickyNoteSelection: () => void;

  /** Clear both room and connection selection. */
  clearSelection: () => void;

  /** Toggle grid snapping for room movement and placement. */
  toggleSnapToGrid: () => void;

  /** Toggle the background grid visibility for the current map. */
  toggleShowGrid: () => void;

  /** Toggle bezier rendering for non-self connections in the current map. */
  toggleUseBezierConnections: () => void;

  /** Persist the current map pan offset without adding a history entry. */
  setMapPanOffset: (position: Position) => void;

  /** Persist the current map zoom without adding a history entry. */
  setMapZoom: (zoom: number) => void;

  /** Persist the current map visual style without adding a history entry. */
  setMapVisualStyle: (visualStyle: MapVisualStyle) => void;

  /** Toggle the persisted CLI output collapse state without adding a history entry. */
  toggleCliOutputCollapsed: () => void;

  /** Replace the current background reference image. */
  setBackgroundReferenceImage: (image: BackgroundReferenceImage) => void;

  /** Clear the current background reference image. */
  clearBackgroundReferenceImage: () => void;

  /** Update the current background reference image zoom. */
  setBackgroundReferenceImageZoom: (zoom: number) => void;

  /** Move a room to a new position (snapped to grid). */
  moveRoom: (roomId: string, position: Position) => void;

  /** Move a pseudo-room to a new position (snapped to grid). */
  movePseudoRoom: (pseudoRoomId: string, position: Position) => void;

  /** Move multiple pseudo-rooms to new positions in a single history step. */
  movePseudoRooms: (positions: Readonly<Record<string, Position>>) => void;

  /** Begin dragging a pseudo-room. */
  startPseudoRoomDrag: (pseudoRoomId: string) => void;

  /** Move multiple rooms to new positions in a single history step. */
  moveRooms: (positions: Readonly<Record<string, Position>>) => void;

  /** Toggle the lock state of the selected rooms in one history step. */
  toggleSelectedRoomLocks: () => void;

  /** Move a sticky note to a new position (snapped to grid). */
  moveStickyNote: (stickyNoteId: string, position: Position) => void;

  /** Move multiple sticky notes to new positions in a single history step. */
  moveStickyNotes: (positions: Readonly<Record<string, Position>>) => void;

  /** Move rooms, pseudo-rooms, and sticky notes together in a single history step. */
  moveSelection: (positions: {
    readonly rooms?: Readonly<Record<string, Position>>;
    readonly pseudoRooms?: Readonly<Record<string, Position>>;
    readonly stickyNotes?: Readonly<Record<string, Position>>;
  }) => void;

  /** Recompute room positions from the connection graph. */
  prettifyLayout: () => void;

  /** Begin a connection drag from a direction handle. */
  startConnectionDrag: (roomId: string, direction: string, cursorX: number, cursorY: number) => void;

  /** Update the cursor position during a connection drag. */
  updateConnectionDrag: (cursorX: number, cursorY: number) => void;

  /** Complete a connection drag by dropping onto a target room, optionally on a specific direction handle. */
  completeConnectionDrag: (targetRoomId: string, targetDirection?: string) => void;

  /** Complete a connection drag by creating a new room at the given position and connecting to it. */
  completeConnectionDragToNewRoom: (position: Position) => string | null;

  /** Cancel an in-progress connection drag. */
  cancelConnectionDrag: () => void;

  /** Begin rerouting one visible end of a selected connection. */
  startConnectionEndpointDrag: (connectionId: string, endpoint: 'start' | 'end', cursorX: number, cursorY: number) => void;

  /** Update the cursor position during a connection-endpoint reroute drag. */
  updateConnectionEndpointDrag: (cursorX: number, cursorY: number) => void;

  /** Complete a connection-endpoint reroute by dropping onto a room or room handle. */
  completeConnectionEndpointDrag: (targetRoomId: string, targetDirection?: string) => void;

  /** Cancel an in-progress connection-endpoint reroute drag. */
  cancelConnectionEndpointDrag: () => void;

  /** Begin a sticky-note link drag from the sticky note body. */
  startStickyNoteLinkDrag: (stickyNoteId: string, cursorX: number, cursorY: number) => void;

  /** Update the cursor position during a sticky-note link drag. */
  updateStickyNoteLinkDrag: (cursorX: number, cursorY: number) => void;

  /** Complete a sticky-note link drag by dropping onto a room or pseudo-room. */
  completeStickyNoteLinkDrag: (target: StickyNoteLinkTarget) => void;

  /** Cancel an in-progress sticky-note link drag. */
  cancelStickyNoteLinkDrag: () => void;

  /** Start a room drag. */
  startRoomDrag: (roomId: string) => void;

  /** Update the room drag offset. */
  updateRoomDrag: (dx: number, dy: number) => void;

  /** End the room drag and clear the state. */
  endRoomDrag: () => void;

  /** Start a sticky note drag. */
  startStickyNoteDrag: (stickyNoteId: string) => void;

  /** Update the sticky note drag offset. */
  updateStickyNoteDrag: (dx: number, dy: number) => void;

  /** End the sticky note drag and clear the state. */
  endStickyNoteDrag: () => void;

  /** Begin a drag-defined export region. */
  beginExportRegion: (start: Position) => void;

  /** Update the current export-region drag endpoint. */
  updateExportRegion: (current: Position) => void;

  /** Commit the current draft export region. */
  commitExportRegion: () => void;

  /** Clear any draft or committed export region. */
  clearExportRegion: () => void;

  /** Update the selected drawing tool. */
  setDrawingTool: (tool: DrawingTool) => void;

  /** Update the primary empty-canvas interaction mode. */
  setCanvasInteractionMode: (mode: CanvasInteractionMode) => void;

  /** Update the drawing color hex value. */
  setDrawingColor: (colorRgbHex: string) => void;

  /** Update the shape fill color hex value. */
  setDrawingFillColor: (fillColorRgbHex: string) => void;

  /** Update tool opacity. */
  setDrawingOpacity: (opacity: number) => void;

  /** Update tool size. */
  setDrawingSize: (size: number) => void;

  /** Update tool softness. */
  setDrawingSoftness: (softness: number) => void;

  /** Update whether shape tools fill their interior. */
  setShapeFilled: (shapeFilled: boolean) => void;

  /** Update bucket fill tolerance. */
  setBucketTolerance: (bucketTolerance: number) => void;

  /** Update whether bucket fill treats rooms and connections as obstacles. */
  setBucketObeyMap: (bucketObeyMap: boolean) => void;

  /** Ensure a default background layer exists and return its ID. */
  ensureDefaultBackgroundLayer: () => string;

  /** Begin a background stroke. */
  beginBackgroundStroke: (layerId: string) => void;

  /** Cancel the active background stroke. */
  cancelBackgroundStroke: () => void;

  /** Commit a completed background stroke to history. */
  commitBackgroundStroke: (entry: BackgroundStrokeHistoryEntry) => void;
}

function applyCliConnection(
  doc: MapDocument,
  sourceRoomId: string,
  sourceDirection: string,
  targetRoomId: string,
  options: {
    oneWay: boolean;
    targetDirection: string | null;
  },
): { doc: MapDocument; connectionId: string } {
  const normalizedSourceDirection = normalizeDirection(sourceDirection);
  const normalizedTargetDirection = options.targetDirection === null ? null : normalizeDirection(options.targetDirection);
  const existingConnectionIds = new Set<string>();

  const sourceRoom = doc.rooms[sourceRoomId];
  if (!sourceRoom) {
    throw new Error(`Room "${sourceRoomId}" not found.`);
  }
  const sourceExistingConnectionId = sourceRoom.directions[normalizedSourceDirection];
  if (sourceExistingConnectionId) {
    existingConnectionIds.add(sourceExistingConnectionId);
  }

  if (!options.oneWay && normalizedTargetDirection !== null) {
    const targetRoom = doc.rooms[targetRoomId];
    if (!targetRoom) {
      throw new Error(`Room "${targetRoomId}" not found.`);
    }
    const targetExistingConnectionId = targetRoom.directions[normalizedTargetDirection];
    if (targetExistingConnectionId) {
      existingConnectionIds.add(targetExistingConnectionId);
    }
  }

  let nextDoc = doc;
  for (const connectionId of existingConnectionIds) {
    nextDoc = domainDeleteConnection(nextDoc, connectionId);
  }

  const connection = createConnection(sourceRoomId, targetRoomId, !options.oneWay);
  nextDoc = addConnection(
    nextDoc,
    connection,
    normalizedSourceDirection,
    options.oneWay ? undefined : (normalizedTargetDirection ?? undefined),
  );

  return { doc: nextDoc, connectionId: connection.id };
}

function prettifyCliConnectionResult(
  doc: MapDocument,
  movableRoomIds: readonly string[],
): MapDocument {
  const movableSet = new Set(movableRoomIds);
  const transientLockedRoomIds = new Set(
    Object.keys(doc.rooms).filter((roomId) => !movableSet.has(roomId)),
  );
  const { roomPositions } = computePrettifiedLayoutPositions(doc, transientLockedRoomIds);
  return domainSetRoomPositions(doc, roomPositions);
}

function prettifyCliStickyNoteResult(doc: MapDocument): MapDocument {
  const transientLockedRoomIds = new Set(Object.keys(doc.rooms));
  const { stickyNotePositions } = computePrettifiedLayoutPositions(doc, transientLockedRoomIds);
  return domainSetStickyNotePositions(doc, stickyNotePositions);
}

function getCliPseudoRoomPlacement(doc: MapDocument, sourceRoomId: string, sourceDirection: string): Position {
  const sourceRoom = doc.rooms[sourceRoomId];
  if (!sourceRoom) {
    throw new Error(`Room "${sourceRoomId}" not found.`);
  }

  const offset = GRID_SIZE * 2;
  const direction = normalizeDirection(sourceDirection);
  const deltaByDirection: Record<string, Position> = {
    north: { x: 0, y: -offset },
    south: { x: 0, y: offset },
    east: { x: offset, y: 0 },
    west: { x: -offset, y: 0 },
    northeast: { x: offset, y: -offset },
    northwest: { x: -offset, y: -offset },
    southeast: { x: offset, y: offset },
    southwest: { x: -offset, y: offset },
    up: { x: 0, y: -offset },
    down: { x: 0, y: offset },
    in: { x: -offset, y: 0 },
    out: { x: offset, y: 0 },
  };
  const delta = deltaByDirection[direction] ?? { x: offset, y: 0 };

  return {
    x: sourceRoom.position.x + delta.x,
    y: sourceRoom.position.y + delta.y,
  };
}

function prettifyCliPseudoRoomResult(doc: MapDocument): MapDocument {
  const transientLockedRoomIds = new Set(Object.keys(doc.rooms));
  const { pseudoRoomPositions } = computePrettifiedLayoutPositions(doc, transientLockedRoomIds);
  return domainSetPseudoRoomPositions(doc, pseudoRoomPositions);
}

export const useEditorStore = create<EditorState>((set, get) => ({
  doc: null,
  pastEntries: [],
  futureEntries: [],
  canUndo: false,
  canRedo: false,
  lastHistoryMergeKey: null,
  selectedRoomIds: [],
  selectedPseudoRoomIds: [],
  selectedStickyNoteIds: [],
  selectedConnectionIds: [],
  selectedStickyNoteLinkIds: [],
  ...getDefaultEditorViewState(),
  connectionDrag: null,
  stickyNoteLinkDrag: null,
  connectionEndpointDrag: null,
  selectionDrag: null,
  exportRegionDraft: null,
  exportRegion: null,
  drawingToolState: {
    tool: 'pencil',
    colorRgbHex: '#000000',
    fillColorRgbHex: '#000000',
    opacity: 1,
    size: 1,
    softness: 0.5,
    shapeFilled: false,
    bucketTolerance: 0,
    bucketObeyMap: false,
  },
  canvasInteractionMode: 'map',
  activeStroke: null,
  backgroundRevision: 0,

  loadDocument: (doc) => set(getLoadedDocumentState(doc)),

  unloadDocument: () => set(getUnloadedDocumentState()),

  undo: async () => {
    const {
      doc,
      pastEntries,
      futureEntries,
      selectedRoomIds,
      selectedPseudoRoomIds,
      selectedStickyNoteIds,
      selectedConnectionIds,
      selectedStickyNoteLinkIds,
    } = get();
    if (!doc || pastEntries.length === 0) {
      return;
    }

    const entry = pastEntries[pastEntries.length - 1];
    const nextPastEntries = pastEntries.slice(0, -1);
    if (entry.kind === 'document') {
      const nextDoc = patchDocumentView(entry.before, get());
      set({
        doc: nextDoc,
        pastEntries: nextPastEntries,
        futureEntries: [entry, ...futureEntries],
        canUndo: nextPastEntries.length > 0,
        canRedo: true,
        lastHistoryMergeKey: null,
        selectedRoomIds: filterSelectionForDoc(nextDoc, selectedRoomIds),
        selectedPseudoRoomIds: filterPseudoRoomSelectionForDoc(nextDoc, selectedPseudoRoomIds),
        selectedStickyNoteIds: filterStickyNoteSelectionForDoc(nextDoc, selectedStickyNoteIds),
        selectedConnectionIds: filterConnectionSelectionForDoc(nextDoc, selectedConnectionIds),
        selectedStickyNoteLinkIds: filterStickyNoteLinkSelectionForDoc(nextDoc, selectedStickyNoteLinkIds),
        connectionDrag: null,
        stickyNoteLinkDrag: null,
        connectionEndpointDrag: null,
        selectionDrag: null,
        exportRegionDraft: null,
        activeStroke: null,
      });
      return;
    }

    await restoreBackgroundChunks(entry.mapId, entry.layerId, entry.chunks, 'undo');
    set((state) => ({
      pastEntries: nextPastEntries,
      futureEntries: [entry, ...state.futureEntries],
      canUndo: nextPastEntries.length > 0,
      canRedo: true,
      lastHistoryMergeKey: null,
      connectionDrag: null,
      stickyNoteLinkDrag: null,
      connectionEndpointDrag: null,
      selectionDrag: null,
      exportRegionDraft: null,
      activeStroke: null,
      backgroundRevision: state.backgroundRevision + 1,
    }));
  },

  redo: async () => {
    const {
      doc,
      pastEntries,
      futureEntries,
      selectedRoomIds,
      selectedPseudoRoomIds,
      selectedStickyNoteIds,
      selectedConnectionIds,
      selectedStickyNoteLinkIds,
    } = get();
    if (!doc || futureEntries.length === 0) {
      return;
    }

    const entry = futureEntries[0];
    const nextFutureEntries = futureEntries.slice(1);
    if (entry.kind === 'document') {
      const patchedNextDoc = patchDocumentView(entry.after, get());
      set({
        doc: patchedNextDoc,
        pastEntries: [...pastEntries, entry],
        futureEntries: nextFutureEntries,
        canUndo: true,
        canRedo: nextFutureEntries.length > 0,
        lastHistoryMergeKey: null,
        selectedRoomIds: filterSelectionForDoc(patchedNextDoc, selectedRoomIds),
        selectedPseudoRoomIds: filterPseudoRoomSelectionForDoc(patchedNextDoc, selectedPseudoRoomIds),
        selectedStickyNoteIds: filterStickyNoteSelectionForDoc(patchedNextDoc, selectedStickyNoteIds),
        selectedConnectionIds: filterConnectionSelectionForDoc(patchedNextDoc, selectedConnectionIds),
        selectedStickyNoteLinkIds: filterStickyNoteLinkSelectionForDoc(patchedNextDoc, selectedStickyNoteLinkIds),
        connectionDrag: null,
        stickyNoteLinkDrag: null,
        connectionEndpointDrag: null,
        selectionDrag: null,
        exportRegionDraft: null,
        activeStroke: null,
      });
      return;
    }

    await restoreBackgroundChunks(entry.mapId, entry.layerId, entry.chunks, 'redo');
    set((state) => ({
      pastEntries: [...pastEntries, entry],
      futureEntries: nextFutureEntries,
      canUndo: true,
      canRedo: nextFutureEntries.length > 0,
      lastHistoryMergeKey: null,
      connectionDrag: null,
      stickyNoteLinkDrag: null,
      connectionEndpointDrag: null,
      selectionDrag: null,
      exportRegionDraft: null,
      activeStroke: null,
      backgroundRevision: state.backgroundRevision + 1,
    }));
  },

  addRoomAtPosition: (name, position, options) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot add a room: no document is loaded.');
    }

    const snapped = maybeSnapPosition(position, get().snapToGridEnabled);
    const room = { ...createRoom(name), position: snapped };
    const updatedDoc = addRoom(doc, room);
    set((state) => commitDocumentChange(state, doc, updatedDoc, options));
    return room.id;
  },

  createRoomFromEditorDraft: (position, draft) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot create a room from the editor: no document is loaded.');
    }

    const snapped = maybeSnapPosition(position, get().snapToGridEnabled);
    const room = {
      ...createRoom(draft.name),
      position: snapped,
      shape: draft.shape,
      isDark: draft.isDark,
      fillColorIndex: draft.fillColorIndex,
      strokeColorIndex: draft.strokeColorIndex,
      strokeStyle: draft.strokeStyle,
    };
    const updatedDoc = addRoom(doc, room);
    set((state) => ({
      ...commitDocumentChange(state, doc, updatedDoc),
      selectedRoomIds: [room.id],
      selectedStickyNoteIds: [],
      selectedConnectionIds: [],
      selectedStickyNoteLinkIds: [],
    }));
    return room.id;
  },

  createPseudoRoomAndConnect: (kind, position, sourceRoomId, sourceDirection) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot create and connect a pseudo-room: no document is loaded.');
    }

    const snapped = maybeSnapPosition(position, get().snapToGridEnabled);
    const pseudoRoom = { ...createPseudoRoom(kind), position: snapped };
    const connection = createConnection(sourceRoomId, { kind: 'pseudo-room', id: pseudoRoom.id }, false);
    let nextDoc = addPseudoRoom(doc, pseudoRoom);
    nextDoc = addConnection(nextDoc, connection, normalizeDirection(sourceDirection));
    set((state) => ({
      ...commitDocumentChange(state, doc, nextDoc),
      selectedRoomIds: [],
      selectedStickyNoteIds: [],
      selectedConnectionIds: [connection.id],
      selectedStickyNoteLinkIds: [],
    }));
    return { pseudoRoomId: pseudoRoom.id, connectionId: connection.id };
  },

  setPseudoRoomExit: (sourceRoomId, sourceDirection, kind) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot create or replace a pseudo-room exit: no document is loaded.');
    }

    const normalizedSourceDirection = normalizeDirection(sourceDirection);
    const sourceRoom = doc.rooms[sourceRoomId];
    if (!sourceRoom) {
      throw new Error(`Room "${sourceRoomId}" not found.`);
    }

    const existingConnectionId = sourceRoom.directions[normalizedSourceDirection];
    if (existingConnectionId) {
      const existingConnection = doc.connections[existingConnectionId];
      if (existingConnection?.target.kind === 'pseudo-room') {
        let nextDoc = domainSetPseudoRoomKind(doc, existingConnection.target.id, kind);
        nextDoc = prettifyCliPseudoRoomResult(nextDoc);
        set((state) => ({
          ...commitDocumentChange(state, doc, nextDoc),
          selectedRoomIds: [],
          selectedPseudoRoomIds: [],
          selectedStickyNoteIds: [],
          selectedConnectionIds: [existingConnection.id],
          selectedStickyNoteLinkIds: [],
        }));
        return { pseudoRoomId: existingConnection.target.id, connectionId: existingConnection.id };
      }
    }

    let nextDoc = doc;
    if (existingConnectionId) {
      nextDoc = domainDeleteConnection(nextDoc, existingConnectionId);
    }

    const pseudoRoom = {
      ...createPseudoRoom(kind),
      position: maybeSnapPosition(getCliPseudoRoomPlacement(nextDoc, sourceRoomId, normalizedSourceDirection), get().snapToGridEnabled),
    };
    const connection = createConnection(sourceRoomId, { kind: 'pseudo-room', id: pseudoRoom.id }, false);
    nextDoc = addPseudoRoom(nextDoc, pseudoRoom);
    nextDoc = addConnection(nextDoc, connection, normalizedSourceDirection);
    nextDoc = prettifyCliPseudoRoomResult(nextDoc);
    set((state) => ({
      ...commitDocumentChange(state, doc, nextDoc),
      selectedRoomIds: [],
      selectedPseudoRoomIds: [],
      selectedStickyNoteIds: [],
      selectedConnectionIds: [connection.id],
      selectedStickyNoteLinkIds: [],
    }));
    return { pseudoRoomId: pseudoRoom.id, connectionId: connection.id };
  },

  convertPseudoRoomToRoom: (pseudoRoomId, draft) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot convert a pseudo-room: no document is loaded.');
    }

    const pseudoRoom = doc.pseudoRooms[pseudoRoomId];
    if (!pseudoRoom) {
      throw new Error(`Pseudo-room "${pseudoRoomId}" not found.`);
    }

    const room = {
      ...createRoom(draft.name),
      id: pseudoRoom.id,
      position: pseudoRoom.position,
      shape: draft.shape,
      isDark: draft.isDark,
      fillColorIndex: draft.fillColorIndex,
      strokeColorIndex: draft.strokeColorIndex,
      strokeStyle: draft.strokeStyle,
    };
    const updatedDoc = domainConvertPseudoRoomToRoom(doc, pseudoRoomId, room);
    set((state) => ({
      ...commitDocumentChange(state, doc, updatedDoc),
      selectedRoomIds: [room.id],
      selectedStickyNoteIds: [],
      selectedConnectionIds: [],
      selectedStickyNoteLinkIds: [],
    }));
    return room.id;
  },

  addStickyNoteAtPosition: (text, position) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot add a sticky note: no document is loaded.');
    }

    const snapped = maybeSnapPosition(position, get().snapToGridEnabled);
    const stickyNote = { ...createStickyNote(text), position: snapped };
    const updatedDoc = addStickyNote(doc, stickyNote);
    set((state) => commitDocumentChange(state, doc, updatedDoc));
    return stickyNote.id;
  },

  addStickyNoteForRoom: (roomId, text) => {
    const { doc, snapToGridEnabled } = get();
    if (!doc) {
      throw new Error('Cannot add a sticky note: no document is loaded.');
    }
    if (!doc.rooms[roomId]) {
      throw new Error(`Room "${roomId}" not found.`);
    }

    const stickyNote = {
      ...createStickyNote(text),
      position: getStickyNotePlacementForRoom(doc, roomId, text, snapToGridEnabled),
    };
    let updatedDoc = addStickyNote(doc, stickyNote);
    updatedDoc = addStickyNoteLink(updatedDoc, createStickyNoteLink(stickyNote.id, roomId));
    updatedDoc = prettifyCliStickyNoteResult(updatedDoc);
    set((state) => ({
      ...commitDocumentChange(state, doc, updatedDoc),
      selectedRoomIds: [],
      selectedStickyNoteIds: [stickyNote.id],
      selectedConnectionIds: [],
      selectedStickyNoteLinkIds: [],
    }));
    return stickyNote.id;
  },

  addItemsToRoom: (roomId, itemNames) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot add items: no document is loaded.');
    }
    if (!doc.rooms[roomId]) {
      throw new Error(`Room "${roomId}" not found.`);
    }

    let updatedDoc = doc;
    const createdItems = itemNames.map((itemName) => createItem(itemName, roomId));
    for (const item of createdItems) {
      updatedDoc = domainAddItem(updatedDoc, item);
    }

    set((state) => commitDocumentChange(state, doc, updatedDoc));
    return createdItems.map((item) => item.id);
  },

  removeItemsFromRoom: (roomId, itemNames) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot remove items: no document is loaded.');
    }
    if (!doc.rooms[roomId]) {
      throw new Error(`Room "${roomId}" not found.`);
    }

    const { removedItemIds, missingItemNames } = findMatchingItemIdsInRoom(doc.items, roomId, itemNames);
    if (removedItemIds.length === 0 || missingItemNames.length > 0) {
      return { removedItemIds, missingItemNames };
    }

    let updatedDoc = doc;
    for (const itemId of removedItemIds) {
      updatedDoc = domainDeleteItem(updatedDoc, itemId);
    }

    set((state) => commitDocumentChange(state, doc, updatedDoc));
    return { removedItemIds, missingItemNames };
  },

  removeAllItemsFromRoom: (roomId) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot remove items: no document is loaded.');
    }
    if (!doc.rooms[roomId]) {
      throw new Error(`Room "${roomId}" not found.`);
    }

    const itemIds = Object.values(doc.items)
      .filter((item) => item.roomId === roomId)
      .map((item) => item.id);

    if (itemIds.length === 0) {
      return [];
    }

    let updatedDoc = doc;
    for (const itemId of itemIds) {
      updatedDoc = domainDeleteItem(updatedDoc, itemId);
    }

    set((state) => commitDocumentChange(state, doc, updatedDoc));
    return itemIds;
  },

  connectRooms: (sourceRoomId, sourceDirection, targetRoomId, options) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot connect rooms: no document is loaded.');
    }
    const connectionResult = applyCliConnection(doc, sourceRoomId, sourceDirection, targetRoomId, options);
    const nextDoc = sourceRoomId === targetRoomId
      ? connectionResult.doc
      : prettifyCliConnectionResult(connectionResult.doc, [sourceRoomId, targetRoomId]);

    set((state) => ({
      ...commitDocumentChange(state, doc, nextDoc),
      selectedRoomIds: [],
      selectedStickyNoteIds: [],
      selectedConnectionIds: [connectionResult.connectionId],
      selectedStickyNoteLinkIds: [],
    }));

    return connectionResult.connectionId;
  },

  deleteConnection: (connectionId) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot delete a connection: no document is loaded.');
    }
    if (!doc.connections[connectionId]) {
      throw new Error(`Connection "${connectionId}" not found.`);
    }

    const nextDoc = domainDeleteConnection(doc, connectionId);
    set((state) => ({
      ...commitDocumentChange(state, doc, nextDoc),
      selectedConnectionIds: filterConnectionSelectionForDoc(nextDoc, state.selectedConnectionIds),
      selectedPseudoRoomIds: filterPseudoRoomSelectionForDoc(nextDoc, state.selectedPseudoRoomIds),
      selectedStickyNoteLinkIds: filterStickyNoteLinkSelectionForDoc(nextDoc, state.selectedStickyNoteLinkIds),
    }));
  },

  createRoomAndConnect: (name, position, targetRoomId, options) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot create and connect a room: no document is loaded.');
    }

    const normalizedTargetDirection = options.targetDirection === null ? null : normalizeDirection(options.targetDirection);
    if (!options.oneWay && normalizedTargetDirection !== null) {
      const targetRoom = doc.rooms[targetRoomId];
      const placeholderConnectionId = targetRoom?.directions[normalizedTargetDirection];
      const placeholderConnection = placeholderConnectionId ? doc.connections[placeholderConnectionId] : undefined;
      if (placeholderConnection?.target.kind === 'pseudo-room') {
        const pseudoRoom = doc.pseudoRooms[placeholderConnection.target.id];
        if (pseudoRoom) {
          const room = {
            ...createRoom(name),
            id: pseudoRoom.id,
            position: pseudoRoom.position,
          };
          let nextDoc = domainConvertPseudoRoomToRoom(doc, pseudoRoom.id, room);
          nextDoc = domainRerouteConnectionEndpoint(nextDoc, placeholderConnection.id, 'end', room.id, options.sourceDirection);
          nextDoc = room.id === targetRoomId
            ? nextDoc
            : prettifyCliConnectionResult(nextDoc, [room.id]);

          set((state) => ({
            ...commitDocumentChange(state, doc, nextDoc, options),
            selectedRoomIds: [room.id, targetRoomId],
            selectedPseudoRoomIds: [],
            selectedStickyNoteIds: [],
            selectedConnectionIds: [placeholderConnection.id],
            selectedStickyNoteLinkIds: [],
          }));

          return { roomId: room.id, connectionId: placeholderConnection.id };
        }
      }
    }

    const snapped = maybeSnapPosition(position, get().snapToGridEnabled);
    const room = { ...createRoom(name), position: snapped };
    let nextDoc = addRoom(doc, room);
    const connectionResult = applyCliConnection(nextDoc, room.id, options.sourceDirection, targetRoomId, {
      oneWay: options.oneWay,
      targetDirection: options.targetDirection,
    });
    nextDoc = room.id === targetRoomId
      ? connectionResult.doc
      : prettifyCliConnectionResult(connectionResult.doc, [room.id]);

    set((state) => ({
      ...commitDocumentChange(state, doc, nextDoc, options),
      selectedRoomIds: [room.id, targetRoomId],
      selectedStickyNoteIds: [],
      selectedConnectionIds: [connectionResult.connectionId],
      selectedStickyNoteLinkIds: [],
    }));

    return { roomId: room.id, connectionId: connectionResult.connectionId };
  },

  renameRoom: (roomId, name, options) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot rename a room: no document is loaded.');
    }
    const updatedDoc = domainRenameRoom(doc, roomId, name);
    set((state) => commitDocumentChange(state, doc, updatedDoc, options));
  },

  describeRoom: (roomId, description, options) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot describe a room: no document is loaded.');
    }
    const updatedDoc = domainDescribeRoom(doc, roomId, description);
    set((state) => commitDocumentChange(state, doc, updatedDoc, options));
  },

  setStickyNoteText: (stickyNoteId, text, options) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot update a sticky note: no document is loaded.');
    }

    const updatedDoc = domainSetStickyNoteText(doc, stickyNoteId, text);
    set((state) => commitDocumentChange(state, doc, updatedDoc, options));
  },

  setRoomShape: (roomId, shape) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot set room shape: no document is loaded.');
    }
    const updatedDoc = domainSetRoomShape(doc, roomId, shape);
    set((state) => commitDocumentChange(state, doc, updatedDoc));
  },

  setRoomDark: (roomId, isDark, options) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot set room lighting: no document is loaded.');
    }
    const updatedDoc = domainSetRoomDark(doc, roomId, isDark);
    set((state) => commitDocumentChange(state, doc, updatedDoc, options));
  },

  setRoomStyle: (roomId, style) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot set room style: no document is loaded.');
    }
    const updatedDoc = domainSetRoomStyle(doc, roomId, style);
    set((state) => commitDocumentChange(state, doc, updatedDoc));
  },

  applyRoomEditorDraft: (roomId, draft) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot apply room editor draft: no document is loaded.');
    }

    let updatedDoc = doc;
    updatedDoc = domainRenameRoom(updatedDoc, roomId, draft.name);
    updatedDoc = domainSetRoomShape(updatedDoc, roomId, draft.shape);
    updatedDoc = domainSetRoomDark(updatedDoc, roomId, draft.isDark);
    updatedDoc = domainSetRoomStyle(updatedDoc, roomId, {
      fillColorIndex: draft.fillColorIndex,
      strokeColorIndex: draft.strokeColorIndex,
      strokeStyle: draft.strokeStyle,
    });
    set((state) => commitDocumentChange(state, doc, updatedDoc));
  },

  applyConnectionEditorDraft: (connectionId, draft) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot apply connection editor draft: no document is loaded.');
    }

    let updatedDoc = doc;
    updatedDoc = domainSetConnectionStyle(updatedDoc, connectionId, {
      strokeColorIndex: draft.strokeColorIndex,
      strokeStyle: draft.strokeStyle,
    });
    updatedDoc = domainSetConnectionAnnotation(updatedDoc, connectionId, draft.annotation);
    updatedDoc = domainSetConnectionLabels(updatedDoc, connectionId, {
      startLabel: draft.startLabel,
      endLabel: draft.endLabel,
    });
    set((state) => commitDocumentChange(state, doc, updatedDoc));
  },

  setConnectionStyle: (connectionId, style) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot set connection style: no document is loaded.');
    }
    const updatedDoc = domainSetConnectionStyle(doc, connectionId, style);
    set((state) => commitDocumentChange(state, doc, updatedDoc));
  },

  setConnectionAnnotation: (connectionId, annotation) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot set connection annotation: no document is loaded.');
    }
    const updatedDoc = domainSetConnectionAnnotation(doc, connectionId, annotation);
    set((state) => commitDocumentChange(state, doc, updatedDoc));
  },

  setConnectionAnnotations: (connectionIds, annotation) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot set connection annotations: no document is loaded.');
    }

    let updatedDoc = doc;
    for (const connectionId of connectionIds) {
      updatedDoc = domainSetConnectionAnnotation(updatedDoc, connectionId, annotation);
    }
    set((state) => commitDocumentChange(state, doc, updatedDoc));
  },

  setConnectionLabels: (connectionId, labels) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot set connection labels: no document is loaded.');
    }
    const updatedDoc = domainSetConnectionLabels(doc, connectionId, labels);
    set((state) => commitDocumentChange(state, doc, updatedDoc));
  },

  removeRoom: (roomId) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot remove a room: no document is loaded.');
    }
    const updatedDoc = domainDeleteRoom(doc, roomId);
    set((state) => ({
      ...commitDocumentChange(state, doc, updatedDoc),
      selectedRoomIds: state.selectedRoomIds.filter((id) => id !== roomId),
      selectedConnectionIds: filterConnectionSelectionForDoc(updatedDoc, state.selectedConnectionIds),
      selectedStickyNoteLinkIds: filterStickyNoteLinkSelectionForDoc(updatedDoc, state.selectedStickyNoteLinkIds),
    }));
  },

  removeSelectedRooms: () => {
    const { doc, selectedRoomIds } = get();
    if (!doc) {
      throw new Error('Cannot remove selected rooms: no document is loaded.');
    }

    const updatedDoc = selectedRoomIds.reduce(
      (nextDoc, roomId) => domainDeleteRoom(nextDoc, roomId),
      doc,
    );

    set((state) => ({
      ...commitDocumentChange(state, doc, updatedDoc),
      selectedRoomIds: [],
      selectedConnectionIds: filterConnectionSelectionForDoc(updatedDoc, state.selectedConnectionIds),
      selectedStickyNoteLinkIds: filterStickyNoteLinkSelectionForDoc(updatedDoc, state.selectedStickyNoteLinkIds),
    }));
  },

  removeSelectedStickyNotes: () => {
    const { doc, selectedStickyNoteIds } = get();
    if (!doc) {
      throw new Error('Cannot remove selected sticky notes: no document is loaded.');
    }

    const updatedDoc = selectedStickyNoteIds.reduce(
      (nextDoc, stickyNoteId) => domainDeleteStickyNote(nextDoc, stickyNoteId),
      doc,
    );

    set((state) => ({
      ...commitDocumentChange(state, doc, updatedDoc),
      selectedStickyNoteIds: [],
      selectedStickyNoteLinkIds: filterStickyNoteLinkSelectionForDoc(updatedDoc, state.selectedStickyNoteLinkIds),
    }));
  },

  removeSelectedConnections: () => {
    const { doc, selectedConnectionIds } = get();
    if (!doc) {
      throw new Error('Cannot remove selected connections: no document is loaded.');
    }

    const updatedDoc = selectedConnectionIds.reduce(
      (nextDoc, connectionId) => domainDeleteConnection(nextDoc, connectionId),
      doc,
    );

    set((state) => ({
      ...commitDocumentChange(state, doc, updatedDoc),
      selectedConnectionIds: [],
    }));
  },

  removeSelectedStickyNoteLinks: () => {
    const { doc, selectedStickyNoteLinkIds } = get();
    if (!doc) {
      throw new Error('Cannot remove selected sticky-note links: no document is loaded.');
    }

    const updatedDoc = selectedStickyNoteLinkIds.reduce(
      (nextDoc, stickyNoteLinkId) => domainDeleteStickyNoteLink(nextDoc, stickyNoteLinkId),
      doc,
    );

    set((state) => ({
      ...commitDocumentChange(state, doc, updatedDoc),
      selectedStickyNoteLinkIds: [],
    }));
  },

  removeSelectedEntities: () => {
    const {
      doc,
      selectedRoomIds,
      selectedPseudoRoomIds,
      selectedStickyNoteIds,
      selectedConnectionIds,
      selectedStickyNoteLinkIds,
    } = get();
    if (!doc) {
      throw new Error('Cannot remove selected entities: no document is loaded.');
    }

    let updatedDoc = selectedRoomIds.reduce(
      (nextDoc, roomId) => (nextDoc.rooms[roomId] ? domainDeleteRoom(nextDoc, roomId) : nextDoc),
      doc,
    );
    updatedDoc = selectedPseudoRoomIds.reduce((nextDoc, pseudoRoomId) => {
      const incomingConnection = Object.values(nextDoc.connections).find((connection) => (
        connection.target.kind === 'pseudo-room' && connection.target.id === pseudoRoomId
      ));

      return incomingConnection ? domainDeleteConnection(nextDoc, incomingConnection.id) : nextDoc;
    }, updatedDoc);
    updatedDoc = selectedStickyNoteIds.reduce(
      (nextDoc, stickyNoteId) => (nextDoc.stickyNotes[stickyNoteId] ? domainDeleteStickyNote(nextDoc, stickyNoteId) : nextDoc),
      updatedDoc,
    );
    updatedDoc = selectedConnectionIds.reduce(
      (nextDoc, connectionId) => (nextDoc.connections[connectionId] ? domainDeleteConnection(nextDoc, connectionId) : nextDoc),
      updatedDoc,
    );
    updatedDoc = selectedStickyNoteLinkIds.reduce(
      (nextDoc, stickyNoteLinkId) => (
        nextDoc.stickyNoteLinks[stickyNoteLinkId] ? domainDeleteStickyNoteLink(nextDoc, stickyNoteLinkId) : nextDoc
      ),
      updatedDoc,
    );

    set((state) => ({
      ...commitDocumentChange(state, doc, updatedDoc),
      selectedRoomIds: [],
      selectedPseudoRoomIds: [],
      selectedStickyNoteIds: [],
      selectedConnectionIds: [],
      selectedStickyNoteLinkIds: [],
    }));
  },

  selectRoom: (roomId) => {
    set({
      selectedRoomIds: [roomId],
      selectedPseudoRoomIds: [],
      selectedStickyNoteIds: [],
      selectedConnectionIds: [],
      selectedStickyNoteLinkIds: [],
      lastHistoryMergeKey: null,
    });
  },

  selectPseudoRoom: (pseudoRoomId) => {
    set({
      selectedRoomIds: [],
      selectedPseudoRoomIds: [pseudoRoomId],
      selectedStickyNoteIds: [],
      selectedConnectionIds: [],
      selectedStickyNoteLinkIds: [],
      lastHistoryMergeKey: null,
    });
  },

  selectConnection: (connectionId) => {
    set({
      selectedRoomIds: [],
      selectedPseudoRoomIds: [],
      selectedStickyNoteIds: [],
      selectedConnectionIds: [connectionId],
      selectedStickyNoteLinkIds: [],
      lastHistoryMergeKey: null,
    });
  },

  selectStickyNote: (stickyNoteId) => {
    set({
      selectedRoomIds: [],
      selectedPseudoRoomIds: [],
      selectedStickyNoteIds: [stickyNoteId],
      selectedConnectionIds: [],
      selectedStickyNoteLinkIds: [],
      lastHistoryMergeKey: null,
    });
  },

  selectStickyNoteLink: (stickyNoteLinkId) => {
    set({
      selectedRoomIds: [],
      selectedPseudoRoomIds: [],
      selectedStickyNoteIds: [],
      selectedConnectionIds: [],
      selectedStickyNoteLinkIds: [stickyNoteLinkId],
      lastHistoryMergeKey: null,
    });
  },

  addRoomToSelection: (roomId) => {
    set((state) => ({
      lastHistoryMergeKey: null,
      selectedRoomIds: state.selectedRoomIds.includes(roomId)
        ? state.selectedRoomIds
        : [...state.selectedRoomIds, roomId],
    }));
  },

  addPseudoRoomToSelection: (pseudoRoomId) => {
    set((state) => ({
      lastHistoryMergeKey: null,
      selectedPseudoRoomIds: state.selectedPseudoRoomIds.includes(pseudoRoomId)
        ? state.selectedPseudoRoomIds
        : [...state.selectedPseudoRoomIds, pseudoRoomId],
    }));
  },

  addStickyNoteToSelection: (stickyNoteId) => {
    set((state) => ({
      lastHistoryMergeKey: null,
      selectedStickyNoteIds: state.selectedStickyNoteIds.includes(stickyNoteId)
        ? state.selectedStickyNoteIds
        : [...state.selectedStickyNoteIds, stickyNoteId],
    }));
  },

  addConnectionToSelection: (connectionId) => {
    set((state) => ({
      lastHistoryMergeKey: null,
      selectedConnectionIds: state.selectedConnectionIds.includes(connectionId)
        ? state.selectedConnectionIds
        : [...state.selectedConnectionIds, connectionId],
    }));
  },

  addStickyNoteLinkToSelection: (stickyNoteLinkId) => {
    set((state) => ({
      lastHistoryMergeKey: null,
      selectedStickyNoteLinkIds: state.selectedStickyNoteLinkIds.includes(stickyNoteLinkId)
        ? state.selectedStickyNoteLinkIds
        : [...state.selectedStickyNoteLinkIds, stickyNoteLinkId],
    }));
  },

  setSelectedRoomIds: (roomIds) => {
    set({
      selectedRoomIds: [...roomIds],
      selectedPseudoRoomIds: [],
      selectedStickyNoteIds: [],
      selectedConnectionIds: [],
      selectedStickyNoteLinkIds: [],
      lastHistoryMergeKey: null,
    });
  },

  setSelectedStickyNoteIds: (stickyNoteIds) => {
    set({
      selectedRoomIds: [],
      selectedPseudoRoomIds: [],
      selectedStickyNoteIds: [...stickyNoteIds],
      selectedConnectionIds: [],
      selectedStickyNoteLinkIds: [],
      lastHistoryMergeKey: null,
    });
  },

  setSelection: (roomIds, stickyNoteIds, connectionIds, stickyNoteLinkIds) => {
    set({
      selectedRoomIds: [...roomIds],
      selectedPseudoRoomIds: [],
      selectedStickyNoteIds: [...stickyNoteIds],
      selectedConnectionIds: [...connectionIds],
      selectedStickyNoteLinkIds: [...stickyNoteLinkIds],
      lastHistoryMergeKey: null,
    });
  },

  clearRoomSelection: () => {
    set({ selectedRoomIds: [], lastHistoryMergeKey: null });
  },

  clearPseudoRoomSelection: () => {
    set({ selectedPseudoRoomIds: [], lastHistoryMergeKey: null });
  },

  clearConnectionSelection: () => {
    set({ selectedConnectionIds: [], lastHistoryMergeKey: null });
  },

  clearStickyNoteSelection: () => {
    set({ selectedStickyNoteIds: [], lastHistoryMergeKey: null });
  },

  clearSelection: () => {
    set({
      selectedRoomIds: [],
      selectedPseudoRoomIds: [],
      selectedStickyNoteIds: [],
      selectedConnectionIds: [],
      selectedStickyNoteLinkIds: [],
      lastHistoryMergeKey: null,
    });
  },

  toggleSnapToGrid: () => {
    set((state) => {
      const snapToGridEnabled = !state.snapToGridEnabled;
      const nextDoc = state.doc
        ? {
          ...state.doc,
          view: {
            ...state.doc.view,
            snapToGrid: snapToGridEnabled,
          },
        }
        : state.doc;

      return {
        doc: nextDoc,
        snapToGridEnabled,
        lastHistoryMergeKey: null,
      };
    });
  },

  toggleShowGrid: () => {
    set((state) => {
      const showGridEnabled = !state.showGridEnabled;
      const nextDoc = state.doc
        ? {
          ...state.doc,
          view: {
            ...state.doc.view,
            showGrid: showGridEnabled,
          },
        }
        : state.doc;

      return {
        doc: nextDoc,
        showGridEnabled,
        lastHistoryMergeKey: null,
      };
    });
  },

  toggleUseBezierConnections: () => {
    set((state) => {
      const useBezierConnectionsEnabled = !state.useBezierConnectionsEnabled;
      const nextDoc = state.doc
        ? {
          ...state.doc,
          view: {
            ...state.doc.view,
            useBezierConnections: useBezierConnectionsEnabled,
          },
        }
        : state.doc;

      return {
        doc: nextDoc,
        useBezierConnectionsEnabled,
        lastHistoryMergeKey: null,
      };
    });
  },

  setMapPanOffset: (position) => {
    set((state) => ({
      doc: state.doc
        ? {
          ...state.doc,
          view: {
            ...state.doc.view,
            pan: position,
          },
        }
        : state.doc,
      mapPanOffset: position,
      lastHistoryMergeKey: null,
    }));
  },

  setMapZoom: (zoom) => {
    set((state) => ({
      doc: state.doc
        ? {
          ...state.doc,
          view: {
            ...state.doc.view,
            zoom,
          },
        }
        : state.doc,
      mapZoom: zoom,
      lastHistoryMergeKey: null,
    }));
  },

  setMapVisualStyle: (visualStyle) => {
    set((state) => ({
      doc: state.doc
        ? {
          ...state.doc,
          view: {
            ...state.doc.view,
            visualStyle,
          },
        }
        : state.doc,
      mapVisualStyle: visualStyle,
      lastHistoryMergeKey: null,
    }));
  },

  toggleCliOutputCollapsed: () => {
    set((state) => {
      const cliOutputCollapsedEnabled = !state.cliOutputCollapsedEnabled;
      return {
        doc: state.doc
          ? {
            ...state.doc,
            view: {
              ...state.doc.view,
              cliOutputCollapsed: cliOutputCollapsedEnabled,
            },
          }
          : state.doc,
        cliOutputCollapsedEnabled,
        lastHistoryMergeKey: null,
      };
    });
  },

  setBackgroundReferenceImage: (image) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot set a background image: no document is loaded.');
    }

    const updatedDoc = {
      ...doc,
      background: {
        ...doc.background,
        referenceImage: {
          ...image,
          sourceUrl: image.sourceUrl ?? null,
          zoom: clampBackgroundReferenceImageZoom(image.zoom),
        },
      },
    };
    set((state) => commitDocumentChange(state, doc, updatedDoc));
  },

  clearBackgroundReferenceImage: () => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot clear a background image: no document is loaded.');
    }
    if (doc.background.referenceImage === null) {
      return;
    }

    const updatedDoc = {
      ...doc,
      background: {
        ...doc.background,
        referenceImage: null,
      },
    };
    set((state) => commitDocumentChange(state, doc, updatedDoc));
  },

  setBackgroundReferenceImageZoom: (zoom) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot update the background image zoom: no document is loaded.');
    }
    if (doc.background.referenceImage === null) {
      throw new Error('Cannot update the background image zoom: no background image is set.');
    }

    const updatedDoc = {
      ...doc,
      background: {
        ...doc.background,
        referenceImage: {
          ...doc.background.referenceImage,
          zoom: clampBackgroundReferenceImageZoom(zoom),
        },
      },
    };
    set((state) => commitDocumentChange(state, doc, updatedDoc));
  },

  moveRoom: (roomId, position) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot move a room: no document is loaded.');
    }
    const snapped = maybeSnapPosition(position, get().snapToGridEnabled);
    const updatedDoc = domainMoveRoom(doc, roomId, snapped);
    set((state) => commitDocumentChange(state, doc, updatedDoc));
  },

  movePseudoRoom: (pseudoRoomId, position) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot move a pseudo-room: no document is loaded.');
    }

    const updatedDoc = domainMovePseudoRoom(doc, pseudoRoomId, maybeSnapPosition(position, get().snapToGridEnabled));
    set((state) => commitDocumentChange(state, doc, updatedDoc));
  },

  movePseudoRooms: (positions) => {
    const { doc, snapToGridEnabled } = get();
    if (!doc) {
      throw new Error('Cannot move pseudo-rooms: no document is loaded.');
    }

    const snappedPositions = Object.fromEntries(
      Object.entries(positions).map(([pseudoRoomId, position]) => [
        pseudoRoomId,
        maybeSnapPosition(position, snapToGridEnabled),
      ]),
    ) as Record<string, Position>;

    const updatedDoc = domainSetPseudoRoomPositions(doc, snappedPositions);
    set((state) => commitDocumentChange(state, doc, updatedDoc));
  },

  moveRooms: (positions) => {
    const { doc, snapToGridEnabled } = get();
    if (!doc) {
      throw new Error('Cannot move rooms: no document is loaded.');
    }

    const snappedPositions = Object.fromEntries(
      Object.entries(positions).map(([roomId, position]) => [
        roomId,
        maybeSnapPosition(position, snapToGridEnabled),
      ]),
    ) as Record<string, Position>;

    const updatedDoc = domainSetRoomPositions(doc, snappedPositions);
    set((state) => commitDocumentChange(state, doc, updatedDoc));
  },

  toggleSelectedRoomLocks: () => {
    const { doc, selectedRoomIds } = get();
    if (!doc || selectedRoomIds.length === 0) {
      return;
    }

    const selectedRooms = selectedRoomIds
      .map((roomId) => doc.rooms[roomId])
      .filter((room): room is NonNullable<typeof room> => Boolean(room));
    if (selectedRooms.length === 0) {
      return;
    }

    const nextLocked = selectedRooms.some((room) => !room.locked);
    const updatedDoc = domainSetRoomsLocked(doc, selectedRooms.map((room) => room.id), nextLocked);
    set((state) => commitDocumentChange(state, doc, updatedDoc));
  },

  moveStickyNote: (stickyNoteId, position) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot move a sticky note: no document is loaded.');
    }

    const snapped = maybeSnapPosition(position, get().snapToGridEnabled);
    const updatedDoc = domainMoveStickyNote(doc, stickyNoteId, snapped);
    set((state) => commitDocumentChange(state, doc, updatedDoc));
  },

  moveStickyNotes: (positions) => {
    const { doc, snapToGridEnabled } = get();
    if (!doc) {
      throw new Error('Cannot move sticky notes: no document is loaded.');
    }

    const snappedPositions = Object.fromEntries(
      Object.entries(positions).map(([stickyNoteId, position]) => [
        stickyNoteId,
        maybeSnapPosition(position, snapToGridEnabled),
      ]),
    ) as Record<string, Position>;

    const updatedDoc = domainSetStickyNotePositions(doc, snappedPositions);
    set((state) => commitDocumentChange(state, doc, updatedDoc));
  },

  moveSelection: (positions) => {
    const { doc, snapToGridEnabled } = get();
    if (!doc) {
      throw new Error('Cannot move selection: no document is loaded.');
    }

    const snapPositionMap = (positionMap: Readonly<Record<string, Position>> | undefined): Record<string, Position> => (
      Object.fromEntries(
        Object.entries(positionMap ?? {}).map(([entityId, position]) => [
          entityId,
          maybeSnapPosition(position, snapToGridEnabled),
        ]),
      ) as Record<string, Position>
    );

    const snappedRoomPositions = snapPositionMap(positions.rooms);
    const snappedPseudoRoomPositions = snapPositionMap(positions.pseudoRooms);
    const snappedStickyNotePositions = snapPositionMap(positions.stickyNotes);

    const roomsUpdatedDoc = domainSetRoomPositions(doc, snappedRoomPositions);
    const pseudoRoomsUpdatedDoc = domainSetPseudoRoomPositions(roomsUpdatedDoc, snappedPseudoRoomPositions);
    const updatedDoc = domainSetStickyNotePositions(pseudoRoomsUpdatedDoc, snappedStickyNotePositions);
    set((state) => commitDocumentChange(state, doc, updatedDoc));
  },

  prettifyLayout: () => {
    const { doc } = get();
    if (!doc) {
      return;
    }

    const { roomPositions, pseudoRoomPositions, stickyNotePositions } = computePrettifiedLayoutPositions(doc);
    const roomsUpdatedDoc = domainSetRoomPositions(doc, roomPositions);
    const pseudoRoomsUpdatedDoc = domainSetPseudoRoomPositions(roomsUpdatedDoc, pseudoRoomPositions);
    const updatedDoc = domainSetStickyNotePositions(pseudoRoomsUpdatedDoc, stickyNotePositions);
    set((state) => commitDocumentChange(state, doc, updatedDoc));
  },

  startConnectionDrag: (roomId, direction, cursorX, cursorY) => {
    set({
      lastHistoryMergeKey: null,
      connectionDrag: {
        sourceRoomId: roomId,
        sourceDirection: normalizeDirection(direction),
        cursorX,
        cursorY,
      },
    });
  },

  updateConnectionDrag: (cursorX, cursorY) => {
    const { connectionDrag } = get();
    if (!connectionDrag) return;
    set({ connectionDrag: { ...connectionDrag, cursorX, cursorY }, lastHistoryMergeKey: null });
  },

  completeConnectionDrag: (targetRoomId, targetDirection?) => {
    const { doc, connectionDrag } = get();
    if (!doc || !connectionDrag) {
      set({ connectionDrag: null });
      return;
    }

    const { sourceRoomId, sourceDirection } = connectionDrag;
    const isSelfConnection = sourceRoomId === targetRoomId;
    const normalizedTargetDirection =
      targetDirection === undefined ? undefined : normalizeDirection(targetDirection);

    if (isSelfConnection && normalizedTargetDirection === sourceDirection) {
      set({ connectionDrag: null });
      return;
    }

    // Resolve target direction: use the explicit handle the user dropped on,
    // fall back to the opposite of the source direction, or undefined for self-connections.
    const resolvedTargetDir = normalizedTargetDirection
      ? normalizedTargetDirection
      : isSelfConnection
        ? undefined
        : oppositeDirection(sourceDirection);

    // A targeted handle creates a bidirectional connection, including for
    // self-connections. Dropping on the room body creates a one-way connection.
    const isBidirectional = targetDirection !== undefined;

    const connection = createConnection(sourceRoomId, targetRoomId, isBidirectional);

    try {
      const updatedDoc = addConnection(doc, connection, sourceDirection, resolvedTargetDir);
      set((state) => ({
        ...commitDocumentChange(state, doc, updatedDoc),
        connectionDrag: null,
      }));
    } catch {
      // Direction already bound or other validation error — just cancel
      set({ connectionDrag: null });
    }
  },

  completeConnectionDragToNewRoom: (position) => {
    const { doc, connectionDrag, snapToGridEnabled } = get();
    if (!doc || !connectionDrag) {
      set({ connectionDrag: null });
      return null;
    }

    const { sourceRoomId, sourceDirection } = connectionDrag;
    const snappedPosition = maybeSnapPosition(position, snapToGridEnabled);
    const room = { ...createRoom('Room'), position: snappedPosition };
    const connection = createConnection(sourceRoomId, room.id, true);
    const targetDirection = oppositeDirection(sourceDirection);

    try {
      let updatedDoc = addRoom(doc, room);
      updatedDoc = addConnection(updatedDoc, connection, sourceDirection, targetDirection);
      set((state) => ({
        ...commitDocumentChange(state, doc, updatedDoc),
        connectionDrag: null,
        selectedRoomIds: [room.id],
        selectedStickyNoteIds: [],
        selectedConnectionIds: [],
        selectedStickyNoteLinkIds: [],
      }));
      return room.id;
    } catch {
      set({ connectionDrag: null });
      return null;
    }
  },

  cancelConnectionDrag: () => {
    set({ connectionDrag: null, lastHistoryMergeKey: null });
  },

  startConnectionEndpointDrag: (connectionId, endpoint, cursorX, cursorY) => {
    set({
      lastHistoryMergeKey: null,
      selectedRoomIds: [],
      selectedPseudoRoomIds: [],
      selectedStickyNoteIds: [],
      selectedConnectionIds: [connectionId],
      selectedStickyNoteLinkIds: [],
      connectionEndpointDrag: {
        connectionId,
        endpoint,
        cursorX,
        cursorY,
      },
    });
  },

  updateConnectionEndpointDrag: (cursorX, cursorY) => {
    const { connectionEndpointDrag } = get();
    if (!connectionEndpointDrag) {
      return;
    }

    set({
      connectionEndpointDrag: {
        ...connectionEndpointDrag,
        cursorX,
        cursorY,
      },
      lastHistoryMergeKey: null,
    });
  },

  completeConnectionEndpointDrag: (targetRoomId, targetDirection) => {
    const { doc, connectionEndpointDrag } = get();
    if (!doc || !connectionEndpointDrag) {
      set({ connectionEndpointDrag: null });
      return;
    }

    try {
      const updatedDoc = domainRerouteConnectionEndpoint(
        doc,
        connectionEndpointDrag.connectionId,
        connectionEndpointDrag.endpoint,
        targetRoomId,
        targetDirection,
      );
      set((state) => ({
        ...commitDocumentChange(state, doc, updatedDoc),
        connectionEndpointDrag: null,
        selectedRoomIds: [],
        selectedPseudoRoomIds: [],
        selectedStickyNoteIds: [],
        selectedConnectionIds: [connectionEndpointDrag.connectionId],
        selectedStickyNoteLinkIds: [],
      }));
    } catch {
      set({ connectionEndpointDrag: null });
    }
  },

  cancelConnectionEndpointDrag: () => {
    set({ connectionEndpointDrag: null, lastHistoryMergeKey: null });
  },

  startStickyNoteLinkDrag: (stickyNoteId, cursorX, cursorY) => {
    set({
      lastHistoryMergeKey: null,
      stickyNoteLinkDrag: {
        sourceStickyNoteId: stickyNoteId,
        cursorX,
        cursorY,
      },
    });
  },

  updateStickyNoteLinkDrag: (cursorX, cursorY) => {
    const { stickyNoteLinkDrag } = get();
    if (!stickyNoteLinkDrag) {
      return;
    }

    set({ stickyNoteLinkDrag: { ...stickyNoteLinkDrag, cursorX, cursorY }, lastHistoryMergeKey: null });
  },

  completeStickyNoteLinkDrag: (target) => {
    const { doc, stickyNoteLinkDrag } = get();
    if (!doc || !stickyNoteLinkDrag) {
      set({ stickyNoteLinkDrag: null });
      return;
    }

    const stickyNoteLink = createStickyNoteLink(stickyNoteLinkDrag.sourceStickyNoteId, target);
    const updatedDoc = addStickyNoteLink(doc, stickyNoteLink);
    set((state) => ({
      ...commitDocumentChange(state, doc, updatedDoc),
      stickyNoteLinkDrag: null,
    }));
  },

  cancelStickyNoteLinkDrag: () => {
    set({ stickyNoteLinkDrag: null, lastHistoryMergeKey: null });
  },

  startRoomDrag: (roomId) => {
    set((state) => ({
      lastHistoryMergeKey: null,
      selectionDrag: {
        roomIds: (state.selectedRoomIds.includes(roomId) ? state.selectedRoomIds : [roomId]).filter(
          (selectedRoomId) => !state.doc?.rooms[selectedRoomId]?.locked,
        ),
        pseudoRoomIds: state.selectedRoomIds.includes(roomId) ? state.selectedPseudoRoomIds : [],
        stickyNoteIds: state.selectedRoomIds.includes(roomId) ? state.selectedStickyNoteIds : [],
        dx: 0,
        dy: 0,
      },
    }));
  },

  updateRoomDrag: (dx, dy) => {
    const { selectionDrag } = get();
    if (!selectionDrag) return;
    set({ selectionDrag: { ...selectionDrag, dx, dy } });
  },

  endRoomDrag: () => {
    set({ selectionDrag: null, lastHistoryMergeKey: null });
  },

  startPseudoRoomDrag: (pseudoRoomId) => {
    set((state) => ({
      lastHistoryMergeKey: null,
      selectionDrag: {
        roomIds: state.selectedPseudoRoomIds.includes(pseudoRoomId) ? state.selectedRoomIds : [],
        pseudoRoomIds: state.selectedPseudoRoomIds.includes(pseudoRoomId) ? state.selectedPseudoRoomIds : [pseudoRoomId],
        stickyNoteIds: state.selectedPseudoRoomIds.includes(pseudoRoomId) ? state.selectedStickyNoteIds : [],
        dx: 0,
        dy: 0,
      },
    }));
  },

  startStickyNoteDrag: (stickyNoteId) => {
    set((state) => ({
      lastHistoryMergeKey: null,
      selectionDrag: {
        roomIds: state.selectedStickyNoteIds.includes(stickyNoteId) ? state.selectedRoomIds : [],
        pseudoRoomIds: state.selectedStickyNoteIds.includes(stickyNoteId) ? state.selectedPseudoRoomIds : [],
        stickyNoteIds: state.selectedStickyNoteIds.includes(stickyNoteId) ? state.selectedStickyNoteIds : [stickyNoteId],
        dx: 0,
        dy: 0,
      },
    }));
  },

  updateStickyNoteDrag: (dx, dy) => {
    const { selectionDrag } = get();
    if (!selectionDrag) {
      return;
    }

    set({ selectionDrag: { ...selectionDrag, dx, dy } });
  },

  endStickyNoteDrag: () => {
    set({ selectionDrag: null, lastHistoryMergeKey: null });
  },

  beginExportRegion: (start) => {
    set({
      exportRegionDraft: {
        start,
        current: start,
      },
      exportRegion: null,
      lastHistoryMergeKey: null,
    });
  },

  updateExportRegion: (current) => {
    set((state) => (
      state.exportRegionDraft
        ? {
          exportRegionDraft: {
            ...state.exportRegionDraft,
            current,
          },
          lastHistoryMergeKey: null,
        }
        : {}
    ));
  },

  commitExportRegion: () => {
    set((state) => {
      if (!state.exportRegionDraft) {
        return {};
      }

      const { start, current } = state.exportRegionDraft;
      return {
        exportRegionDraft: null,
        exportRegion: {
          left: Math.min(start.x, current.x),
          top: Math.min(start.y, current.y),
          right: Math.max(start.x, current.x),
          bottom: Math.max(start.y, current.y),
        },
        lastHistoryMergeKey: null,
      };
    });
  },

  clearExportRegion: () => {
    set({
      exportRegionDraft: null,
      exportRegion: null,
      lastHistoryMergeKey: null,
    });
  },

  setDrawingTool: (tool) => {
    set((state) => ({
      drawingToolState: {
        ...state.drawingToolState,
        tool,
        size: tool === 'pencil'
          ? Math.min(state.drawingToolState.size, 6)
          : Math.max(state.drawingToolState.size, 1),
      },
      lastHistoryMergeKey: null,
    }));
  },

  setCanvasInteractionMode: (mode) => {
    set({
      canvasInteractionMode: mode,
      selectedRoomIds: mode === 'draw' ? [] : get().selectedRoomIds,
      selectedPseudoRoomIds: mode === 'draw' ? [] : get().selectedPseudoRoomIds,
      selectedStickyNoteIds: mode === 'draw' ? [] : get().selectedStickyNoteIds,
      selectedConnectionIds: mode === 'draw' ? [] : get().selectedConnectionIds,
      selectedStickyNoteLinkIds: mode === 'draw' ? [] : get().selectedStickyNoteLinkIds,
      lastHistoryMergeKey: null,
    });
  },

  setDrawingColor: (colorRgbHex) => {
    set((state) => ({
      drawingToolState: {
        ...state.drawingToolState,
        colorRgbHex,
      },
      lastHistoryMergeKey: null,
    }));
  },

  setDrawingFillColor: (fillColorRgbHex) => {
    set((state) => ({
      drawingToolState: {
        ...state.drawingToolState,
        fillColorRgbHex,
      },
      lastHistoryMergeKey: null,
    }));
  },

  setDrawingOpacity: (opacity) => {
    set((state) => ({
      drawingToolState: {
        ...state.drawingToolState,
        opacity,
      },
      lastHistoryMergeKey: null,
    }));
  },

  setDrawingSize: (size) => {
    set((state) => ({
      drawingToolState: {
        ...state.drawingToolState,
        size: Math.max(size, 1),
      },
      lastHistoryMergeKey: null,
    }));
  },

  setDrawingSoftness: (softness) => {
    set((state) => ({
      drawingToolState: {
        ...state.drawingToolState,
        softness,
      },
      lastHistoryMergeKey: null,
    }));
  },

  setShapeFilled: (shapeFilled) => {
    set((state) => ({
      drawingToolState: {
        ...state.drawingToolState,
        shapeFilled,
      },
      lastHistoryMergeKey: null,
    }));
  },

  setBucketTolerance: (bucketTolerance) => {
    set((state) => ({
      drawingToolState: {
        ...state.drawingToolState,
        bucketTolerance: Math.max(0, Math.min(255, Math.round(bucketTolerance))),
      },
      lastHistoryMergeKey: null,
    }));
  },

  setBucketObeyMap: (bucketObeyMap) => {
    set((state) => ({
      drawingToolState: {
        ...state.drawingToolState,
        bucketObeyMap,
      },
      lastHistoryMergeKey: null,
    }));
  },

  ensureDefaultBackgroundLayer: () => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot ensure a background layer: no document is loaded.');
    }

    const activeLayerId = doc.background.activeLayerId;
    if (activeLayerId && doc.background.layers[activeLayerId]) {
      return activeLayerId;
    }

    const existingLayer = Object.values(doc.background.layers)[0];
    if (existingLayer) {
      const updatedDoc = {
        ...doc,
        background: {
          ...doc.background,
          activeLayerId: existingLayer.id,
        },
      };
      set({ doc: updatedDoc, lastHistoryMergeKey: null });
      return existingLayer.id;
    }

    const layer = createBackgroundLayer('Background');
    const updatedDoc = {
      ...doc,
      background: {
        ...doc.background,
        layers: {
          ...doc.background.layers,
          [layer.id]: layer,
        },
        activeLayerId: layer.id,
      },
    };
    set({ doc: updatedDoc, lastHistoryMergeKey: null });
    return layer.id;
  },

  beginBackgroundStroke: (layerId) => {
    const { doc, drawingToolState } = get();
    if (!doc) {
      throw new Error('Cannot begin a background stroke: no document is loaded.');
    }

    set({
      activeStroke: {
        mapId: doc.metadata.id,
        layerId,
        tool: drawingToolState.tool,
      },
      lastHistoryMergeKey: null,
    });
  },

  cancelBackgroundStroke: () => {
    set({ activeStroke: null, lastHistoryMergeKey: null });
  },

  commitBackgroundStroke: (entry) => {
    set((state) => ({
      ...pushHistoryEntry(state, entry, null),
      activeStroke: null,
      backgroundRevision: state.backgroundRevision + 1,
    }));
  },
}));
