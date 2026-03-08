import type { Connection, Room } from '../domain/map-types';
import { computeConnectionPath, ROOM_HEIGHT, ROOM_WIDTH } from './connection-geometry';

const ROOM_TEXT_CHAR_WIDTH = 6.78;
const ROOM_HORIZONTAL_PADDING = 24;

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

export function getRoomNodeWidth(name: string): number {
  return Math.max(ROOM_WIDTH, Math.round((name.length * ROOM_TEXT_CHAR_WIDTH) + ROOM_HORIZONTAL_PADDING));
}

export function getRoomBounds(room: Room): RoomBounds {
  return {
    left: room.position.x,
    top: room.position.y,
    width: getRoomNodeWidth(room.name),
    height: ROOM_HEIGHT,
  };
}

export function getRoomCenter(room: Room): Point {
  const bounds = getRoomBounds(room);
  return {
    x: bounds.left + (bounds.width / 2),
    y: bounds.top + (bounds.height / 2),
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

export function getMinimapRoomRect(room: Room, transform: MinimapTransform): RoomBounds {
  const bounds = getRoomBounds(room);
  const topLeft = toMinimapPoint({ x: bounds.left, y: bounds.top }, transform);

  return {
    left: topLeft.x,
    top: topLeft.y,
    width: Math.max(bounds.width * transform.scale, 4),
    height: Math.max(bounds.height * transform.scale, 4),
  };
}

export function getMinimapConnectionPoints(
  rooms: Readonly<Record<string, Room>>,
  connection: Connection,
  transform: MinimapTransform,
): Point[] {
  const sourceRoom = rooms[connection.sourceRoomId];
  const targetRoom = rooms[connection.targetRoomId];
  if (!sourceRoom || !targetRoom) {
    return [];
  }

  const sourceDimensions = { width: getRoomNodeWidth(sourceRoom.name), height: ROOM_HEIGHT };
  const targetDimensions = { width: getRoomNodeWidth(targetRoom.name), height: ROOM_HEIGHT };

  return computeConnectionPath(sourceRoom, targetRoom, connection, undefined, sourceDimensions, targetDimensions)
    .map((point) => toMinimapPoint(point, transform));
}

export function getMinimapViewportRect(
  panOffset: Point,
  canvasSize: CanvasSize,
  transform: MinimapTransform,
): MinimapViewportRect {
  const topLeft = toMinimapPoint({ x: -panOffset.x, y: -panOffset.y }, transform);

  return {
    x: topLeft.x,
    y: topLeft.y,
    width: Math.max(canvasSize.width * transform.scale, 6),
    height: Math.max(canvasSize.height * transform.scale, 6),
  };
}
