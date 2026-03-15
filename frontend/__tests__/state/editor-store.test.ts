import { describe, it, expect, beforeEach } from '@jest/globals';
import { createEmptyMap, createPseudoRoom, createRoom, createStickyNote, createStickyNoteLink } from '../../src/domain/map-types';
import type { MapDocument, Position } from '../../src/domain/map-types';
import { addConnection, addPseudoRoom, addRoom, addStickyNote, addStickyNoteLink } from '../../src/domain/map-operations';
import { createConnection } from '../../src/domain/map-types';
import { useEditorStore } from '../../src/state/editor-store';
import { getBackgroundChunkKey, loadBackgroundChunk, saveBackgroundChunks } from '../../src/storage/map-store';

function resetStore(): void {
  useEditorStore.setState(useEditorStore.getInitialState());
}

describe('useEditorStore', () => {
  let testDoc: MapDocument;

  beforeEach(() => {
    resetStore();
    testDoc = createEmptyMap('Test Map');
  });

  /* ---- loadDocument ---- */

  describe('loadDocument', () => {
    it('sets the active document', () => {
      useEditorStore.getState().loadDocument(testDoc);
      expect(useEditorStore.getState().doc).toEqual(testDoc);
    });

    it('hydrates persisted view state into the editor store', () => {
      const doc = {
        ...testDoc,
        view: {
          ...testDoc.view,
          pan: { x: 120, y: -80 },
          zoom: 1.5,
          showGrid: false,
          snapToGrid: false,
        },
      };

      useEditorStore.getState().loadDocument(doc);

      expect(useEditorStore.getState().mapPanOffset).toEqual({ x: 120, y: -80 });
      expect(useEditorStore.getState().mapZoom).toBe(1.5);
      expect(useEditorStore.getState().showGridEnabled).toBe(false);
      expect(useEditorStore.getState().snapToGridEnabled).toBe(false);
    });
  });

  /* ---- unloadDocument ---- */

  describe('unloadDocument', () => {
    it('clears the active document', () => {
      useEditorStore.getState().loadDocument(testDoc);
      useEditorStore.getState().unloadDocument();
      expect(useEditorStore.getState().doc).toBeNull();
    });

    it('clears the room selection', () => {
      useEditorStore.getState().loadDocument(testDoc);
      useEditorStore.getState().selectRoom('r1');

      useEditorStore.getState().unloadDocument();

      expect(useEditorStore.getState().selectedRoomIds).toEqual([]);
    });

    it('resets persisted view state to defaults', () => {
      const doc = {
        ...testDoc,
        view: {
          ...testDoc.view,
          pan: { x: 120, y: -80 },
          zoom: 1.5,
          showGrid: false,
          snapToGrid: false,
        },
      };
      useEditorStore.getState().loadDocument(doc);

      useEditorStore.getState().unloadDocument();

      expect(useEditorStore.getState().mapPanOffset).toEqual({ x: 0, y: 0 });
      expect(useEditorStore.getState().mapZoom).toBe(1);
      expect(useEditorStore.getState().showGridEnabled).toBe(true);
      expect(useEditorStore.getState().snapToGridEnabled).toBe(true);
    });
  });

  /* ---- addRoomAtPosition ---- */

  describe('addRoomAtPosition', () => {
    it('adds a room at the given position and returns its ID', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const position: Position = { x: 120, y: 200 };
      const roomId = useEditorStore.getState().addRoomAtPosition('Kitchen', position);

      const doc = useEditorStore.getState().doc!;
      const rooms = Object.values(doc.rooms);
      expect(rooms).toHaveLength(1);
      expect(rooms[0].name).toBe('Kitchen');
      expect(rooms[0].position).toEqual(position);
      expect(roomId).toBe(rooms[0].id);
    });

    it('preserves existing rooms when adding a new one', () => {
      useEditorStore.getState().loadDocument(testDoc);
      useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 0, y: 0 });
      useEditorStore.getState().addRoomAtPosition('Hallway', { x: 100, y: 100 });

      const doc = useEditorStore.getState().doc!;
      const rooms = Object.values(doc.rooms);
      expect(rooms).toHaveLength(2);
      const names = rooms.map((r) => r.name).sort();
      expect(names).toEqual(['Hallway', 'Kitchen']);
    });

    it('updates the document updatedAt timestamp', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const beforeTimestamp = testDoc.metadata.updatedAt;

      // Ensure clock moves forward
      useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 0, y: 0 });

      const doc = useEditorStore.getState().doc!;
      expect(doc.metadata.updatedAt >= beforeTimestamp).toBe(true);
    });

    it('throws when no document is loaded', () => {
      expect(() =>
        useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 0, y: 0 }),
      ).toThrow();
    });

    it('snaps position to the nearest grid point', () => {
      useEditorStore.getState().loadDocument(testDoc);
      // Grid is 40px; 55 should snap to 40, 85 should snap to 80
      useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 55, y: 85 });

      const doc = useEditorStore.getState().doc!;
      const room = Object.values(doc.rooms)[0];
      expect(room.position).toEqual({ x: 40, y: 80 });
    });

    it('does not snap position when grid snapping is disabled', () => {
      useEditorStore.getState().loadDocument(testDoc);
      useEditorStore.getState().toggleSnapToGrid();

      useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 55, y: 85 });

      const doc = useEditorStore.getState().doc!;
      const room = Object.values(doc.rooms)[0];
      expect(room.position).toEqual({ x: 55, y: 85 });
    });
  });

  describe('addStickyNoteAtPosition', () => {
    it('adds a sticky note at the given position and returns its ID', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const stickyNoteId = useEditorStore.getState().addStickyNoteAtPosition('Check the desk.', { x: 120, y: 200 });

      const stickyNote = useEditorStore.getState().doc!.stickyNotes[stickyNoteId];
      expect(stickyNote.text).toBe('Check the desk.');
      expect(stickyNote.position).toEqual({ x: 120, y: 200 });
    });
  });

  describe('map view persistence', () => {
    it('toggleSnapToGrid updates the stored map view', () => {
      useEditorStore.getState().loadDocument(testDoc);

      useEditorStore.getState().toggleSnapToGrid();

      expect(useEditorStore.getState().snapToGridEnabled).toBe(false);
      expect(useEditorStore.getState().doc?.view.snapToGrid).toBe(false);
    });

    it('toggleShowGrid updates the stored map view', () => {
      useEditorStore.getState().loadDocument(testDoc);

      useEditorStore.getState().toggleShowGrid();

      expect(useEditorStore.getState().showGridEnabled).toBe(false);
      expect(useEditorStore.getState().doc?.view.showGrid).toBe(false);
    });

    it('setMapPanOffset updates the stored map view', () => {
      useEditorStore.getState().loadDocument(testDoc);

      useEditorStore.getState().setMapPanOffset({ x: 160, y: -40 });

      expect(useEditorStore.getState().mapPanOffset).toEqual({ x: 160, y: -40 });
      expect(useEditorStore.getState().doc?.view.pan).toEqual({ x: 160, y: -40 });
    });

    it('setMapZoom updates the stored map view', () => {
      useEditorStore.getState().loadDocument(testDoc);

      useEditorStore.getState().setMapZoom(1.8);

      expect(useEditorStore.getState().mapZoom).toBe(1.8);
      expect(useEditorStore.getState().doc?.view.zoom).toBe(1.8);
    });

    it('stores and updates the background reference image and its zoom', () => {
      useEditorStore.getState().loadDocument(testDoc);

      useEditorStore.getState().setBackgroundReferenceImage({
        id: 'background-image-1',
        name: 'overlay.png',
        mimeType: 'image/png',
        dataUrl: 'data:image/png;base64,AAAA',
        sourceUrl: 'https://example.com/overlay.png',
        width: 640,
        height: 480,
        zoom: 1,
      });
      useEditorStore.getState().setBackgroundReferenceImageZoom(1.75);

      expect(useEditorStore.getState().doc?.background.referenceImage).toMatchObject({
        id: 'background-image-1',
        zoom: 1.75,
        width: 640,
        height: 480,
      });
    });
  });

  describe('room locking', () => {
    it('toggles selected rooms to locked when any selected room is unlocked', () => {
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 200, y: 120 }, locked: true };
      let doc = addRoom(testDoc, kitchen);
      doc = addRoom(doc, hallway);
      useEditorStore.getState().loadDocument(doc);
      useEditorStore.getState().setSelection([kitchen.id, hallway.id], [], [], []);

      useEditorStore.getState().toggleSelectedRoomLocks();

      const updatedDoc = useEditorStore.getState().doc!;
      expect(updatedDoc.rooms[kitchen.id].locked).toBe(true);
      expect(updatedDoc.rooms[hallway.id].locked).toBe(true);
    });

    it('toggles selected rooms to unlocked when all selected rooms are locked', () => {
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 }, locked: true };
      const hallway = { ...createRoom('Hallway'), position: { x: 200, y: 120 }, locked: true };
      let doc = addRoom(testDoc, kitchen);
      doc = addRoom(doc, hallway);
      useEditorStore.getState().loadDocument(doc);
      useEditorStore.getState().setSelection([kitchen.id, hallway.id], [], [], []);

      useEditorStore.getState().toggleSelectedRoomLocks();

      const updatedDoc = useEditorStore.getState().doc!;
      expect(updatedDoc.rooms[kitchen.id].locked).toBe(false);
      expect(updatedDoc.rooms[hallway.id].locked).toBe(false);
    });

    it('ignores locked rooms during drag moves', () => {
      const lockedRoom = { ...createRoom('Locked'), position: { x: 80, y: 120 }, locked: true };
      const freeRoom = { ...createRoom('Free'), position: { x: 200, y: 120 } };
      let doc = addRoom(testDoc, lockedRoom);
      doc = addRoom(doc, freeRoom);
      useEditorStore.getState().loadDocument(doc);

      useEditorStore.getState().moveRooms({
        [lockedRoom.id]: { x: 160, y: 200 },
        [freeRoom.id]: { x: 280, y: 200 },
      });

      const updatedDoc = useEditorStore.getState().doc!;
      expect(updatedDoc.rooms[lockedRoom.id].position).toEqual({ x: 80, y: 120 });
      expect(updatedDoc.rooms[freeRoom.id].position).toEqual({ x: 280, y: 200 });
    });
  });

  describe('drawing tool state', () => {
    it('clamps drawing size to at least one pixel', () => {
      useEditorStore.getState().setDrawingSize(0);

      expect(useEditorStore.getState().drawingToolState.size).toBe(1);
    });

    it('updates drawing tool controls and interaction mode', () => {
      useEditorStore.getState().setDrawingTool('ellipse');
      useEditorStore.getState().setDrawingColor('#336699');
      useEditorStore.getState().setDrawingOpacity(0.4);
      useEditorStore.getState().setDrawingSoftness(0.25);
      useEditorStore.getState().setShapeFilled(true);
      useEditorStore.getState().setCanvasInteractionMode('draw');

      expect(useEditorStore.getState().drawingToolState).toMatchObject({
        tool: 'ellipse',
        colorRgbHex: '#336699',
        fillColorRgbHex: '#000000',
        opacity: 0.4,
        size: 1,
        softness: 0.25,
        shapeFilled: true,
        bucketTolerance: 0,
        bucketObeyMap: false,
      });
      expect(useEditorStore.getState().canvasInteractionMode).toBe('draw');
    });

    it('updates bucket fill tolerance', () => {
      useEditorStore.getState().setBucketTolerance(300);
      expect(useEditorStore.getState().drawingToolState.bucketTolerance).toBe(255);

      useEditorStore.getState().setBucketTolerance(-20);
      expect(useEditorStore.getState().drawingToolState.bucketTolerance).toBe(0);
    });

    it('updates bucket obey map', () => {
      useEditorStore.getState().setBucketObeyMap(true);
      expect(useEditorStore.getState().drawingToolState.bucketObeyMap).toBe(true);
    });
  });

  /* ---- renameRoom ---- */

  describe('renameRoom', () => {
    it('updates the room name in the document', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const roomId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 0, y: 0 });
      useEditorStore.getState().renameRoom(roomId, 'Pantry');

      expect(useEditorStore.getState().doc!.rooms[roomId].name).toBe('Pantry');
    });

    it('throws when no document is loaded', () => {
      expect(() => useEditorStore.getState().renameRoom('r1', 'X')).toThrow();
    });
  });

  /* ---- describeRoom ---- */

  describe('describeRoom', () => {
    it('updates the room description in the document', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const roomId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 0, y: 0 });
      useEditorStore.getState().describeRoom(roomId, 'A bright kitchen with tiled walls.');

      expect(useEditorStore.getState().doc!.rooms[roomId].description).toBe('A bright kitchen with tiled walls.');
    });

    it('throws when no document is loaded', () => {
      expect(() => useEditorStore.getState().describeRoom('r1', 'X')).toThrow();
    });
  });

  describe('setStickyNoteText', () => {
    it('updates the sticky note text in the document', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const stickyNoteId = useEditorStore.getState().addStickyNoteAtPosition('', { x: 0, y: 0 });

      useEditorStore.getState().setStickyNoteText(stickyNoteId, 'The trapdoor is under the rug.');

      expect(useEditorStore.getState().doc!.stickyNotes[stickyNoteId].text).toBe('The trapdoor is under the rug.');
    });
  });

  describe('setRoomShape', () => {
    it('updates the room shape in the document', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const roomId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 0, y: 0 });

      useEditorStore.getState().setRoomShape(roomId, 'octagon');

      expect(useEditorStore.getState().doc!.rooms[roomId].shape).toBe('octagon');
    });

    it('throws when no document is loaded', () => {
      expect(() => useEditorStore.getState().setRoomShape('r1', 'diamond')).toThrow();
    });
  });

  /* ---- removeRoom ---- */

  describe('removeRoom', () => {
    it('removes the room from the document', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const roomId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 0, y: 0 });
      useEditorStore.getState().removeRoom(roomId);

      expect(Object.keys(useEditorStore.getState().doc!.rooms)).toHaveLength(0);
    });

    it('throws when no document is loaded', () => {
      expect(() => useEditorStore.getState().removeRoom('r1')).toThrow();
    });

    it('removes deleted rooms from the selection', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const roomId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 0, y: 0 });
      useEditorStore.getState().selectRoom(roomId);

      useEditorStore.getState().removeRoom(roomId);

      expect(useEditorStore.getState().selectedRoomIds).toEqual([]);
    });
  });

  describe('removeSelectedRooms', () => {
    it('removes every selected room from the document', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const kitchenId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 0, y: 0 });
      const hallwayId = useEditorStore.getState().addRoomAtPosition('Hallway', { x: 120, y: 0 });
      const cellarId = useEditorStore.getState().addRoomAtPosition('Cellar', { x: 240, y: 0 });
      useEditorStore.getState().setSelectedRoomIds([kitchenId, cellarId]);

      useEditorStore.getState().removeSelectedRooms();

      expect(Object.keys(useEditorStore.getState().doc!.rooms)).toEqual([hallwayId]);
      expect(useEditorStore.getState().selectedRoomIds).toEqual([]);
    });

    it('throws when no document is loaded', () => {
      expect(() => useEditorStore.getState().removeSelectedRooms()).toThrow();
    });
  });

  /* ---- room selection ---- */

  describe('room selection', () => {
    it('starts with no selected rooms', () => {
      expect(useEditorStore.getState().selectedRoomIds).toEqual([]);
    });

    it('selectRoom replaces the current selection', () => {
      useEditorStore.getState().selectRoom('r1');
      useEditorStore.getState().selectRoom('r2');

      expect(useEditorStore.getState().selectedRoomIds).toEqual(['r2']);
    });

    it('addRoomToSelection appends a room without duplicates', () => {
      useEditorStore.getState().selectRoom('r1');
      useEditorStore.getState().addRoomToSelection('r2');
      useEditorStore.getState().addRoomToSelection('r2');

      expect(useEditorStore.getState().selectedRoomIds).toEqual(['r1', 'r2']);
    });

    it('setSelectedRoomIds replaces the current selection', () => {
      useEditorStore.getState().selectRoom('r1');

      useEditorStore.getState().setSelectedRoomIds(['r2', 'r3']);

      expect(useEditorStore.getState().selectedRoomIds).toEqual(['r2', 'r3']);
    });

    it('clearRoomSelection empties the selection', () => {
      useEditorStore.getState().selectRoom('r1');

      useEditorStore.getState().clearRoomSelection();

      expect(useEditorStore.getState().selectedRoomIds).toEqual([]);
    });

    it('loadDocument clears any existing selection', () => {
      useEditorStore.getState().selectRoom('r1');

      useEditorStore.getState().loadDocument(testDoc);

      expect(useEditorStore.getState().selectedRoomIds).toEqual([]);
    });

    it('addConnectionToSelection appends a connection without clearing selected rooms', () => {
      useEditorStore.getState().selectRoom('r1');

      useEditorStore.getState().addConnectionToSelection('c1');

      expect(useEditorStore.getState().selectedRoomIds).toEqual(['r1']);
      expect(useEditorStore.getState().selectedConnectionIds).toEqual(['c1']);
    });

    it('setSelection replaces both selected rooms and selected connections', () => {
      useEditorStore.getState().selectRoom('r1');
      useEditorStore.getState().addConnectionToSelection('c1');

      useEditorStore.getState().setSelection(['r2'], [], ['c2', 'c3'], []);

      expect(useEditorStore.getState().selectedRoomIds).toEqual(['r2']);
      expect(useEditorStore.getState().selectedConnectionIds).toEqual(['c2', 'c3']);
    });
  });

  describe('connection selection', () => {
    it('selectConnection replaces the current selection with one connection', () => {
      useEditorStore.getState().selectRoom('r1');
      useEditorStore.getState().addConnectionToSelection('c1');

      useEditorStore.getState().selectConnection('c2');

      expect(useEditorStore.getState().selectedRoomIds).toEqual([]);
      expect(useEditorStore.getState().selectedConnectionIds).toEqual(['c2']);
    });

    it('removeSelectedConnections removes every selected connection from the document', () => {
      const kitchen = { ...createRoom('Kitchen'), position: { x: 0, y: 0 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 120, y: 0 } };
      let doc = addRoom(testDoc, kitchen);
      doc = addRoom(doc, hallway);
      doc = addConnection(doc, createConnection(kitchen.id, hallway.id, true), 'east', 'west');
      const connectionId = Object.keys(doc.connections)[0];
      useEditorStore.getState().loadDocument(doc);
      useEditorStore.getState().selectConnection(connectionId);

      useEditorStore.getState().removeSelectedConnections();

      expect(useEditorStore.getState().doc!.connections[connectionId]).toBeUndefined();
      expect(useEditorStore.getState().selectedConnectionIds).toEqual([]);
    });

    it('throws when removing selected connections without a document', () => {
      expect(() => useEditorStore.getState().removeSelectedConnections()).toThrow();
    });

    it('clears connection and mixed selections', () => {
      useEditorStore.getState().setSelection(['r1'], [], ['c1'], []);
      useEditorStore.getState().clearConnectionSelection();
      expect(useEditorStore.getState().selectedConnectionIds).toEqual([]);

      useEditorStore.getState().setSelection(['r1'], [], ['c1'], []);
      useEditorStore.getState().clearSelection();
      expect(useEditorStore.getState().selectedRoomIds).toEqual([]);
      expect(useEditorStore.getState().selectedConnectionIds).toEqual([]);
    });
  });

  describe('sticky-note link selection', () => {
    it('selectStickyNoteLink replaces the current selection with one sticky-note link', () => {
      useEditorStore.getState().selectRoom('r1');
      useEditorStore.getState().addConnectionToSelection('c1');

      useEditorStore.getState().selectStickyNoteLink('sl1');

      expect(useEditorStore.getState().selectedRoomIds).toEqual([]);
      expect(useEditorStore.getState().selectedConnectionIds).toEqual([]);
      expect(useEditorStore.getState().selectedStickyNoteLinkIds).toEqual(['sl1']);
    });

    it('addStickyNoteLinkToSelection appends without clearing other selected entities', () => {
      useEditorStore.getState().selectRoom('r1');

      useEditorStore.getState().addStickyNoteLinkToSelection('sl1');

      expect(useEditorStore.getState().selectedRoomIds).toEqual(['r1']);
      expect(useEditorStore.getState().selectedStickyNoteLinkIds).toEqual(['sl1']);
    });

    it('removeSelectedStickyNoteLinks removes selected sticky-note links from the document', () => {
      const room = { ...createRoom('Kitchen'), position: { x: 0, y: 0 } };
      const stickyNote = { ...createStickyNote('Check desk'), position: { x: 120, y: 0 } };
      let doc = addRoom(testDoc, room);
      doc = addStickyNote(doc, stickyNote);
      doc = addStickyNoteLink(doc, createStickyNoteLink(stickyNote.id, room.id));
      const stickyNoteLinkId = Object.keys(doc.stickyNoteLinks)[0];
      useEditorStore.getState().loadDocument(doc);
      useEditorStore.getState().selectStickyNoteLink(stickyNoteLinkId);

      useEditorStore.getState().removeSelectedStickyNoteLinks();

      expect(useEditorStore.getState().doc!.stickyNoteLinks[stickyNoteLinkId]).toBeUndefined();
      expect(useEditorStore.getState().selectedStickyNoteLinkIds).toEqual([]);
    });

    it('removeSelectedEntities deletes mixed selected entities in one step', async () => {
      const roomA = { ...createRoom('Kitchen'), position: { x: 0, y: 0 } };
      const roomB = { ...createRoom('Hallway'), position: { x: 120, y: 0 } };
      const stickyNote = { ...createStickyNote('Check desk'), position: { x: 240, y: 0 } };
      let doc = addRoom(testDoc, roomA);
      doc = addRoom(doc, roomB);
      doc = addConnection(doc, createConnection(roomA.id, roomB.id, true), 'east', 'west');
      doc = addStickyNote(doc, stickyNote);
      doc = addStickyNoteLink(doc, createStickyNoteLink(stickyNote.id, roomB.id));
      const connectionId = Object.keys(doc.connections)[0];
      const stickyNoteLinkId = Object.keys(doc.stickyNoteLinks)[0];
      useEditorStore.getState().loadDocument(doc);
      useEditorStore.getState().setSelection([roomA.id], [stickyNote.id], [connectionId], [stickyNoteLinkId]);

      useEditorStore.getState().removeSelectedEntities();

      expect(useEditorStore.getState().doc!.rooms[roomA.id]).toBeUndefined();
      expect(useEditorStore.getState().doc!.stickyNotes[stickyNote.id]).toBeUndefined();
      expect(useEditorStore.getState().doc!.connections[connectionId]).toBeUndefined();
      expect(useEditorStore.getState().doc!.stickyNoteLinks[stickyNoteLinkId]).toBeUndefined();
      expect(useEditorStore.getState().selectedRoomIds).toEqual([]);
      expect(useEditorStore.getState().selectedStickyNoteIds).toEqual([]);
      expect(useEditorStore.getState().selectedConnectionIds).toEqual([]);
      expect(useEditorStore.getState().selectedStickyNoteLinkIds).toEqual([]);

      await useEditorStore.getState().undo();

      expect(useEditorStore.getState().doc!.rooms[roomA.id]).toBeDefined();
      expect(useEditorStore.getState().doc!.stickyNotes[stickyNote.id]).toBeDefined();
      expect(useEditorStore.getState().doc!.connections[connectionId]).toBeDefined();
      expect(useEditorStore.getState().doc!.stickyNoteLinks[stickyNoteLinkId]).toBeDefined();
    });
  });

  /* ---- moveRoom ---- */

  describe('moveRoom', () => {
    it('updates the room position', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const roomId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 0, y: 0 });
      useEditorStore.getState().moveRoom(roomId, { x: 200, y: 160 });

      expect(useEditorStore.getState().doc!.rooms[roomId].position).toEqual({ x: 200, y: 160 });
    });

    it('snaps position to the grid', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const roomId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 0, y: 0 });
      useEditorStore.getState().moveRoom(roomId, { x: 55, y: 85 });

      expect(useEditorStore.getState().doc!.rooms[roomId].position).toEqual({ x: 40, y: 80 });
    });

    it('throws when no document is loaded', () => {
      expect(() => useEditorStore.getState().moveRoom('r1', { x: 0, y: 0 })).toThrow();
    });

    it('does not snap position when grid snapping is disabled', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const roomId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 0, y: 0 });
      useEditorStore.getState().toggleSnapToGrid();

      useEditorStore.getState().moveRoom(roomId, { x: 55, y: 85 });

      expect(useEditorStore.getState().doc!.rooms[roomId].position).toEqual({ x: 55, y: 85 });
    });
  });

  describe('moveRooms', () => {
    it('updates multiple room positions in one step', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const firstRoomId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 0, y: 0 });
      const secondRoomId = useEditorStore.getState().addRoomAtPosition('Hallway', { x: 120, y: 0 });

      useEditorStore.getState().moveRooms({
        [firstRoomId]: { x: 45, y: 85 },
        [secondRoomId]: { x: 200, y: 160 },
      });

      expect(useEditorStore.getState().doc!.rooms[firstRoomId].position).toEqual({ x: 40, y: 80 });
      expect(useEditorStore.getState().doc!.rooms[secondRoomId].position).toEqual({ x: 200, y: 160 });
    });

    it('throws when moving rooms without a document', () => {
      expect(() => useEditorStore.getState().moveRooms({ r1: { x: 0, y: 0 } })).toThrow();
    });
  });

  describe('prettifyLayout', () => {
    it('is a no-op when no document is loaded', () => {
      expect(() => useEditorStore.getState().prettifyLayout()).not.toThrow();
      expect(useEditorStore.getState().doc).toBeNull();
    });

    it('moves pseudo-rooms during prettify layout', () => {
      const room = { ...createRoom('Room'), id: 'room-a', position: { x: 0, y: 0 } };
      const pseudoRoom = { ...createPseudoRoom('unknown'), id: 'pseudo-a', position: { x: 0, y: 0 } };
      let doc = createEmptyMap('Pseudo Layout');
      doc = addRoom(doc, room);
      doc = addPseudoRoom(doc, pseudoRoom);
      doc = addConnection(doc, createConnection(room.id, { kind: 'pseudo-room', id: pseudoRoom.id }, false), 'east');
      useEditorStore.getState().loadDocument(doc);

      useEditorStore.getState().prettifyLayout();

      const updatedDoc = useEditorStore.getState().doc!;
      expect(updatedDoc.pseudoRooms[pseudoRoom.id].position).not.toEqual(pseudoRoom.position);
      expect(updatedDoc.pseudoRooms[pseudoRoom.id].position).not.toEqual(updatedDoc.rooms[room.id].position);
    });

    it('pulls a distant pseudo-room back toward its connected rooms during prettify layout', () => {
      const room = { ...createRoom('Room'), id: 'room-a', position: { x: 0, y: 0 } };
      const pseudoRoom = { ...createPseudoRoom('unknown'), id: 'pseudo-a', position: { x: 1200, y: 0 } };
      let doc = createEmptyMap('Pseudo Layout');
      doc = addRoom(doc, room);
      doc = addPseudoRoom(doc, pseudoRoom);
      doc = addConnection(doc, createConnection(room.id, { kind: 'pseudo-room', id: pseudoRoom.id }, false), 'east');
      useEditorStore.getState().loadDocument(doc);

      useEditorStore.getState().prettifyLayout();

      const updatedDoc = useEditorStore.getState().doc!;
      expect(updatedDoc.pseudoRooms[pseudoRoom.id].position.x).toBeLessThan(pseudoRoom.position.x);
    });
  });

  describe('grid snapping', () => {
    it('starts enabled', () => {
      expect(useEditorStore.getState().snapToGridEnabled).toBe(true);
    });

    it('toggleSnapToGrid flips the setting', () => {
      useEditorStore.getState().toggleSnapToGrid();
      expect(useEditorStore.getState().snapToGridEnabled).toBe(false);

      useEditorStore.getState().toggleSnapToGrid();
      expect(useEditorStore.getState().snapToGridEnabled).toBe(true);
    });
  });

  describe('undo and redo', () => {
    it('tracks document history for undoable edits', () => {
      useEditorStore.getState().loadDocument(testDoc);

      expect(useEditorStore.getState().canUndo).toBe(false);
      expect(useEditorStore.getState().canRedo).toBe(false);

      const roomId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 0, y: 0 });

      expect(useEditorStore.getState().canUndo).toBe(true);
      expect(useEditorStore.getState().canRedo).toBe(false);
      expect(useEditorStore.getState().doc!.rooms[roomId].name).toBe('Kitchen');
    });

    it('undo restores the previous document state', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const roomId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 0, y: 0 });
      useEditorStore.getState().renameRoom(roomId, 'Pantry');

      useEditorStore.getState().undo();

      expect(useEditorStore.getState().doc!.rooms[roomId].name).toBe('Kitchen');
      expect(useEditorStore.getState().canUndo).toBe(true);
      expect(useEditorStore.getState().canRedo).toBe(true);
    });

    it('redo reapplies an undone document state', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const roomId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 0, y: 0 });
      useEditorStore.getState().renameRoom(roomId, 'Pantry');
      useEditorStore.getState().undo();

      useEditorStore.getState().redo();

      expect(useEditorStore.getState().doc!.rooms[roomId].name).toBe('Pantry');
      expect(useEditorStore.getState().canRedo).toBe(false);
    });

    it('clears redo history after a new edit', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const roomId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 0, y: 0 });
      useEditorStore.getState().renameRoom(roomId, 'Pantry');
      useEditorStore.getState().undo();

      useEditorStore.getState().describeRoom(roomId, 'Shelves line the walls.');

      expect(useEditorStore.getState().canRedo).toBe(false);
      expect(useEditorStore.getState().doc!.rooms[roomId].description).toBe('Shelves line the walls.');
    });

    it('coalesces successive edits from the same field into one undo step', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const roomId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 0, y: 0 });

      useEditorStore.getState().renameRoom(roomId, 'Kitchena', { historyMergeKey: `room:${roomId}:name` });
      useEditorStore.getState().renameRoom(roomId, 'Kitchenab', { historyMergeKey: `room:${roomId}:name` });

      useEditorStore.getState().undo();

      expect(useEditorStore.getState().doc!.rooms[roomId].name).toBe('Kitchen');
      expect(useEditorStore.getState().canRedo).toBe(true);
    });

    it('does not add selection-only changes to history', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const roomId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 0, y: 0 });

      useEditorStore.getState().selectRoom(roomId);
      useEditorStore.getState().clearRoomSelection();
      useEditorStore.getState().undo();

      expect(useEditorStore.getState().doc!.rooms[roomId]).toBeUndefined();
      expect(useEditorStore.getState().canRedo).toBe(true);
      expect(useEditorStore.getState().selectedRoomIds).toEqual([]);
    });

    it('resets history when a new document is loaded', () => {
      useEditorStore.getState().loadDocument(testDoc);
      useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 0, y: 0 });

      const secondDoc = createEmptyMap('Second Map');
      useEditorStore.getState().loadDocument(secondDoc);

      expect(useEditorStore.getState().canUndo).toBe(false);
      expect(useEditorStore.getState().canRedo).toBe(false);
      expect(useEditorStore.getState().doc).toEqual(secondDoc);
    });

    it('undoes and redoes background stroke history entries', async () => {
      const doc = createEmptyMap('Background History');
      useEditorStore.getState().loadDocument(doc);
      const layerId = useEditorStore.getState().ensureDefaultBackgroundLayer();
      const beforeBlob = new Blob(['before'], { type: 'image/png' });
      const afterBlob = new Blob(['after'], { type: 'image/png' });
      const key = getBackgroundChunkKey({
        mapId: doc.metadata.id,
        layerId,
        chunkX: 1,
        chunkY: 2,
      });

      await saveBackgroundChunks([{
        mapId: doc.metadata.id,
        layerId,
        chunkX: 1,
        chunkY: 2,
        blob: beforeBlob,
      }]);

      useEditorStore.getState().commitBackgroundStroke({
        kind: 'background-stroke',
        mapId: doc.metadata.id,
        layerId,
        chunks: [{
          key,
          before: beforeBlob,
          after: afterBlob,
        }],
      });

      expect(useEditorStore.getState().backgroundRevision).toBe(1);

      await useEditorStore.getState().undo();
      expect(useEditorStore.getState().backgroundRevision).toBe(2);
      expect(await loadBackgroundChunk(doc.metadata.id, layerId, 1, 2)).toMatchObject({ blob: beforeBlob });

      await useEditorStore.getState().redo();
      expect(useEditorStore.getState().backgroundRevision).toBe(3);
      expect(await loadBackgroundChunk(doc.metadata.id, layerId, 1, 2)).toMatchObject({ blob: afterBlob });
    });
  });

  /* ---- room drag ---- */

  describe('room drag', () => {
    it('starts with selectionDrag as null', () => {
      expect(useEditorStore.getState().selectionDrag).toBeNull();
    });

    it('startRoomDrag uses only the dragged room when it is not selected', () => {
      useEditorStore.getState().startRoomDrag('r1');

      expect(useEditorStore.getState().selectionDrag).toEqual({
        roomIds: ['r1'],
        stickyNoteIds: [],
        dx: 0,
        dy: 0,
      });
    });

    it('startRoomDrag uses the full room selection when dragging a selected room', () => {
      useEditorStore.getState().selectRoom('r1');
      useEditorStore.getState().addRoomToSelection('r2');

      useEditorStore.getState().startRoomDrag('r1');

      expect(useEditorStore.getState().selectionDrag).toEqual({
        roomIds: ['r1', 'r2'],
        stickyNoteIds: [],
        dx: 0,
        dy: 0,
      });
    });

    it('startRoomDrag carries selected sticky notes for mixed dragging', () => {
      useEditorStore.getState().selectRoom('r1');
      useEditorStore.getState().addStickyNoteToSelection('s1');
      useEditorStore.getState().startRoomDrag('r1');

      expect(useEditorStore.getState().selectionDrag).toEqual({
        roomIds: ['r1'],
        stickyNoteIds: ['s1'],
        dx: 0,
        dy: 0,
      });
    });

    it('updateRoomDrag updates the shared drag delta', () => {
      useEditorStore.getState().startRoomDrag('r1');
      useEditorStore.getState().updateRoomDrag(40, 20);

      expect(useEditorStore.getState().selectionDrag).toEqual({
        roomIds: ['r1'],
        stickyNoteIds: [],
        dx: 40,
        dy: 20,
      });
    });

    it('endRoomDrag clears the drag state', () => {
      useEditorStore.getState().startRoomDrag('r1');

      useEditorStore.getState().endRoomDrag();

      expect(useEditorStore.getState().selectionDrag).toBeNull();
    });
  });

  /* ---- connection drag ---- */

  describe('connection drag', () => {
    it('starts with connectionDrag as null', () => {
      expect(useEditorStore.getState().connectionDrag).toBeNull();
    });

    it('startConnectionDrag sets the drag state', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const roomId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 80, y: 120 });

      useEditorStore.getState().startConnectionDrag(roomId, 'north', 100, 120);

      const drag = useEditorStore.getState().connectionDrag;
      expect(drag).toEqual({
        sourceRoomId: roomId,
        sourceDirection: 'north',
        cursorX: 100,
        cursorY: 120,
      });
    });

    it('updateConnectionDrag updates cursor position', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const roomId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 80, y: 120 });
      useEditorStore.getState().startConnectionDrag(roomId, 'north', 100, 120);

      useEditorStore.getState().updateConnectionDrag(200, 300);

      const drag = useEditorStore.getState().connectionDrag;
      expect(drag!.cursorX).toBe(200);
      expect(drag!.cursorY).toBe(300);
    });

    it('cancelConnectionDrag clears the drag state', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const roomId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 80, y: 120 });
      useEditorStore.getState().startConnectionDrag(roomId, 'north', 100, 120);
      useEditorStore.getState().cancelConnectionDrag();

      expect(useEditorStore.getState().connectionDrag).toBeNull();
    });

    it('completeConnectionDrag creates a connection to a different room', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const kitchenId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 80, y: 120 });
      const hallwayId = useEditorStore.getState().addRoomAtPosition('Hallway', { x: 80, y: 0 });

      useEditorStore.getState().startConnectionDrag(kitchenId, 'north', 100, 120);
      useEditorStore.getState().completeConnectionDrag(hallwayId);

      const doc = useEditorStore.getState().doc!;
      const connections = Object.values(doc.connections);
      expect(connections).toHaveLength(1);

      const conn = connections[0];
      expect(conn.sourceRoomId).toBe(kitchenId);
      expect(conn.target).toEqual({ kind: 'room', id: hallwayId });
      expect(conn.isBidirectional).toBe(false);

      // Source room should have 'north' bound
      expect(doc.rooms[kitchenId].directions['north']).toBe(conn.id);
      // Target room should have opposite direction 'south' bound (fallback)
      expect(doc.rooms[hallwayId].directions['south']).toBe(conn.id);

      // Drag state should be cleared
      expect(useEditorStore.getState().connectionDrag).toBeNull();
    });

    it('completeConnectionDrag uses an explicit target direction instead of the opposite', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const kitchenId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 80, y: 120 });
      const hallwayId = useEditorStore.getState().addRoomAtPosition('Hallway', { x: 200, y: 0 });

      useEditorStore.getState().startConnectionDrag(kitchenId, 'ne', 100, 120);
      useEditorStore.getState().completeConnectionDrag(hallwayId, 'w');

      const doc = useEditorStore.getState().doc!;
      const connections = Object.values(doc.connections);
      expect(connections).toHaveLength(1);

      const conn = connections[0];
      expect(conn.isBidirectional).toBe(true);

      // Source room should have 'northeast' bound
      expect(doc.rooms[kitchenId].directions['northeast']).toBe(conn.id);
      // Target room should have 'west' (not 'southwest' which is the opposite of 'northeast')
      expect(doc.rooms[hallwayId].directions['west']).toBe(conn.id);
    });

    it('completeConnectionDrag creates a one-way self-connection when dropped on the room body', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const kitchenId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 80, y: 120 });

      useEditorStore.getState().startConnectionDrag(kitchenId, 'north', 100, 120);
      useEditorStore.getState().completeConnectionDrag(kitchenId);

      const doc = useEditorStore.getState().doc!;
      const connections = Object.values(doc.connections);
      expect(connections).toHaveLength(1);

      const conn = connections[0];
      expect(conn.sourceRoomId).toBe(kitchenId);
      expect(conn.target).toEqual({ kind: 'room', id: kitchenId });
      expect(conn.isBidirectional).toBe(false);

      // Source room should have 'north' bound
      expect(doc.rooms[kitchenId].directions['north']).toBe(conn.id);

      // Drag state should be cleared
      expect(useEditorStore.getState().connectionDrag).toBeNull();
    });

    it('completeConnectionDrag creates a bidirectional self-connection when dropped on a handle', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const kitchenId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 80, y: 120 });

      useEditorStore.getState().startConnectionDrag(kitchenId, 'north', 100, 120);
      useEditorStore.getState().completeConnectionDrag(kitchenId, 'east');

      const doc = useEditorStore.getState().doc!;
      const connections = Object.values(doc.connections);
      expect(connections).toHaveLength(1);

      const conn = connections[0];
      expect(conn.sourceRoomId).toBe(kitchenId);
      expect(conn.target).toEqual({ kind: 'room', id: kitchenId });
      expect(conn.isBidirectional).toBe(true);
      expect(doc.rooms[kitchenId].directions['north']).toBe(conn.id);
      expect(doc.rooms[kitchenId].directions['east']).toBe(conn.id);
    });

    it('completeConnectionDrag does nothing when no drag is active', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const kitchenId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 80, y: 120 });

      // No startConnectionDrag call
      useEditorStore.getState().completeConnectionDrag(kitchenId);

      const doc = useEditorStore.getState().doc!;
      expect(Object.values(doc.connections)).toHaveLength(0);
    });

    it('completeConnectionDrag clears the drag state when no document is loaded', () => {
      useEditorStore.setState({
        ...useEditorStore.getState(),
        connectionDrag: {
          sourceRoomId: 'r1',
          sourceDirection: 'north',
          cursorX: 0,
          cursorY: 0,
        },
      });

      useEditorStore.getState().completeConnectionDrag('r2');

      expect(useEditorStore.getState().connectionDrag).toBeNull();
    });

    it('completeConnectionDragToNewRoom creates a snapped room and a bidirectional connection with the opposite target binding', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const kitchenId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 80, y: 120 });

      useEditorStore.getState().startConnectionDrag(kitchenId, 'north', 100, 120);
      const createdRoomId = useEditorStore.getState().completeConnectionDragToNewRoom({ x: 155, y: 65 });

      expect(createdRoomId).not.toBeNull();

      const doc = useEditorStore.getState().doc!;
      const createdRoom = doc.rooms[createdRoomId!];
      expect(createdRoom.position).toEqual({ x: 160, y: 80 });

      const connections = Object.values(doc.connections);
      expect(connections).toHaveLength(1);
      expect(connections[0].sourceRoomId).toBe(kitchenId);
      expect(connections[0].target).toEqual({ kind: 'room', id: createdRoomId! });
      expect(connections[0].isBidirectional).toBe(true);
      expect(doc.rooms[kitchenId].directions['north']).toBe(connections[0].id);
      expect(doc.rooms[createdRoomId!].directions).toEqual({ south: connections[0].id });
      expect(useEditorStore.getState().selectedRoomIds).toEqual([createdRoomId]);
      expect(useEditorStore.getState().connectionDrag).toBeNull();
      expect(useEditorStore.getState().pastEntries).toHaveLength(2);
    });

    it('completeConnectionDragToNewRoom can be undone and redone as a single edit', async () => {
      useEditorStore.getState().loadDocument(testDoc);
      const kitchenId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 80, y: 120 });

      useEditorStore.getState().startConnectionDrag(kitchenId, 'north', 100, 120);
      const createdRoomId = useEditorStore.getState().completeConnectionDragToNewRoom({ x: 160, y: 80 });

      expect(createdRoomId).not.toBeNull();
      expect(Object.keys(useEditorStore.getState().doc!.rooms)).toContain(createdRoomId!);
      expect(Object.values(useEditorStore.getState().doc!.connections)).toHaveLength(1);

      await useEditorStore.getState().undo();

      expect(Object.keys(useEditorStore.getState().doc!.rooms)).toEqual([kitchenId]);
      expect(Object.values(useEditorStore.getState().doc!.connections)).toHaveLength(0);

      await useEditorStore.getState().redo();

      expect(Object.keys(useEditorStore.getState().doc!.rooms)).toContain(createdRoomId!);
      expect(Object.values(useEditorStore.getState().doc!.connections)).toHaveLength(1);
    });

    it('createPseudoRoomAndConnect creates a pseudo-room target with a one-way connection', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const kitchenId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 80, y: 120 });

      const result = useEditorStore.getState().createPseudoRoomAndConnect('unknown', { x: 160, y: 80 }, kitchenId, 'north');

      const doc = useEditorStore.getState().doc!;
      expect(doc.pseudoRooms[result.pseudoRoomId]).toMatchObject({
        id: result.pseudoRoomId,
        kind: 'unknown',
        position: { x: 160, y: 80 },
      });
      expect(doc.connections[result.connectionId].target).toEqual({ kind: 'pseudo-room', id: result.pseudoRoomId });
      expect(doc.rooms[kitchenId].directions.north).toBe(result.connectionId);
    });

    it('convertPseudoRoomToRoom preserves the node id and retargets incoming connections', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const kitchenId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 80, y: 120 });
      const result = useEditorStore.getState().createPseudoRoomAndConnect('unknown', { x: 160, y: 80 }, kitchenId, 'north');

      const roomId = useEditorStore.getState().convertPseudoRoomToRoom(result.pseudoRoomId, {
        name: 'Hallway',
        shape: 'rectangle',
        fillColorIndex: 0,
        strokeColorIndex: 0,
        strokeStyle: 'solid',
      });

      const doc = useEditorStore.getState().doc!;
      expect(roomId).toBe(result.pseudoRoomId);
      expect(doc.pseudoRooms[result.pseudoRoomId]).toBeUndefined();
      expect(doc.rooms[result.pseudoRoomId]).toMatchObject({
        id: result.pseudoRoomId,
        name: 'Hallway',
      });
      expect(doc.connections[result.connectionId].target).toEqual({ kind: 'room', id: result.pseudoRoomId });
    });
  });

  describe('connection endpoint drag', () => {
    it('starts and updates endpoint reroute drag state', () => {
      useEditorStore.getState().startConnectionEndpointDrag('c1', 'start', 100, 120);
      expect(useEditorStore.getState().connectionEndpointDrag).toEqual({
        connectionId: 'c1',
        endpoint: 'start',
        cursorX: 100,
        cursorY: 120,
      });

      useEditorStore.getState().updateConnectionEndpointDrag(180, 200);
      expect(useEditorStore.getState().connectionEndpointDrag).toEqual({
        connectionId: 'c1',
        endpoint: 'start',
        cursorX: 180,
        cursorY: 200,
      });
    });

    it('reroutes a selected connection endpoint in one undoable history step', async () => {
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 240, y: 120 } };
      const cellar = { ...createRoom('Cellar'), position: { x: 240, y: 240 } };
      let doc = addRoom(testDoc, kitchen);
      doc = addRoom(doc, hallway);
      doc = addRoom(doc, cellar);
      const connection = createConnection(kitchen.id, hallway.id, true);
      doc = addConnection(doc, connection, 'east', 'west');
      useEditorStore.getState().loadDocument(doc);

      useEditorStore.getState().startConnectionEndpointDrag(connection.id, 'end', 240, 140);
      useEditorStore.getState().completeConnectionEndpointDrag(cellar.id);

      const updatedDoc = useEditorStore.getState().doc!;
      expect(updatedDoc.connections[connection.id]).toMatchObject({
        sourceRoomId: kitchen.id,
        target: { kind: 'room', id: cellar.id },
        isBidirectional: false,
      });
      expect(updatedDoc.rooms[hallway.id].directions.west).toBeUndefined();
      expect(useEditorStore.getState().selectedConnectionIds).toEqual([connection.id]);

      await useEditorStore.getState().undo();
      expect(useEditorStore.getState().doc!.connections[connection.id]).toMatchObject({
        sourceRoomId: kitchen.id,
        target: { kind: 'room', id: hallway.id },
        isBidirectional: true,
      });

      await useEditorStore.getState().redo();
      expect(useEditorStore.getState().doc!.connections[connection.id]).toMatchObject({
        sourceRoomId: kitchen.id,
        target: { kind: 'room', id: cellar.id },
        isBidirectional: false,
      });
    });

    it('removes a pseudo-room when rerouting away from it', () => {
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 240, y: 120 } };
      const unknown = { ...createPseudoRoom('unknown'), position: { x: 400, y: 120 } };
      let doc = addRoom(testDoc, kitchen);
      doc = addRoom(doc, hallway);
      doc = addPseudoRoom(doc, unknown);
      const connection = createConnection(kitchen.id, { kind: 'pseudo-room', id: unknown.id }, false);
      doc = addConnection(doc, connection, 'east');
      useEditorStore.getState().loadDocument(doc);

      useEditorStore.getState().startConnectionEndpointDrag(connection.id, 'end', 360, 140);
      useEditorStore.getState().completeConnectionEndpointDrag(hallway.id, 'west');

      const updatedDoc = useEditorStore.getState().doc!;
      expect(updatedDoc.pseudoRooms[unknown.id]).toBeUndefined();
      expect(updatedDoc.connections[connection.id]).toMatchObject({
        target: { kind: 'room', id: hallway.id },
        isBidirectional: true,
      });
    });
  });

  describe('background stroke state', () => {
    it('throws when ensuring a background layer without a document', () => {
      expect(() => useEditorStore.getState().ensureDefaultBackgroundLayer()).toThrow();
    });

    it('activates an existing background layer when one is already present', () => {
      const doc = createEmptyMap('Existing Layer');
      const layerId = crypto.randomUUID();
      useEditorStore.getState().loadDocument({
        ...doc,
        background: {
          layers: {
            [layerId]: {
              id: layerId,
              name: 'Background',
              visible: true,
              opacity: 1,
              pixelSize: 1,
              chunkSize: 256,
            },
          },
          activeLayerId: null,
          referenceImage: null,
        },
      });

      expect(useEditorStore.getState().ensureDefaultBackgroundLayer()).toBe(layerId);
      expect(useEditorStore.getState().doc?.background.activeLayerId).toBe(layerId);
    });

    it('begins and cancels a background stroke using the active drawing tool', () => {
      useEditorStore.getState().loadDocument(testDoc);
      useEditorStore.getState().setDrawingTool('rectangle');
      const layerId = useEditorStore.getState().ensureDefaultBackgroundLayer();

      useEditorStore.getState().beginBackgroundStroke(layerId);
      expect(useEditorStore.getState().activeStroke).toEqual({
        mapId: testDoc.metadata.id,
        layerId,
        tool: 'rectangle',
      });

      useEditorStore.getState().cancelBackgroundStroke();
      expect(useEditorStore.getState().activeStroke).toBeNull();
    });

    it('throws when beginning a background stroke without a document', () => {
      expect(() => useEditorStore.getState().beginBackgroundStroke('layer-1')).toThrow();
    });
  });

  /* ---- room drag ---- */

  describe('room drag', () => {
    it('starts with selectionDrag as null', () => {
      expect(useEditorStore.getState().selectionDrag).toBeNull();
    });

    it('startRoomDrag sets the drag state with zero offset', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const roomId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 80, y: 120 });
      useEditorStore.getState().startRoomDrag(roomId);

      expect(useEditorStore.getState().selectionDrag).toEqual({ roomIds: [roomId], stickyNoteIds: [], dx: 0, dy: 0 });
    });

    it('updateRoomDrag updates the offset', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const roomId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 80, y: 120 });
      useEditorStore.getState().startRoomDrag(roomId);
      useEditorStore.getState().updateRoomDrag(30, 40);

      expect(useEditorStore.getState().selectionDrag).toEqual({ roomIds: [roomId], stickyNoteIds: [], dx: 30, dy: 40 });
    });

    it('endRoomDrag clears the drag state', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const roomId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 80, y: 120 });
      useEditorStore.getState().startRoomDrag(roomId);
      useEditorStore.getState().endRoomDrag();

      expect(useEditorStore.getState().selectionDrag).toBeNull();
    });
  });

  describe('additional coverage', () => {
    it('throws when adding a sticky note without a document', () => {
      expect(() => useEditorStore.getState().addStickyNoteAtPosition('Note', { x: 0, y: 0 })).toThrow();
    });

    it('toggles bezier connections in persisted view state', () => {
      useEditorStore.getState().loadDocument(testDoc);

      useEditorStore.getState().toggleUseBezierConnections();

      expect(useEditorStore.getState().useBezierConnectionsEnabled).toBe(true);
      expect(useEditorStore.getState().doc?.view.useBezierConnections).toBe(true);
    });

    it('updates room and connection styling fields', () => {
      const kitchen = { ...createRoom('Kitchen'), position: { x: 0, y: 0 } };
      const hall = { ...createRoom('Hall'), position: { x: 160, y: 0 } };
      let doc = addRoom(testDoc, kitchen);
      doc = addRoom(doc, hall);
      const connection = createConnection(kitchen.id, hall.id, true);
      doc = addConnection(doc, connection, 'east', 'west');
      useEditorStore.getState().loadDocument(doc);

      useEditorStore.getState().setRoomStyle(kitchen.id, {
        fillColorIndex: 2,
        strokeColorIndex: 3,
        strokeStyle: 'dashed',
      });
      useEditorStore.getState().setConnectionStyle(connection.id, { strokeColorIndex: 4, strokeStyle: 'dotted' });
      useEditorStore.getState().setConnectionLabels(connection.id, { startLabel: 'ledge', endLabel: 'stairs' });
      useEditorStore.getState().setConnectionAnnotation(connection.id, { kind: 'door' });

      expect(useEditorStore.getState().doc!.rooms[kitchen.id]).toMatchObject({
        fillColorIndex: 2,
        strokeColorIndex: 3,
        strokeStyle: 'dashed',
      });
      expect(useEditorStore.getState().doc!.connections[connection.id]).toMatchObject({
        strokeColorIndex: 4,
        strokeStyle: 'dotted',
        startLabel: 'ledge',
        endLabel: 'stairs',
        annotation: { kind: 'door' },
      });
    });

    it('throws when styling setters are used without a document', () => {
      expect(() => useEditorStore.getState().setStickyNoteText('note-1', 'Text')).toThrow();
      expect(() => useEditorStore.getState().setRoomStyle('room-1', { fillColorIndex: 1 })).toThrow();
      expect(() => useEditorStore.getState().setConnectionStyle('conn-1', { strokeColorIndex: 1 })).toThrow();
      expect(() => useEditorStore.getState().setConnectionLabels('conn-1', { startLabel: 'x' })).toThrow();
      expect(() => useEditorStore.getState().setConnectionAnnotation('conn-1', { kind: 'door' })).toThrow();
    });

    it('connectRooms creates and replaces CLI connections', () => {
      const kitchen = { ...createRoom('Kitchen'), position: { x: 0, y: 0 } };
      const hall = { ...createRoom('Hall'), position: { x: 160, y: 0 } };
      const pantry = { ...createRoom('Pantry'), position: { x: 320, y: 0 } };
      let doc = addRoom(testDoc, kitchen);
      doc = addRoom(doc, hall);
      doc = addRoom(doc, pantry);
      useEditorStore.getState().loadDocument(doc);

      const firstConnectionId = useEditorStore.getState().connectRooms(kitchen.id, 'e', hall.id, {
        oneWay: true,
        targetDirection: null,
      });
      expect(useEditorStore.getState().doc!.rooms[kitchen.id].directions.east).toBe(firstConnectionId);
      expect(useEditorStore.getState().doc!.rooms[hall.id].directions.west).toBeUndefined();
      expect(useEditorStore.getState().selectedConnectionIds).toEqual([firstConnectionId]);

      const secondConnectionId = useEditorStore.getState().connectRooms(kitchen.id, 'east', pantry.id, {
        oneWay: false,
        targetDirection: 'west',
      });
      expect(Object.keys(useEditorStore.getState().doc!.connections)).toHaveLength(1);
      expect(useEditorStore.getState().doc!.rooms[pantry.id].directions.west).toBe(secondConnectionId);
    });

    it('createRoomAndConnect creates a snapped room and selects both rooms plus the connection', () => {
      const hall = { ...createRoom('Hall'), position: { x: 160, y: 0 } };
      const doc = addRoom(testDoc, hall);
      useEditorStore.getState().loadDocument(doc);

      const result = useEditorStore.getState().createRoomAndConnect('Kitchen', { x: 53, y: 87 }, hall.id, {
        sourceDirection: 'n',
        oneWay: false,
        targetDirection: 'south',
      });

      expect(useEditorStore.getState().doc!.rooms[result.roomId]).toBeDefined();
      expect(useEditorStore.getState().doc!.rooms[result.roomId].directions.north).toBe(result.connectionId);
      expect(useEditorStore.getState().doc!.rooms[hall.id].directions.south).toBe(result.connectionId);
      expect(useEditorStore.getState().selectedRoomIds).toEqual([result.roomId, hall.id]);
      expect(useEditorStore.getState().selectedConnectionIds).toEqual([result.connectionId]);
    });

    it('throws when CLI connection actions are used without a document', () => {
      expect(() => useEditorStore.getState().connectRooms('a', 'north', 'b', { oneWay: true, targetDirection: null })).toThrow();
      expect(() => useEditorStore.getState().createRoomAndConnect('Kitchen', { x: 0, y: 0 }, 'room-1', {
        sourceDirection: 'north',
        oneWay: true,
        targetDirection: null,
      })).toThrow();
    });

    it('manages sticky note selection and movement', () => {
      useEditorStore.getState().setSelectedStickyNoteIds(['note-1', 'note-2']);
      expect(useEditorStore.getState().selectedStickyNoteIds).toEqual(['note-1', 'note-2']);
      useEditorStore.getState().clearStickyNoteSelection();
      expect(useEditorStore.getState().selectedStickyNoteIds).toEqual([]);

      useEditorStore.getState().loadDocument(testDoc);
      const stickyNoteId = useEditorStore.getState().addStickyNoteAtPosition('note', { x: 0, y: 0 });
      useEditorStore.getState().moveStickyNote(stickyNoteId, { x: 57, y: 86 });
      expect(useEditorStore.getState().doc!.stickyNotes[stickyNoteId].position).toEqual({ x: 40, y: 80 });

      useEditorStore.getState().toggleSnapToGrid();
      useEditorStore.getState().moveStickyNotes({ [stickyNoteId]: { x: 57, y: 86 } });
      expect(useEditorStore.getState().doc!.stickyNotes[stickyNoteId].position).toEqual({ x: 57, y: 86 });
    });

    it('throws when moving sticky notes without a document', () => {
      expect(() => useEditorStore.getState().moveStickyNote('note-1', { x: 0, y: 0 })).toThrow();
      expect(() => useEditorStore.getState().moveStickyNotes({ note1: { x: 0, y: 0 } })).toThrow();
    });

    it('supports sticky note link drag and sticky note drag flows', () => {
      const stickyNote = { ...createStickyNote('Note'), position: { x: 40, y: 40 } };
      const room = { ...createRoom('Room'), position: { x: 160, y: 40 } };
      let doc = addStickyNote(testDoc, stickyNote);
      doc = addRoom(doc, room);
      useEditorStore.getState().loadDocument(doc);

      useEditorStore.getState().startStickyNoteLinkDrag(stickyNote.id, 10, 20);
      useEditorStore.getState().updateStickyNoteLinkDrag(30, 40);
      expect(useEditorStore.getState().stickyNoteLinkDrag).toMatchObject({ cursorX: 30, cursorY: 40 });
      useEditorStore.getState().completeStickyNoteLinkDrag(room.id);
      expect(Object.values(useEditorStore.getState().doc!.stickyNoteLinks)).toHaveLength(1);

      useEditorStore.getState().setSelection(['room-1'], [stickyNote.id], [], []);
      useEditorStore.getState().startStickyNoteDrag(stickyNote.id);
      useEditorStore.getState().updateStickyNoteDrag(15, 25);
      expect(useEditorStore.getState().selectionDrag).toMatchObject({
        roomIds: ['room-1'],
        stickyNoteIds: [stickyNote.id],
        dx: 15,
        dy: 25,
      });
      useEditorStore.getState().endStickyNoteDrag();
      expect(useEditorStore.getState().selectionDrag).toBeNull();
    });

    it('gracefully clears drag state when sticky note link completion occurs without a document or drag', () => {
      useEditorStore.getState().completeStickyNoteLinkDrag('room-1');
      expect(useEditorStore.getState().stickyNoteLinkDrag).toBeNull();

      useEditorStore.getState().startStickyNoteLinkDrag('note-1', 0, 0);
      resetStore();
      useEditorStore.getState().completeStickyNoteLinkDrag('room-1');
      expect(useEditorStore.getState().stickyNoteLinkDrag).toBeNull();
    });

    it('tracks and commits export regions', () => {
      useEditorStore.getState().beginExportRegion({ x: 100, y: 80 });
      useEditorStore.getState().updateExportRegion({ x: 20, y: 140 });
      expect(useEditorStore.getState().exportRegionDraft).toEqual({
        start: { x: 100, y: 80 },
        current: { x: 20, y: 140 },
      });

      useEditorStore.getState().commitExportRegion();
      expect(useEditorStore.getState().exportRegion).toEqual({
        left: 20,
        top: 80,
        right: 100,
        bottom: 140,
      });

      useEditorStore.getState().clearExportRegion();
      useEditorStore.getState().updateExportRegion({ x: 1, y: 2 });
      useEditorStore.getState().commitExportRegion();
      expect(useEditorStore.getState().exportRegion).toBeNull();
    });

    it('covers additional drawing and background layer branches', () => {
      useEditorStore.getState().setSelection(['room-1'], ['note-1'], ['conn-1'], ['link-1']);
      useEditorStore.getState().setDrawingSize(20);
      useEditorStore.getState().setDrawingTool('pencil');
      useEditorStore.getState().setDrawingFillColor('#abcdef');
      useEditorStore.getState().setCanvasInteractionMode('draw');
      expect(useEditorStore.getState().drawingToolState.size).toBe(6);
      expect(useEditorStore.getState().drawingToolState.fillColorRgbHex).toBe('#abcdef');
      expect(useEditorStore.getState().selectedRoomIds).toEqual([]);

      useEditorStore.getState().loadDocument(testDoc);
      const createdLayerId = useEditorStore.getState().ensureDefaultBackgroundLayer();
      expect(useEditorStore.getState().doc?.background.layers[createdLayerId]).toBeDefined();
      expect(useEditorStore.getState().ensureDefaultBackgroundLayer()).toBe(createdLayerId);

      useEditorStore.getState().beginBackgroundStroke(createdLayerId);
      useEditorStore.getState().commitBackgroundStroke({
        kind: 'background-stroke',
        mapId: testDoc.metadata.id,
        layerId: createdLayerId,
        chunks: [],
      });
      expect(useEditorStore.getState().backgroundRevision).toBe(1);
      expect(useEditorStore.getState().activeStroke).toBeNull();
    });
  });
});
