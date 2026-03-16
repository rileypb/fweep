import type { MapVisualStyle, Room, RoomShape } from '../domain/map-types';
import { DARK_ROOM_GLYPH_HEIGHT, DARK_ROOM_GLYPH_WIDTH } from './dark-room-geometry';
import { PADLOCK_HEIGHT, PADLOCK_WIDTH } from './padlock-geometry';

export const DEFAULT_ROOM_TEXT_CHAR_WIDTH = 6.78;
export const DEFAULT_ROOM_HORIZONTAL_PADDING = 12;
export const ROOM_LOCK_GAP = 6;
export const ROOM_LOCK_EXTRA_WIDTH = PADLOCK_WIDTH + ROOM_LOCK_GAP;
export const ROOM_DARK_EXTRA_WIDTH = DARK_ROOM_GLYPH_WIDTH + ROOM_LOCK_GAP;
export const DEFAULT_ROOM_MIN_WIDTH = 64;
export const DEFAULT_ROOM_HEIGHT = 36;
export const SQUARE_CLASSIC_ROOM_SIZE = 84;
export const SQUARE_CLASSIC_LINE_HEIGHT = 16;
export const SQUARE_CLASSIC_HORIZONTAL_PADDING = 4;
export const SQUARE_CLASSIC_VERTICAL_PADDING = 10;

type RoomLabelTarget = Pick<Room, 'name' | 'locked' | 'isDark'>;

export function getEffectiveRoomShape(shape: RoomShape, visualStyle: MapVisualStyle): RoomShape {
  return visualStyle === 'square-classic' ? 'rectangle' : shape;
}

export function getRoomForVisualStyle(room: Room, visualStyle: MapVisualStyle): Room {
  const effectiveShape = getEffectiveRoomShape(room.shape, visualStyle);
  if (effectiveShape === room.shape) {
    return room;
  }

  return {
    ...room,
    shape: effectiveShape,
  };
}

function getRoomLabelTarget(target: RoomLabelTarget | string, locked: boolean): RoomLabelTarget {
  return typeof target === 'string'
    ? { name: target, locked, isDark: false }
    : target;
}

export function getEstimatedRoomNameWidth(name: string): number {
  return name.length * DEFAULT_ROOM_TEXT_CHAR_WIDTH;
}

export function getRoomNodeDimensions(
  target: RoomLabelTarget | string,
  visualStyle: MapVisualStyle = 'default',
  locked: boolean = false,
): { readonly width: number; readonly height: number } {
  const room = getRoomLabelTarget(target, locked);
  if (visualStyle === 'square-classic') {
    return {
      width: SQUARE_CLASSIC_ROOM_SIZE,
      height: SQUARE_CLASSIC_ROOM_SIZE,
    };
  }

  const extraWidth = (room.locked ? ROOM_LOCK_EXTRA_WIDTH : 0) + (room.isDark ? ROOM_DARK_EXTRA_WIDTH : 0);
  return {
    width: Math.max(DEFAULT_ROOM_MIN_WIDTH, Math.round(getEstimatedRoomNameWidth(room.name) + DEFAULT_ROOM_HORIZONTAL_PADDING + extraWidth)),
    height: DEFAULT_ROOM_HEIGHT,
  };
}

export function getRoomNodeWidth(
  target: RoomLabelTarget | string,
  visualStyle: MapVisualStyle = 'default',
  locked: boolean = false,
): number {
  return getRoomNodeDimensions(target, visualStyle, locked).width;
}

function clipLineWithEllipsis(line: string, maxCharacters: number): string {
  if (line.length <= maxCharacters) {
    return line;
  }

  if (maxCharacters <= 1) {
    return '…';
  }

  return `${line.slice(0, Math.max(maxCharacters - 1, 0)).trimEnd()}…`;
}

function wrapText(text: string, maxCharactersPerLine: number): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [''];
  }

  const words = trimmed.split(/\s+/);
  const lines: string[] = [];
  let currentLine = '';

  for (const word of words) {
    if (currentLine.length === 0) {
      if (word.length <= maxCharactersPerLine) {
        currentLine = word;
      } else {
        let offset = 0;
        while (offset < word.length) {
          const chunk = word.slice(offset, offset + maxCharactersPerLine);
          if (chunk.length === maxCharactersPerLine) {
            lines.push(chunk);
          } else {
            currentLine = chunk;
          }
          offset += maxCharactersPerLine;
        }
      }
      continue;
    }

    const candidate = `${currentLine} ${word}`;
    if (candidate.length <= maxCharactersPerLine) {
      currentLine = candidate;
      continue;
    }

    lines.push(currentLine);
    if (word.length <= maxCharactersPerLine) {
      currentLine = word;
      continue;
    }

    let offset = 0;
    while (offset < word.length) {
      const chunk = word.slice(offset, offset + maxCharactersPerLine);
      if (chunk.length === maxCharactersPerLine) {
        lines.push(chunk);
      } else {
        currentLine = chunk;
      }
      offset += maxCharactersPerLine;
    }
    currentLine = currentLine === candidate ? '' : currentLine;
  }

  if (currentLine.length > 0) {
    lines.push(currentLine);
  }

  return lines;
}

export function getRoomLabelLines(
  room: RoomLabelTarget,
  roomWidth: number,
  roomHeight: number,
  visualStyle: MapVisualStyle = 'default',
): readonly string[] {
  if (visualStyle === 'default') {
    return [room.name];
  }

  const availableWidth = roomWidth - (SQUARE_CLASSIC_HORIZONTAL_PADDING * 2);
  const maxCharactersPerLine = Math.max(1, Math.floor(availableWidth / DEFAULT_ROOM_TEXT_CHAR_WIDTH));
  const availableHeight = roomHeight - (SQUARE_CLASSIC_VERTICAL_PADDING * 2);
  const maxLines = Math.max(1, Math.floor(availableHeight / SQUARE_CLASSIC_LINE_HEIGHT));
  const wrappedLines = wrapText(room.name, maxCharactersPerLine);

  if (wrappedLines.length <= maxLines) {
    return wrappedLines;
  }

  return wrappedLines.slice(0, maxLines).map((line, index) => (
    index === maxLines - 1
      ? clipLineWithEllipsis(line, maxCharactersPerLine)
      : line
  ));
}

export function getRoomLabelLayout(
  room: RoomLabelTarget,
  roomWidth: number,
  roomHeight: number,
  visualStyle: MapVisualStyle = 'default',
): {
  readonly lines: readonly string[];
  readonly lineHeight: number;
  readonly textX: number;
  readonly firstLineY: number;
  readonly lockX: number | null;
  readonly lockY: number | null;
  readonly darkX: number | null;
  readonly darkY: number | null;
} {
  if (visualStyle === 'square-classic') {
    const lines = getRoomLabelLines(room, roomWidth, roomHeight, visualStyle);
    const blockHeight = lines.length * SQUARE_CLASSIC_LINE_HEIGHT;
    return {
      lines,
      lineHeight: SQUARE_CLASSIC_LINE_HEIGHT,
      textX: roomWidth / 2,
      firstLineY: ((roomHeight - blockHeight) / 2) + (SQUARE_CLASSIC_LINE_HEIGHT / 2),
      lockX: null,
      lockY: room.locked ? SQUARE_CLASSIC_VERTICAL_PADDING / 2 : null,
      darkX: room.isDark ? roomWidth - (SQUARE_CLASSIC_HORIZONTAL_PADDING / 2) - DARK_ROOM_GLYPH_WIDTH : null,
      darkY: room.isDark ? SQUARE_CLASSIC_VERTICAL_PADDING / 2 : null,
    };
  }

  const contentWidth = getEstimatedRoomNameWidth(room.name)
    + (room.locked ? ROOM_LOCK_EXTRA_WIDTH : 0)
    + (room.isDark ? ROOM_DARK_EXTRA_WIDTH : 0);
  const contentLeft = (roomWidth - contentWidth) / 2;
  const textX = contentLeft
    + (room.locked ? ROOM_LOCK_EXTRA_WIDTH : 0)
    + (room.isDark ? ROOM_DARK_EXTRA_WIDTH : 0)
    + (getEstimatedRoomNameWidth(room.name) / 2);

  return {
    lines: [room.name],
    lineHeight: DEFAULT_ROOM_HEIGHT,
    textX,
    firstLineY: roomHeight / 2,
    lockX: room.locked ? contentLeft : null,
    lockY: room.locked ? ((roomHeight - PADLOCK_HEIGHT) / 2) : null,
    darkX: room.isDark ? contentLeft + (room.locked ? ROOM_LOCK_EXTRA_WIDTH : 0) : null,
    darkY: room.isDark ? ((roomHeight - DARK_ROOM_GLYPH_HEIGHT) / 2) : null,
  };
}
