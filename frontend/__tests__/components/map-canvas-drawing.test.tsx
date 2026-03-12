import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { createEmptyMap } from '../../src/domain/map-types';
import { useEditorStore } from '../../src/state/editor-store';

type AsyncVoid = () => Promise<void>;
type BlobToCanvasFn = (blob: Blob) => Promise<HTMLCanvasElement>;
type CanvasToBlobFn = (canvas: HTMLCanvasElement) => Promise<Blob>;
type LoadBackgroundChunkFn = (key: string) => Promise<Blob | null>;
type SaveBackgroundChunksFn = (inputs: readonly unknown[]) => Promise<void>;
type DeleteBackgroundChunksFn = (keys: readonly string[]) => Promise<void>;

const mockRedrawChunk = jest.fn();
const mockClearLivePreviewChunks = jest.fn();
const mockReloadVisibleChunks = jest.fn<AsyncVoid>().mockResolvedValue(undefined);
const mockBlobToCanvas = jest.fn<BlobToCanvasFn>();
const mockCanvasToBlob = jest.fn<CanvasToBlobFn>();
const mockCompositeStrokePreview = jest.fn();
const mockDrawStrokeSegment = jest.fn();
const mockDrawRectangleStroke = jest.fn();
const mockDrawEllipseStroke = jest.fn();
const mockDrawBucketFill = jest.fn();
const mockDrawMapObstacleMask = jest.fn();
const mockLoadBackgroundChunk = jest.fn<LoadBackgroundChunkFn>();
const mockSaveBackgroundChunks = jest.fn<SaveBackgroundChunksFn>();
const mockDeleteBackgroundChunks = jest.fn<DeleteBackgroundChunksFn>();

function createCanvasContext() {
  return {
    clearRect: jest.fn(),
    drawImage: jest.fn(),
    getImageData: jest.fn(() => ({ data: new Uint8ClampedArray(4) })),
    createImageData: jest.fn(() => ({ data: new Uint8ClampedArray(4) })),
    putImageData: jest.fn(),
  };
}

function createCanvas(width = 256, height = 256): HTMLCanvasElement {
  const context = createCanvasContext();
  return {
    width,
    height,
    getContext: jest.fn(() => context),
    toBlob: jest.fn(),
  } as unknown as HTMLCanvasElement;
}

await jest.unstable_mockModule('../../src/components/map-canvas-background', async () => {
  const React = await import('react');
  return {
    MapCanvasBackground: React.forwardRef((_props: object, ref) => {
      React.useImperativeHandle(ref, () => ({
        redrawChunk: mockRedrawChunk,
        clearLivePreviewChunks: mockClearLivePreviewChunks,
        reloadVisibleChunks: mockReloadVisibleChunks,
      }));
      return null;
    }),
  };
});

await jest.unstable_mockModule('../../src/components/map-canvas-connections', () => ({
  MapCanvasConnections: () => null,
}));

await jest.unstable_mockModule('../../src/components/map-canvas-room-node', () => ({
  MapCanvasRoomNode: (_props: { room: { name: string } }) => null,
}));

await jest.unstable_mockModule('../../src/components/map-minimap', () => ({
  MapMinimap: () => null,
}));

await jest.unstable_mockModule('../../src/components/map-canvas-overlays', () => ({
  RoomEditorOverlay: (_props: { children?: ReactNode }) => null,
  ConnectionEditorOverlay: (_props: { children?: ReactNode }) => null,
}));

await jest.unstable_mockModule('../../src/components/map-background-raster', () => ({
  BUCKET_FILL_MAX_RADIUS: 512,
  blobToCanvas: mockBlobToCanvas,
  canvasToBlob: mockCanvasToBlob,
  compositeStrokePreview: mockCompositeStrokePreview,
  constrainLineToCompassDirection: (start: { x: number; y: number }, end: { x: number; y: number }) => end,
  constrainEllipseToCircle: (start: { x: number; y: number }, end: { x: number; y: number }) => end,
  constrainRectangleToSquare: (start: { x: number; y: number }, end: { x: number; y: number }) => end,
  createRasterCanvas: () => createCanvas(),
  createSizedCanvas: (width: number, height: number) => createCanvas(width, height),
  drawBucketFill: mockDrawBucketFill,
  drawEllipseStroke: mockDrawEllipseStroke,
  drawMapObstacleMask: mockDrawMapObstacleMask,
  drawRectangleStroke: mockDrawRectangleStroke,
  drawStrokeSegment: mockDrawStrokeSegment,
  getBoundsFromPoints: (start: { x: number; y: number }, end: { x: number; y: number }) => ({
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x),
    bottom: Math.max(start.y, end.y),
  }),
  getChunkCoordinatesForPoint: () => ({ chunkX: 0, chunkY: 0 }),
  getChunkCoverageForPoint: () => [{ chunkX: 0, chunkY: 0 }],
  getChunkCoverageForRect: () => [{ chunkX: 0, chunkY: 0 }],
  getInterpolatedLinePoints: (start: { x: number; y: number }, end: { x: number; y: number }) => [start, end],
  getLocalChunkPoint: (point: { x: number; y: number }) => point,
  getToolStampRadius: () => 1,
  isCanvasEmpty: () => false,
  normalizeHexColor: (value: string) => value.toLowerCase(),
  supportsRasterCanvas: () => true,
}));

await jest.unstable_mockModule('../../src/storage/map-store', async () => {
  return {
    deleteBackgroundChunks: mockDeleteBackgroundChunks,
    getBackgroundChunkKey: ({ mapId, layerId, chunkX, chunkY }: { mapId: string; layerId: string; chunkX: number; chunkY: number }) =>
      `${mapId}:${layerId}:${chunkX}:${chunkY}`,
    listBackgroundChunksInBounds: jest.fn(async () => []),
    loadBackgroundChunk: mockLoadBackgroundChunk,
    restoreBackgroundChunks: jest.fn(async () => undefined),
    saveBackgroundChunks: mockSaveBackgroundChunks,
  };
});

const { MapCanvas } = await import('../../src/components/map-canvas');

function resetStore(): void {
  useEditorStore.setState(useEditorStore.getInitialState());
}

describe('MapCanvas drawing mode', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetStore();
    useEditorStore.getState().loadDocument(createEmptyMap('Drawing Test'));
    mockBlobToCanvas.mockResolvedValue(createCanvas());
    mockCanvasToBlob.mockResolvedValue(new Blob(['png']));
    mockLoadBackgroundChunk.mockResolvedValue(null);
    mockSaveBackgroundChunks.mockResolvedValue(undefined);
    mockDeleteBackgroundChunks.mockResolvedValue(undefined);
    mockDrawBucketFill.mockReturnValue(false);
  });

  it('ignores freehand drawing gestures when drawing is disabled', async () => {
    useEditorStore.getState().setCanvasInteractionMode('draw');

    render(<MapCanvas mapName="Drawing Test" />);

    const canvas = screen.getByTestId('map-canvas');
    fireEvent.mouseDown(canvas, { clientX: 20, clientY: 30, button: 0 });
    fireEvent.mouseMove(document, { clientX: 28, clientY: 36 });
    fireEvent.mouseUp(document, { clientX: 28, clientY: 36 });

    await waitFor(() => {
      expect(useEditorStore.getState().canvasInteractionMode).toBe('map');
    });

    expect(mockDrawStrokeSegment).not.toHaveBeenCalled();
    expect(mockSaveBackgroundChunks).not.toHaveBeenCalled();
    expect(mockCompositeStrokePreview).not.toHaveBeenCalled();
    expect(mockRedrawChunk).not.toHaveBeenCalled();
    expect(mockReloadVisibleChunks).not.toHaveBeenCalled();
    expect(useEditorStore.getState().activeStroke).toBeNull();
    expect(useEditorStore.getState().doc?.background.activeLayerId).toBeNull();
  });

  it('ignores bucket-fill gestures when drawing is disabled', async () => {
    useEditorStore.getState().setCanvasInteractionMode('draw');
    useEditorStore.getState().setDrawingTool('bucket');
    mockDrawBucketFill.mockReturnValue(false);

    render(<MapCanvas mapName="Drawing Test" />);

    fireEvent.mouseDown(screen.getByTestId('map-canvas'), { clientX: 40, clientY: 50, button: 0 });

    await waitFor(() => {
      expect(useEditorStore.getState().canvasInteractionMode).toBe('map');
    });

    expect(mockDrawBucketFill).not.toHaveBeenCalled();
    expect(mockSaveBackgroundChunks).not.toHaveBeenCalled();
    expect(mockDeleteBackgroundChunks).not.toHaveBeenCalled();
  });

  it('does not start drawing even when bucket fill obey-map is enabled', async () => {
    useEditorStore.getState().setCanvasInteractionMode('draw');
    useEditorStore.getState().setDrawingTool('bucket');
    useEditorStore.getState().setBucketObeyMap(true);
    mockDrawBucketFill.mockReturnValue(true);

    render(<MapCanvas mapName="Drawing Test" />);

    fireEvent.mouseDown(screen.getByTestId('map-canvas'), { clientX: 60, clientY: 70, button: 0 });

    await waitFor(() => {
      expect(useEditorStore.getState().canvasInteractionMode).toBe('map');
    });

    expect(mockDrawMapObstacleMask).not.toHaveBeenCalled();
    expect(mockDrawBucketFill).not.toHaveBeenCalled();
    expect(mockRedrawChunk).not.toHaveBeenCalled();
    expect(mockReloadVisibleChunks).not.toHaveBeenCalled();
  });
});
