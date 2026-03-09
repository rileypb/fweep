import type { Position, StickyNote } from '../domain/map-types';

export const STICKY_NOTE_WIDTH = 180;
export const STICKY_NOTE_MIN_HEIGHT = 100;
const STICKY_NOTE_LINE_HEIGHT = 20;
const STICKY_NOTE_VERTICAL_PADDING = 32;
const STICKY_NOTE_WRAP_COLUMNS = 20;

function estimateWrappedLineCount(text: string): number {
  if (text.length === 0) {
    return 1;
  }

  return text
    .split('\n')
    .reduce((total, line) => total + Math.max(1, Math.ceil(line.length / STICKY_NOTE_WRAP_COLUMNS)), 0);
}

export function getStickyNoteHeight(text: string): number {
  return Math.max(
    STICKY_NOTE_MIN_HEIGHT,
    STICKY_NOTE_VERTICAL_PADDING + (estimateWrappedLineCount(text) * STICKY_NOTE_LINE_HEIGHT),
  );
}

export function getStickyNoteCenter(stickyNote: StickyNote): Position {
  return {
    x: stickyNote.position.x + (STICKY_NOTE_WIDTH / 2),
    y: stickyNote.position.y + (getStickyNoteHeight(stickyNote.text) / 2),
  };
}
