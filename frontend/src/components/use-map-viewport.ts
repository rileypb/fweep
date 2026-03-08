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
  readonly setPanOffset: React.Dispatch<React.SetStateAction<PanOffset>>;
  readonly panBy: (delta: PanOffset) => void;
  readonly centerOnMapPoint: (point: MapPoint) => void;
  readonly toMapPoint: (clientX: number, clientY: number) => MapPoint;
}

export interface UseMapViewportOptions {
  readonly initialPanOffset?: PanOffset;
}

export function useMapViewport(options: UseMapViewportOptions = {}): MapViewportApi {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
  const initialPanOffset = options.initialPanOffset ?? { x: 0, y: 0 };
  const [panOffset, setPanOffset] = useState<PanOffset>(initialPanOffset);
  const panOffsetRef = useRef<PanOffset>(initialPanOffset);

  useEffect(() => {
    panOffsetRef.current = panOffset;
  }, [panOffset]);

  useEffect(() => {
    setPanOffset(initialPanOffset);
  }, [initialPanOffset.x, initialPanOffset.y]);

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

    setPanOffset({
      x: (width / 2) - point.x,
      y: (height / 2) - point.y,
    });
  }, [canvasRect]);

  const toMapPoint = useCallback((clientX: number, clientY: number): MapPoint => {
    const rect = canvasRef.current?.getBoundingClientRect() ?? canvasRect;
    const left = rect?.left ?? 0;
    const top = rect?.top ?? 0;
    const currentPan = panOffsetRef.current;

    return {
      x: clientX - left - currentPan.x,
      y: clientY - top - currentPan.y,
    };
  }, [canvasRect]);

  return {
    canvasRef,
    canvasRect,
    effectiveCanvasRect: canvasRect ?? canvasRef.current?.getBoundingClientRect() ?? null,
    panOffset,
    panOffsetRef,
    setPanOffset,
    panBy,
    centerOnMapPoint,
    toMapPoint,
  };
}
