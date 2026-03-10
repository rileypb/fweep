import type { Connection, Room } from '../domain/map-types';
import {
  computeConnectionPath,
  getRoomPerimeterPointToward,
  ROOM_HEIGHT,
  ROOM_WIDTH,
} from './connection-geometry';
import { getRoomNodeWidth as getSharedRoomNodeWidth } from './room-label-geometry';

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

export function getRoomNodeWidth(room: Pick<Room, 'name' | 'locked'> | string, locked: boolean = false): number {
  return Math.max(ROOM_WIDTH, getSharedRoomNodeWidth(room, locked));
}

export function getRoomBounds(room: Room): RoomBounds {
  return {
    left: room.position.x,
    top: room.position.y,
    width: getRoomNodeWidth(room),
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

  const sourceDimensions = { width: getRoomNodeWidth(sourceRoom), height: ROOM_HEIGHT };
  const targetDimensions = { width: getRoomNodeWidth(targetRoom), height: ROOM_HEIGHT };

  const points = computeConnectionPath(sourceRoom, targetRoom, connection, undefined, sourceDimensions, targetDimensions);

  if (!connection.isBidirectional && connection.sourceRoomId !== connection.targetRoomId && points.length >= 2) {
    const penultimatePoint = points[points.length - 2];
    const targetPerimeterPoint = getRoomPerimeterPointToward(
      targetRoom.position,
      penultimatePoint,
      targetDimensions,
      targetRoom.shape,
    );
    const minimapPoints = points.slice(0, -1).concat(targetPerimeterPoint);

    return minimapPoints.map((point) => toMinimapPoint(point, transform));
  }

  return points.map((point) => toMinimapPoint(point, transform));
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
