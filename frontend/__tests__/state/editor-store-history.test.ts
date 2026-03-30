import { describe, expect, it } from '@jest/globals';
import { addConnection, addPseudoRoom, addRoom, addStickyNote, addStickyNoteLink } from '../../src/domain/map-operations';
import {
  createConnection,
  createEmptyMap,
  createPseudoRoom,
  createRoom,
  createStickyNote,
  createStickyNoteLink,
} from '../../src/domain/map-types';
import { commitDocumentChange, pushHistoryEntry } from '../../src/state/editor-store-history';
import { createSelectionSnapshot } from '../../src/state/editor-store-selection';
import { useEditorStore } from '../../src/state/editor-store';

describe('editor-store-history', () => {
  it('pushes non-merged entries and clears redo state', () => {
    const currentState = {
      ...useEditorStore.getInitialState(),
      futureEntries: [{
        kind: 'document' as const,
        before: createEmptyMap('Before'),
        after: createEmptyMap('After'),
        selectionBefore: undefined,
        selectionAfter: undefined,
      }],
      canRedo: true,
      lastHistoryMergeKey: 'previous-key',
    };
    const entry = {
      kind: 'document' as const,
      before: createEmptyMap('Map A'),
      after: createEmptyMap('Map B'),
      selectionBefore: undefined,
      selectionAfter: undefined,
    };

    const result = pushHistoryEntry(currentState, entry, null);

    expect(result.pastEntries).toEqual([entry]);
    expect(result.futureEntries).toEqual([]);
    expect(result.canUndo).toBe(true);
    expect(result.canRedo).toBe(false);
    expect(result.lastHistoryMergeKey).toBeNull();
  });

  it('merges adjacent document history entries by merge key and preserves the earliest before snapshot', () => {
    const beforeDoc = createEmptyMap('Before');
    const middleDoc = createEmptyMap('Middle');
    const afterDoc = createEmptyMap('After');
    const currentState = {
      ...useEditorStore.getInitialState(),
      pastEntries: [{
        kind: 'document' as const,
        before: beforeDoc,
        after: middleDoc,
        selectionBefore: createSelectionSnapshot({
          roomIds: ['room-a'],
          pseudoRoomIds: [],
          stickyNoteIds: [],
          connectionIds: [],
          stickyNoteLinkIds: [],
        }),
        selectionAfter: createSelectionSnapshot({
          roomIds: ['room-b'],
          pseudoRoomIds: [],
          stickyNoteIds: [],
          connectionIds: [],
          stickyNoteLinkIds: [],
        }),
      }],
      lastHistoryMergeKey: 'same-key',
    };
    const nextEntry = {
      kind: 'document' as const,
      before: middleDoc,
      after: afterDoc,
      selectionBefore: createSelectionSnapshot({
        roomIds: ['ignored'],
        pseudoRoomIds: [],
        stickyNoteIds: [],
        connectionIds: [],
        stickyNoteLinkIds: [],
      }),
      selectionAfter: createSelectionSnapshot({
        roomIds: ['room-c'],
        pseudoRoomIds: [],
        stickyNoteIds: [],
        connectionIds: [],
        stickyNoteLinkIds: [],
      }),
    };

    const result = pushHistoryEntry(currentState, nextEntry, 'same-key');

    expect(result.pastEntries).toEqual([{
      kind: 'document',
      before: beforeDoc,
      after: afterDoc,
      selectionBefore: createSelectionSnapshot({
        roomIds: ['room-a'],
        pseudoRoomIds: [],
        stickyNoteIds: [],
        connectionIds: [],
        stickyNoteLinkIds: [],
      }),
      selectionAfter: createSelectionSnapshot({
        roomIds: ['room-c'],
        pseudoRoomIds: [],
        stickyNoteIds: [],
        connectionIds: [],
        stickyNoteLinkIds: [],
      }),
    }]);
  });

  it('reuses the incoming selectionBefore when merging onto a previous non-document entry', () => {
    const beforeDoc = createEmptyMap('Before');
    const afterDoc = createEmptyMap('After');
    const currentState = {
      ...useEditorStore.getInitialState(),
      pastEntries: [{
        kind: 'background-stroke' as const,
        mapId: 'map-1',
        layerId: 'layer-1',
        chunks: [],
      }],
      lastHistoryMergeKey: 'same-key',
    };
    const selectionBefore = createSelectionSnapshot({
      roomIds: ['room-a'],
      pseudoRoomIds: [],
      stickyNoteIds: [],
      connectionIds: [],
      stickyNoteLinkIds: [],
    });
    const nextEntry = {
      kind: 'document' as const,
      before: beforeDoc,
      after: afterDoc,
      selectionBefore,
      selectionAfter: undefined,
    };

    const result = pushHistoryEntry(currentState, nextEntry, 'same-key');

    expect(result.pastEntries).toEqual([nextEntry]);
  });

  it('returns no state changes when the updated document is unchanged', () => {
    const doc = createEmptyMap('Same Map');
    const currentState = useEditorStore.getInitialState();

    expect(commitDocumentChange(currentState, doc, doc)).toEqual({});
  });

  it('filters derived selectionAfter ids to entities that still exist in the updated document', () => {
    let currentDoc = createEmptyMap('Current');
    const room = { ...createRoom('Kitchen'), id: 'room-1', position: { x: 0, y: 0 } };
    const removedPseudo = { ...createPseudoRoom('unknown'), id: 'pseudo-remove', position: { x: 40, y: 0 } };
    const keptPseudo = { ...createPseudoRoom('death'), id: 'pseudo-keep', position: { x: 80, y: 0 } };
    currentDoc = addRoom(currentDoc, room);
    currentDoc = addPseudoRoom(currentDoc, removedPseudo);
    currentDoc = addPseudoRoom(currentDoc, keptPseudo);
    currentDoc = addStickyNote(currentDoc, { ...createStickyNote('note'), id: 'note-1' });
    currentDoc = addConnection(currentDoc, { ...createConnection(room.id, { kind: 'pseudo-room', id: keptPseudo.id }, false), id: 'conn-1' }, 'north');
    currentDoc = addStickyNoteLink(currentDoc, { ...createStickyNoteLink('note-1', { kind: 'room', id: room.id }), id: 'link-1' });

    let updatedDoc = createEmptyMap('Updated');
    updatedDoc = addRoom(updatedDoc, room);
    updatedDoc = addPseudoRoom(updatedDoc, keptPseudo);
    updatedDoc = addStickyNote(updatedDoc, { ...createStickyNote('note'), id: 'note-1' });
    updatedDoc = addConnection(updatedDoc, { ...createConnection(room.id, { kind: 'pseudo-room', id: keptPseudo.id }, false), id: 'conn-1' }, 'north');

    const selectionBefore = createSelectionSnapshot({
      roomIds: ['room-1', 'missing-room'],
      pseudoRoomIds: ['pseudo-keep', 'pseudo-remove'],
      stickyNoteIds: ['note-1', 'missing-note'],
      connectionIds: ['conn-1', 'missing-conn'],
      stickyNoteLinkIds: ['link-1', 'missing-link'],
    });

    const result = commitDocumentChange(useEditorStore.getInitialState(), currentDoc, updatedDoc, {
      historyMergeKey: 'merge-key',
      selectionBefore,
    });

    expect(result.doc).toBe(updatedDoc);
    expect(result.lastHistoryMergeKey).toBe('merge-key');
    expect(result.pastEntries).toEqual([{
      kind: 'document',
      before: currentDoc,
      after: updatedDoc,
      selectionBefore,
      selectionAfter: createSelectionSnapshot({
        roomIds: ['room-1'],
        pseudoRoomIds: ['pseudo-keep'],
        stickyNoteIds: ['note-1'],
        connectionIds: ['conn-1'],
        stickyNoteLinkIds: [],
      }),
    }]);
  });

  it('preserves an explicit selectionAfter instead of deriving one', () => {
    const currentDoc = createEmptyMap('Current');
    const updatedDoc = createEmptyMap('Updated');
    const selectionBefore = createSelectionSnapshot({
      roomIds: ['room-1'],
      pseudoRoomIds: [],
      stickyNoteIds: [],
      connectionIds: [],
      stickyNoteLinkIds: [],
    });
    const selectionAfter = createSelectionSnapshot({
      roomIds: ['future-room'],
      pseudoRoomIds: [],
      stickyNoteIds: [],
      connectionIds: [],
      stickyNoteLinkIds: [],
    });

    const result = commitDocumentChange(useEditorStore.getInitialState(), currentDoc, updatedDoc, {
      selectionBefore,
      selectionAfter,
    });

    expect(result.pastEntries).toEqual([{
      kind: 'document',
      before: currentDoc,
      after: updatedDoc,
      selectionBefore,
      selectionAfter,
    }]);
  });
});
