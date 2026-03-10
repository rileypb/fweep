import { create } from 'zustand';
import type { ConnectionAnnotation, MapDocument, Position, RoomShape, RoomStrokeStyle } from '../domain/map-types';
import { createBackgroundLayer, createRoom, createConnection, createStickyNote, createStickyNoteLink } from '../domain/map-types';
import type { ExportRegion } from '../export/export-types';
import {
  addRoom,
  addConnection,
  addStickyNote,
  addStickyNoteLink,
  renameRoom as domainRenameRoom,
  deleteRoom as domainDeleteRoom,
  deleteConnection as domainDeleteConnection,
  deleteStickyNote as domainDeleteStickyNote,
  deleteStickyNoteLink as domainDeleteStickyNoteLink,
  moveRoom as domainMoveRoom,
  moveStickyNote as domainMoveStickyNote,
  describeRoom as domainDescribeRoom,
  setStickyNoteText as domainSetStickyNoteText,
  setRoomShape as domainSetRoomShape,
  setRoomStyle as domainSetRoomStyle,
  setConnectionAnnotation as domainSetConnectionAnnotation,
  setConnectionLabels as domainSetConnectionLabels,
  setConnectionStyle as domainSetConnectionStyle,
  setRoomPositions as domainSetRoomPositions,
  setStickyNotePositions as domainSetStickyNotePositions,
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

export interface StickyNoteLinkDrag {
  readonly sourceStickyNoteId: string;
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

  /** The persisted pan offset for the current map. */
  mapPanOffset: Position;

  /** Active connection drag state, or null when not dragging. */
  connectionDrag: ConnectionDrag | null;

  /** Active sticky-note link drag state, or null when not dragging. */
  stickyNoteLinkDrag: StickyNoteLinkDrag | null;

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
  addRoomAtPosition: (name: string, position: Position) => string;

  /** Create a new sticky note at the given canvas position (snapped to grid). Returns the note ID. */
  addStickyNoteAtPosition: (text: string, position: Position) => string;

  /** Rename an existing room. */
  renameRoom: (roomId: string, name: string, options?: HistoryOptions) => void;

  /** Update an existing room's description. */
  describeRoom: (roomId: string, description: string, options?: HistoryOptions) => void;

  /** Update an existing sticky note's text. */
  setStickyNoteText: (stickyNoteId: string, text: string, options?: HistoryOptions) => void;

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

  /** Move a room to a new position (snapped to grid). */
  moveRoom: (roomId: string, position: Position) => void;

  /** Move multiple rooms to new positions in a single history step. */
  moveRooms: (positions: Readonly<Record<string, Position>>) => void;

  /** Move a sticky note to a new position (snapped to grid). */
  moveStickyNote: (stickyNoteId: string, position: Position) => void;

  /** Move multiple sticky notes to new positions in a single history step. */
  moveStickyNotes: (positions: Readonly<Record<string, Position>>) => void;

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

  /** Begin a sticky-note link drag from the sticky note body. */
  startStickyNoteLinkDrag: (stickyNoteId: string, cursorX: number, cursorY: number) => void;

  /** Update the cursor position during a sticky-note link drag. */
  updateStickyNoteLinkDrag: (cursorX: number, cursorY: number) => void;

  /** Complete a sticky-note link drag by dropping onto a room. */
  completeStickyNoteLinkDrag: (targetRoomId: string) => void;

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

function filterSelectionForDoc(doc: MapDocument | null, selectedRoomIds: readonly string[]): readonly string[] {
  if (!doc) {
    return [];
  }

  return selectedRoomIds.filter((roomId) => roomId in doc.rooms);
}

function filterStickyNoteSelectionForDoc(doc: MapDocument | null, selectedStickyNoteIds: readonly string[]): readonly string[] {
  if (!doc) {
    return [];
  }

  return selectedStickyNoteIds.filter((stickyNoteId) => stickyNoteId in doc.stickyNotes);
}

function filterConnectionSelectionForDoc(doc: MapDocument | null, selectedConnectionIds: readonly string[]): readonly string[] {
  if (!doc) {
    return [];
  }

  return selectedConnectionIds.filter((connectionId) => connectionId in doc.connections);
}

function filterStickyNoteLinkSelectionForDoc(
  doc: MapDocument | null,
  selectedStickyNoteLinkIds: readonly string[],
): readonly string[] {
  if (!doc) {
    return [];
  }

  return selectedStickyNoteLinkIds.filter((stickyNoteLinkId) => stickyNoteLinkId in doc.stickyNoteLinks);
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

function patchDocumentView(
  doc: MapDocument,
  state: Pick<EditorState, 'mapPanOffset' | 'showGridEnabled' | 'snapToGridEnabled' | 'useBezierConnectionsEnabled'>,
): MapDocument {
  return {
    ...doc,
    view: {
      pan: state.mapPanOffset,
      showGrid: state.showGridEnabled,
      snapToGrid: state.snapToGridEnabled,
      useBezierConnections: state.useBezierConnectionsEnabled,
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
  selectedStickyNoteIds: [],
  selectedConnectionIds: [],
  selectedStickyNoteLinkIds: [],
  snapToGridEnabled: true,
  showGridEnabled: true,
  useBezierConnectionsEnabled: false,
  mapPanOffset: { x: 0, y: 0 },
  connectionDrag: null,
  stickyNoteLinkDrag: null,
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

  loadDocument: (doc) => set({
    doc: patchDocumentView(doc, {
      mapPanOffset: doc.view.pan,
      showGridEnabled: doc.view.showGrid,
      snapToGridEnabled: doc.view.snapToGrid,
      useBezierConnectionsEnabled: doc.view.useBezierConnections,
    }),
    pastEntries: [],
    futureEntries: [],
    canUndo: false,
    canRedo: false,
    lastHistoryMergeKey: null,
    selectedRoomIds: [],
    selectedStickyNoteIds: [],
    selectedConnectionIds: [],
    selectedStickyNoteLinkIds: [],
    snapToGridEnabled: doc.view.snapToGrid,
    showGridEnabled: doc.view.showGrid,
    useBezierConnectionsEnabled: doc.view.useBezierConnections,
    mapPanOffset: doc.view.pan,
    connectionDrag: null,
    stickyNoteLinkDrag: null,
    selectionDrag: null,
    exportRegionDraft: null,
    exportRegion: null,
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
    selectedStickyNoteIds: [],
    selectedConnectionIds: [],
    selectedStickyNoteLinkIds: [],
    snapToGridEnabled: true,
    showGridEnabled: true,
    useBezierConnectionsEnabled: false,
    mapPanOffset: { x: 0, y: 0 },
    connectionDrag: null,
    stickyNoteLinkDrag: null,
    selectionDrag: null,
    exportRegionDraft: null,
    exportRegion: null,
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
        selectedStickyNoteIds: filterStickyNoteSelectionForDoc(nextDoc, selectedStickyNoteIds),
        selectedConnectionIds: filterConnectionSelectionForDoc(nextDoc, selectedConnectionIds),
        selectedStickyNoteLinkIds: filterStickyNoteLinkSelectionForDoc(nextDoc, selectedStickyNoteLinkIds),
        connectionDrag: null,
        stickyNoteLinkDrag: null,
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
        selectedStickyNoteIds: filterStickyNoteSelectionForDoc(patchedNextDoc, selectedStickyNoteIds),
        selectedConnectionIds: filterConnectionSelectionForDoc(patchedNextDoc, selectedConnectionIds),
        selectedStickyNoteLinkIds: filterStickyNoteLinkSelectionForDoc(patchedNextDoc, selectedStickyNoteLinkIds),
        connectionDrag: null,
        stickyNoteLinkDrag: null,
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
      selectionDrag: null,
      exportRegionDraft: null,
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
      selectedStickyNoteIds: [],
      selectedConnectionIds: [],
      selectedStickyNoteLinkIds: [],
    }));
  },

  selectRoom: (roomId) => {
    set({
      selectedRoomIds: [roomId],
      selectedStickyNoteIds: [],
      selectedConnectionIds: [],
      selectedStickyNoteLinkIds: [],
      lastHistoryMergeKey: null,
    });
  },

  selectConnection: (connectionId) => {
    set({
      selectedRoomIds: [],
      selectedStickyNoteIds: [],
      selectedConnectionIds: [connectionId],
      selectedStickyNoteLinkIds: [],
      lastHistoryMergeKey: null,
    });
  },

  selectStickyNote: (stickyNoteId) => {
    set({
      selectedRoomIds: [],
      selectedStickyNoteIds: [stickyNoteId],
      selectedConnectionIds: [],
      selectedStickyNoteLinkIds: [],
      lastHistoryMergeKey: null,
    });
  },

  selectStickyNoteLink: (stickyNoteLinkId) => {
    set({
      selectedRoomIds: [],
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
      selectedStickyNoteIds: [],
      selectedConnectionIds: [],
      selectedStickyNoteLinkIds: [],
      lastHistoryMergeKey: null,
    });
  },

  setSelectedStickyNoteIds: (stickyNoteIds) => {
    set({
      selectedRoomIds: [],
      selectedStickyNoteIds: [...stickyNoteIds],
      selectedConnectionIds: [],
      selectedStickyNoteLinkIds: [],
      lastHistoryMergeKey: null,
    });
  },

  setSelection: (roomIds, stickyNoteIds, connectionIds, stickyNoteLinkIds) => {
    set({
      selectedRoomIds: [...roomIds],
      selectedStickyNoteIds: [...stickyNoteIds],
      selectedConnectionIds: [...connectionIds],
      selectedStickyNoteLinkIds: [...stickyNoteLinkIds],
      lastHistoryMergeKey: null,
    });
  },

  clearRoomSelection: () => {
    set({ selectedRoomIds: [], lastHistoryMergeKey: null });
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

  completeStickyNoteLinkDrag: (targetRoomId) => {
    const { doc, stickyNoteLinkDrag } = get();
    if (!doc || !stickyNoteLinkDrag) {
      set({ stickyNoteLinkDrag: null });
      return;
    }

    const stickyNoteLink = createStickyNoteLink(stickyNoteLinkDrag.sourceStickyNoteId, targetRoomId);
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
        roomIds: state.selectedRoomIds.includes(roomId) ? state.selectedRoomIds : [roomId],
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

  startStickyNoteDrag: (stickyNoteId) => {
    set((state) => ({
      lastHistoryMergeKey: null,
      selectionDrag: {
        roomIds: state.selectedStickyNoteIds.includes(stickyNoteId) ? state.selectedRoomIds : [],
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
