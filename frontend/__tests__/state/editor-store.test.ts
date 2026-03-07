import { describe, it, expect, beforeEach } from '@jest/globals';
import { createEmptyMap, createRoom } from '../../src/domain/map-types';
import type { MapDocument, Position } from '../../src/domain/map-types';
import { addRoom } from '../../src/domain/map-operations';
import { useEditorStore } from '../../src/state/editor-store';

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
  });

  /* ---- unloadDocument ---- */

  describe('unloadDocument', () => {
    it('clears the active document', () => {
      useEditorStore.getState().loadDocument(testDoc);
      useEditorStore.getState().unloadDocument();
      expect(useEditorStore.getState().doc).toBeNull();
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
  });

  /* ---- editingRoomId ---- */

  describe('editingRoomId', () => {
    it('starts as null', () => {
      expect(useEditorStore.getState().editingRoomId).toBeNull();
    });

    it('can be set and cleared', () => {
      useEditorStore.getState().setEditingRoomId('r1');
      expect(useEditorStore.getState().editingRoomId).toBe('r1');

      useEditorStore.getState().clearEditingRoomId();
      expect(useEditorStore.getState().editingRoomId).toBeNull();
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
      expect(conn.targetRoomId).toBe(hallwayId);
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
      expect(conn.targetRoomId).toBe(kitchenId);
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
      expect(conn.targetRoomId).toBe(kitchenId);
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
  });

  /* ---- room drag ---- */

  describe('room drag', () => {
    it('starts with roomDrag as null', () => {
      expect(useEditorStore.getState().roomDrag).toBeNull();
    });

    it('startRoomDrag sets the drag state with zero offset', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const roomId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 80, y: 120 });
      useEditorStore.getState().startRoomDrag(roomId);

      expect(useEditorStore.getState().roomDrag).toEqual({ roomId, dx: 0, dy: 0 });
    });

    it('updateRoomDrag updates the offset', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const roomId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 80, y: 120 });
      useEditorStore.getState().startRoomDrag(roomId);
      useEditorStore.getState().updateRoomDrag(30, 40);

      expect(useEditorStore.getState().roomDrag).toEqual({ roomId, dx: 30, dy: 40 });
    });

    it('endRoomDrag clears the drag state', () => {
      useEditorStore.getState().loadDocument(testDoc);
      const roomId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 80, y: 120 });
      useEditorStore.getState().startRoomDrag(roomId);
      useEditorStore.getState().endRoomDrag();

      expect(useEditorStore.getState().roomDrag).toBeNull();
    });
  });
});
