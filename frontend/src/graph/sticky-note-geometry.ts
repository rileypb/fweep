import type { Position, StickyNote } from '../domain/map-types';

export const STICKY_NOTE_WIDTH = 180;
export const STICKY_NOTE_MIN_HEIGHT = 100;
const STICKY_NOTE_LINE_HEIGHT = 20;
const STICKY_NOTE_VERTICAL_PADDING = 32;
const STICKY_NOTE_WRAP_COLUMNS = 20;

function splitLongWord(word: string): string[] {
  const segments: string[] = [];
  for (let index = 0; index < word.length; index += STICKY_NOTE_WRAP_COLUMNS) {
    segments.push(word.slice(index, index + STICKY_NOTE_WRAP_COLUMNS));
  }
  return segments;
}

export function getStickyNoteWrappedLines(text: string): readonly string[] {
  if (text.length === 0) {
    return [''];
  }

  return text.split('\n').flatMap((line) => {
    if (line.length === 0) {
      return [''];
    }

    const wrappedLines: string[] = [];
    let currentLine = '';

    for (const word of line.split(/\s+/)) {
      if (word.length === 0) {
        continue;
      }

      if (word.length > STICKY_NOTE_WRAP_COLUMNS) {
        if (currentLine.length > 0) {
          wrappedLines.push(currentLine);
          currentLine = '';
        }
        wrappedLines.push(...splitLongWord(word));
        continue;
      }

      if (currentLine.length === 0) {
        currentLine = word;
        continue;
      }

      const candidateLine = `${currentLine} ${word}`;
      if (candidateLine.length <= STICKY_NOTE_WRAP_COLUMNS) {
        currentLine = candidateLine;
      } else {
        wrappedLines.push(currentLine);
        currentLine = word;
      }
    }

    if (currentLine.length > 0) {
      wrappedLines.push(currentLine);
    }

    return wrappedLines;
  });
}

export function getStickyNoteHeight(text: string): number {
  return Math.max(
    STICKY_NOTE_MIN_HEIGHT,
    STICKY_NOTE_VERTICAL_PADDING + (getStickyNoteWrappedLines(text).length * STICKY_NOTE_LINE_HEIGHT),
  );
}

export function getStickyNoteCenter(stickyNote: StickyNote): Position {
  return {
    x: stickyNote.position.x + (STICKY_NOTE_WIDTH / 2),
    y: stickyNote.position.y + (getStickyNoteHeight(stickyNote.text) / 2),
  };
}
