import { useCallback, useLayoutEffect } from 'react';
import { createRoom, type MapVisualStyle, type Position, type Room } from '../domain/map-types';
import { useEditorStore } from '../state/editor-store';
import { getRoomScreenGeometry } from './map-canvas-helpers';
import type { PanOffset } from './use-map-viewport';

export interface MapCanvasRoomEditorState {
  readonly roomId?: string;
  readonly pseudoRoomId?: string;
  readonly initialPosition?: Position;
  readonly pendingConnectionSourceRoomId?: string;
  readonly pendingConnectionSourceDirection?: string;
}

interface RoomEditorRequest {
  readonly roomId: string;
  readonly requestId: number;
}

interface ViewportFocusRequest {
  readonly roomIds: readonly string[];
  readonly requestId: number;
}

interface UseMapCanvasRoomFocusParams {
  readonly canvasRef: React.RefObject<HTMLDivElement | null>;
  readonly canvasRect: DOMRect | null;
  readonly panOffsetRef: React.RefObject<PanOffset>;
  readonly zoomRef: React.RefObject<number>;
  readonly setPanOffset: React.Dispatch<React.SetStateAction<PanOffset>>;
  readonly setMapPanOffset: (position: Position) => void;
  readonly mapVisualStyle: MapVisualStyle;
  readonly visibleMapLeftInset: number;
  readonly visibleMapRightInset: number;
  readonly selectionFocusRightInset: number;
  readonly startAutoPanAnimation: () => void;
  readonly setStickyNoteEditorId: React.Dispatch<React.SetStateAction<string | null>>;
  readonly setConnectionEditorId: React.Dispatch<React.SetStateAction<string | null>>;
  readonly setRoomEditorState: React.Dispatch<React.SetStateAction<MapCanvasRoomEditorState | null>>;
  readonly requestedRoomEditorRequest: RoomEditorRequest | null;
  readonly requestedRoomRevealRequest: RoomEditorRequest | null;
  readonly requestedViewportFocusRequest: ViewportFocusRequest | null;
  readonly onRequestedRoomEditorHandled?: (requestId: number) => void;
  readonly onRequestedRoomRevealHandled?: (requestId: number) => void;
  readonly onRequestedViewportFocusHandled?: (requestId: number) => void;
}

interface RoomFocusApi {
  readonly openRoomEditor: (roomId: string) => void;
  readonly openPseudoRoomEditor: (pseudoRoomId: string) => void;
  readonly openNewRoomEditor: (position: Position) => void;
  readonly centerRoomOnScreen: (room: Room) => void;
}

export function useMapCanvasRoomFocus({
  canvasRef,
  canvasRect,
  panOffsetRef,
  zoomRef,
  setPanOffset,
  setMapPanOffset,
  mapVisualStyle,
  visibleMapLeftInset,
  visibleMapRightInset,
  selectionFocusRightInset,
  startAutoPanAnimation,
  setStickyNoteEditorId,
  setConnectionEditorId,
  setRoomEditorState,
  requestedRoomEditorRequest,
  requestedRoomRevealRequest,
  requestedViewportFocusRequest,
  onRequestedRoomEditorHandled,
  onRequestedRoomRevealHandled,
  onRequestedViewportFocusHandled,
}: UseMapCanvasRoomFocusParams): RoomFocusApi {
  const getSelectionViewportCenterX = useCallback((canvasWidth: number) => {
    const visibleWidth = Math.max(canvasWidth - visibleMapLeftInset - selectionFocusRightInset, 0);
    return visibleMapLeftInset + (visibleWidth / 2);
  }, [selectionFocusRightInset, visibleMapLeftInset]);

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
    const visibleWidth = Math.max(canvasWidth - visibleMapLeftInset - visibleMapRightInset, 0);
    const visibleCenterX = visibleMapLeftInset + (visibleWidth / 2);

    startAutoPanAnimation();
    setPanOffset((prev) => ({
      x: prev.x + (visibleCenterX - roomCenterX),
      y: prev.y + ((canvasHeight / 3) - roomTopY),
    }));
  }, [canvasRef, mapVisualStyle, panOffsetRef, setPanOffset, startAutoPanAnimation, visibleMapLeftInset, visibleMapRightInset, zoomRef]);

  const openRoomEditor = useCallback((roomId: string) => {
    setStickyNoteEditorId(null);
    setConnectionEditorId(null);
    setRoomEditorState({ roomId });
  }, [setConnectionEditorId, setRoomEditorState, setStickyNoteEditorId]);

  const openPseudoRoomEditor = useCallback((pseudoRoomId: string) => {
    setStickyNoteEditorId(null);
    setConnectionEditorId(null);
    setRoomEditorState({ pseudoRoomId });
  }, [setConnectionEditorId, setRoomEditorState, setStickyNoteEditorId]);

  const openNewRoomEditor = useCallback((position: Position) => {
    setStickyNoteEditorId(null);
    setConnectionEditorId(null);
    panToRoomEditorPositionForRoom({
      ...createRoom('Room'),
      position,
    });
    setRoomEditorState({ initialPosition: position });
  }, [panToRoomEditorPositionForRoom, setConnectionEditorId, setRoomEditorState, setStickyNoteEditorId]);

  const centerRoomOnScreen = useCallback((room: Room) => {
    const currentCanvasRect = canvasRef.current?.getBoundingClientRect() ?? canvasRect;
    const roomGeometry = getRoomScreenGeometry(room, panOffsetRef.current, currentCanvasRect, zoomRef.current, mapVisualStyle);
    const canvasWidth = currentCanvasRect?.width ?? canvasRef.current?.clientWidth ?? 0;
    const canvasHeight = currentCanvasRect?.height ?? canvasRef.current?.clientHeight ?? 0;
    const roomCenterX = roomGeometry.centerX - (currentCanvasRect?.left ?? 0);
    const roomCenterY = (roomGeometry.top - (currentCanvasRect?.top ?? 0)) + (roomGeometry.height / 2);
    const visibleCenterX = getSelectionViewportCenterX(canvasWidth);

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
  }, [canvasRect, canvasRef, getSelectionViewportCenterX, mapVisualStyle, panOffsetRef, setMapPanOffset, setPanOffset, startAutoPanAnimation, zoomRef]);

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
    const visibleCenterX = getSelectionViewportCenterX(canvasWidth);
    const roomCenters = screenBounds.map((room) => ({
      x: (room.left - (currentCanvasRect?.left ?? 0)) + (room.width / 2),
      y: (room.top - (currentCanvasRect?.top ?? 0)) + (room.height / 2),
    }));
    const groupCenterX = roomCenters.reduce((sum, room) => sum + room.x, 0) / roomCenters.length;
    const groupCenterY = roomCenters.reduce((sum, room) => sum + room.y, 0) / roomCenters.length;

    startAutoPanAnimation();
    const nextPanOffset = {
      x: panOffsetRef.current.x + (visibleCenterX - groupCenterX),
      y: panOffsetRef.current.y + ((canvasHeight / 2) - groupCenterY),
    };
    panOffsetRef.current = nextPanOffset;
    setPanOffset(nextPanOffset);
    setMapPanOffset(nextPanOffset);
  }, [canvasRect, canvasRef, centerRoomOnScreen, getSelectionViewportCenterX, mapVisualStyle, panOffsetRef, setMapPanOffset, setPanOffset, startAutoPanAnimation, zoomRef]);

  useLayoutEffect(() => {
    if (requestedRoomEditorRequest === null) {
      return;
    }

    openRoomEditor(requestedRoomEditorRequest.roomId);
    onRequestedRoomEditorHandled?.(requestedRoomEditorRequest.requestId);
  }, [onRequestedRoomEditorHandled, openRoomEditor, requestedRoomEditorRequest]);

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

  return {
    openRoomEditor,
    openPseudoRoomEditor,
    openNewRoomEditor,
    centerRoomOnScreen,
  };
}
