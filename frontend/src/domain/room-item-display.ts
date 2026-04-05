import type { Item } from './map-types';

const DEFAULT_ROOM_ITEM_DISPLAY_LIMIT = 3;
const SINGLE_HIDDEN_ITEM_COUNT = 1;

export function getCollapsedRoomItemNames(roomItems: readonly Item[]): readonly string[] {
  if (roomItems.length === DEFAULT_ROOM_ITEM_DISPLAY_LIMIT + SINGLE_HIDDEN_ITEM_COUNT) {
    return roomItems.map((item) => item.name);
  }

  return roomItems.slice(0, DEFAULT_ROOM_ITEM_DISPLAY_LIMIT).map((item) => item.name);
}
