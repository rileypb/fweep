import { useCallback, useEffect, useRef, useState } from 'react';
import type { Room } from '../domain/map-types';
import { MapMinimap } from './map-minimap';
import { useEditorStore } from '../state/editor-store';
import { useMapViewport } from './use-map-viewport';
import {
  findNearestRoomInDirection,
  getConnectionsWithinSelectionBox,
  getPanDeltaToRevealRoom,
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
import { MapCanvasStickyNote } from './map-canvas-sticky-note';
import { MapCanvasConnections } from './map-canvas-connections';
import { MapCanvasBackground, type MapCanvasBackgroundHandle } from './map-canvas-background';
import { MapDrawingToolbar } from './map-drawing-toolbar';
import { ExportPngDialog } from './export-png-dialog';
import { PrettifyButton } from './prettify-button';
import { RedoButton } from './redo-button';
import { UndoButton } from './undo-button';
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

const AUTO_PAN_ANIMATION_MS = 320;

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

export interface MapCanvasProps {
  mapName: string;
  showGrid?: boolean;
  onBack?: () => void;
  requestedRoomEditorId?: string | null;
  onRoomEditorRequestHandled?: () => void;
}

export function MapCanvas({
  mapName,
  showGrid: initialShowGrid = true,
  requestedRoomEditorId = null,
  onRoomEditorRequestHandled,
}: MapCanvasProps): React.JSX.Element {
  const drawingInterfaceEnabled = isDrawingInterfaceEnabled();
  const [roomEditorId, setRoomEditorId] = useState<string | null>(null);
  const [connectionEditorId, setConnectionEditorId] = useState<string | null>(null);
  const [stickyNoteEditorId, setStickyNoteEditorId] = useState<string | null>(null);
  const [isExportDialogOpen, setIsExportDialogOpen] = useState(false);
  const [isPickingExportRegion, setIsPickingExportRegion] = useState(false);
  const [exportScope, setExportScope] = useState<ExportScope>('entire-map');
  const [preferredExportScope, setPreferredExportScope] = useState<ExportScope | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [isAutoPanning, setIsAutoPanning] = useState(false);
  const [isShiftKeyDown, setIsShiftKeyDown] = useState(false);
  const [isAltKeyDown, setIsAltKeyDown] = useState(false);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const doc = useEditorStore((s) => s.doc);
  const selectedRoomIds = useEditorStore((s) => s.selectedRoomIds);
  const selectedStickyNoteIds = useEditorStore((s) => s.selectedStickyNoteIds);
  const selectedConnectionIds = useEditorStore((s) => s.selectedConnectionIds);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const addRoomAtPosition = useEditorStore((s) => s.addRoomAtPosition);
  const addStickyNoteAtPosition = useEditorStore((s) => s.addStickyNoteAtPosition);
  const setSelection = useEditorStore((s) => s.setSelection);
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
  const activeStroke = useEditorStore((s) => s.activeStroke);
  const backgroundRevision = useEditorStore((s) => s.backgroundRevision);
  const canvasInteractionMode = useEditorStore((s) => s.canvasInteractionMode);
  const showGridEnabled = useEditorStore((s) => s.showGridEnabled);
  const persistedPanOffset = useEditorStore((s) => s.mapPanOffset);
  const setMapPanOffset = useEditorStore((s) => s.setMapPanOffset);
  const setCanvasInteractionMode = useEditorStore((s) => s.setCanvasInteractionMode);
  const ensureDefaultBackgroundLayer = useEditorStore((s) => s.ensureDefaultBackgroundLayer);
  const beginBackgroundStroke = useEditorStore((s) => s.beginBackgroundStroke);
  const cancelBackgroundStroke = useEditorStore((s) => s.cancelBackgroundStroke);
  const commitBackgroundStroke = useEditorStore((s) => s.commitBackgroundStroke);
  const autoPanTimeoutRef = useRef<number | null>(null);
  const suppressCanvasClickRef = useRef(false);
  const persistPanTimeoutRef = useRef<number | null>(null);
  const backgroundRef = useRef<MapCanvasBackgroundHandle | null>(null);
  const drawingStrokeRef = useRef<ActiveDrawingStroke | null>(null);
  const theme = useDocumentTheme();
  const {
    canvasRef,
    canvasRect,
    effectiveCanvasRect,
    panOffset,
    panOffsetRef,
    setPanOffset,
    panBy,
    centerOnMapPoint,
    toMapPoint,
  } = useMapViewport({ initialPanOffset: persistedPanOffset });

  const showGrid = doc ? showGridEnabled : initialShowGrid;
  const effectiveCanvasInteractionMode = drawingInterfaceEnabled ? canvasInteractionMode : 'map';
  const minimapBackground = drawingInterfaceEnabled && doc ? doc.background : {
    activeLayerId: null,
    layers: {},
  };

  const rooms = doc ? Object.values(doc.rooms) : [];
  const stickyNotes = doc ? Object.values(doc.stickyNotes) : [];

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
      setIsAltKeyDown(event.altKey);
    };

    const handleWindowBlur = () => {
      setIsShiftKeyDown(false);
      setIsAltKeyDown(false);
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
    if (autoPanTimeoutRef.current !== null) {
      window.clearTimeout(autoPanTimeoutRef.current);
    }
    if (persistPanTimeoutRef.current !== null) {
      window.clearTimeout(persistPanTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      if (roomEditorId !== null || connectionEditorId !== null || connectionDrag !== null) {
        return;
      }

      if (isEditableTarget(event.target)) {
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

      if (drawingInterfaceEnabled && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        setCanvasInteractionMode(canvasInteractionMode === 'draw' ? 'map' : 'draw');
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [canvasInteractionMode, connectionDrag, connectionEditorId, drawingInterfaceEnabled, redo, roomEditorId, setCanvasInteractionMode, undo]);

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

  const closeRoomEditor = useCallback(() => {
    setRoomEditorId(null);
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

    if (autoPanTimeoutRef.current !== null) {
      window.clearTimeout(autoPanTimeoutRef.current);
    }

    autoPanTimeoutRef.current = window.setTimeout(() => {
      setIsAutoPanning(false);
      autoPanTimeoutRef.current = null;
    }, AUTO_PAN_ANIMATION_MS);
  }, []);

  const panToRoomEditorPosition = useCallback((roomId: string) => {
    const canvasEl = canvasRef.current;
    const room = useEditorStore.getState().doc?.rooms[roomId];
    if (!canvasEl || !room) {
      return;
    }

    const nextCanvasRect = canvasEl.getBoundingClientRect();
    const canvasWidth = nextCanvasRect.width || canvasEl.clientWidth;
    const canvasHeight = nextCanvasRect.height || canvasEl.clientHeight;
    const roomGeometry = getRoomScreenGeometry(room, panOffsetRef.current, nextCanvasRect);
    const roomCenterX = roomGeometry.centerX - nextCanvasRect.left;
    const roomTopY = roomGeometry.top - nextCanvasRect.top;

    startAutoPanAnimation();
    setPanOffset((prev) => ({
      x: prev.x + ((canvasWidth / 2) - roomCenterX),
      y: prev.y + ((canvasHeight / 3) - roomTopY),
    }));
  }, [canvasRef, panOffsetRef, setPanOffset, startAutoPanAnimation]);

  const openRoomEditor = useCallback((roomId: string) => {
    setStickyNoteEditorId(null);
    setConnectionEditorId(null);
    panToRoomEditorPosition(roomId);
    setRoomEditorId(roomId);
  }, [panToRoomEditorPosition]);

  useEffect(() => {
    if (requestedRoomEditorId === null) {
      return;
    }

    openRoomEditor(requestedRoomEditorId);
    onRoomEditorRequestHandled?.();
  }, [onRoomEditorRequestHandled, openRoomEditor, requestedRoomEditorId]);

  const openConnectionEditor = useCallback((connectionId: string) => {
    setStickyNoteEditorId(null);
    setRoomEditorId(null);
    setConnectionEditorId(connectionId);
  }, []);

  const openStickyNoteEditor = useCallback((stickyNoteId: string) => {
    setRoomEditorId(null);
    setConnectionEditorId(null);
    setStickyNoteEditorId(stickyNoteId);
  }, []);

  const closeStickyNoteEditor = useCallback(() => {
    setStickyNoteEditorId(null);
  }, []);

  const panRoomIntoView = useCallback((room: Room) => {
    const currentCanvasRect = canvasRef.current?.getBoundingClientRect() ?? canvasRect;
    const delta = getPanDeltaToRevealRoom(room, panOffsetRef.current, currentCanvasRect);

    if (delta.x === 0 && delta.y === 0) {
      return;
    }

    startAutoPanAnimation();
    setPanOffset((prev) => ({
      x: prev.x + delta.x,
      y: prev.y + delta.y,
    }));
  }, [canvasRect, canvasRef, panOffsetRef, setPanOffset, startAutoPanAnimation]);

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
    if (e.button !== 0 || roomEditorId !== null || connectionEditorId !== null || connectionDrag !== null) {
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
          getRoomsWithinSelectionBox(rooms, panOffsetRef.current, canvasRect, nextSelectionBox),
          getStickyNotesWithinSelectionBox(stickyNotes, panOffsetRef.current, canvasRect, nextSelectionBox),
          doc ? getConnectionsWithinSelectionBox(doc.rooms, doc.connections, panOffsetRef.current, nextSelectionBox) : [],
          doc ? getStickyNoteLinksWithinSelectionBox(doc.rooms, doc.stickyNotes, doc.stickyNoteLinks, panOffsetRef.current, nextSelectionBox) : [],
        );
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
    connectionEditorId,
    doc,
    drawingInterfaceEnabled,
    drawStrokePoint,
    applyBucketFill,
    ensureDefaultBackgroundLayer,
    finishDrawingStroke,
    isPickingExportRegion,
    panOffsetRef,
    roomEditorId,
    rooms,
    stickyNotes,
    setSelection,
    toMapPoint,
    updateExportRegion,
    exportScope,
    effectiveCanvasInteractionMode,
  ]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (roomEditorId !== null || connectionEditorId !== null || connectionDrag !== null) {
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

    if (autoPanTimeoutRef.current !== null) {
      window.clearTimeout(autoPanTimeoutRef.current);
      autoPanTimeoutRef.current = null;
    }
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
  }, [connectionDrag, connectionEditorId, effectiveCanvasInteractionMode, roomEditorId, panOffsetRef, setPanOffset]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (roomEditorId || connectionEditorId || activeStroke) return;

    if (suppressCanvasClickRef.current) {
      suppressCanvasClickRef.current = false;
      return;
    }

    const target = e.target as Element | null;
    if (isCanvasChromeTarget(target) || isEditableTarget(target)) {
      return;
    }

    if (e.shiftKey && doc) {
      const { x, y } = toMapPoint(e.clientX, e.clientY);
      const stickyNoteId = addStickyNoteAtPosition('', { x, y });
      useEditorStore.getState().selectStickyNote(stickyNoteId);
      setStickyNoteEditorId(null);
      return;
    }

    closeStickyNoteEditor();
    canvasRef.current?.focus();
    clearSelection();
  }, [activeStroke, addStickyNoteAtPosition, canvasRef, clearSelection, closeStickyNoteEditor, connectionEditorId, doc, roomEditorId, toMapPoint]);

  const handleCanvasDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (roomEditorId || connectionEditorId || activeStroke) return;

    const target = e.target as Element | null;
    if (isCanvasChromeTarget(target) || isEditableTarget(target)) {
      return;
    }

    const { x, y } = toMapPoint(e.clientX, e.clientY);
    const roomId = addRoomAtPosition('Room', { x, y });
    openRoomEditor(roomId);
  }, [activeStroke, addRoomAtPosition, connectionEditorId, openRoomEditor, roomEditorId, toMapPoint]);

  const handleCanvasKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (roomEditorId !== null || connectionEditorId !== null || connectionDrag !== null) {
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
    panRoomIntoView(nearestRoom);
  }, [canvasInteractionMode, connectionDrag, connectionEditorId, drawingInterfaceEnabled, openRoomEditor, panRoomIntoView, redo, removeSelectedEntities, roomEditorId, rooms, selectedRoomIds, selectedStickyNoteIds, setCanvasInteractionMode, toggleSelectedRoomLocks, undo]);

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
      onClick={handleCanvasClick}
      onDoubleClick={handleCanvasDoubleClick}
      onKeyDown={handleCanvasKeyDown}
      tabIndex={-1}
      style={showGrid ? { backgroundPosition: `${panOffset.x}px ${panOffset.y}px` } : undefined}
    >
        <div
          className={`map-canvas-scene${roomEditorId || connectionEditorId ? ' map-canvas-scene--editor-open' : ''}`}
          data-testid="map-canvas-scene"
        >
          {drawingInterfaceEnabled && <MapDrawingToolbar />}
        {doc && (rooms.length > 0 || stickyNotes.length > 0 || minimapBackground.activeLayerId !== null) && (
          <MapMinimap
            mapId={doc.metadata.id}
            background={minimapBackground}
            backgroundRevision={backgroundRevision}
            rooms={doc.rooms}
            connections={doc.connections}
            selectedRoomIds={selectedRoomIds}
            selectedConnectionIds={selectedConnectionIds}
            panOffset={panOffset}
            canvasRect={effectiveCanvasRect}
            theme={theme}
            disabled={roomEditorId !== null || connectionEditorId !== null}
            onPanToMapPoint={centerOnMapPoint}
            onPanBy={panBy}
          />
        )}

        <div
          className={`map-canvas-content${isAutoPanning ? ' map-canvas-content--animated' : ''}`}
          data-testid="map-canvas-content"
          style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px)` }}
        >
          {drawingInterfaceEnabled && doc && (
            <MapCanvasBackground
              ref={backgroundRef}
              mapId={doc.metadata.id}
              background={doc.background}
              panOffset={panOffset}
              canvasRect={effectiveCanvasRect}
              backgroundRevision={backgroundRevision}
            />
          )}
          {doc && (
            <MapCanvasConnections
              rooms={doc.rooms}
              connections={doc.connections}
              stickyNotes={doc.stickyNotes}
              stickyNoteLinks={doc.stickyNoteLinks}
              onOpenConnectionEditor={openConnectionEditor}
              theme={theme}
            />
          )}

          {stickyNotes.map((stickyNote) => (
            <MapCanvasStickyNote
              key={stickyNote.id}
              stickyNote={stickyNote}
              isSelected={selectedStickyNoteIds.includes(stickyNote.id)}
              isEditing={stickyNoteEditorId === stickyNote.id}
              isAltKeyDown={isAltKeyDown}
              toMapPoint={toMapPoint}
              onOpenEditor={openStickyNoteEditor}
              onCloseEditor={closeStickyNoteEditor}
            />
          ))}

          {rooms.map((room) => (
            <MapCanvasRoomNode
              key={room.id}
              room={room}
              theme={theme}
              isSelected={selectedRoomIds.includes(room.id)}
              isRoomEditorOpen={roomEditorId !== null}
              onOpenRoomEditor={openRoomEditor}
              toMapPoint={toMapPoint}
            />
          ))}
        </div>

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
                left: `${region.left + panOffset.x}px`,
                top: `${region.top + panOffset.y}px`,
                width: `${region.right - region.left}px`,
                height: `${region.bottom - region.top}px`,
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
          <button
            className="app-control-button"
            type="button"
            aria-label="Export PNG"
            title="Export PNG"
            onClick={() => {
              clearExportRegion();
              setPreferredExportScope(null);
              setIsExportDialogOpen(true);
            }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M8 2.5v7" strokeLinecap="round" />
              <path d="M5.5 7 8 9.5 10.5 7" strokeLinecap="round" strokeLinejoin="round" />
              <rect x="2.5" y="10.5" width="11" height="3" rx="1" />
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
        onScopeChange={setExportScope}
        onRequestRegionSelection={() => {
          clearExportRegion();
          setIsExportDialogOpen(false);
          setIsPickingExportRegion(true);
          setPreferredExportScope('region');
        }}
        preferredInitialScope={preferredExportScope}
      />

      {roomEditorId && (
        <RoomEditorOverlay
          roomId={roomEditorId}
          panOffset={panOffset}
          canvasRect={effectiveCanvasRect}
          theme={theme}
          onClose={closeRoomEditor}
          onBackdropClose={closeRoomEditorFromBackdrop}
        />
      )}
      {connectionEditorId && (
        <ConnectionEditorOverlay
          connectionId={connectionEditorId}
          onClose={closeConnectionEditor}
          onBackdropClose={closeConnectionEditorFromBackdrop}
        />
      )}
    </div>
  );
}
