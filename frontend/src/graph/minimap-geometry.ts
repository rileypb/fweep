import type { Connection, MapVisualStyle, Room, StickyNote, StickyNoteLink } from '../domain/map-types';
import {
  computeConnectionPath,
  getRoomPerimeterPointToward,
  ROOM_HEIGHT,
  ROOM_WIDTH,
} from './connection-geometry';
import { getRoomForVisualStyle, getRoomNodeDimensions } from './room-label-geometry';
import { getStickyNoteCenter, getStickyNoteHeight, STICKY_NOTE_WIDTH } from './sticky-note-geometry';

export interface CanvasSize {
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface WorldBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly width: number;
  readonly height: number;
}

export interface RectBounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface MinimapTransform {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly width: number;
  readonly height: number;
  readonly worldBounds: WorldBounds;
}

export interface MinimapViewportRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface RoomBounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface StickyNoteBounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function getRoomNodeWidth(
  room: Pick<Room, 'name' | 'locked'> | string,
  locked: boolean = false,
  visualStyle: MapVisualStyle = 'default',
): number {
  return getRoomNodeDimensions(room, visualStyle, locked).width;
}

export function getRoomBounds(room: Room, visualStyle: MapVisualStyle = 'default'): RoomBounds {
  const dimensions = getRoomNodeDimensions(room, visualStyle);
  return {
    left: room.position.x,
    top: room.position.y,
    width: dimensions.width,
    height: dimensions.height,
  };
}

export function getRoomCenter(room: Room, visualStyle: MapVisualStyle = 'default'): Point {
  const bounds = getRoomBounds(room, visualStyle);
  return {
    x: bounds.left + (bounds.width / 2),
    y: bounds.top + (bounds.height / 2),
  };
}

export function getStickyNoteBounds(stickyNote: StickyNote): StickyNoteBounds {
  return {
    left: stickyNote.position.x,
    top: stickyNote.position.y,
    width: STICKY_NOTE_WIDTH,
    height: getStickyNoteHeight(stickyNote.text),
  };
}

export function computeWorldBounds(rooms: readonly Room[], padding: number = 32): WorldBounds | null {
  if (rooms.length === 0) {
    return null;
  }

  let minLeft = Number.POSITIVE_INFINITY;
  let minTop = Number.POSITIVE_INFINITY;
  let maxRight = Number.NEGATIVE_INFINITY;
  let maxBottom = Number.NEGATIVE_INFINITY;

  for (const room of rooms) {
    const bounds = getRoomBounds(room);
    minLeft = Math.min(minLeft, bounds.left);
    minTop = Math.min(minTop, bounds.top);
    maxRight = Math.max(maxRight, bounds.left + bounds.width);
    maxBottom = Math.max(maxBottom, bounds.top + bounds.height);
  }

  const baseWidth = Math.max(maxRight - minLeft, ROOM_WIDTH);
  const baseHeight = Math.max(maxBottom - minTop, ROOM_HEIGHT);

  return {
    left: minLeft - padding,
    top: minTop - padding,
    right: maxRight + padding,
    bottom: maxBottom + padding,
    width: baseWidth + (padding * 2),
    height: baseHeight + (padding * 2),
  };
}

export function mergeWorldBounds(bounds: readonly RectBounds[], padding: number = 32): WorldBounds | null {
  if (bounds.length === 0) {
    return null;
  }

  let minLeft = Number.POSITIVE_INFINITY;
  let minTop = Number.POSITIVE_INFINITY;
  let maxRight = Number.NEGATIVE_INFINITY;
  let maxBottom = Number.NEGATIVE_INFINITY;

  for (const bound of bounds) {
    minLeft = Math.min(minLeft, bound.left);
    minTop = Math.min(minTop, bound.top);
    maxRight = Math.max(maxRight, bound.right);
    maxBottom = Math.max(maxBottom, bound.bottom);
  }

  const baseWidth = Math.max(maxRight - minLeft, ROOM_WIDTH);
  const baseHeight = Math.max(maxBottom - minTop, ROOM_HEIGHT);

  return {
    left: minLeft - padding,
    top: minTop - padding,
    right: maxRight + padding,
    bottom: maxBottom + padding,
    width: baseWidth + (padding * 2),
    height: baseHeight + (padding * 2),
  };
}

export function createMinimapTransform(
  worldBounds: WorldBounds,
  size: CanvasSize,
  framePadding: number = 8,
): MinimapTransform {
  const availableWidth = Math.max(size.width - (framePadding * 2), 1);
  const availableHeight = Math.max(size.height - (framePadding * 2), 1);
  const scale = Math.min(availableWidth / worldBounds.width, availableHeight / worldBounds.height);
  const contentWidth = worldBounds.width * scale;
  const contentHeight = worldBounds.height * scale;

  return {
    scale,
    offsetX: (size.width - contentWidth) / 2,
    offsetY: (size.height - contentHeight) / 2,
    width: size.width,
    height: size.height,
    worldBounds,
  };
}

export function toMinimapPoint(point: Point, transform: MinimapTransform): Point {
  return {
    x: transform.offsetX + ((point.x - transform.worldBounds.left) * transform.scale),
    y: transform.offsetY + ((point.y - transform.worldBounds.top) * transform.scale),
  };
}

export function fromMinimapPoint(point: Point, transform: MinimapTransform): Point {
  return {
    x: ((point.x - transform.offsetX) / transform.scale) + transform.worldBounds.left,
    y: ((point.y - transform.offsetY) / transform.scale) + transform.worldBounds.top,
  };
}

export function clampPointToMinimap(point: Point, transform: MinimapTransform): Point {
  return {
    x: Math.min(Math.max(point.x, transform.offsetX), transform.width - transform.offsetX),
    y: Math.min(Math.max(point.y, transform.offsetY), transform.height - transform.offsetY),
  };
}

export function getMinimapRoomRect(
  room: Room,
  transform: MinimapTransform,
  visualStyle: MapVisualStyle = 'default',
): RoomBounds {
  const bounds = getRoomBounds(room, visualStyle);
  const topLeft = toMinimapPoint({ x: bounds.left, y: bounds.top }, transform);

  return {
    left: topLeft.x,
    top: topLeft.y,
    width: Math.max(bounds.width * transform.scale, 4),
    height: Math.max(bounds.height * transform.scale, 4),
  };
}

export function getMinimapStickyNoteRect(stickyNote: StickyNote, transform: MinimapTransform): StickyNoteBounds {
  const bounds = getStickyNoteBounds(stickyNote);
  const topLeft = toMinimapPoint({ x: bounds.left, y: bounds.top }, transform);

  return {
    left: topLeft.x,
    top: topLeft.y,
    width: Math.max(bounds.width * transform.scale, 6),
    height: Math.max(bounds.height * transform.scale, 6),
  };
}

export function getMinimapConnectionPoints(
  rooms: Readonly<Record<string, Room>>,
  connection: Connection,
  transform: MinimapTransform,
  visualStyle: MapVisualStyle = 'default',
): Point[] {
  const sourceRoom = rooms[connection.sourceRoomId];
  const targetRoom = connection.target.kind === 'room' ? rooms[connection.target.id] : null;
  if (!sourceRoom || !targetRoom) {
    return [];
  }

  const effectiveSourceRoom = getRoomForVisualStyle(sourceRoom, visualStyle);
  const effectiveTargetRoom = getRoomForVisualStyle(targetRoom, visualStyle);
  const sourceDimensions = getRoomNodeDimensions(effectiveSourceRoom, visualStyle);
  const targetDimensions = getRoomNodeDimensions(effectiveTargetRoom, visualStyle);

  const points = computeConnectionPath(
    effectiveSourceRoom,
    effectiveTargetRoom,
    connection,
    undefined,
    sourceDimensions,
    targetDimensions,
  );
  if ((connection.target.kind === 'room' && connection.sourceRoomId === connection.target.id) || points.length < 2) {
    return points.map((point) => toMinimapPoint(point, transform));
  }

  const minimapPoints = [...points];
  const sourceCenter = getRoomCenter(effectiveSourceRoom, visualStyle);
  if (minimapPoints[0].x === sourceCenter.x && minimapPoints[0].y === sourceCenter.y) {
    minimapPoints[0] = getRoomPerimeterPointToward(
      effectiveSourceRoom.position,
      minimapPoints[1],
      sourceDimensions,
      effectiveSourceRoom.shape,
    );
  }

  const targetCenter = getRoomCenter(effectiveTargetRoom, visualStyle);
  const targetPointIndex = minimapPoints.length - 1;
  if (minimapPoints[targetPointIndex].x === targetCenter.x && minimapPoints[targetPointIndex].y === targetCenter.y) {
    minimapPoints[targetPointIndex] = getRoomPerimeterPointToward(
      effectiveTargetRoom.position,
      minimapPoints[targetPointIndex - 1],
      targetDimensions,
      effectiveTargetRoom.shape,
    );
  }

  return minimapPoints.map((point) => toMinimapPoint(point, transform));
}

export function getMinimapStickyNoteLinkPoints(
  rooms: Readonly<Record<string, Room>>,
  stickyNotes: Readonly<Record<string, StickyNote>>,
  stickyNoteLink: StickyNoteLink,
  transform: MinimapTransform,
  visualStyle: MapVisualStyle = 'default',
): readonly Point[] {
  const room = rooms[stickyNoteLink.roomId];
  const stickyNote = stickyNotes[stickyNoteLink.stickyNoteId];
  if (!room || !stickyNote) {
    return [];
  }

  return [
    toMinimapPoint(getStickyNoteCenter(stickyNote), transform),
    toMinimapPoint(getRoomCenter(room, visualStyle), transform),
  ];
}

export function getMinimapViewportRect(
  panOffset: Point,
  canvasSize: CanvasSize,
  transform: MinimapTransform,
  zoom: number = 1,
  visibleLeftInset: number = 0,
): MinimapViewportRect {
  const visibleWidth = Math.max(canvasSize.width - visibleLeftInset, 0);
  const topLeft = toMinimapPoint({
    x: (visibleLeftInset - panOffset.x) / zoom,
    y: -panOffset.y / zoom,
  }, transform);

  return {
    x: topLeft.x,
    y: topLeft.y,
    width: Math.max((visibleWidth / zoom) * transform.scale, 6),
    height: Math.max((canvasSize.height / zoom) * transform.scale, 6),
  };
}
