import { describe, expect, it } from '@jest/globals';
import { createConnection, createEmptyMap, createRoom, createStickyNote } from '../../src/domain/map-types';
import { addConnection, addRoom } from '../../src/domain/map-operations';
import { getEntireMapExportBounds, getExportBounds, getRegionExportBounds, getSelectionExportBounds, getViewportExportBounds, validateExportBounds } from '../../src/export/export-bounds';
import type { ExportSettings } from '../../src/export/export-types';

function createBaseSettings(scope: ExportSettings['scope']): ExportSettings {
  return {
    scope,
    padding: 0,
    scale: 2,
    background: 'theme-canvas',
    includeBackgroundDrawing: true,
    includeGrid: false,
  };
}

describe('export-bounds', () => {
  it('computes entire-map bounds for multiple rooms', () => {
    const firstRoom = { ...createRoom('Kitchen'), id: 'room-1', position: { x: 40, y: 80 } };
    const secondRoom = { ...createRoom('Hallway'), id: 'room-2', position: { x: 240, y: 220 } };
    const doc = addRoom(addRoom(createEmptyMap('Test'), firstRoom), secondRoom);

    const result = getEntireMapExportBounds(doc, 10);

    expect(result.validationError).toBeNull();
    expect(result.bounds).toEqual({
      left: 30,
      top: 70,
      right: 330,
      bottom: 266,
    });
  });

  it('returns a selection-empty error when selection has no entities', () => {
    const doc = createEmptyMap('Test');

    const result = getSelectionExportBounds(doc, [], [], [], [], 80);

    expect(result.bounds).toBeNull();
    expect(result.validationError?.code).toBe('selection-empty');
  });

  it('includes selected connections in selection bounds', () => {
    const source = { ...createRoom('A'), id: 'room-a', position: { x: 0, y: 0 } };
    const target = { ...createRoom('B'), id: 'room-b', position: { x: 200, y: 0 } };
    const connection = { ...createConnection(source.id, target.id, false), id: 'connection-1' };
    let doc = createEmptyMap('Test');
    doc = addRoom(doc, source);
    doc = addRoom(doc, target);
    doc = addConnection(doc, connection, 'east');

    const result = getSelectionExportBounds(doc, [], [], [connection.id], [], 0);

    expect(result.validationError).toBeNull();
    expect(result.bounds).not.toBeNull();
    expect((result.bounds?.right ?? 0) - (result.bounds?.left ?? 0)).toBeGreaterThan(150);
  });

  it('includes derived vertical annotation text in selection bounds', () => {
    const source = { ...createRoom('A'), id: 'room-a', position: { x: 0, y: 0 } };
    const target = { ...createRoom('B'), id: 'room-b', position: { x: 0, y: 200 } };
    const connection = { ...createConnection(source.id, target.id, false), id: 'connection-1' };
    let doc = createEmptyMap('Test');
    doc = addRoom(doc, source);
    doc = addRoom(doc, target);
    doc = addConnection(doc, connection, 'down');

    const result = getSelectionExportBounds(doc, [], [], [connection.id], [], 0);

    expect(result.validationError).toBeNull();
    expect(result.bounds).not.toBeNull();
    expect((result.bounds?.right ?? 0) - (result.bounds?.left ?? 0)).toBeGreaterThan(10);
  });

  it('derives viewport bounds from pan offset and viewport size', () => {
    const result = getViewportExportBounds({ width: 500, height: 300 }, { x: 120, y: -40 }, 0);

    expect(result.bounds).toEqual({
      left: -120,
      top: 40,
      right: 380,
      bottom: 340,
    });
  });

  it('includes sticky notes in entire-map and selection bounds', () => {
    const stickyNote = {
      ...createStickyNote('A note'),
      id: 'sticky-note-1',
      position: { x: 320, y: 160 },
    };
    const doc = {
      ...createEmptyMap('Test'),
      stickyNotes: {
        [stickyNote.id]: stickyNote,
      },
    };

    const entireMap = getEntireMapExportBounds(doc, 0);
    const selection = getSelectionExportBounds(doc, [], [stickyNote.id], [], [], 0);

    expect(entireMap.validationError).toBeNull();
    expect(entireMap.bounds).toEqual({
      left: 320,
      top: 160,
      right: 500,
      bottom: 260,
    });
    expect(selection.validationError).toBeNull();
    expect(selection.bounds).toEqual(entireMap.bounds);
  });

  it('normalizes region bounds regardless of drag direction', () => {
    const result = getRegionExportBounds({
      left: 300,
      top: 280,
      right: 140,
      bottom: 120,
    }, 20);

    expect(result.bounds).toEqual({
      left: 120,
      top: 100,
      right: 320,
      bottom: 300,
    });
  });

  it('validates oversize exports', () => {
    const error = validateExportBounds({
      left: 0,
      top: 0,
      right: 5000,
      bottom: 5000,
    }, 2);

    expect(error?.code).toBe('width-too-large');
  });

  it('includes sticky-note links in entire-map and selection bounds', () => {
    const room = { ...createRoom('Kitchen'), id: 'room-1', position: { x: 40, y: 80 } };
    const stickyNote = {
      ...createStickyNote('A note'),
      id: 'sticky-note-1',
      position: { x: 320, y: 160 },
    };
    const doc = {
      ...createEmptyMap('Test'),
      rooms: {
        [room.id]: room,
      },
      stickyNotes: {
        [stickyNote.id]: stickyNote,
      },
      stickyNoteLinks: {
        'sticky-note-link-1': {
          id: 'sticky-note-link-1',
          stickyNoteId: stickyNote.id,
          roomId: room.id,
        },
      },
    };

    const entireMap = getEntireMapExportBounds(doc, 0);
    const selection = getSelectionExportBounds(doc, [], [], [], ['sticky-note-link-1'], 0);

    expect(entireMap.validationError).toBeNull();
    expect(entireMap.bounds).toEqual({
      left: 40,
      top: 80,
      right: 500,
      bottom: 260,
    });
    expect(selection.validationError).toBeNull();
    expect(selection.bounds).toEqual({
      left: 80,
      top: 98,
      right: 410,
      bottom: 210,
    });
  });

  it('routes through getExportBounds for region scope', () => {
    const doc = createEmptyMap('Test');
    const result = getExportBounds({
      doc,
      settings: createBaseSettings('region'),
      selectedRoomIds: [],
      selectedStickyNoteIds: [],
      selectedConnectionIds: [],
      selectedStickyNoteLinkIds: [],
      region: { left: 20, top: 30, right: 90, bottom: 110 },
    });

    expect(result.validationError).toBeNull();
    expect(result.bounds).toEqual({ left: 20, top: 30, right: 90, bottom: 110 });
  });
});
