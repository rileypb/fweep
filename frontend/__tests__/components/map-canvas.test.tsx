import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MapCanvas } from '../../src/components/map-canvas';
import { useEditorStore } from '../../src/state/editor-store';
import { createEmptyMap } from '../../src/domain/map-types';
import { addRoom, addConnection } from '../../src/domain/map-operations';
import { createRoom, createConnection } from '../../src/domain/map-types';
import { getHandleOffset, ROOM_HEIGHT, ROOM_WIDTH } from '../../src/graph/connection-geometry';

function resetStore(): void {
  useEditorStore.setState(useEditorStore.getInitialState());
}

describe('MapCanvas', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    resetStore();
  });

  afterEach(() => {
    jest.restoreAllMocks();
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

  describe('map panning', () => {
    it('pans the map when middle-dragging empty canvas space', () => {
      const doc = createEmptyMap('Test');
      useEditorStore.getState().loadDocument(doc);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      const content = screen.getByTestId('map-canvas-content');

      fireEvent.mouseDown(canvas, { clientX: 100, clientY: 120, button: 1 });
      fireEvent.mouseMove(document, { clientX: 160, clientY: 180 });

      expect(content.style.transform).toBe('translate(60px, 60px)');
      expect(canvas).toHaveClass('map-canvas--panning');

      fireEvent.mouseUp(document, { clientX: 160, clientY: 180 });
      expect(canvas).not.toHaveClass('map-canvas--panning');
    });

    it('creates rooms in map coordinates after panning', () => {
      const doc = createEmptyMap('Test');
      useEditorStore.getState().loadDocument(doc);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');

      fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100, button: 1 });
      fireEvent.mouseMove(document, { clientX: 180, clientY: 140 });
      fireEvent.mouseUp(document, { clientX: 180, clientY: 140 });

      fireEvent.click(canvas, { shiftKey: true, clientX: 120, clientY: 120 });

      const rooms = Object.values(useEditorStore.getState().doc!.rooms);
      expect(rooms).toHaveLength(1);
      expect(rooms[0].position).toEqual({ x: 40, y: 80 });
    });

    it('clicking the map background clears the room selection', () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      useEditorStore.getState().loadDocument(addRoom(doc, room));
      useEditorStore.getState().selectRoom(room.id);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.click(canvas, { clientX: 20, clientY: 20, button: 0 });

      expect(useEditorStore.getState().selectedRoomIds).toEqual([]);
      expect(screen.queryByTestId('room-selection-outline')).not.toBeInTheDocument();
    });

    it('does not pan on left mouse drag over empty canvas', () => {
      const doc = createEmptyMap('Test');
      useEditorStore.getState().loadDocument(doc);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      const content = screen.getByTestId('map-canvas-content');

      fireEvent.mouseDown(canvas, { clientX: 100, clientY: 120, button: 0 });
      fireEvent.mouseMove(document, { clientX: 160, clientY: 180 });
      fireEvent.mouseUp(document, { clientX: 160, clientY: 180 });

      expect(content.style.transform).toBe('translate(0px, 0px)');
      expect(canvas).not.toHaveClass('map-canvas--panning');
    });

    it('draws a red selection box while dragging on the background', () => {
      const doc = createEmptyMap('Test');
      useEditorStore.getState().loadDocument(doc);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.mouseDown(canvas, { clientX: 40, clientY: 50, button: 0 });
      fireEvent.mouseMove(document, { clientX: 140, clientY: 130 });

      const selectionBox = screen.getByTestId('map-canvas-selection-box');
      expect(selectionBox).toHaveStyle({
        left: '40px',
        top: '50px',
        width: '100px',
        height: '80px',
      });

      fireEvent.mouseUp(document, { clientX: 140, clientY: 130, button: 0 });
      expect(screen.queryByTestId('map-canvas-selection-box')).not.toBeInTheDocument();
    });

    it('selects rooms live as they enter the marquee selection region', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 240, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      useEditorStore.getState().loadDocument(updated);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      const kitchenNode = screen.getByText('Kitchen').closest('[data-testid="room-node"]') as HTMLElement;
      const hallwayNode = screen.getByText('Hallway').closest('[data-testid="room-node"]') as HTMLElement;

      fireEvent.mouseDown(canvas, { clientX: 20, clientY: 20, button: 0 });
      fireEvent.mouseMove(document, { clientX: 150, clientY: 150 });

      expect(within(kitchenNode).getByTestId('room-selection-outline')).toBeInTheDocument();
      expect(within(hallwayNode).queryByTestId('room-selection-outline')).not.toBeInTheDocument();

      fireEvent.mouseMove(document, { clientX: 320, clientY: 170 });

      expect(within(kitchenNode).getByTestId('room-selection-outline')).toBeInTheDocument();
      expect(within(hallwayNode).getByTestId('room-selection-outline')).toBeInTheDocument();
      expect(useEditorStore.getState().selectedRoomIds).toEqual([kitchen.id, hallway.id]);

      fireEvent.mouseUp(document, { clientX: 320, clientY: 170, button: 0 });
    });
  });

  /* ---- Room rendering ---- */

  describe('room rendering', () => {
    function setupTwoRooms() {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 200, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      useEditorStore.getState().loadDocument(updated);

      render(<MapCanvas mapName="Test" />);

      return {
        kitchenNode: screen.getByText('Kitchen').closest('[data-testid="room-node"]') as HTMLElement,
        hallwayNode: screen.getByText('Hallway').closest('[data-testid="room-node"]') as HTMLElement,
      };
    }

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

    it('single-clicking a room does not open a room name textbox', () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      useEditorStore.getState().loadDocument(addRoom(doc, room));

      render(<MapCanvas mapName="Test" />);

      const roomNode = screen.getByText('Kitchen').closest('[data-testid="room-node"]') as HTMLElement;
      fireEvent.mouseDown(roomNode, { clientX: 100, clientY: 140, button: 0 });
      fireEvent.mouseUp(document, { clientX: 100, clientY: 140 });

      expect(screen.queryByRole('textbox', { name: /room name/i })).not.toBeInTheDocument();
      expect(screen.getByText('Kitchen')).toBeInTheDocument();
    });

    it('preserves a non-rectangular room shape after single-clicking the room', () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), shape: 'diamond' as const, position: { x: 80, y: 120 } };
      useEditorStore.getState().loadDocument(addRoom(doc, room));

      render(<MapCanvas mapName="Test" />);

      const roomNode = screen.getByText('Kitchen').closest('[data-testid="room-node"]') as HTMLElement;
      fireEvent.mouseDown(roomNode, { clientX: 100, clientY: 140, button: 0 });
      fireEvent.mouseUp(document, { clientX: 100, clientY: 140 });

      expect(screen.getByTestId('room-node').querySelector('polygon.room-node-shape')).not.toBeNull();
      expect(screen.queryByRole('textbox', { name: /room name/i })).not.toBeInTheDocument();
    });

    it('single-clicking a room selects it and clears any previous selection', () => {
      const { kitchenNode, hallwayNode } = setupTwoRooms();

      fireEvent.mouseDown(kitchenNode, { clientX: 100, clientY: 140, button: 0 });
      fireEvent.mouseUp(document, { clientX: 100, clientY: 140, button: 0 });

      expect(within(kitchenNode).getByTestId('room-selection-outline')).toBeInTheDocument();
      expect(within(hallwayNode).queryByTestId('room-selection-outline')).not.toBeInTheDocument();

      fireEvent.mouseDown(hallwayNode, { clientX: 220, clientY: 140, button: 0 });
      fireEvent.mouseUp(document, { clientX: 220, clientY: 140, button: 0 });

      expect(within(kitchenNode).queryByTestId('room-selection-outline')).not.toBeInTheDocument();
      expect(within(hallwayNode).getByTestId('room-selection-outline')).toBeInTheDocument();
      expect(useEditorStore.getState().selectedRoomIds).toEqual([hallwayNode.dataset.roomId]);
    });

    it('shift-clicking a room adds it to the selection', () => {
      const { kitchenNode, hallwayNode } = setupTwoRooms();

      fireEvent.mouseDown(kitchenNode, { clientX: 100, clientY: 140, button: 0 });
      fireEvent.mouseUp(document, { clientX: 100, clientY: 140, button: 0 });

      fireEvent.mouseDown(hallwayNode, { clientX: 220, clientY: 140, button: 0, shiftKey: true });
      fireEvent.mouseUp(document, { clientX: 220, clientY: 140, button: 0, shiftKey: true });

      expect(within(kitchenNode).getByTestId('room-selection-outline')).toBeInTheDocument();
      expect(within(hallwayNode).getByTestId('room-selection-outline')).toBeInTheDocument();
      expect(useEditorStore.getState().selectedRoomIds).toEqual([
        kitchenNode.dataset.roomId,
        hallwayNode.dataset.roomId,
      ]);
    });

    it('deletes every selected room when Delete is pressed on the canvas', () => {
      const { kitchenNode, hallwayNode } = setupTwoRooms();
      const canvas = screen.getByTestId('map-canvas');

      fireEvent.mouseDown(kitchenNode, { clientX: 100, clientY: 140, button: 0 });
      fireEvent.mouseUp(document, { clientX: 100, clientY: 140, button: 0 });

      fireEvent.mouseDown(hallwayNode, { clientX: 220, clientY: 140, button: 0, shiftKey: true });
      fireEvent.mouseUp(document, { clientX: 220, clientY: 140, button: 0, shiftKey: true });

      fireEvent.keyDown(canvas, { key: 'Delete' });

      expect(useEditorStore.getState().selectedRoomIds).toEqual([]);
      expect(Object.keys(useEditorStore.getState().doc!.rooms)).toHaveLength(0);
      expect(screen.queryAllByTestId('room-node')).toHaveLength(0);
    });

    it('deletes every selected room when Backspace is pressed on the canvas', () => {
      const { kitchenNode, hallwayNode } = setupTwoRooms();
      const canvas = screen.getByTestId('map-canvas');

      fireEvent.mouseDown(kitchenNode, { clientX: 100, clientY: 140, button: 0 });
      fireEvent.mouseUp(document, { clientX: 100, clientY: 140, button: 0 });

      fireEvent.mouseDown(hallwayNode, { clientX: 220, clientY: 140, button: 0, shiftKey: true });
      fireEvent.mouseUp(document, { clientX: 220, clientY: 140, button: 0, shiftKey: true });

      fireEvent.keyDown(canvas, { key: 'Backspace' });

      expect(useEditorStore.getState().selectedRoomIds).toEqual([]);
      expect(Object.keys(useEditorStore.getState().doc!.rooms)).toHaveLength(0);
      expect(screen.queryAllByTestId('room-node')).toHaveLength(0);
    });

    it('moves selection to the nearest room on the right when ArrowRight is pressed', () => {
      const doc = createEmptyMap('Test');
      const origin = { ...createRoom('Origin'), position: { x: 80, y: 120 } };
      const right = { ...createRoom('Right'), position: { x: 220, y: 120 } };
      const downRight = { ...createRoom('Down Right'), position: { x: 200, y: 240 } };
      let updated = addRoom(doc, origin);
      updated = addRoom(updated, right);
      updated = addRoom(updated, downRight);
      useEditorStore.getState().loadDocument(updated);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      const originNode = screen.getByText('Origin').closest('[data-testid="room-node"]') as HTMLElement;

      fireEvent.mouseDown(originNode, { clientX: 100, clientY: 140, button: 0 });
      fireEvent.mouseUp(document, { clientX: 100, clientY: 140, button: 0 });

      fireEvent.keyDown(canvas, { key: 'ArrowRight' });

      expect(useEditorStore.getState().selectedRoomIds).toEqual([right.id]);
    });

    it('moves selection to the nearest room above when ArrowUp is pressed', () => {
      const doc = createEmptyMap('Test');
      const origin = { ...createRoom('Origin'), position: { x: 200, y: 220 } };
      const up = { ...createRoom('Up'), position: { x: 200, y: 40 } };
      const upLeft = { ...createRoom('Up Left'), position: { x: 80, y: 80 } };
      let updated = addRoom(doc, origin);
      updated = addRoom(updated, up);
      updated = addRoom(updated, upLeft);
      useEditorStore.getState().loadDocument(updated);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      const originNode = screen.getByText('Origin').closest('[data-testid="room-node"]') as HTMLElement;

      fireEvent.mouseDown(originNode, { clientX: 220, clientY: 240, button: 0 });
      fireEvent.mouseUp(document, { clientX: 220, clientY: 240, button: 0 });

      fireEvent.keyDown(canvas, { key: 'ArrowUp' });

      expect(useEditorStore.getState().selectedRoomIds).toEqual([up.id]);
    });

    it('keeps the current selection when no room exists in that direction', () => {
      const doc = createEmptyMap('Test');
      const origin = { ...createRoom('Origin'), position: { x: 80, y: 120 } };
      const right = { ...createRoom('Right'), position: { x: 220, y: 120 } };
      let updated = addRoom(doc, origin);
      updated = addRoom(updated, right);
      useEditorStore.getState().loadDocument(updated);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      const originNode = screen.getByText('Origin').closest('[data-testid="room-node"]') as HTMLElement;

      fireEvent.mouseDown(originNode, { clientX: 100, clientY: 140, button: 0 });
      fireEvent.mouseUp(document, { clientX: 100, clientY: 140, button: 0 });

      fireEvent.keyDown(canvas, { key: 'ArrowLeft' });

      expect(useEditorStore.getState().selectedRoomIds).toEqual([origin.id]);
    });

    it('draws the selected room outline as a bright red rounded rectangle', () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      useEditorStore.getState().loadDocument(addRoom(doc, room));
      useEditorStore.getState().selectRoom(room.id);

      render(<MapCanvas mapName="Test" />);

      const outline = screen.getByTestId('room-selection-outline');
      expect(outline.tagName.toLowerCase()).toBe('rect');
      expect(outline).toHaveAttribute('rx', '12');
      expect(outline).toHaveClass('room-selection-outline');
    });
  });

  describe('room editor overlay', () => {
    function setupRoom() {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      useEditorStore.getState().loadDocument(addRoom(doc, room));
      render(<MapCanvas mapName="Test" />);
      return screen.getByText('Kitchen').closest('[data-testid="room-node"]') as HTMLElement;
    }

    it('pans the map to place the edited room horizontally centered and about one third from the top', async () => {
      const user = userEvent.setup();
      const room = { ...createRoom('Kitchen'), position: { x: 40, y: 320 } };
      const doc = addRoom(createEmptyMap('Test'), room);
      useEditorStore.getState().loadDocument(doc);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      const roomNode = screen.getByText('Kitchen').closest('[data-testid="room-node"]') as HTMLElement;
      const content = screen.getByTestId('map-canvas-content');

      jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 900,
        bottom: 600,
        width: 900,
        height: 600,
        toJSON: () => ({}),
      });

      jest.spyOn(roomNode, 'getBoundingClientRect').mockReturnValue({
        x: 40,
        y: 320,
        left: 40,
        top: 320,
        right: 120,
        bottom: 360,
        width: 80,
        height: 40,
        toJSON: () => ({}),
      });

      await user.dblClick(roomNode);

      expect(content.style.transform).toBe('translate(370px, -120px)');
      expect(content).toHaveClass('map-canvas-content--animated');
    });

    it('opens the room editor overlay on double-click', async () => {
      const user = userEvent.setup();
      const roomNode = setupRoom();

      await user.dblClick(roomNode);

      expect(screen.getByTestId('room-editor-overlay')).toBeInTheDocument();
      expect(screen.getByTestId('room-editor-room-node')).toHaveClass('room-node');
      expect(screen.getByTestId('room-editor-dialog')).toBeInTheDocument();
      expect(screen.getByTestId('map-canvas-scene')).toHaveClass('map-canvas-scene--editor-open');
    });

    it('positions the room name editor using the room SVG geometry after auto-pan', async () => {
      const user = userEvent.setup();
      const roomNode = setupRoom();
      const canvas = screen.getByTestId('map-canvas');

      jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 900,
        bottom: 600,
        width: 900,
        height: 600,
        toJSON: () => ({}),
      });

      await user.dblClick(roomNode);

      expect(screen.getByTestId('room-editor-room-node')).toHaveStyle({
        transform: 'translate(450px, 200px) translateX(-50%)',
      });
    });

    it('focuses and selects the room name when the room editor opens', async () => {
      const user = userEvent.setup();
      const roomNode = setupRoom();

      await user.dblClick(roomNode);

      const nameInput = screen.getByTestId('room-editor-name-input') as HTMLInputElement;
      expect(document.activeElement).toBe(nameInput);
      expect(nameInput.selectionStart).toBe(0);
      expect(nameInput.selectionEnd).toBe('Kitchen'.length);
    });

    it('applies room name and description edits immediately', async () => {
      const user = userEvent.setup();
      const roomNode = setupRoom();

      await user.dblClick(roomNode);

      const nameInput = screen.getByTestId('room-editor-name-input');
      const descriptionInput = screen.getByTestId('room-editor-description-input');

      await user.clear(nameInput);
      await user.type(nameInput, 'Pantry');
      await user.type(descriptionInput, 'A pantry with labelled jars.');

      const room = Object.values(useEditorStore.getState().doc!.rooms)[0];
      expect(room.name).toBe('Pantry');
      expect(room.description).toBe('A pantry with labelled jars.');
    });

    it('updates the room shape from the room editor', async () => {
      const user = userEvent.setup();
      const roomNode = setupRoom();

      await user.dblClick(roomNode);
      await user.click(screen.getByTestId('room-shape-option-diamond'));

      const room = Object.values(useEditorStore.getState().doc!.rooms)[0];
      expect(room.shape).toBe('diamond');
      expect(screen.getByTestId('room-node')).toHaveAttribute('data-room-shape', 'diamond');
      expect(screen.getByTestId('room-editor-room-node')).toHaveAttribute('data-room-shape', 'diamond');
      expect(screen.getByTestId('room-node').querySelector('polygon.room-node-shape')).not.toBeNull();
    });

    it('pressing Enter in the room name field moves focus to the description field', async () => {
      const user = userEvent.setup();
      const roomNode = setupRoom();

      await user.dblClick(roomNode);

      const nameInput = screen.getByTestId('room-editor-name-input');
      const descriptionInput = screen.getByTestId('room-editor-description-input');

      await user.click(nameInput);
      await user.keyboard('{Enter}');

      expect(document.activeElement).toBe(descriptionInput);
      expect(screen.getByTestId('room-editor-overlay')).toBeInTheDocument();
    });

    it('closes the room editor on Escape', async () => {
      const user = userEvent.setup();
      const roomNode = setupRoom();

      await user.dblClick(roomNode);
      await user.keyboard('{Escape}');

      expect(screen.queryByTestId('room-editor-overlay')).not.toBeInTheDocument();
    });

    it('closes the room editor from the close button', async () => {
      const user = userEvent.setup();
      const roomNode = setupRoom();

      await user.dblClick(roomNode);
      await user.click(screen.getByRole('button', { name: /close room editor/i }));

      expect(screen.queryByTestId('room-editor-overlay')).not.toBeInTheDocument();
    });

    it('closes the room editor when clicking the backdrop', async () => {
      const user = userEvent.setup();
      const roomNode = setupRoom();

      await user.dblClick(roomNode);
      await user.click(screen.getByTestId('room-editor-overlay').querySelector('.room-editor-backdrop') as HTMLElement);

      expect(screen.queryByTestId('room-editor-overlay')).not.toBeInTheDocument();
    });
  });

  /* ---- Shift+click to create room ---- */

  describe('Shift+click to create room', () => {
    it('creates a room named Room on Shift+click', () => {
      const doc = createEmptyMap('Test');
      useEditorStore.getState().loadDocument(doc);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.click(canvas, { shiftKey: true, clientX: 200, clientY: 300 });

      // A room should have been created
      const rooms = Object.values(useEditorStore.getState().doc!.rooms);
      expect(rooms).toHaveLength(1);
      expect(rooms[0].name).toBe('Room');
      expect(screen.getByRole('textbox', { name: /room name/i })).toHaveValue('Room');
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

    it('pans to the new room before opening the room editor', () => {
      const doc = createEmptyMap('Test');
      useEditorStore.getState().loadDocument(doc);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      const content = screen.getByTestId('map-canvas-content');

      jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 900,
        bottom: 600,
        width: 900,
        height: 600,
        toJSON: () => ({}),
      });

      fireEvent.click(canvas, { shiftKey: true, clientX: 100, clientY: 100 });

      expect(content.style.transform).toBe('translate(290px, 80px)');
      expect(content).toHaveClass('map-canvas-content--animated');
      expect(screen.getByTestId('room-editor-overlay')).toBeInTheDocument();
    });

    it('opens the room editor for a new room', () => {
      const doc = createEmptyMap('Test');
      useEditorStore.getState().loadDocument(doc);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.click(canvas, { shiftKey: true, clientX: 100, clientY: 100 });

      expect(screen.getByTestId('room-editor-overlay')).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: /room name/i })).toBeInTheDocument();
      expect(Object.values(useEditorStore.getState().doc!.rooms)).toHaveLength(1);
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

    it('renders handle circles at the shared SVG geometry coordinates', () => {
      setupRoomAndHover();

      const handle = screen.getByTestId('direction-handle-ne');
      const expectedOffset = getHandleOffset('northeast', { width: ROOM_WIDTH, height: ROOM_HEIGHT });

      expect(handle.getAttribute('cx')).toBe(String(expectedOffset?.x));
      expect(handle.getAttribute('cy')).toBe(String(expectedOffset?.y));
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

    it('opens the room editor for a newly created room', () => {
      const doc = createEmptyMap('Test');
      useEditorStore.getState().loadDocument(doc);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.click(canvas, { shiftKey: true, clientX: 100, clientY: 100 });

      expect(screen.getByTestId('room-editor-overlay')).toBeInTheDocument();
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

    it('does not drag while the room editor overlay is open', async () => {
      const user = userEvent.setup();
      const { roomId, roomNode } = setupDraggableRoom(80, 120);

      await user.dblClick(roomNode);

      fireEvent.mouseDown(roomNode, { clientX: 100, clientY: 140, button: 0 });
      fireEvent.mouseMove(document, { clientX: 200, clientY: 200 });
      fireEvent.mouseUp(document, { clientX: 200, clientY: 200 });

      const room = useEditorStore.getState().doc!.rooms[roomId];
      expect(room.position).toEqual({ x: 80, y: 120 });
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

    it('drags other selected rooms in parallel when dragging a selected room', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 200, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      useEditorStore.getState().loadDocument(updated);
      useEditorStore.getState().selectRoom(kitchen.id);
      useEditorStore.getState().addRoomToSelection(hallway.id);

      render(<MapCanvas mapName="Test" />);

      const kitchenNode = screen.getByText('Kitchen').closest('[data-testid="room-node"]') as HTMLElement;

      fireEvent.mouseDown(kitchenNode, { clientX: 100, clientY: 140, button: 0 });
      fireEvent.mouseMove(document, { clientX: 160, clientY: 180 });
      fireEvent.mouseUp(document, { clientX: 160, clientY: 180 });

      const rooms = useEditorStore.getState().doc!.rooms;
      expect(rooms[kitchen.id].position).toEqual({ x: 160, y: 160 });
      expect(rooms[hallway.id].position).toEqual({ x: 280, y: 160 });
    });

    it('updates all selected room positions live while dragging', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 200, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      useEditorStore.getState().loadDocument(updated);
      useEditorStore.getState().selectRoom(kitchen.id);
      useEditorStore.getState().addRoomToSelection(hallway.id);

      render(<MapCanvas mapName="Test" />);

      const kitchenNode = screen.getByText('Kitchen').closest('[data-testid="room-node"]') as HTMLElement;
      const hallwayNode = screen.getByText('Hallway').closest('[data-testid="room-node"]') as HTMLElement;

      fireEvent.mouseDown(kitchenNode, { clientX: 100, clientY: 140, button: 0 });
      fireEvent.mouseMove(document, { clientX: 130, clientY: 160 });

      expect(kitchenNode.style.transform).toBe('translate(110px, 140px)');
      expect(hallwayNode.style.transform).toBe('translate(230px, 140px)');

      fireEvent.mouseUp(document, { clientX: 130, clientY: 160 });
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

    it('anchors a north connection to the rendered center of a wide room', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('the room of requirement'), position: { x: 80, y: 200 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 80, y: 0 } };
      let d = addRoom(doc, kitchen);
      d = addRoom(d, hallway);
      const conn = createConnection(kitchen.id, hallway.id, true);
      d = addConnection(d, conn, 'north', 'south');
      useEditorStore.getState().loadDocument(d);

      const originalGetBoundingClientRect = HTMLElement.prototype.getBoundingClientRect;
      jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function mockRect(this: HTMLElement) {
        if (this.dataset.roomId === kitchen.id) {
          return {
            x: 80,
            y: 200,
            left: 80,
            top: 200,
            right: 260,
            bottom: 236,
            width: 180,
            height: 36,
            toJSON: () => ({}),
          };
        }

        if (this.dataset.roomId === hallway.id) {
          return {
            x: 80,
            y: 0,
            left: 80,
            top: 0,
            right: 160,
            bottom: 36,
            width: 80,
            height: 36,
            toJSON: () => ({}),
          };
        }

        return originalGetBoundingClientRect.call(this);
      });

      render(<MapCanvas mapName="Test" />);

      const connectionLine = screen.getByTestId(`connection-line-${conn.id}`);
      expect(connectionLine.getAttribute('points')).toBe('170,200 170,180 120,56 120,36');
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
