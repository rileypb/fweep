import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MapCanvas } from '../../src/components/map-canvas';
import { getMapCanvasRoomNodeId } from '../../src/components/map-canvas-a11y';
import { useEditorStore } from '../../src/state/editor-store';
import { createEmptyMap, createItem, createPseudoRoom, createStickyNote, createStickyNoteLink } from '../../src/domain/map-types';
import { getPseudoRoomNodeDimensions } from '../../src/domain/pseudo-room-helpers';
import { addItem, addPseudoRoom, addRoom, addConnection, addStickyNote } from '../../src/domain/map-operations';
import { createRoom, createConnection } from '../../src/domain/map-types';
import { getHandleOffset, ROOM_HEIGHT, ROOM_WIDTH } from '../../src/graph/connection-geometry';
import { getRoomNodeDimensions } from '../../src/graph/room-label-geometry';
import { getStickyNoteHeight, STICKY_NOTE_WIDTH } from '../../src/graph/sticky-note-geometry';
import type { MapDocument } from '../../src/domain/map-types';
import type { MapCanvasProps } from '../../src/components/map-canvas';

function resetStore(): void {
  useEditorStore.setState(useEditorStore.getInitialState());
}

function loadDocumentAct(doc: MapDocument): void {
  act(() => {
    useEditorStore.getState().loadDocument(doc);
  });
}

function renderMapCanvas(props: Partial<MapCanvasProps> = {}): ReturnType<typeof render> {
  return render(<MapCanvas mapName="Test" {...props} />);
}

function renderLoadedMap(doc: MapDocument, props: Partial<MapCanvasProps> = {}): ReturnType<typeof render> {
  loadDocumentAct(doc);
  return renderMapCanvas(props);
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

  it('exposes the map canvas as a tabbable named region', () => {
    render(<MapCanvas mapName="Test Map" />);

    expect(screen.getByLabelText('Map canvas')).toHaveAttribute('tabindex', '0');
  });

  it('shows a placeholder minimap when the document has no rooms', () => {
    const doc = createEmptyMap('Test');
    renderLoadedMap(doc);

    expect(screen.getByTestId('map-minimap')).toBeInTheDocument();
    expect(screen.queryByTestId('map-minimap-viewport')).not.toBeInTheDocument();
  });

  it('shows the minimap when the document has rooms', () => {
    const doc = createEmptyMap('Test');
    const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
    renderLoadedMap(addRoom(doc, room));

    expect(screen.getByTestId('map-minimap')).toBeInTheDocument();
  });

  it('shows the background grid by default', () => {
    renderMapCanvas();
    const canvas = screen.getByTestId('map-canvas');
    expect(canvas).toHaveClass('map-canvas--grid');
  });

  it('renders a paper texture layer beneath the grid', () => {
    renderMapCanvas();

    expect(screen.getByTestId('map-canvas-paper-layer')).toBeInTheDocument();
  });

  it('renders the paper texture layer with the parchment base color', () => {
    act(() => {
      useEditorStore.getState().setMapPanOffset({ x: 30, y: 45 });
      useEditorStore.getState().setMapZoom(1.5);
    });

    renderMapCanvas();

    const paperLayer = screen.getByTestId('map-canvas-paper-layer');

    expect(paperLayer).toHaveStyle({
      backgroundColor: 'rgb(236, 227, 199)',
    });
  });

  it('keeps drawing controls hidden and defaults to map interaction mode', () => {
    renderMapCanvas();

    expect(screen.queryByTestId('map-drawing-toolbar')).not.toBeInTheDocument();
    expect(useEditorStore.getState().canvasInteractionMode).toBe('map');
  });

  it('uses the map-mode cursor on empty canvas by default', () => {
    renderMapCanvas();

    expect(screen.getByTestId('map-canvas')).toHaveClass('map-canvas--map-mode');
    expect(screen.getByTestId('map-canvas')).not.toHaveClass('map-canvas--draw-mode');
    expect(screen.getByTestId('map-canvas')).not.toHaveClass('map-canvas--pan-ready');
  });

  it('forces persisted draw mode back to map mode', async () => {
    useEditorStore.getState().setCanvasInteractionMode('draw');

    renderMapCanvas();

    await waitFor(() => {
      expect(useEditorStore.getState().canvasInteractionMode).toBe('map');
    });
    expect(screen.getByTestId('map-canvas')).toHaveClass('map-canvas--map-mode');
    expect(screen.getByTestId('map-canvas')).not.toHaveClass('map-canvas--draw-mode');
  });

  it('keeps room and sticky-note pointer interaction enabled', () => {
    const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
    const stickyNote = { ...createStickyNote('Check desk'), position: { x: 240, y: 120 } };
    loadDocumentAct({
      ...addRoom(createEmptyMap('Test'), room),
      stickyNotes: { [stickyNote.id]: stickyNote },
    });

    renderMapCanvas();

    expect(screen.getByTestId('room-node')).not.toHaveStyle({ pointerEvents: 'none' });
    expect(screen.getByTestId('sticky-note')).not.toHaveStyle({ pointerEvents: 'none' });
  });

  it('renders room items beneath the room name', () => {
    const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
    let doc = addRoom(createEmptyMap('Test'), room);
    doc = addItem(doc, createItem('Lantern', room.id));
    doc = addItem(doc, createItem('Brass Key', room.id));
    loadDocumentAct(doc);

    renderMapCanvas();

    expect(screen.getByText('Lantern')).toBeInTheDocument();
    expect(screen.getByText('Brass Key')).toBeInTheDocument();
    const itemText = document.querySelector('.room-node-items');
    expect(itemText).toHaveAttribute('text-anchor', 'end');
  });

  it('renders pseudo-rooms beneath sticky notes and rooms', () => {
    const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
    const pseudoRoom = { ...createPseudoRoom('unknown'), position: { x: 240, y: 120 } };
    const stickyNote = { ...createStickyNote('Check desk'), position: { x: 400, y: 120 } };
    let doc = addRoom(createEmptyMap('Test'), room);
    doc = addPseudoRoom(doc, pseudoRoom);
    doc = addStickyNote(doc, stickyNote);
    loadDocumentAct(doc);

    renderMapCanvas();

    const content = screen.getByTestId('map-canvas-content');
    const pseudoNode = screen.getByTestId('pseudo-room-node');
    const stickyNoteNode = screen.getByTestId('sticky-note').closest('.sticky-note-wrapper');
    const roomNode = screen.getByTestId('room-node');
    const children = Array.from(content.children);

    expect(children.indexOf(pseudoNode)).toBeGreaterThan(-1);
    expect(children.indexOf(stickyNoteNode as HTMLElement)).toBeGreaterThan(children.indexOf(pseudoNode));
    expect(children.indexOf(roomNode)).toBeGreaterThan(children.indexOf(pseudoNode));
    expect(pseudoNode).toHaveClass('pseudo-room-node');
  });

  it('keeps connection and sticky-note-link pointer interaction enabled', () => {
    const roomA = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
    const roomB = { ...createRoom('Hallway'), position: { x: 240, y: 120 } };
    const stickyNote = { ...createStickyNote('Check desk'), position: { x: 80, y: 240 } };
    const stickyNoteLink = createStickyNoteLink(stickyNote.id, roomB.id);
    let doc = addRoom(createEmptyMap('Test'), roomA);
    doc = addRoom(doc, roomB);
    doc = addConnection(doc, createConnection(roomA.id, roomB.id, true), 'east', 'west');
    doc = {
      ...doc,
      stickyNotes: { [stickyNote.id]: stickyNote },
      stickyNoteLinks: { [stickyNoteLink.id]: stickyNoteLink },
    };
    const connectionId = Object.keys(doc.connections)[0];
    loadDocumentAct(doc);

    renderMapCanvas();

    expect(screen.getByTestId(`connection-hit-target-${connectionId}`)).not.toHaveStyle({ pointerEvents: 'none' });
    expect(screen.getByTestId(`sticky-note-link-hit-target-${stickyNoteLink.id}`)).not.toHaveStyle({ pointerEvents: 'none' });
  });

  it('keeps connection overlays transparent while leaving connection hit targets interactive', () => {
    const roomA = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
    const roomB = { ...createRoom('Hallway'), position: { x: 240, y: 120 } };
    let doc = addRoom(createEmptyMap('Test'), roomA);
    doc = addRoom(doc, roomB);
    doc = addConnection(doc, createConnection(roomA.id, roomB.id, true), 'east', 'west');
    const connectionId = Object.keys(doc.connections)[0];
    loadDocumentAct(doc);

    renderMapCanvas();

    expect(screen.getByTestId('connection-svg-overlay')).toHaveStyle({ pointerEvents: 'none' });
    expect(screen.getByTestId('connection-reroute-overlay')).toHaveStyle({ pointerEvents: 'none' });
    expect(screen.getByTestId(`connection-hit-target-${connectionId}`)).not.toHaveStyle({ pointerEvents: 'none' });
  });

  it('uses the pan-ready cursor when Shift is held in map mode', () => {
    renderMapCanvas();

    fireEvent.keyDown(window, { key: 'Shift', shiftKey: true });

    expect(screen.getByTestId('map-canvas')).toHaveClass('map-canvas--pan-ready');

    fireEvent.keyUp(window, { key: 'Shift', shiftKey: false });

    expect(screen.getByTestId('map-canvas')).not.toHaveClass('map-canvas--pan-ready');
  });

  it('uses the move cursor over sticky notes in map mode', () => {
    const stickyNote = { ...createStickyNote('Check desk'), position: { x: 240, y: 120 } };
    loadDocumentAct({
      ...createEmptyMap('Test'),
      stickyNotes: { [stickyNote.id]: stickyNote },
    });

    renderMapCanvas();

    expect(screen.getByTestId('sticky-note')).toHaveStyle({ cursor: 'move' });
  });

  it('hides the background drawing layer', () => {
    const doc = createEmptyMap('Test');
    loadDocumentAct({
      ...doc,
      background: {
        activeLayerId: 'layer-1',
        referenceImage: null,
        layers: {
          'layer-1': {
            id: 'layer-1',
            name: 'Sketch',
            visible: true,
            opacity: 1,
            pixelSize: 1,
            chunkSize: 256,
          },
        },
      },
    });

    renderMapCanvas();

    expect(screen.queryByTestId('map-drawing-toolbar')).not.toBeInTheDocument();
    expect(screen.queryByTestId('map-canvas-background')).not.toBeInTheDocument();
  });

  it('renders a stored background reference image centered on the map origin', () => {
    const doc = createEmptyMap('Test');
    loadDocumentAct({
      ...doc,
      background: {
        ...doc.background,
        referenceImage: {
          id: 'background-image-1',
          name: 'overlay.png',
          mimeType: 'image/png',
          dataUrl: 'data:image/png;base64,AAAA',
          sourceUrl: null,
          width: 400,
          height: 200,
          zoom: 1.5,
          position: { x: 0, y: 0 },
        },
      },
    });

    renderMapCanvas();

    const image = screen.getByTestId('map-canvas-reference-image');
    expect(image).toHaveStyle({
      left: '-300px',
      top: '-150px',
      width: '600px',
      height: '300px',
    });
  });

  it('re-centers the background reference image with Alt-drag', () => {
    const doc = createEmptyMap('Test');
    loadDocumentAct({
      ...doc,
      background: {
        ...doc.background,
        referenceImage: {
          id: 'background-image-1',
          name: 'overlay.png',
          mimeType: 'image/png',
          dataUrl: 'data:image/png;base64,AAAA',
          sourceUrl: null,
          width: 400,
          height: 200,
          zoom: 1,
          position: { x: 0, y: 0 },
        },
      },
    });

    renderMapCanvas();

    const image = screen.getByTestId('map-canvas-reference-image');
    fireEvent.mouseDown(image, { clientX: 200, clientY: 160, altKey: true });
    fireEvent.mouseMove(document, { clientX: 260, clientY: 200 });
    fireEvent.mouseUp(document);

    expect(useEditorStore.getState().doc?.background.referenceImage?.position).toEqual({ x: 60, y: 40 });
    expect(image).toHaveStyle({
      left: '-140px',
      top: '-60px',
    });
  });

  it('re-centers the background reference image with Command-drag', () => {
    const doc = createEmptyMap('Test');
    loadDocumentAct({
      ...doc,
      background: {
        ...doc.background,
        referenceImage: {
          id: 'background-image-1',
          name: 'overlay.png',
          mimeType: 'image/png',
          dataUrl: 'data:image/png;base64,AAAA',
          sourceUrl: null,
          width: 400,
          height: 200,
          zoom: 1,
          position: { x: 0, y: 0 },
        },
      },
    });

    renderMapCanvas();

    const image = screen.getByTestId('map-canvas-reference-image');
    fireEvent.mouseDown(image, { clientX: 200, clientY: 160, metaKey: true });
    fireEvent.mouseMove(document, { clientX: 240, clientY: 220 });
    fireEvent.mouseUp(document);

    expect(useEditorStore.getState().doc?.background.referenceImage?.position).toEqual({ x: 40, y: 60 });
    expect(image).toHaveStyle({
      left: '-160px',
      top: '-40px',
    });
  });

  it('does not re-center the background reference image without Alt-drag', () => {
    const doc = createEmptyMap('Test');
    loadDocumentAct({
      ...doc,
      background: {
        ...doc.background,
        referenceImage: {
          id: 'background-image-1',
          name: 'overlay.png',
          mimeType: 'image/png',
          dataUrl: 'data:image/png;base64,AAAA',
          sourceUrl: null,
          width: 400,
          height: 200,
          zoom: 1,
          position: { x: 0, y: 0 },
        },
      },
    });

    renderMapCanvas();

    const image = screen.getByTestId('map-canvas-reference-image');
    fireEvent.mouseDown(image, { clientX: 200, clientY: 160 });
    fireEvent.mouseMove(document, { clientX: 260, clientY: 200 });
    fireEvent.mouseUp(document);

    expect(useEditorStore.getState().doc?.background.referenceImage?.position).toEqual({ x: 0, y: 0 });
    expect(image).toHaveStyle({
      left: '-200px',
      top: '-100px',
    });
  });

  it('hides the background grid when showGrid is false', () => {
    renderMapCanvas({ showGrid: false });
    const canvas = screen.getByTestId('map-canvas');
    expect(canvas).not.toHaveClass('map-canvas--grid');
  });

  it('updates grid visibility in editor state', () => {
    loadDocumentAct(createEmptyMap('Test'));
    renderMapCanvas();

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
    loadDocumentAct(createEmptyMap('Test'));
    renderMapCanvas();

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
    loadDocumentAct(addRoom(createEmptyMap('Test'), room));
    useEditorStore.getState().selectRoom(room.id);

    renderMapCanvas();

    await user.click(screen.getByRole('button', { name: 'Export PNG' }));

    expect(useEditorStore.getState().selectedRoomIds).toEqual([room.id]);
    expect(screen.getByRole('heading', { name: 'Export PNG' })).toBeInTheDocument();
  });

  it('opens a requested room editor', async () => {
    const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
    loadDocumentAct(addRoom(createEmptyMap('Test'), room));

    render(
      <MapCanvas
        mapName="Test"
        requestedRoomEditorRequest={{ roomId: room.id, requestId: 1 }}
      />,
    );

    expect(await screen.findByLabelText('Room name')).toHaveValue('Kitchen');
  });

  describe('map panning', () => {
    it('pans the map when shift-dragging empty canvas space', () => {
      const doc = createEmptyMap('Test');
      loadDocumentAct(doc);

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      const content = screen.getByTestId('map-canvas-content');

      fireEvent.mouseDown(canvas, { clientX: 100, clientY: 120, button: 0, shiftKey: true });
      fireEvent.mouseMove(document, { clientX: 160, clientY: 180 });

      expect(content.style.transform).toBe('translate(60px, 60px) scale(1)');
      expect(canvas).toHaveClass('map-canvas--panning');

      fireEvent.mouseUp(document, { clientX: 160, clientY: 180 });
      expect(canvas).not.toHaveClass('map-canvas--panning');
    });

    it('persists pan offset into the loaded map after panning settles', () => {
      jest.useFakeTimers();
      const doc = createEmptyMap('Test');
      loadDocumentAct(doc);

      renderMapCanvas();

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

    it('creates rooms in map coordinates after panning once the draft is saved', async () => {
      const user = userEvent.setup();
      const doc = createEmptyMap('Test');
      loadDocumentAct(doc);

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');

      fireEvent.mouseDown(canvas, { clientX: 100, clientY: 100, button: 1 });
      fireEvent.mouseMove(document, { clientX: 180, clientY: 140 });
      fireEvent.mouseUp(document, { clientX: 180, clientY: 140 });

      fireEvent.keyDown(window, { key: 'r' });
      fireEvent.click(canvas, { clientX: 120, clientY: 120 });
      await user.click(screen.getByRole('button', { name: /save room editor/i }));

      const rooms = Object.values(useEditorStore.getState().doc!.rooms);
      expect(rooms).toHaveLength(1);
      expect(rooms[0].position.x).toBeCloseTo(0, 5);
      expect(rooms[0].position.y).toBe(40);
    });

    it('clicking the minimap recenters the map content', () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 300, y: 200 } };
      loadDocumentAct(addRoom(doc, room));

      renderMapCanvas();

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
      loadDocumentAct(addRoom(doc, room));

      renderMapCanvas();

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
      loadDocumentAct(addRoom(doc, room));
      act(() => {
        useEditorStore.getState().selectRoom(room.id);
      });

      renderMapCanvas();

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
      loadDocumentAct(updated);
      useEditorStore.getState().selectConnection(connectionId);

      renderMapCanvas();

      fireEvent.click(screen.getByTestId('map-canvas'), { clientX: 20, clientY: 20, button: 0 });

      expect(useEditorStore.getState().selectedConnectionIds).toEqual([]);
    });

    it('does not pan on left mouse drag over empty canvas', () => {
      const doc = createEmptyMap('Test');
      loadDocumentAct(doc);

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      const content = screen.getByTestId('map-canvas-content');

      fireEvent.mouseDown(canvas, { clientX: 100, clientY: 120, button: 0 });
      fireEvent.mouseMove(document, { clientX: 160, clientY: 180 });
      fireEvent.mouseUp(document, { clientX: 160, clientY: 180 });

      expect(content.style.transform).toBe('translate(0px, 0px) scale(1)');
      expect(canvas).not.toHaveClass('map-canvas--panning');
    });

    it('pans the map on trackpad-style wheel gestures over the canvas', () => {
      const doc = createEmptyMap('Test');
      loadDocumentAct(doc);

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      const content = screen.getByTestId('map-canvas-content');

      fireEvent.wheel(canvas, { deltaX: 20, deltaY: 30 });

      expect(content.style.transform).toBe('translate(-20px, -30px) scale(1)');
    });

    it('ignores meta-wheel gestures on the canvas', () => {
      const doc = createEmptyMap('Test');
      loadDocumentAct(doc);

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      const content = screen.getByTestId('map-canvas-content');

      fireEvent.wheel(canvas, { deltaX: 20, deltaY: 30, metaKey: true });

      expect(content.style.transform).toBe('translate(0px, 0px) scale(1)');
    });

  it('zooms the map on ctrl-wheel gestures', () => {
      const doc = createEmptyMap('Test');
      loadDocumentAct(doc);

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      const content = screen.getByTestId('map-canvas-content');
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

      fireEvent.wheel(canvas, { clientX: 150, clientY: 100, deltaX: 20, deltaY: -30, ctrlKey: true });

    expect(content.style.transform).toContain('scale(1.1)');
    expect(content.style.transform).toContain('translate(-15');
  });

  it('restores persisted zoom from the map view', () => {
    const doc = createEmptyMap('Test');
    loadDocumentAct({
      ...doc,
      view: {
        ...doc.view,
        zoom: 1.5,
      },
    });

    renderMapCanvas();

    expect(screen.getByTestId('map-canvas-content').style.transform).toBe('translate(0px, 0px) scale(1.5)');
  });

  it('persists zoom changes back to the map view', () => {
    jest.useFakeTimers();
    const doc = createEmptyMap('Test');
    loadDocumentAct(doc);

    renderMapCanvas();

    const canvas = screen.getByTestId('map-canvas');
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

    fireEvent.wheel(canvas, { clientX: 150, clientY: 100, deltaY: -30, ctrlKey: true });
    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(useEditorStore.getState().doc?.view.zoom).toBeCloseTo(1.1);
    jest.useRealTimers();
  });

    it('zooms the map with keyboard shortcuts and resets with 0', () => {
      const doc = createEmptyMap('Test');
      loadDocumentAct(doc);

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      const content = screen.getByTestId('map-canvas-content');
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

      canvas.focus();
      fireEvent.keyDown(canvas, { key: '+' });
      expect(content.style.transform).toContain('scale(1.1)');

      fireEvent.keyDown(canvas, { key: '-' });
      expect(content.style.transform).toBe('translate(0px, 0px) scale(1)');

      fireEvent.keyDown(canvas, { key: '+' });
      fireEvent.keyDown(canvas, { key: '0' });
      expect(content.style.transform).toBe('translate(0px, 0px) scale(1)');
    });

    it('does not create a sticky note when shift-dragging to pan', () => {
      const doc = createEmptyMap('Test');
      loadDocumentAct(doc);

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.mouseDown(canvas, { clientX: 100, clientY: 120, button: 0, shiftKey: true });
      fireEvent.mouseMove(document, { clientX: 160, clientY: 180, shiftKey: true });
      fireEvent.mouseUp(document, { clientX: 160, clientY: 180, button: 0, shiftKey: true });

      expect(Object.values(useEditorStore.getState().doc!.stickyNotes)).toHaveLength(0);
    });

    it('draws a red selection box while dragging on the background', () => {
      const doc = createEmptyMap('Test');
      loadDocumentAct(doc);

      renderMapCanvas();

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
      loadDocumentAct(updated);

      renderMapCanvas();

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

    it('selects sticky notes live as they enter the marquee selection region', () => {
      const nearNote = { ...createStickyNote('Check desk'), position: { x: 80, y: 120 } };
      const farNote = { ...createStickyNote('Remember cellar'), position: { x: 320, y: 120 } };
      loadDocumentAct({
        ...createEmptyMap('Test'),
        stickyNotes: {
          [nearNote.id]: nearNote,
          [farNote.id]: farNote,
        },
      });

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');

      fireEvent.mouseDown(canvas, { clientX: 20, clientY: 20, button: 0 });
      fireEvent.mouseMove(document, { clientX: 220, clientY: 180 });

      expect(screen.getByTestId('sticky-note-selection-outline')).toBeInTheDocument();
      expect(useEditorStore.getState().selectedStickyNoteIds).toEqual([nearNote.id]);

      fireEvent.mouseMove(document, { clientX: 520, clientY: 200 });

      expect(useEditorStore.getState().selectedStickyNoteIds).toEqual([nearNote.id, farNote.id]);

      fireEvent.mouseUp(document, { clientX: 520, clientY: 200, button: 0 });
    });

    it('selects sticky-note links live as they enter the marquee selection region', () => {
      const room = { ...createRoom('Kitchen'), position: { x: 280, y: 120 } };
      const stickyNote = { ...createStickyNote('Check desk'), position: { x: 80, y: 120 } };
      const stickyNoteLink = createStickyNoteLink(stickyNote.id, room.id);
      loadDocumentAct({
        ...addRoom(createEmptyMap('Test'), room),
        stickyNotes: { [stickyNote.id]: stickyNote },
        stickyNoteLinks: { [stickyNoteLink.id]: stickyNoteLink },
      });

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');

      fireEvent.mouseDown(canvas, { clientX: 140, clientY: 120, button: 0 });
      fireEvent.mouseMove(document, { clientX: 220, clientY: 170 });

      expect(useEditorStore.getState().selectedStickyNoteLinkIds).toEqual([stickyNoteLink.id]);
      expect(screen.getByTestId(`sticky-note-link-selection-${stickyNoteLink.id}`)).toBeInTheDocument();

      fireEvent.mouseUp(document, { clientX: 220, clientY: 170, button: 0 });
    });

    it('captures connections in marquee selection', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 240, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      updated = addConnection(updated, createConnection(kitchen.id, hallway.id, true), 'east', 'west');
      const connectionId = Object.keys(updated.connections)[0];
      loadDocumentAct(updated);

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.mouseDown(canvas, { clientX: 60, clientY: 100, button: 0 });
      fireEvent.mouseMove(document, { clientX: 320, clientY: 180 });

      expect(useEditorStore.getState().selectedRoomIds).toEqual([kitchen.id, hallway.id]);
      expect(useEditorStore.getState().selectedConnectionIds).toEqual([connectionId]);

      fireEvent.mouseUp(document, { clientX: 320, clientY: 180, button: 0 });
    });

    it('includes pseudo-rooms in marquee selection and mixed dragging', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const unknown = { ...createPseudoRoom('unknown'), position: { x: 240, y: 80 } };
      let updated = addRoom(doc, kitchen);
      updated = addPseudoRoom(updated, unknown);
      updated = addConnection(updated, createConnection(kitchen.id, { kind: 'pseudo-room', id: unknown.id }, false), 'east');
      loadDocumentAct(updated);

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.mouseDown(canvas, { clientX: 20, clientY: 20, button: 0 });
      fireEvent.mouseMove(document, { clientX: 420, clientY: 220 });

      expect(useEditorStore.getState().selectedRoomIds).toEqual([kitchen.id]);
      expect(useEditorStore.getState().selectedPseudoRoomIds).toEqual([unknown.id]);
      expect(screen.getByTestId('pseudo-room-selection-outline')).toBeInTheDocument();

      const kitchenNode = screen.getByText('Kitchen').closest('[data-testid="room-node"]') as HTMLElement;
      const pseudoRoomNode = screen.getByTestId('pseudo-room-node');
      fireEvent.mouseUp(document, { clientX: 420, clientY: 220, button: 0 });

      fireEvent.mouseDown(kitchenNode, { clientX: 120, clientY: 140, button: 0 });
      fireEvent.mouseMove(document, { clientX: 180, clientY: 200 });

      expect(pseudoRoomNode).toHaveStyle({ transform: 'translate(300px, 140px)' });

      fireEvent.mouseUp(document, { clientX: 180, clientY: 200, button: 0 });

      expect(useEditorStore.getState().doc!.pseudoRooms[unknown.id].position).toEqual({ x: 320, y: 160 });
    });
  });

  describe('keyboard shortcuts', () => {
    it('undoes with Ctrl+Z', () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      loadDocumentAct(addRoom(doc, room));
      useEditorStore.getState().renameRoom(room.id, 'Pantry');

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      canvas.focus();
      fireEvent.keyDown(canvas, { key: 'z', ctrlKey: true });

      expect(useEditorStore.getState().doc!.rooms[room.id].name).toBe('Kitchen');
    });

    it('redoes with Ctrl+Y', () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      loadDocumentAct(addRoom(doc, room));
      useEditorStore.getState().renameRoom(room.id, 'Pantry');
      useEditorStore.getState().undo();

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      canvas.focus();
      fireEvent.keyDown(canvas, { key: 'y', ctrlKey: true });

      expect(useEditorStore.getState().doc!.rooms[room.id].name).toBe('Pantry');
    });

    it('redoes with Shift+Meta+Z', () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      loadDocumentAct(addRoom(doc, room));
      useEditorStore.getState().renameRoom(room.id, 'Pantry');
      useEditorStore.getState().undo();

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      canvas.focus();
      fireEvent.keyDown(canvas, { key: 'Z', metaKey: true, shiftKey: true });

      expect(useEditorStore.getState().doc!.rooms[room.id].name).toBe('Pantry');
    });

    it('does not trigger undo while editing a room field', async () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      loadDocumentAct(addRoom(doc, room));
      useEditorStore.getState().renameRoom(room.id, 'Pantry');
      const user = userEvent.setup();

      renderMapCanvas();

      await user.dblClick(screen.getByText('Pantry'));

      const nameInput = screen.getByLabelText(/room name/i);
      fireEvent.keyDown(nameInput, { key: 'z', ctrlKey: true });

      expect(useEditorStore.getState().doc!.rooms[room.id].name).toBe('Pantry');
    });

    it('undoes a burst of typing in the room name input as one step', async () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      loadDocumentAct(addRoom(doc, room));
      const user = userEvent.setup();

      renderMapCanvas();

      await user.dblClick(screen.getByText('Kitchen'));

      const nameInput = screen.getByLabelText(/room name/i);
      await user.type(nameInput, 'ab');
      fireEvent.keyDown(nameInput, { key: 'Escape' });

      const canvas = screen.getByTestId('map-canvas');
      canvas.focus();
      fireEvent.keyDown(canvas, { key: 'z', ctrlKey: true });

      expect(useEditorStore.getState().doc!.rooms[room.id].name).toBe('Kitchen');
    });

    it('does not toggle drawing mode with the D key', () => {
      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.keyDown(canvas, { key: 'd' });
      expect(useEditorStore.getState().canvasInteractionMode).toBe('map');
    });

    it('does not toggle drawing mode with D when the canvas is not focused', () => {
      renderMapCanvas();

      fireEvent.keyDown(window, { key: 'd' });
      expect(useEditorStore.getState().canvasInteractionMode).toBe('map');
    });

    it('does not toggle drawing mode with D while editing a room field', async () => {
      const user = userEvent.setup();
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      loadDocumentAct(addRoom(doc, room));

      renderMapCanvas();

      await user.dblClick(screen.getByText('Kitchen'));
      const nameInput = screen.getByLabelText('Room name');
      nameInput.focus();

      fireEvent.keyDown(nameInput, { key: 'd' });
      expect(useEditorStore.getState().canvasInteractionMode).toBe('map');
    });

    it('undoes and redoes from window shortcuts when focus is elsewhere', () => {
      const doc = createEmptyMap('Test');
      loadDocumentAct(doc);
      const roomId = useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 0, y: 0 });

      renderMapCanvas();

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
      loadDocumentAct(updated);

      renderMapCanvas();

      return {
        kitchenNode: screen.getByText('Kitchen').closest('[data-testid="room-node"]') as HTMLElement,
        hallwayNode: screen.getByText('Hallway').closest('[data-testid="room-node"]') as HTMLElement,
      };
    }

    it('renders room nodes from the editor store', () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const docWithRoom = addRoom(doc, room);
      loadDocumentAct(docWithRoom);

      renderMapCanvas();

      expect(screen.getByText('Kitchen')).toBeInTheDocument();
    });

    it('positions room nodes using CSS transform', () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const docWithRoom = addRoom(doc, room);
      loadDocumentAct(docWithRoom);

      renderMapCanvas();

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
      loadDocumentAct(d);

      renderMapCanvas();

      expect(screen.getByText('Kitchen')).toBeInTheDocument();
      expect(screen.getByText('Hallway')).toBeInTheDocument();
    });

    it('renders a lock glyph to the left of a locked room name', () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), locked: true, position: { x: 80, y: 120 } };
      loadDocumentAct(addRoom(doc, room));

      renderMapCanvas();

      expect(screen.getByTestId(`room-lock-glyph-${room.id}`)).toBeInTheDocument();
    });

    it('renders a dark glyph for dark rooms', () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), isDark: true, position: { x: 80, y: 120 } };
      loadDocumentAct(addRoom(doc, room));

      renderMapCanvas();

      expect(screen.getByTestId(`room-dark-glyph-${room.id}`)).toBeInTheDocument();
    });

    it('renders room labels with an explicit theme color', () => {
      document.documentElement.setAttribute('data-theme', 'dark');

      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      loadDocumentAct(addRoom(doc, room));

      renderMapCanvas();

      expect(screen.getByTestId('room-node').querySelector('text')).toHaveStyle({ fill: '#f3f4f6' });
    });

    it('renders no room nodes when document has no rooms', () => {
      const doc = createEmptyMap('Test');
      loadDocumentAct(doc);

      renderMapCanvas();

      expect(screen.queryAllByTestId('room-node')).toHaveLength(0);
    });

    it('single-clicking a room does not open a room name textbox', () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      loadDocumentAct(addRoom(doc, room));

      renderMapCanvas();

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
      loadDocumentAct(updated);
      useEditorStore.getState().selectConnection(connectionId);

      renderMapCanvas();

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
      const baseDoc = createEmptyMap('Test');
      const doc = {
        ...baseDoc,
        view: {
          ...baseDoc.view,
          visualStyle: 'default' as const,
        },
      };
      const room = { ...createRoom('Kitchen'), shape: 'diamond' as const, position: { x: 80, y: 120 } };
      loadDocumentAct(addRoom(doc, room));

      renderMapCanvas();

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
      loadDocumentAct(updated);
      useEditorStore.getState().selectConnection(connectionId);

      renderMapCanvas();

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

    it('deletes the selected room even when focus has moved to the minimap', () => {
      const { kitchenNode } = setupTwoRooms();

      fireEvent.mouseDown(kitchenNode, { clientX: 100, clientY: 140, button: 0 });
      fireEvent.mouseUp(document, { clientX: 100, clientY: 140, button: 0 });

      screen.getByTestId('map-minimap').focus();
      fireEvent.keyDown(window, { key: 'Delete' });

      expect(useEditorStore.getState().selectedRoomIds).toEqual([]);
      expect(Object.keys(useEditorStore.getState().doc!.rooms)).toHaveLength(1);
      expect(screen.queryAllByTestId('room-node')).toHaveLength(1);
    });

    it('ignores Delete when nothing is selected', () => {
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      loadDocumentAct(addRoom(createEmptyMap('Test'), room));

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      canvas.focus();
      fireEvent.keyDown(canvas, { key: 'Delete' });

      expect(useEditorStore.getState().doc?.rooms[room.id]).toBeDefined();
      expect(useEditorStore.getState().selectedRoomIds).toEqual([]);
    });

    it('moves selection to the nearest room on the right when ArrowRight is pressed', () => {
      const doc = createEmptyMap('Test');
      const origin = { ...createRoom('Origin'), position: { x: 80, y: 120 } };
      const right = { ...createRoom('Right'), position: { x: 220, y: 120 } };
      const downRight = { ...createRoom('Down Right'), position: { x: 200, y: 240 } };
      let updated = addRoom(doc, origin);
      updated = addRoom(updated, right);
      updated = addRoom(updated, downRight);
      loadDocumentAct(updated);

      renderMapCanvas();

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
      loadDocumentAct(updated);

      renderMapCanvas();

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
      loadDocumentAct(updated);

      renderMapCanvas();

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
      expect(content.style.transform).toBe('translate(-392px, -62px) scale(1)');
      expect(content).toHaveClass('map-canvas-content--animated');
    });

    it('ignores non-transform and child transition events while auto-pan animation is active', () => {
      const doc = createEmptyMap('Test');
      const origin = { ...createRoom('Origin'), position: { x: 80, y: 120 } };
      const right = { ...createRoom('Right'), position: { x: 500, y: 120 } };
      let updated = addRoom(doc, origin);
      updated = addRoom(updated, right);
      loadDocumentAct(updated);

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      const content = screen.getByTestId('map-canvas-content');
      const originNode = screen.getByText('Origin').closest('[data-testid="room-node"]') as HTMLElement;
      const rightNode = screen.getByText('Right').closest('[data-testid="room-node"]') as HTMLElement;

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

      expect(content).toHaveClass('map-canvas-content--animated');

      fireEvent.transitionEnd(rightNode, { propertyName: 'transform' });
      expect(content).toHaveClass('map-canvas-content--animated');

      fireEvent.transitionEnd(content, { propertyName: 'opacity' });
      expect(content).toHaveClass('map-canvas-content--animated');
    });

    it('keeps the current selection when no room exists in that direction', () => {
      const doc = createEmptyMap('Test');
      const origin = { ...createRoom('Origin'), position: { x: 80, y: 120 } };
      const right = { ...createRoom('Right'), position: { x: 220, y: 120 } };
      let updated = addRoom(doc, origin);
      updated = addRoom(updated, right);
      loadDocumentAct(updated);

      renderMapCanvas();

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
      loadDocumentAct(addRoom(doc, room));

      renderMapCanvas();

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
      expect(content.style.transform).toBe('translate(368px, -120px) scale(1)');
      expect(content).toHaveClass('map-canvas-content--animated');
    });

    it('ignores Enter when more than one room is selected', () => {
      const { kitchenNode, hallwayNode } = setupTwoRooms();
      const canvas = screen.getByTestId('map-canvas');

      fireEvent.mouseDown(kitchenNode, { clientX: 100, clientY: 140, button: 0 });
      fireEvent.mouseUp(document, { clientX: 100, clientY: 140, button: 0 });

      fireEvent.mouseDown(hallwayNode, { clientX: 220, clientY: 140, button: 0, shiftKey: true });
      fireEvent.mouseUp(document, { clientX: 220, clientY: 140, button: 0, shiftKey: true });

      fireEvent.keyDown(canvas, { key: 'Enter' });

      expect(screen.queryByTestId('room-editor-overlay')).not.toBeInTheDocument();
    });

    it('ignores arrow-key navigation when no room is selected', () => {
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      loadDocumentAct(addRoom(createEmptyMap('Test'), room));

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      canvas.focus();
      fireEvent.keyDown(canvas, { key: 'ArrowRight' });

      expect(useEditorStore.getState().selectedRoomIds).toEqual([]);
    });

    it('draws the selected room outline as a bright red rounded rectangle', () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      loadDocumentAct(addRoom(doc, room));
      act(() => {
        useEditorStore.getState().selectRoom(room.id);
      });

      renderMapCanvas();

      const outline = screen.getByTestId('room-selection-outline');
      expect(outline.tagName.toLowerCase()).toBe('rect');
      expect(outline).toHaveAttribute('rx', '12');
      expect(outline).toHaveClass('room-selection-outline');
    });
  });

  it('opens the selected room editor when Enter is pressed on the focused canvas', async () => {
    const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
    loadDocumentAct(addRoom(createEmptyMap('Test'), room));
    useEditorStore.getState().selectRoom(room.id);

    renderMapCanvas();

    const canvas = screen.getByLabelText('Map canvas');
    canvas.focus();
    fireEvent.keyDown(canvas, { key: 'Enter' });

    expect(await screen.findByLabelText('Room name')).toHaveValue('Kitchen');
  });

  it('keeps room nodes out of tab order while preserving canvas-owned keyboard navigation', async () => {
    const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
    const hallway = { ...createRoom('Hallway'), position: { x: 240, y: 120 } };
    let doc = createEmptyMap('Test');
    doc = addRoom(doc, kitchen);
    doc = addRoom(doc, hallway);
    loadDocumentAct(doc);
    useEditorStore.getState().selectRoom(kitchen.id);

    renderMapCanvas();

    const canvas = screen.getByLabelText('Map canvas');
    const kitchenNode = screen.getByRole('button', { name: 'Kitchen, selected' });

    expect(kitchenNode).toHaveAttribute('tabindex', '-1');

    canvas.focus();
    fireEvent.keyDown(canvas, { key: 'ArrowRight' });

    expect(canvas).toHaveFocus();
    expect(useEditorStore.getState().selectedRoomIds).toEqual([hallway.id]);
    expect(canvas).toHaveAttribute('aria-activedescendant', getMapCanvasRoomNodeId(hallway.id));

    fireEvent.keyDown(canvas, { key: 'Enter' });
    expect(await screen.findByLabelText('Room name')).toHaveValue('Hallway');
  });

  it('keeps keyboard room navigation anchored on the canvas without horizontal document scroll', () => {
    const origin = { ...createRoom('Origin'), position: { x: 0, y: 0 } };
    const farRight = { ...createRoom('Far Right'), position: { x: 2400, y: 0 } };
    let doc = createEmptyMap('Test');
    doc = addRoom(doc, origin);
    doc = addRoom(doc, farRight);
    loadDocumentAct(doc);
    useEditorStore.getState().selectRoom(origin.id);

    renderMapCanvas();

    const canvas = screen.getByTestId('map-canvas');
    const minimap = screen.getByTestId('map-minimap');
    const content = screen.getByTestId('map-canvas-content');
    const initialMinimapStyle = minimap.getAttribute('style');

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

    Object.defineProperty(window, 'scrollX', {
      configurable: true,
      value: 0,
    });
    Object.defineProperty(document.documentElement, 'scrollLeft', {
      configurable: true,
      value: 0,
      writable: true,
    });

    canvas.focus();
    fireEvent.keyDown(canvas, { key: 'ArrowRight' });

    expect(canvas).toHaveFocus();
    expect(window.scrollX).toBe(0);
    expect(document.documentElement.scrollLeft).toBe(0);
    expect(minimap.getAttribute('style')).toBe(initialMinimapStyle);
    expect(content.style.transform).not.toBe('translate(0px, 0px) scale(1)');
    expect(screen.getByRole('button', { name: 'Far Right, selected' })).toHaveAttribute('tabindex', '-1');
  });

  describe('room editor overlay', () => {
    function setupRoom(visualStyle: 'default' | 'square-classic' = 'square-classic') {
      const baseDoc = createEmptyMap('Test');
      const doc = {
        ...baseDoc,
        view: {
          ...baseDoc.view,
          visualStyle,
        },
      };
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      loadDocumentAct(addRoom(doc, room));
      renderMapCanvas();
      return screen.getByText('Kitchen').closest('[data-testid="room-node"]') as HTMLElement;
    }

    it('pans the map to place the edited room in the visible horizontal center and about one third from the top', async () => {
      const user = userEvent.setup();
      const room = { ...createRoom('Kitchen'), position: { x: 40, y: 320 } };
      const doc = addRoom(createEmptyMap('Test'), room);
      loadDocumentAct(doc);

      renderMapCanvas({ visibleMapLeftInset: 240 });

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

      expect(content.style.transform).toBe('translate(488px, -120px) scale(1)');
      expect(content).toHaveClass('map-canvas-content--animated');
      expect(screen.getByTestId('room-editor-dialog')).toHaveStyle({
        justifySelf: 'start',
        marginLeft: '296px',
      });
    });

    it('opens the room editor overlay on double-click', async () => {
      const user = userEvent.setup();
      const roomNode = setupRoom();

      await user.dblClick(roomNode);

      expect(screen.getByTestId('room-editor-overlay')).toBeInTheDocument();
      expect(screen.getByTestId('room-editor-dialog')).toBeInTheDocument();
      expect(screen.getByTestId('map-canvas-scene')).toHaveClass('map-canvas-scene--editor-open');
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

    it('keeps room name edits local until saved', async () => {
      const user = userEvent.setup();
      const roomNode = setupRoom();

      await user.dblClick(roomNode);

      const nameInput = screen.getByTestId('room-editor-name-input');

      await user.clear(nameInput);
      await user.type(nameInput, 'Pantry');

      const room = Object.values(useEditorStore.getState().doc!.rooms)[0];
      expect(room.name).toBe('Kitchen');
      expect(nameInput).toHaveValue('Pantry');
      expect(room.description).toBe('');
      expect(screen.queryByTestId('room-editor-description-input')).not.toBeInTheDocument();
    });

    it('applies room draft edits when saved', async () => {
      const user = userEvent.setup();
      const roomNode = setupRoom('default');

      await user.dblClick(roomNode);
      const nameInput = screen.getByTestId('room-editor-name-input');
      await user.clear(nameInput);
      await user.type(nameInput, 'Pantry');
      await user.click(screen.getByTestId('room-shape-option-diamond'));
      await user.click(screen.getByTestId('room-fill-color-chip-2'));
      await user.click(screen.getByTestId('room-stroke-color-chip-4'));
      await user.selectOptions(screen.getByLabelText('Stroke style'), 'dashed');
      await user.click(screen.getByLabelText('Dark room'));
      await user.click(screen.getByRole('button', { name: /save room editor/i }));

      const room = Object.values(useEditorStore.getState().doc!.rooms)[0];
      expect(room.name).toBe('Pantry');
      expect(room.shape).toBe('diamond');
      expect(room.isDark).toBe(true);
      expect(room.fillColorIndex).toBe(2);
      expect(room.strokeColorIndex).toBe(4);
      expect(room.strokeStyle).toBe('dashed');
      expect(screen.getByTestId('room-node')).toHaveAttribute('data-room-shape', 'diamond');
      expect(screen.getByTestId('room-node').querySelector('polygon.room-node-shape')).not.toBeNull();
      expect(screen.queryByTestId('room-editor-overlay')).not.toBeInTheDocument();
    });

    it('hides room-shape editing and wraps labels in square-classic mode', async () => {
      const user = userEvent.setup();
      const roomNode = setupRoom();

      act(() => {
        useEditorStore.getState().setMapVisualStyle('square-classic');
        useEditorStore.getState().renameRoom(Object.values(useEditorStore.getState().doc!.rooms)[0].id, 'A very long kitchen name');
      });

      const renderedRoomNode = screen.getByTestId('room-node');
      expect(renderedRoomNode).toHaveAttribute('data-map-visual-style', 'square-classic');
      expect(renderedRoomNode.querySelector('rect.room-node-shape')).not.toBeNull();
      expect(renderedRoomNode.querySelectorAll('text tspan').length).toBeGreaterThan(1);

      await user.dblClick(roomNode);

      expect(screen.queryByTestId('room-shape-option-diamond')).not.toBeInTheDocument();
    });

    it('previews room style options in the room editor without applying them immediately', async () => {
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
      expect(room.fillColorIndex).toBe(0);
      expect(room.strokeColorIndex).toBe(0);
      expect(room.strokeStyle).toBe('solid');

      const canvasShape = screen.getByTestId('room-node').querySelector('.room-node-shape') as SVGElement;

      expect(canvasShape).not.toHaveStyle({ fill: '#ffcc00', stroke: '#166534', strokeDasharray: '8 5' });
      expect(screen.getByTestId('room-fill-color-chip-2')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('room-stroke-color-chip-4')).toHaveAttribute('aria-checked', 'true');
      expect(strokeStyleInput).toHaveValue('dashed');
    });

    it('keeps the selected room style controls when the theme changes', async () => {
      const user = userEvent.setup();
      const roomNode = setupRoom();

      await user.dblClick(roomNode);
      await user.click(screen.getByTestId('room-fill-color-chip-2'));
      await user.click(screen.getByTestId('room-stroke-color-chip-4'));

      expect(screen.getByTestId('room-fill-color-chip-2')).toHaveAttribute('aria-checked', 'true');
      expect(screen.getByTestId('room-stroke-color-chip-4')).toHaveAttribute('aria-checked', 'true');

      document.documentElement.setAttribute('data-theme', 'dark');

      await waitFor(() => {
        expect(screen.getByTestId('room-fill-color-chip-2')).toHaveAttribute('aria-checked', 'true');
        expect(screen.getByTestId('room-stroke-color-chip-4')).toHaveAttribute('aria-checked', 'true');
      });
    });

    it('pressing Enter in the room name field saves and closes the room editor', async () => {
      const user = userEvent.setup();
      const roomNode = setupRoom();

      await user.dblClick(roomNode);

      const nameInput = screen.getByTestId('room-editor-name-input');
      await user.clear(nameInput);
      await user.type(nameInput, 'Pantry');
      fireEvent.keyDown(nameInput, { key: 'Enter' });

      expect(screen.queryByTestId('room-editor-overlay')).not.toBeInTheDocument();
      expect(Object.values(useEditorStore.getState().doc!.rooms)[0].name).toBe('Pantry');
    });

    it('cancels the room editor on Escape', async () => {
      const user = userEvent.setup();
      const roomNode = setupRoom();

      await user.dblClick(roomNode);
      const nameInput = screen.getByTestId('room-editor-name-input');
      await user.clear(nameInput);
      await user.type(nameInput, 'Pantry');
      await user.keyboard('{Escape}');

      expect(screen.queryByTestId('room-editor-overlay')).not.toBeInTheDocument();
      expect(Object.values(useEditorStore.getState().doc!.rooms)[0].name).toBe('Kitchen');
    });

    it('cancels the room editor on Escape even when another control is focused', async () => {
      const user = userEvent.setup();
      const roomNode = setupRoom();

      await user.dblClick(roomNode);
      const nameInput = screen.getByTestId('room-editor-name-input');
      await user.clear(nameInput);
      await user.type(nameInput, 'Pantry');
      const strokeStyleInput = screen.getByLabelText('Stroke style');
      strokeStyleInput.focus();

      await user.keyboard('{Escape}');

      expect(screen.queryByTestId('room-editor-overlay')).not.toBeInTheDocument();
      expect(Object.values(useEditorStore.getState().doc!.rooms)[0].name).toBe('Kitchen');
    });

    it('cancels the room editor from the cancel button', async () => {
      const user = userEvent.setup();
      const roomNode = setupRoom();

      await user.dblClick(roomNode);
      const nameInput = screen.getByTestId('room-editor-name-input');
      await user.clear(nameInput);
      await user.type(nameInput, 'Pantry');
      await user.click(screen.getByRole('button', { name: /cancel room editor/i }));

      expect(screen.queryByTestId('room-editor-overlay')).not.toBeInTheDocument();
      expect(Object.values(useEditorStore.getState().doc!.rooms)[0].name).toBe('Kitchen');
    });

    it('cancels the room editor when clicking the backdrop', async () => {
      const user = userEvent.setup();
      const roomNode = setupRoom();

      await user.dblClick(roomNode);
      const nameInput = screen.getByTestId('room-editor-name-input');
      await user.clear(nameInput);
      await user.type(nameInput, 'Pantry');
      await user.click(screen.getByTestId('room-editor-overlay').querySelector('.room-editor-backdrop') as HTMLElement);

      expect(screen.queryByTestId('room-editor-overlay')).not.toBeInTheDocument();
      expect(Object.values(useEditorStore.getState().doc!.rooms)[0].name).toBe('Kitchen');
      expect(useEditorStore.getState().selectedRoomIds).toEqual([]);
      expect(useEditorStore.getState().selectedConnectionIds).toEqual([]);
    });
  });

  /* ---- R then click to create room ---- */

  describe('R then click to create room', () => {
    it('opens a new-room draft on background click after pressing R without creating the room yet', () => {
      const doc = createEmptyMap('Test');
      loadDocumentAct(doc);

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.keyDown(window, { key: 'r' });
      fireEvent.click(canvas, { clientX: 200, clientY: 300 });

      const rooms = Object.values(useEditorStore.getState().doc!.rooms);
      expect(rooms).toHaveLength(0);
      expect(screen.getByRole('textbox', { name: /room name/i })).toHaveValue('Room');
    });

    it('creates the new room only when the draft is saved', async () => {
      const user = userEvent.setup();
      const doc = createEmptyMap('Test');
      loadDocumentAct(doc);

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.keyDown(window, { key: 'r' });
      fireEvent.click(canvas, { clientX: 200, clientY: 300 });

      const nameInput = screen.getByRole('textbox', { name: /room name/i });
      await user.clear(nameInput);
      await user.type(nameInput, 'Pantry');
      await user.click(screen.getByRole('button', { name: /save room editor/i }));

      const rooms = Object.values(useEditorStore.getState().doc!.rooms);
      expect(rooms).toHaveLength(1);
      expect(rooms[0].name).toBe('Pantry');
    });

    it('does not create the new room when the draft is cancelled', async () => {
      const user = userEvent.setup();
      const doc = createEmptyMap('Test');
      loadDocumentAct(doc);

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.keyDown(window, { key: 'r' });
      fireEvent.click(canvas, { clientX: 200, clientY: 300 });

      const nameInput = screen.getByRole('textbox', { name: /room name/i });
      await user.clear(nameInput);
      await user.type(nameInput, 'Pantry');
      await user.click(screen.getByRole('button', { name: /cancel room editor/i }));

      expect(Object.values(useEditorStore.getState().doc!.rooms)).toHaveLength(0);
      expect(screen.queryByRole('textbox', { name: /room name/i })).not.toBeInTheDocument();
    });

    it('does not create a room on a background click without pressing R first', () => {
      const doc = createEmptyMap('Test');
      loadDocumentAct(doc);

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.click(canvas, { clientX: 200, clientY: 300 });

      expect(Object.values(useEditorStore.getState().doc!.rooms)).toHaveLength(0);
      expect(screen.queryByRole('textbox', { name: /room name/i })).not.toBeInTheDocument();
    });

    it('snaps the room position to the grid when the new room is saved', async () => {
      const user = userEvent.setup();
      const doc = createEmptyMap('Test');
      loadDocumentAct(doc);

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.keyDown(window, { key: 'r' });
      fireEvent.click(canvas, { clientX: 55, clientY: 85 });
      await user.click(screen.getByRole('button', { name: /save room editor/i }));

      const rooms = Object.values(useEditorStore.getState().doc!.rooms);
      expect(rooms[0].position).toEqual({ x: 0, y: 40 });
    });

    it('pans to the new room before opening the room editor', () => {
      const doc = createEmptyMap('Test');
      loadDocumentAct(doc);

      renderMapCanvas();

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

      fireEvent.keyDown(window, { key: 'r' });
      fireEvent.click(canvas, { clientX: 100, clientY: 100 });

      const dimensions = getRoomNodeDimensions(createRoom('Room'), 'square-classic');
      const expectedTopLeft = {
        x: 100 - (dimensions.width / 2),
        y: 100 - (dimensions.height / 2),
      };
      expect(content.style.transform).toBe(`translate(350px, ${(600 / 3) - expectedTopLeft.y}px) scale(1)`);
      expect(content).toHaveClass('map-canvas-content--animated');
      expect(screen.getByTestId('room-editor-overlay')).toBeInTheDocument();
    });

    it('opens the room editor for a new room without creating it immediately', async () => {
      const user = userEvent.setup();
      const doc = createEmptyMap('Test');
      loadDocumentAct(doc);

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.keyDown(window, { key: 'r' });
      fireEvent.click(canvas, { clientX: 100, clientY: 100 });

      expect(screen.getByTestId('room-editor-overlay')).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: /room name/i })).toBeInTheDocument();
      expect(Object.values(useEditorStore.getState().doc!.rooms)).toHaveLength(0);

      await user.click(screen.getByRole('button', { name: /save room editor/i }));

      const room = Object.values(useEditorStore.getState().doc!.rooms)[0];
      expect(room.shape).toBe('rectangle');
    });

    it('treats a room-placement click as the center of the new room', async () => {
      const user = userEvent.setup();
      const doc = createEmptyMap('Test');
      loadDocumentAct(doc);
      useEditorStore.getState().toggleSnapToGrid();

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.keyDown(window, { key: 'r' });
      fireEvent.click(canvas, { clientX: 200, clientY: 300 });
      await user.click(screen.getByRole('button', { name: /save room editor/i }));

      const room = Object.values(useEditorStore.getState().doc!.rooms)[0];
      const dimensions = getRoomNodeDimensions(createRoom('Room'), 'square-classic');
      expect(room.position).toEqual({
        x: 200 - (dimensions.width / 2),
        y: 300 - (dimensions.height / 2),
      });
    });

    it('only arms room placement for a single click', () => {
      const doc = createEmptyMap('Test');
      loadDocumentAct(doc);

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.keyDown(window, { key: 'r' });
      fireEvent.click(canvas, { clientX: 100, clientY: 100 });
      fireEvent.click(canvas, { clientX: 140, clientY: 140 });

      expect(screen.getByTestId('room-editor-overlay')).toBeInTheDocument();
      expect(Object.values(useEditorStore.getState().doc!.rooms)).toHaveLength(0);
    });

    it('does not arm room placement when R is pressed while a text input is focused', () => {
      const doc = createEmptyMap('Test');
      loadDocumentAct(doc);

      renderMapCanvas();

      const externalInput = document.createElement('input');
      document.body.append(externalInput);
      externalInput.focus();

      try {
        fireEvent.keyDown(window, { key: 'r' });

        const canvas = screen.getByTestId('map-canvas');
        fireEvent.click(canvas, { clientX: 100, clientY: 100 });

        expect(screen.queryByTestId('room-editor-overlay')).not.toBeInTheDocument();
        expect(Object.values(useEditorStore.getState().doc!.rooms)).toHaveLength(0);
      } finally {
        externalInput.remove();
      }
    });

    it('cancels room placement when Escape is pressed before the click', () => {
      const doc = createEmptyMap('Test');
      loadDocumentAct(doc);

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.keyDown(window, { key: 'r' });
      fireEvent.keyDown(window, { key: 'Escape' });
      fireEvent.click(canvas, { clientX: 100, clientY: 100 });

      expect(screen.queryByTestId('room-editor-overlay')).not.toBeInTheDocument();
      expect(Object.values(useEditorStore.getState().doc!.rooms)).toHaveLength(0);
    });
  });

  describe('sticky notes', () => {
    it('creates a sticky note after pressing N and clicking without entering edit mode', () => {
      const doc = createEmptyMap('Test');
      loadDocumentAct(doc);

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.keyDown(window, { key: 'n' });
      fireEvent.click(canvas, { clientX: 200, clientY: 300 });

      const stickyNotes = Object.values(useEditorStore.getState().doc!.stickyNotes);
      expect(stickyNotes).toHaveLength(1);
      expect(screen.queryByTestId('sticky-note-textarea')).not.toBeInTheDocument();
    });

    it('treats a sticky-note placement click as the center of the new note', () => {
      const doc = createEmptyMap('Test');
      loadDocumentAct(doc);
      useEditorStore.getState().toggleSnapToGrid();

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.keyDown(window, { key: 'n' });
      fireEvent.click(canvas, { clientX: 200, clientY: 300 });

      const stickyNote = Object.values(useEditorStore.getState().doc!.stickyNotes)[0];
      expect(stickyNote.position).toEqual({
        x: 200 - (STICKY_NOTE_WIDTH / 2),
        y: 300 - (getStickyNoteHeight('') / 2),
      });
    });

    it('only arms note placement for a single click', () => {
      const doc = createEmptyMap('Test');
      loadDocumentAct(doc);

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.keyDown(window, { key: 'n' });
      fireEvent.click(canvas, { clientX: 200, clientY: 300 });
      fireEvent.click(canvas, { clientX: 240, clientY: 340 });

      const stickyNotes = Object.values(useEditorStore.getState().doc!.stickyNotes);
      expect(stickyNotes).toHaveLength(1);
    });

    it('cancels note placement when Escape is pressed before the click', () => {
      const doc = createEmptyMap('Test');
      loadDocumentAct(doc);

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.keyDown(window, { key: 'n' });
      fireEvent.keyDown(window, { key: 'Escape' });
      fireEvent.click(canvas, { clientX: 200, clientY: 300 });

      expect(Object.values(useEditorStore.getState().doc!.stickyNotes)).toHaveLength(0);
    });

    it('opens sticky note editing on double-click', async () => {
      const user = userEvent.setup();
      const doc = createEmptyMap('Test');
      loadDocumentAct(doc);

      renderMapCanvas();
      fireEvent.keyDown(window, { key: 'n' });
      fireEvent.click(screen.getByTestId('map-canvas'), { clientX: 200, clientY: 300 });
      const noteElement = screen.getByTestId('sticky-note');
      const initialMinHeight = noteElement.style.minHeight;

      await user.dblClick(screen.getByTestId('sticky-note'));

      expect(screen.getByTestId('sticky-note-textarea')).toBeInTheDocument();
      expect(noteElement.style.minHeight).toBe(initialMinHeight);
    });

    it('shows the room-style selection outline around a selected sticky note', () => {
      const doc = createEmptyMap('Test');
      loadDocumentAct(doc);

      renderMapCanvas();
      fireEvent.keyDown(window, { key: 'n' });
      fireEvent.click(screen.getByTestId('map-canvas'), { clientX: 200, clientY: 300 });

      expect(screen.getByTestId('sticky-note-selection-outline')).toBeInTheDocument();
    });

    it('creates a sticky-note link when dragging from a note link handle to a room', () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 240, y: 120 } };
      loadDocumentAct(addRoom(doc, room));

      renderMapCanvas();

      fireEvent.keyDown(window, { key: 'n' });
      fireEvent.click(screen.getByTestId('map-canvas'), { clientX: 80, clientY: 120 });

      const linkHandle = screen.getByTestId('sticky-note-link-handle');
      const roomNode = screen.getByTestId('room-node');

      fireEvent.mouseDown(linkHandle, { clientX: 100, clientY: 140, button: 0 });
      fireEvent.mouseMove(document, { clientX: 240, clientY: 140 });
      expect(screen.getByTestId('sticky-note-link-preview')).toBeInTheDocument();
      fireEvent.mouseUp(roomNode, { clientX: 260, clientY: 140, button: 0 });

      const stickyNoteLinkId = Object.values(useEditorStore.getState().doc!.stickyNoteLinks)[0].id;
      expect(Object.values(useEditorStore.getState().doc!.stickyNoteLinks)).toHaveLength(1);
      expect(screen.getByTestId(`sticky-note-link-${stickyNoteLinkId}`)).toBeInTheDocument();
    });

    it('creates a sticky-note link when dragging from a note link handle to a pseudo-room', () => {
      const pseudoRoom = { ...createPseudoRoom('unknown'), position: { x: 240, y: 120 } };
      const doc = addPseudoRoom(createEmptyMap('Test'), pseudoRoom);
      loadDocumentAct(doc);

      renderMapCanvas();

      fireEvent.keyDown(window, { key: 'n' });
      fireEvent.click(screen.getByTestId('map-canvas'), { clientX: 80, clientY: 120 });

      const linkHandle = screen.getByTestId('sticky-note-link-handle');
      const pseudoRoomNode = screen.getByTestId('pseudo-room-node');

      fireEvent.mouseDown(linkHandle, { clientX: 100, clientY: 140, button: 0 });
      fireEvent.mouseMove(document, { clientX: 240, clientY: 140 });
      expect(screen.getByTestId('sticky-note-link-preview')).toBeInTheDocument();
      fireEvent.mouseUp(pseudoRoomNode, { clientX: 260, clientY: 140, button: 0 });

      const stickyNoteLinks = Object.values(useEditorStore.getState().doc!.stickyNoteLinks);

      expect(stickyNoteLinks).toHaveLength(1);
      expect(stickyNoteLinks[0]).toMatchObject({
        target: { kind: 'pseudo-room', id: pseudoRoom.id },
      });
    });

    it('shift-clicking a sticky-note link adds it to a mixed selection', () => {
      const room = { ...createRoom('Kitchen'), position: { x: 240, y: 120 } };
      const stickyNote = { ...createStickyNote('Check desk'), position: { x: 80, y: 120 } };
      let doc = addRoom(createEmptyMap('Test'), room);
      doc = {
        ...doc,
        stickyNotes: { [stickyNote.id]: stickyNote },
      };
      const stickyNoteLink = createStickyNoteLink(stickyNote.id, room.id);
      doc = {
        ...doc,
        stickyNoteLinks: { [stickyNoteLink.id]: stickyNoteLink },
      };
      loadDocumentAct(doc);

      renderMapCanvas();

      act(() => {
        useEditorStore.getState().selectRoom(room.id);
      });
      fireEvent.click(screen.getByTestId(`sticky-note-link-hit-target-${stickyNoteLink.id}`), { shiftKey: true });

      expect(useEditorStore.getState().selectedRoomIds).toEqual([room.id]);
      expect(useEditorStore.getState().selectedStickyNoteLinkIds).toEqual([stickyNoteLink.id]);
      expect(screen.getByTestId(`sticky-note-link-selection-${stickyNoteLink.id}`)).toBeInTheDocument();
    });

    it('grows vertically as note text grows', async () => {
      const user = userEvent.setup();
      const doc = createEmptyMap('Test');
      const stickyNote = { ...createStickyNote('Short'), position: { x: 80, y: 120 } };
      loadDocumentAct({
        ...doc,
        stickyNotes: { [stickyNote.id]: stickyNote },
      });
      useEditorStore.getState().selectStickyNote(stickyNote.id);

      renderMapCanvas();

      await user.dblClick(screen.getByTestId('sticky-note'));
      const noteElement = screen.getByTestId('sticky-note');
      const initialMinHeight = noteElement.style.minHeight;
      await user.type(screen.getByTestId('sticky-note-textarea'), '\nA second line of text that should make the note taller.');

      expect(noteElement.style.minHeight).not.toBe(initialMinHeight);
    });

    it('drags other selected rooms in parallel when dragging a selected sticky note', () => {
      const room = { ...createRoom('Kitchen'), position: { x: 240, y: 120 } };
      const stickyNote = { ...createStickyNote('Check desk'), position: { x: 80, y: 120 } };
      loadDocumentAct({
        ...addRoom(createEmptyMap('Test'), room),
        stickyNotes: { [stickyNote.id]: stickyNote },
      });
      useEditorStore.getState().setSelection([room.id], [stickyNote.id], [], []);

      renderMapCanvas();

      const note = screen.getByTestId('sticky-note');

      fireEvent.mouseDown(note, { clientX: 100, clientY: 140, button: 0 });
      fireEvent.mouseMove(document, { clientX: 160, clientY: 180 });
      fireEvent.mouseUp(document, { clientX: 160, clientY: 180, button: 0 });

      const nextDoc = useEditorStore.getState().doc!;
      expect(nextDoc.stickyNotes[stickyNote.id].position).toEqual({ x: 160, y: 160 });
      expect(nextDoc.rooms[room.id].position).toEqual({ x: 320, y: 160 });
    });
  });

  /* ---- Directional handles on hover ---- */

  describe('directional handles', () => {
    const DIRECTIONS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];

    function setupRoomAndHover(roomOverride?: Partial<ReturnType<typeof createRoom>>) {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 }, ...roomOverride };
      const docWithRoom = addRoom(doc, room);
      loadDocumentAct(docWithRoom);

      renderMapCanvas();

      const roomNode = screen.getByTestId('room-node');
      fireEvent.mouseEnter(roomNode);
      return roomNode;
    }

    it('shows 10 directional handles when hovering over a room', () => {
      setupRoomAndHover();

      const handles = screen.getAllByTestId(/^direction-handle-/);
      expect(handles).toHaveLength(10);
    });

    it.each(DIRECTIONS)('shows a handle for the %s direction', (dir) => {
      setupRoomAndHover();

      expect(screen.getByTestId(`direction-handle-${dir}`)).toBeInTheDocument();
    });

    it('shows handles for the up and down directions', () => {
      setupRoomAndHover();

      expect(screen.getByTestId('direction-handle-up')).toBeInTheDocument();
      expect(screen.getByTestId('direction-handle-down')).toBeInTheDocument();
    });

    it('renders handle circles at the shared SVG geometry coordinates', () => {
      setupRoomAndHover({ shape: 'rectangle' });

      const handle = screen.getByTestId('direction-handle-ne');
      const expectedOffset = getHandleOffset('northeast', getRoomNodeDimensions(createRoom('Kitchen'), 'square-classic'));

      expect(handle.getAttribute('cx')).toBe(String(expectedOffset?.x));
      expect(handle.getAttribute('cy')).toBe(String(expectedOffset?.y));
    });

    it('hides directional handles when the mouse leaves the room', () => {
      const roomNode = setupRoomAndHover();

      // Handles should be visible
      expect(screen.getAllByTestId(/^direction-handle-/)).toHaveLength(10);

      fireEvent.mouseLeave(roomNode);

      expect(screen.queryAllByTestId(/^direction-handle-/)).toHaveLength(0);
    });

    it('does not show directional handles before hover', () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const docWithRoom = addRoom(doc, room);
      loadDocumentAct(docWithRoom);

      renderMapCanvas();

      expect(screen.queryAllByTestId(/^direction-handle-/)).toHaveLength(0);
    });

    it('still responds to hover and double-click when another connection crosses over it', async () => {
      const user = userEvent.setup();
      const doc = createEmptyMap('Crossing Hover');
      const northOfHouse = { ...createRoom('North of House'), id: 'north', position: { x: 120, y: 20 } };
      const kitchen = { ...createRoom('Kitchen'), id: 'kitchen', position: { x: 80, y: 120 } };
      const westOfHouse = { ...createRoom('West of House'), id: 'west', position: { x: 80, y: 220 } };
      const attic = { ...createRoom('Attic'), id: 'attic', position: { x: 80, y: -80 } };
      let nextDoc = addRoom(doc, northOfHouse);
      nextDoc = addRoom(nextDoc, kitchen);
      nextDoc = addRoom(nextDoc, westOfHouse);
      nextDoc = addRoom(nextDoc, attic);
      nextDoc = addConnection(nextDoc, createConnection(westOfHouse.id, northOfHouse.id, true), 'north', 'west');
      nextDoc = addConnection(nextDoc, createConnection(kitchen.id, attic.id, true), 'up', 'down');
      loadDocumentAct(nextDoc);

      renderMapCanvas();

      const kitchenNode = screen.getByText('Kitchen').closest('[data-testid="room-node"]');
      expect(kitchenNode).not.toBeNull();

      fireEvent.mouseEnter(kitchenNode!);
      expect(screen.getAllByTestId(/^direction-handle-/)).toHaveLength(10);

      await user.dblClick(kitchenNode!);
      expect(screen.getByTestId('room-editor-overlay')).toBeInTheDocument();
    });

    it('opens the room editor for a newly created room', () => {
      const doc = createEmptyMap('Test');
      loadDocumentAct(doc);

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.keyDown(window, { key: 'r' });
      fireEvent.click(canvas, { clientX: 100, clientY: 100 });

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
      loadDocumentAct(docWithRoom);

      renderMapCanvas();

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

    it('uses map-space deltas for room drags while zoomed', () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      loadDocumentAct({
        ...addRoom(doc, room),
        view: {
          ...doc.view,
          zoom: 2,
        },
      });

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 400,
        bottom: 300,
        width: 400,
        height: 300,
        toJSON: () => ({}),
      });

      const roomNode = screen.getByTestId('room-node');

      fireEvent.mouseDown(roomNode, { clientX: 100, clientY: 140, button: 0 });
      fireEvent.mouseMove(document, { clientX: 180, clientY: 180 });

      expect(roomNode.style.transform).toBe('translate(120px, 140px)');

      fireEvent.mouseUp(document, { clientX: 180, clientY: 180 });

      expect(useEditorStore.getState().doc!.rooms[room.id].position).toEqual({ x: 120, y: 160 });
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
      loadDocumentAct(updated);
      useEditorStore.getState().selectRoom(kitchen.id);
      useEditorStore.getState().addRoomToSelection(hallway.id);

      renderMapCanvas();

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
      loadDocumentAct(updated);
      useEditorStore.getState().selectRoom(kitchen.id);
      useEditorStore.getState().addRoomToSelection(hallway.id);

      renderMapCanvas();

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

    it('undoes a mixed room, pseudo-room, and sticky-note drag as one history step', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const pseudoRoom = { ...createPseudoRoom('unknown'), position: { x: 240, y: 120 } };
      const stickyNote = { ...createStickyNote('Check desk'), position: { x: 360, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addPseudoRoom(updated, pseudoRoom);
      updated = addStickyNote(updated, stickyNote);
      loadDocumentAct(updated);
      useEditorStore.getState().selectRoom(kitchen.id);
      useEditorStore.getState().addPseudoRoomToSelection(pseudoRoom.id);
      useEditorStore.getState().addStickyNoteToSelection(stickyNote.id);

      renderMapCanvas();

      const kitchenNode = screen.getByText('Kitchen').closest('[data-testid="room-node"]') as HTMLElement;
      const canvas = screen.getByTestId('map-canvas');

      fireEvent.mouseDown(kitchenNode, { clientX: 100, clientY: 140, button: 0 });
      fireEvent.mouseMove(document, { clientX: 160, clientY: 180 });
      fireEvent.mouseUp(document, { clientX: 160, clientY: 180 });

      let currentDoc = useEditorStore.getState().doc!;
      expect(currentDoc.rooms[kitchen.id].position).toEqual({ x: 160, y: 160 });
      expect(currentDoc.pseudoRooms[pseudoRoom.id].position).toEqual({ x: 320, y: 160 });
      expect(currentDoc.stickyNotes[stickyNote.id].position).toEqual({ x: 440, y: 160 });

      canvas.focus();
      fireEvent.keyDown(canvas, { key: 'z', ctrlKey: true });

      currentDoc = useEditorStore.getState().doc!;
      expect(currentDoc.rooms[kitchen.id].position).toEqual({ x: 80, y: 120 });
      expect(currentDoc.pseudoRooms[pseudoRoom.id].position).toEqual({ x: 240, y: 120 });
      expect(currentDoc.stickyNotes[stickyNote.id].position).toEqual({ x: 360, y: 120 });
    });

    it('updates all selected room positions live while dragging', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 200, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      loadDocumentAct(updated);
      useEditorStore.getState().selectRoom(kitchen.id);
      useEditorStore.getState().addRoomToSelection(hallway.id);

      renderMapCanvas();

      const kitchenNode = screen.getByText('Kitchen').closest('[data-testid="room-node"]') as HTMLElement;
      const hallwayNode = screen.getByText('Hallway').closest('[data-testid="room-node"]') as HTMLElement;

      fireEvent.mouseDown(kitchenNode, { clientX: 100, clientY: 140, button: 0 });
      fireEvent.mouseMove(document, { clientX: 130, clientY: 160 });

      expect(kitchenNode.style.transform).toBe('translate(110px, 140px)');
      expect(hallwayNode.style.transform).toBe('translate(230px, 140px)');

      fireEvent.mouseUp(document, { clientX: 130, clientY: 160 });
    });

    it('does not move a locked room when dragged', () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), locked: true, position: { x: 80, y: 120 } };
      loadDocumentAct(addRoom(doc, room));

      renderMapCanvas();

      const roomNode = screen.getByText('Kitchen').closest('[data-testid="room-node"]') as HTMLElement;

      fireEvent.mouseDown(roomNode, { clientX: 100, clientY: 140, button: 0 });
      fireEvent.mouseMove(document, { clientX: 160, clientY: 180 });
      fireEvent.mouseUp(document, { clientX: 160, clientY: 180 });

      expect(useEditorStore.getState().doc!.rooms[room.id].position).toEqual({ x: 80, y: 120 });
      expect(roomNode.style.transform).toBe('translate(80px, 120px)');
    });

    it('does not preview locked rooms as moving during a mixed drag', () => {
      const doc = createEmptyMap('Test');
      const lockedRoom = { ...createRoom('Locked'), locked: true, position: { x: 80, y: 120 } };
      const freeRoom = { ...createRoom('Free'), position: { x: 200, y: 120 } };
      let updated = addRoom(doc, lockedRoom);
      updated = addRoom(updated, freeRoom);
      loadDocumentAct(updated);
      useEditorStore.getState().selectRoom(lockedRoom.id);
      useEditorStore.getState().addRoomToSelection(freeRoom.id);

      renderMapCanvas();

      const freeRoomNode = screen.getByText('Free').closest('[data-testid="room-node"]') as HTMLElement;
      const lockedRoomNode = screen.getByText('Locked').closest('[data-testid="room-node"]') as HTMLElement;

      fireEvent.mouseDown(freeRoomNode, { clientX: 220, clientY: 140, button: 0 });
      fireEvent.mouseMove(document, { clientX: 260, clientY: 180 });

      expect(freeRoomNode.style.transform).toBe('translate(240px, 160px)');
      expect(lockedRoomNode.style.transform).toBe('translate(80px, 120px)');

      fireEvent.mouseUp(document, { clientX: 260, clientY: 180 });
    });
  });

  describe('room locking', () => {
    it('toggles the selected rooms with L and ignores non-room selections', () => {
      const doc = createEmptyMap('Test');
      const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const stickyNote = { ...createStickyNote('todo'), position: { x: 200, y: 120 } };
      let updated = addRoom(doc, room);
      updated = addStickyNote(updated, stickyNote);
      loadDocumentAct(updated);
      useEditorStore.getState().setSelection([room.id], [stickyNote.id], [], []);

      renderMapCanvas();

      const canvas = screen.getByTestId('map-canvas');
      canvas.focus();
      fireEvent.keyDown(canvas, { key: 'l' });

      expect(useEditorStore.getState().doc!.rooms[room.id].locked).toBe(true);
      expect(useEditorStore.getState().doc!.stickyNotes[stickyNote.id].position).toEqual({ x: 200, y: 120 });

      fireEvent.keyDown(canvas, { key: 'L' });

      expect(useEditorStore.getState().doc!.rooms[room.id].locked).toBe(false);
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
      loadDocumentAct(d);
      return { kitchenId: kitchen.id, hallwayId: hallway.id };
    }

    it('starts a connection drag on mousedown on a direction handle', () => {
      setupTwoRooms();
      renderMapCanvas();

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

    it('starts a vertical connection drag on mousedown on the up handle', () => {
      setupTwoRooms();
      renderMapCanvas();

      const roomNodes = screen.getAllByTestId('room-node');
      const kitchenNode = roomNodes.find((n) => n.textContent === 'Kitchen')!;
      fireEvent.mouseEnter(kitchenNode);

      const handle = within(kitchenNode).getByTestId('direction-handle-up');
      fireEvent.mouseDown(handle, { clientX: 120, clientY: 218, button: 0 });

      const drag = useEditorStore.getState().connectionDrag;
      expect(drag).not.toBeNull();
      expect(drag!.sourceDirection).toBe('up');
    });

    it('shows an SVG preview polyline during connection drag', () => {
      setupTwoRooms();
      renderMapCanvas();

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
      renderMapCanvas();

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
      renderMapCanvas();

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
      expect(connections[0].target).toEqual({ kind: 'room', id: hallwayId });
      expect(connections[0].isBidirectional).toBe(false);

      // Direction bindings — fallback to opposite
      expect(doc.rooms[kitchenId].directions['north']).toBe(connections[0].id);
      expect(doc.rooms[hallwayId].directions['south']).toBe(connections[0].id);

      // Drag state cleared
      expect(useEditorStore.getState().connectionDrag).toBeNull();
    });

    it('uses the target handle direction when dropping on a direction handle', () => {
      const { kitchenId, hallwayId } = setupTwoRooms();
      renderMapCanvas();

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
      renderMapCanvas();

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
      expect(connections[0].target).toEqual({ kind: 'room', id: kitchenId });
      expect(connections[0].isBidirectional).toBe(false);
    });

    it('creates a bidirectional self-connection when releasing on another handle of the same room', () => {
      const { kitchenId } = setupTwoRooms();
      renderMapCanvas();

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
      expect(connections[0].target).toEqual({ kind: 'room', id: kitchenId });
      expect(connections[0].isBidirectional).toBe(true);
      expect(doc.rooms[kitchenId].directions['north']).toBe(connections[0].id);
      expect(doc.rooms[kitchenId].directions['east']).toBe(connections[0].id);
    });

    it('cancels silently when releasing on the same handle', () => {
      setupTwoRooms();
      renderMapCanvas();

      const roomNodes = screen.getAllByTestId('room-node');
      const kitchenNode = roomNodes.find((n) => n.textContent === 'Kitchen')!;
      fireEvent.mouseEnter(kitchenNode);

      const handle = within(kitchenNode).getByTestId('direction-handle-n');
      fireEvent.mouseDown(handle, { clientX: 100, clientY: 200, button: 0 });
      fireEvent.mouseMove(document, { clientX: 102, clientY: 198 });
      fireEvent.mouseUp(handle, { clientX: 100, clientY: 200 });

      const doc = useEditorStore.getState().doc!;
      expect(Object.values(doc.connections)).toHaveLength(0);
      expect(useEditorStore.getState().connectionDrag).toBeNull();
    });

    it('opens a chooser when releasing on empty canvas and can create a room from it', async () => {
      setupTwoRooms();
      renderMapCanvas();

      const roomNodes = screen.getAllByTestId('room-node');
      const kitchenNode = roomNodes.find((n) => n.textContent === 'Kitchen')!;
      fireEvent.mouseEnter(kitchenNode);

      const handle = screen.getByTestId('direction-handle-n');
      fireEvent.mouseDown(handle, { clientX: 100, clientY: 200, button: 0 });
      fireEvent.mouseMove(document, { clientX: 500, clientY: 500 });

      const canvas = screen.getByTestId('map-canvas');
      fireEvent.mouseUp(canvas, { clientX: 500, clientY: 500 });

      expect(screen.getByTestId('connection-create-menu')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Room' }));

      const doc = useEditorStore.getState().doc!;
      const createdRoom = Object.values(doc.rooms).find((room) => room.name === 'Room');
      expect(createdRoom).toBeDefined();
      expect(createdRoom!.position.x % 40).toBe(0);
      expect(createdRoom!.position.y % 40).toBe(0);
      expect(Object.values(doc.connections)).toHaveLength(1);
      expect(Object.values(doc.connections)[0].isBidirectional).toBe(true);
      expect(doc.rooms[createdRoom!.id].directions).toEqual({ south: Object.values(doc.connections)[0].id });
      expect(await screen.findByTestId('room-editor-overlay')).toBeInTheDocument();
      expect(screen.getByLabelText('Room name')).toHaveValue('Room');
      expect(useEditorStore.getState().connectionDrag).toBeNull();
    });

    it('cancels the empty-drop chooser without creating a connection', () => {
      setupTwoRooms();
      renderMapCanvas();

      const roomNodes = screen.getAllByTestId('room-node');
      const kitchenNode = roomNodes.find((n) => n.textContent === 'Kitchen')!;
      fireEvent.mouseEnter(kitchenNode);

      const handle = screen.getByTestId('direction-handle-n');
      fireEvent.mouseDown(handle, { clientX: 100, clientY: 200, button: 0 });
      fireEvent.mouseMove(document, { clientX: 500, clientY: 500 });
      fireEvent.mouseUp(screen.getByTestId('map-canvas'), { clientX: 500, clientY: 500 });

      expect(screen.getByTestId('connection-create-menu')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

      expect(screen.queryByTestId('connection-create-menu')).not.toBeInTheDocument();
      expect(Object.values(useEditorStore.getState().doc!.connections)).toHaveLength(0);
      expect(useEditorStore.getState().connectionDrag).toBeNull();
    });

    it('can create an unknown pseudo-room from the chooser', () => {
      setupTwoRooms();
      renderMapCanvas();

      const roomNodes = screen.getAllByTestId('room-node');
      const kitchenNode = roomNodes.find((n) => n.textContent === 'Kitchen')!;
      fireEvent.mouseEnter(kitchenNode);

      const handle = screen.getByTestId('direction-handle-n');
      fireEvent.mouseDown(handle, { clientX: 100, clientY: 200, button: 0 });
      fireEvent.mouseMove(document, { clientX: 500, clientY: 500 });
      fireEvent.mouseUp(screen.getByTestId('map-canvas'), { clientX: 500, clientY: 500 });

      fireEvent.click(screen.getByRole('button', { name: 'Unknown' }));

      const doc = useEditorStore.getState().doc!;
      const pseudoRooms = Object.values(doc.pseudoRooms);
      expect(pseudoRooms).toHaveLength(1);
      expect(pseudoRooms[0].kind).toBe('unknown');
      expect(Object.values(doc.connections)[0].target).toEqual({ kind: 'pseudo-room', id: pseudoRooms[0].id });
      expect(screen.getByTestId('pseudo-room-node')).toBeInTheDocument();
    });

    it('can create a death pseudo-room from the chooser', () => {
      setupTwoRooms();
      renderMapCanvas();

      const roomNodes = screen.getAllByTestId('room-node');
      const kitchenNode = roomNodes.find((n) => n.textContent === 'Kitchen')!;
      fireEvent.mouseEnter(kitchenNode);

      const handle = screen.getByTestId('direction-handle-n');
      fireEvent.mouseDown(handle, { clientX: 100, clientY: 200, button: 0 });
      fireEvent.mouseMove(document, { clientX: 500, clientY: 500 });
      fireEvent.mouseUp(screen.getByTestId('map-canvas'), { clientX: 500, clientY: 500 });

      fireEvent.click(screen.getByRole('button', { name: 'Death' }));

      const doc = useEditorStore.getState().doc!;
      const pseudoRooms = Object.values(doc.pseudoRooms);
      expect(pseudoRooms).toHaveLength(1);
      expect(pseudoRooms[0].kind).toBe('death');
      expect(Object.values(doc.connections)[0].target).toEqual({ kind: 'pseudo-room', id: pseudoRooms[0].id });
      expect(screen.getByTestId('pseudo-room-node')).toBeInTheDocument();
    });

    it('can create a nowhere pseudo-room from the chooser', () => {
      setupTwoRooms();
      renderMapCanvas();

      const roomNodes = screen.getAllByTestId('room-node');
      const kitchenNode = roomNodes.find((n) => n.textContent === 'Kitchen')!;
      fireEvent.mouseEnter(kitchenNode);

      const handle = screen.getByTestId('direction-handle-n');
      fireEvent.mouseDown(handle, { clientX: 100, clientY: 200, button: 0 });
      fireEvent.mouseMove(document, { clientX: 500, clientY: 500 });
      fireEvent.mouseUp(screen.getByTestId('map-canvas'), { clientX: 500, clientY: 500 });

      fireEvent.click(screen.getByRole('button', { name: 'Nowhere' }));

      const doc = useEditorStore.getState().doc!;
      const pseudoRooms = Object.values(doc.pseudoRooms);
      expect(pseudoRooms).toHaveLength(1);
      expect(pseudoRooms[0].kind).toBe('nowhere');
      expect(Object.values(doc.connections)[0].target).toEqual({ kind: 'pseudo-room', id: pseudoRooms[0].id });
      expect(screen.getByTestId('pseudo-room-node')).toBeInTheDocument();
    });

    it('can create a somewhere-else pseudo-room from the chooser', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      loadDocumentAct(addRoom(doc, kitchen));

      renderMapCanvas();

      const kitchenNode = screen.getByText('Kitchen').closest('[data-testid="room-node"]') as HTMLElement;
      fireEvent.mouseEnter(kitchenNode);

      const handle = screen.getByTestId('direction-handle-n');
      fireEvent.mouseDown(handle, { clientX: 100, clientY: 120, button: 0 });
      fireEvent.mouseMove(document, { clientX: 220, clientY: 20 });
      fireEvent.mouseUp(screen.getByTestId('map-canvas'), { clientX: 220, clientY: 20 });

      fireEvent.click(screen.getByRole('button', { name: 'Somewhere else' }));

      const currentDoc = useEditorStore.getState().doc!;
      const pseudoRooms = Object.values(currentDoc.pseudoRooms);
      expect(pseudoRooms).toHaveLength(1);
      expect(pseudoRooms[0].kind).toBe('elsewhere');
      expect(Object.values(currentDoc.connections)[0].target).toEqual({ kind: 'pseudo-room', id: pseudoRooms[0].id });
      expect(screen.getByTestId('pseudo-room-node')).toBeInTheDocument();
    });

    it('treats an empty-drop pseudo-room creation point as the center of the pseudo-room', () => {
      setupTwoRooms();
      useEditorStore.getState().toggleSnapToGrid();
      renderMapCanvas();

      const roomNodes = screen.getAllByTestId('room-node');
      const kitchenNode = roomNodes.find((n) => n.textContent === 'Kitchen')!;
      fireEvent.mouseEnter(kitchenNode);

      const handle = screen.getByTestId('direction-handle-n');
      fireEvent.mouseDown(handle, { clientX: 100, clientY: 200, button: 0 });
      fireEvent.mouseMove(document, { clientX: 500, clientY: 500 });
      fireEvent.mouseUp(screen.getByTestId('map-canvas'), { clientX: 500, clientY: 500 });

      fireEvent.click(screen.getByRole('button', { name: 'Unknown' }));

      const pseudoRoom = Object.values(useEditorStore.getState().doc!.pseudoRooms)[0];
      const dimensions = getPseudoRoomNodeDimensions(
        createPseudoRoom('unknown'),
        useEditorStore.getState().mapVisualStyle,
      );
      expect(pseudoRoom.position).toEqual({
        x: 500 - (dimensions.width / 2),
        y: 500 - (dimensions.height / 2),
      });
    });

    it('does not start a room drag when mousedown is on a direction handle', () => {
      const { kitchenId } = setupTwoRooms();
      renderMapCanvas();

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
      renderMapCanvas();

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

  describe('connection rerouting', () => {
    function setupRerouteMap() {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 260, y: 200 } };
      const cellar = { ...createRoom('Cellar'), position: { x: 260, y: 40 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      updated = addRoom(updated, cellar);
      const connection = createConnection(kitchen.id, hallway.id, true);
      updated = addConnection(updated, connection, 'east', 'west');
      loadDocumentAct(updated);
      useEditorStore.getState().selectConnection(connection.id);
      renderMapCanvas();

      return { kitchen, hallway, cellar, connection };
    }

    it('renders reroute handles for a selected connection', () => {
      const { connection } = setupRerouteMap();

      expect(screen.getByTestId(`connection-reroute-handle-${connection.id}-start`)).toBeInTheDocument();
      expect(screen.getByTestId(`connection-reroute-handle-${connection.id}-end`)).toBeInTheDocument();
    });

    it('shows a live preview while rerouting an endpoint', () => {
      const { connection } = setupRerouteMap();

      fireEvent.mouseDown(screen.getByTestId(`connection-reroute-handle-${connection.id}-end`), { clientX: 260, clientY: 220, button: 0 });
      fireEvent.mouseMove(document, { clientX: 260, clientY: 60 });

      expect(screen.getByTestId('connection-reroute-preview-line')).toBeInTheDocument();
    });

    it('reroutes a selected endpoint when dropped on a room body', () => {
      const { connection, hallway, cellar } = setupRerouteMap();

      fireEvent.mouseDown(screen.getByTestId(`connection-reroute-handle-${connection.id}-end`), { clientX: 260, clientY: 220, button: 0 });
      const cellarNode = screen.getAllByTestId('room-node').find((node) => node.textContent === 'Cellar') as HTMLElement;
      fireEvent.mouseUp(cellarNode, { clientX: 280, clientY: 60, button: 0 });

      const doc = useEditorStore.getState().doc!;
      expect(doc.connections[connection.id]).toMatchObject({
        target: { kind: 'room', id: cellar.id },
        isBidirectional: false,
      });
      expect(doc.rooms[hallway.id].directions.west).toBeUndefined();
    });

    it('reroutes a selected endpoint when dropped on a room handle', () => {
      const { connection, hallway, cellar } = setupRerouteMap();

      fireEvent.mouseDown(screen.getByTestId(`connection-reroute-handle-${connection.id}-end`), { clientX: 260, clientY: 220, button: 0 });
      const cellarNode = screen.getAllByTestId('room-node').find((node) => node.textContent === 'Cellar') as HTMLElement;
      fireEvent.mouseEnter(cellarNode);
      fireEvent.mouseUp(within(cellarNode).getByTestId('direction-handle-s'), { clientX: 300, clientY: 76, button: 0 });

      const doc = useEditorStore.getState().doc!;
      expect(doc.connections[connection.id]).toMatchObject({
        target: { kind: 'room', id: cellar.id },
        isBidirectional: true,
      });
      expect(doc.rooms[hallway.id].directions.west).toBeUndefined();
      expect(doc.rooms[cellar.id].directions.south).toBe(connection.id);
    });

    it('cancels rerouting on Escape', () => {
      const { connection } = setupRerouteMap();

      fireEvent.mouseDown(screen.getByTestId(`connection-reroute-handle-${connection.id}-end`), { clientX: 260, clientY: 220, button: 0 });
      fireEvent.mouseMove(document, { clientX: 260, clientY: 60 });
      fireEvent.keyDown(window, { key: 'Escape' });

      expect(useEditorStore.getState().connectionEndpointDrag).toBeNull();
      expect(screen.queryByTestId('connection-reroute-preview-line')).not.toBeInTheDocument();
    });

    it('cancels rerouting when the endpoint is dropped away from any room', () => {
      const { connection, hallway } = setupRerouteMap();

      fireEvent.mouseDown(screen.getByTestId(`connection-reroute-handle-${connection.id}-end`), { clientX: 260, clientY: 220, button: 0 });
      fireEvent.mouseMove(document, { clientX: 420, clientY: 20 });
      fireEvent.mouseUp(document.body, { clientX: 420, clientY: 20, button: 0 });

      const doc = useEditorStore.getState().doc!;
      expect(doc.connections[connection.id]).toMatchObject({
        target: { kind: 'room', id: hallway.id },
        isBidirectional: true,
      });
      expect(useEditorStore.getState().connectionEndpointDrag).toBeNull();
      expect(screen.queryByTestId('connection-reroute-preview-line')).not.toBeInTheDocument();
    });

    it('selects only the dragged connection when rerouting begins', () => {
      const { connection, kitchen } = setupRerouteMap();
      act(() => {
        useEditorStore.setState((state) => ({
          ...state,
          selectedRoomIds: [kitchen.id],
          selectedPseudoRoomIds: ['some-pseudo-room'],
          selectedStickyNoteIds: ['some-sticky-note'],
          selectedConnectionIds: [connection.id],
          selectedStickyNoteLinkIds: ['some-link'],
        }));
      });

      fireEvent.mouseDown(screen.getByTestId(`connection-reroute-handle-${connection.id}-end`), { clientX: 260, clientY: 220, button: 0 });

      expect(useEditorStore.getState().selectedRoomIds).toEqual([]);
      expect(useEditorStore.getState().selectedPseudoRoomIds).toEqual([]);
      expect(useEditorStore.getState().selectedStickyNoteIds).toEqual([]);
      expect(useEditorStore.getState().selectedConnectionIds).toEqual([connection.id]);
      expect(useEditorStore.getState().selectedStickyNoteLinkIds).toEqual([]);
    });

    it('selects only the rerouted connection after rerouting completes', () => {
      const { connection, kitchen, cellar } = setupRerouteMap();
      const stickyNote = { ...createStickyNote('remember this'), id: 'sticky-note-extra', position: { x: 20, y: 20 } };
      const stickyNoteLink = createStickyNoteLink(stickyNote.id, kitchen.id);
      let updatedDoc = useEditorStore.getState().doc!;
      updatedDoc = addStickyNote(updatedDoc, stickyNote);
      updatedDoc = {
        ...updatedDoc,
        stickyNoteLinks: {
          ...updatedDoc.stickyNoteLinks,
          [stickyNoteLink.id]: stickyNoteLink,
        },
      };
      loadDocumentAct(updatedDoc);
      act(() => {
        useEditorStore.setState((state) => ({
          ...state,
          selectedRoomIds: [kitchen.id],
          selectedPseudoRoomIds: ['some-pseudo-room'],
          selectedStickyNoteIds: [stickyNote.id],
          selectedConnectionIds: [connection.id],
          selectedStickyNoteLinkIds: [stickyNoteLink.id],
        }));
      });

      fireEvent.mouseDown(screen.getByTestId(`connection-reroute-handle-${connection.id}-end`), { clientX: 260, clientY: 220, button: 0 });
      const cellarNode = screen.getAllByTestId('room-node').find((node) => node.getAttribute('data-room-id') === cellar.id) as HTMLElement;
      fireEvent.mouseUp(cellarNode, { clientX: 300, clientY: 76, button: 0 });

      expect(useEditorStore.getState().selectedRoomIds).toEqual([]);
      expect(useEditorStore.getState().selectedPseudoRoomIds).toEqual([]);
      expect(useEditorStore.getState().selectedStickyNoteIds).toEqual([]);
      expect(useEditorStore.getState().selectedConnectionIds).toEqual([connection.id]);
      expect(useEditorStore.getState().selectedStickyNoteLinkIds).toEqual([]);
      expect(useEditorStore.getState().doc!.connections[connection.id]).toMatchObject({
        target: { kind: 'room', id: cellar.id },
      });
    });

    it('does not render a reroute preview when the dragged connection is missing', () => {
      const { connection } = setupRerouteMap();

      act(() => {
        useEditorStore.setState({
          connectionEndpointDrag: {
            connectionId: `${connection.id}-missing`,
            endpoint: 'end',
            cursorX: 260,
            cursorY: 60,
          },
        });
      });

      expect(screen.queryByTestId('connection-reroute-preview-line')).not.toBeInTheDocument();
    });

    it('does not reroute onto pseudo-rooms', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 260, y: 200 } };
      const unknown = { ...createPseudoRoom('unknown'), position: { x: 260, y: 40 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      updated = addPseudoRoom(updated, unknown);
      const connection = createConnection(kitchen.id, hallway.id, true);
      updated = addConnection(updated, connection, 'east', 'west');
      loadDocumentAct(updated);
      useEditorStore.getState().selectConnection(connection.id);

      renderMapCanvas();

      fireEvent.mouseDown(screen.getByTestId(`connection-reroute-handle-${connection.id}-end`), { clientX: 260, clientY: 220, button: 0 });
      fireEvent.mouseUp(screen.getByTestId('pseudo-room-node'), { clientX: 280, clientY: 60, button: 0 });

      expect(useEditorStore.getState().connectionEndpointDrag).toBeNull();
      expect(useEditorStore.getState().doc!.connections[connection.id]).toMatchObject({
        target: { kind: 'room', id: hallway.id },
        isBidirectional: true,
      });
    });

    it('shows a live drag preview for pseudo-rooms', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const unknown = { ...createPseudoRoom('unknown'), position: { x: 260, y: 40 } };
      let updated = addRoom(doc, kitchen);
      updated = addPseudoRoom(updated, unknown);
      updated = addConnection(updated, createConnection(kitchen.id, { kind: 'pseudo-room', id: unknown.id }, false), 'north');
      loadDocumentAct(updated);

      renderMapCanvas();

      const pseudoRoomNode = screen.getByTestId('pseudo-room-node');
      fireEvent.mouseDown(pseudoRoomNode, { clientX: 260, clientY: 40, button: 0 });
      fireEvent.mouseMove(document, { clientX: 300, clientY: 80 });

      expect(pseudoRoomNode).toHaveStyle({ transform: 'translate(300px, 80px)' });
    });

    it('does not render a sticky-note link preview when the dragged note is missing', () => {
      loadDocumentAct(createEmptyMap('Test'));
      act(() => {
        useEditorStore.setState({
          stickyNoteLinkDrag: {
            sourceStickyNoteId: 'missing-note',
            cursorX: 120,
            cursorY: 140,
          },
        });
      });

      renderMapCanvas();

      expect(screen.queryByTestId('sticky-note-link-preview')).not.toBeInTheDocument();
    });

    it('selects pseudo-rooms on click', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const unknown = { ...createPseudoRoom('unknown'), position: { x: 260, y: 40 } };
      let updated = addRoom(doc, kitchen);
      updated = addPseudoRoom(updated, unknown);
      updated = addConnection(updated, createConnection(kitchen.id, { kind: 'pseudo-room', id: unknown.id }, false), 'north');
      loadDocumentAct(updated);

      renderMapCanvas();

      const pseudoRoomNode = screen.getByTestId('pseudo-room-node');
      fireEvent.mouseDown(pseudoRoomNode, { clientX: 260, clientY: 40, button: 0 });
      fireEvent.mouseUp(document, { clientX: 260, clientY: 40, button: 0 });
      fireEvent.click(pseudoRoomNode, { clientX: 260, clientY: 40, button: 0 });

      expect(useEditorStore.getState().selectedPseudoRoomIds).toEqual([unknown.id]);
      expect(screen.getByTestId('pseudo-room-selection-outline')).toBeInTheDocument();
    });

    it('deletes a selected pseudo-room by removing its incoming connection', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const unknown = { ...createPseudoRoom('unknown'), position: { x: 260, y: 40 } };
      let updated = addRoom(doc, kitchen);
      updated = addPseudoRoom(updated, unknown);
      const connection = createConnection(kitchen.id, { kind: 'pseudo-room', id: unknown.id }, false);
      updated = addConnection(updated, connection, 'north');
      loadDocumentAct(updated);

      renderMapCanvas();

      fireEvent.mouseDown(screen.getByTestId('pseudo-room-node'), { clientX: 260, clientY: 40, button: 0 });
      fireEvent.mouseUp(document, { clientX: 260, clientY: 40, button: 0 });
      fireEvent.keyDown(screen.getByTestId('map-canvas'), { key: 'Delete' });

      expect(useEditorStore.getState().doc!.pseudoRooms[unknown.id]).toBeUndefined();
      expect(useEditorStore.getState().doc!.connections[connection.id]).toBeUndefined();
    });

    it('deletes a selected pseudo-room even when focus has moved to the minimap', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const unknown = { ...createPseudoRoom('unknown'), position: { x: 260, y: 40 } };
      let updated = addRoom(doc, kitchen);
      updated = addPseudoRoom(updated, unknown);
      const connection = createConnection(kitchen.id, { kind: 'pseudo-room', id: unknown.id }, false);
      updated = addConnection(updated, connection, 'north');
      loadDocumentAct(updated);

      renderMapCanvas();

      fireEvent.mouseDown(screen.getByTestId('pseudo-room-node'), { clientX: 260, clientY: 40, button: 0 });
      fireEvent.mouseUp(document, { clientX: 260, clientY: 40, button: 0 });
      screen.getByTestId('map-minimap').focus();
      fireEvent.keyDown(window, { key: 'Delete' });

      expect(useEditorStore.getState().doc!.pseudoRooms[unknown.id]).toBeUndefined();
      expect(useEditorStore.getState().doc!.connections[connection.id]).toBeUndefined();
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
      loadDocumentAct(d);

      renderMapCanvas();

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
      loadDocumentAct(d);

      renderMapCanvas();

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
      loadDocumentAct(updated);
      useEditorStore.getState().selectRoom(kitchen.id);

      renderMapCanvas();

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
      loadDocumentAct(updated);

      renderMapCanvas();

      fireEvent.doubleClick(screen.getByTestId(`connection-hit-target-${conn.id}`));

      expect(screen.getByTestId('connection-editor-overlay')).toBeInTheDocument();
      expect(screen.getByTestId('connection-editor-dialog')).toBeInTheDocument();
      expect(screen.getByTestId('connection-editor-sidebar')).toBeInTheDocument();
      expect(screen.getByTestId('connection-editor-main')).toBeInTheDocument();
      expect(useEditorStore.getState().selectedConnectionIds).toEqual([conn.id]);
    });

    it('positions the connection editor in the visible horizontal center', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 240, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      const conn = createConnection(kitchen.id, hallway.id, true);
      updated = addConnection(updated, conn, 'east', 'west');
      loadDocumentAct(updated);

      renderMapCanvas({ visibleMapLeftInset: 240 });

      fireEvent.doubleClick(screen.getByTestId(`connection-hit-target-${conn.id}`));

      expect(screen.getByTestId('connection-editor-dialog')).toHaveStyle({
        justifySelf: 'start',
        marginLeft: '296px',
      });
    });

    it('cancels the connection editor from the cancel button', async () => {
      const user = userEvent.setup();
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 240, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      const conn = createConnection(kitchen.id, hallway.id, true);
      updated = addConnection(updated, conn, 'east', 'west');
      loadDocumentAct(updated);

      renderMapCanvas();

      await user.dblClick(screen.getByTestId(`connection-hit-target-${conn.id}`));
      await user.click(screen.getByTestId('connection-stroke-color-chip-4'));
      await user.click(screen.getByRole('button', { name: /cancel connection editor/i }));

      expect(screen.queryByTestId('connection-editor-overlay')).not.toBeInTheDocument();
      expect(useEditorStore.getState().doc!.connections[conn.id].strokeColorIndex).toBe(0);
    });

    it('cancels the connection editor on Escape', async () => {
      const user = userEvent.setup();
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 240, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      const conn = createConnection(kitchen.id, hallway.id, true);
      updated = addConnection(updated, conn, 'east', 'west');
      loadDocumentAct(updated);

      renderMapCanvas();

      await user.dblClick(screen.getByTestId(`connection-hit-target-${conn.id}`));
      await user.type(screen.getByLabelText(/connection start label/i), 'archway');
      await user.keyboard('{Escape}');

      expect(screen.queryByTestId('connection-editor-overlay')).not.toBeInTheDocument();
      expect(useEditorStore.getState().doc!.connections[conn.id].startLabel).toBe('');
    });

    it('cancels the connection editor and clears selection when clicking the backdrop', async () => {
      const user = userEvent.setup();
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 240, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      const conn = createConnection(kitchen.id, hallway.id, true);
      updated = addConnection(updated, conn, 'east', 'west');
      loadDocumentAct(updated);

      renderMapCanvas();

      await user.dblClick(screen.getByTestId(`connection-hit-target-${conn.id}`));
      await user.type(screen.getByLabelText(/connection start label/i), 'archway');
      await user.click(screen.getByTestId('connection-editor-overlay').querySelector('.connection-editor-backdrop') as HTMLElement);

      expect(screen.queryByTestId('connection-editor-overlay')).not.toBeInTheDocument();
      expect(useEditorStore.getState().selectedRoomIds).toEqual([]);
      expect(useEditorStore.getState().selectedConnectionIds).toEqual([]);
      expect(useEditorStore.getState().doc!.connections[conn.id].startLabel).toBe('');
    });

    it('keeps connection style edits local until saved', async () => {
      const user = userEvent.setup();
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 240, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      const conn = createConnection(kitchen.id, hallway.id, true);
      updated = addConnection(updated, conn, 'east', 'west');
      loadDocumentAct(updated);

      renderMapCanvas();

      await user.dblClick(screen.getByTestId(`connection-hit-target-${conn.id}`));
      await user.click(screen.getByTestId('connection-stroke-color-chip-4'));
      await user.selectOptions(screen.getByLabelText(/connection stroke style/i), 'dotted');

      const updatedConnection = useEditorStore.getState().doc!.connections[conn.id];
      expect(updatedConnection.strokeColorIndex).toBe(0);
      expect(updatedConnection.strokeStyle).toBe('solid');
    });

    it('applies connection style edits when saved', async () => {
      const user = userEvent.setup();
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 240, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      const conn = createConnection(kitchen.id, hallway.id, true);
      updated = addConnection(updated, conn, 'east', 'west');
      loadDocumentAct(updated);

      renderMapCanvas();

      await user.dblClick(screen.getByTestId(`connection-hit-target-${conn.id}`));
      await user.click(screen.getByTestId('connection-stroke-color-chip-4'));
      await user.selectOptions(screen.getByLabelText(/connection stroke style/i), 'dotted');
      await user.click(screen.getByRole('button', { name: /save connection editor/i }));

      const updatedConnection = useEditorStore.getState().doc!.connections[conn.id];
      expect(updatedConnection.strokeColorIndex).toBe(4);
      expect(updatedConnection.strokeStyle).toBe('dotted');
      const connectionLine = screen.getByTestId(`connection-line-${conn.id}`);
      expect(connectionLine).toHaveStyle({
        stroke: '#166534',
        strokeDasharray: '2 4',
      });
    });

    it('keeps connection annotation edits local until saved', async () => {
      const user = userEvent.setup();
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 240, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      const conn = createConnection(kitchen.id, hallway.id, true);
      updated = addConnection(updated, conn, 'east', 'west');
      loadDocumentAct(updated);

      renderMapCanvas();

      await user.dblClick(screen.getByTestId(`connection-hit-target-${conn.id}`));
      await user.click(screen.getByLabelText('door'));

      expect(useEditorStore.getState().doc!.connections[conn.id].annotation).toBeNull();

      const textInput = screen.getByLabelText(/connection annotation text/i);
      await user.clear(textInput);
      await user.type(textInput, 'secret passage');

      expect(screen.getByLabelText('Text')).toBeChecked();
      expect(useEditorStore.getState().doc!.connections[conn.id].annotation).toBeNull();

      await user.click(screen.getByLabelText('none'));
      expect(useEditorStore.getState().doc!.connections[conn.id].annotation).toBeNull();
      expect(screen.getByLabelText('none')).toBeChecked();
    });

    it('applies connection annotation edits when saved', async () => {
      const user = userEvent.setup();
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 240, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      const conn = createConnection(kitchen.id, hallway.id, true);
      updated = addConnection(updated, conn, 'east', 'west');
      loadDocumentAct(updated);

      renderMapCanvas();

      await user.dblClick(screen.getByTestId(`connection-hit-target-${conn.id}`));
      const textInput = screen.getByLabelText(/connection annotation text/i);
      await user.clear(textInput);
      await user.type(textInput, 'secret passage');
      await user.click(screen.getByRole('button', { name: /save connection editor/i }));

      expect(useEditorStore.getState().doc!.connections[conn.id].annotation).toEqual({
        kind: 'text',
        text: 'secret passage',
      });
    });

    it('does not offer up or down as connection annotation options', async () => {
      const user = userEvent.setup();
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 240, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      const conn = createConnection(kitchen.id, hallway.id, true);
      updated = addConnection(updated, conn, 'east', 'west');
      loadDocumentAct(updated);

      renderMapCanvas();

      await user.dblClick(screen.getByTestId(`connection-hit-target-${conn.id}`));

      expect(screen.queryByLabelText('up')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('down')).not.toBeInTheDocument();
      expect(screen.getByLabelText('in')).toBeInTheDocument();
      expect(screen.getByLabelText('out')).toBeInTheDocument();
    });

    it('pressing Enter in a connection field saves and closes the connection editor', async () => {
      const user = userEvent.setup();
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 240, y: 120 } };
      let updated = addRoom(doc, kitchen);
      updated = addRoom(updated, hallway);
      const conn = createConnection(kitchen.id, hallway.id, true);
      updated = addConnection(updated, conn, 'east', 'west');
      loadDocumentAct(updated);

      renderMapCanvas();

      await user.dblClick(screen.getByTestId(`connection-hit-target-${conn.id}`));
      const startLabelInput = screen.getByLabelText(/connection start label/i);
      const endLabelInput = screen.getByLabelText(/connection end label/i);
      await user.type(startLabelInput, 'archway');
      await user.type(endLabelInput, 'landing');
      fireEvent.keyDown(startLabelInput, { key: 'Enter' });

      expect(screen.queryByTestId('connection-editor-overlay')).not.toBeInTheDocument();
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
      loadDocumentAct(updated);
      useEditorStore.getState().selectRoom(kitchen.id);

      renderMapCanvas();

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
      loadDocumentAct(updated);
      useEditorStore.getState().selectConnection(conn.id);

      renderMapCanvas();

      const outerLine = screen.getByTestId(`connection-line-${conn.id}`);
      const innerLine = screen.getByTestId(`connection-selection-inner-${conn.id}`);

      expect(outerLine).toHaveStyle({ strokeWidth: '6' });
      expect(innerLine).toHaveStyle({ strokeWidth: '2' });
    });

    it('anchors a north connection to the rendered center of a wide room', () => {
      const baseDoc = createEmptyMap('Test');
      const doc = {
        ...baseDoc,
        view: {
          ...baseDoc.view,
          visualStyle: 'default' as const,
        },
      };
      const kitchen = { ...createRoom('the room of requirement'), position: { x: 80, y: 200 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 80, y: 0 } };
      let d = addRoom(doc, kitchen);
      d = addRoom(d, hallway);
      const conn = createConnection(kitchen.id, hallway.id, true);
      d = addConnection(d, conn, 'north', 'south');
      loadDocumentAct(d);

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

      renderMapCanvas();

      const connectionLine = screen.getByTestId(`connection-line-${conn.id}`);
      expect(connectionLine.getAttribute('points')).toBe('164,200 164,180 112,56 112,36');
    });

    it('renders a tiny split gap and endpoint dots when an unrelated connection crosses a room', () => {
      const doc = createEmptyMap('Test');
      const northOfHouse = { ...createRoom('North of House'), id: 'north', position: { x: 120, y: 20 } };
      const kitchen = { ...createRoom('Kitchen'), id: 'kitchen', position: { x: 80, y: 120 } };
      const westOfHouse = { ...createRoom('West of House'), id: 'west', position: { x: 80, y: 220 } };
      const attic = { ...createRoom('Attic'), id: 'attic', position: { x: 80, y: -80 } };
      let d = addRoom(doc, northOfHouse);
      d = addRoom(d, kitchen);
      d = addRoom(d, westOfHouse);
      d = addRoom(d, attic);
      const westNorthConnection = createConnection(westOfHouse.id, northOfHouse.id, true);
      const kitchenAtticConnection = createConnection(kitchen.id, attic.id, true);
      d = addConnection(d, westNorthConnection, 'north', 'west');
      d = addConnection(d, kitchenAtticConnection, 'up', 'down');
      loadDocumentAct(d);

      renderMapCanvas();

      const segments = screen.getAllByTestId(/connection-line-segment-.*-/)
        .filter((segment) => segment.getAttribute('data-testid')?.includes(westNorthConnection.id));
      expect(segments.length).toBeGreaterThanOrEqual(2);
      expect(screen.queryByTestId(/connection-gap-crossbar-.*-/)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`connection-line-${westNorthConnection.id}`)).not.toBeInTheDocument();
      expect(screen.getByTestId(`connection-endpoint-dot-${westNorthConnection.id}-start`)).toBeInTheDocument();
      expect(screen.getByTestId(`connection-endpoint-dot-${westNorthConnection.id}-end`)).toBeInTheDocument();
    });

    it('renders a tiny split bezier gap and endpoint dots when it crosses an unrelated room', () => {
      const doc = createEmptyMap('Bezier Gap');
      const northOfHouse = { ...createRoom('North of House'), id: 'north', position: { x: 120, y: 20 } };
      const kitchen = { ...createRoom('Kitchen'), id: 'kitchen', position: { x: 80, y: 120 } };
      const westOfHouse = { ...createRoom('West of House'), id: 'west', position: { x: 80, y: 220 } };
      const attic = { ...createRoom('Attic'), id: 'attic', position: { x: 80, y: -80 } };
      let d = addRoom(doc, northOfHouse);
      d = addRoom(d, kitchen);
      d = addRoom(d, westOfHouse);
      d = addRoom(d, attic);
      d = {
        ...d,
        view: {
          ...d.view,
          useBezierConnections: true,
        },
      };
      const westNorthConnection = createConnection(westOfHouse.id, northOfHouse.id, true);
      const kitchenAtticConnection = createConnection(kitchen.id, attic.id, true);
      d = addConnection(d, westNorthConnection, 'north', 'west');
      d = addConnection(d, kitchenAtticConnection, 'up', 'down');
      loadDocumentAct(d);

      renderMapCanvas();

      const segments = screen.getAllByTestId(/connection-line-segment-.*-/)
        .filter((segment) => segment.getAttribute('data-testid')?.includes(westNorthConnection.id));
      expect(segments.length).toBeGreaterThanOrEqual(2);
      expect(screen.queryByTestId(/connection-gap-crossbar-.*-/)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`connection-line-${westNorthConnection.id}`)).not.toBeInTheDocument();
      expect(screen.getByTestId(`connection-endpoint-dot-${westNorthConnection.id}-start`)).toBeInTheDocument();
      expect(screen.getByTestId(`connection-endpoint-dot-${westNorthConnection.id}-end`)).toBeInTheDocument();
      expect(screen.getByTestId(`connection-hit-target-${westNorthConnection.id}`).tagName.toLowerCase()).toBe('path');
    });

    it('renders a tiny split gap and endpoint dots when an unrelated connection crosses a pseudo-room', () => {
      const doc = createEmptyMap('Pseudo Gap');
      const northOfHouse = { ...createRoom('North of House'), id: 'north', position: { x: 120, y: 20 } };
      const westOfHouse = { ...createRoom('West of House'), id: 'west', position: { x: 80, y: 220 } };
      const attic = { ...createRoom('Attic'), id: 'attic', position: { x: 80, y: -80 } };
      const unknown = { ...createPseudoRoom('unknown'), id: 'unknown', position: { x: 100, y: 120 } };
      let d = addRoom(doc, northOfHouse);
      d = addRoom(d, westOfHouse);
      d = addRoom(d, attic);
      d = addPseudoRoom(d, unknown);
      const westNorthConnection = createConnection(westOfHouse.id, northOfHouse.id, true);
      const westUnknownConnection = createConnection(westOfHouse.id, { kind: 'pseudo-room', id: unknown.id }, false);
      d = addConnection(d, westNorthConnection, 'north', 'west');
      d = addConnection(d, westUnknownConnection, 'west');
      loadDocumentAct(d);

      renderMapCanvas();

      const segments = screen.getAllByTestId(/connection-line-segment-.*-/)
        .filter((segment) => segment.getAttribute('data-testid')?.includes(westNorthConnection.id));
      expect(segments.length).toBeGreaterThanOrEqual(2);
      expect(screen.queryByTestId(/connection-gap-crossbar-.*-/)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`connection-line-${westNorthConnection.id}`)).not.toBeInTheDocument();
      expect(screen.getByTestId(`connection-endpoint-dot-${westNorthConnection.id}-start`)).toBeInTheDocument();
      expect(screen.getByTestId(`connection-endpoint-dot-${westNorthConnection.id}-end`)).toBeInTheDocument();
    });

    it('does not render an arrowhead for a bidirectional connection', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 80, y: 0 } };
      let d = addRoom(doc, kitchen);
      d = addRoom(d, hallway);
      const conn = createConnection(kitchen.id, hallway.id, true);
      d = addConnection(d, conn, 'north', 'south');
      loadDocumentAct(d);

      renderMapCanvas();

      const connectionLine = screen.getByTestId(`connection-line-${conn.id}`);
      expect(connectionLine.getAttribute('marker-end')).toBeNull();
      expect(screen.queryByTestId(`connection-arrow-${conn.id}-0`)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`connection-arrow-${conn.id}-1`)).not.toBeInTheDocument();
    });

    it('renders an up decoration toward the room whose connection binding is up', () => {
      const doc = createEmptyMap('Test');
      const cellar = { ...createRoom('Cellar'), position: { x: 80, y: 200 } };
      const attic = { ...createRoom('Attic'), position: { x: 80, y: 0 } };
      let d = addRoom(doc, cellar);
      d = addRoom(d, attic);
      const conn = createConnection(cellar.id, attic.id, true);
      d = addConnection(d, conn, 'up', 'down');
      loadDocumentAct(d);

      renderMapCanvas();

      const annotationLine = screen.getByTestId(`connection-annotation-line-${conn.id}`);
      const annotationArrow = screen.getByTestId(`connection-annotation-arrow-${conn.id}`);
      const arrowPoints = (annotationArrow.getAttribute('points') ?? '').split(' ').map((point) => point.split(',').map(Number));
      const lineY1 = Number(annotationLine.getAttribute('y1'));
      const lineY2 = Number(annotationLine.getAttribute('y2'));

      // Vertical travel annotations follow parser semantics, not screen-space higher/lower placement.
      expect(annotationLine).toBeInTheDocument();
      expect(annotationArrow).toBeInTheDocument();
      expect(arrowPoints[0][1]).toBeCloseTo(Math.min(lineY1, lineY2), 5);
      expect(screen.getByTestId(`connection-annotation-text-${conn.id}`)).toHaveTextContent('up');
    });

    it('renders an up decoration toward the semantic target even when that end is visually lower', () => {
      const doc = createEmptyMap('Test');
      const cellar = { ...createRoom('Cellar'), position: { x: 80, y: 0 } };
      const attic = { ...createRoom('Attic'), position: { x: 80, y: 200 } };
      let d = addRoom(doc, cellar);
      d = addRoom(d, attic);
      const conn = createConnection(cellar.id, attic.id, true);
      d = addConnection(d, conn, 'up', 'down');
      loadDocumentAct(d);

      renderMapCanvas();

      const annotationLine = screen.getByTestId(`connection-annotation-line-${conn.id}`);
      const annotationArrow = screen.getByTestId(`connection-annotation-arrow-${conn.id}`);
      const arrowPoints = (annotationArrow.getAttribute('points') ?? '').split(' ').map((point) => point.split(',').map(Number));
      const lineY1 = Number(annotationLine.getAttribute('y1'));
      const lineY2 = Number(annotationLine.getAttribute('y2'));

      expect(arrowPoints[0][1]).toBeCloseTo(Math.max(lineY1, lineY2), 5);
      expect(screen.getByTestId(`connection-annotation-text-${conn.id}`)).toHaveTextContent('up');
    });

    it('renders a down decoration toward the room whose connection binding is down', () => {
      const doc = createEmptyMap('Test');
      const ledge = { ...createRoom('Ledge'), position: { x: 80, y: 200 } };
      const shaft = { ...createRoom('Shaft'), position: { x: 80, y: 0 } };
      let d = addRoom(doc, ledge);
      d = addRoom(d, shaft);
      const conn = createConnection(ledge.id, shaft.id, false);
      d = addConnection(d, conn, 'down');
      loadDocumentAct(d);

      renderMapCanvas();

      const annotationLine = screen.getByTestId(`connection-annotation-line-${conn.id}`);
      const annotationArrow = screen.getByTestId(`connection-annotation-arrow-${conn.id}`);
      const arrowPoints = (annotationArrow.getAttribute('points') ?? '').split(' ').map((point) => point.split(',').map(Number));
      const lineY1 = Number(annotationLine.getAttribute('y1'));
      const lineY2 = Number(annotationLine.getAttribute('y2'));

      expect(annotationLine).toBeInTheDocument();
      expect(annotationArrow).toBeInTheDocument();
      expect(arrowPoints[0][1]).toBeCloseTo(Math.min(lineY1, lineY2), 5);
      expect(screen.getByTestId(`connection-annotation-text-${conn.id}`)).toHaveTextContent('down');
    });

    it('renders a down decoration toward the semantic target even when that end is visually higher', () => {
      const doc = createEmptyMap('Test');
      const ledge = { ...createRoom('Ledge'), position: { x: 80, y: 200 } };
      const shaft = { ...createRoom('Shaft'), position: { x: 80, y: 0 } };
      let d = addRoom(doc, ledge);
      d = addRoom(d, shaft);
      const conn = createConnection(ledge.id, shaft.id, false);
      d = addConnection(d, conn, 'down');
      loadDocumentAct(d);

      renderMapCanvas();

      const annotationLine = screen.getByTestId(`connection-annotation-line-${conn.id}`);
      const annotationArrow = screen.getByTestId(`connection-annotation-arrow-${conn.id}`);
      const arrowPoints = (annotationArrow.getAttribute('points') ?? '').split(' ').map((point) => point.split(',').map(Number));
      const lineY1 = Number(annotationLine.getAttribute('y1'));
      const lineY2 = Number(annotationLine.getAttribute('y2'));

      expect(arrowPoints[0][1]).toBeCloseTo(Math.min(lineY1, lineY2), 5);
      expect(screen.getByTestId(`connection-annotation-text-${conn.id}`)).toHaveTextContent('down');
    });

    it('does not render a vertical decoration when both ends are up', () => {
      const doc = createEmptyMap('Test');
      const lower = { ...createRoom('Lower'), position: { x: 80, y: 200 } };
      const upper = { ...createRoom('Upper'), position: { x: 80, y: 0 } };
      let d = addRoom(doc, lower);
      d = addRoom(d, upper);
      const conn = createConnection(lower.id, upper.id, true);
      d = addConnection(d, conn, 'up', 'up');
      loadDocumentAct(d);

      renderMapCanvas();

      expect(screen.queryByTestId(`connection-annotation-line-${conn.id}`)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`connection-annotation-arrow-${conn.id}`)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`connection-annotation-text-${conn.id}`)).not.toBeInTheDocument();
    });

    it('renders an in annotation as a centered parallel arrow and parallel label', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 80, y: 0 } };
      let d = addRoom(doc, kitchen);
      d = addRoom(d, hallway);
      const conn = { ...createConnection(kitchen.id, hallway.id, true), annotation: { kind: 'in' as const } };
      d = addConnection(d, conn, 'north', 'south');
      loadDocumentAct(d);

      renderMapCanvas();

      const annotationLine = screen.getByTestId(`connection-annotation-line-${conn.id}`);
      const annotationArrow = screen.getByTestId(`connection-annotation-arrow-${conn.id}`);
      const annotationText = screen.getByTestId(`connection-annotation-text-${conn.id}`);
      const arrowPoints = (annotationArrow.getAttribute('points') ?? '').split(' ').map((point) => point.split(',').map(Number));
      const arrowBasePoints = arrowPoints.slice(1).sort((a, b) => a[0] - b[0]);

      const lineY1 = Number(annotationLine.getAttribute('y1'));
      const lineY2 = Number(annotationLine.getAttribute('y2'));
      expect(Number(annotationLine.getAttribute('x1'))).toBeCloseTo(130, 5);
      expect(Number(annotationLine.getAttribute('x2'))).toBeCloseTo(130, 5);
      expect(lineY1).toBeGreaterThan(lineY2);
      expect(arrowPoints[0][0]).toBeCloseTo(130, 5);
      expect(arrowPoints[0][1]).toBeCloseTo(Math.min(lineY1, lineY2), 5);
      expect(arrowBasePoints[0][0]).toBeCloseTo(126, 5);
      expect(arrowBasePoints[0][1]).toBeGreaterThan(arrowPoints[0][1]);
      expect(arrowBasePoints[1][0]).toBeCloseTo(134, 5);
      expect(arrowBasePoints[1][1]).toBeGreaterThan(arrowPoints[0][1]);
      expect(annotationText).toHaveTextContent('in');
      expect(annotationText.getAttribute('transform')).toContain('rotate(90 ');
    });

    it('renders an out annotation arrow pointing toward the source room with an in label', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 80, y: 0 } };
      let d = addRoom(doc, kitchen);
      d = addRoom(d, hallway);
      const conn = { ...createConnection(kitchen.id, hallway.id, true), annotation: { kind: 'out' as const } };
      d = addConnection(d, conn, 'north', 'south');
      loadDocumentAct(d);

      renderMapCanvas();

      const annotationLine = screen.getByTestId(`connection-annotation-line-${conn.id}`);
      const annotationArrow = screen.getByTestId(`connection-annotation-arrow-${conn.id}`);
      const annotationText = screen.getByTestId(`connection-annotation-text-${conn.id}`);
      const arrowPoints = (annotationArrow.getAttribute('points') ?? '').split(' ').map((point) => point.split(',').map(Number));

      const lineY1 = Number(annotationLine.getAttribute('y1'));
      const lineY2 = Number(annotationLine.getAttribute('y2'));
      expect(Number(annotationLine.getAttribute('x1'))).toBeCloseTo(130, 5);
      expect(Number(annotationLine.getAttribute('x2'))).toBeCloseTo(130, 5);
      expect(lineY2).toBeGreaterThan(lineY1);
      expect(arrowPoints[0][0]).toBeCloseTo(130, 5);
      expect(arrowPoints[0][1]).toBeCloseTo(Math.max(lineY1, lineY2), 5);
      expect(arrowPoints[1][0]).toBeCloseTo(134, 5);
      expect(arrowPoints[1][1]).toBeLessThan(arrowPoints[0][1]);
      expect(arrowPoints[2][0]).toBeCloseTo(126, 5);
      expect(arrowPoints[2][1]).toBeLessThan(arrowPoints[0][1]);
      expect(annotationText).toHaveTextContent('in');
      expect(annotationText.getAttribute('transform')).toContain('rotate(90 ');
    });

    it('renders free text annotations parallel to the connection', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 80, y: 0 } };
      let d = addRoom(doc, kitchen);
      d = addRoom(d, hallway);
      const conn = { ...createConnection(kitchen.id, hallway.id, true), annotation: { kind: 'text', text: 'stairs' } };
      d = addConnection(d, conn, 'north', 'south');
      loadDocumentAct(d);

      renderMapCanvas();

      const annotationText = screen.getByTestId(`connection-annotation-text-${conn.id}`);

      expect(annotationText).toHaveTextContent('stairs');
      expect(annotationText.getAttribute('transform')).toBe('rotate(90 142 142)');
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
      loadDocumentAct(d);

      renderMapCanvas();

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
      loadDocumentAct(d);

      renderMapCanvas();

      const doorGlyph = screen.getByTestId(`connection-annotation-door-${conn.id}`);
      const doorSvg = doorGlyph.querySelector('svg');
      const doorPath = doorGlyph.querySelector('path');

      expect(doorGlyph.getAttribute('transform')).toMatch(/^translate\([\d.]+ [\d.]+\)$/);
      expect(doorSvg?.getAttribute('width')).toBe('20');
      expect(doorSvg?.getAttribute('height')).toBe('20');
      expect(doorPath?.getAttribute('d')).toContain('M411.5 208.8');
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
      loadDocumentAct(d);

      renderMapCanvas();

      const padlockGlyph = screen.getByTestId(`connection-annotation-padlock-${conn.id}`);
      const padlockSvg = padlockGlyph.querySelector('svg');
      const lockPath = padlockGlyph.querySelector('path');

      expect(padlockGlyph.getAttribute('transform')).toMatch(/^translate\([\d.]+ [\d.]+\)$/);
      expect(padlockSvg?.getAttribute('width')).toBe('20');
      expect(padlockSvg?.getAttribute('height')).toBe('20');
      expect(lockPath?.getAttribute('d')).toContain('M256 160L256 224L384 224');
      expect(lockPath).toHaveAttribute('fill', '#6366f1');
      expect(screen.queryByTestId(`connection-annotation-line-${conn.id}`)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`connection-annotation-arrow-${conn.id}`)).not.toBeInTheDocument();
      expect(screen.queryByTestId(`connection-annotation-text-${conn.id}`)).not.toBeInTheDocument();
    });

    it('renders a derived up annotation alongside a door glyph', () => {
      const doc = createEmptyMap('Test');
      const lower = { ...createRoom('Lower'), position: { x: 80, y: 200 } };
      const upper = { ...createRoom('Upper'), position: { x: 80, y: 0 } };
      let d = addRoom(doc, lower);
      d = addRoom(d, upper);
      const conn = { ...createConnection(lower.id, upper.id, true), annotation: { kind: 'door' as const } };
      d = addConnection(d, conn, 'up', 'down');
      loadDocumentAct(d);

      renderMapCanvas();

      expect(screen.getByTestId(`connection-annotation-door-${conn.id}`)).toBeInTheDocument();
      expect(screen.getByTestId(`connection-annotation-line-${conn.id}`)).toBeInTheDocument();
      expect(screen.getByTestId(`connection-annotation-arrow-${conn.id}`)).toBeInTheDocument();
      expect(screen.getByTestId(`connection-annotation-text-${conn.id}`)).toHaveTextContent('up');
    });

    it('renders a single arrowhead polygon at the target end for a one-way connection', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 80, y: 0 } };
      let d = addRoom(doc, kitchen);
      d = addRoom(d, hallway);
      const conn = createConnection(kitchen.id, hallway.id, false);
      d = addConnection(d, conn, 'north');
      loadDocumentAct(d);

      renderMapCanvas();

      const connectionLine = screen.getByTestId(`connection-line-${conn.id}`);
      expect(connectionLine.getAttribute('marker-end')).toBeNull();
      const connectionArrow = screen.getByTestId(`connection-arrow-${conn.id}-0`);
      expect(screen.queryByTestId(`connection-arrow-${conn.id}-1`)).not.toBeInTheDocument();
      expect(connectionArrow.tagName.toLowerCase()).toBe('polygon');
      expect(connectionArrow.getAttribute('points')).toBe('122,84 127,96 117,96');
    });

    it('draws a one-way connection to the target room edge without a target stub', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 80, y: 0 } };
      let d = addRoom(doc, kitchen);
      d = addRoom(d, hallway);
      const conn = createConnection(kitchen.id, hallway.id, false);
      d = addConnection(d, conn, 'north', 'south');
      loadDocumentAct(d);

      renderMapCanvas();

      const connectionLine = screen.getByTestId(`connection-line-${conn.id}`);
      expect(connectionLine.getAttribute('points')).toBe('122,200 122,180 122,84');
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
      loadDocumentAct(d);

      renderMapCanvas();

      const startLabel = screen.getByTestId(`connection-start-label-${conn.id}`);
      const endLabel = screen.getByTestId(`connection-end-label-${conn.id}`);

      expect(startLabel).toHaveTextContent('stairs');
      expect(startLabel.getAttribute('x')).toBe('132');
      expect(startLabel.getAttribute('y')).toBe('190');
      expect(endLabel).toHaveTextContent('balcony');
      expect(endLabel.getAttribute('x')).toBe('132');
      expect(endLabel.getAttribute('y')).toBe('94');
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
      loadDocumentAct(d);

      renderMapCanvas();

      expect(screen.getByTestId(`connection-start-label-${conn.id}`)).toHaveTextContent('stairs');
      expect(screen.queryByTestId(`connection-end-label-${conn.id}`)).not.toBeInTheDocument();
    });

    it('renders a self-connection as a polyline element', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      let d = addRoom(doc, kitchen);
      const conn = createConnection(kitchen.id, kitchen.id, false);
      d = addConnection(d, conn, 'north');
      loadDocumentAct(d);

      renderMapCanvas();

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
      loadDocumentAct(d);

      renderMapCanvas();

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
      loadDocumentAct(d);

      renderMapCanvas();

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
      loadDocumentAct(d);

      renderMapCanvas();

      const connectionPath = screen.getByTestId(`connection-line-${conn.id}`);
      expect(connectionPath.getAttribute('points')).toBe('122,200 122,180 184,242 164,242');
    });

    it('renders a visible bidirectional up/down self-connection', () => {
      const doc = createEmptyMap('Test');
      const bedroom = { ...createRoom('Bedroom'), position: { x: 80, y: 200 } };
      let d = addRoom(doc, bedroom);
      const conn = createConnection(bedroom.id, bedroom.id, true);
      d = addConnection(d, conn, 'up', 'down');
      loadDocumentAct(d);

      renderMapCanvas();

      const connectionPath = screen.getByTestId(`connection-line-${conn.id}`);
      const renderedPoints = (connectionPath.getAttribute('points') ?? '').split(' ').map((point) => point.split(',').map(Number));

      expect(renderedPoints).toHaveLength(4);
      expect(renderedPoints[0][0]).toBeCloseTo(renderedPoints[3][0], 5);
      expect(renderedPoints[0][1]).toBeCloseTo(renderedPoints[3][1], 5);
      expect(renderedPoints[1][1]).toBeLessThan(renderedPoints[0][1]);
      expect(renderedPoints[2][1]).toBeLessThan(renderedPoints[0][1]);
      expect(renderedPoints[1][1]).toBeCloseTo(renderedPoints[2][1], 5);
      expect(renderedPoints[1][0]).toBeGreaterThan(renderedPoints[0][0]);
      expect(renderedPoints[2][0]).toBeLessThan(renderedPoints[0][0]);
    });

    it('renders a down annotation arrow for a one-way down self-connection', () => {
      const doc = createEmptyMap('Test');
      const bedroom = { ...createRoom('Bedroom'), position: { x: 80, y: 200 } };
      let d = addRoom(doc, bedroom);
      const conn = createConnection(bedroom.id, bedroom.id, false);
      d = addConnection(d, conn, 'down');
      loadDocumentAct(d);

      renderMapCanvas();

      const connectionPath = screen.getByTestId(`connection-line-${conn.id}`);
      const renderedPoints = (connectionPath.getAttribute('points') ?? '').split(' ').map((point) => point.split(',').map(Number));
      const annotationLine = screen.getByTestId(`connection-annotation-line-${conn.id}`);
      expect(annotationLine).toBeInTheDocument();
      expect(screen.getByTestId(`connection-annotation-text-${conn.id}`)).toHaveTextContent('down');
      expect(screen.getByTestId(`connection-annotation-arrow-${conn.id}`)).toBeInTheDocument();
      expect(renderedPoints).toHaveLength(4);
      expect(renderedPoints[1][1]).toBeGreaterThan(renderedPoints[0][1]);
      expect(renderedPoints[2][1]).toBeGreaterThan(renderedPoints[0][1]);
      expect(renderedPoints[1][1]).toBeCloseTo(renderedPoints[2][1], 5);
      expect(Number(annotationLine.getAttribute('y1'))).toBeCloseTo(Number(annotationLine.getAttribute('y2')), 5);
      expect(Number(annotationLine.getAttribute('y1'))).toBeGreaterThan(renderedPoints[1][1]);
    });

    it('updates connection lines in real time during room drag', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const hallway = { ...createRoom('Hallway'), position: { x: 80, y: 0 } };
      let d = addRoom(doc, kitchen);
      d = addRoom(d, hallway);
      const conn = createConnection(kitchen.id, hallway.id, true);
      d = addConnection(d, conn, 'north', 'south');
      loadDocumentAct(d);

      renderMapCanvas();

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

    it('updates pseudo-room connection lines in real time during pseudo-room drag', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const unknown = { ...createPseudoRoom('unknown'), position: { x: 260, y: 40 } };
      let d = addRoom(doc, kitchen);
      d = addPseudoRoom(d, unknown);
      const conn = createConnection(kitchen.id, { kind: 'pseudo-room', id: unknown.id }, false);
      d = addConnection(d, conn, 'north');
      loadDocumentAct(d);

      renderMapCanvas();

      const connectionLine = screen.getByTestId(`connection-line-${conn.id}`);
      const pointsBefore = connectionLine.getAttribute('points');
      const pseudoRoomNode = screen.getByTestId('pseudo-room-node');

      fireEvent.mouseDown(pseudoRoomNode, { clientX: 260, clientY: 40, button: 0 });
      fireEvent.mouseMove(document, { clientX: 320, clientY: 100 });

      const pointsDuring = connectionLine.getAttribute('points');
      expect(pointsDuring).not.toBe(pointsBefore);

      fireEvent.mouseUp(document, { clientX: 320, clientY: 100 });
    });

    it('updates sticky-note links to pseudo-rooms in real time during pseudo-room drag', () => {
      const doc = createEmptyMap('Test');
      const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 200 } };
      const unknown = { ...createPseudoRoom('unknown'), position: { x: 260, y: 40 } };
      const stickyNote = { ...createStickyNote('Why is this here?'), position: { x: 40, y: 40 } };
      let d = addRoom(doc, kitchen);
      d = addPseudoRoom(d, unknown);
      d = addConnection(d, createConnection(kitchen.id, { kind: 'pseudo-room', id: unknown.id }, false), 'north');
      d = addStickyNote(d, stickyNote);
      d = {
        ...d,
        stickyNoteLinks: {
          'sticky-note-link-1': createStickyNoteLink(stickyNote.id, { kind: 'pseudo-room', id: unknown.id }),
        },
      };
      loadDocumentAct(d);

      renderMapCanvas();

      const stickyNoteLinkId = Object.values(useEditorStore.getState().doc!.stickyNoteLinks)[0].id;
      const stickyNoteLink = screen.getByTestId(`sticky-note-link-${stickyNoteLinkId}`);
      const endpointBefore = stickyNoteLink.getAttribute('x2');
      const pseudoRoomNode = screen.getByTestId('pseudo-room-node');

      fireEvent.mouseDown(pseudoRoomNode, { clientX: 260, clientY: 40, button: 0 });
      fireEvent.mouseMove(document, { clientX: 320, clientY: 100 });

      const endpointDuring = stickyNoteLink.getAttribute('x2');
      expect(endpointDuring).not.toBe(endpointBefore);

      fireEvent.mouseUp(document, { clientX: 320, clientY: 100 });
    });
  });
});
