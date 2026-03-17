import { useEffect, useRef } from 'react';
import type { MapDocument, Position } from '../domain/map-types';
import { clampMapViewportZoom } from './use-map-viewport';

interface UseMapCanvasViewportPersistenceParams {
  readonly doc: MapDocument | null;
  readonly panOffset: Position;
  readonly persistedPanOffset: Position;
  readonly setMapPanOffset: (position: Position) => void;
  readonly zoom: number;
  readonly persistedZoom: number;
  readonly setMapZoom: (zoom: number) => void;
}

export function useMapCanvasViewportPersistence({
  doc,
  panOffset,
  persistedPanOffset,
  setMapPanOffset,
  zoom,
  persistedZoom,
  setMapZoom,
}: UseMapCanvasViewportPersistenceParams): void {
  const persistPanTimeoutRef = useRef<number | null>(null);
  const persistZoomTimeoutRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (persistPanTimeoutRef.current !== null) {
      window.clearTimeout(persistPanTimeoutRef.current);
    }
    if (persistZoomTimeoutRef.current !== null) {
      window.clearTimeout(persistZoomTimeoutRef.current);
    }
  }, []);

  useEffect(() => {
    if (!doc) {
      return;
    }

    if (
      persistedPanOffset.x === panOffset.x
      && persistedPanOffset.y === panOffset.y
    ) {
      return;
    }

    if (persistPanTimeoutRef.current !== null) {
      window.clearTimeout(persistPanTimeoutRef.current);
    }

    persistPanTimeoutRef.current = window.setTimeout(() => {
      setMapPanOffset(panOffset);
      persistPanTimeoutRef.current = null;
    }, 150);

    return () => {
      if (persistPanTimeoutRef.current !== null) {
        window.clearTimeout(persistPanTimeoutRef.current);
        persistPanTimeoutRef.current = null;
      }
    };
  }, [doc, panOffset, persistedPanOffset.x, persistedPanOffset.y, setMapPanOffset]);

  useEffect(() => {
    if (!doc) {
      return;
    }

    const safePersistedZoom = clampMapViewportZoom(persistedZoom);
    if (safePersistedZoom === zoom) {
      return;
    }

    if (persistZoomTimeoutRef.current !== null) {
      window.clearTimeout(persistZoomTimeoutRef.current);
    }

    persistZoomTimeoutRef.current = window.setTimeout(() => {
      setMapZoom(zoom);
      persistZoomTimeoutRef.current = null;
    }, 150);

    return () => {
      if (persistZoomTimeoutRef.current !== null) {
        window.clearTimeout(persistZoomTimeoutRef.current);
        persistZoomTimeoutRef.current = null;
      }
    };
  }, [doc, persistedZoom, setMapZoom, zoom]);
}
