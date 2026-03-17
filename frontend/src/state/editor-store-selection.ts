import type { MapDocument } from '../domain/map-types';

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
