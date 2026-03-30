import type { MapDocument, Position } from '../domain/map-types';
import { clampMapViewportZoom } from '../components/use-map-viewport';

const MAP_VIEW_SESSION_PREFIX = 'fweep-map-view:';

interface CachedMapView {
  readonly pan: Position;
  readonly zoom: number;
}

function getMapViewSessionKey(mapId: string): string {
  return `${MAP_VIEW_SESSION_PREFIX}${mapId}`;
}

function getSessionStorage(): Storage | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function cacheMapViewSession(mapId: string, pan: Position, zoom: number): void {
  const storage = getSessionStorage();
  if (storage === null) {
    return;
  }

  try {
    storage.setItem(getMapViewSessionKey(mapId), JSON.stringify({
      pan,
      zoom: clampMapViewportZoom(zoom),
    } satisfies CachedMapView));
  } catch {
    // Ignore storage failures so viewport interaction stays responsive.
  }
}

export function loadCachedMapViewSession(mapId: string): CachedMapView | null {
  const storage = getSessionStorage();
  if (storage === null) {
    return null;
  }

  try {
    const rawValue = storage.getItem(getMapViewSessionKey(mapId));
    if (rawValue === null) {
      return null;
    }

    const parsed = JSON.parse(rawValue) as {
      pan?: { x?: unknown; y?: unknown };
      zoom?: unknown;
    };
    if (
      typeof parsed.pan?.x !== 'number'
      || typeof parsed.pan?.y !== 'number'
      || typeof parsed.zoom !== 'number'
    ) {
      return null;
    }

    return {
      pan: {
        x: parsed.pan.x,
        y: parsed.pan.y,
      },
      zoom: clampMapViewportZoom(parsed.zoom),
    };
  } catch {
    return null;
  }
}

export function applyCachedMapViewSession(doc: MapDocument): MapDocument {
  const cachedView = loadCachedMapViewSession(doc.metadata.id);
  if (cachedView === null) {
    return doc;
  }

  if (
    cachedView.pan.x === doc.view.pan.x
    && cachedView.pan.y === doc.view.pan.y
    && cachedView.zoom === doc.view.zoom
  ) {
    return doc;
  }

  return {
    ...doc,
    view: {
      ...doc.view,
      pan: cachedView.pan,
      zoom: cachedView.zoom,
    },
  };
}
