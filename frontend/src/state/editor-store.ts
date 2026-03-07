import { create } from 'zustand';
import type { MapDocument, Position, RoomShape } from '../domain/map-types';
import { createRoom, createConnection } from '../domain/map-types';
import {
  addRoom,
  addConnection,
  renameRoom as domainRenameRoom,
  deleteRoom as domainDeleteRoom,
  moveRoom as domainMoveRoom,
  describeRoom as domainDescribeRoom,
  setRoomShape as domainSetRoomShape,
} from '../domain/map-operations';
import { normalizeDirection, oppositeDirection } from '../domain/directions';

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

export interface EditorState {
  /** The currently loaded map document, or null when no map is open. */
  doc: MapDocument | null;

  /** The currently selected room IDs. */
  selectedRoomIds: readonly string[];

  /** Active connection drag state, or null when not dragging. */
  connectionDrag: ConnectionDrag | null;

  /** Active room drag state, or null when not dragging a room. */
  roomDrag: RoomDrag | null;

  /** Load a map document into the editor. */
  loadDocument: (doc: MapDocument) => void;

  /** Clear the active document. */
  unloadDocument: () => void;

  /** Create a new room at the given canvas position (snapped to grid). Returns the room ID. */
  addRoomAtPosition: (name: string, position: Position) => string;

  /** Rename an existing room. */
  renameRoom: (roomId: string, name: string) => void;

  /** Update an existing room's description. */
  describeRoom: (roomId: string, description: string) => void;

  /** Update an existing room's shape. */
  setRoomShape: (roomId: string, shape: RoomShape) => void;

  /** Delete an existing room and cascade-remove its connections and items. */
  removeRoom: (roomId: string) => void;

  /** Replace the current room selection with a single room. */
  selectRoom: (roomId: string) => void;

  /** Add a room to the current selection. */
  addRoomToSelection: (roomId: string) => void;

  /** Replace the current selection with the provided room IDs. */
  setSelectedRoomIds: (roomIds: readonly string[]) => void;

  /** Clear the current room selection. */
  clearRoomSelection: () => void;

  /** Move a room to a new position (snapped to grid). */
  moveRoom: (roomId: string, position: Position) => void;

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

export const useEditorStore = create<EditorState>((set, get) => ({
  doc: null,
  selectedRoomIds: [],
  connectionDrag: null,
  roomDrag: null,

  loadDocument: (doc) => set({ doc, selectedRoomIds: [] }),

  unloadDocument: () => set({ doc: null, selectedRoomIds: [], connectionDrag: null, roomDrag: null }),

  addRoomAtPosition: (name, position) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot add a room: no document is loaded.');
    }

    const snapped = snapPosition(position);
    const room = { ...createRoom(name), position: snapped };
    const updatedDoc = addRoom(doc, room);
    set({ doc: updatedDoc });
    return room.id;
  },

  renameRoom: (roomId, name) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot rename a room: no document is loaded.');
    }
    set({ doc: domainRenameRoom(doc, roomId, name) });
  },

  describeRoom: (roomId, description) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot describe a room: no document is loaded.');
    }
    set({ doc: domainDescribeRoom(doc, roomId, description) });
  },

  setRoomShape: (roomId, shape) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot set room shape: no document is loaded.');
    }
    set({ doc: domainSetRoomShape(doc, roomId, shape) });
  },

  removeRoom: (roomId) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot remove a room: no document is loaded.');
    }
    set((state) => ({
      doc: domainDeleteRoom(doc, roomId),
      selectedRoomIds: state.selectedRoomIds.filter((id) => id !== roomId),
    }));
  },

  selectRoom: (roomId) => {
    set({ selectedRoomIds: [roomId] });
  },

  addRoomToSelection: (roomId) => {
    set((state) => ({
      selectedRoomIds: state.selectedRoomIds.includes(roomId)
        ? state.selectedRoomIds
        : [...state.selectedRoomIds, roomId],
    }));
  },

  setSelectedRoomIds: (roomIds) => {
    set({ selectedRoomIds: [...roomIds] });
  },

  clearRoomSelection: () => {
    set({ selectedRoomIds: [] });
  },

  moveRoom: (roomId, position) => {
    const { doc } = get();
    if (!doc) {
      throw new Error('Cannot move a room: no document is loaded.');
    }
    const snapped = snapPosition(position);
    set({ doc: domainMoveRoom(doc, roomId, snapped) });
  },

  startConnectionDrag: (roomId, direction, cursorX, cursorY) => {
    set({
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
    set({ connectionDrag: { ...connectionDrag, cursorX, cursorY } });
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
      set({ doc: updatedDoc, connectionDrag: null });
    } catch {
      // Direction already bound or other validation error — just cancel
      set({ connectionDrag: null });
    }
  },

  cancelConnectionDrag: () => {
    set({ connectionDrag: null });
  },

  startRoomDrag: (roomId) => {
    set((state) => ({
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
    set({ roomDrag: null });
  },
}));
