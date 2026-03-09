import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
    document.documentElement.setAttribute('data-theme', 'light');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders a canvas container', () => {
    render(<MapCanvas mapName="Test Map" />);
    expect(screen.getByTestId('map-canvas')).toBeInTheDocument();
  });

  it('hides the minimap when the document has no rooms', () => {
    const doc = createEmptyMap('Test');
    useEditorStore.getState().loadDocument(doc);

    render(<MapCanvas mapName="Test" />);

    expect(screen.queryByTestId('map-minimap')).not.toBeInTheDocument();
  });

  it('shows the minimap when the document has rooms', () => {
    const doc = createEmptyMap('Test');
    const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
    useEditorStore.getState().loadDocument(addRoom(doc, room));

    render(<MapCanvas mapName="Test" />);

    expect(screen.getByTestId('map-minimap')).toBeInTheDocument();
  });

  it('shows the background grid by default', () => {
    render(<MapCanvas mapName="Test" />);
    const canvas = screen.getByTestId('map-canvas');
    expect(canvas).toHaveClass('map-canvas--grid');
  });

  it('defaults to map interaction mode', () => {
    render(<MapCanvas mapName="Test" />);

    expect(screen.getByRole('button', { name: 'Switch to draw mode' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('toggles into draw interaction mode from the toolbar', async () => {
    const user = userEvent.setup();
    render(<MapCanvas mapName="Test" />);

    await user.click(screen.getByRole('button', { name: 'Switch to draw mode' }));

    expect(useEditorStore.getState().canvasInteractionMode).toBe('draw');
    expect(screen.getByRole('button', { name: 'Switch to map mode' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('switches into draw mode when selecting a drawing tool', async () => {
    const user = userEvent.setup();
    render(<MapCanvas mapName="Test" />);

    await user.click(screen.getByRole('button', { name: 'Brush' }));

    expect(useEditorStore.getState().canvasInteractionMode).toBe('draw');
    expect(useEditorStore.getState().drawingToolState.tool).toBe('brush');
  });

  it('selects the line tool from the drawing toolbar', async () => {
    const user = userEvent.setup();
    render(<MapCanvas mapName="Test" />);

    await user.click(screen.getByRole('button', { name: 'Line' }));

    expect(useEditorStore.getState().canvasInteractionMode).toBe('draw');
    expect(useEditorStore.getState().drawingToolState.tool).toBe('line');
  });

  it('selects the rectangle tool from the drawing toolbar', async () => {
    const user = userEvent.setup();
    render(<MapCanvas mapName="Test" />);

    await user.click(screen.getByRole('button', { name: 'Rectangle' }));

    expect(useEditorStore.getState().canvasInteractionMode).toBe('draw');
    expect(useEditorStore.getState().drawingToolState.tool).toBe('rectangle');
  });

  it('selects the bucket fill tool from the drawing toolbar', async () => {
    const user = userEvent.setup();
    render(<MapCanvas mapName="Test" />);

    await user.click(screen.getByRole('button', { name: 'Bucket fill' }));

    expect(useEditorStore.getState().canvasInteractionMode).toBe('draw');
    expect(useEditorStore.getState().drawingToolState.tool).toBe('bucket');
  });

  it('selects the ellipse tool from the drawing toolbar', async () => {
    const user = userEvent.setup();
    render(<MapCanvas mapName="Test" />);

    await user.click(screen.getByRole('button', { name: 'Ellipse' }));

    expect(useEditorStore.getState().canvasInteractionMode).toBe('draw');
    expect(useEditorStore.getState().drawingToolState.tool).toBe('ellipse');
  });

  it('switches into draw mode when changing drawing settings', () => {
    render(<MapCanvas mapName="Test" />);

    const sizeInput = screen.getByLabelText('Drawing tool size');
    fireEvent.change(sizeInput, { target: { value: '4' } });

    expect(useEditorStore.getState().canvasInteractionMode).toBe('draw');
    expect(useEditorStore.getState().drawingToolState.size).toBe(4);
  });

  it('hides the background grid when showGrid is false', () => {
    render(<MapCanvas mapName="Test" showGrid={false} />);
    const canvas = screen.getByTestId('map-canvas');
    expect(canvas).not.toHaveClass('map-canvas--grid');
  });

  it('updates grid visibility in editor state', () => {
    useEditorStore.getState().loadDocument(createEmptyMap('Test'));
    render(<MapCanvas mapName="Test" />);

    const canvas = screen.getByTestId('map-canvas');
    expect(canvas).toHaveClass('map-canvas--grid');

    act(() => {
      useEditorStore.getState().toggleShowGrid();
    });
    expect(canvas).not.toHaveClass('map-canvas--grid');
    expect(useEditorStore.getState().doc?.view.showGrid).toBe(false);

    act(() => {
      useEditorStore.getState().toggleShowGrid();
    });
    expect(canvas).toHaveClass('map-canvas--grid');
    expect(useEditorStore.getState().doc?.view.showGrid).toBe(true);
  });

  it('updates bezier connection mode in editor state', () => {
    useEditorStore.getState().loadDocument(createEmptyMap('Test'));
    render(<MapCanvas mapName="Test" />);

    expect(useEditorStore.getState().doc?.view.useBezierConnections).toBe(false);
    act(() => {
      useEditorStore.getState().toggleUseBezierConnections();
    });
    expect(useEditorStore.getState().doc?.view.useBezierConnections).toBe(true);

    act(() => {
      useEditorStore.getState().toggleUseBezierConnections();
    });
    expect(useEditorStore.getState().doc?.view.useBezierConnections).toBe(false);
  });

  it('does not clear the current selection when clicking a bottom-right action button', async () => {
    const user = userEvent.setup();
    const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
    useEditorStore.getState().loadDocument(addRoom(createEmptyMap('Test'), room));
    useEditorStore.getState().selectRoom(room.id);

    render(<MapCanvas mapName="Test" />);

    await user.click(screen.getByRole('button', { name: 'Export PNG' }));

    expect(useEditorStore.getState().selectedRoomIds).toEqual([room.id]);
    expect(screen.getByRole('heading', { name: 'Export PNG' })).toBeInTheDocument();
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

    it('persists pan offset into the loaded map after panning settles', () => {
      jest.useFakeTimers();
      const doc = createEmptyMap('Test');
      useEditorStore.getState().loadDocument(doc);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.mouseDown(canvas, { clientX: 100, clientY: 120, button: 1 });
      fireEvent.mouseMove(document, { clientX: 160, clientY: 180 });
      fireEvent.mouseUp(document, { clientX: 160, clientY: 180 });

      act(() => {
        jest.advanceTimersByTime(200);
      });

      expect(useEditorStore.getState().doc?.view.pan).toEqual({ x: 60, y: 60 });
      jest.useRealTimers();
    });

    it('creates rooms in map coordinates after panning', () => {
      const doc = createEmptyMap('Test');
      useEditorStore.getState().loadDocument(doc);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');

      fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100, button: 1 });
      fireEvent.mouseMove(document, { clientX: 180, clientY: 140 });
      fireEvent.mouseUp(document, { clientX: 180, clientY: 140 });

      fireEvent.doubleClick(canvas, { clientX: 120, clientY: 120 });

      const rooms = Object.values(useEditorStore.getState().doc!.rooms);
      expect(rooms).toHaveLength(1);
      expect(rooms[0].position).toEqual({ x: 40, y: 80 });
    });

    it('clicking the minimap recenters the map content', () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 300, y: 200 } };
      useEditorStore.getState().loadDocument(addRoom(doc, room));

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      const content = screen.getByTestId('map-canvas-content');
      const minimap = screen.getByTestId('map-minimap-svg');

      jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 300,
        bottom: 200,
        width: 300,
        height: 200,
        toJSON: () => ({}),
      });
      jest.spyOn(minimap, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 180,
        bottom: 140,
        width: 180,
        height: 140,
        toJSON: () => ({}),
      });

      fireEvent.click(minimap, { clientX: 90, clientY: 70 });

      expect(content.style.transform).not.toBe('translate(0px, 0px)');
    });

    it('dragging the minimap viewport pans the map content', () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 300, y: 200 } };
      useEditorStore.getState().loadDocument(addRoom(doc, room));

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      const content = screen.getByTestId('map-canvas-content');
      const minimap = screen.getByTestId('map-minimap-svg');
      const viewport = screen.getByTestId('map-minimap-viewport');

      jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 300,
        bottom: 200,
        width: 300,
        height: 200,
        toJSON: () => ({}),
      });
      jest.spyOn(minimap, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 180,
        bottom: 140,
        width: 180,
        height: 140,
        toJSON: () => ({}),
      });

      fireEvent.mouseDown(viewport, { clientX: 60, clientY: 60 });
      fireEvent.mouseMove(document, { clientX: 90, clientY: 60 });
      fireEvent.mouseUp(document, { clientX: 90, clientY: 60 });

      expect(content.style.transform).not.toBe('translate(0px, 0px)');
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

    it('clicking the map background clears the selected connection', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 200, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      updated = addConnection(updated, createConnection(kitchen.id, hallway.id, true), 'east', 'west');
      const connectionId = Object.keys(updated.connections)[0];
      useEditorStore.getState().loadDocument(updated);
      useEditorStore.getState().selectConnection(connectionId);

      render(<MapCanvas mapName="Test" />);

      fireEvent.click(screen.getByTestId('map-canvas'), { clientX: 20, clientY: 20, button: 0 });

      expect(useEditorStore.getState().selectedConnectionIds).toEqual([]);
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

    it('captures connections in marquee selection', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 240, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      updated = addConnection(updated, createConnection(kitchen.id, hallway.id, true), 'east', 'west');
      const connectionId = Object.keys(updated.connections)[0];
      useEditorStore.getState().loadDocument(updated);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.mouseDown(canvas, { clientX: 60, clientY: 100, button: 0 });
      fireEvent.mouseMove(document, { clientX: 320, clientY: 180 });

      expect(useEditorStore.getState().selectedRoomIds).toEqual([kitchen.id, hallway.id]);
      expect(useEditorStore.getState().selectedConnectionIds).toEqual([connectionId]);

      fireEvent.mouseUp(document, { clientX: 320, clientY: 180, button: 0 });
    });
  });

  describe('keyboard shortcuts', () => {
    it('undoes with Ctrl+Z', () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      useEditorStore.getState().loadDocument(addRoom(doc, room));
      useEditorStore.getState().renameRoom(room.id, 'Pantry');

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      canvas.focus();
      fireEvent.keyDown(canvas, { key: 'z', ctrlKey: true });

      expect(useEditorStore.getState().doc!.rooms[room.id].name).toBe('Kitchen');
    });

    it('redoes with Ctrl+Y', () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      useEditorStore.getState().loadDocument(addRoom(doc, room));
      useEditorStore.getState().renameRoom(room.id, 'Pantry');
      useEditorStore.getState().undo();

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      canvas.focus();
      fireEvent.keyDown(canvas, { key: 'y', ctrlKey: true });

      expect(useEditorStore.getState().doc!.rooms[room.id].name).toBe('Pantry');
    });

    it('redoes with Shift+Meta+Z', () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      useEditorStore.getState().loadDocument(addRoom(doc, room));
      useEditorStore.getState().renameRoom(room.id, 'Pantry');
      useEditorStore.getState().undo();

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      canvas.focus();
      fireEvent.keyDown(canvas, { key: 'Z', metaKey: true, shiftKey: true });

      expect(useEditorStore.getState().doc!.rooms[room.id].name).toBe('Pantry');
    });

    it('does not trigger undo while editing a room field', async () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      useEditorStore.getState().loadDocument(addRoom(doc, room));
      useEditorStore.getState().renameRoom(room.id, 'Pantry');
      const user = userEvent.setup();

      render(<MapCanvas mapName="Test" />);

      await user.dblClick(screen.getByText('Pantry'));

      const nameInput = screen.getByLabelText(/room name/i);
      fireEvent.keyDown(nameInput, { key: 'z', ctrlKey: true });

      expect(useEditorStore.getState().doc!.rooms[room.id].name).toBe('Pantry');
    });

    it('undoes a burst of typing in the room name input as one step', async () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      useEditorStore.getState().loadDocument(addRoom(doc, room));
      const user = userEvent.setup();

      render(<MapCanvas mapName="Test" />);

      await user.dblClick(screen.getByText('Kitchen'));

      const nameInput = screen.getByLabelText(/room name/i);
      await user.type(nameInput, 'ab');
      fireEvent.keyDown(nameInput, { key: 'Escape' });

      const canvas = screen.getByTestId('map-canvas');
      canvas.focus();
      fireEvent.keyDown(canvas, { key: 'z', ctrlKey: true });

      expect(useEditorStore.getState().doc!.rooms[room.id].name).toBe('Kitchen');
    });

    it('toggles drawing mode with the D key', () => {
      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.keyDown(canvas, { key: 'd' });
      expect(useEditorStore.getState().canvasInteractionMode).toBe('draw');

      fireEvent.keyDown(canvas, { key: 'd' });
      expect(useEditorStore.getState().canvasInteractionMode).toBe('map');
    });

    it('toggles drawing mode with D even when the canvas is not focused', () => {
      render(<MapCanvas mapName="Test" />);

      fireEvent.keyDown(window, { key: 'd' });
      expect(useEditorStore.getState().canvasInteractionMode).toBe('draw');

      fireEvent.keyDown(window, { key: 'd' });
      expect(useEditorStore.getState().canvasInteractionMode).toBe('map');
    });

    it('does not toggle drawing mode with D while editing a room field', async () => {
      const user = userEvent.setup();
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      useEditorStore.getState().loadDocument(addRoom(doc, room));

      render(<MapCanvas mapName="Test" />);

      await user.dblClick(screen.getByText('Kitchen'));
      const nameInput = screen.getByLabelText('Room name');
      nameInput.focus();

      fireEvent.keyDown(nameInput, { key: 'd' });
      expect(useEditorStore.getState().canvasInteractionMode).toBe('map');
    });

    it('undoes and redoes from window shortcuts when focus is elsewhere', () => {
      const doc = createEmptyMap('Test');
      useEditorStore.getState().loadDocument(doc);
      const roomId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 0, y: 0 });

      render(<MapCanvas mapName="Test" />);

      fireEvent.keyDown(window, { key: 'z', metaKey: true });
      expect(useEditorStore.getState().doc?.rooms[roomId]).toBeUndefined();

      fireEvent.keyDown(window, { key: 'y', metaKey: true });
      expect(useEditorStore.getState().doc?.rooms[roomId]).toBeDefined();
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

    it('single-clicking a room clears any selected connection', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 200, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      updated = addConnection(updated, createConnection(kitchen.id, hallway.id, true), 'east', 'west');
      const connectionId = Object.keys(updated.connections)[0];
      useEditorStore.getState().loadDocument(updated);
      useEditorStore.getState().selectConnection(connectionId);

      render(<MapCanvas mapName="Test" />);

      fireEvent.mouseDown(screen.getByText('Kitchen').closest('[data-testid="room-node"]') as HTMLElement, {
        clientX: 100,
        clientY: 140,
        button: 0,
      });
      fireEvent.mouseUp(document, { clientX: 100, clientY: 140, button: 0 });

      expect(useEditorStore.getState().selectedConnectionIds).toEqual([]);
      expect(useEditorStore.getState().selectedRoomIds).toEqual([kitchen.id]);
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

    it('shift-clicking a room preserves selected connections', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 200, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      updated = addConnection(updated, createConnection(kitchen.id, hallway.id, true), 'east', 'west');
      const connectionId = Object.keys(updated.connections)[0];
      useEditorStore.getState().loadDocument(updated);
      useEditorStore.getState().selectConnection(connectionId);

      render(<MapCanvas mapName="Test" />);

      const kitchenNode = screen.getByText('Kitchen').closest('[data-testid="room-node"]') as HTMLElement;
      fireEvent.mouseDown(kitchenNode, { clientX: 100, clientY: 140, button: 0, shiftKey: true });
      fireEvent.mouseUp(document, { clientX: 100, clientY: 140, button: 0, shiftKey: true });

      expect(useEditorStore.getState().selectedRoomIds).toEqual([kitchen.id]);
      expect(useEditorStore.getState().selectedConnectionIds).toEqual([connectionId]);
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

    it('pans the newly selected room into view when arrow navigation reaches an off-screen room', () => {
      const doc = createEmptyMap('Test');
      const origin = { ...createRoom('Origin'), position: { x: 80, y: 120 } };
      const right = { ...createRoom('Right'), position: { x: 500, y: 120 } };
      let updated = addRoom(doc, origin);
      updated = addRoom(updated, right);
      useEditorStore.getState().loadDocument(updated);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      const content = screen.getByTestId('map-canvas-content');
      const originNode = screen.getByText('Origin').closest('[data-testid="room-node"]') as HTMLElement;

      jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 300,
        bottom: 200,
        width: 300,
        height: 200,
        toJSON: () => ({}),
      });

      fireEvent.mouseDown(originNode, { clientX: 100, clientY: 140, button: 0 });
      fireEvent.mouseUp(document, { clientX: 100, clientY: 140, button: 0 });

      fireEvent.keyDown(canvas, { key: 'ArrowRight' });

      expect(useEditorStore.getState().selectedRoomIds).toEqual([right.id]);
      expect(content.style.transform).toBe('translate(-304px, 0px)');
      expect(content).toHaveClass('map-canvas-content--animated');
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

    it('opens the room editor for a single selected room when Enter is pressed', () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 40, y: 320 } };
      useEditorStore.getState().loadDocument(addRoom(doc, room));

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      const content = screen.getByTestId('map-canvas-content');
      const roomNode = screen.getByText('Kitchen').closest('[data-testid="room-node"]') as HTMLElement;

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

      fireEvent.mouseDown(roomNode, { clientX: 60, clientY: 340, button: 0 });
      fireEvent.mouseUp(document, { clientX: 60, clientY: 340, button: 0 });

      fireEvent.keyDown(canvas, { key: 'Enter' });

      expect(screen.getByTestId('room-editor-overlay')).toBeInTheDocument();
      expect(content.style.transform).toBe('translate(370px, -120px)');
      expect(content).toHaveClass('map-canvas-content--animated');
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

    it('updates room style options from the room editor', async () => {
      const user = userEvent.setup();
      const roomNode = setupRoom();

      await user.dblClick(roomNode);

      const fillColorChip = screen.getByTestId('room-fill-color-chip-2');
      const strokeColorChip = screen.getByTestId('room-stroke-color-chip-4');
      const strokeStyleInput = screen.getByLabelText('Stroke style');

      await user.click(fillColorChip);
      await user.click(strokeColorChip);
      await user.selectOptions(strokeStyleInput, 'dashed');

      const room = Object.values(useEditorStore.getState().doc!.rooms)[0];
      expect(room.fillColorIndex).toBe(2);
      expect(room.strokeColorIndex).toBe(4);
      expect(room.strokeStyle).toBe('dashed');

      const canvasShape = screen.getByTestId('room-node').querySelector('.room-node-shape') as SVGElement;
      const editorShape = screen.getByTestId('room-editor-room-node').querySelector('.room-node-shape') as SVGElement;

      expect(canvasShape).toHaveStyle({ fill: '#ffcc00', stroke: '#166534', strokeDasharray: '8 5' });
      expect(editorShape).toHaveStyle({ fill: '#ffcc00', stroke: '#166534', strokeDasharray: '8 5' });
    });

    it('re-resolves indexed room colors when the theme changes', async () => {
      const user = userEvent.setup();
      const roomNode = setupRoom();

      await user.dblClick(roomNode);
      await user.click(screen.getByTestId('room-fill-color-chip-2'));
      await user.click(screen.getByTestId('room-stroke-color-chip-4'));

      const canvasShape = screen.getByTestId('room-node').querySelector('.room-node-shape') as SVGElement;
      expect(canvasShape).toHaveStyle({ fill: '#ffcc00', stroke: '#166534' });

      document.documentElement.setAttribute('data-theme', 'dark');

      await waitFor(() => {
        expect(canvasShape).toHaveStyle({ fill: '#854d0e', stroke: '#86efac' });
      });
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
      expect(useEditorStore.getState().selectedRoomIds).toEqual([]);
      expect(useEditorStore.getState().selectedConnectionIds).toEqual([]);
    });
  });

  /* ---- Double-click to create room ---- */

  describe('double-click to create room', () => {
    it('creates a room named Room on background double-click', () => {
      const doc = createEmptyMap('Test');
      useEditorStore.getState().loadDocument(doc);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.doubleClick(canvas, { clientX: 200, clientY: 300 });

      // A room should have been created
      const rooms = Object.values(useEditorStore.getState().doc!.rooms);
      expect(rooms).toHaveLength(1);
      expect(rooms[0].name).toBe('Room');
      expect(screen.getByRole('textbox', { name: /room name/i })).toHaveValue('Room');
    });

    it('does not create a room on a single background click', () => {
      const doc = createEmptyMap('Test');
      useEditorStore.getState().loadDocument(doc);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.click(canvas, { clientX: 200, clientY: 300 });

      expect(Object.values(useEditorStore.getState().doc!.rooms)).toHaveLength(0);
      expect(screen.queryByRole('textbox', { name: /room name/i })).not.toBeInTheDocument();
    });

    it('snaps the room position to the grid', () => {
      const doc = createEmptyMap('Test');
      useEditorStore.getState().loadDocument(doc);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.doubleClick(canvas, { clientX: 55, clientY: 85 });

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

      fireEvent.doubleClick(canvas, { clientX: 100, clientY: 100 });

      expect(content.style.transform).toBe('translate(290px, 80px)');
      expect(content).toHaveClass('map-canvas-content--animated');
      expect(screen.getByTestId('room-editor-overlay')).toBeInTheDocument();
    });

    it('opens the room editor for a new room', () => {
      const doc = createEmptyMap('Test');
      useEditorStore.getState().loadDocument(doc);

      render(<MapCanvas mapName="Test" />);

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.doubleClick(canvas, { clientX: 100, clientY: 100 });

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
      fireEvent.doubleClick(canvas, { clientX: 100, clientY: 100 });

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

    it('does not fire background double-click room creation during drag', () => {
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

    it('undoes a multi-room drag as one history step', () => {
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
      const canvas = screen.getByTestId('map-canvas');

      fireEvent.mouseDown(kitchenNode, { clientX: 100, clientY: 140, button: 0 });
      fireEvent.mouseMove(document, { clientX: 160, clientY: 180 });
      fireEvent.mouseUp(document, { clientX: 160, clientY: 180 });

      canvas.focus();
      fireEvent.keyDown(canvas, { key: 'z', ctrlKey: true });

      const rooms = useEditorStore.getState().doc!.rooms;
      expect(rooms[kitchen.id].position).toEqual({ x: 80, y: 120 });
      expect(rooms[hallway.id].position).toEqual({ x: 200, y: 120 });
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

    it('shows an SVG preview path during connection drag when bezier mode is enabled', async () => {
      setupTwoRooms();
      act(() => {
        useEditorStore.getState().toggleUseBezierConnections();
      });
      render(<MapCanvas mapName="Test" />);

      const roomNodes = screen.getAllByTestId('room-node');
      const kitchenNode = roomNodes.find((n) => n.textContent === 'Kitchen')!;
      fireEvent.mouseEnter(kitchenNode);

      const handle = screen.getByTestId('direction-handle-n');
      fireEvent.mouseDown(handle, { clientX: 100, clientY: 200, button: 0 });
      fireEvent.mouseMove(document, { clientX: 100, clientY: 50 });

      const previewLine = screen.getByTestId('connection-preview-line');
      expect(previewLine).toBeInTheDocument();
      expect(previewLine.tagName.toLowerCase()).toBe('path');
      expect(previewLine.getAttribute('d')).toContain('Q');
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
      expect(screen.getByTestId('connection-svg-overlay')).toHaveStyle({ overflow: 'visible' });
    });

    it('renders a path for an existing bidirectional connection when bezier mode is enabled', async () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 80, y: 0 } };
      let d = addRoom(doc, kitchen);
      d = addRoom(d, hallway);
      const conn = createConnection(kitchen.id, hallway.id, true);
      d = addConnection(d, conn, 'north', 'south');
      d = {
        ...d,
        view: {
          ...d.view,
          useBezierConnections: true,
        },
      };
      useEditorStore.getState().loadDocument(d);

      render(<MapCanvas mapName="Test" />);

      const connectionLine = screen.getByTestId(`connection-line-${conn.id}`);
      expect(connectionLine.tagName.toLowerCase()).toBe('path');
      expect(connectionLine.getAttribute('d')).toContain('C');
    });

    it('clicking a connection selects only that connection', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 200, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      updated = addConnection(updated, createConnection(kitchen.id, hallway.id, true), 'east', 'west');
      const conn = Object.values(updated.connections)[0];
      useEditorStore.getState().loadDocument(updated);
      useEditorStore.getState().selectRoom(kitchen.id);

      render(<MapCanvas mapName="Test" />);

      fireEvent.click(screen.getByTestId(`connection-hit-target-${conn.id}`));

      expect(useEditorStore.getState().selectedRoomIds).toEqual([]);
      expect(useEditorStore.getState().selectedConnectionIds).toEqual([conn.id]);
    });

    it('double-clicking a connection opens the connection editor', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 240, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      const conn = createConnection(kitchen.id, hallway.id, true);
      updated = addConnection(updated, conn, 'east', 'west');
      useEditorStore.getState().loadDocument(updated);

      render(<MapCanvas mapName="Test" />);

      fireEvent.doubleClick(screen.getByTestId(`connection-hit-target-${conn.id}`));

      expect(screen.getByTestId('connection-editor-overlay')).toBeInTheDocument();
      expect(screen.getByTestId('connection-editor-dialog')).toBeInTheDocument();
      expect(screen.getByTestId('connection-editor-sidebar')).toBeInTheDocument();
      expect(screen.getByTestId('connection-editor-main')).toBeInTheDocument();
      expect(useEditorStore.getState().selectedConnectionIds).toEqual([conn.id]);
    });

    it('closes the connection editor from the close button', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 240, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      const conn = createConnection(kitchen.id, hallway.id, true);
      updated = addConnection(updated, conn, 'east', 'west');
      useEditorStore.getState().loadDocument(updated);

      render(<MapCanvas mapName="Test" />);

      fireEvent.doubleClick(screen.getByTestId(`connection-hit-target-${conn.id}`));
      fireEvent.click(screen.getByRole('button', { name: /close connection editor/i }));

      expect(screen.queryByTestId('connection-editor-overlay')).not.toBeInTheDocument();
    });

    it('closes the connection editor on Escape', async () => {
      const user = userEvent.setup();
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 240, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      const conn = createConnection(kitchen.id, hallway.id, true);
      updated = addConnection(updated, conn, 'east', 'west');
      useEditorStore.getState().loadDocument(updated);

      render(<MapCanvas mapName="Test" />);

      await user.dblClick(screen.getByTestId(`connection-hit-target-${conn.id}`));
      await user.keyboard('{Escape}');

      expect(screen.queryByTestId('connection-editor-overlay')).not.toBeInTheDocument();
    });

    it('closes the connection editor and clears selection when clicking the backdrop', async () => {
      const user = userEvent.setup();
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 240, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      const conn = createConnection(kitchen.id, hallway.id, true);
      updated = addConnection(updated, conn, 'east', 'west');
      useEditorStore.getState().loadDocument(updated);

      render(<MapCanvas mapName="Test" />);

      await user.dblClick(screen.getByTestId(`connection-hit-target-${conn.id}`));
      await user.click(screen.getByTestId('connection-editor-overlay').querySelector('.connection-editor-backdrop') as HTMLElement);

      expect(screen.queryByTestId('connection-editor-overlay')).not.toBeInTheDocument();
      expect(useEditorStore.getState().selectedRoomIds).toEqual([]);
      expect(useEditorStore.getState().selectedConnectionIds).toEqual([]);
    });

    it('updates connection color and stroke style from the connection editor', async () => {
      const user = userEvent.setup();
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 240, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      const conn = createConnection(kitchen.id, hallway.id, true);
      updated = addConnection(updated, conn, 'east', 'west');
      useEditorStore.getState().loadDocument(updated);

      render(<MapCanvas mapName="Test" />);

      await user.dblClick(screen.getByTestId(`connection-hit-target-${conn.id}`));
      await user.click(screen.getByTestId('connection-stroke-color-chip-4'));
      await user.selectOptions(screen.getByLabelText(/connection stroke style/i), 'dotted');

      const updatedConnection = useEditorStore.getState().doc!.connections[conn.id];
      expect(updatedConnection.strokeColorIndex).toBe(4);
      expect(updatedConnection.strokeStyle).toBe('dotted');

      const connectionLine = screen.getByTestId(`connection-line-${conn.id}`);
      expect(connectionLine).toHaveStyle({
        stroke: '#166534',
        strokeDasharray: '2 4',
      });
    });

    it('updates connection annotations from the connection editor', async () => {
      const user = userEvent.setup();
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 240, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      const conn = createConnection(kitchen.id, hallway.id, true);
      updated = addConnection(updated, conn, 'east', 'west');
      useEditorStore.getState().loadDocument(updated);

      render(<MapCanvas mapName="Test" />);

      await user.dblClick(screen.getByTestId(`connection-hit-target-${conn.id}`));
      await user.click(screen.getByLabelText('door'));

      expect(useEditorStore.getState().doc!.connections[conn.id].annotation).toEqual({ kind: 'door' });

      const textInput = screen.getByLabelText(/connection annotation text/i);
      await user.clear(textInput);
      await user.type(textInput, 'secret passage');

      expect(useEditorStore.getState().doc!.connections[conn.id].annotation).toEqual({
        kind: 'text',
        text: 'secret passage',
      });
      expect(screen.getByLabelText('Text')).toBeChecked();

      await user.click(screen.getByLabelText('none'));
      expect(useEditorStore.getState().doc!.connections[conn.id].annotation).toBeNull();
      expect(screen.getByLabelText('none')).toBeChecked();
    });

    it('updates connection start and end labels from the connection editor', async () => {
      const user = userEvent.setup();
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 240, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      const conn = createConnection(kitchen.id, hallway.id, true);
      updated = addConnection(updated, conn, 'east', 'west');
      useEditorStore.getState().loadDocument(updated);

      render(<MapCanvas mapName="Test" />);

      await user.dblClick(screen.getByTestId(`connection-hit-target-${conn.id}`));
      await user.type(screen.getByLabelText(/connection start label/i), 'archway');
      await user.type(screen.getByLabelText(/connection end label/i), 'landing');

      const updatedConnection = useEditorStore.getState().doc!.connections[conn.id];
      expect(updatedConnection.startLabel).toBe('archway');
      expect(updatedConnection.endLabel).toBe('landing');
    });

    it('shift-clicking a connection expands the mixed selection', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 200, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      updated = addConnection(updated, createConnection(kitchen.id, hallway.id, true), 'east', 'west');
      const conn = Object.values(updated.connections)[0];
      useEditorStore.getState().loadDocument(updated);
      useEditorStore.getState().selectRoom(kitchen.id);

      render(<MapCanvas mapName="Test" />);

      fireEvent.click(screen.getByTestId(`connection-hit-target-${conn.id}`), { shiftKey: true });

      expect(useEditorStore.getState().selectedRoomIds).toEqual([kitchen.id]);
      expect(useEditorStore.getState().selectedConnectionIds).toEqual([conn.id]);
    });

    it('renders selected connections with layered highlight strokes', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 200, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      updated = addConnection(updated, createConnection(kitchen.id, hallway.id, true), 'east', 'west');
      const conn = Object.values(updated.connections)[0];
      useEditorStore.getState().loadDocument(updated);
      useEditorStore.getState().selectConnection(conn.id);

      render(<MapCanvas mapName="Test" />);

      const outerLine = screen.getByTestId(`connection-line-${conn.id}`);
      const innerLine = screen.getByTestId(`connection-selection-inner-${conn.id}`);

      expect(outerLine).toHaveStyle({ strokeWidth: '6' });
      expect(innerLine).toHaveStyle({ strokeWidth: '2' });
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

    it('renders an up annotation as a centered parallel arrow and rotated label', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 80, y: 0 } };
      let d = addRoom(doc, kitchen);
      d = addRoom(d, hallway);
      const conn = { ...createConnection(kitchen.id, hallway.id, true), annotation: { kind: 'up' as const } };
      d = addConnection(d, conn, 'north', 'south');
      useEditorStore.getState().loadDocument(d);

      render(<MapCanvas mapName="Test" />);

      const annotationLine = screen.getByTestId(`connection-annotation-line-${conn.id}`);
      const annotationArrow = screen.getByTestId(`connection-annotation-arrow-${conn.id}`);
      const annotationText = screen.getByTestId(`connection-annotation-text-${conn.id}`);
      const arrowPoints = (annotationArrow.getAttribute('points') ?? '').split(' ').map((point) => point.split(',').map(Number));
      const arrowBasePoints = arrowPoints.slice(1).sort((a, b) => a[0] - b[0]);

      expect(annotationLine.tagName.toLowerCase()).toBe('line');
      expect(Number(annotationLine.getAttribute('x1'))).toBeCloseTo(128, 5);
      expect(Number(annotationLine.getAttribute('y1'))).toBeCloseTo(167.6, 5);
      expect(Number(annotationLine.getAttribute('x2'))).toBeCloseTo(128, 5);
      expect(Number(annotationLine.getAttribute('y2'))).toBeCloseTo(68.4, 5);
      expect(arrowPoints[0][0]).toBeCloseTo(128, 5);
      expect(arrowPoints[0][1]).toBeCloseTo(68.4, 5);
      expect(arrowBasePoints[0][0]).toBeCloseTo(124, 5);
      expect(arrowBasePoints[0][1]).toBeCloseTo(78.4, 5);
      expect(arrowBasePoints[1][0]).toBeCloseTo(132, 5);
      expect(arrowBasePoints[1][1]).toBeCloseTo(78.4, 5);
      expect(annotationText).toHaveTextContent('up');
      expect(annotationText.getAttribute('transform')).toBeNull();
    });

    it('renders a down annotation arrow pointing toward the source room', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 80, y: 0 } };
      let d = addRoom(doc, kitchen);
      d = addRoom(d, hallway);
      const conn = { ...createConnection(kitchen.id, hallway.id, true), annotation: { kind: 'down' as const } };
      d = addConnection(d, conn, 'north', 'south');
      useEditorStore.getState().loadDocument(d);

      render(<MapCanvas mapName="Test" />);

      const annotationLine = screen.getByTestId(`connection-annotation-line-${conn.id}`);
      const annotationArrow = screen.getByTestId(`connection-annotation-arrow-${conn.id}`);
      const annotationText = screen.getByTestId(`connection-annotation-text-${conn.id}`);
      const arrowPoints = (annotationArrow.getAttribute('points') ?? '').split(' ').map((point) => point.split(',').map(Number));

      expect(Number(annotationLine.getAttribute('x1'))).toBeCloseTo(128, 5);
      expect(Number(annotationLine.getAttribute('y1'))).toBeCloseTo(68.4, 5);
      expect(Number(annotationLine.getAttribute('x2'))).toBeCloseTo(128, 5);
      expect(Number(annotationLine.getAttribute('y2'))).toBeCloseTo(167.6, 5);
      expect(arrowPoints[0][0]).toBeCloseTo(128, 5);
      expect(arrowPoints[0][1]).toBeCloseTo(167.6, 5);
      expect(arrowPoints[1][0]).toBeCloseTo(132, 5);
      expect(arrowPoints[1][1]).toBeCloseTo(157.6, 5);
      expect(arrowPoints[2][0]).toBeCloseTo(124, 5);
      expect(arrowPoints[2][1]).toBeCloseTo(157.6, 5);
      expect(annotationText).toHaveTextContent('up');
      expect(annotationText.getAttribute('transform')).toBeNull();
    });

    it('renders an in annotation as a centered parallel arrow and horizontal label', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 80, y: 0 } };
      let d = addRoom(doc, kitchen);
      d = addRoom(d, hallway);
      const conn = { ...createConnection(kitchen.id, hallway.id, true), annotation: { kind: 'in' as const } };
      d = addConnection(d, conn, 'north', 'south');
      useEditorStore.getState().loadDocument(d);

      render(<MapCanvas mapName="Test" />);

      const annotationLine = screen.getByTestId(`connection-annotation-line-${conn.id}`);
      const annotationArrow = screen.getByTestId(`connection-annotation-arrow-${conn.id}`);
      const annotationText = screen.getByTestId(`connection-annotation-text-${conn.id}`);
      const arrowPoints = (annotationArrow.getAttribute('points') ?? '').split(' ').map((point) => point.split(',').map(Number));
      const arrowBasePoints = arrowPoints.slice(1).sort((a, b) => a[0] - b[0]);

      expect(Number(annotationLine.getAttribute('x1'))).toBeCloseTo(128, 5);
      expect(Number(annotationLine.getAttribute('y1'))).toBeCloseTo(167.6, 5);
      expect(Number(annotationLine.getAttribute('x2'))).toBeCloseTo(128, 5);
      expect(Number(annotationLine.getAttribute('y2'))).toBeCloseTo(68.4, 5);
      expect(arrowPoints[0][0]).toBeCloseTo(128, 5);
      expect(arrowPoints[0][1]).toBeCloseTo(68.4, 5);
      expect(arrowBasePoints[0][0]).toBeCloseTo(124, 5);
      expect(arrowBasePoints[0][1]).toBeCloseTo(78.4, 5);
      expect(arrowBasePoints[1][0]).toBeCloseTo(132, 5);
      expect(arrowBasePoints[1][1]).toBeCloseTo(78.4, 5);
      expect(annotationText).toHaveTextContent('in');
      expect(annotationText.getAttribute('transform')).toBeNull();
    });

    it('renders an out annotation arrow pointing toward the source room with an in label', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 80, y: 0 } };
      let d = addRoom(doc, kitchen);
      d = addRoom(d, hallway);
      const conn = { ...createConnection(kitchen.id, hallway.id, true), annotation: { kind: 'out' as const } };
      d = addConnection(d, conn, 'north', 'south');
      useEditorStore.getState().loadDocument(d);

      render(<MapCanvas mapName="Test" />);

      const annotationLine = screen.getByTestId(`connection-annotation-line-${conn.id}`);
      const annotationArrow = screen.getByTestId(`connection-annotation-arrow-${conn.id}`);
      const annotationText = screen.getByTestId(`connection-annotation-text-${conn.id}`);
      const arrowPoints = (annotationArrow.getAttribute('points') ?? '').split(' ').map((point) => point.split(',').map(Number));

      expect(Number(annotationLine.getAttribute('x1'))).toBeCloseTo(128, 5);
      expect(Number(annotationLine.getAttribute('y1'))).toBeCloseTo(68.4, 5);
      expect(Number(annotationLine.getAttribute('x2'))).toBeCloseTo(128, 5);
      expect(Number(annotationLine.getAttribute('y2'))).toBeCloseTo(167.6, 5);
      expect(arrowPoints[0][0]).toBeCloseTo(128, 5);
      expect(arrowPoints[0][1]).toBeCloseTo(167.6, 5);
      expect(arrowPoints[1][0]).toBeCloseTo(132, 5);
      expect(arrowPoints[1][1]).toBeCloseTo(157.6, 5);
      expect(arrowPoints[2][0]).toBeCloseTo(124, 5);
      expect(arrowPoints[2][1]).toBeCloseTo(157.6, 5);
      expect(annotationText).toHaveTextContent('in');
      expect(annotationText.getAttribute('transform')).toBeNull();
    });

    it('renders free text annotations parallel to the connection', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 80, y: 0 } };
      let d = addRoom(doc, kitchen);
      d = addRoom(d, hallway);
      const conn = { ...createConnection(kitchen.id, hallway.id, true), annotation: { kind: 'text', text: 'stairs' } };
      d = addConnection(d, conn, 'north', 'south');
      useEditorStore.getState().loadDocument(d);

      render(<MapCanvas mapName="Test" />);

      const annotationText = screen.getByTestId(`connection-annotation-text-${conn.id}`);

      expect(annotationText).toHaveTextContent('stairs');
      expect(annotationText.getAttribute('transform')).toBe('rotate(90 140 118)');
      expect(screen.queryByTestId(`connection-annotation-line-${conn.id}`)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`connection-annotation-arrow-${conn.id}`)).not.toBeInTheDocument();
    });

    it('keeps free text annotations readable on reversed connections', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 240, y: 80 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 0, y: 80 } };
      let d = addRoom(doc, kitchen);
      d = addRoom(d, hallway);
      const conn = { ...createConnection(kitchen.id, hallway.id, true), annotation: { kind: 'text', text: 'gate' } };
      d = addConnection(d, conn, 'west', 'east');
      useEditorStore.getState().loadDocument(d);

      render(<MapCanvas mapName="Test" />);

      const annotationText = screen.getByTestId(`connection-annotation-text-${conn.id}`);
      const rotation = Number((annotationText.getAttribute('transform') ?? '').match(/^rotate\(([-\d.]+)/)?.[1]);

      expect(annotationText).toHaveTextContent('gate');
      expect(rotation).toBeCloseTo(0, 5);
    });

    it('renders a door annotation as a centered arched door glyph on the main segment', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 80, y: 0 } };
      let d = addRoom(doc, kitchen);
      d = addRoom(d, hallway);
      const conn = { ...createConnection(kitchen.id, hallway.id, true), annotation: { kind: 'door' as const } };
      d = addConnection(d, conn, 'north', 'south');
      useEditorStore.getState().loadDocument(d);

      render(<MapCanvas mapName="Test" />);

      const doorGlyph = screen.getByTestId(`connection-annotation-door-${conn.id}`);
      const doorPath = doorGlyph.querySelector('path');

      expect(doorGlyph.getAttribute('transform')).toBe('translate(114 110)');
      expect(doorPath?.getAttribute('d')).toBe('M1 15 L1 7 Q6 1 11 7 L11 15 Z');
      expect(doorPath).toHaveAttribute('fill', '#6366f1');
      expect(doorGlyph.querySelector('circle')).toBeNull();
      expect(doorGlyph.querySelectorAll('line')).toHaveLength(0);
      expect(screen.queryByTestId(`connection-annotation-line-${conn.id}`)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`connection-annotation-arrow-${conn.id}`)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`connection-annotation-text-${conn.id}`)).not.toBeInTheDocument();
    });

    it('renders a locked door annotation as a centered padlock glyph on the main segment', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 80, y: 0 } };
      let d = addRoom(doc, kitchen);
      d = addRoom(d, hallway);
      const conn = { ...createConnection(kitchen.id, hallway.id, true), annotation: { kind: 'locked door' as const } };
      d = addConnection(d, conn, 'north', 'south');
      useEditorStore.getState().loadDocument(d);

      render(<MapCanvas mapName="Test" />);

      const padlockGlyph = screen.getByTestId(`connection-annotation-padlock-${conn.id}`);
      const shackle = padlockGlyph.querySelector('path');
      const body = padlockGlyph.querySelector('rect');
      const keyhole = padlockGlyph.querySelector('circle');
      const keyStem = padlockGlyph.querySelector('line');

      expect(padlockGlyph.getAttribute('transform')).toBe('translate(114 110)');
      expect(shackle?.getAttribute('d')).toBe('M3 7 V5.5 C3 2.8 5 1 6 1 C7 1 9 2.8 9 5.5 V7');
      expect(body?.getAttribute('x')).toBe('2');
      expect(body?.getAttribute('y')).toBe('7');
      expect(body?.getAttribute('width')).toBe('8');
      expect(body?.getAttribute('height')).toBe('8');
      expect(keyhole?.getAttribute('cx')).toBe('6');
      expect(keyhole?.getAttribute('cy')).toBe('10.5');
      expect(keyStem?.getAttribute('x1')).toBe('6');
      expect(keyStem?.getAttribute('y2')).toBe('13');
      expect(screen.queryByTestId(`connection-annotation-line-${conn.id}`)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`connection-annotation-arrow-${conn.id}`)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`connection-annotation-text-${conn.id}`)).not.toBeInTheDocument();
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

    it('renders endpoint labels next to the source and target stubs for bidirectional connections', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 80, y: 0 } };
      let d = addRoom(doc, kitchen);
      d = addRoom(d, hallway);
      const conn = {
        ...createConnection(kitchen.id, hallway.id, true),
        startLabel: 'stairs',
        endLabel: 'balcony',
      };
      d = addConnection(d, conn, 'north', 'south');
      useEditorStore.getState().loadDocument(d);

      render(<MapCanvas mapName="Test" />);

      const startLabel = screen.getByTestId(`connection-start-label-${conn.id}`);
      const endLabel = screen.getByTestId(`connection-end-label-${conn.id}`);

      expect(startLabel).toHaveTextContent('stairs');
      expect(startLabel.getAttribute('x')).toBe('130');
      expect(startLabel.getAttribute('y')).toBe('190');
      expect(endLabel).toHaveTextContent('balcony');
      expect(endLabel.getAttribute('x')).toBe('130');
      expect(endLabel.getAttribute('y')).toBe('46');
    });

    it('renders only the start label for one-way connections', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 80, y: 0 } };
      let d = addRoom(doc, kitchen);
      d = addRoom(d, hallway);
      const conn = {
        ...createConnection(kitchen.id, hallway.id, false),
        startLabel: 'stairs',
        endLabel: 'ignored',
      };
      d = addConnection(d, conn, 'north');
      useEditorStore.getState().loadDocument(d);

      render(<MapCanvas mapName="Test" />);

      expect(screen.getByTestId(`connection-start-label-${conn.id}`)).toHaveTextContent('stairs');
      expect(screen.queryByTestId(`connection-end-label-${conn.id}`)).not.toBeInTheDocument();
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

    it('renders only the label for an up annotation on a self-connection', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      let d = addRoom(doc, kitchen);
      const conn = { ...createConnection(kitchen.id, kitchen.id, false), annotation: { kind: 'up' as const } };
      d = addConnection(d, conn, 'north');
      useEditorStore.getState().loadDocument(d);

      render(<MapCanvas mapName="Test" />);

      expect(screen.getByTestId(`connection-annotation-text-${conn.id}`)).toHaveTextContent('up');
      expect(screen.queryByTestId(`connection-annotation-line-${conn.id}`)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`connection-annotation-arrow-${conn.id}`)).not.toBeInTheDocument();
    });

    it('renders only the label for an in annotation on a self-connection', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      let d = addRoom(doc, kitchen);
      const conn = { ...createConnection(kitchen.id, kitchen.id, false), annotation: { kind: 'in' as const } };
      d = addConnection(d, conn, 'north');
      useEditorStore.getState().loadDocument(d);

      render(<MapCanvas mapName="Test" />);

      expect(screen.getByTestId(`connection-annotation-text-${conn.id}`)).toHaveTextContent('in');
      expect(screen.queryByTestId(`connection-annotation-line-${conn.id}`)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`connection-annotation-arrow-${conn.id}`)).not.toBeInTheDocument();
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
