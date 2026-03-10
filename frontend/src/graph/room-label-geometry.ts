import type { Room } from '../domain/map-types';
import { PADLOCK_HEIGHT, PADLOCK_WIDTH } from './padlock-geometry';

export const ROOM_TEXT_CHAR_WIDTH = 6.78;
export const ROOM_HORIZONTAL_PADDING = 24;
export const ROOM_LOCK_GAP = 6;
export const ROOM_LOCK_EXTRA_WIDTH = PADLOCK_WIDTH + ROOM_LOCK_GAP;

type RoomLabelTarget = Pick<Room, 'name' | 'locked'>;

function getRoomLabelTarget(target: RoomLabelTarget | string, locked: boolean): RoomLabelTarget {
  return typeof target === 'string'
    ? { name: target, locked }
    : target;
}

export function getEstimatedRoomNameWidth(name: string): number {
  return name.length * ROOM_TEXT_CHAR_WIDTH;
}

export function getRoomNodeWidth(target: RoomLabelTarget | string, locked: boolean = false): number {
  const room = getRoomLabelTarget(target, locked);
  const extraWidth = room.locked ? ROOM_LOCK_EXTRA_WIDTH : 0;
  return Math.max(80, Math.round(getEstimatedRoomNameWidth(room.name) + ROOM_HORIZONTAL_PADDING + extraWidth));
}

export function getRoomLabelLayout(
  room: RoomLabelTarget,
  roomWidth: number,
  roomHeight: number,
): {
  readonly textX: number;
  readonly textY: number;
  readonly lockX: number | null;
  readonly lockY: number | null;
} {
  const contentWidth = getEstimatedRoomNameWidth(room.name) + (room.locked ? ROOM_LOCK_EXTRA_WIDTH : 0);
  const contentLeft = (roomWidth - contentWidth) / 2;
  const textX = contentLeft + (room.locked ? ROOM_LOCK_EXTRA_WIDTH : 0) + (getEstimatedRoomNameWidth(room.name) / 2);

  return {
    textX,
    textY: roomHeight / 2,
    lockX: room.locked ? contentLeft : null,
    lockY: room.locked ? ((roomHeight - PADLOCK_HEIGHT) / 2) : null,
  };
}
