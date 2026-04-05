import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { DUNGEON_ICON_PATH, LOCK_ICON_PATH } from '../../src/components/connection-annotation-icon';
import { addConnection, addItem, addPseudoRoom, addRoom } from '../../src/domain/map-operations';
import { createConnection, createEmptyMap, createItem, createPseudoRoom, createRoom, createStickyNote } from '../../src/domain/map-types';
import type { ExportRenderInput } from '../../src/export/export-types';
import type { BackgroundChunkRecord } from '../../src/storage/map-store';

const mockValidateExportBounds = jest.fn<typeof import('../../src/export/export-bounds').validateExportBounds>();
const mockBlobToCanvas = jest.fn<typeof import('../../src/components/map-background-raster').blobToCanvas>();
const mockCreateSizedCanvas = jest.fn<typeof import('../../src/components/map-background-raster').createSizedCanvas>();
const mockGetRoomFillColor = jest.fn<typeof import('../../src/domain/room-color-palette').getRoomFillColor>();
const mockGetRoomLabelColor = jest.fn<typeof import('../../src/domain/room-color-palette').getRoomLabelColor>();
const mockGetRoomStrokeColor = jest.fn<typeof import('../../src/domain/room-color-palette').getRoomStrokeColor>();
const mockGetRoomStrokeDasharray = jest.fn<typeof import('../../src/components/map-canvas-helpers').getRoomStrokeDasharray>();
const mockDrawPaperTexture = jest.fn<typeof import('../../src/graph/perlin-paper-texture').drawPaperTexture>();
const mockDrawContourLandscapeTexture = jest.fn<typeof import('../../src/graph/contour-landscape-texture').drawContourLandscapeTexture>();
const mockComputeConnectionPath = jest.fn<typeof import('../../src/graph/connection-geometry').computeConnectionPath>();
const mockComputeGeometryArrowheadPoints = jest.fn<typeof import('../../src/graph/connection-geometry').computeGeometryArrowheadPoints>();
const mockCreateConnectionRenderGeometry = jest.fn<typeof import('../../src/graph/connection-geometry').createConnectionRenderGeometry>();
const mockFlattenConnectionGeometry = jest.fn<typeof import('../../src/graph/connection-geometry').flattenConnectionGeometry>();
const mockFindRoomDirectionForConnection = jest.fn<typeof import('../../src/graph/connection-geometry').findRoomDirectionForConnection>();
const mockFindRoomDirectionsForConnection = jest.fn<typeof import('../../src/graph/connection-geometry').findRoomDirectionsForConnection>();
const mockGetConnectionGeometryLength = jest.fn<typeof import('../../src/graph/connection-geometry').getConnectionGeometryLength>();
const mockSampleConnectionGeometryAtFraction = jest.fn<typeof import('../../src/graph/connection-geometry').sampleConnectionGeometryAtFraction>();
const mockGetRoomNodeWidth = jest.fn<typeof import('../../src/graph/minimap-geometry').getRoomNodeWidth>();
const mockListBackgroundChunksInBounds = jest.fn<typeof import('../../src/storage/map-store').listBackgroundChunksInBounds>();
const mockPath2D = jest.fn<(pathData?: string) => { readonly pathData: string | undefined }>();

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
    getRoomLabelColor: mockGetRoomLabelColor,
    getRoomStrokeColor: mockGetRoomStrokeColor,
  };
});

await jest.unstable_mockModule('../../src/components/map-canvas-helpers', () => ({
  getRoomStrokeDasharray: mockGetRoomStrokeDasharray,
}));

await jest.unstable_mockModule('../../src/graph/perlin-paper-texture', () => ({
  drawPaperTexture: mockDrawPaperTexture,
}));

await jest.unstable_mockModule('../../src/graph/contour-landscape-texture', () => ({
  drawContourLandscapeTexture: mockDrawContourLandscapeTexture,
}));

await jest.unstable_mockModule('../../src/graph/connection-geometry', async () => {
  return {
    ROOM_CORNER_RADIUS: 12,
    ROOM_HEIGHT: 36,
    computeConnectionPath: mockComputeConnectionPath,
    computeGeometryArrowheadPoints: mockComputeGeometryArrowheadPoints,
    createConnectionRenderGeometry: mockCreateConnectionRenderGeometry,
    flattenConnectionGeometry: mockFlattenConnectionGeometry,
    findRoomDirectionForConnection: mockFindRoomDirectionForConnection,
    findRoomDirectionsForConnection: mockFindRoomDirectionsForConnection,
    getRoomPerimeterPointToward: (_roomPosition: { x: number; y: number }, towardPoint: { x: number; y: number }) => towardPoint,
    getConnectionGeometryLength: mockGetConnectionGeometryLength,
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
  loadTextureTile: jest.fn(async () => undefined),
  saveTextureTile: jest.fn(async () => undefined),
}));

const { renderExportCanvas } = await import('../../src/export/export-render');

type FakeContext = {
  readonly fillRect: ReturnType<typeof jest.fn>;
  readonly clearRect: ReturnType<typeof jest.fn>;
  readonly save: ReturnType<typeof jest.fn>;
  readonly restore: ReturnType<typeof jest.fn>;
  readonly scale: ReturnType<typeof jest.fn>;
  readonly translate: ReturnType<typeof jest.fn>;
  readonly rotate: ReturnType<typeof jest.fn>;
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
  lineJoin: CanvasLineJoin;
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
    rotate: jest.fn(),
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
    lineJoin: 'miter',
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
  const unknownExit = {
    ...createPseudoRoom('unknown'),
    id: 'pseudo-room-unknown',
    position: { x: 180, y: 120 },
  };
  const unknownConnection = {
    ...createConnection(diamondRoom.id, { kind: 'pseudo-room', id: unknownExit.id }, false),
    id: 'connection-unknown',
  };
  doc = addConnection(doc, oneWay, 'north');
  doc = addConnection(doc, twoWay, 'east', 'west');
  doc = addPseudoRoom(doc, unknownExit);
  doc = addConnection(doc, unknownConnection, 'south');
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
        target: { kind: 'room', id: rectangleRoom.id },
      },
    },
    background: {
      activeLayerId: 'layer-1',
      referenceImage: {
        id: 'background-image-1',
        name: 'overlay.png',
        mimeType: 'image/png',
        dataUrl: 'data:image/png;base64,AAAA',
        sourceUrl: null,
        width: 320,
        height: 180,
        zoom: 1.5,
        position: { x: 0, y: 0 },
      },
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
      includeBackgroundImage: true,
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
    (globalThis as typeof globalThis & { Path2D?: typeof Path2D }).Path2D = mockPath2D as unknown as typeof Path2D;
    mockPath2D.mockImplementation((pathData) => ({ pathData }));

    mockValidateExportBounds.mockReturnValue(null);
    mockBlobToCanvas.mockResolvedValue({ width: 64, height: 64 } as HTMLCanvasElement);
    mockGetRoomFillColor.mockImplementation((index) => `fill-${index}`);
    mockGetRoomLabelColor.mockReturnValue('label-color');
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
    mockDrawPaperTexture.mockImplementation(async () => {});
    mockDrawContourLandscapeTexture.mockImplementation(async () => {});
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
    mockFlattenConnectionGeometry.mockImplementation((geometry) => {
      if (geometry.kind === 'polyline') {
        return geometry.points;
      }

      return [geometry.start, { x: 20, y: 162 }, { x: 20, y: 114 }, geometry.end];
    });
    mockGetConnectionGeometryLength.mockReturnValue(40);
    mockFindRoomDirectionForConnection.mockImplementation((room, connectionId) => {
      const match = Object.entries(room.directions).find(([, candidateConnectionId]) => candidateConnectionId === connectionId);
      return match?.[0];
    });
    mockFindRoomDirectionsForConnection.mockImplementation((room, connectionId) => (
      Object.entries(room.directions)
        .filter(([, candidateConnectionId]) => candidateConnectionId === connectionId)
        .map(([direction]) => direction)
    ));
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

    const baseInput = createBaseInput();
    const rendered = await renderExportCanvas({
      ...baseInput,
      doc: {
        ...baseInput.doc,
        view: {
          ...baseInput.doc.view,
          visualStyle: 'default',
          canvasTheme: 'paper',
        },
      },
    });

    expect(rendered).toBe(canvas);
    expect(mockCreateSizedCanvas).toHaveBeenCalledWith(1280, 480);
    expect(mockDrawPaperTexture.mock.calls[0]?.[0]).toBeTruthy();
    expect(mockDrawPaperTexture.mock.calls[0]?.[1]).toBe(1280);
    expect(mockDrawPaperTexture.mock.calls[0]?.[2]).toBe(480);
    expect(mockDrawPaperTexture.mock.calls[0]?.[3]).toBe('dark');
    expect(mockDrawPaperTexture.mock.calls[0]?.[4]).toMatchObject({
      mapId: baseInput.doc.metadata.id,
      textureSeed: baseInput.doc.view.textureSeed,
      theme: 'dark',
    });
    expect(mockDrawPaperTexture.mock.calls[0]?.[5]).toMatchObject({
      scaleMultiplier: 2,
    });
    expect(context.scale).toHaveBeenCalledWith(2, 2);
    expect(context.drawImage).toHaveBeenCalledTimes(2);
    expect(context.lineTo).toHaveBeenCalled();
    expect(context.ellipse).toHaveBeenCalled();
    expect(context.fillText).toHaveBeenCalledWith('Rect', expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith('Diamond', expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith('Oval', expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith('Octagon', expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith('remember this', expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith('north', expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith('south', expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith('stairs', 0, 0);
    expect(context.fillText).toHaveBeenCalledWith('up', expect.any(Number), expect.any(Number));
    expect(context.setLineDash).toHaveBeenCalled();
    expect(mockPath2D).toHaveBeenCalledWith(expect.stringContaining('M224 224C224 171'));
    expect(context.fill).toHaveBeenCalledWith(expect.objectContaining({ pathData: expect.stringContaining('M224 224C224 171') }));
    expect(context.moveTo).toHaveBeenCalledWith(130, 170);
    expect(context.lineTo).toHaveBeenCalled();
    expect(context.translate).toHaveBeenCalledWith(80, 20);
    expect(context.rotate.mock.calls.some(([angle]) => Math.abs(angle) < 1e-9)).toBe(true);
    expect(context.drawImage).toHaveBeenCalledWith(
      expect.objectContaining({ width: 64, height: 64 }),
      -240,
      -135,
      480,
      270,
    );
    expect(mockListBackgroundChunksInBounds).toHaveBeenCalled();
  });

  it('draws the contour landscape texture for theme-canvas exports when antique mode is enabled', async () => {
    const context = createFakeContext();
    const canvas = { getContext: jest.fn().mockReturnValue(context) } as unknown as HTMLCanvasElement;
    mockCreateSizedCanvas.mockReturnValue(canvas);

    const baseInput = createBaseInput();
    await renderExportCanvas({
      ...baseInput,
      doc: {
        ...baseInput.doc,
        view: {
          ...baseInput.doc.view,
          canvasTheme: 'antique',
        },
      },
    });

    expect(mockDrawContourLandscapeTexture.mock.calls[0]?.[0]).toBeTruthy();
    expect(mockDrawContourLandscapeTexture.mock.calls[0]?.[1]).toBe(1280);
    expect(mockDrawContourLandscapeTexture.mock.calls[0]?.[2]).toBe(480);
    expect(mockDrawContourLandscapeTexture.mock.calls[0]?.[3]).toBe('dark');
    expect(mockDrawContourLandscapeTexture.mock.calls[0]?.[4]).toMatchObject({
      canvasTheme: 'antique',
      mapId: baseInput.doc.metadata.id,
      textureSeed: baseInput.doc.view.textureSeed,
      theme: 'dark',
    });
    expect(mockDrawContourLandscapeTexture.mock.calls[0]?.[5]).toMatchObject({
      scaleMultiplier: 2,
    });
  });

  it('draws the contour landscape texture for theme-canvas exports when contour mode is enabled', async () => {
    const context = createFakeContext();
    const canvas = { getContext: jest.fn().mockReturnValue(context) } as unknown as HTMLCanvasElement;
    mockCreateSizedCanvas.mockReturnValue(canvas);

    const baseInput = createBaseInput();
    await renderExportCanvas({
      ...baseInput,
      doc: {
        ...baseInput.doc,
        view: {
          ...baseInput.doc.view,
          canvasTheme: 'contour',
        },
      },
    });

    expect(mockDrawContourLandscapeTexture.mock.calls[0]?.[0]).toBeTruthy();
    expect(mockDrawContourLandscapeTexture.mock.calls[0]?.[1]).toBe(1280);
    expect(mockDrawContourLandscapeTexture.mock.calls[0]?.[2]).toBe(480);
    expect(mockDrawContourLandscapeTexture.mock.calls[0]?.[3]).toBe('dark');
    expect(mockDrawContourLandscapeTexture.mock.calls[0]?.[4]).toMatchObject({
      canvasTheme: 'contour',
      mapId: baseInput.doc.metadata.id,
      textureSeed: baseInput.doc.view.textureSeed,
      theme: 'dark',
    });
    expect(mockDrawContourLandscapeTexture.mock.calls[0]?.[5]).toMatchObject({
      scaleMultiplier: 2,
    });
  });

  it('passes bounds-based texture origin offsets for theme-canvas exports', async () => {
    const context = createFakeContext();
    const canvas = { getContext: jest.fn().mockReturnValue(context) } as unknown as HTMLCanvasElement;
    mockCreateSizedCanvas.mockReturnValue(canvas);

    const baseInput = createBaseInput();
    await renderExportCanvas({
      ...baseInput,
      bounds: {
        left: 40,
        top: 10,
        right: 680,
        bottom: 250,
      },
      doc: {
        ...baseInput.doc,
        view: {
          ...baseInput.doc.view,
          canvasTheme: 'paper',
        },
      },
    });

    expect(mockDrawPaperTexture).toHaveBeenCalledWith(
      expect.anything(),
      1280,
      480,
      'dark',
      expect.objectContaining({
        mapId: baseInput.doc.metadata.id,
        textureSeed: baseInput.doc.view.textureSeed,
        theme: 'dark',
      }),
      {
        scaleMultiplier: 2,
        originX: -80,
        originY: -20,
      },
    );
  });

  it('uses export scale for paper texture scaling even when viewport zoom is available', async () => {
    const context = createFakeContext();
    const canvas = { getContext: jest.fn().mockReturnValue(context) } as unknown as HTMLCanvasElement;
    mockCreateSizedCanvas.mockReturnValue(canvas);

    const baseInput = createBaseInput();
    await renderExportCanvas({
      ...baseInput,
      viewportZoom: 1.179,
      bounds: {
        left: 40,
        top: 10,
        right: 680,
        bottom: 250,
      },
      doc: {
        ...baseInput.doc,
        view: {
          ...baseInput.doc.view,
          canvasTheme: 'paper',
        },
      },
    });

    expect(mockDrawPaperTexture.mock.calls[0]?.[0]).toBeTruthy();
    expect(mockDrawPaperTexture.mock.calls[0]?.[1]).toBe(1280);
    expect(mockDrawPaperTexture.mock.calls[0]?.[2]).toBe(480);
    expect(mockDrawPaperTexture.mock.calls[0]?.[3]).toBe('dark');
    expect(mockDrawPaperTexture.mock.calls[0]?.[4]).toMatchObject({
      mapId: baseInput.doc.metadata.id,
      textureSeed: baseInput.doc.view.textureSeed,
      theme: 'dark',
    });
    expect(mockDrawPaperTexture.mock.calls[0]?.[5]?.scaleMultiplier).toBeCloseTo(2, 10);
    expect(mockDrawPaperTexture.mock.calls[0]?.[5]?.originX).toBeCloseTo(-80, 10);
    expect(mockDrawPaperTexture.mock.calls[0]?.[5]?.originY).toBeCloseTo(-20, 10);
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
          referenceImage: baseInput.doc.background.referenceImage,
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
        includeBackgroundImage: false,
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
    expect(context.fill).not.toHaveBeenCalledWith(expect.objectContaining({ pathData: expect.stringContaining('M224 224C224 171') }));
    expect(mockListBackgroundChunksInBounds).not.toHaveBeenCalled();
  });

  it('renders pseudo-room symbols for selected pseudo-room connections', async () => {
    const context = createFakeContext();
    const canvas = { getContext: jest.fn().mockReturnValue(context) } as unknown as HTMLCanvasElement;
    mockCreateSizedCanvas.mockReturnValue(canvas);

    const baseInput = createBaseInput();
    const input: ExportRenderInput = {
      ...baseInput,
      settings: {
        ...baseInput.settings,
        scope: 'selection',
        scale: 1,
      },
      selectedRoomIds: [],
      selectedStickyNoteIds: [],
      selectedConnectionIds: ['connection-unknown'],
      selectedStickyNoteLinkIds: [],
    };

    await renderExportCanvas(input);

    expect(context.fill).toHaveBeenCalledWith(expect.objectContaining({ pathData: expect.stringContaining('M224 224C224 171') }));
  });

  it('renders sticky-note links attached to pseudo-rooms', async () => {
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
          visualStyle: 'default',
        },
        stickyNoteLinks: {
          'sticky-note-link-1': {
            id: 'sticky-note-link-1',
            stickyNoteId: 'sticky-note-1',
            target: { kind: 'pseudo-room', id: 'pseudo-room-unknown' },
          },
        },
      },
      settings: {
        ...baseInput.settings,
        scope: 'selection',
        scale: 1,
      },
      selectedRoomIds: [],
      selectedStickyNoteIds: [],
      selectedConnectionIds: [],
      selectedStickyNoteLinkIds: ['sticky-note-link-1'],
    };

    await renderExportCanvas(input);

    expect(context.moveTo).toHaveBeenCalledWith(130, 170);
    expect(context.lineTo.mock.calls).toContainEqual([205.5, 134.5]);
    expect(context.stroke).toHaveBeenCalled();
  });

  it('skips background image rendering when disabled', async () => {
    const context = createFakeContext();
    const canvas = { getContext: jest.fn().mockReturnValue(context) } as unknown as HTMLCanvasElement;
    mockCreateSizedCanvas.mockReturnValue(canvas);

    const baseInput = createBaseInput();
    const input: ExportRenderInput = {
      ...baseInput,
      settings: {
        ...baseInput.settings,
        includeBackgroundImage: false,
      },
    };

    await renderExportCanvas(input);

    expect(context.drawImage).toHaveBeenCalledTimes(1);
    expect(mockListBackgroundChunksInBounds).toHaveBeenCalledTimes(1);
  });

  it('wraps long sticky-note lines in the exported PNG', async () => {
    const context = createFakeContext();
    const canvas = { getContext: jest.fn().mockReturnValue(context) } as unknown as HTMLCanvasElement;
    mockCreateSizedCanvas.mockReturnValue(canvas);

    const baseInput = createBaseInput();
    const input: ExportRenderInput = {
      ...baseInput,
      doc: {
        ...baseInput.doc,
        stickyNotes: {
          'sticky-note-1': {
            ...baseInput.doc.stickyNotes['sticky-note-1'],
            text: 'This sticky note line is definitely much longer than twenty characters.',
          },
        },
      },
    };

    await renderExportCanvas(input);

    expect(context.fillText).toHaveBeenCalledWith('This sticky note', expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith('line is definitely', expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith('much longer than', expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith('twenty characters.', expect.any(Number), expect.any(Number));
  });

  it('falls back to character wrapping for a single long sticky-note word', async () => {
    const context = createFakeContext();
    const canvas = { getContext: jest.fn().mockReturnValue(context) } as unknown as HTMLCanvasElement;
    mockCreateSizedCanvas.mockReturnValue(canvas);

    const baseInput = createBaseInput();
    const input: ExportRenderInput = {
      ...baseInput,
      doc: {
        ...baseInput.doc,
        stickyNotes: {
          'sticky-note-1': {
            ...baseInput.doc.stickyNotes['sticky-note-1'],
            text: 'supercalifragilisticexpialidocious',
          },
        },
      },
    };

    await renderExportCanvas(input);

    expect(context.fillText).toHaveBeenCalledWith('supercalifragilistic', expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith('expialidocious', expect.any(Number), expect.any(Number));
    expect(context.fillText).not.toHaveBeenCalledWith('supercalifragilisticexpialidocious', expect.any(Number), expect.any(Number));
  });

  it('preserves blank lines in sticky-note exports', async () => {
    const context = createFakeContext();
    const canvas = { getContext: jest.fn().mockReturnValue(context) } as unknown as HTMLCanvasElement;
    mockCreateSizedCanvas.mockReturnValue(canvas);

    const baseInput = createBaseInput();
    const input: ExportRenderInput = {
      ...baseInput,
      doc: {
        ...baseInput.doc,
        stickyNotes: {
          'sticky-note-1': {
            ...baseInput.doc.stickyNotes['sticky-note-1'],
            text: 'alpha\n\nbeta',
          },
        },
      },
    };

    await renderExportCanvas(input);

    expect(context.fillText).toHaveBeenCalledWith('alpha', expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith('', expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith('beta', expect.any(Number), expect.any(Number));
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
        includeBackgroundImage: false,
        includeGrid: false,
        includeBackgroundDrawing: false,
      },
    };

    await renderExportCanvas(input);

    expect(context.fillRect).toHaveBeenCalledWith(0, 0, 640, 240);
    expect(context.clearRect).not.toHaveBeenCalled();
  });

  it('renders room item names beneath exported room labels', async () => {
    const context = createFakeContext();
    const canvas = { getContext: jest.fn().mockReturnValue(context) } as unknown as HTMLCanvasElement;
    mockCreateSizedCanvas.mockReturnValue(canvas);

    const room = { ...createRoom('Kitchen'), id: 'room-kitchen', position: { x: 40, y: 60 } };
    const lantern = { ...createItem('lantern', room.id), id: 'item-lantern' };
    const key = { ...createItem('key', room.id), id: 'item-key' };
    let doc = createEmptyMap('Export Items');
    doc = addRoom(doc, room);
    doc = addItem(doc, lantern);
    doc = addItem(doc, key);

    await renderExportCanvas({
      ...createBaseInput(),
      doc,
    });

    expect(context.fillText).toHaveBeenCalledWith('lantern', expect.any(Number), expect.any(Number));
    expect(context.fillText).toHaveBeenCalledWith('key', expect.any(Number), expect.any(Number));
  });

  it('renders the fourth exported room item instead of a +1 more label', async () => {
    const context = createFakeContext();
    const canvas = { getContext: jest.fn().mockReturnValue(context) } as unknown as HTMLCanvasElement;
    mockCreateSizedCanvas.mockReturnValue(canvas);

    const room = { ...createRoom('Kitchen'), id: 'room-kitchen', position: { x: 40, y: 60 } };
    let doc = createEmptyMap('Export Four Items');
    doc = addRoom(doc, room);
    doc = addItem(doc, { ...createItem('lantern', room.id), id: 'item-lantern' });
    doc = addItem(doc, { ...createItem('key', room.id), id: 'item-key' });
    doc = addItem(doc, { ...createItem('rope', room.id), id: 'item-rope' });
    doc = addItem(doc, { ...createItem('apple', room.id), id: 'item-apple' });

    await renderExportCanvas({
      ...createBaseInput(),
      doc,
    });

    expect(context.fillText).toHaveBeenCalledWith('apple', expect.any(Number), expect.any(Number));
    expect(context.fillText).not.toHaveBeenCalledWith('+1 more', expect.any(Number), expect.any(Number));
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
        view: {
          ...baseInput.doc.view,
          visualStyle: 'default',
        },
        rooms: {
          ...baseInput.doc.rooms,
          [lockedRoom.id]: lockedRoom,
        },
      },
    };

    await renderExportCanvas(input);

    expect(context.save).toHaveBeenCalled();
    expect(context.translate).toHaveBeenCalled();
    expect(context.arc).toHaveBeenCalled();
    expect(context.restore).toHaveBeenCalled();
    expect(context.fillText).toHaveBeenCalledWith('Rect', expect.any(Number), expect.any(Number));
  });

  it('renders a dark-room glyph for dark rooms', async () => {
    const context = createFakeContext();
    const canvas = { getContext: jest.fn().mockReturnValue(context) } as unknown as HTMLCanvasElement;
    mockCreateSizedCanvas.mockReturnValue(canvas);

    const baseInput = createBaseInput();
    const darkRoom = {
      ...baseInput.doc.rooms['room-rect'],
      isDark: true,
    };
    const input: ExportRenderInput = {
      ...baseInput,
      doc: {
        ...baseInput.doc,
        rooms: {
          ...baseInput.doc.rooms,
          [darkRoom.id]: darkRoom,
        },
      },
    };

    await renderExportCanvas(input);

    expect(context.save).toHaveBeenCalled();
    expect(context.translate).toHaveBeenCalled();
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
          referenceImage: baseInput.doc.background.referenceImage,
          layers: baseInput.doc.background.layers,
        },
      },
    };

    await renderExportCanvas(input);

    expect(mockListBackgroundChunksInBounds).not.toHaveBeenCalled();
    expect(context.drawImage).toHaveBeenCalledTimes(1);
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
      target: { kind: 'room' as const, id: 'room-diamond' },
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

  it('renders a derived up annotation even when the connection has a door annotation', async () => {
    const context = createFakeContext();
    const canvas = { getContext: jest.fn().mockReturnValue(context) } as unknown as HTMLCanvasElement;
    mockCreateSizedCanvas.mockReturnValue(canvas);

    const source = { ...createRoom('Basement'), id: 'room-source', position: { x: 0, y: 160 } };
    const target = { ...createRoom('Attic'), id: 'room-target', position: { x: 160, y: 0 } };
    let doc = createEmptyMap('Door Up');
    doc = addRoom(doc, source);
    doc = addRoom(doc, target);
    doc = addConnection(
      doc,
      { ...createConnection(source.id, target.id, true), id: 'connection-door-up', annotation: { kind: 'door' } },
      'up',
      'down',
    );

    await renderExportCanvas({
      ...createBaseInput(),
      doc,
      selectedRoomIds: [],
      selectedConnectionIds: [],
    });

    expect(context.fillText).toHaveBeenCalledWith('up', expect.any(Number), expect.any(Number));
  });

  it('renders a door glyph in exported PNGs', async () => {
    const context = createFakeContext();
    const canvas = { getContext: jest.fn().mockReturnValue(context) } as unknown as HTMLCanvasElement;
    mockCreateSizedCanvas.mockReturnValue(canvas);

    const source = { ...createRoom('Basement'), id: 'room-source', position: { x: 0, y: 160 } };
    const target = { ...createRoom('Attic'), id: 'room-target', position: { x: 160, y: 0 } };
    let doc = createEmptyMap('Door Export');
    doc = addRoom(doc, source);
    doc = addRoom(doc, target);
    doc = addConnection(
      doc,
      { ...createConnection(source.id, target.id, true), id: 'connection-door', annotation: { kind: 'door' } },
      'north',
      'south',
    );

    await renderExportCanvas({
      ...createBaseInput(),
      doc: {
        ...doc,
        view: {
          ...doc.view,
          visualStyle: 'default',
        },
      },
      selectedRoomIds: [],
      selectedConnectionIds: [],
    });

    expect(mockPath2D).toHaveBeenCalledWith(DUNGEON_ICON_PATH);
    expect(context.fill).toHaveBeenCalledWith(expect.objectContaining({ pathData: DUNGEON_ICON_PATH }));
  });

  it('renders a locked door glyph in exported PNGs', async () => {
    const context = createFakeContext();
    const canvas = { getContext: jest.fn().mockReturnValue(context) } as unknown as HTMLCanvasElement;
    mockCreateSizedCanvas.mockReturnValue(canvas);

    const source = { ...createRoom('Basement'), id: 'room-source', position: { x: 0, y: 160 } };
    const target = { ...createRoom('Attic'), id: 'room-target', position: { x: 160, y: 0 } };
    let doc = createEmptyMap('Locked Door Export');
    doc = addRoom(doc, source);
    doc = addRoom(doc, target);
    doc = addConnection(
      doc,
      { ...createConnection(source.id, target.id, true), id: 'connection-locked-door', annotation: { kind: 'locked door' } },
      'north',
      'south',
    );

    await renderExportCanvas({
      ...createBaseInput(),
      doc: {
        ...doc,
        view: {
          ...doc.view,
          visualStyle: 'default',
        },
      },
      selectedRoomIds: [],
      selectedConnectionIds: [],
    });

    expect(mockPath2D).toHaveBeenCalledWith(LOCK_ICON_PATH);
    expect(context.fill).toHaveBeenCalledWith(expect.objectContaining({ pathData: LOCK_ICON_PATH }));
  });

  it('renders arrow geometry for up annotations in exported PNGs', async () => {
    const context = createFakeContext();
    const canvas = { getContext: jest.fn().mockReturnValue(context) } as unknown as HTMLCanvasElement;
    mockCreateSizedCanvas.mockReturnValue(canvas);

    const input = createBaseInput();

    await renderExportCanvas(input);

    expect(context.moveTo).toHaveBeenCalledWith(7, 18);
    expect(context.lineTo).toHaveBeenCalledWith(33, 18);
    expect(context.moveTo).toHaveBeenCalledWith(33, 18);
    expect(context.lineTo).toHaveBeenCalledWith(23, 22);
    expect(context.lineTo).toHaveBeenCalledWith(23, 14);
    expect(context.translate).toHaveBeenCalledWith(20, 30);
    expect(context.rotate.mock.calls.some(([angle]) => Math.abs((angle as number) - 0) < 1e-9)).toBe(true);
    expect(context.fillText).toHaveBeenCalledWith('up', 0, 0);
  });

  it('renders arrow geometry for out annotations in exported PNGs', async () => {
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
            annotation: { kind: 'out' },
          },
        },
      },
    };

    await renderExportCanvas(input);

    expect(context.moveTo).toHaveBeenCalledWith(36, 18);
    expect(context.lineTo).toHaveBeenCalledWith(4, 18);
    expect(context.moveTo).toHaveBeenCalledWith(4, 18);
    expect(context.lineTo).toHaveBeenCalledWith(14, 22);
    expect(context.lineTo).toHaveBeenCalledWith(14, 14);
    expect(context.translate).toHaveBeenCalledWith(20, 30);
    expect(context.rotate.mock.calls.some(([angle]) => Math.abs(angle as number) < 1e-9)).toBe(true);
    expect(context.fillText).toHaveBeenCalledWith('in', 0, 0);
  });

  it('renders one-way down self-loop annotations below the upright triangle base in exported PNGs', async () => {
    const context = createFakeContext();
    const canvas = { getContext: jest.fn().mockReturnValue(context) } as unknown as HTMLCanvasElement;
    mockCreateSizedCanvas.mockReturnValue(canvas);

    const room = { ...createRoom('Room'), id: 'room-self', position: { x: 0, y: 0 } };
    let doc = createEmptyMap('Self Loop');
    doc = addRoom(doc, room);
    const selfConnection = {
      ...createConnection(room.id, room.id, false),
      id: 'connection-self-down',
    };
    doc = addConnection(doc, selfConnection, 'down');

    mockComputeConnectionPath.mockReturnValue([
      { x: 20, y: 30 },
      { x: 0, y: 54 },
      { x: 40, y: 54 },
      { x: 20, y: 30 },
    ]);
    mockCreateConnectionRenderGeometry.mockReturnValue({
      kind: 'polyline',
      points: [
        { x: 20, y: 30 },
        { x: 0, y: 54 },
        { x: 40, y: 54 },
        { x: 20, y: 30 },
      ],
    });

    await renderExportCanvas({
      ...createBaseInput(),
      doc,
    });

    expect(context.fillText).toHaveBeenCalledWith('down', 0, 0);
    expect(
      context.translate.mock.calls.some(([x, y]) => x === 20 && typeof y === 'number' && y > 54),
    ).toBe(true);
  });

  it('renders free-text annotations rotated to follow the connection in exported PNGs', async () => {
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
            annotation: { kind: 'text', text: 'stairs' },
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
      { x: 140, y: 200 },
      { x: 140, y: 36 },
    ]);
    mockCreateConnectionRenderGeometry.mockReturnValue({
      kind: 'polyline',
      points: [
        { x: 140, y: 200 },
        { x: 140, y: 36 },
      ],
    });

    await renderExportCanvas(input);

    expect(context.translate).toHaveBeenCalledWith(160, 118);
    expect(context.rotate).toHaveBeenCalledWith(Math.PI / 2);
    expect(context.fillText).toHaveBeenCalledWith('stairs', 0, 0);
  });

  it('renders tiny split gaps and endpoint dots for room crossings in exported PNGs', async () => {
    const context = createFakeContext();
    const canvas = { getContext: jest.fn().mockReturnValue(context) } as unknown as HTMLCanvasElement;
    mockCreateSizedCanvas.mockReturnValue(canvas);

    const source = { ...createRoom('Below'), id: 'room-below', position: { x: 120, y: 220 } };
    const blocker = { ...createRoom('Kitchen'), id: 'room-blocker', position: { x: 80, y: 120 } };
    const target = { ...createRoom('Above'), id: 'room-above', position: { x: 120, y: 20 } };
    let doc = createEmptyMap('Export Gap');
    doc = addRoom(doc, source);
    doc = addRoom(doc, blocker);
    doc = addRoom(doc, target);
    const connection = { ...createConnection(source.id, target.id, false), id: 'connection-gap' };
    doc = addConnection(doc, connection, 'north');

    mockComputeConnectionPath.mockReturnValue([
      { x: 120, y: 220 },
      { x: 120, y: 20 },
    ]);
    mockCreateConnectionRenderGeometry.mockReturnValue({
      kind: 'polyline',
      points: [
        { x: 120, y: 220 },
        { x: 120, y: 20 },
      ],
    });

    await renderExportCanvas({
      ...createBaseInput(),
      doc: {
        ...doc,
        view: {
          ...doc.view,
          visualStyle: 'default',
        },
      },
      selectedRoomIds: [source.id, blocker.id, target.id],
      selectedConnectionIds: [connection.id],
      selectedStickyNoteIds: [],
      selectedStickyNoteLinkIds: [],
      settings: {
        ...createBaseInput().settings,
        scope: 'selection',
      },
    });

    expect(context.moveTo).toHaveBeenCalledWith(120, 220);
    expect(context.lineTo).toHaveBeenCalledWith(120, 159);
    expect(context.moveTo).toHaveBeenCalledWith(120, 117);
    expect(context.lineTo).toHaveBeenCalledWith(120, 20);
    expect(context.fill).toHaveBeenCalled();
  });

  it('renders tiny split bezier gaps and endpoint dots for room crossings in exported PNGs', async () => {
    const context = createFakeContext();
    const canvas = { getContext: jest.fn().mockReturnValue(context) } as unknown as HTMLCanvasElement;
    mockCreateSizedCanvas.mockReturnValue(canvas);

    const source = { ...createRoom('Left'), id: 'room-left', position: { x: 80, y: 220 } };
    const blocker = { ...createRoom('Kitchen'), id: 'room-blocker', position: { x: 80, y: 120 } };
    const target = { ...createRoom('Top'), id: 'room-top', position: { x: 120, y: 20 } };
    let doc = createEmptyMap('Export Bezier Gap');
    doc = addRoom(doc, source);
    doc = addRoom(doc, blocker);
    doc = addRoom(doc, target);
    doc = {
      ...doc,
      view: {
        ...doc.view,
        useBezierConnections: true,
      },
    };
    const connection = { ...createConnection(source.id, target.id, true), id: 'connection-bezier-gap' };
    doc = addConnection(doc, connection, 'north', 'south');

    mockComputeConnectionPath.mockReturnValue([
      { x: 80, y: 220 },
      { x: 80, y: 200 },
      { x: 120, y: 40 },
      { x: 120, y: 20 },
    ]);
    mockCreateConnectionRenderGeometry.mockReturnValue({
      kind: 'cubic',
      start: { x: 80, y: 220 },
      control1: { x: 80, y: 200 },
      control2: { x: 120, y: 40 },
      end: { x: 120, y: 20 },
    });
    mockFlattenConnectionGeometry.mockReturnValue([
      { x: 80, y: 220 },
      { x: 120, y: 162 },
      { x: 120, y: 114 },
      { x: 120, y: 20 },
    ]);

    await renderExportCanvas({
      ...createBaseInput(),
      doc: {
        ...doc,
        view: {
          ...doc.view,
          visualStyle: 'default',
        },
      },
      selectedRoomIds: [source.id, blocker.id, target.id],
      selectedConnectionIds: [connection.id],
      selectedStickyNoteIds: [],
      selectedStickyNoteLinkIds: [],
      settings: {
        ...createBaseInput().settings,
        scope: 'selection',
      },
    });

    expect(context.moveTo.mock.calls.some(([x, y]) => x === 80 && y === 220)).toBe(true);
    expect(context.lineTo.mock.calls.some(([x, y]) => x === 120 && y === 159)).toBe(true);
    expect(context.moveTo.mock.calls.some(([x, y]) => x === 120 && y === 117)).toBe(true);
    expect(context.fill).toHaveBeenCalled();
  });
});
