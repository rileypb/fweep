import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MapCanvas } from '../../src/components/map-canvas';
import { useEditorStore } from '../../src/state/editor-store';
import { createEmptyMap } from '../../src/domain/map-types';
import { addRoom, addConnection } from '../../src/domain/map-operations';
import { createRoom, createConnection } from '../../src/domain/map-types';

function resetStore(): void {
  useEditorStore.setState(useEditorStore.getInitialState());
}

describe('MapCanvas', () => {
  beforeEach(() => {
    resetStore();
  });

  it('renders a canvas container', () => {
    render(<MapCanvas mapName="Test Map" />);
    expect(screen.getByTestId('map-canvas')).toBeInTheDocument();
  });

  it('displays the map name', () => {
    render(<MapCanvas mapName="My Adventure" />);
    expect(screen.getByText('My Adventure')).toBeInTheDocument();
  });

  it('shows the background grid by default', () => {
    render(<MapCanvas mapName="Test" />);
    const canvas = screen.getByTestId('map-canvas');
    expect(canvas).toHaveClass('map-canvas--grid');
  });

  it('hides the background grid when showGrid is false', () => {
    render(<MapCanvas mapName="Test" showGrid={false} />);
    const canvas = screen.getByTestId('map-canvas');
    expect(canvas).not.toHaveClass('map-canvas--grid');
  });

  it('provides a button to toggle the grid on and off', async () => {
    const user = userEvent.setup();
    render(<MapCanvas mapName="Test" />);

    const canvas = screen.getByTestId('map-canvas');
    expect(canvas).toHaveClass('map-canvas--grid');

    const toggleBtn = screen.getByRole('button', { name: /toggle grid/i });
    await user.click(toggleBtn);

    expect(canvas).not.toHaveClass('map-canvas--grid');

    await user.click(toggleBtn);
    expect(canvas).toHaveClass('map-canvas--grid');
  });

  /* ---- Room rendering ---- */

  describe('room rendering', () => {
    it('renders room nodes from the editor store', () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const docWithRoom = addRoom(doc, room);
      useEditorStore.getState().loadDocument(docWithRoom);

      render(<MapCanvas mapName="Test" />);

      expect(screen.getByText('Kitchen')).toBeInTheDocument();
    });

    it('positions room nodes using CSS transform', () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const docWithRoom = addRoom(doc, room);
      useEditorStore.getState().loadDocument(docWithRoom);

      render(<MapCanvas mapName="Test" />);

      const roomNode = screen.getByText('Kitchen').closest('[data-testid="room-node"]') as HTMLElement;
      expect(roomNode).toBeInTheDocument();
      expect(roomNode.style.transform).toBe('translate(80px, 120px)');
    });

    it('renders multiple rooms', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 0, y: 0 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 120, y: 0 } };
      let d = addRoom(doc, kitchen);
      d = addRoom(d, hallway);
      useEditorStore.getState().loadDocument(d);

      render(<MapCanvas mapName="Test" />);

      expect(screen.getByText('Kitchen')).toBeInTheDocument();
      expect(screen.getByText('Hallway')).toBeInTheDocument();
    });

    it('renders no room nodes when document has no rooms', () => {
      const doc = createEmptyMap('Test');
      useEditorStore.getState().loadDocument(doc);

      render(<MapCanvas mapName="Test" />);

      expect(screen.queryAllByTestId('room-node')).toHaveLength(0);
    });
  });

  /* ---- Shift+click to create room ---- */

  describe('Shift+click to create room', () => {
    it('creates a room with an empty name and shows an input on Shift+click', () => {
      const doc = createEmptyMap('Test');
      useEditorStore.getState().loadDocument(doc);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.click(canvas, { shiftKey: true, clientX: 200, clientY: 300 });

      // A room should have been created
      const rooms = Object.values(useEditorStore.getState().doc!.rooms);
      expect(rooms).toHaveLength(1);
      expect(rooms[0].name).toBe('');

      // An inline input should be visible with focus
      const input = screen.getByRole('textbox', { name: /room name/i });
      expect(input).toBeInTheDocument();
      expect(document.activeElement).toBe(input);
    });

    it('does not create a room on normal click (no Shift)', () => {
      const doc = createEmptyMap('Test');
      useEditorStore.getState().loadDocument(doc);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.click(canvas, { shiftKey: false, clientX: 200, clientY: 300 });

      expect(Object.values(useEditorStore.getState().doc!.rooms)).toHaveLength(0);
      expect(screen.queryByRole('textbox', { name: /room name/i })).not.toBeInTheDocument();
    });

    it('snaps the room position to the grid', () => {
      const doc = createEmptyMap('Test');
      useEditorStore.getState().loadDocument(doc);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.click(canvas, { shiftKey: true, clientX: 55, clientY: 85 });

      const rooms = Object.values(useEditorStore.getState().doc!.rooms);
      expect(rooms[0].position).toEqual({ x: 40, y: 80 });
    });

    it('commits the name on Enter and hides the input', async () => {
      const user = userEvent.setup();
      const doc = createEmptyMap('Test');
      useEditorStore.getState().loadDocument(doc);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.click(canvas, { shiftKey: true, clientX: 100, clientY: 100 });

      const input = screen.getByRole('textbox', { name: /room name/i });
      await user.type(input, 'Kitchen{Enter}');

      // Name should be committed
      const rooms = Object.values(useEditorStore.getState().doc!.rooms);
      expect(rooms[0].name).toBe('Kitchen');

      // Input should be gone, label should be visible
      expect(screen.queryByRole('textbox', { name: /room name/i })).not.toBeInTheDocument();
      expect(screen.getByText('Kitchen')).toBeInTheDocument();
    });

    it('commits the name on blur', async () => {
      const user = userEvent.setup();
      const doc = createEmptyMap('Test');
      useEditorStore.getState().loadDocument(doc);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.click(canvas, { shiftKey: true, clientX: 100, clientY: 100 });

      const input = screen.getByRole('textbox', { name: /room name/i });
      await user.type(input, 'Hallway');
      fireEvent.blur(input);

      const rooms = Object.values(useEditorStore.getState().doc!.rooms);
      expect(rooms[0].name).toBe('Hallway');
      expect(screen.queryByRole('textbox', { name: /room name/i })).not.toBeInTheDocument();
    });

    it('deletes the room if the name is left empty on Enter', async () => {
      const user = userEvent.setup();
      const doc = createEmptyMap('Test');
      useEditorStore.getState().loadDocument(doc);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.click(canvas, { shiftKey: true, clientX: 100, clientY: 100 });

      const input = screen.getByRole('textbox', { name: /room name/i });
      await user.type(input, '{Enter}');

      expect(Object.values(useEditorStore.getState().doc!.rooms)).toHaveLength(0);
    });

    it('deletes the room if the name is left empty on blur', () => {
      const doc = createEmptyMap('Test');
      useEditorStore.getState().loadDocument(doc);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.click(canvas, { shiftKey: true, clientX: 100, clientY: 100 });

      const input = screen.getByRole('textbox', { name: /room name/i });
      fireEvent.blur(input);

      expect(Object.values(useEditorStore.getState().doc!.rooms)).toHaveLength(0);
    });

    it('cancels editing and deletes the room on Escape', async () => {
      const user = userEvent.setup();
      const doc = createEmptyMap('Test');
      useEditorStore.getState().loadDocument(doc);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.click(canvas, { shiftKey: true, clientX: 100, clientY: 100 });

      const input = screen.getByRole('textbox', { name: /room name/i });
      await user.type(input, 'Kitchen{Escape}');

      expect(Object.values(useEditorStore.getState().doc!.rooms)).toHaveLength(0);
      expect(screen.queryByRole('textbox', { name: /room name/i })).not.toBeInTheDocument();
    });
  });

  /* ---- Directional handles on hover ---- */

  describe('directional handles', () => {
    const DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

    function setupRoomAndHover() {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const docWithRoom = addRoom(doc, room);
      useEditorStore.getState().loadDocument(docWithRoom);

      render(<MapCanvas mapName="Test" />);

      const roomNode = screen.getByTestId('room-node');
      fireEvent.mouseEnter(roomNode);
      return roomNode;
    }

    it('shows 8 directional handles when hovering over a room', () => {
      setupRoomAndHover();

      const handles = screen.getAllByTestId(/^direction-handle-/);
      expect(handles).toHaveLength(8);
    });

    it.each(DIRECTIONS)('shows a handle for the %s direction', (dir) => {
      setupRoomAndHover();

      expect(screen.getByTestId(`direction-handle-${dir}`)).toBeInTheDocument();
    });

    it('hides directional handles when the mouse leaves the room', () => {
      const roomNode = setupRoomAndHover();

      // Handles should be visible
      expect(screen.getAllByTestId(/^direction-handle-/)).toHaveLength(8);

      fireEvent.mouseLeave(roomNode);

      expect(screen.queryAllByTestId(/^direction-handle-/)).toHaveLength(0);
    });

    it('does not show directional handles before hover', () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const docWithRoom = addRoom(doc, room);
      useEditorStore.getState().loadDocument(docWithRoom);

      render(<MapCanvas mapName="Test" />);

      expect(screen.queryAllByTestId(/^direction-handle-/)).toHaveLength(0);
    });

    it('does not show directional handles while editing a room name', () => {
      const doc = createEmptyMap('Test');
      useEditorStore.getState().loadDocument(doc);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.click(canvas, { shiftKey: true, clientX: 100, clientY: 100 });

      // Room is in editing mode — hover over the node
      const roomNode = screen.getByTestId('room-node');
      fireEvent.mouseEnter(roomNode);

      expect(screen.queryAllByTestId(/^direction-handle-/)).toHaveLength(0);
    });
  });

  /* ---- Drag to move room ---- */

  describe('drag to move room', () => {
    function setupDraggableRoom(x = 80, y = 120) {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x, y } };
      const docWithRoom = addRoom(doc, room);
      useEditorStore.getState().loadDocument(docWithRoom);

      render(<MapCanvas mapName="Test" />);

      return { roomId: room.id, roomNode: screen.getByTestId('room-node') };
    }

    it('moves the room position on drag', () => {
      const { roomId, roomNode } = setupDraggableRoom(80, 120);

      // Start drag at (100, 140) — offset (20, 20) into the node
      fireEvent.mouseDown(roomNode, { clientX: 100, clientY: 140, button: 0 });
      // Move 60px right, 40px down
      fireEvent.mouseMove(document, { clientX: 160, clientY: 180 });
      fireEvent.mouseUp(document, { clientX: 160, clientY: 180 });

      const room = useEditorStore.getState().doc!.rooms[roomId];
      // New position = old (80,120) + delta (60,40) = (140,160), snapped to grid (40px)
      expect(room.position).toEqual({ x: 160, y: 160 });
    });

    it('updates the visual position during drag', () => {
      const { roomNode } = setupDraggableRoom(80, 120);

      fireEvent.mouseDown(roomNode, { clientX: 100, clientY: 140, button: 0 });
      fireEvent.mouseMove(document, { clientX: 130, clientY: 160 });

      // During drag, position should update visually (via style)
      expect(roomNode.style.transform).toContain('translate(');

      fireEvent.mouseUp(document, { clientX: 130, clientY: 160 });
    });

    it('does not start drag on right-click', () => {
      const { roomId, roomNode } = setupDraggableRoom(80, 120);

      fireEvent.mouseDown(roomNode, { clientX: 100, clientY: 140, button: 2 });
      fireEvent.mouseMove(document, { clientX: 200, clientY: 200 });
      fireEvent.mouseUp(document, { clientX: 200, clientY: 200 });

      const room = useEditorStore.getState().doc!.rooms[roomId];
      expect(room.position).toEqual({ x: 80, y: 120 });
    });

    it('does not drag while editing a room name', () => {
      const doc = createEmptyMap('Test');
      useEditorStore.getState().loadDocument(doc);

      render(<MapCanvas mapName="Test" />);

      // Create a room via Shift+click (enters editing mode)
      const canvas = screen.getByTestId('map-canvas');
      fireEvent.click(canvas, { shiftKey: true, clientX: 80, clientY: 120 });

      const roomNode = screen.getByTestId('room-node');
      fireEvent.mouseDown(roomNode, { clientX: 90, clientY: 130, button: 0 });
      fireEvent.mouseMove(document, { clientX: 200, clientY: 200 });
      fireEvent.mouseUp(document, { clientX: 200, clientY: 200 });

      // Room should still be at original snapped position
      const rooms = Object.values(useEditorStore.getState().doc!.rooms);
      expect(rooms[0].position).toEqual({ x: 80, y: 120 });
    });

    it('does not fire Shift+click room creation during drag', () => {
      setupDraggableRoom(80, 120);
      const roomNode = screen.getByTestId('room-node');

      // Start drag
      fireEvent.mouseDown(roomNode, { clientX: 100, clientY: 140, button: 0 });
      fireEvent.mouseMove(document, { clientX: 160, clientY: 180 });
      fireEvent.mouseUp(document, { clientX: 160, clientY: 180 });

      // Only the original room should exist
      expect(Object.values(useEditorStore.getState().doc!.rooms)).toHaveLength(1);
    });
  });

  /* ---- Connection drag from direction handles ---- */

  describe('connection drag', () => {
    function setupTwoRooms() {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 80, y: 0 } };
      let d = addRoom(doc, kitchen);
      d = addRoom(d, hallway);
      useEditorStore.getState().loadDocument(d);
      return { kitchenId: kitchen.id, hallwayId: hallway.id };
    }

    it('starts a connection drag on mousedown on a direction handle', () => {
      setupTwoRooms();
      render(<MapCanvas mapName="Test" />);

      // Hover over the Kitchen room to show handles
      const roomNodes = screen.getAllByTestId('room-node');
      const kitchenNode = roomNodes.find((n) => n.textContent === 'Kitchen')!;
      fireEvent.mouseEnter(kitchenNode);

      const handle = screen.getByTestId('direction-handle-n');
      fireEvent.mouseDown(handle, { clientX: 100, clientY: 200, button: 0 });

      const drag = useEditorStore.getState().connectionDrag;
      expect(drag).not.toBeNull();
      expect(drag!.sourceDirection).toBe('north');
    });

    it('shows an SVG preview polyline during connection drag', () => {
      setupTwoRooms();
      render(<MapCanvas mapName="Test" />);

      const roomNodes = screen.getAllByTestId('room-node');
      const kitchenNode = roomNodes.find((n) => n.textContent === 'Kitchen')!;
      fireEvent.mouseEnter(kitchenNode);

      const handle = screen.getByTestId('direction-handle-n');
      fireEvent.mouseDown(handle, { clientX: 100, clientY: 200, button: 0 });
      fireEvent.mouseMove(document, { clientX: 100, clientY: 50 });

      const previewLine = screen.getByTestId('connection-preview-line');
      expect(previewLine).toBeInTheDocument();
      expect(previewLine.tagName.toLowerCase()).toBe('polyline');
    });

    it('completes a connection when releasing on a different room', () => {
      const { kitchenId, hallwayId } = setupTwoRooms();
      render(<MapCanvas mapName="Test" />);

      // Start connection drag from Kitchen's north handle
      const roomNodes = screen.getAllByTestId('room-node');
      const kitchenNode = roomNodes.find((n) => n.textContent === 'Kitchen')!;
      fireEvent.mouseEnter(kitchenNode);

      const handle = screen.getByTestId('direction-handle-n');
      fireEvent.mouseDown(handle, { clientX: 100, clientY: 200, button: 0 });
      fireEvent.mouseMove(document, { clientX: 100, clientY: 10 });

      // Release on the Hallway room node (not on a handle — falls back to opposite)
      const hallwayNode = roomNodes.find((n) => n.textContent === 'Hallway')!;
      fireEvent.mouseUp(hallwayNode, { clientX: 100, clientY: 10 });

      // Connection should be created
      const doc = useEditorStore.getState().doc!;
      const connections = Object.values(doc.connections);
      expect(connections).toHaveLength(1);
      expect(connections[0].sourceRoomId).toBe(kitchenId);
      expect(connections[0].targetRoomId).toBe(hallwayId);
      expect(connections[0].isBidirectional).toBe(false);

      // Direction bindings — fallback to opposite
      expect(doc.rooms[kitchenId].directions['north']).toBe(connections[0].id);
      expect(doc.rooms[hallwayId].directions['south']).toBe(connections[0].id);

      // Drag state cleared
      expect(useEditorStore.getState().connectionDrag).toBeNull();
    });

    it('uses the target handle direction when dropping on a direction handle', () => {
      const { kitchenId, hallwayId } = setupTwoRooms();
      render(<MapCanvas mapName="Test" />);

      // Start connection drag from Kitchen's northeast handle
      const roomNodes = screen.getAllByTestId('room-node');
      const kitchenNode = roomNodes.find((n) => n.textContent === 'Kitchen')!;
      fireEvent.mouseEnter(kitchenNode);

      const srcHandle = screen.getByTestId('direction-handle-ne');
      fireEvent.mouseDown(srcHandle, { clientX: 100, clientY: 200, button: 0 });
      fireEvent.mouseMove(document, { clientX: 100, clientY: 10 });

      // Hover over Hallway to show its handles, then release on its west handle
      const hallwayNode = roomNodes.find((n) => n.textContent === 'Hallway')!;
      fireEvent.mouseEnter(hallwayNode);
      const tgtHandle = within(hallwayNode).getByTestId('direction-handle-w');
      fireEvent.mouseUp(tgtHandle, { clientX: 80, clientY: 10 });

      const doc = useEditorStore.getState().doc!;
      const connections = Object.values(doc.connections);
      expect(connections).toHaveLength(1);

      // Source room bound on northeast, target on west (not southwest)
      expect(doc.rooms[kitchenId].directions['northeast']).toBe(connections[0].id);
      expect(doc.rooms[hallwayId].directions['west']).toBe(connections[0].id);
    });

    it('creates a one-way self-connection when releasing on the same room body', () => {
      const { kitchenId } = setupTwoRooms();
      render(<MapCanvas mapName="Test" />);

      const roomNodes = screen.getAllByTestId('room-node');
      const kitchenNode = roomNodes.find((n) => n.textContent === 'Kitchen')!;
      fireEvent.mouseEnter(kitchenNode);

      const handle = screen.getByTestId('direction-handle-n');
      fireEvent.mouseDown(handle, { clientX: 100, clientY: 200, button: 0 });
      fireEvent.mouseMove(document, { clientX: 105, clientY: 205 });

      // Release on the same Kitchen node
      fireEvent.mouseUp(kitchenNode, { clientX: 105, clientY: 205 });

      const doc = useEditorStore.getState().doc!;
      const connections = Object.values(doc.connections);
      expect(connections).toHaveLength(1);
      expect(connections[0].sourceRoomId).toBe(kitchenId);
      expect(connections[0].targetRoomId).toBe(kitchenId);
      expect(connections[0].isBidirectional).toBe(false);
    });

    it('creates a bidirectional self-connection when releasing on another handle of the same room', () => {
      const { kitchenId } = setupTwoRooms();
      render(<MapCanvas mapName="Test" />);

      const roomNodes = screen.getAllByTestId('room-node');
      const kitchenNode = roomNodes.find((n) => n.textContent === 'Kitchen')!;
      fireEvent.mouseEnter(kitchenNode);

      const sourceHandle = within(kitchenNode).getByTestId('direction-handle-n');
      fireEvent.mouseDown(sourceHandle, { clientX: 100, clientY: 200, button: 0 });
      fireEvent.mouseMove(document, { clientX: 120, clientY: 205 });

      const targetHandle = within(kitchenNode).getByTestId('direction-handle-e');
      fireEvent.mouseUp(targetHandle, { clientX: 160, clientY: 218 });

      const doc = useEditorStore.getState().doc!;
      const connections = Object.values(doc.connections);
      expect(connections).toHaveLength(1);
      expect(connections[0].sourceRoomId).toBe(kitchenId);
      expect(connections[0].targetRoomId).toBe(kitchenId);
      expect(connections[0].isBidirectional).toBe(true);
      expect(doc.rooms[kitchenId].directions['north']).toBe(connections[0].id);
      expect(doc.rooms[kitchenId].directions['east']).toBe(connections[0].id);
    });

    it('cancels the drag when releasing on empty canvas', () => {
      setupTwoRooms();
      render(<MapCanvas mapName="Test" />);

      const roomNodes = screen.getAllByTestId('room-node');
      const kitchenNode = roomNodes.find((n) => n.textContent === 'Kitchen')!;
      fireEvent.mouseEnter(kitchenNode);

      const handle = screen.getByTestId('direction-handle-n');
      fireEvent.mouseDown(handle, { clientX: 100, clientY: 200, button: 0 });
      fireEvent.mouseMove(document, { clientX: 500, clientY: 500 });

      // Release on the canvas (not on a room)
      const canvas = screen.getByTestId('map-canvas');
      fireEvent.mouseUp(canvas, { clientX: 500, clientY: 500 });

      // No connection created
      const doc = useEditorStore.getState().doc!;
      expect(Object.values(doc.connections)).toHaveLength(0);
      expect(useEditorStore.getState().connectionDrag).toBeNull();
    });

    it('does not start a room drag when mousedown is on a direction handle', () => {
      const { kitchenId } = setupTwoRooms();
      render(<MapCanvas mapName="Test" />);

      const roomNodes = screen.getAllByTestId('room-node');
      const kitchenNode = roomNodes.find((n) => n.textContent === 'Kitchen')!;
      fireEvent.mouseEnter(kitchenNode);

      const handle = screen.getByTestId('direction-handle-n');
      fireEvent.mouseDown(handle, { clientX: 100, clientY: 200, button: 0 });
      fireEvent.mouseMove(document, { clientX: 200, clientY: 300 });
      fireEvent.mouseUp(document, { clientX: 200, clientY: 300 });

      // Room position should not have changed
      const room = useEditorStore.getState().doc!.rooms[kitchenId];
      expect(room.position).toEqual({ x: 80, y: 200 });
    });

    it('hides preview line after completing a connection', () => {
      setupTwoRooms();
      render(<MapCanvas mapName="Test" />);

      const roomNodes = screen.getAllByTestId('room-node');
      const kitchenNode = roomNodes.find((n) => n.textContent === 'Kitchen')!;
      fireEvent.mouseEnter(kitchenNode);

      const handle = screen.getByTestId('direction-handle-n');
      fireEvent.mouseDown(handle, { clientX: 100, clientY: 200, button: 0 });
      fireEvent.mouseMove(document, { clientX: 100, clientY: 10 });

      const hallwayNode = roomNodes.find((n) => n.textContent === 'Hallway')!;
      fireEvent.mouseUp(hallwayNode, { clientX: 100, clientY: 10 });

      expect(screen.queryByTestId('connection-preview-line')).not.toBeInTheDocument();
    });
  });

  /* ---- Connection rendering ---- */

  describe('connection rendering', () => {
    it('renders a polyline for an existing bidirectional connection', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 80, y: 0 } };
      let d = addRoom(doc, kitchen);
      d = addRoom(d, hallway);
      const conn = createConnection(kitchen.id, hallway.id, true);
      d = addConnection(d, conn, 'north', 'south');
      useEditorStore.getState().loadDocument(d);

      render(<MapCanvas mapName="Test" />);

      const connectionLine = screen.getByTestId(`connection-line-${conn.id}`);
      expect(connectionLine).toBeInTheDocument();
      expect(connectionLine.tagName.toLowerCase()).toBe('polyline');
    });

    it('does not render an arrowhead for a bidirectional connection', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 80, y: 0 } };
      let d = addRoom(doc, kitchen);
      d = addRoom(d, hallway);
      const conn = createConnection(kitchen.id, hallway.id, true);
      d = addConnection(d, conn, 'north', 'south');
      useEditorStore.getState().loadDocument(d);

      render(<MapCanvas mapName="Test" />);

      const connectionLine = screen.getByTestId(`connection-line-${conn.id}`);
      expect(connectionLine.getAttribute('marker-end')).toBeNull();
      expect(screen.queryByTestId(`connection-arrow-${conn.id}-0`)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`connection-arrow-${conn.id}-1`)).not.toBeInTheDocument();
    });

    it('renders two arrowhead polygons for a one-way connection', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 80, y: 0 } };
      let d = addRoom(doc, kitchen);
      d = addRoom(d, hallway);
      const conn = createConnection(kitchen.id, hallway.id, false);
      d = addConnection(d, conn, 'north');
      useEditorStore.getState().loadDocument(d);

      render(<MapCanvas mapName="Test" />);

      const connectionLine = screen.getByTestId(`connection-line-${conn.id}`);
      expect(connectionLine.getAttribute('marker-end')).toBeNull();
      const connectionArrowA = screen.getByTestId(`connection-arrow-${conn.id}-0`);
      const connectionArrowB = screen.getByTestId(`connection-arrow-${conn.id}-1`);
      expect(connectionArrowA.tagName.toLowerCase()).toBe('polygon');
      expect(connectionArrowB.tagName.toLowerCase()).toBe('polygon');
      expect(connectionArrowA.getAttribute('points')).toBe('120,120 125,132 115,132');
      expect(connectionArrowB.getAttribute('points')).toBe('120,66 125,78 115,78');
    });

    it('draws a one-way connection to the target room center without a target stub', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 80, y: 0 } };
      let d = addRoom(doc, kitchen);
      d = addRoom(d, hallway);
      const conn = createConnection(kitchen.id, hallway.id, false);
      d = addConnection(d, conn, 'north', 'south');
      useEditorStore.getState().loadDocument(d);

      render(<MapCanvas mapName="Test" />);

      const connectionLine = screen.getByTestId(`connection-line-${conn.id}`);
      expect(connectionLine.getAttribute('points')).toBe('120,200 120,180 120,18');
    });

    it('renders a self-connection as a polyline element', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      let d = addRoom(doc, kitchen);
      const conn = createConnection(kitchen.id, kitchen.id, false);
      d = addConnection(d, conn, 'north');
      useEditorStore.getState().loadDocument(d);

      render(<MapCanvas mapName="Test" />);

      const connectionPath = screen.getByTestId(`connection-line-${conn.id}`);
      expect(connectionPath).toBeInTheDocument();
      expect(connectionPath.tagName.toLowerCase()).toBe('polyline');
    });

    it('renders a bidirectional self-connection using distinct source and target handles', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      let d = addRoom(doc, kitchen);
      const conn = createConnection(kitchen.id, kitchen.id, true);
      d = addConnection(d, conn, 'north', 'east');
      useEditorStore.getState().loadDocument(d);

      render(<MapCanvas mapName="Test" />);

      const connectionPath = screen.getByTestId(`connection-line-${conn.id}`);
      expect(connectionPath.getAttribute('points')).toBe('120,200 120,180 180,218 160,218');
    });

    it('updates connection lines in real time during room drag', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 80, y: 0 } };
      let d = addRoom(doc, kitchen);
      d = addRoom(d, hallway);
      const conn = createConnection(kitchen.id, hallway.id, true);
      d = addConnection(d, conn, 'north', 'south');
      useEditorStore.getState().loadDocument(d);

      render(<MapCanvas mapName="Test" />);

      const connectionLine = screen.getByTestId(`connection-line-${conn.id}`);
      const pointsBefore = connectionLine.getAttribute('points');

      // Start dragging kitchen
      const roomNodes = screen.getAllByTestId('room-node');
      const kitchenNode = roomNodes.find((n) => n.textContent === 'Kitchen')!;
      fireEvent.mouseDown(kitchenNode, { clientX: 100, clientY: 210, button: 0 });
      fireEvent.mouseMove(document, { clientX: 200, clientY: 310 });

      // Connection points should have changed
      const pointsDuring = connectionLine.getAttribute('points');
      expect(pointsDuring).not.toBe(pointsBefore);

      fireEvent.mouseUp(document, { clientX: 200, clientY: 310 });
    });
  });
});
