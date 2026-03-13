import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { addConnection, addRoom } from '../../src/domain/map-operations';
import { createConnection, createEmptyMap, createRoom, createStickyNote } from '../../src/domain/map-types';
import type { ExportRenderInput } from '../../src/export/export-types';
import type { BackgroundChunkRecord } from '../../src/storage/map-store';

const mockValidateExportBounds = jest.fn<typeof import('../../src/export/export-bounds').validateExportBounds>();
const mockBlobToCanvas = jest.fn<typeof import('../../src/components/map-background-raster').blobToCanvas>();
const mockCreateSizedCanvas = jest.fn<typeof import('../../src/components/map-background-raster').createSizedCanvas>();
const mockGetRoomFillColor = jest.fn<typeof import('../../src/domain/room-color-palette').getRoomFillColor>();
const mockGetRoomStrokeColor = jest.fn<typeof import('../../src/domain/room-color-palette').getRoomStrokeColor>();
const mockGetRoomStrokeDasharray = jest.fn<typeof import('../../src/components/map-canvas-helpers').getRoomStrokeDasharray>();
const mockComputeConnectionPath = jest.fn<typeof import('../../src/graph/connection-geometry').computeConnectionPath>();
const mockComputeGeometryArrowheadPoints = jest.fn<typeof import('../../src/graph/connection-geometry').computeGeometryArrowheadPoints>();
const mockCreateConnectionRenderGeometry = jest.fn<typeof import('../../src/graph/connection-geometry').createConnectionRenderGeometry>();
const mockFindRoomDirectionForConnection = jest.fn<typeof import('../../src/graph/connection-geometry').findRoomDirectionForConnection>();
const mockSampleConnectionGeometryAtFraction = jest.fn<typeof import('../../src/graph/connection-geometry').sampleConnectionGeometryAtFraction>();
const mockGetRoomNodeWidth = jest.fn<typeof import('../../src/graph/minimap-geometry').getRoomNodeWidth>();
const mockListBackgroundChunksInBounds = jest.fn<typeof import('../../src/storage/map-store').listBackgroundChunksInBounds>();

await jest.unstable_mockModule('../../src/export/export-bounds', () => ({
  validateExportBounds: mockValidateExportBounds,
}));

await jest.unstable_mockModule('../../src/components/map-background-raster', () => ({
  blobToCanvas: mockBlobToCanvas,
  createSizedCanvas: mockCreateSizedCanvas,
}));

await jest.unstable_mockModule('../../src/domain/room-color-palette', async () => {
  return {
    getRoomFillColor: mockGetRoomFillColor,
    getRoomStrokeColor: mockGetRoomStrokeColor,
  };
});

await jest.unstable_mockModule('../../src/components/map-canvas-helpers', () => ({
  getRoomStrokeDasharray: mockGetRoomStrokeDasharray,
}));

await jest.unstable_mockModule('../../src/graph/connection-geometry', async () => {
  return {
    ROOM_CORNER_RADIUS: 12,
    ROOM_HEIGHT: 36,
    computeConnectionPath: mockComputeConnectionPath,
    computeGeometryArrowheadPoints: mockComputeGeometryArrowheadPoints,
    createConnectionRenderGeometry: mockCreateConnectionRenderGeometry,
    findRoomDirectionForConnection: mockFindRoomDirectionForConnection,
    sampleConnectionGeometryAtFraction: mockSampleConnectionGeometryAtFraction,
  };
});

await jest.unstable_mockModule('../../src/graph/minimap-geometry', async () => {
  return {
    getRoomNodeWidth: mockGetRoomNodeWidth,
  };
});

await jest.unstable_mockModule('../../src/storage/map-store', () => ({
  listBackgroundChunksInBounds: mockListBackgroundChunksInBounds,
}));

const { renderExportCanvas } = await import('../../src/export/export-render');

type FakeContext = {
  readonly fillRect: ReturnType<typeof jest.fn>;
  readonly clearRect: ReturnType<typeof jest.fn>;
  readonly save: ReturnType<typeof jest.fn>;
  readonly restore: ReturnType<typeof jest.fn>;
  readonly scale: ReturnType<typeof jest.fn>;
  readonly translate: ReturnType<typeof jest.fn>;
  readonly beginPath: ReturnType<typeof jest.fn>;
  readonly moveTo: ReturnType<typeof jest.fn>;
  readonly lineTo: ReturnType<typeof jest.fn>;
  readonly quadraticCurveTo: ReturnType<typeof jest.fn>;
  readonly bezierCurveTo: ReturnType<typeof jest.fn>;
  readonly closePath: ReturnType<typeof jest.fn>;
  readonly fill: ReturnType<typeof jest.fn>;
  readonly stroke: ReturnType<typeof jest.fn>;
  readonly setLineDash: ReturnType<typeof jest.fn>;
  readonly ellipse: ReturnType<typeof jest.fn>;
  readonly arc: ReturnType<typeof jest.fn>;
  readonly fillText: ReturnType<typeof jest.fn>;
  readonly drawImage: ReturnType<typeof jest.fn>;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  font: string;
  lineCap: CanvasLineCap;
  textAlign: CanvasTextAlign;
  textBaseline: CanvasTextBaseline;
  globalAlpha: number;
};

function createFakeContext(): FakeContext {
  return {
    fillRect: jest.fn(),
    clearRect: jest.fn(),
    save: jest.fn(),
    restore: jest.fn(),
    scale: jest.fn(),
    translate: jest.fn(),
    beginPath: jest.fn(),
    moveTo: jest.fn(),
    lineTo: jest.fn(),
    quadraticCurveTo: jest.fn(),
    bezierCurveTo: jest.fn(),
    closePath: jest.fn(),
    fill: jest.fn(),
    stroke: jest.fn(),
    setLineDash: jest.fn(),
    ellipse: jest.fn(),
    arc: jest.fn(),
    fillText: jest.fn(),
    drawImage: jest.fn(),
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    font: '',
    lineCap: 'butt',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    globalAlpha: 1,
  };
}

function createBaseInput(): ExportRenderInput {
  const rectangleRoom = { ...createRoom('Rect'), id: 'room-rect', position: { x: 0, y: 0 }, shape: 'rectangle' as const };
  const diamondRoom = { ...createRoom('Diamond'), id: 'room-diamond', position: { x: 160, y: 0 }, shape: 'diamond' as const };
  const ovalRoom = { ...createRoom('Oval'), id: 'room-oval', position: { x: 320, y: 0 }, shape: 'oval' as const };
  const octagonRoom = { ...createRoom('Octagon'), id: 'room-octagon', position: { x: 480, y: 0 }, shape: 'octagon' as const };
  let doc = createEmptyMap('Render Test');
  doc = addRoom(doc, rectangleRoom);
  doc = addRoom(doc, diamondRoom);
  doc = addRoom(doc, ovalRoom);
  doc = addRoom(doc, octagonRoom);

  const oneWay = {
    ...createConnection(rectangleRoom.id, diamondRoom.id, false),
    id: 'connection-one-way',
    startLabel: 'north',
    annotation: { kind: 'text', text: 'stairs' },
  };
  const twoWay = {
    ...createConnection(ovalRoom.id, octagonRoom.id, true),
    id: 'connection-two-way',
    endLabel: 'south',
    annotation: { kind: 'up' },
  };
  doc = addConnection(doc, oneWay, 'north');
  doc = addConnection(doc, twoWay, 'east', 'west');
  doc = {
    ...doc,
    stickyNotes: {
      'sticky-note-1': {
        ...createStickyNote('remember this'),
        id: 'sticky-note-1',
        position: { x: 40, y: 120 },
      },
    },
    stickyNoteLinks: {
      'sticky-note-link-1': {
        id: 'sticky-note-link-1',
        stickyNoteId: 'sticky-note-1',
        roomId: rectangleRoom.id,
      },
    },
    background: {
      activeLayerId: 'layer-1',
      layers: {
        'layer-1': {
          id: 'layer-1',
          name: 'Layer 1',
          visible: true,
          opacity: 0.75,
          pixelSize: 1,
          chunkSize: 256,
        },
      },
    },
  };

  return {
    doc,
    theme: 'dark',
    settings: {
      scope: 'entire-map',
      padding: 0,
      scale: 2,
      background: 'theme-canvas',
      includeBackgroundDrawing: true,
      includeGrid: true,
    },
    bounds: {
      left: 0,
      top: 0,
      right: 640,
      bottom: 240,
    },
    selectedRoomIds: [rectangleRoom.id],
    selectedStickyNoteIds: ['sticky-note-1'],
    selectedConnectionIds: [oneWay.id],
    selectedStickyNoteLinkIds: ['sticky-note-link-1'],
  };
}

describe('renderExportCanvas', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockValidateExportBounds.mockReturnValue(null);
    mockBlobToCanvas.mockResolvedValue({ width: 64, height: 64 } as HTMLCanvasElement);
    mockGetRoomFillColor.mockImplementation((index) => `fill-${index}`);
    mockGetRoomStrokeColor.mockImplementation((index) => `stroke-${index}`);
    mockGetRoomStrokeDasharray.mockImplementation((style) => {
      if (style === 'dashed') {
        return '4 2';
      }
      if (style === 'dotted') {
        return '1 2';
      }
      return undefined;
    });
    mockGetRoomNodeWidth.mockImplementation((roomOrName) => {
      const name = typeof roomOrName === 'string' ? roomOrName : roomOrName.name;
      return Math.max(80, name.length * 10);
    });
    mockComputeConnectionPath.mockImplementation((sourceRoom, targetRoom) => [
      { x: sourceRoom.position.x, y: sourceRoom.position.y },
      { x: targetRoom.position.x, y: targetRoom.position.y },
    ]);
    mockCreateConnectionRenderGeometry.mockImplementation((_points, isBidirectional, useBezierConnections) => {
      if (useBezierConnections) {
        return {
          kind: 'cubic',
          start: { x: 0, y: 0 },
          control1: { x: 20, y: 10 },
          control2: { x: 40, y: 10 },
          end: { x: 60, y: 0 },
        };
      }
      if (isBidirectional) {
        return {
          kind: 'quadratic',
          start: { x: 0, y: 0 },
          control: { x: 20, y: 20 },
          end: { x: 40, y: 0 },
        };
      }
      return {
        kind: 'polyline',
        points: [
          { x: 0, y: 0 },
          { x: 40, y: 0 },
        ],
      };
    });
    mockComputeGeometryArrowheadPoints.mockReturnValue([
      [
        { x: 30, y: 0 },
        { x: 24, y: -4 },
        { x: 24, y: 4 },
      ],
    ]);
    mockSampleConnectionGeometryAtFraction.mockReturnValue({
      point: { x: 20, y: 10 },
      tangent: { x: 10, y: 0 },
    });
    mockFindRoomDirectionForConnection.mockImplementation((room, connectionId) => {
      const match = Object.entries(room.directions).find(([, candidateConnectionId]) => candidateConnectionId === connectionId);
      return match?.[0];
    });
    mockListBackgroundChunksInBounds.mockResolvedValue([
      {
        key: 'map-1:layer-1:0:0',
        mapId: 'map-1',
        layerId: 'layer-1',
        chunkX: 0,
        chunkY: 0,
        width: 256,
        height: 256,
        blob: new Blob(['chunk']),
        updatedAt: '2026-03-09T00:00:00.000Z',
      } satisfies BackgroundChunkRecord,
    ]);
  });

  it('throws when bounds validation fails', async () => {
    mockValidateExportBounds.mockReturnValue({
      code: 'width-too-large',
      message: 'Too large.',
    });

    await expect(renderExportCanvas(createBaseInput())).rejects.toThrow('Too large.');
  });

  it('throws when the canvas context cannot be created', async () => {
    mockCreateSizedCanvas.mockReturnValue({
      getContext: jest.fn().mockReturnValue(null),
    } as unknown as HTMLCanvasElement);

    await expect(renderExportCanvas(createBaseInput())).rejects.toThrow('Could not create export canvas.');
  });

  it('renders background, grid, raster, rooms, connections, arrowheads, and labels', async () => {
    const context = createFakeContext();
    const canvas = { getContext: jest.fn().mockReturnValue(context) } as unknown as HTMLCanvasElement;
    mockCreateSizedCanvas.mockReturnValue(canvas);

    const rendered = await renderExportCanvas(createBaseInput());

    expect(rendered).toBe(canvas);
    expect(mockCreateSizedCanvas).toHaveBeenCalledWith(1280, 480);
    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1280, 480);
    expect(context.scale).toHaveBeenCalledWith(2, 2);
    expect(context.translate).toHaveBeenCalledTimes(1);
    expect(context.drawImage).toHaveBeenCalledTimes(1);
    expect(context.quadraticCurveTo).toHaveBeenCalled();
    expect(context.lineTo).toHaveBeenCalled();
    expect(context.ellipse).toHaveBeenCalled();
    expect(context.fillText).toHaveBeenCalledWith('Rect', expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith('Diamond', expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith('Oval', expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith('Octagon', expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith('remember this', expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith('north', expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith('south', expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith('stairs', expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith('up', expect.any(Number), expect.any(Number));
    expect(context.setLineDash).toHaveBeenCalled();
    expect(context.moveTo).toHaveBeenCalledWith(130, 170);
    expect(context.lineTo).toHaveBeenCalledWith(40, 18);
    expect(mockListBackgroundChunksInBounds).toHaveBeenCalled();
  });

  it('filters to the selection and supports transparent backgrounds', async () => {
    const context = createFakeContext();
    const canvas = { getContext: jest.fn().mockReturnValue(context) } as unknown as HTMLCanvasElement;
    mockCreateSizedCanvas.mockReturnValue(canvas);

    const baseInput = createBaseInput();
    const input: ExportRenderInput = {
      ...baseInput,
      doc: {
        ...baseInput.doc,
        view: {
          ...baseInput.doc.view,
          useBezierConnections: true,
        },
        background: {
          activeLayerId: 'hidden-layer',
          layers: {
            'hidden-layer': {
              id: 'hidden-layer',
              name: 'Hidden',
              visible: false,
              opacity: 0.5,
              pixelSize: 1,
              chunkSize: 256,
            },
          },
        },
      },
      settings: {
        ...baseInput.settings,
        scope: 'selection',
        scale: 1,
        background: 'transparent',
        includeGrid: false,
        includeBackgroundDrawing: false,
      },
    };

    await renderExportCanvas(input);

    expect(context.clearRect).toHaveBeenCalledWith(0, 0, 640, 240);
    expect(context.fillRect).not.toHaveBeenCalled();
    expect(context.bezierCurveTo).toHaveBeenCalled();
    expect(context.fillText).toHaveBeenCalledWith('Rect', expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith('remember this', expect.any(Number), expect.any(Number));
    expect(context.fillText).not.toHaveBeenCalledWith('Diamond', expect.any(Number), expect.any(Number));
    expect(mockListBackgroundChunksInBounds).not.toHaveBeenCalled();
  });

  it('fills a white background when requested', async () => {
    const context = createFakeContext();
    const canvas = { getContext: jest.fn().mockReturnValue(context) } as unknown as HTMLCanvasElement;
    mockCreateSizedCanvas.mockReturnValue(canvas);

    const baseInput = createBaseInput();
    const input: ExportRenderInput = {
      ...baseInput,
      settings: {
        ...baseInput.settings,
        scale: 1,
        background: 'white',
        includeGrid: false,
        includeBackgroundDrawing: false,
      },
    };

    await renderExportCanvas(input);

    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 640, 240);
    expect(context.clearRect).not.toHaveBeenCalled();
  });

  it('renders a padlock glyph for locked rooms and uses light-theme keyhole colors', async () => {
    const context = createFakeContext();
    const canvas = { getContext: jest.fn().mockReturnValue(context) } as unknown as HTMLCanvasElement;
    mockCreateSizedCanvas.mockReturnValue(canvas);

    const baseInput = createBaseInput();
    const lockedRoom = {
      ...baseInput.doc.rooms['room-rect'],
      locked: true,
    };
    const input: ExportRenderInput = {
      ...baseInput,
      theme: 'light',
      doc: {
        ...baseInput.doc,
        rooms: {
          ...baseInput.doc.rooms,
          [lockedRoom.id]: lockedRoom,
        },
      },
    };

    await renderExportCanvas(input);

    expect(context.save).toHaveBeenCalled();
    expect(context.translate).toHaveBeenCalledTimes(2);
    expect(context.arc).toHaveBeenCalled();
    expect(context.restore).toHaveBeenCalled();
    expect(context.fillText).toHaveBeenCalledWith('Rect', expect.any(Number), expect.any(Number));
  });

  it('skips background raster rendering when there is no active visible layer', async () => {
    const context = createFakeContext();
    const canvas = { getContext: jest.fn().mockReturnValue(context) } as unknown as HTMLCanvasElement;
    mockCreateSizedCanvas.mockReturnValue(canvas);

    const baseInput = createBaseInput();
    const input: ExportRenderInput = {
      ...baseInput,
      doc: {
        ...baseInput.doc,
        background: {
          activeLayerId: null,
          layers: baseInput.doc.background.layers,
        },
      },
    };

    await renderExportCanvas(input);

    expect(mockListBackgroundChunksInBounds).not.toHaveBeenCalled();
    expect(context.drawImage).not.toHaveBeenCalled();
  });

  it('renders vertical endpoint labels and skips annotation text when no midpoint sample is available', async () => {
    const context = createFakeContext();
    const canvas = { getContext: jest.fn().mockReturnValue(context) } as unknown as HTMLCanvasElement;
    mockCreateSizedCanvas.mockReturnValue(canvas);

    const baseInput = createBaseInput();
    const input: ExportRenderInput = {
      ...baseInput,
      doc: {
        ...baseInput.doc,
        connections: {
          'connection-two-way': {
            ...baseInput.doc.connections['connection-two-way'],
            startLabel: ' enter ',
            endLabel: ' exit ',
            annotation: { kind: 'out' },
          },
        },
      },
      selectedConnectionIds: ['connection-two-way'],
      selectedRoomIds: ['room-oval', 'room-octagon'],
      settings: {
        ...baseInput.settings,
        scope: 'selection',
      },
    };

    mockComputeConnectionPath.mockReturnValue([
      { x: 0, y: 0 },
      { x: 0, y: 40 },
    ]);
    mockCreateConnectionRenderGeometry.mockReturnValue({
      kind: 'quadratic',
      start: { x: 0, y: 0 },
      control: { x: 0, y: 20 },
      end: { x: 0, y: 40 },
    });
    mockSampleConnectionGeometryAtFraction.mockReturnValue(null);

    await renderExportCanvas(input);

    expect(context.fillText).toHaveBeenCalledWith('enter', 10, 20);
    expect(context.fillText).toHaveBeenCalledWith('exit', 10, 20);
    expect(context.fillText).not.toHaveBeenCalledWith('in', expect.any(Number), expect.any(Number));
  });

  it('tolerates missing connection endpoints and empty polyline geometry', async () => {
    const context = createFakeContext();
    const canvas = { getContext: jest.fn().mockReturnValue(context) } as unknown as HTMLCanvasElement;
    mockCreateSizedCanvas.mockReturnValue(canvas);

    const baseInput = createBaseInput();
    const danglingConnection = {
      ...baseInput.doc.connections['connection-one-way'],
      id: 'connection-dangling',
      sourceRoomId: 'missing-room',
      targetRoomId: 'room-diamond',
      annotation: null,
      startLabel: '',
      endLabel: '',
    };
    const validConnection = {
      ...baseInput.doc.connections['connection-two-way'],
      id: 'connection-empty-polyline',
      annotation: null,
      startLabel: '',
      endLabel: '',
    };
    const input: ExportRenderInput = {
      ...baseInput,
      doc: {
        ...baseInput.doc,
        connections: {
          'connection-dangling': danglingConnection,
          'connection-empty-polyline': validConnection,
        },
      },
      selectedConnectionIds: ['connection-dangling', 'connection-empty-polyline'],
      selectedRoomIds: ['room-oval', 'room-octagon'],
      settings: {
        ...baseInput.settings,
        scope: 'selection',
      },
    };

    mockCreateConnectionRenderGeometry.mockReturnValue({
      kind: 'polyline',
      points: [],
    });

    await expect(renderExportCanvas(input)).resolves.toBe(canvas);
    expect(context.beginPath).toHaveBeenCalled();
    expect(context.moveTo).not.toHaveBeenCalledWith(undefined, undefined);
  });

  it('renders a down label for derived vertical direction decorations', async () => {
    const context = createFakeContext();
    const canvas = { getContext: jest.fn().mockReturnValue(context) } as unknown as HTMLCanvasElement;
    mockCreateSizedCanvas.mockReturnValue(canvas);

    const source = { ...createRoom('Ledge'), id: 'room-source', position: { x: 0, y: 0 } };
    const target = { ...createRoom('Pit'), id: 'room-target', position: { x: 160, y: 0 } };
    let doc = createEmptyMap('Derived Down');
    doc = addRoom(doc, source);
    doc = addRoom(doc, target);
    doc = addConnection(doc, { ...createConnection(source.id, target.id, false), id: 'connection-down' }, 'down');

    await renderExportCanvas({
      ...createBaseInput(),
      doc,
      selectedRoomIds: [],
      selectedConnectionIds: [],
    });

    expect(context.fillText).toHaveBeenCalledWith('down', expect.any(Number), expect.any(Number));
  });
});
