import type { MapDocument } from '../domain/map-types';

export interface SelectionSnapshot {
  readonly roomIds: readonly string[];
  readonly pseudoRoomIds: readonly string[];
  readonly stickyNoteIds: readonly string[];
  readonly connectionIds: readonly string[];
  readonly stickyNoteLinkIds: readonly string[];
}

export function createSelectionSnapshot(selection: {
  readonly roomIds: readonly string[];
  readonly pseudoRoomIds: readonly string[];
  readonly stickyNoteIds: readonly string[];
  readonly connectionIds: readonly string[];
  readonly stickyNoteLinkIds: readonly string[];
}): SelectionSnapshot {
  return {
    roomIds: [...selection.roomIds],
    pseudoRoomIds: [...selection.pseudoRoomIds],
    stickyNoteIds: [...selection.stickyNoteIds],
    connectionIds: [...selection.connectionIds],
    stickyNoteLinkIds: [...selection.stickyNoteLinkIds],
  };
}

export function filterSelectionForDoc(doc: MapDocument | null, selectedRoomIds: readonly string[]): readonly string[] {
  if (!doc) {
    return [];
  }

  return selectedRoomIds.filter((roomId) => roomId in doc.rooms);
}

export function filterPseudoRoomSelectionForDoc(doc: MapDocument | null, selectedPseudoRoomIds: readonly string[]): readonly string[] {
  if (!doc) {
    return [];
  }

  return selectedPseudoRoomIds.filter((pseudoRoomId) => pseudoRoomId in doc.pseudoRooms);
}

export function filterStickyNoteSelectionForDoc(doc: MapDocument | null, selectedStickyNoteIds: readonly string[]): readonly string[] {
  if (!doc) {
    return [];
  }

  return selectedStickyNoteIds.filter((stickyNoteId) => stickyNoteId in doc.stickyNotes);
}

export function filterConnectionSelectionForDoc(doc: MapDocument | null, selectedConnectionIds: readonly string[]): readonly string[] {
  if (!doc) {
    return [];
  }

  return selectedConnectionIds.filter((connectionId) => connectionId in doc.connections);
}

export function filterStickyNoteLinkSelectionForDoc(
  doc: MapDocument | null,
  selectedStickyNoteLinkIds: readonly string[],
): readonly string[] {
  if (!doc) {
    return [];
  }

  return selectedStickyNoteLinkIds.filter((stickyNoteLinkId) => stickyNoteLinkId in doc.stickyNoteLinks);
}

export function filterSelectionSnapshotForDoc(
  doc: MapDocument | null,
  snapshot: SelectionSnapshot,
): SelectionSnapshot {
  return {
    roomIds: filterSelectionForDoc(doc, snapshot.roomIds),
    pseudoRoomIds: filterPseudoRoomSelectionForDoc(doc, snapshot.pseudoRoomIds),
    stickyNoteIds: filterStickyNoteSelectionForDoc(doc, snapshot.stickyNoteIds),
    connectionIds: filterConnectionSelectionForDoc(doc, snapshot.connectionIds),
    stickyNoteLinkIds: filterStickyNoteLinkSelectionForDoc(doc, snapshot.stickyNoteLinkIds),
  };
}
