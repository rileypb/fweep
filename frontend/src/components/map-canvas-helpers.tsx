import { useEffect, useState } from 'react';
import {
  type Connection,
  type Room,
  type RoomShape,
  type RoomStrokeStyle,
  type StickyNote,
  type StickyNoteLink,
} from '../domain/map-types';
import {
  getRoomFillColor,
  getRoomStrokeColor,
  type ThemeMode,
} from '../domain/room-color-palette';
import {
  computeConnectionPath,
  ROOM_CORNER_RADIUS,
  ROOM_HEIGHT,
} from '../graph/connection-geometry';
import { STICKY_NOTE_WIDTH, getStickyNoteCenter, getStickyNoteHeight } from '../graph/sticky-note-geometry';
import {
  getRoomShapePath,
  getRoomShapePolygonVertices,
} from '../graph/room-shape-geometry';
import { getRoomNodeWidth } from '../graph/minimap-geometry';
import type { PanOffset } from './use-map-viewport';

const ROOM_VISIBILITY_PADDING = 24;

export interface SelectionBox {
  readonly startX: number;
  readonly startY: number;
  readonly currentX: number;
  readonly currentY: number;
}

export interface RoomScreenGeometry {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
}

type ArrowDirection = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

interface RoomCenter {
  readonly x: number;
  readonly y: number;
}

export function getRoomScreenGeometry(
  room: Room,
  panOffset: PanOffset,
  canvasRect: DOMRect | null,
): RoomScreenGeometry {
  const width = getRoomNodeWidth(room.name);
  const left = (canvasRect?.left ?? 0) + room.position.x + panOffset.x;
  const top = (canvasRect?.top ?? 0) + room.position.y + panOffset.y;

  return {
    left,
    top,
    width,
    height: ROOM_HEIGHT,
    centerX: left + (width / 2),
  };
}

export function getSelectionBounds(
  selectionBox: SelectionBox,
): { left: number; top: number; width: number; height: number } {
  const left = Math.min(selectionBox.startX, selectionBox.currentX);
  const top = Math.min(selectionBox.startY, selectionBox.currentY);
  const width = Math.abs(selectionBox.currentX - selectionBox.startX);
  const height = Math.abs(selectionBox.currentY - selectionBox.startY);

  return { left, top, width, height };
}

export function getRoomsWithinSelectionBox(
  rooms: readonly Room[],
  panOffset: PanOffset,
  canvasRect: DOMRect | null,
  selectionBox: SelectionBox,
): string[] {
  const bounds = getSelectionBounds(selectionBox);
  const boxRight = bounds.left + bounds.width;
  const boxBottom = bounds.top + bounds.height;

  return rooms
    .filter((room) => {
      const geometry = getRoomScreenGeometry(room, panOffset, canvasRect);
      const roomLeft = geometry.left - (canvasRect?.left ?? 0);
      const roomTop = geometry.top - (canvasRect?.top ?? 0);
      const roomRight = roomLeft + geometry.width;
      const roomBottom = roomTop + geometry.height;

      return roomLeft <= boxRight
        && roomRight >= bounds.left
        && roomTop <= boxBottom
        && roomBottom >= bounds.top;
    })
    .map((room) => room.id);
}

export function getStickyNotesWithinSelectionBox(
  stickyNotes: readonly StickyNote[],
  panOffset: PanOffset,
  _canvasRect: DOMRect | null,
  selectionBox: SelectionBox,
): string[] {
  const bounds = getSelectionBounds(selectionBox);
  const boxRight = bounds.left + bounds.width;
  const boxBottom = bounds.top + bounds.height;

  return stickyNotes
    .filter((stickyNote) => {
      const noteLeft = stickyNote.position.x + panOffset.x;
      const noteTop = stickyNote.position.y + panOffset.y;
      const noteRight = noteLeft + STICKY_NOTE_WIDTH;
      const noteBottom = noteTop + getStickyNoteHeight(stickyNote.text);

      return noteLeft <= boxRight
        && noteRight >= bounds.left
        && noteTop <= boxBottom
        && noteBottom >= bounds.top;
    })
    .map((stickyNote) => stickyNote.id);
}

function isPointWithinBounds(
  point: { x: number; y: number },
  bounds: { left: number; top: number; width: number; height: number },
): boolean {
  const right = bounds.left + bounds.width;
  const bottom = bounds.top + bounds.height;
  return point.x >= bounds.left && point.x <= right && point.y >= bounds.top && point.y <= bottom;
}

function lineSegmentsIntersect(
  startA: { x: number; y: number },
  endA: { x: number; y: number },
  startB: { x: number; y: number },
  endB: { x: number; y: number },
): boolean {
  const cross = (
    origin: { x: number; y: number },
    p1: { x: number; y: number },
    p2: { x: number; y: number },
  ) => ((p1.x - origin.x) * (p2.y - origin.y)) - ((p1.y - origin.y) * (p2.x - origin.x));

  const onSegment = (
    start: { x: number; y: number },
    point: { x: number; y: number },
    end: { x: number; y: number },
  ) => point.x >= Math.min(start.x, end.x)
    && point.x <= Math.max(start.x, end.x)
    && point.y >= Math.min(start.y, end.y)
    && point.y <= Math.max(start.y, end.y);

  const d1 = cross(startA, endA, startB);
  const d2 = cross(startA, endA, endB);
  const d3 = cross(startB, endB, startA);
  const d4 = cross(startB, endB, endA);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  if (d1 === 0 && onSegment(startA, startB, endA)) return true;
  if (d2 === 0 && onSegment(startA, endB, endA)) return true;
  if (d3 === 0 && onSegment(startB, startA, endB)) return true;
  if (d4 === 0 && onSegment(startB, endA, endB)) return true;

  return false;
}

function doesPolylineIntersectBounds(
  points: ReturnType<typeof computeConnectionPath>,
  bounds: { left: number; top: number; width: number; height: number },
): boolean {
  if (points.some((point) => isPointWithinBounds(point, bounds))) {
    return true;
  }

  const rectLeft = bounds.left;
  const rectTop = bounds.top;
  const rectRight = bounds.left + bounds.width;
  const rectBottom = bounds.top + bounds.height;
  const rectEdges = [
    [{ x: rectLeft, y: rectTop }, { x: rectRight, y: rectTop }],
    [{ x: rectRight, y: rectTop }, { x: rectRight, y: rectBottom }],
    [{ x: rectRight, y: rectBottom }, { x: rectLeft, y: rectBottom }],
    [{ x: rectLeft, y: rectBottom }, { x: rectLeft, y: rectTop }],
  ] as const;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (rectEdges.some(([edgeStart, edgeEnd]) => lineSegmentsIntersect(start, end, edgeStart, edgeEnd))) {
      return true;
    }
  }

  return false;
}

export function getConnectionsWithinSelectionBox(
  rooms: Readonly<Record<string, Room>>,
  connections: Readonly<Record<string, Connection>>,
  panOffset: PanOffset,
  selectionBox: SelectionBox,
): string[] {
  const bounds = getSelectionBounds(selectionBox);

  return Object.values(connections)
    .filter((connection) => {
      const sourceRoom = rooms[connection.sourceRoomId];
      const targetRoom = rooms[connection.targetRoomId];
      if (!sourceRoom || !targetRoom) {
        return false;
      }

      const sourceDimensions = { width: getRoomNodeWidth(sourceRoom.name), height: ROOM_HEIGHT };
      const targetDimensions = { width: getRoomNodeWidth(targetRoom.name), height: ROOM_HEIGHT };
      const points = computeConnectionPath(
        sourceRoom,
        targetRoom,
        connection,
        undefined,
        sourceDimensions,
        targetDimensions,
      ).map((point) => ({
        x: point.x + panOffset.x,
        y: point.y + panOffset.y,
      }));

      return doesPolylineIntersectBounds(points, bounds);
    })
    .map((connection) => connection.id);
}

export function getStickyNoteLinksWithinSelectionBox(
  rooms: Readonly<Record<string, Room>>,
  stickyNotes: Readonly<Record<string, StickyNote>>,
  stickyNoteLinks: Readonly<Record<string, StickyNoteLink>>,
  panOffset: PanOffset,
  selectionBox: SelectionBox,
): string[] {
  const bounds = getSelectionBounds(selectionBox);

  return Object.values(stickyNoteLinks)
    .filter((stickyNoteLink) => {
      const room = rooms[stickyNoteLink.roomId];
      const stickyNote = stickyNotes[stickyNoteLink.stickyNoteId];
      if (!room || !stickyNote) {
        return false;
      }

      const stickyNoteCenter = getStickyNoteCenter(stickyNote);
      const roomCenter = {
        x: room.position.x + (getRoomNodeWidth(room.name) / 2),
        y: room.position.y + (ROOM_HEIGHT / 2),
      };
      const points = [
        {
          x: stickyNoteCenter.x + panOffset.x,
          y: stickyNoteCenter.y + panOffset.y,
        },
        {
          x: roomCenter.x + panOffset.x,
          y: roomCenter.y + panOffset.y,
        },
      ] as const;

      return doesPolylineIntersectBounds(points, bounds);
    })
    .map((stickyNoteLink) => stickyNoteLink.id);
}

function getRoomCenter(room: Room): RoomCenter {
  return {
    x: room.position.x + (getRoomNodeWidth(room.name) / 2),
    y: room.position.y + (ROOM_HEIGHT / 2),
  };
}

function getDirectionalScore(
  direction: ArrowDirection,
  source: RoomCenter,
  candidate: RoomCenter,
): number | null {
  const dx = candidate.x - source.x;
  const dy = candidate.y - source.y;
  const offAxisPenalty = 2;

  switch (direction) {
    case 'ArrowRight':
      if (dx <= 0 || Math.abs(dy) > dx) return null;
      return dx + (Math.abs(dy) * offAxisPenalty);
    case 'ArrowLeft':
      if (dx >= 0 || Math.abs(dy) > Math.abs(dx)) return null;
      return Math.abs(dx) + (Math.abs(dy) * offAxisPenalty);
    case 'ArrowDown':
      if (dy <= 0 || Math.abs(dx) > dy) return null;
      return dy + (Math.abs(dx) * offAxisPenalty);
    case 'ArrowUp':
      if (dy >= 0 || Math.abs(dx) > Math.abs(dy)) return null;
      return Math.abs(dy) + (Math.abs(dx) * offAxisPenalty);
  }
}

export function findNearestRoomInDirection(
  rooms: readonly Room[],
  selectedRoomId: string,
  direction: ArrowDirection,
): Room | null {
  const sourceRoom = rooms.find((room) => room.id === selectedRoomId);
  if (!sourceRoom) {
    return null;
  }

  const sourceCenter = getRoomCenter(sourceRoom);
  let bestMatch: { room: Room; score: number } | null = null;

  for (const room of rooms) {
    if (room.id === selectedRoomId) {
      continue;
    }

    const score = getDirectionalScore(direction, sourceCenter, getRoomCenter(room));
    if (score === null) {
      continue;
    }

    if (!bestMatch || score < bestMatch.score) {
      bestMatch = { room, score };
    }
  }

  return bestMatch?.room ?? null;
}

export function getPanDeltaToRevealRoom(
  room: Room,
  panOffset: PanOffset,
  canvasRect: DOMRect | null,
): PanOffset {
  const roomGeometry = getRoomScreenGeometry(room, panOffset, canvasRect);
  const canvasWidth = canvasRect?.width ?? 0;
  const canvasHeight = canvasRect?.height ?? 0;
  const roomLeft = roomGeometry.left - (canvasRect?.left ?? 0);
  const roomTop = roomGeometry.top - (canvasRect?.top ?? 0);
  const roomRight = roomLeft + roomGeometry.width;
  const roomBottom = roomTop + roomGeometry.height;

  let dx = 0;
  let dy = 0;

  if (roomLeft < ROOM_VISIBILITY_PADDING) {
    dx = ROOM_VISIBILITY_PADDING - roomLeft;
  } else if (roomRight > (canvasWidth - ROOM_VISIBILITY_PADDING)) {
    dx = (canvasWidth - ROOM_VISIBILITY_PADDING) - roomRight;
  }

  if (roomTop < ROOM_VISIBILITY_PADDING) {
    dy = ROOM_VISIBILITY_PADDING - roomTop;
  } else if (roomBottom > (canvasHeight - ROOM_VISIBILITY_PADDING)) {
    dy = (canvasHeight - ROOM_VISIBILITY_PADDING) - roomBottom;
  }

  return { x: dx, y: dy };
}

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.isContentEditable
    || target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement;
}

export function getRoomStrokeDasharray(strokeStyle: RoomStrokeStyle): string | undefined {
  if (strokeStyle === 'dashed') {
    return '8 5';
  }

  if (strokeStyle === 'dotted') {
    return '2 4';
  }

  return undefined;
}

function getDocumentTheme(): ThemeMode {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function useDocumentTheme(): ThemeMode {
  const [theme, setTheme] = useState<ThemeMode>(getDocumentTheme);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(getDocumentTheme());
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  return theme;
}

export function renderRoomShape(
  shape: RoomShape,
  width: number,
  height: number,
  roomStyle: Pick<Room, 'fillColorIndex' | 'strokeColorIndex' | 'strokeStyle'> | undefined,
  theme: ThemeMode = 'light',
): React.JSX.Element {
  const shapeStyleProps = roomStyle ? {
    style: {
      fill: getRoomFillColor(roomStyle.fillColorIndex, theme),
      stroke: getRoomStrokeColor(roomStyle.strokeColorIndex, theme),
      strokeDasharray: getRoomStrokeDasharray(roomStyle.strokeStyle),
    },
  } : undefined;

  if (shape === 'oval') {
    return (
      <ellipse
        className="room-node-shape"
        cx={width / 2}
        cy={height / 2}
        rx={width / 2}
        ry={height / 2}
        {...shapeStyleProps}
      />
    );
  }

  const vertices = getRoomShapePolygonVertices(shape, width, height);
  if (vertices && shape !== 'box') {
    const pointString = vertices.map((point) => `${point.x},${point.y}`).join(' ');

    return (
      <>
        <polygon
          className="room-node-shape"
          points={pointString}
          {...shapeStyleProps}
        />
      </>
    );
  }

  if (shape === 'box') {
    return (
      <path
        className="room-node-shape"
        d={getRoomShapePath(shape, width, height, ROOM_CORNER_RADIUS)}
        {...shapeStyleProps}
      />
    );
  }

  return (
    <rect
      className="room-node-shape"
      x={0}
      y={0}
      width={width}
      height={height}
      rx={ROOM_CORNER_RADIUS}
      ry={ROOM_CORNER_RADIUS}
      {...shapeStyleProps}
    />
  );
}
