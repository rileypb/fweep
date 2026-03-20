import {
  DEFAULT_ROOM_STROKE_STYLE,
  type Connection,
  type ConnectionTarget,
  type MapDocument,
  type MapVisualStyle,
  type Position,
  type PseudoRoom,
  type PseudoRoomKind,
  type Room,
} from './map-types';
import { PSEUDO_ROOM_SYMBOL_SIZE } from './pseudo-room-symbols';
import { getRoomNodeDimensions } from '../graph/room-label-geometry';
import type { Point } from '../graph/connection-geometry';

export const PSEUDO_ROOM_LINEAR_SCALE = 0.5;
export const DEFAULT_STYLE_PSEUDO_ROOM_LINEAR_SCALE = PSEUDO_ROOM_LINEAR_SCALE * (4 / 3) * 1.2;
export const PSEUDO_ROOM_SYMBOL_LINEAR_SCALE = 0.25;
const PSEUDO_ROOM_CONNECTION_INSET = Math.round(42 * PSEUDO_ROOM_LINEAR_SCALE);

interface PointLike {
  readonly x: number;
  readonly y: number;
}

export interface PseudoRoomSymbolLayout {
  readonly x: number;
  readonly y: number;
  readonly size: number;
}

export function isPseudoRoomTarget(target: ConnectionTarget): boolean {
  return target.kind === 'pseudo-room';
}

export function getPseudoRoomGlyph(kind: PseudoRoomKind): string {
  switch (kind) {
    case 'unknown':
      return '?';
    case 'infinite':
      return '∞';
    case 'death':
      return '☠';
    case 'nowhere':
      return '✕';
    case 'elsewhere':
      return '➡';
  }
}

export function toPseudoRoomVisualRoom(
  pseudoRoom: PseudoRoom,
  overrides?: Partial<Pick<Room, 'position'>>,
): Room {
  const position = overrides?.position ?? pseudoRoom.position;
  return {
    id: pseudoRoom.id,
    name: getPseudoRoomGlyph(pseudoRoom.kind),
    description: '',
    position,
    directions: {},
    isDark: false,
    locked: false,
    shape: 'oval',
    fillColorIndex: 0,
    strokeColorIndex: 0,
    strokeStyle: DEFAULT_ROOM_STROKE_STYLE,
  };
}

export function getPseudoRoomSymbolLayout(
  pseudoRoom: PseudoRoom,
  visualStyle: MapVisualStyle,
): PseudoRoomSymbolLayout {
  return getPseudoRoomSymbolLayoutForRoom(toPseudoRoomVisualRoom(pseudoRoom), visualStyle);
}

export function getPseudoRoomSymbolLayoutForRoom(
  room: Room,
  visualStyle: MapVisualStyle,
): PseudoRoomSymbolLayout {
  const dimensions = getPseudoRoomNodeDimensionsForRoom(room, visualStyle);
  return {
    x: dimensions.width / 2,
    y: dimensions.height / 2,
    size: Math.round(PSEUDO_ROOM_SYMBOL_SIZE * PSEUDO_ROOM_SYMBOL_LINEAR_SCALE),
  };
}

export function getPseudoRoomNodeDimensions(
  pseudoRoom: PseudoRoom,
  visualStyle: MapVisualStyle,
): { readonly width: number; readonly height: number } {
  return getPseudoRoomNodeDimensionsForRoom(toPseudoRoomVisualRoom(pseudoRoom), visualStyle);
}

export function getPseudoRoomNodeDimensionsForRoom(
  room: Room,
  visualStyle: MapVisualStyle,
): { readonly width: number; readonly height: number } {
  const dimensions = getRoomNodeDimensions(room, visualStyle);
  const linearScale = visualStyle === 'default'
    ? DEFAULT_STYLE_PSEUDO_ROOM_LINEAR_SCALE
    : PSEUDO_ROOM_LINEAR_SCALE;
  return {
    width: Math.max(1, Math.round(dimensions.width * linearScale)),
    height: Math.max(1, Math.round(dimensions.height * linearScale)),
  };
}

export function getConnectionTargetRoom(doc: MapDocument, connection: Connection): Room | PseudoRoom | null {
  if (connection.target.kind === 'room') {
    return doc.rooms[connection.target.id] ?? null;
  }

  return doc.pseudoRooms[connection.target.id] ?? null;
}

export function getConnectionTargetPosition(doc: MapDocument, connection: Connection): Position | null {
  const target = getConnectionTargetRoom(doc, connection);
  return target?.position ?? null;
}

export function isPseudoRoom(value: Room | PseudoRoom | null | undefined): value is PseudoRoom {
  return value !== null && value !== undefined && !('directions' in value);
}

export function insetPseudoRoomConnectionEndpoint(
  connection: Connection,
  points: readonly PointLike[],
): Point[] {
  if (!isPseudoRoomTarget(connection.target) || points.length < 2) {
    return [...points];
  }

  const end = points[points.length - 1];
  const previous = points[points.length - 2];
  const dx = end.x - previous.x;
  const dy = end.y - previous.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return [...points];
  }

  const inset = Math.min(PSEUDO_ROOM_CONNECTION_INSET, Math.max(length - 1, 0));
  const adjustedEnd = {
    x: end.x - ((dx / length) * inset),
    y: end.y - ((dy / length) * inset),
  };

  return [
    ...points.slice(0, -1),
    adjustedEnd,
  ];
}
