import { create } from 'zustand';
import type { MapDocument, Position, RoomShape, RoomStrokeStyle } from '../domain/map-types';
import { createRoom, createConnection } from '../domain/map-types';
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
  setRoomPositions as domainSetRoomPositions,
} from '../domain/map-operations';
import { normalizeDirection, oppositeDirection } from '../domain/directions';
import { computePrettifiedRoomPositions } from '../graph/prettify-layout';

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

export interface EditorState {
  /** The currently loaded map document, or null when no map is open. */
  doc: MapDocument | null;

  /** Prior document snapshots available for undo. */
  pastDocs: readonly MapDocument[];

  /** Future document snapshots available for redo. */
  futureDocs: readonly MapDocument[];

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

  /** Active connection drag state, or null when not dragging. */
  connectionDrag: ConnectionDrag | null;

  /** Active room drag state, or null when not dragging a room. */
  roomDrag: RoomDrag | null;

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
      fillColor?: string;
      strokeColor?: string;
      strokeStyle?: RoomStrokeStyle;
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
  const shouldMerge = mergeKey !== null && currentState.lastHistoryMergeKey === mergeKey;
  const nextPastDocs = shouldMerge ? currentState.pastDocs : [...currentState.pastDocs, currentDoc];

  return {
    doc: updatedDoc,
    pastDocs: nextPastDocs,
    futureDocs: [],
    canUndo: nextPastDocs.length > 0,
    canRedo: false,
    lastHistoryMergeKey: mergeKey,
  };
}

export const useEditorStore = create<EditorState>((set, get) => ({
  doc: null,
  pastDocs: [],
  futureDocs: [],
  canUndo: false,
  canRedo: false,
  lastHistoryMergeKey: null,
  selectedRoomIds: [],
  selectedConnectionIds: [],
  snapToGridEnabled: true,
  connectionDrag: null,
  roomDrag: null,

  loadDocument: (doc) => set({
    doc,
    pastDocs: [],
    futureDocs: [],
    canUndo: false,
    canRedo: false,
    lastHistoryMergeKey: null,
    selectedRoomIds: [],
    selectedConnectionIds: [],
    connectionDrag: null,
    roomDrag: null,
  }),

  unloadDocument: () => set({
    doc: null,
    pastDocs: [],
    futureDocs: [],
    canUndo: false,
    canRedo: false,
    lastHistoryMergeKey: null,
    selectedRoomIds: [],
    selectedConnectionIds: [],
    connectionDrag: null,
    roomDrag: null,
  }),

  undo: () => {
    const { doc, pastDocs, futureDocs, selectedRoomIds, selectedConnectionIds } = get();
    if (!doc || pastDocs.length === 0) {
      return;
    }

    const previousDoc = pastDocs[pastDocs.length - 1];
    const nextPastDocs = pastDocs.slice(0, -1);
    const nextFutureDocs = [doc, ...futureDocs];

    set({
      doc: previousDoc,
      pastDocs: nextPastDocs,
      futureDocs: nextFutureDocs,
      canUndo: nextPastDocs.length > 0,
      canRedo: true,
      lastHistoryMergeKey: null,
      selectedRoomIds: filterSelectionForDoc(previousDoc, selectedRoomIds),
      selectedConnectionIds: filterConnectionSelectionForDoc(previousDoc, selectedConnectionIds),
      connectionDrag: null,
      roomDrag: null,
    });
  },

  redo: () => {
    const { doc, pastDocs, futureDocs, selectedRoomIds, selectedConnectionIds } = get();
    if (!doc || futureDocs.length === 0) {
      return;
    }

    const nextDoc = futureDocs[0];
    const nextFutureDocs = futureDocs.slice(1);
    const nextPastDocs = [...pastDocs, doc];

    set({
      doc: nextDoc,
      pastDocs: nextPastDocs,
      futureDocs: nextFutureDocs,
      canUndo: true,
      canRedo: nextFutureDocs.length > 0,
      lastHistoryMergeKey: null,
      selectedRoomIds: filterSelectionForDoc(nextDoc, selectedRoomIds),
      selectedConnectionIds: filterConnectionSelectionForDoc(nextDoc, selectedConnectionIds),
      connectionDrag: null,
      roomDrag: null,
    });
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
    set((state) => ({ snapToGridEnabled: !state.snapToGridEnabled, lastHistoryMergeKey: null }));
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
}));
