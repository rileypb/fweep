import { act, renderHook } from '@testing-library/react';
import { useMapCanvasViewportPersistence } from '../../src/components/use-map-canvas-viewport-persistence';
import { jest } from '@jest/globals';

describe('useMapCanvasViewportPersistence', () => {
  it('flushes a pending pan persistence update when the hook unmounts', () => {
    jest.useFakeTimers();
    const setMapPanOffset = jest.fn<(position: { x: number; y: number }) => void>();
    const setMapZoom = jest.fn<(zoom: number) => void>();
    const doc = {
      metadata: { id: 'map-1', name: 'Test', createdAt: '', updatedAt: '' },
      rooms: {},
      pseudoRooms: {},
      connections: {},
      items: {},
      stickyNotes: {},
      stickyNoteLinks: {},
      background: { layers: {}, activeLayerId: null, referenceImage: null },
      cliOutputLines: [],
      view: {
        pan: { x: 0, y: 0 },
        zoom: 1,
        visualStyle: 'default',
        canvasTheme: 'default',
        textureSeed: 1,
        showGrid: true,
        snapToGrid: true,
        useBezierConnections: false,
        cliOutputCollapsed: false,
      },
    };

    const { unmount } = renderHook(() => useMapCanvasViewportPersistence({
      doc,
      panOffset: { x: 80, y: -40 },
      persistedPanOffset: { x: 0, y: 0 },
      setMapPanOffset,
      zoom: 1,
      persistedZoom: 1,
      setMapZoom,
    }));

    unmount();

    expect(setMapPanOffset).toHaveBeenCalledWith({ x: 80, y: -40 });
    expect(setMapZoom).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('flushes a pending pan persistence update on pagehide', () => {
    jest.useFakeTimers();
    const setMapPanOffset = jest.fn<(position: { x: number; y: number }) => void>();
    const setMapZoom = jest.fn<(zoom: number) => void>();
    const doc = {
      metadata: { id: 'map-1', name: 'Test', createdAt: '', updatedAt: '' },
      rooms: {},
      pseudoRooms: {},
      connections: {},
      items: {},
      stickyNotes: {},
      stickyNoteLinks: {},
      background: { layers: {}, activeLayerId: null, referenceImage: null },
      cliOutputLines: [],
      view: {
        pan: { x: 0, y: 0 },
        zoom: 1,
        visualStyle: 'default',
        canvasTheme: 'default',
        textureSeed: 1,
        showGrid: true,
        snapToGrid: true,
        useBezierConnections: false,
        cliOutputCollapsed: false,
      },
    };

    renderHook(() => useMapCanvasViewportPersistence({
      doc,
      panOffset: { x: 24, y: 36 },
      persistedPanOffset: { x: 0, y: 0 },
      setMapPanOffset,
      zoom: 1,
      persistedZoom: 1,
      setMapZoom,
    }));

    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pagehide'));
    });

    expect(setMapPanOffset).toHaveBeenCalledWith({ x: 24, y: 36 });
    expect(setMapZoom).not.toHaveBeenCalled();
    jest.useRealTimers();
  });
});
