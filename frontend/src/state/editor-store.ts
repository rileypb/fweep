import { create } from 'zustand';
import type { ConnectionAnnotation, MapDocument, Position, RoomShape, RoomStrokeStyle } from '../domain/map-types';
import { createBackgroundLayer, createRoom, createConnection } from '../domain/map-types';
import {
  addRoom,
  addConnection,
  renameRoom as domainRenameRoom,
  deleteRoom as domainDeleteRoom,
  deleteConnection as domainDeleteConnection,
  moveRoom as domainMoveRoom,
  describeRoom as domainDescribeRoom,
  setRoomShape as domainSetRoomShape,
  setRoomStyle as domainSetRoomStyle,
  setConnectionAnnotation as domainSetConnectionAnnotation,
  setConnectionLabels as domainSetConnectionLabels,
  setConnectionStyle as domainSetConnectionStyle,
  setRoomPositions as domainSetRoomPositions,
} from '../domain/map-operations';
import { normalizeDirection, oppositeDirection } from '../domain/directions';
import { computePrettifiedRoomPositions } from '../graph/prettify-layout';
import { restoreBackgroundChunks, type RasterChunkHistoryEntry } from '../storage/map-store';

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

/** State for an in-progress connection drag from a direction handle. */
export interface ConnectionDrag {
  readonly sourceRoomId: string;
  readonly sourceDirection: string;
  readonly cursorX: number;
  readonly cursorY: number;
}

/** State for a room being actively dragged (before commit). */
export interface RoomDrag {
  readonly roomIds: readonly string[];
  readonly dx: number;
  readonly dy: number;
}

export interface HistoryOptions {
  readonly historyMergeKey?: string;
}

export type DrawingTool = 'pencil' | 'brush' | 'eraser' | 'line' | 'rectangle' | 'ellipse';
export type CanvasInteractionMode = 'map' | 'draw';

export interface DrawingToolState {
  readonly tool: DrawingTool;
  readonly colorRgbHex: string;
  readonly opacity: number;
  readonly size: number;
  readonly softness: number;
  readonly shapeFilled: boolean;
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

  /** The currently selected connection IDs. */
  selectedConnectionIds: readonly string[];

  /** Whether room movement and placement snap to the grid. */
  snapToGridEnabled: boolean;

  /** Whether the current map shows the background grid. */
  showGridEnabled: boolean;

  /** The persisted pan offset for the current map. */
  mapPanOffset: Position;

  /** Active connection drag state, or null when not dragging. */
  connectionDrag: ConnectionDrag | null;

  /** Active room drag state, or null when not dragging a room. */
  roomDrag: RoomDrag | null;

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
  addRoomAtPosition: (name: string, position: Position) => string;

  /** Rename an existing room. */
  renameRoom: (roomId: string, name: string, options?: HistoryOptions) => void;

  /** Update an existing room's description. */
  describeRoom: (roomId: string, description: string, options?: HistoryOptions) => void;

  /** Update an existing room's shape. */
  setRoomShape: (roomId: string, shape: RoomShape) => void;

  /** Update an existing room's visual styling. */
  setRoomStyle: (
    roomId: string,
    style: {
      fillColorIndex?: number;
      strokeColorIndex?: number;
      strokeStyle?: RoomStrokeStyle;
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

  /** Delete all currently selected connections. */
  removeSelectedConnections: () => void;

  /** Replace the current room selection with a single room. */
  selectRoom: (roomId: string) => void;

  /** Replace the current selection with a single connection. */
  selectConnection: (connectionId: string) => void;

  /** Add a connection to the current selection. */
  addConnectionToSelection: (connectionId: string) => void;

  /** Add a room to the current selection. */
  addRoomToSelection: (roomId: string) => void;

  /** Replace the current selection with the provided room IDs. */
  setSelectedRoomIds: (roomIds: readonly string[]) => void;

  /** Replace the current selection with the provided room and connection IDs. */
  setSelection: (roomIds: readonly string[], connectionIds: readonly string[]) => void;

  /** Clear the current room selection. */
  clearRoomSelection: () => void;

  /** Clear the current connection selection. */
  clearConnectionSelection: () => void;

  /** Clear both room and connection selection. */
  clearSelection: () => void;

  /** Toggle grid snapping for room movement and placement. */
  toggleSnapToGrid: () => void;

  /** Toggle the background grid visibility for the current map. */
  toggleShowGrid: () => void;

  /** Persist the current map pan offset without adding a history entry. */
  setMapPanOffset: (position: Position) => void;

  /** Move a room to a new position (snapped to grid). */
  moveRoom: (roomId: string, position: Position) => void;

  /** Move multiple rooms to new positions in a single history step. */
  moveRooms: (positions: Readonly<Record<string, Position>>) => void;

  /** Recompute room positions from the connection graph. */
  prettifyLayout: () => void;

  /** Begin a connection drag from a direction handle. */
  startConnectionDrag: (roomId: string, direction: string, cursorX: number, cursorY: number) => void;

  /** Update the cursor position during a connection drag. */
  updateConnectionDrag: (cursorX: number, cursorY: number) => void;

  /** Complete a connection drag by dropping onto a target room, optionally on a specific direction handle. */
  completeConnectionDrag: (targetRoomId: string, targetDirection?: string) => void;

  /** Cancel an in-progress connection drag. */
  cancelConnectionDrag: () => void;

  /** Start a room drag. */
  startRoomDrag: (roomId: string) => void;

  /** Update the room drag offset. */
  updateRoomDrag: (dx: number, dy: number) => void;

  /** End the room drag and clear the state. */
  endRoomDrag: () => void;

  /** Update the selected drawing tool. */
  setDrawingTool: (tool: DrawingTool) => void;

  /** Update the primary empty-canvas interaction mode. */
  setCanvasInteractionMode: (mode: CanvasInteractionMode) => void;

  /** Update the drawing color hex value. */
  setDrawingColor: (colorRgbHex: string) => void;

  /** Update tool opacity. */
  setDrawingOpacity: (opacity: number) => void;

  /** Update tool size. */
  setDrawingSize: (size: number) => void;

  /** Update tool softness. */
  setDrawingSoftness: (softness: number) => void;

  /** Update whether shape tools fill their interior. */
  setShapeFilled: (shapeFilled: boolean) => void;

  /** Ensure a default background layer exists and return its ID. */
  ensureDefaultBackgroundLayer: () => string;

  /** Begin a background stroke. */
  beginBackgroundStroke: (layerId: string) => void;

  /** Cancel the active background stroke. */
  cancelBackgroundStroke: () => void;

  /** Commit a completed background stroke to history. */
  commitBackgroundStroke: (entry: BackgroundStrokeHistoryEntry) => void;
}

function filterSelectionForDoc(doc: MapDocument | null, selectedRoomIds: readonly string[]): readonly string[] {
  if (!doc) {
    return [];
  }

  return selectedRoomIds.filter((roomId) => roomId in doc.rooms);
}

function filterConnectionSelectionForDoc(doc: MapDocument | null, selectedConnectionIds: readonly string[]): readonly string[] {
  if (!doc) {
    return [];
  }

  return selectedConnectionIds.filter((connectionId) => connectionId in doc.connections);
}

function pushHistoryEntry(
  currentState: EditorState,
  entry: EditorHistoryEntry,
  mergeKey: string | null,
): Pick<EditorState, 'pastEntries' | 'futureEntries' | 'canUndo' | 'canRedo' | 'lastHistoryMergeKey'> {
  const shouldMerge = mergeKey !== null && currentState.lastHistoryMergeKey === mergeKey;
  const nextPastEntries = shouldMerge
    ? currentState.pastEntries.slice(0, -1).concat((() => {
      const previousEntry = currentState.pastEntries[currentState.pastEntries.length - 1];
      if (entry.kind === 'document' && previousEntry?.kind === 'document') {
        return {
          kind: 'document' as const,
          before: previousEntry.before,
          after: entry.after,
        };
      }
      return entry;
    })())
    : [...currentState.pastEntries, entry];

  return {
    pastEntries: nextPastEntries,
    futureEntries: [],
    canUndo: nextPastEntries.length > 0,
    canRedo: false,
    lastHistoryMergeKey: mergeKey,
  };
}

function commitDocumentChange(
  currentState: EditorState,
  currentDoc: MapDocument,
  updatedDoc: MapDocument,
  options?: HistoryOptions,
): Partial<EditorState> {
  if (updatedDoc === currentDoc) {
    return {};
  }

  const mergeKey = options?.historyMergeKey ?? null;
  return {
    doc: updatedDoc,
    ...pushHistoryEntry(
      currentState,
      { kind: 'document', before: currentDoc, after: updatedDoc },
      mergeKey,
    ),
  };
}

function patchDocumentView(doc: MapDocument, state: Pick<EditorState, 'mapPanOffset' | 'showGridEnabled' | 'snapToGridEnabled'>): MapDocument {
  return {
    ...doc,
    view: {
      pan: state.mapPanOffset,
      showGrid: state.showGridEnabled,
      snapToGrid: state.snapToGridEnabled,
    },
  };
}

export const useEditorStore = create<EditorState>((set, get) => ({
  doc: null,
  pastEntries: [],
  futureEntries: [],
  canUndo: false,
  canRedo: false,
  lastHistoryMergeKey: null,
  selectedRoomIds: [],
  selectedConnectionIds: [],
  snapToGridEnabled: true,
  showGridEnabled: true,
  mapPanOffset: { x: 0, y: 0 },
  connectionDrag: null,
  roomDrag: null,
  drawingToolState: {
    tool: 'pencil',
    colorRgbHex: '#000000',
    opacity: 1,
    size: 1,
    softness: 0.5,
    shapeFilled: false,
  },
  canvasInteractionMode: 'map',
  activeStroke: null,
  backgroundRevision: 0,

  loadDocument: (doc) => set({
    doc: patchDocumentView(doc, {
      mapPanOffset: doc.view.pan,
      showGridEnabled: doc.view.showGrid,
      snapToGridEnabled: doc.view.snapToGrid,
    }),
    pastEntries: [],
    futureEntries: [],
    canUndo: false,
    canRedo: false,
    lastHistoryMergeKey: null,
    selectedRoomIds: [],
    selectedConnectionIds: [],
    snapToGridEnabled: doc.view.snapToGrid,
    showGridEnabled: doc.view.showGrid,
    mapPanOffset: doc.view.pan,
    connectionDrag: null,
    roomDrag: null,
    canvasInteractionMode: 'map',
    activeStroke: null,
    backgroundRevision: 0,
  }),

  unloadDocument: () => set({
    doc: null,
    pastEntries: [],
    futureEntries: [],
    canUndo: false,
    canRedo: false,
    lastHistoryMergeKey: null,
    selectedRoomIds: [],
    selectedConnectionIds: [],
    snapToGridEnabled: true,
    showGridEnabled: true,
    mapPanOffset: { x: 0, y: 0 },
    connectionDrag: null,
    roomDrag: null,
    canvasInteractionMode: 'map',
    activeStroke: null,
    backgroundRevision: 0,
  }),

  undo: async () => {
    const {
      doc,
      pastEntries,
      futureEntries,
      selectedRoomIds,
      selectedConnectionIds,
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
        selectedConnectionIds: filterConnectionSelectionForDoc(nextDoc, selectedConnectionIds),
        connectionDrag: null,
        roomDrag: null,
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
      roomDrag: null,
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
      selectedConnectionIds,
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
        selectedConnectionIds: filterConnectionSelectionForDoc(patchedNextDoc, selectedConnectionIds),
        connectionDrag: null,
        roomDrag: null,
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
      roomDrag: null,
      activeStroke: null,
      backgroundRevision: state.backgroundRevision + 1,
    }));
  },

  addRoomAtPosition: (name, position) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot add a room: no document is loaded.');
    }

    const snapped = maybeSnapPosition(position, get().snapToGridEnabled);
    const room = { ...createRoom(name), position: snapped };
    const updatedDoc = addRoom(doc, room);
    set((state) => commitDocumentChange(state, doc, updatedDoc));
    return room.id;
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

  setRoomShape: (roomId, shape) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot set room shape: no document is loaded.');
    }
    const updatedDoc = domainSetRoomShape(doc, roomId, shape);
    set((state) => commitDocumentChange(state, doc, updatedDoc));
  },

  setRoomStyle: (roomId, style) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot set room style: no document is loaded.');
    }
    const updatedDoc = domainSetRoomStyle(doc, roomId, style);
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

  selectRoom: (roomId) => {
    set({ selectedRoomIds: [roomId], selectedConnectionIds: [], lastHistoryMergeKey: null });
  },

  selectConnection: (connectionId) => {
    set({ selectedRoomIds: [], selectedConnectionIds: [connectionId], lastHistoryMergeKey: null });
  },

  addRoomToSelection: (roomId) => {
    set((state) => ({
      lastHistoryMergeKey: null,
      selectedRoomIds: state.selectedRoomIds.includes(roomId)
        ? state.selectedRoomIds
        : [...state.selectedRoomIds, roomId],
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

  setSelectedRoomIds: (roomIds) => {
    set({ selectedRoomIds: [...roomIds], selectedConnectionIds: [], lastHistoryMergeKey: null });
  },

  setSelection: (roomIds, connectionIds) => {
    set({
      selectedRoomIds: [...roomIds],
      selectedConnectionIds: [...connectionIds],
      lastHistoryMergeKey: null,
    });
  },

  clearRoomSelection: () => {
    set({ selectedRoomIds: [], lastHistoryMergeKey: null });
  },

  clearConnectionSelection: () => {
    set({ selectedConnectionIds: [], lastHistoryMergeKey: null });
  },

  clearSelection: () => {
    set({ selectedRoomIds: [], selectedConnectionIds: [], lastHistoryMergeKey: null });
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

  moveRoom: (roomId, position) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot move a room: no document is loaded.');
    }
    const snapped = maybeSnapPosition(position, get().snapToGridEnabled);
    const updatedDoc = domainMoveRoom(doc, roomId, snapped);
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

  prettifyLayout: () => {
    const { doc } = get();
    if (!doc) {
      return;
    }

    const nextPositions = computePrettifiedRoomPositions(doc);
    const updatedDoc = domainSetRoomPositions(doc, nextPositions);
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

    // Resolve target direction: use the explicit handle the user dropped on,
    // fall back to the opposite of the source direction, or undefined for self-connections.
    const resolvedTargetDir = targetDirection
      ? normalizeDirection(targetDirection)
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

  cancelConnectionDrag: () => {
    set({ connectionDrag: null, lastHistoryMergeKey: null });
  },

  startRoomDrag: (roomId) => {
    set((state) => ({
      lastHistoryMergeKey: null,
      roomDrag: {
        roomIds: state.selectedRoomIds.includes(roomId) ? state.selectedRoomIds : [roomId],
        dx: 0,
        dy: 0,
      },
    }));
  },

  updateRoomDrag: (dx, dy) => {
    const { roomDrag } = get();
    if (!roomDrag) return;
    set({ roomDrag: { ...roomDrag, dx, dy } });
  },

  endRoomDrag: () => {
    set({ roomDrag: null, lastHistoryMergeKey: null });
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
