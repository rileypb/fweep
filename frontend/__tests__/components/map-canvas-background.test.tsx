import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import { createRef } from 'react';
import { MapCanvasBackground, type MapCanvasBackgroundHandle } from '../../src/components/map-canvas-background';
import { createBackgroundLayer, createEmptyBackground } from '../../src/domain/map-types';
import { getBackgroundChunkKey, saveBackgroundChunks } from '../../src/storage/map-store';

interface MockCanvasContext {
  imageSmoothingEnabled: boolean;
  clearRect: jest.Mock<(x: number, y: number, width: number, height: number) => void>;
  drawImage: jest.Mock<(...args: unknown[]) => void>;
}

function makeRect(width: number, height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('MapCanvasBackground', () => {
  const contextByCanvas = new WeakMap<HTMLCanvasElement, MockCanvasContext>();
  const originalCreateImageBitmap = globalThis.createImageBitmap;
  const originalRequestAnimationFrame = globalThis.requestAnimationFrame;

  beforeEach(() => {
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(function getContext(this: HTMLCanvasElement) {
      let context = contextByCanvas.get(this);
      if (!context) {
        context = {
          imageSmoothingEnabled: true,
          clearRect: jest.fn<(x: number, y: number, width: number, height: number) => void>(),
          drawImage: jest.fn<(...args: unknown[]) => void>(),
        };
        contextByCanvas.set(this, context);
      }
      return context as unknown as CanvasRenderingContext2D;
    });
    globalThis.requestAnimationFrame = ((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    }) as typeof requestAnimationFrame;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    if (originalCreateImageBitmap === undefined) {
      Reflect.deleteProperty(globalThis, 'createImageBitmap');
    } else {
      globalThis.createImageBitmap = originalCreateImageBitmap;
    }
    globalThis.requestAnimationFrame = originalRequestAnimationFrame;
  });

  it('renders nothing when there is no active background layer', () => {
    const { container } = render(
      <MapCanvasBackground
        mapId="map-1"
        background={createEmptyBackground()}
        panOffset={{ x: 0, y: 0 }}
        canvasRect={makeRect(300, 200)}
        backgroundRevision={0}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the active background layer is hidden', () => {
    const layer = { ...createBackgroundLayer('Background'), visible: false };
    const { container } = render(
      <MapCanvasBackground
        mapId="map-1"
        background={{
          layers: { [layer.id]: layer },
          activeLayerId: layer.id,
        }}
        panOffset={{ x: 0, y: 0 }}
        canvasRect={makeRect(300, 200)}
        backgroundRevision={0}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('does not emit an act warning when an active layer has no stored chunks', async () => {
    const layer = { ...createBackgroundLayer('Background'), id: 'layer-empty' };
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(
      <MapCanvasBackground
        mapId="map-empty"
        background={{
          layers: { [layer.id]: layer },
          activeLayerId: layer.id,
        }}
        panOffset={{ x: 0, y: 0 }}
        canvasRect={makeRect(300, 200)}
        backgroundRevision={0}
      />,
    );

    await waitFor(() => {
      expect(screen.queryAllByTestId('map-canvas-background-chunk')).toHaveLength(0);
    });

    expect(
      consoleErrorSpy.mock.calls.some((call) => String(call[0]).includes('not wrapped in act')),
    ).toBe(false);
  });

  it('loads visible stored chunks and paints them into canvases', async () => {
    const layer = { ...createBackgroundLayer('Background'), id: 'layer-1' };
    const chunkBlob = new Blob(['chunk'], { type: 'image/png' });
    const bitmap = { close: jest.fn<() => void>() };
    globalThis.createImageBitmap = (jest.fn(async () => bitmap) as unknown) as typeof createImageBitmap;
    await saveBackgroundChunks([{
      mapId: 'map-1a',
      layerId: layer.id,
      chunkX: 0,
      chunkY: 0,
      blob: chunkBlob,
    }]);

    render(
      <MapCanvasBackground
        mapId="map-1a"
        background={{
          layers: { [layer.id]: layer },
          activeLayerId: layer.id,
        }}
        panOffset={{ x: 0, y: 0 }}
        canvasRect={makeRect(300, 200)}
        backgroundRevision={0}
      />,
    );

    const chunkCanvas = await screen.findByTestId('map-canvas-background-chunk');
    await waitFor(() => {
      expect(bitmap.close).toHaveBeenCalled();
    });
    const context = contextByCanvas.get(chunkCanvas as HTMLCanvasElement);
    expect(context).toBeDefined();
    expect(context?.clearRect).toHaveBeenCalledWith(0, 0, 256, 256);
    expect(context?.drawImage).toHaveBeenCalledWith(bitmap, 0, 0);
  });

  it('creates and redraws live preview chunks through the imperative handle', async () => {
    const layer = { ...createBackgroundLayer('Background'), id: 'layer-2' };
    const ref = createRef<MapCanvasBackgroundHandle>();
    const sourceCanvas = document.createElement('canvas');
    const chunkKey = getBackgroundChunkKey({ mapId: 'map-2', layerId: layer.id, chunkX: 1, chunkY: 2 });

    render(
      <MapCanvasBackground
        ref={ref}
        mapId="map-2"
        background={{
          layers: { [layer.id]: layer },
          activeLayerId: layer.id,
        }}
        panOffset={{ x: 0, y: 0 }}
        canvasRect={makeRect(300, 200)}
        backgroundRevision={0}
      />,
    );

    await act(async () => {
      await ref.current?.reloadVisibleChunks();
    });

    act(() => {
      ref.current?.redrawChunk(chunkKey, 1, 2, sourceCanvas);
    });

    const chunkCanvas = await screen.findByTestId('map-canvas-background-chunk');
    act(() => {
      ref.current?.redrawChunk(chunkKey, 1, 2, sourceCanvas);
    });
    expect(chunkCanvas).toHaveStyle({ left: '256px', top: '512px' });
    const context = contextByCanvas.get(chunkCanvas as HTMLCanvasElement);
    expect(context?.drawImage).toHaveBeenCalledWith(sourceCanvas, 0, 0);
  });

  it('preserves preview-only chunks across visible chunk reloads', async () => {
    const layer = { ...createBackgroundLayer('Background'), id: 'layer-3' };
    const ref = createRef<MapCanvasBackgroundHandle>();
    const chunkKey = getBackgroundChunkKey({ mapId: 'map-3', layerId: layer.id, chunkX: 1, chunkY: 2 });

    render(
      <MapCanvasBackground
        ref={ref}
        mapId="map-3"
        background={{
          layers: { [layer.id]: layer },
          activeLayerId: layer.id,
        }}
        panOffset={{ x: 0, y: 0 }}
        canvasRect={makeRect(300, 200)}
        backgroundRevision={0}
      />,
    );

    await act(async () => {
      await ref.current?.reloadVisibleChunks();
    });

    act(() => {
      ref.current?.redrawChunk(chunkKey, 1, 2, document.createElement('canvas'));
    });
    await screen.findByTestId('map-canvas-background-chunk');

    await act(async () => {
      await ref.current?.reloadVisibleChunks();
    });

    expect(screen.getAllByTestId('map-canvas-background-chunk')).toHaveLength(1);
  });

  it('keeps a chunk mounted after clearing the live preview chunk set and reloading', async () => {
    const layer = { ...createBackgroundLayer('Background'), id: 'layer-4' };
    const chunkBlob = new Blob(['chunk'], { type: 'image/png' });
    const ref = createRef<MapCanvasBackgroundHandle>();
    const chunkKey = getBackgroundChunkKey({ mapId: 'map-4', layerId: layer.id, chunkX: 1, chunkY: 2 });

    render(
      <MapCanvasBackground
        ref={ref}
        mapId="map-4"
        background={{
          layers: { [layer.id]: layer },
          activeLayerId: layer.id,
        }}
        panOffset={{ x: 0, y: 0 }}
        canvasRect={makeRect(300, 200)}
        backgroundRevision={0}
      />,
    );

    await act(async () => {
      await ref.current?.reloadVisibleChunks();
    });

    act(() => {
      ref.current?.redrawChunk(chunkKey, 1, 2, document.createElement('canvas'));
    });

    await screen.findByTestId('map-canvas-background-chunk');
    await saveBackgroundChunks([{
      mapId: 'map-4',
      layerId: layer.id,
      chunkX: 1,
      chunkY: 2,
      blob: chunkBlob,
    }]);

    act(() => {
      ref.current?.clearLivePreviewChunks();
    });

    await act(async () => {
      await ref.current?.reloadVisibleChunks();
    });

    expect(screen.getAllByTestId('map-canvas-background-chunk')).toHaveLength(1);
    expect(screen.getByTestId('map-canvas-background-chunk')).toHaveAttribute('data-chunk-key', chunkKey);
  });
});
