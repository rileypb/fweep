import { describe, expect, it } from '@jest/globals';
import { act, render, renderHook, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import { useMapViewport, clampMapViewportZoom, type MapViewportApi, type UseMapViewportOptions } from '../../src/components/use-map-viewport';

function createRect(left: number, top: number, width: number, height: number): DOMRect {
  return new DOMRect(left, top, width, height);
}

function mockElementRect(element: HTMLDivElement, rect: DOMRect): void {
  element.getBoundingClientRect = () => rect;
}

function createViewportHarness() {
  let latestApi: MapViewportApi | null = null;

  function Harness({ options = {} }: { options?: UseMapViewportOptions }): ReactElement {
    latestApi = useMapViewport(options);
    return <div ref={latestApi.canvasRef} data-testid="viewport-root" />;
  }

  return {
    Harness,
    getApi(): MapViewportApi {
      if (latestApi === null) {
        throw new Error('Viewport API is not ready.');
      }
      return latestApi;
    },
  };
}

describe('useMapViewport', () => {
  it('clamps zoom values to the supported viewport range', () => {
    expect(clampMapViewportZoom(0.1)).toBe(0.5);
    expect(clampMapViewportZoom(1.5)).toBe(1.5);
    expect(clampMapViewportZoom(10)).toBe(3);
  });

  it('keeps null canvas geometry and ignores zoom requests when no canvas ref is attached', () => {
    const { result } = renderHook(() => useMapViewport());

    expect(result.current.canvasRect).toBeNull();
    expect(result.current.effectiveCanvasRect).toBeNull();

    act(() => {
      result.current.zoomAtClientPoint(120, 80, 2);
    });

    expect(result.current.zoom).toBe(1);
    expect(result.current.panOffset).toEqual({ x: 0, y: 0 });
  });

  it('updates the cached canvas rect on resize and recenters map points using the canvas dimensions', () => {
    const { Harness, getApi } = createViewportHarness();
    render(<Harness options={{ initialZoom: 2 }} />);

    const canvas = screen.getByTestId('viewport-root') as HTMLDivElement;
    const rect = createRect(10, 20, 200, 100);
    mockElementRect(canvas, rect);

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    expect(getApi().canvasRect).toEqual(rect);
    expect(getApi().effectiveCanvasRect).toEqual(rect);

    act(() => {
      getApi().centerOnMapPoint({ x: 30, y: 10 });
    });

    expect(getApi().panOffset).toEqual({ x: 40, y: 30 });
    expect(getApi().panOffsetRef.current).toEqual({ x: 40, y: 30 });
  });

  it('converts client coordinates into map coordinates using the current pan, zoom, and canvas offset', () => {
    const { Harness, getApi } = createViewportHarness();
    render(<Harness options={{ initialPanOffset: { x: 20, y: 10 }, initialZoom: 2 }} />);

    const canvas = screen.getByTestId('viewport-root') as HTMLDivElement;
    const rect = createRect(100, 50, 300, 200);
    mockElementRect(canvas, rect);

    const point = getApi().toMapPoint(180, 110);

    expect(point).toEqual({ x: 30, y: 25 });
  });

  it('zooms around the client point, clamps to the max zoom, and becomes a no-op when already clamped', () => {
    const { Harness, getApi } = createViewportHarness();
    render(<Harness options={{ initialPanOffset: { x: 10, y: 20 }, initialZoom: 2 }} />);

    const canvas = screen.getByTestId('viewport-root') as HTMLDivElement;
    const rect = createRect(100, 50, 400, 300);
    mockElementRect(canvas, rect);

    const beforePoint = getApi().toMapPoint(160, 90);

    act(() => {
      getApi().zoomAtClientPoint(160, 90, 10);
    });

    expect(getApi().zoom).toBe(3);
    expect(getApi().zoomRef.current).toBe(3);
    expect(getApi().toMapPoint(160, 90)).toEqual(beforePoint);

    const panAfterClamp = getApi().panOffset;

    act(() => {
      getApi().zoomAtClientPoint(160, 90, 10);
    });

    expect(getApi().zoom).toBe(3);
    expect(getApi().panOffset).toEqual(panAfterClamp);
  });
});
