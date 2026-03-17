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
      { kind: 'document', before: currentDoc, after: updatedDoc },
      mergeKey,
    ),
  };
}
