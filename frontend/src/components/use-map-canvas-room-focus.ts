import { useCallback, useLayoutEffect } from 'react';
import { createRoom, type MapVisualStyle, type Position, type Room } from '../domain/map-types';
import { useEditorStore } from '../state/editor-store';
import { getRoomScreenGeometry } from './map-canvas-helpers';
import type { PanOffset } from './use-map-viewport';

export interface MapCanvasRoomEditorState {
  readonly roomId?: string;
  readonly pseudoRoomId?: string;
  readonly initialPosition?: Position;
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
  }, [panToRoomEditorPosition, setConnectionEditorId, setRoomEditorState, setStickyNoteEditorId]);

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
