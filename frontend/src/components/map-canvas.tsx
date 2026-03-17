import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPseudoRoom, createRoom, type Position, type PseudoRoomKind, type Room } from '../domain/map-types';
import { getPseudoRoomNodeDimensions } from '../domain/pseudo-room-helpers';
import { getPseudoRoomSymbolDefinition, PSEUDO_ROOM_SYMBOL_VIEWBOX_SIZE, pseudoRoomPathCommandsToSvgPath } from '../domain/pseudo-room-symbols';
import { MapMinimap } from './map-minimap';
import { useEditorStore } from '../state/editor-store';
import { clampMapViewportZoom, useMapViewport } from './use-map-viewport';
import {
  findNearestRoomInDirection,
  getConnectionsWithinSelectionBox,
  getPseudoRoomsWithinSelectionBox,
  getRoomScreenGeometry,
  getStickyNoteLinksWithinSelectionBox,
  getStickyNotesWithinSelectionBox,
  getRoomsWithinSelectionBox,
  getSelectionBounds,
  isEditableTarget,
  type SelectionBox,
  useDocumentTheme,
} from './map-canvas-helpers';
import {
  ConnectionEditorOverlay,
  RoomEditorOverlay,
} from './map-canvas-overlays';
import { MapCanvasRoomNode } from './map-canvas-room-node';
import { MapCanvasPseudoRoomNode } from './map-canvas-pseudo-room-node';
import { MapCanvasStickyNote } from './map-canvas-sticky-note';
import { MapCanvasConnections } from './map-canvas-connections';
import { MapCanvasBackground, type MapCanvasBackgroundHandle } from './map-canvas-background';
import { MapCanvasReferenceImage } from './map-canvas-reference-image';
import { MapDrawingToolbar } from './map-drawing-toolbar';
import { BackgroundImageControls } from './background-image-controls';
import { ExportPngDialog } from './export-png-dialog';
import { PrettifyButton } from './prettify-button';
import { RedoButton } from './redo-button';
import { UndoButton } from './undo-button';
import { getRoomNodeDimensions } from '../graph/room-label-geometry';
import { getStickyNoteHeight, STICKY_NOTE_WIDTH } from '../graph/sticky-note-geometry';
import {
  BUCKET_FILL_MAX_RADIUS,
  blobToCanvas,
  canvasToBlob,
  compositeStrokePreview,
  constrainLineToCompassDirection,
  constrainEllipseToCircle,
  constrainRectangleToSquare,
  createSizedCanvas,
  drawMapObstacleMask,
  drawBucketFill,
  createRasterCanvas,
  drawEllipseStroke,
  drawRectangleStroke,
  drawStrokeSegment,
  getBoundsFromPoints,
  getChunkCoverageForRect,
  getChunkCoverageForPoint,
  getChunkCoordinatesForPoint,
  getInterpolatedLinePoints,
  getLocalChunkPoint,
  getToolStampRadius,
  isCanvasEmpty,
  normalizeHexColor,
  supportsRasterCanvas,
  type MapPixelPoint,
} from './map-background-raster';
import type { ExportScope } from '../export/export-types';

const DOWNLOAD_SOLID_FULL_PATH = 'M352 96C352 78.3 337.7 64 320 64C302.3 64 288 78.3 288 96L288 306.7L246.6 265.3C234.1 252.8 213.8 252.8 201.3 265.3C188.8 277.8 188.8 298.1 201.3 310.6L297.3 406.6C309.8 419.1 330.1 419.1 342.6 406.6L438.6 310.6C451.1 298.1 451.1 277.8 438.6 265.3C426.1 252.8 405.8 252.8 393.3 265.3L352 306.7L352 96zM160 384C124.7 384 96 412.7 96 448L96 480C96 515.3 124.7 544 160 544L480 544C515.3 544 544 515.3 544 480L544 448C544 412.7 515.3 384 480 384L433.1 384L376.5 440.6C345.3 471.8 294.6 471.8 263.4 440.6L206.9 384L160 384zM464 440C477.3 440 488 450.7 488 464C488 477.3 477.3 488 464 488C450.7 488 440 477.3 440 464C440 450.7 450.7 440 464 440z';
import {
  deleteBackgroundChunks,
  loadBackgroundChunk,
  saveBackgroundChunks,
  getBackgroundChunkKey,
} from '../storage/map-store';

interface StrokeChunkState {
  readonly chunkX: number;
  readonly chunkY: number;
  readonly key: string;
  readonly beforeBlob: Blob | null;
  readonly baseCanvas: HTMLCanvasElement;
  readonly strokeCanvas: HTMLCanvasElement;
  readonly previewCanvas: HTMLCanvasElement;
}

interface ActiveDrawingStroke {
  readonly layerId: string;
  readonly toolState: ReturnType<typeof getDrawingToolSnapshot>;
  readonly maskToolState: ReturnType<typeof getDrawingToolSnapshot>;
  readonly startPoint: MapPixelPoint;
  lastPoint: MapPixelPoint;
  readonly chunks: Map<string, StrokeChunkState>;
}

function isDrawingInterfaceEnabled(): boolean {
  return (
    (globalThis as typeof globalThis & { __FWEEP_TEST_ENABLE_DRAWING_INTERFACE__?: boolean })
      .__FWEEP_TEST_ENABLE_DRAWING_INTERFACE__
  ) ?? false;
}

function getDrawingToolSnapshot(): ReturnType<typeof useEditorStore.getState>['drawingToolState'] {
  const { drawingToolState } = useEditorStore.getState();
  return {
    ...drawingToolState,
    colorRgbHex: normalizeHexColor(drawingToolState.colorRgbHex),
    fillColorRgbHex: normalizeHexColor(drawingToolState.fillColorRgbHex),
  };
}

function isCanvasChromeTarget(target: Element | null): boolean {
  return Boolean(target?.closest(
    '[data-room-id], [data-sticky-note-id], [data-connection-id], [data-sticky-note-link-id], .map-drawing-toolbar, .map-canvas-actions',
  ));
}

function isUndoShortcut(event: { ctrlKey: boolean; metaKey: boolean; altKey: boolean; key: string }): boolean {
  return (event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'z';
}

function isRedoShortcut(event: { ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean; key: string }): boolean {
  return (
    (event.ctrlKey || event.metaKey)
    && !event.altKey
    && ((event.key.toLowerCase() === 'z' && event.shiftKey) || (event.key.toLowerCase() === 'y' && !event.shiftKey))
  );
}

function centerToTopLeft(position: Position, width: number, height: number): Position {
  return {
    x: position.x - (width / 2),
    y: position.y - (height / 2),
  };
}

function getNewRoomTopLeftPosition(position: Position, visualStyle: ReturnType<typeof useEditorStore.getState>['mapVisualStyle']): Position {
  const dimensions = getRoomNodeDimensions(createRoom('Room'), visualStyle);
  return centerToTopLeft(position, dimensions.width, dimensions.height);
}

function getNewPseudoRoomTopLeftPosition(position: Position, kind: PseudoRoomKind, visualStyle: ReturnType<typeof useEditorStore.getState>['mapVisualStyle']): Position {
  const dimensions = getPseudoRoomNodeDimensions(createPseudoRoom(kind), visualStyle);
  return centerToTopLeft(position, dimensions.width, dimensions.height);
}

function getNewStickyNoteTopLeftPosition(position: Position, text: string): Position {
  return centerToTopLeft(position, STICKY_NOTE_WIDTH, getStickyNoteHeight(text));
}

export interface MapCanvasProps {
  mapName: string;
  showGrid?: boolean;
  onBack?: () => void;
  visibleMapLeftInset?: number;
  requestedRoomEditorRequest?: { readonly roomId: string; readonly requestId: number } | null;
  requestedRoomRevealRequest?: { readonly roomId: string; readonly requestId: number } | null;
  requestedViewportFocusRequest?: { readonly roomIds: readonly string[]; readonly requestId: number } | null;
  onRequestedRoomEditorHandled?: (requestId: number) => void;
  onRequestedRoomRevealHandled?: (requestId: number) => void;
  onRequestedViewportFocusHandled?: (requestId: number) => void;
}

interface RoomEditorState {
  readonly roomId?: string;
  readonly pseudoRoomId?: string;
  readonly initialPosition?: Position;
}

interface PendingConnectionDrop {
  readonly position: Position;
  readonly screenX: number;
  readonly screenY: number;
}

interface PseudoRoomMenuButtonProps {
  readonly kind: PseudoRoomKind;
  readonly label: string;
  readonly onSelect: (kind: PseudoRoomKind) => void;
}

function PseudoRoomMenuButton({ kind, label, onSelect }: PseudoRoomMenuButtonProps): React.JSX.Element {
  const symbolDefinition = getPseudoRoomSymbolDefinition(kind);
  const symbolViewBoxSize = symbolDefinition.viewBoxSize ?? PSEUDO_ROOM_SYMBOL_VIEWBOX_SIZE;

  return (
    <button
      type="button"
      className="map-canvas-connection-create-icon-button"
      aria-label={label}
      title={label}
      onClick={() => onSelect(kind)}
    >
      <svg
        className="map-canvas-connection-create-icon"
        width="52"
        height="52"
        viewBox={`0 0 ${symbolViewBoxSize} ${symbolViewBoxSize}`}
        aria-hidden="true"
      >
        {symbolDefinition.paths.map((path, index) => (
          <path
            key={`${kind}-stroke-${index}`}
            d={pseudoRoomPathCommandsToSvgPath(path.commands)}
            fill="none"
            stroke="currentColor"
            strokeWidth={path.strokeWidth}
            strokeLinecap={path.lineCap}
            strokeLinejoin={path.lineJoin}
          />
        ))}
        {(symbolDefinition.circles ?? []).map((circle, index) => (
          <circle
            key={`${kind}-circle-${index}`}
            cx={circle.cx}
            cy={circle.cy}
            r={circle.r}
            fill="currentColor"
          />
        ))}
        {(symbolDefinition.filledPaths ?? []).map((path, index) => (
          <path
            key={`${kind}-fill-${index}`}
            d={path.d}
            fill="currentColor"
          />
        ))}
      </svg>
    </button>
  );
}

export function MapCanvas({
  mapName,
  showGrid: initialShowGrid = true,
  visibleMapLeftInset = 0,
  requestedRoomEditorRequest = null,
  requestedRoomRevealRequest = null,
  requestedViewportFocusRequest = null,
  onRequestedRoomEditorHandled,
  onRequestedRoomRevealHandled,
  onRequestedViewportFocusHandled,
}: MapCanvasProps): React.JSX.Element {
  const drawingInterfaceEnabled = isDrawingInterfaceEnabled();
  const [roomEditorState, setRoomEditorState] = useState<RoomEditorState | null>(null);
  const roomEditorId = roomEditorState?.roomId ?? null;
  const isRoomEditorOpen = roomEditorState !== null;
  const [connectionEditorId, setConnectionEditorId] = useState<string | null>(null);
  const [stickyNoteEditorId, setStickyNoteEditorId] = useState<string | null>(null);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isPickingExportRegion, setIsPickingExportRegion] = useState(false);
  const [exportScope, setExportScope] = useState<ExportScope>('entire-map');
  const [preferredExportScope, setPreferredExportScope] = useState<ExportScope | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [isAutoPanning, setIsAutoPanning] = useState(false);
  const [isShiftKeyDown, setIsShiftKeyDown] = useState(false);
  const [isRoomPlacementArmed, setIsRoomPlacementArmed] = useState(false);
  const [isNotePlacementArmed, setIsNotePlacementArmed] = useState(false);
  const [pendingConnectionDrop, setPendingConnectionDrop] = useState<PendingConnectionDrop | null>(null);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const doc = useEditorStore((s) => s.doc);
  const selectedRoomIds = useEditorStore((s) => s.selectedRoomIds);
  const selectedPseudoRoomIds = useEditorStore((s) => s.selectedPseudoRoomIds);
  const selectedStickyNoteIds = useEditorStore((s) => s.selectedStickyNoteIds);
  const selectedConnectionIds = useEditorStore((s) => s.selectedConnectionIds);
  const selectedStickyNoteLinkIds = useEditorStore((s) => s.selectedStickyNoteLinkIds);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const addStickyNoteAtPosition = useEditorStore((s) => s.addStickyNoteAtPosition);
  const completeConnectionDragToNewRoom = useEditorStore((s) => s.completeConnectionDragToNewRoom);
  const createPseudoRoomAndConnect = useEditorStore((s) => s.createPseudoRoomAndConnect);
  const setSelection = useEditorStore((s) => s.setSelection);
  const addPseudoRoomToSelection = useEditorStore((s) => s.addPseudoRoomToSelection);
  const exportRegionDraft = useEditorStore((s) => s.exportRegionDraft);
  const exportRegion = useEditorStore((s) => s.exportRegion);
  const beginExportRegion = useEditorStore((s) => s.beginExportRegion);
  const updateExportRegion = useEditorStore((s) => s.updateExportRegion);
  const commitExportRegion = useEditorStore((s) => s.commitExportRegion);
  const clearExportRegion = useEditorStore((s) => s.clearExportRegion);
  const removeSelectedEntities = useEditorStore((s) => s.removeSelectedEntities);
  const toggleSelectedRoomLocks = useEditorStore((s) => s.toggleSelectedRoomLocks);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const connectionDrag = useEditorStore((s) => s.connectionDrag);
  const connectionEndpointDrag = useEditorStore((s) => s.connectionEndpointDrag);
  const cancelConnectionEndpointDrag = useEditorStore((s) => s.cancelConnectionEndpointDrag);
  const activeStroke = useEditorStore((s) => s.activeStroke);
  const backgroundRevision = useEditorStore((s) => s.backgroundRevision);
  const canvasInteractionMode = useEditorStore((s) => s.canvasInteractionMode);
  const showGridEnabled = useEditorStore((s) => s.showGridEnabled);
  const persistedPanOffset = useEditorStore((s) => s.mapPanOffset);
  const persistedZoom = useEditorStore((s) => s.mapZoom);
  const mapVisualStyle = useEditorStore((s) => s.mapVisualStyle);
  const setMapPanOffset = useEditorStore((s) => s.setMapPanOffset);
  const setMapZoom = useEditorStore((s) => s.setMapZoom);
  const setCanvasInteractionMode = useEditorStore((s) => s.setCanvasInteractionMode);
  const ensureDefaultBackgroundLayer = useEditorStore((s) => s.ensureDefaultBackgroundLayer);
  const beginBackgroundStroke = useEditorStore((s) => s.beginBackgroundStroke);
  const cancelBackgroundStroke = useEditorStore((s) => s.cancelBackgroundStroke);
  const commitBackgroundStroke = useEditorStore((s) => s.commitBackgroundStroke);
  const suppressCanvasClickRef = useRef(false);
  const persistPanTimeoutRef = useRef<number | null>(null);
  const persistZoomTimeoutRef = useRef<number | null>(null);
  const backgroundRef = useRef<MapCanvasBackgroundHandle | null>(null);
  const drawingStrokeRef = useRef<ActiveDrawingStroke | null>(null);
  const theme = useDocumentTheme();
  const {
    canvasRef,
    canvasRect,
    effectiveCanvasRect,
    panOffset,
    panOffsetRef,
    zoom,
    zoomRef,
    setPanOffset,
    panBy,
    centerOnMapPoint,
    toMapPoint,
    zoomAtClientPoint,
  } = useMapViewport({ initialPanOffset: persistedPanOffset, initialZoom: persistedZoom });

  const showGrid = doc ? showGridEnabled : initialShowGrid;
  const effectiveCanvasInteractionMode = drawingInterfaceEnabled ? canvasInteractionMode : 'map';
  const minimapBackground = drawingInterfaceEnabled && doc ? doc.background : {
    activeLayerId: null,
    layers: {},
    referenceImage: null,
  };

  const rooms = doc ? Object.values(doc.rooms) : [];
  const itemsByRoomId = doc
    ? Object.values(doc.items).reduce<Record<string, (typeof doc.items)[string][]>>((groups, item) => {
      groups[item.roomId] ??= [];
      groups[item.roomId].push(item);
      return groups;
    }, {})
    : {};
  const pseudoRooms = doc ? Object.values(doc.pseudoRooms) : [];
  const stickyNotes = doc ? Object.values(doc.stickyNotes) : [];
  const hasExportSelection = selectedRoomIds.length > 0
    || selectedPseudoRoomIds.length > 0
    || selectedStickyNoteIds.length > 0
    || selectedConnectionIds.length > 0
    || selectedStickyNoteLinkIds.length > 0;

  useEffect(() => {
    if (drawingInterfaceEnabled) {
      return;
    }

    if (canvasInteractionMode === 'draw') {
      setCanvasInteractionMode('map');
    }

    if (activeStroke !== null) {
      cancelBackgroundStroke();
      drawingStrokeRef.current = null;
    }
  }, [activeStroke, cancelBackgroundStroke, canvasInteractionMode, drawingInterfaceEnabled, setCanvasInteractionMode]);

  useEffect(() => {
    if (stickyNoteEditorId !== null && !selectedStickyNoteIds.includes(stickyNoteEditorId)) {
      setStickyNoteEditorId(null);
    }
  }, [selectedStickyNoteIds, stickyNoteEditorId]);

  useEffect(() => {
    const handleKeyChange = (event: KeyboardEvent) => {
      setIsShiftKeyDown(event.shiftKey);
    };

    const handleWindowBlur = () => {
      setIsShiftKeyDown(false);
    };

    window.addEventListener('keydown', handleKeyChange);
    window.addEventListener('keyup', handleKeyChange);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyChange);
      window.removeEventListener('keyup', handleKeyChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, []);

  useEffect(() => () => {
    if (persistPanTimeoutRef.current !== null) {
      window.clearTimeout(persistPanTimeoutRef.current);
    }
    if (persistZoomTimeoutRef.current !== null) {
      window.clearTimeout(persistZoomTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      if (event.key === 'Escape' && connectionEndpointDrag !== null) {
        cancelConnectionEndpointDrag();
        return;
      }

      if (isRoomEditorOpen || connectionEditorId !== null || connectionDrag !== null || connectionEndpointDrag !== null) {
        return;
      }

      if (isEditableTarget(event.target) || isEditableTarget(document.activeElement)) {
        return;
      }

      if (isRedoShortcut(event)) {
        event.preventDefault();
        void redo();
        return;
      }

      if (isUndoShortcut(event)) {
        event.preventDefault();
        void undo();
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        const {
          selectedRoomIds: currentSelectedRoomIds,
          selectedPseudoRoomIds: currentSelectedPseudoRoomIds,
          selectedStickyNoteIds: currentSelectedStickyNoteIds,
          selectedConnectionIds: currentSelectedConnectionIds,
          selectedStickyNoteLinkIds: currentSelectedStickyNoteLinkIds,
        } = useEditorStore.getState();
        if (
          currentSelectedRoomIds.length === 0
          && currentSelectedPseudoRoomIds.length === 0
          && currentSelectedStickyNoteIds.length === 0
          && currentSelectedConnectionIds.length === 0
          && currentSelectedStickyNoteLinkIds.length === 0
        ) {
          return;
        }

        event.preventDefault();
        removeSelectedEntities();
        return;
      }

      if (drawingInterfaceEnabled && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        setCanvasInteractionMode(canvasInteractionMode === 'draw' ? 'map' : 'draw');
        return;
      }

      if (!event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setIsRoomPlacementArmed(false);
        setIsNotePlacementArmed(true);
        return;
      }

      if (!event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'r') {
        event.preventDefault();
        setIsNotePlacementArmed(false);
        setIsRoomPlacementArmed(true);
        return;
      }

      if (event.key === 'Escape') {
        setIsRoomPlacementArmed(false);
        setIsNotePlacementArmed(false);
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [
    cancelConnectionEndpointDrag,
    canvasInteractionMode,
    connectionDrag,
    connectionEditorId,
    connectionEndpointDrag,
    drawingInterfaceEnabled,
    isRoomEditorOpen,
    removeSelectedEntities,
    redo,
    setCanvasInteractionMode,
    undo,
  ]);

  useEffect(() => {
    if (!doc) {
      return;
    }

    if (
      persistedPanOffset.x === panOffset.x
      && persistedPanOffset.y === panOffset.y
    ) {
      return;
    }

    if (persistPanTimeoutRef.current !== null) {
      window.clearTimeout(persistPanTimeoutRef.current);
    }

    persistPanTimeoutRef.current = window.setTimeout(() => {
      setMapPanOffset(panOffset);
      persistPanTimeoutRef.current = null;
    }, 150);

    return () => {
      if (persistPanTimeoutRef.current !== null) {
        window.clearTimeout(persistPanTimeoutRef.current);
        persistPanTimeoutRef.current = null;
      }
    };
  }, [doc, panOffset, persistedPanOffset.x, persistedPanOffset.y, setMapPanOffset]);

  useEffect(() => {
    if (!doc) {
      return;
    }

    const safePersistedZoom = clampMapViewportZoom(persistedZoom);
    if (safePersistedZoom === zoom) {
      return;
    }

    if (persistZoomTimeoutRef.current !== null) {
      window.clearTimeout(persistZoomTimeoutRef.current);
    }

    persistZoomTimeoutRef.current = window.setTimeout(() => {
      setMapZoom(zoom);
      persistZoomTimeoutRef.current = null;
    }, 150);

    return () => {
      if (persistZoomTimeoutRef.current !== null) {
        window.clearTimeout(persistZoomTimeoutRef.current);
        persistZoomTimeoutRef.current = null;
      }
    };
  }, [doc, persistedZoom, setMapZoom, zoom]);

  const closeRoomEditor = useCallback(() => {
    setRoomEditorState(null);
    requestAnimationFrame(() => {
      canvasRef.current?.focus();
    });
  }, [canvasRef]);

  const closeConnectionEditor = useCallback(() => {
    setConnectionEditorId(null);
    requestAnimationFrame(() => {
      canvasRef.current?.focus();
    });
  }, [canvasRef]);

  const closeRoomEditorFromBackdrop = useCallback(() => {
    clearSelection();
    closeRoomEditor();
  }, [clearSelection, closeRoomEditor]);

  const closeConnectionEditorFromBackdrop = useCallback(() => {
    clearSelection();
    closeConnectionEditor();
  }, [clearSelection, closeConnectionEditor]);

  const startAutoPanAnimation = useCallback(() => {
    setIsAutoPanning(true);
  }, []);

  const panToRoomEditorPositionForRoom = useCallback((room: Room) => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) {
      return;
    }

    const nextCanvasRect = canvasEl.getBoundingClientRect();
    const canvasWidth = nextCanvasRect.width || canvasEl.clientWidth;
    const canvasHeight = nextCanvasRect.height || canvasEl.clientHeight;
    const roomGeometry = getRoomScreenGeometry(room, panOffsetRef.current, nextCanvasRect, zoomRef.current, mapVisualStyle);
    const roomCenterX = roomGeometry.centerX - nextCanvasRect.left;
    const roomTopY = roomGeometry.top - nextCanvasRect.top;
    const visibleWidth = Math.max(canvasWidth - visibleMapLeftInset, 0);
    const visibleCenterX = visibleMapLeftInset + (visibleWidth / 2);

    startAutoPanAnimation();
    setPanOffset((prev) => ({
      x: prev.x + (visibleCenterX - roomCenterX),
      y: prev.y + ((canvasHeight / 3) - roomTopY),
    }));
  }, [canvasRef, mapVisualStyle, panOffsetRef, setPanOffset, startAutoPanAnimation, visibleMapLeftInset, zoomRef]);

  const panToRoomEditorPosition = useCallback((roomId: string) => {
    const room = useEditorStore.getState().doc?.rooms[roomId];
    if (!room) {
      return;
    }

    panToRoomEditorPositionForRoom(room);
  }, [panToRoomEditorPositionForRoom]);

  const openRoomEditor = useCallback((roomId: string) => {
    setStickyNoteEditorId(null);
    setConnectionEditorId(null);
    panToRoomEditorPosition(roomId);
    setRoomEditorState({ roomId });
  }, [panToRoomEditorPosition]);

  const openPseudoRoomEditor = useCallback((pseudoRoomId: string) => {
    setStickyNoteEditorId(null);
    setConnectionEditorId(null);
    setRoomEditorState({ pseudoRoomId });
  }, []);

  const openNewRoomEditor = useCallback((position: Position) => {
    setStickyNoteEditorId(null);
    setConnectionEditorId(null);
    panToRoomEditorPositionForRoom({
      ...createRoom('Room'),
      position,
    });
    setRoomEditorState({ initialPosition: position });
  }, [panToRoomEditorPositionForRoom]);

  useLayoutEffect(() => {
    if (requestedRoomEditorRequest === null) {
      return;
    }

    openRoomEditor(requestedRoomEditorRequest.roomId);
    onRequestedRoomEditorHandled?.(requestedRoomEditorRequest.requestId);
  }, [onRequestedRoomEditorHandled, openRoomEditor, requestedRoomEditorRequest]);

  const openConnectionEditor = useCallback((connectionId: string) => {
    setStickyNoteEditorId(null);
    setRoomEditorState(null);
    setConnectionEditorId(connectionId);
  }, []);

  const openStickyNoteEditor = useCallback((stickyNoteId: string) => {
    setRoomEditorState(null);
    setConnectionEditorId(null);
    setStickyNoteEditorId(stickyNoteId);
  }, []);

  const openConnectionCreationMenu = useCallback((position: Position, clientX: number, clientY: number) => {
    setPendingConnectionDrop({
      position,
      screenX: clientX,
      screenY: clientY,
    });
  }, []);

  const closeConnectionCreationMenu = useCallback(() => {
    setPendingConnectionDrop(null);
    useEditorStore.getState().cancelConnectionDrag();
  }, []);

  const handleCreateFromPendingDrop = useCallback((kind: 'room' | PseudoRoomKind) => {
    const currentDrop = pendingConnectionDrop;
    const currentDrag = useEditorStore.getState().connectionDrag;
    if (!currentDrop || !currentDrag) {
      setPendingConnectionDrop(null);
      return;
    }

    if (kind === 'room') {
      const createdRoomId = completeConnectionDragToNewRoom(
        getNewRoomTopLeftPosition(currentDrop.position, mapVisualStyle),
      );
      setPendingConnectionDrop(null);
      if (createdRoomId !== null) {
        openRoomEditor(createdRoomId);
      }
      return;
    }

    createPseudoRoomAndConnect(
      kind,
      getNewPseudoRoomTopLeftPosition(currentDrop.position, kind, mapVisualStyle),
      currentDrag.sourceRoomId,
      currentDrag.sourceDirection,
    );
    useEditorStore.getState().cancelConnectionDrag();
    setPendingConnectionDrop(null);
  }, [completeConnectionDragToNewRoom, createPseudoRoomAndConnect, mapVisualStyle, openRoomEditor, pendingConnectionDrop]);

  const closeStickyNoteEditor = useCallback(() => {
    setStickyNoteEditorId(null);
  }, []);

  const centerRoomOnScreen = useCallback((room: Room) => {
    const currentCanvasRect = canvasRef.current?.getBoundingClientRect() ?? canvasRect;
    const roomGeometry = getRoomScreenGeometry(room, panOffsetRef.current, currentCanvasRect, zoomRef.current, mapVisualStyle);
    const canvasWidth = currentCanvasRect?.width ?? canvasRef.current?.clientWidth ?? 0;
    const canvasHeight = currentCanvasRect?.height ?? canvasRef.current?.clientHeight ?? 0;
    const roomCenterX = roomGeometry.centerX - (currentCanvasRect?.left ?? 0);
    const roomCenterY = (roomGeometry.top - (currentCanvasRect?.top ?? 0)) + (roomGeometry.height / 2);
    const visibleWidth = Math.max(canvasWidth - visibleMapLeftInset, 0);
    const visibleCenterX = visibleMapLeftInset + (visibleWidth / 2);

    if (canvasWidth === 0 && canvasHeight === 0) {
      return;
    }

    startAutoPanAnimation();
    const nextPanOffset = {
      x: panOffsetRef.current.x + (visibleCenterX - roomCenterX),
      y: panOffsetRef.current.y + ((canvasHeight / 2) - roomCenterY),
    };
    panOffsetRef.current = nextPanOffset;
    setPanOffset(nextPanOffset);
    setMapPanOffset(nextPanOffset);
  }, [canvasRect, canvasRef, mapVisualStyle, panOffsetRef, setMapPanOffset, setPanOffset, startAutoPanAnimation, visibleMapLeftInset, zoomRef]);

  const centerRoomsOnScreen = useCallback((targetRooms: readonly Room[]) => {
    if (targetRooms.length === 0) {
      return;
    }

    if (targetRooms.length === 1) {
      centerRoomOnScreen(targetRooms[0]);
      return;
    }

    const currentCanvasRect = canvasRef.current?.getBoundingClientRect() ?? canvasRect;
    const canvasWidth = currentCanvasRect?.width ?? canvasRef.current?.clientWidth ?? 0;
    const canvasHeight = currentCanvasRect?.height ?? canvasRef.current?.clientHeight ?? 0;
    if (canvasWidth === 0 && canvasHeight === 0) {
      return;
    }

    const screenBounds = targetRooms.map((room) => getRoomScreenGeometry(room, panOffsetRef.current, currentCanvasRect, zoomRef.current, mapVisualStyle));
    const groupLeft = Math.min(...screenBounds.map((room) => room.left - (currentCanvasRect?.left ?? 0)));
    const groupRight = Math.max(...screenBounds.map((room) => (room.left - (currentCanvasRect?.left ?? 0)) + room.width));
    const groupTop = Math.min(...screenBounds.map((room) => room.top - (currentCanvasRect?.top ?? 0)));
    const groupBottom = Math.max(...screenBounds.map((room) => (room.top - (currentCanvasRect?.top ?? 0)) + room.height));
    const visibleWidth = Math.max(canvasWidth - visibleMapLeftInset, 0);
    const visibleCenterX = visibleMapLeftInset + (visibleWidth / 2);
    const groupCenterX = (groupLeft + groupRight) / 2;
    const groupCenterY = (groupTop + groupBottom) / 2;

    startAutoPanAnimation();
    const nextPanOffset = {
      x: panOffsetRef.current.x + (visibleCenterX - groupCenterX),
      y: panOffsetRef.current.y + ((canvasHeight / 2) - groupCenterY),
    };
    panOffsetRef.current = nextPanOffset;
    setPanOffset(nextPanOffset);
    setMapPanOffset(nextPanOffset);
  }, [canvasRect, canvasRef, centerRoomOnScreen, mapVisualStyle, panOffsetRef, setMapPanOffset, setPanOffset, startAutoPanAnimation, visibleMapLeftInset, zoomRef]);

  useLayoutEffect(() => {
    if (requestedRoomRevealRequest === null) {
      return;
    }

    const room = useEditorStore.getState().doc?.rooms[requestedRoomRevealRequest.roomId];
    if (room) {
      centerRoomOnScreen(room);
    }
    onRequestedRoomRevealHandled?.(requestedRoomRevealRequest.requestId);
  }, [centerRoomOnScreen, onRequestedRoomRevealHandled, requestedRoomRevealRequest]);

  useLayoutEffect(() => {
    if (requestedViewportFocusRequest === null) {
      return;
    }

    const roomsToFocus = requestedViewportFocusRequest.roomIds
      .map((roomId) => useEditorStore.getState().doc?.rooms[roomId] ?? null)
      .filter((room): room is Room => room !== null);

    if (roomsToFocus.length > 0) {
      centerRoomsOnScreen(roomsToFocus);
    }
    onRequestedViewportFocusHandled?.(requestedViewportFocusRequest.requestId);
  }, [centerRoomsOnScreen, onRequestedViewportFocusHandled, requestedViewportFocusRequest]);

  const getOrCreateStrokeChunk = useCallback(async (
    coordinates: { chunkX: number; chunkY: number },
    layerId: string,
  ): Promise<StrokeChunkState> => {
    if (!doc) {
      throw new Error('Cannot draw without a loaded document.');
    }

    const key = getBackgroundChunkKey({
      mapId: doc.metadata.id,
      layerId,
      chunkX: coordinates.chunkX,
      chunkY: coordinates.chunkY,
    });
    const activeDrawingStroke = drawingStrokeRef.current;
    if (!activeDrawingStroke) {
      throw new Error('Cannot access stroke chunk without an active stroke.');
    }

    const existingChunk = activeDrawingStroke.chunks.get(key);
    if (existingChunk) {
      return existingChunk;
    }

    const storedChunk = await loadBackgroundChunk(doc.metadata.id, layerId, coordinates.chunkX, coordinates.chunkY);
    const baseCanvas = storedChunk ? await blobToCanvas(storedChunk.blob) : createRasterCanvas();
    const strokeCanvas = createRasterCanvas();
    const previewCanvas = createRasterCanvas();
    const strokeChunk: StrokeChunkState = {
      chunkX: coordinates.chunkX,
      chunkY: coordinates.chunkY,
      key,
      beforeBlob: storedChunk?.blob ?? null,
      baseCanvas,
      strokeCanvas,
      previewCanvas,
    };
    compositeStrokePreview(previewCanvas, baseCanvas, strokeCanvas, activeDrawingStroke.toolState);
    activeDrawingStroke.chunks.set(key, strokeChunk);
    return strokeChunk;
  }, [doc]);

  const drawStrokePoint = useCallback(async (startPoint: MapPixelPoint, endPoint: MapPixelPoint) => {
    const currentStroke = drawingStrokeRef.current;
    if (!currentStroke) {
      return;
    }

    const touchedKeys = new Set<string>();
    const points = getInterpolatedLinePoints(startPoint, endPoint);
    const radius = getToolStampRadius(currentStroke.toolState);

    for (const point of points) {
      const coveredChunks = getChunkCoverageForPoint(point, radius);
      for (const coveredChunk of coveredChunks) {
        const chunk = await getOrCreateStrokeChunk(coveredChunk, currentStroke.layerId);
        const localPoint = getLocalChunkPoint(point, chunk);
        drawStrokeSegment(chunk.strokeCanvas, currentStroke.maskToolState, localPoint, localPoint);
        compositeStrokePreview(chunk.previewCanvas, chunk.baseCanvas, chunk.strokeCanvas, currentStroke.toolState);
        touchedKeys.add(chunk.key);
      }
    }

    touchedKeys.forEach((chunkKey) => {
      const chunk = currentStroke.chunks.get(chunkKey);
      if (chunk) {
        backgroundRef.current?.redrawChunk(chunkKey, chunk.chunkX, chunk.chunkY, chunk.previewCanvas);
      }
    });
  }, [getOrCreateStrokeChunk]);

  const redrawLineStroke = useCallback(async (startPoint: MapPixelPoint, endPoint: MapPixelPoint) => {
    const currentStroke = drawingStrokeRef.current;
    if (!currentStroke) {
      return;
    }

    currentStroke.chunks.forEach((chunk) => {
      const strokeContext = chunk.strokeCanvas.getContext('2d');
      if (strokeContext) {
        strokeContext.clearRect(0, 0, chunk.strokeCanvas.width, chunk.strokeCanvas.height);
      }
      compositeStrokePreview(chunk.previewCanvas, chunk.baseCanvas, chunk.strokeCanvas, currentStroke.toolState);
      backgroundRef.current?.redrawChunk(chunk.key, chunk.chunkX, chunk.chunkY, chunk.previewCanvas);
    });

    await drawStrokePoint(startPoint, endPoint);
  }, [drawStrokePoint]);

  const redrawRectangleStroke = useCallback(async (startPoint: MapPixelPoint, endPoint: MapPixelPoint) => {
    const currentStroke = drawingStrokeRef.current;
    if (!currentStroke) {
      return;
    }

    currentStroke.chunks.forEach((chunk) => {
      const strokeContext = chunk.strokeCanvas.getContext('2d');
      if (strokeContext) {
        strokeContext.clearRect(0, 0, chunk.strokeCanvas.width, chunk.strokeCanvas.height);
      }
      compositeStrokePreview(chunk.previewCanvas, chunk.baseCanvas, chunk.strokeCanvas, currentStroke.toolState);
      backgroundRef.current?.redrawChunk(chunk.key, chunk.chunkX, chunk.chunkY, chunk.previewCanvas);
    });

    const bounds = getBoundsFromPoints(startPoint, endPoint);
    const coveredChunks = getChunkCoverageForRect(bounds, getToolStampRadius(currentStroke.toolState));

    for (const coveredChunk of coveredChunks) {
      const chunk = await getOrCreateStrokeChunk(coveredChunk, currentStroke.layerId);
      const localStart = getLocalChunkPoint(startPoint, chunk);
      const localEnd = getLocalChunkPoint(endPoint, chunk);
      drawRectangleStroke(chunk.strokeCanvas, currentStroke.maskToolState, localStart, localEnd);
      compositeStrokePreview(chunk.previewCanvas, chunk.baseCanvas, chunk.strokeCanvas, currentStroke.toolState);
      backgroundRef.current?.redrawChunk(chunk.key, chunk.chunkX, chunk.chunkY, chunk.previewCanvas);
    }
  }, [getOrCreateStrokeChunk]);

  const redrawEllipseStroke = useCallback(async (startPoint: MapPixelPoint, endPoint: MapPixelPoint) => {
    const currentStroke = drawingStrokeRef.current;
    if (!currentStroke) {
      return;
    }

    currentStroke.chunks.forEach((chunk) => {
      const strokeContext = chunk.strokeCanvas.getContext('2d');
      if (strokeContext) {
        strokeContext.clearRect(0, 0, chunk.strokeCanvas.width, chunk.strokeCanvas.height);
      }
      compositeStrokePreview(chunk.previewCanvas, chunk.baseCanvas, chunk.strokeCanvas, currentStroke.toolState);
      backgroundRef.current?.redrawChunk(chunk.key, chunk.chunkX, chunk.chunkY, chunk.previewCanvas);
    });

    const bounds = getBoundsFromPoints(startPoint, endPoint);
    const coveredChunks = getChunkCoverageForRect(bounds, getToolStampRadius(currentStroke.toolState));

    for (const coveredChunk of coveredChunks) {
      const chunk = await getOrCreateStrokeChunk(coveredChunk, currentStroke.layerId);
      const localStart = getLocalChunkPoint(startPoint, chunk);
      const localEnd = getLocalChunkPoint(endPoint, chunk);
      drawEllipseStroke(chunk.strokeCanvas, currentStroke.maskToolState, localStart, localEnd);
      compositeStrokePreview(chunk.previewCanvas, chunk.baseCanvas, chunk.strokeCanvas, currentStroke.toolState);
      backgroundRef.current?.redrawChunk(chunk.key, chunk.chunkX, chunk.chunkY, chunk.previewCanvas);
    }
  }, [getOrCreateStrokeChunk]);

  const applyBucketFill = useCallback(async (startPoint: MapPixelPoint) => {
    const currentStroke = drawingStrokeRef.current;
    if (!currentStroke) {
      return false;
    }

    const bounds = {
      left: startPoint.x - BUCKET_FILL_MAX_RADIUS,
      top: startPoint.y - BUCKET_FILL_MAX_RADIUS,
      right: startPoint.x + BUCKET_FILL_MAX_RADIUS,
      bottom: startPoint.y + BUCKET_FILL_MAX_RADIUS,
    };
    const coveredChunks = getChunkCoverageForRect(bounds, 0);
    if (coveredChunks.length === 0) {
      return false;
    }

    const minChunkX = Math.min(...coveredChunks.map((chunk) => chunk.chunkX));
    const maxChunkX = Math.max(...coveredChunks.map((chunk) => chunk.chunkX));
    const minChunkY = Math.min(...coveredChunks.map((chunk) => chunk.chunkY));
    const maxChunkY = Math.max(...coveredChunks.map((chunk) => chunk.chunkY));
    const combinedBaseCanvas = createSizedCanvas(
      (maxChunkX - minChunkX + 1) * 256,
      (maxChunkY - minChunkY + 1) * 256,
    );
    const combinedFillCanvas = createSizedCanvas(combinedBaseCanvas.width, combinedBaseCanvas.height);
    const obstacleCanvas = currentStroke.toolState.bucketObeyMap
      ? createSizedCanvas(combinedBaseCanvas.width, combinedBaseCanvas.height)
      : undefined;
    const combinedBaseContext = combinedBaseCanvas.getContext('2d');

    if (!combinedBaseContext) {
      return false;
    }

    for (const coveredChunk of coveredChunks) {
      const chunk = await getOrCreateStrokeChunk(coveredChunk, currentStroke.layerId);
      combinedBaseContext.drawImage(
        chunk.baseCanvas,
        (coveredChunk.chunkX - minChunkX) * 256,
        (coveredChunk.chunkY - minChunkY) * 256,
      );
    }

    if (obstacleCanvas && doc) {
      drawMapObstacleMask(obstacleCanvas, doc.rooms, doc.connections, {
        x: minChunkX * 256,
        y: minChunkY * 256,
      });
    }

    const changed = drawBucketFill(
      combinedBaseCanvas,
      combinedFillCanvas,
      {
        x: startPoint.x - (minChunkX * 256),
        y: startPoint.y - (minChunkY * 256),
      },
      currentStroke.toolState.colorRgbHex,
      BUCKET_FILL_MAX_RADIUS,
      currentStroke.toolState.bucketTolerance,
      obstacleCanvas,
    );

    if (!changed) {
      return false;
    }

    for (const coveredChunk of coveredChunks) {
      const chunk = await getOrCreateStrokeChunk(coveredChunk, currentStroke.layerId);
      const strokeContext = chunk.strokeCanvas.getContext('2d');
      if (!strokeContext) {
        continue;
      }

      strokeContext.clearRect(0, 0, chunk.strokeCanvas.width, chunk.strokeCanvas.height);
      strokeContext.drawImage(
        combinedFillCanvas,
        (coveredChunk.chunkX - minChunkX) * 256,
        (coveredChunk.chunkY - minChunkY) * 256,
        256,
        256,
        0,
        0,
        256,
        256,
      );
      compositeStrokePreview(chunk.previewCanvas, chunk.baseCanvas, chunk.strokeCanvas, currentStroke.toolState);
      backgroundRef.current?.redrawChunk(chunk.key, chunk.chunkX, chunk.chunkY, chunk.previewCanvas);
    }

    return true;
  }, [getOrCreateStrokeChunk]);

  const finishDrawingStroke = useCallback(async () => {
    const currentStroke = drawingStrokeRef.current;
    if (!doc || !currentStroke) {
      cancelBackgroundStroke();
      drawingStrokeRef.current = null;
      return;
    }

    const chunks = Array.from(currentStroke.chunks.values());
    const historyChunks = await Promise.all(chunks.map(async (chunk) => {
      const afterBlob = isCanvasEmpty(chunk.previewCanvas) ? null : await canvasToBlob(chunk.previewCanvas);
      return {
        key: chunk.key,
        before: chunk.beforeBlob,
        after: afterBlob,
      };
    }));

    await saveBackgroundChunks(
      chunks.flatMap((chunk, index) => {
        const historyChunk = historyChunks[index];
        if (!historyChunk.after) {
          return [];
        }

        return [{
          mapId: doc.metadata.id,
          layerId: currentStroke.layerId,
          chunkX: chunk.chunkX,
          chunkY: chunk.chunkY,
          blob: historyChunk.after,
        }];
      }),
    );
    await deleteBackgroundChunks(historyChunks.filter((chunk) => chunk.after === null).map((chunk) => chunk.key));

    commitBackgroundStroke({
      kind: 'background-stroke',
      mapId: doc.metadata.id,
      layerId: currentStroke.layerId,
      chunks: historyChunks,
    });
    drawingStrokeRef.current = null;
    backgroundRef.current?.clearLivePreviewChunks();
    await backgroundRef.current?.reloadVisibleChunks();
  }, [cancelBackgroundStroke, commitBackgroundStroke, doc]);

  const handleCanvasSelectionMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || isRoomEditorOpen || connectionEditorId !== null || connectionDrag !== null || connectionEndpointDrag !== null) {
      return;
    }

    const target = e.target as Element | null;
    if (isCanvasChromeTarget(target) || isEditableTarget(target)) {
      return;
    }

    if (isPickingExportRegion && exportScope === 'region') {
      e.preventDefault();
      suppressCanvasClickRef.current = true;
      const startPoint = toMapPoint(e.clientX, e.clientY);
      beginExportRegion(startPoint);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        updateExportRegion(toMapPoint(moveEvent.clientX, moveEvent.clientY));
      };

      const handleMouseUp = (upEvent: MouseEvent) => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        updateExportRegion(toMapPoint(upEvent.clientX, upEvent.clientY));
        commitExportRegion();
        setIsPickingExportRegion(false);
        setPreferredExportScope('region');
        setIsExportDialogOpen(true);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return;
    }

    const drawingEnabled = supportsRasterCanvas();
    const drawingTool = useEditorStore.getState().drawingToolState.tool;
    const isShiftShapeDraw = effectiveCanvasInteractionMode === 'draw' && (drawingTool === 'line' || drawingTool === 'rectangle' || drawingTool === 'ellipse');
    const isBucketTool = drawingTool === 'bucket';

    if (effectiveCanvasInteractionMode === 'map' && e.shiftKey) {
      return;
    }

    if (
      drawingInterfaceEnabled
      && (!e.shiftKey || isShiftShapeDraw || isBucketTool)
      && doc
      && drawingEnabled
      && effectiveCanvasInteractionMode === 'draw'
    ) {
      e.preventDefault();
      suppressCanvasClickRef.current = true;
      const layerId = ensureDefaultBackgroundLayer();
      beginBackgroundStroke(layerId);
      const startPoint = toMapPoint(e.clientX, e.clientY);
      const toolState = getDrawingToolSnapshot();
      const activeDrawingStroke: ActiveDrawingStroke = {
        layerId,
        toolState,
        maskToolState: {
          ...toolState,
          opacity: 1,
        },
        startPoint,
        lastPoint: startPoint,
        chunks: new Map<string, StrokeChunkState>(),
      };
      drawingStrokeRef.current = activeDrawingStroke;

      if (toolState.tool === 'bucket') {
        void (async () => {
          const changed = await applyBucketFill(startPoint);
          if (changed) {
            await finishDrawingStroke();
          } else {
            cancelBackgroundStroke();
            drawingStrokeRef.current = null;
          }
        })();
        return;
      }

      const drawAtPoint = async (point: MapPixelPoint, constrainToCompass: boolean) => {
        if (!drawingStrokeRef.current) {
          return;
        }
        if (drawingStrokeRef.current.toolState.tool === 'line') {
          const nextPoint = constrainToCompass
            ? constrainLineToCompassDirection(drawingStrokeRef.current.startPoint, point)
            : point;
          await redrawLineStroke(drawingStrokeRef.current.startPoint, nextPoint);
          drawingStrokeRef.current.lastPoint = nextPoint;
        } else if (drawingStrokeRef.current.toolState.tool === 'rectangle') {
          const nextPoint = constrainToCompass
            ? constrainRectangleToSquare(drawingStrokeRef.current.startPoint, point)
            : point;
          await redrawRectangleStroke(drawingStrokeRef.current.startPoint, nextPoint);
          drawingStrokeRef.current.lastPoint = nextPoint;
        } else if (drawingStrokeRef.current.toolState.tool === 'ellipse') {
          const nextPoint = constrainToCompass
            ? constrainEllipseToCircle(drawingStrokeRef.current.startPoint, point)
            : point;
          await redrawEllipseStroke(drawingStrokeRef.current.startPoint, nextPoint);
          drawingStrokeRef.current.lastPoint = nextPoint;
        } else {
          await drawStrokePoint(drawingStrokeRef.current.lastPoint, point);
          drawingStrokeRef.current.lastPoint = point;
        }
      };

      void drawAtPoint(startPoint, false);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        void drawAtPoint(
          toMapPoint(moveEvent.clientX, moveEvent.clientY),
          (
            drawingStrokeRef.current?.toolState.tool === 'line'
            || drawingStrokeRef.current?.toolState.tool === 'rectangle'
            || drawingStrokeRef.current?.toolState.tool === 'ellipse'
          ) && moveEvent.shiftKey,
        );
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        void finishDrawingStroke();
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return;
    }

    if (e.shiftKey || !drawingEnabled || effectiveCanvasInteractionMode === 'map') {
      e.preventDefault();

      const initialSelectionBox: SelectionBox = {
        startX: e.clientX - (canvasRect?.left ?? 0),
        startY: e.clientY - (canvasRect?.top ?? 0),
        currentX: e.clientX - (canvasRect?.left ?? 0),
        currentY: e.clientY - (canvasRect?.top ?? 0),
      };

      setSelectionBox(initialSelectionBox);

      const updateSelection = (nextSelectionBox: SelectionBox) => {
        setSelection(
          getRoomsWithinSelectionBox(rooms, panOffsetRef.current, canvasRect, nextSelectionBox, zoomRef.current, mapVisualStyle),
          getStickyNotesWithinSelectionBox(stickyNotes, panOffsetRef.current, canvasRect, nextSelectionBox, zoomRef.current),
          doc ? getConnectionsWithinSelectionBox(doc.rooms, doc.connections, panOffsetRef.current, nextSelectionBox, zoomRef.current, mapVisualStyle) : [],
          doc ? getStickyNoteLinksWithinSelectionBox(doc.rooms, doc.pseudoRooms, doc.stickyNotes, doc.stickyNoteLinks, panOffsetRef.current, nextSelectionBox, zoomRef.current) : [],
        );
        pseudoRooms
          .filter((pseudoRoom) => getPseudoRoomsWithinSelectionBox([pseudoRoom], panOffsetRef.current, canvasRect, nextSelectionBox, zoomRef.current, mapVisualStyle).includes(pseudoRoom.id))
          .forEach((pseudoRoom) => addPseudoRoomToSelection(pseudoRoom.id));
      };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const nextSelectionBox: SelectionBox = {
          startX: initialSelectionBox.startX,
          startY: initialSelectionBox.startY,
          currentX: moveEvent.clientX - (canvasRect?.left ?? 0),
          currentY: moveEvent.clientY - (canvasRect?.top ?? 0),
        };

        setSelectionBox(nextSelectionBox);
        updateSelection(nextSelectionBox);
      };

      const handleMouseUp = (upEvent: MouseEvent) => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);

        const finalSelectionBox: SelectionBox = {
          startX: initialSelectionBox.startX,
          startY: initialSelectionBox.startY,
          currentX: upEvent.clientX - (canvasRect?.left ?? 0),
          currentY: upEvent.clientY - (canvasRect?.top ?? 0),
        };
        const bounds = getSelectionBounds(finalSelectionBox);

        if (bounds.width > 0 || bounds.height > 0) {
          suppressCanvasClickRef.current = true;
          updateSelection(finalSelectionBox);
        }

        setSelectionBox(null);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return;
    }

    e.preventDefault();
  }, [
    beginBackgroundStroke,
    beginExportRegion,
    canvasInteractionMode,
    canvasRect,
    commitExportRegion,
    connectionDrag,
    connectionEndpointDrag,
    connectionEditorId,
    doc,
    drawingInterfaceEnabled,
    drawStrokePoint,
    applyBucketFill,
    ensureDefaultBackgroundLayer,
    finishDrawingStroke,
    isPickingExportRegion,
    panOffsetRef,
    isRoomEditorOpen,
    rooms,
    stickyNotes,
    setSelection,
    toMapPoint,
    updateExportRegion,
    exportScope,
    effectiveCanvasInteractionMode,
  ]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isRoomEditorOpen || connectionEditorId !== null || connectionDrag !== null || connectionEndpointDrag !== null) {
      return;
    }

    const target = e.target as Element | null;
    if (isCanvasChromeTarget(target) || isEditableTarget(target)) {
      return;
    }

    const isShiftPan = e.button === 0 && e.shiftKey && effectiveCanvasInteractionMode === 'map';
    const isMiddlePan = e.button === 1;
    if (!isShiftPan && !isMiddlePan) {
      return;
    }

    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const startPan = panOffsetRef.current;

    setIsAutoPanning(false);
    setIsPanning(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (moveEvent.clientX !== startX || moveEvent.clientY !== startY) {
        suppressCanvasClickRef.current = true;
      }
      setPanOffset({
        x: startPan.x + (moveEvent.clientX - startX),
        y: startPan.y + (moveEvent.clientY - startY),
      });
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      setIsPanning(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [connectionDrag, connectionEditorId, connectionEndpointDrag, effectiveCanvasInteractionMode, isRoomEditorOpen, panOffsetRef, setPanOffset]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (isRoomEditorOpen || connectionEditorId || activeStroke) return;

    if (suppressCanvasClickRef.current) {
      suppressCanvasClickRef.current = false;
      if (!isRoomPlacementArmed && !isNotePlacementArmed) {
        return;
      }
    }

    const target = e.target as Element | null;
    if (isCanvasChromeTarget(target) || isEditableTarget(target)) {
      return;
    }

    if (isNotePlacementArmed && doc) {
      const { x, y } = toMapPoint(e.clientX, e.clientY);
      const stickyNoteId = addStickyNoteAtPosition('', getNewStickyNoteTopLeftPosition({ x, y }, ''));
      useEditorStore.getState().selectStickyNote(stickyNoteId);
      setStickyNoteEditorId(null);
      setIsRoomPlacementArmed(false);
      setIsNotePlacementArmed(false);
      return;
    }

    if (isRoomPlacementArmed) {
      const { x, y } = toMapPoint(e.clientX, e.clientY);
      setIsNotePlacementArmed(false);
      setIsRoomPlacementArmed(false);
      openNewRoomEditor(getNewRoomTopLeftPosition({ x, y }, mapVisualStyle));
      return;
    }

    setIsRoomPlacementArmed(false);
    setIsNotePlacementArmed(false);
    closeStickyNoteEditor();
    canvasRef.current?.focus();
    clearSelection();
  }, [activeStroke, addStickyNoteAtPosition, canvasRef, clearSelection, closeStickyNoteEditor, connectionEditorId, doc, isNotePlacementArmed, isRoomPlacementArmed, isRoomEditorOpen, mapVisualStyle, openNewRoomEditor, toMapPoint]);

  const handleCanvasWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (isRoomEditorOpen || connectionEditorId !== null || connectionDrag !== null || connectionEndpointDrag !== null) {
      return;
    }

    if (isEditableTarget(e.target)) {
      return;
    }

    if (e.metaKey) {
      return;
    }

    e.preventDefault();
    if (e.ctrlKey) {
      const scaleFactor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
      zoomAtClientPoint(e.clientX, e.clientY, scaleFactor);
      return;
    }

    panBy({ x: -e.deltaX, y: -e.deltaY });
  }, [connectionDrag, connectionEditorId, connectionEndpointDrag, isRoomEditorOpen, panBy, zoomAtClientPoint]);

  const handleCanvasKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isRoomEditorOpen || connectionEditorId !== null || connectionDrag !== null || connectionEndpointDrag !== null) {
      return;
    }

    if (isEditableTarget(e.target)) {
      return;
    }

    if (isRedoShortcut(e)) {
      e.preventDefault();
      redo();
      return;
    }

    if (isUndoShortcut(e)) {
      e.preventDefault();
      undo();
      return;
    }

    if (drawingInterfaceEnabled && !e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      setCanvasInteractionMode(canvasInteractionMode === 'draw' ? 'map' : 'draw');
      return;
    }

    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'l') {
      if (selectedRoomIds.length === 0) {
        return;
      }

      e.preventDefault();
      toggleSelectedRoomLocks();
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      const { selectedConnectionIds: currentSelectedConnectionIds, selectedStickyNoteLinkIds: currentSelectedStickyNoteLinkIds } = useEditorStore.getState();
      if (
        selectedRoomIds.length === 0
        && selectedPseudoRoomIds.length === 0
        && selectedStickyNoteIds.length === 0
        && currentSelectedConnectionIds.length === 0
        && currentSelectedStickyNoteLinkIds.length === 0
      ) {
        return;
      }

      e.preventDefault();
      removeSelectedEntities();
      return;
    }

    if (e.key === 'Enter') {
      if (selectedRoomIds.length !== 1) {
        return;
      }

      e.preventDefault();
      openRoomEditor(selectedRoomIds[0]);
      return;
    }

    if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      if (!e.ctrlKey && !e.metaKey && !e.altKey && (e.key === '+' || e.key === '=')) {
        e.preventDefault();
        const rect = canvasRef.current?.getBoundingClientRect() ?? canvasRect;
        if (!rect) {
          return;
        }
        zoomAtClientPoint(rect.left + (rect.width / 2), rect.top + (rect.height / 2), 1.1);
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === '-') {
        e.preventDefault();
        const rect = canvasRef.current?.getBoundingClientRect() ?? canvasRect;
        if (!rect) {
          return;
        }
        zoomAtClientPoint(rect.left + (rect.width / 2), rect.top + (rect.height / 2), 1 / 1.1);
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key === '0') {
        e.preventDefault();
        const rect = canvasRef.current?.getBoundingClientRect() ?? canvasRect;
        if (!rect) {
          return;
        }
        zoomAtClientPoint(rect.left + (rect.width / 2), rect.top + (rect.height / 2), 1 / zoomRef.current);
      }
      return;
    }

    if (selectedRoomIds.length === 0) {
      return;
    }

    const nearestRoom = findNearestRoomInDirection(rooms, selectedRoomIds[0], e.key as 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight');
    if (!nearestRoom) {
      return;
    }

    e.preventDefault();
    useEditorStore.getState().selectRoom(nearestRoom.id);
    centerRoomOnScreen(nearestRoom);
  }, [canvasInteractionMode, canvasRect, canvasRef, centerRoomOnScreen, connectionDrag, connectionEditorId, connectionEndpointDrag, drawingInterfaceEnabled, isRoomEditorOpen, openRoomEditor, redo, removeSelectedEntities, rooms, selectedPseudoRoomIds, selectedRoomIds, selectedStickyNoteIds, setCanvasInteractionMode, toggleSelectedRoomLocks, undo, zoomAtClientPoint, zoomRef]);

  const classes = [
    'map-canvas',
    showGrid ? 'map-canvas--grid' : '',
    isPanning ? 'map-canvas--panning' : '',
    effectiveCanvasInteractionMode === 'draw' ? 'map-canvas--draw-mode' : 'map-canvas--map-mode',
    effectiveCanvasInteractionMode === 'map' && isShiftKeyDown && !isPanning ? 'map-canvas--pan-ready' : '',
    isAutoPanning ? 'map-canvas--grid-animated' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={canvasRef}
      className={classes}
      data-testid="map-canvas"
      onMouseDown={(e) => {
        handleCanvasSelectionMouseDown(e);
        handleCanvasMouseDown(e);
      }}
      onWheel={handleCanvasWheel}
      onClick={handleCanvasClick}
      onKeyDown={handleCanvasKeyDown}
      tabIndex={-1}
    >
        {doc?.background.referenceImage && (
          <MapCanvasReferenceImage
            image={doc.background.referenceImage}
            panOffset={panOffset}
            zoom={zoom}
          />
        )}
        {drawingInterfaceEnabled && doc && (
          <MapCanvasBackground
            ref={backgroundRef}
            mapId={doc.metadata.id}
            background={doc.background}
            panOffset={panOffset}
            zoom={zoom}
            canvasRect={effectiveCanvasRect}
            backgroundRevision={backgroundRevision}
          />
        )}
        {showGrid && (
          <div
            className={`map-canvas-grid-layer${isAutoPanning ? ' map-canvas-grid-layer--animated' : ''}`}
            aria-hidden="true"
            style={{
              backgroundPosition: `${panOffset.x}px ${panOffset.y}px`,
              backgroundSize: `${40 * zoom}px ${40 * zoom}px`,
            }}
          />
        )}
        <div
          className={`map-canvas-scene${isRoomEditorOpen || connectionEditorId ? ' map-canvas-scene--editor-open' : ''}`}
          data-testid="map-canvas-scene"
        >
          {drawingInterfaceEnabled && <MapDrawingToolbar />}
        {doc && (
          <MapMinimap
            mapId={doc.metadata.id}
            background={minimapBackground}
            backgroundRevision={backgroundRevision}
            rooms={doc.rooms}
            pseudoRooms={doc.pseudoRooms}
            connections={doc.connections}
            stickyNotes={doc.stickyNotes}
            stickyNoteLinks={doc.stickyNoteLinks}
            selectedRoomIds={selectedRoomIds}
            selectedConnectionIds={selectedConnectionIds}
            selectedStickyNoteIds={selectedStickyNoteIds}
            selectedStickyNoteLinkIds={selectedStickyNoteLinkIds}
            panOffset={panOffset}
            zoom={zoom}
            visualStyle={mapVisualStyle}
            canvasRect={effectiveCanvasRect}
            visibleMapLeftInset={visibleMapLeftInset}
            theme={theme}
            disabled={isRoomEditorOpen || connectionEditorId !== null}
            onPanToMapPoint={centerOnMapPoint}
            onPanBy={panBy}
          />
        )}

        <div
          className={`map-canvas-content${isAutoPanning ? ' map-canvas-content--animated' : ''}`}
          data-testid="map-canvas-content"
          onTransitionEnd={(event) => {
            if (event.target !== event.currentTarget || event.propertyName !== 'transform') {
              return;
            }

            setIsAutoPanning(false);
          }}
          style={{
            transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
          }}
        >
          {doc && (
            <MapCanvasConnections
              rooms={doc.rooms}
              pseudoRooms={doc.pseudoRooms}
              connections={doc.connections}
              stickyNotes={doc.stickyNotes}
              stickyNoteLinks={doc.stickyNoteLinks}
              onOpenConnectionEditor={openConnectionEditor}
              suppressCanvasClick={() => {
                suppressCanvasClickRef.current = true;
              }}
              theme={theme}
              visualStyle={mapVisualStyle}
              toMapPoint={toMapPoint}
            />
          )}

          {pseudoRooms.map((pseudoRoom) => (
            <MapCanvasPseudoRoomNode
              key={pseudoRoom.id}
              pseudoRoom={pseudoRoom}
              theme={theme}
              isSelected={selectedPseudoRoomIds.includes(pseudoRoom.id)}
              onOpenPseudoRoomEditor={openPseudoRoomEditor}
              toMapPoint={toMapPoint}
            />
          ))}

          {stickyNotes.map((stickyNote) => (
            <MapCanvasStickyNote
              key={stickyNote.id}
              stickyNote={stickyNote}
              isSelected={selectedStickyNoteIds.includes(stickyNote.id)}
              isEditing={stickyNoteEditorId === stickyNote.id}
              toMapPoint={toMapPoint}
              onOpenEditor={openStickyNoteEditor}
              onCloseEditor={closeStickyNoteEditor}
            />
          ))}

          {rooms.map((room) => (
            <MapCanvasRoomNode
              key={room.id}
              room={room}
              roomItems={itemsByRoomId[room.id] ?? []}
              theme={theme}
              isSelected={selectedRoomIds.includes(room.id)}
              isRoomEditorOpen={isRoomEditorOpen}
              onOpenRoomEditor={openRoomEditor}
              onEmptyConnectionDrop={openConnectionCreationMenu}
              toMapPoint={toMapPoint}
            />
          ))}
        </div>

        {pendingConnectionDrop && (
          <div
            className="map-canvas-connection-create-menu"
            data-testid="connection-create-menu"
            style={{
              position: 'absolute',
              left: `${pendingConnectionDrop.screenX}px`,
              top: `${pendingConnectionDrop.screenY}px`,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <button type="button" className="room-editor-primary" onClick={() => handleCreateFromPendingDrop('room')}>Room</button>
            <div className="map-canvas-connection-create-icon-grid" role="group" aria-label="Pseudo-room choices">
              <PseudoRoomMenuButton kind="unknown" label="Unknown" onSelect={handleCreateFromPendingDrop} />
              <PseudoRoomMenuButton kind="infinite" label="Infinite" onSelect={handleCreateFromPendingDrop} />
              <PseudoRoomMenuButton kind="death" label="Death" onSelect={handleCreateFromPendingDrop} />
              <PseudoRoomMenuButton kind="nowhere" label="Nowhere" onSelect={handleCreateFromPendingDrop} />
            </div>
            <button type="button" className="room-editor-secondary" onClick={closeConnectionCreationMenu}>Cancel</button>
          </div>
        )}

        {selectionBox && (
          <div
            className="map-canvas-selection-box"
            data-testid="map-canvas-selection-box"
            style={getSelectionBounds(selectionBox)}
          />
        )}
        {(isExportDialogOpen || isPickingExportRegion) && exportScope === 'region' && (exportRegionDraft || exportRegion) && (
          <div
            className="map-canvas-export-region"
            data-testid="map-canvas-export-region"
            style={(() => {
              const region = exportRegionDraft
                ? {
                  left: Math.min(exportRegionDraft.start.x, exportRegionDraft.current.x),
                  top: Math.min(exportRegionDraft.start.y, exportRegionDraft.current.y),
                  right: Math.max(exportRegionDraft.start.x, exportRegionDraft.current.x),
                  bottom: Math.max(exportRegionDraft.start.y, exportRegionDraft.current.y),
                }
                : exportRegion;

              if (!region) {
                return undefined;
              }

              return {
                left: `${(region.left * zoom) + panOffset.x}px`,
                top: `${(region.top * zoom) + panOffset.y}px`,
                width: `${(region.right - region.left) * zoom}px`,
                height: `${(region.bottom - region.top) * zoom}px`,
              };
            })()}
          />
        )}
        <div
          className="map-canvas-actions"
          onMouseDown={(event) => {
            event.stopPropagation();
          }}
          onClick={(event) => {
            event.stopPropagation();
          }}
          onDoubleClick={(event) => {
            event.stopPropagation();
          }}
        >
          <UndoButton />
          <RedoButton />
          <PrettifyButton />
          <BackgroundImageControls />
          <button
            className="app-control-button"
            type="button"
            aria-label="Export PNG"
            title="Export PNG"
            onClick={() => {
              clearExportRegion();
              setPreferredExportScope(hasExportSelection ? 'selection' : 'entire-map');
              setExportScope(hasExportSelection ? 'selection' : 'entire-map');
              setIsExportDialogOpen(true);
            }}
          >
            <svg width="16" height="16" viewBox="0 0 640 640" fill="currentColor" aria-hidden="true">
              <path d={DOWNLOAD_SOLID_FULL_PATH} />
            </svg>
          </button>
        </div>
      </div>

      <ExportPngDialog
        isOpen={isExportDialogOpen}
        mapName={mapName}
        onClose={() => {
          clearExportRegion();
          setIsPickingExportRegion(false);
          setIsExportDialogOpen(false);
          setExportScope('entire-map');
          setPreferredExportScope(null);
        }}
        canvasViewportSize={{
          width: effectiveCanvasRect?.width ?? 0,
          height: effectiveCanvasRect?.height ?? 0,
        }}
        panOffset={{ x: panOffset.x, y: panOffset.y }}
        zoom={zoom}
        onScopeChange={setExportScope}
        onRequestRegionSelection={() => {
          clearExportRegion();
          setIsExportDialogOpen(false);
          setIsPickingExportRegion(true);
          setPreferredExportScope('region');
        }}
        preferredInitialScope={preferredExportScope}
      />

      {roomEditorState && (
        <RoomEditorOverlay
          key={roomEditorId ?? roomEditorState?.pseudoRoomId ?? `new-room-${roomEditorState.initialPosition?.x ?? 0}-${roomEditorState.initialPosition?.y ?? 0}`}
          roomId={roomEditorId ?? undefined}
          pseudoRoomId={roomEditorState?.pseudoRoomId}
          initialPosition={roomEditorState.initialPosition}
          visibleMapLeftInset={visibleMapLeftInset}
          theme={theme}
          onClose={(savedRoomId) => {
            closeRoomEditor();
            if (savedRoomId) {
              useEditorStore.getState().selectRoom(savedRoomId);
            }
          }}
          onBackdropClose={closeRoomEditorFromBackdrop}
        />
      )}
      {connectionEditorId && (
        <ConnectionEditorOverlay
          key={connectionEditorId}
          connectionId={connectionEditorId}
          visibleMapLeftInset={visibleMapLeftInset}
          onClose={closeConnectionEditor}
          onBackdropClose={closeConnectionEditorFromBackdrop}
        />
      )}
    </div>
  );
}
