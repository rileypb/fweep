import type { MapDocument } from '../domain/map-types';
import type { EditorHistoryEntry, EditorState, HistoryOptions } from './editor-store';

export function pushHistoryEntry(
  currentState: EditorState,
  entry: EditorHistoryEntry,
  mergeKey: string | null,
): Pick<EditorState, 'pastEntries' | 'futureEntries' | 'canUndo' | 'canRedo' | 'lastHistoryMergeKey'> {
  const shouldMerge = mergeKey !== null && currentState.lastHistoryMergeKey === mergeKey;
  const nextPastEntries = shouldMerge
    ? currentState.pastEntries.slice(0, -1).concat((() => {
      const previousEntry = currentState.pastEntries[currentState.pastEntries.length - 1];
      if (entry.kind === 'document' && previousEntry?.kind === 'document') {
        return {
          kind: 'document' as const,
          before: previousEntry.before,
          after: entry.after,
          selectionBefore: previousEntry.selectionBefore ?? entry.selectionBefore,
          selectionAfter: entry.selectionAfter,
        };
      }
      return entry;
    })())
    : [...currentState.pastEntries, entry];

  return {
    pastEntries: nextPastEntries,
    futureEntries: [],
    canUndo: nextPastEntries.length > 0,
    canRedo: false,
    lastHistoryMergeKey: mergeKey,
  };
}

export function commitDocumentChange(
  currentState: EditorState,
  currentDoc: MapDocument,
  updatedDoc: MapDocument,
  options?: HistoryOptions,
): Partial<EditorState> {
  if (updatedDoc === currentDoc) {
    return {};
  }

  const mergeKey = options?.historyMergeKey ?? null;
  return {
    doc: updatedDoc,
    ...pushHistoryEntry(
      currentState,
      {
        kind: 'document',
        before: currentDoc,
        after: updatedDoc,
        selectionBefore: options?.selectionBefore,
        selectionAfter: options?.selectionAfter ?? (
          options?.selectionBefore === undefined
            ? undefined
            : {
              roomIds: options.selectionBefore.roomIds.filter((roomId) => roomId in updatedDoc.rooms),
              pseudoRoomIds: options.selectionBefore.pseudoRoomIds.filter((pseudoRoomId) => pseudoRoomId in updatedDoc.pseudoRooms),
              stickyNoteIds: options.selectionBefore.stickyNoteIds.filter((stickyNoteId) => stickyNoteId in updatedDoc.stickyNotes),
              connectionIds: options.selectionBefore.connectionIds.filter((connectionId) => connectionId in updatedDoc.connections),
              stickyNoteLinkIds: options.selectionBefore.stickyNoteLinkIds.filter((stickyNoteLinkId) => stickyNoteLinkId in updatedDoc.stickyNoteLinks),
            }
        ),
      },
      mergeKey,
    ),
  };
}
