import { useCallback, useEffect, useRef, useState } from 'react';

export interface PanOffset {
  readonly x: number;
  readonly y: number;
}

export interface MapPoint {
  readonly x: number;
  readonly y: number;
}

export interface MapViewportApi {
  readonly canvasRef: React.RefObject<HTMLDivElement | null>;
  readonly canvasRect: DOMRect | null;
  readonly effectiveCanvasRect: DOMRect | null;
  readonly panOffset: PanOffset;
  readonly panOffsetRef: React.RefObject<PanOffset>;
  readonly zoom: number;
  readonly zoomRef: React.RefObject<number>;
  readonly setPanOffset: React.Dispatch<React.SetStateAction<PanOffset>>;
  readonly setZoom: React.Dispatch<React.SetStateAction<number>>;
  readonly panBy: (delta: PanOffset) => void;
  readonly centerOnMapPoint: (point: MapPoint) => void;
  readonly toMapPoint: (clientX: number, clientY: number) => MapPoint;
  readonly zoomAtClientPoint: (clientX: number, clientY: number, scaleFactor: number) => void;
}

export interface UseMapViewportOptions {
  readonly initialPanOffset?: PanOffset;
  readonly initialZoom?: number;
}

export const MIN_MAP_VIEWPORT_ZOOM = 0.5;
export const MAX_MAP_VIEWPORT_ZOOM = 3;

function clampZoom(zoom: number): number {
  return Math.min(Math.max(zoom, MIN_MAP_VIEWPORT_ZOOM), MAX_MAP_VIEWPORT_ZOOM);
}

export function useMapViewport(options: UseMapViewportOptions = {}): MapViewportApi {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
  const initialPanOffset = options.initialPanOffset ?? { x: 0, y: 0 };
  const initialZoom = clampZoom(options.initialZoom ?? 1);
  const [panOffset, setPanOffset] = useState<PanOffset>(initialPanOffset);
  const panOffsetRef = useRef<PanOffset>(initialPanOffset);
  const [zoom, setZoom] = useState<number>(initialZoom);
  const zoomRef = useRef<number>(initialZoom);

  useEffect(() => {
    panOffsetRef.current = panOffset;
  }, [panOffset]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    setPanOffset(initialPanOffset);
  }, [initialPanOffset.x, initialPanOffset.y]);

  useEffect(() => {
    setZoom(initialZoom);
  }, [initialZoom]);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const updateCanvasRect = () => {
      if (canvasRef.current) {
        setCanvasRect(canvasRef.current.getBoundingClientRect());
      }
    };

    updateCanvasRect();
    window.addEventListener('resize', updateCanvasRect);

    return () => {
      window.removeEventListener('resize', updateCanvasRect);
    };
  }, []);

  const panBy = useCallback((delta: PanOffset) => {
    setPanOffset((prev) => ({
      x: prev.x + delta.x,
      y: prev.y + delta.y,
    }));
  }, []);

  const centerOnMapPoint = useCallback((point: MapPoint) => {
    const rect = canvasRef.current?.getBoundingClientRect() ?? canvasRect;
    const width = rect?.width ?? 0;
    const height = rect?.height ?? 0;
    const currentZoom = zoomRef.current;

    setPanOffset({
      x: (width / 2) - (point.x * currentZoom),
      y: (height / 2) - (point.y * currentZoom),
    });
  }, [canvasRect]);

  const toMapPoint = useCallback((clientX: number, clientY: number): MapPoint => {
    const rect = canvasRef.current?.getBoundingClientRect() ?? canvasRect;
    const left = rect?.left ?? 0;
    const top = rect?.top ?? 0;
    const currentPan = panOffsetRef.current;

    return {
      x: (clientX - left - currentPan.x) / zoomRef.current,
      y: (clientY - top - currentPan.y) / zoomRef.current,
    };
  }, [canvasRect]);

  const zoomAtClientPoint = useCallback((clientX: number, clientY: number, scaleFactor: number) => {
    const rect = canvasRef.current?.getBoundingClientRect() ?? canvasRect;
    if (!rect) {
      return;
    }

    const currentZoom = zoomRef.current;
    const nextZoom = clampZoom(currentZoom * scaleFactor);
    if (nextZoom === currentZoom) {
      return;
    }

    const currentPan = panOffsetRef.current;
    const mapPoint = {
      x: (clientX - rect.left - currentPan.x) / currentZoom,
      y: (clientY - rect.top - currentPan.y) / currentZoom,
    };

    setZoom(nextZoom);
    setPanOffset({
      x: (clientX - rect.left) - (mapPoint.x * nextZoom),
      y: (clientY - rect.top) - (mapPoint.y * nextZoom),
    });
  }, [canvasRect]);

  return {
    canvasRef,
    canvasRect,
    effectiveCanvasRect: canvasRect ?? canvasRef.current?.getBoundingClientRect() ?? null,
    panOffset,
    panOffsetRef,
    zoom,
    zoomRef,
    setPanOffset,
    setZoom,
    panBy,
    centerOnMapPoint,
    toMapPoint,
    zoomAtClientPoint,
  };
}

export function clampMapViewportZoom(zoom: number): number {
  return clampZoom(zoom);
}
