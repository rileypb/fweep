import { describe, expect, it } from '@jest/globals';
import { addConnection, addPseudoRoom, addRoom, addStickyNote } from '../../src/domain/map-operations';
import { createConnection, createEmptyMap, createPseudoRoom, createRoom, createStickyNote, createStickyNoteLink } from '../../src/domain/map-types';
import {
  createSelectionSnapshot,
  filterConnectionSelectionForDoc,
  filterPseudoRoomSelectionForDoc,
  filterSelectionForDoc,
  filterSelectionSnapshotForDoc,
  filterStickyNoteLinkSelectionForDoc,
  filterStickyNoteSelectionForDoc,
} from '../../src/state/editor-store-selection';

function createPopulatedMap() {
  const kitchen = { ...createRoom('Kitchen'), id: 'room-kitchen', position: { x: 0, y: 0 } };
  const hallway = { ...createRoom('Hallway'), id: 'room-hallway', position: { x: 80, y: 0 } };
  const tunnel = { ...createPseudoRoom('unknown'), id: 'pseudo-tunnel', position: { x: 160, y: 0 } };
  const note = { ...createStickyNote('Check desk'), id: 'note-desk', position: { x: 0, y: 80 } };
  const noteLink = { ...createStickyNoteLink(note.id, kitchen.id), id: 'note-link-kitchen' };
  const connection = { ...createConnection(kitchen.id, hallway.id, true), id: 'connection-kitchen-hallway' };

  let doc = createEmptyMap('Selection Filter Map');
  doc = addRoom(doc, kitchen);
  doc = addRoom(doc, hallway);
  doc = addPseudoRoom(doc, tunnel);
  doc = addStickyNote(doc, note);
  doc = addConnection(doc, connection, 'east', 'west');
  doc = {
    ...doc,
    stickyNoteLinks: {
      ...doc.stickyNoteLinks,
      [noteLink.id]: noteLink,
    },
  };

  return {
    doc,
    kitchen,
    hallway,
    tunnel,
    note,
    noteLink,
    connection,
  };
}

describe('editor store selection helpers', () => {
  it('returns an empty selection for every helper when no document is loaded', () => {
    expect(filterSelectionForDoc(null, ['room-1'])).toEqual([]);
    expect(filterPseudoRoomSelectionForDoc(null, ['pseudo-1'])).toEqual([]);
    expect(filterStickyNoteSelectionForDoc(null, ['note-1'])).toEqual([]);
    expect(filterConnectionSelectionForDoc(null, ['connection-1'])).toEqual([]);
    expect(filterStickyNoteLinkSelectionForDoc(null, ['link-1'])).toEqual([]);
  });

  it('filters room selections down to rooms that still exist while preserving order', () => {
    const { doc, hallway, kitchen } = createPopulatedMap();

    expect(filterSelectionForDoc(doc, ['missing-room', hallway.id, kitchen.id])).toEqual([hallway.id, kitchen.id]);
  });

  it('filters pseudo-room selections down to pseudo-rooms that still exist while preserving order', () => {
    const { doc, tunnel } = createPopulatedMap();

    expect(filterPseudoRoomSelectionForDoc(doc, ['missing-pseudo-room', tunnel.id])).toEqual([tunnel.id]);
  });

  it('filters sticky note selections down to notes that still exist while preserving order', () => {
    const { doc, note } = createPopulatedMap();

    expect(filterStickyNoteSelectionForDoc(doc, ['missing-note', note.id])).toEqual([note.id]);
  });

  it('filters connection selections down to connections that still exist while preserving order', () => {
    const { doc, connection } = createPopulatedMap();

    expect(filterConnectionSelectionForDoc(doc, ['missing-connection', connection.id])).toEqual([connection.id]);
  });

  it('filters sticky-note-link selections down to links that still exist while preserving order', () => {
    const { doc, noteLink } = createPopulatedMap();

    expect(filterStickyNoteLinkSelectionForDoc(doc, ['missing-link', noteLink.id])).toEqual([noteLink.id]);
  });

  it('filters full selection snapshots against the document', () => {
    const { doc, hallway, tunnel, note, noteLink, connection } = createPopulatedMap();

    const filtered = filterSelectionSnapshotForDoc(doc, createSelectionSnapshot({
      roomIds: ['missing-room', hallway.id],
      pseudoRoomIds: ['missing-pseudo', tunnel.id],
      stickyNoteIds: ['missing-note', note.id],
      connectionIds: ['missing-connection', connection.id],
      stickyNoteLinkIds: ['missing-link', noteLink.id],
    }));

    expect(filtered).toEqual({
      roomIds: [hallway.id],
      pseudoRoomIds: [tunnel.id],
      stickyNoteIds: [note.id],
      connectionIds: [connection.id],
      stickyNoteLinkIds: [noteLink.id],
    });
  });
});
