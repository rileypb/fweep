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
import { MapCanvasConnections } from './map-canvas-connections';
import { MapCanvasBackground, type MapCanvasBackgroundHandle } from './map-canvas-background';
import { MapDrawingToolbar } from './map-drawing-toolbar';
import {
  blobToCanvas,
  canvasToBlob,
  createRasterCanvas,
  drawStrokeSegment,
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
  readonly canvas: HTMLCanvasElement;
}

interface ActiveDrawingStroke {
  readonly layerId: string;
  readonly toolState: ReturnType<typeof getDrawingToolSnapshot>;
  lastPoint: MapPixelPoint;
  readonly chunks: Map<string, StrokeChunkState>;
}

const AUTO_PAN_ANIMATION_MS = 320;

function getDrawingToolSnapshot(): ReturnType<typeof useEditorStore.getState>['drawingToolState'] {
  const { drawingToolState } = useEditorStore.getState();
  return {
    ...drawingToolState,
    colorRgbHex: normalizeHexColor(drawingToolState.colorRgbHex),
  };
}

function isCanvasChromeTarget(target: Element | null): boolean {
  return Boolean(target?.closest('[data-room-id], [data-connection-id], .map-canvas-header, .map-drawing-toolbar'));
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
}

export function MapCanvas({ mapName, showGrid: initialShowGrid = true }: MapCanvasProps): React.JSX.Element {
  const [roomEditorId, setRoomEditorId] = useState<string | null>(null);
  const [connectionEditorId, setConnectionEditorId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [isAutoPanning, setIsAutoPanning] = useState(false);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const doc = useEditorStore((s) => s.doc);
  const selectedRoomIds = useEditorStore((s) => s.selectedRoomIds);
  const selectedConnectionIds = useEditorStore((s) => s.selectedConnectionIds);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const addRoomAtPosition = useEditorStore((s) => s.addRoomAtPosition);
  const setSelection = useEditorStore((s) => s.setSelection);
  const removeSelectedRooms = useEditorStore((s) => s.removeSelectedRooms);
  const removeSelectedConnections = useEditorStore((s) => s.removeSelectedConnections);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const connectionDrag = useEditorStore((s) => s.connectionDrag);
  const activeStroke = useEditorStore((s) => s.activeStroke);
  const backgroundRevision = useEditorStore((s) => s.backgroundRevision);
  const canvasInteractionMode = useEditorStore((s) => s.canvasInteractionMode);
  const showGridEnabled = useEditorStore((s) => s.showGridEnabled);
  const toggleShowGrid = useEditorStore((s) => s.toggleShowGrid);
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

  const rooms = doc ? Object.values(doc.rooms) : [];

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

      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        setCanvasInteractionMode(canvasInteractionMode === 'draw' ? 'map' : 'draw');
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [canvasInteractionMode, connectionDrag, connectionEditorId, redo, roomEditorId, setCanvasInteractionMode, undo]);

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
    setConnectionEditorId(null);
    panToRoomEditorPosition(roomId);
    setRoomEditorId(roomId);
  }, [panToRoomEditorPosition]);

  const openConnectionEditor = useCallback((connectionId: string) => {
    setRoomEditorId(null);
    setConnectionEditorId(connectionId);
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
    const canvas = storedChunk ? await blobToCanvas(storedChunk.blob) : createRasterCanvas();
    const strokeChunk: StrokeChunkState = {
      chunkX: coordinates.chunkX,
      chunkY: coordinates.chunkY,
      key,
      beforeBlob: storedChunk?.blob ?? null,
      canvas,
    };
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
        drawStrokeSegment(chunk.canvas, currentStroke.toolState, localPoint, localPoint);
        touchedKeys.add(chunk.key);
      }
    }

    touchedKeys.forEach((chunkKey) => {
      const chunk = currentStroke.chunks.get(chunkKey);
      if (chunk) {
        backgroundRef.current?.redrawChunk(chunkKey, chunk.chunkX, chunk.chunkY, chunk.canvas);
      }
    });
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
      const afterBlob = isCanvasEmpty(chunk.canvas) ? null : await canvasToBlob(chunk.canvas);
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

    const drawingEnabled = supportsRasterCanvas();

    if (!e.shiftKey && doc && drawingEnabled && canvasInteractionMode === 'draw') {
      e.preventDefault();
      suppressCanvasClickRef.current = true;
      const layerId = ensureDefaultBackgroundLayer();
      beginBackgroundStroke(layerId);
      const startPoint = toMapPoint(e.clientX, e.clientY);
      const activeDrawingStroke: ActiveDrawingStroke = {
        layerId,
        toolState: getDrawingToolSnapshot(),
        lastPoint: startPoint,
        chunks: new Map<string, StrokeChunkState>(),
      };
      drawingStrokeRef.current = activeDrawingStroke;

      const drawAtPoint = async (point: MapPixelPoint) => {
        if (!drawingStrokeRef.current) {
          return;
        }
        await drawStrokePoint(drawingStrokeRef.current.lastPoint, point);
        drawingStrokeRef.current.lastPoint = point;
      };

      void drawAtPoint(startPoint);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        void drawAtPoint(toMapPoint(moveEvent.clientX, moveEvent.clientY));
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

    if (e.shiftKey || !drawingEnabled || canvasInteractionMode === 'map') {
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
          doc ? getConnectionsWithinSelectionBox(doc.rooms, doc.connections, panOffsetRef.current, nextSelectionBox) : [],
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
    canvasInteractionMode,
    canvasRect,
    connectionDrag,
    connectionEditorId,
    doc,
    drawStrokePoint,
    ensureDefaultBackgroundLayer,
    finishDrawingStroke,
    panOffsetRef,
    roomEditorId,
    rooms,
    setSelection,
    toMapPoint,
  ]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 1 || roomEditorId !== null || connectionEditorId !== null || connectionDrag !== null) {
      return;
    }

    const target = e.target as Element | null;
    if (isCanvasChromeTarget(target) || isEditableTarget(target)) {
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
  }, [connectionDrag, connectionEditorId, roomEditorId, panOffsetRef, setPanOffset]);

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

    canvasRef.current?.focus();
    clearSelection();
  }, [activeStroke, canvasRef, clearSelection, connectionEditorId, roomEditorId]);

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

    if (!e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      setCanvasInteractionMode(canvasInteractionMode === 'draw' ? 'map' : 'draw');
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      const { selectedConnectionIds: currentSelectedConnectionIds } = useEditorStore.getState();
      if (selectedRoomIds.length === 0 && currentSelectedConnectionIds.length === 0) {
        return;
      }

      e.preventDefault();
      removeSelectedRooms();
      removeSelectedConnections();
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
  }, [canvasInteractionMode, connectionDrag, connectionEditorId, openRoomEditor, panRoomIntoView, redo, removeSelectedConnections, removeSelectedRooms, roomEditorId, rooms, selectedRoomIds, setCanvasInteractionMode, undo]);

  const classes = [
    'map-canvas',
    showGrid ? 'map-canvas--grid' : '',
    isPanning ? 'map-canvas--panning' : '',
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
        <MapDrawingToolbar />
        <header className="map-canvas-header">
          <span className="map-canvas-title">{mapName}</span>
          <button
            className="map-canvas-grid-toggle"
            type="button"
            aria-label="Toggle grid"
            title="Toggle grid"
            onClick={toggleShowGrid}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <line x1="0" y1="4" x2="16" y2="4" />
              <line x1="0" y1="8" x2="16" y2="8" />
              <line x1="0" y1="12" x2="16" y2="12" />
              <line x1="4" y1="0" x2="4" y2="16" />
              <line x1="8" y1="0" x2="8" y2="16" />
              <line x1="12" y1="0" x2="12" y2="16" />
            </svg>
          </button>
        </header>

        {doc && (rooms.length > 0 || doc.background.activeLayerId !== null) && (
          <MapMinimap
            mapId={doc.metadata.id}
            background={doc.background}
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
          {doc && (
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
              onOpenConnectionEditor={openConnectionEditor}
              theme={theme}
            />
          )}

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
      </div>

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
