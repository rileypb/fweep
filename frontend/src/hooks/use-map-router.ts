import { useEffect, useState, useCallback } from 'react';
import type { MapDocument } from '../domain/map-types';
import { loadMap } from '../storage/map-store';

/** Extract a map ID from a `#/map/<id>` hash route, or return null. */
function mapIdFromHash(hash: string): string | null {
  const normalizedHash = hash.startsWith('#') ? hash.slice(1) : hash;
  const match = /^\/map\/([^/]+)$/.exec(normalizedHash);
  if (!match) {
    return null;
  }

  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function currentHashRoute(): string {
  return window.location.hash || '#/';
}

function replaceHashRoute(hashRoute: string): void {
  window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}${hashRoute}`);
}

function pushHashRoute(hashRoute: string): void {
  window.history.pushState({}, '', `${window.location.pathname}${window.location.search}${hashRoute}`);
}

export interface UseMapRouterResult {
  /** The currently open map, or null if at the selection screen. */
  activeMap: MapDocument | null;
  /** True while the initial URL-based map load is in progress. */
  loading: boolean;
  /** Error to show after route-based map loading fails. */
  routeError: string | null;
  /** Open a map and push the URL. */
  openMap: (doc: MapDocument) => void;
  /** Return to the selection screen and reset the URL. */
  closeMap: () => void;
}

export interface UseMapRouterOptions {
  loadMap?: typeof loadMap;
}

/**
 * Lightweight hook that syncs the active map with the browser URL.
 *
 * - `#/`           → selection dialog
 * - `#/map/<id>`   → load that map from storage
 *
 * Uses the History API directly (no router library needed).
 */
export function useMapRouter(options: UseMapRouterOptions = {}): UseMapRouterResult {
  const loadMapImpl = options.loadMap ?? loadMap;
  const [activeMap, setActiveMap] = useState<MapDocument | null>(null);
  const [loading, setLoading] = useState(() => mapIdFromHash(currentHashRoute()) !== null);
  const [routeError, setRouteError] = useState<string | null>(null);

  // On mount: if URL already contains a map ID, try to load it.
  useEffect(() => {
    const id = mapIdFromHash(currentHashRoute());
    if (!id) {
      setLoading(false);
      setRouteError(null);
      return;
    }

    let cancelled = false;
    loadMapImpl(id)
      .then((doc) => {
        if (cancelled) return;
        if (doc) {
          setRouteError(null);
          setActiveMap(doc);
        } else {
          // Invalid ID — reset to selection screen.
          setRouteError(null);
          replaceHashRoute('#/');
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setActiveMap(null);
          setRouteError(err instanceof Error ? err.message : 'This map could not be opened.');
          replaceHashRoute('#/');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadMapImpl]);

  // Listen for browser back/forward navigation.
  useEffect(() => {
    const syncFromLocation = () => {
      const id = mapIdFromHash(currentHashRoute());
      if (!id) {
        setActiveMap(null);
        setLoading(false);
        setRouteError(null);
        return;
      }

      setLoading(true);
      void loadMapImpl(id).then((doc) => {
        setActiveMap(doc ?? null);
        setLoading(false);
        setRouteError(null);
        if (!doc) {
          replaceHashRoute('#/');
        }
      }).catch((err: unknown) => {
        setActiveMap(null);
        setLoading(false);
        setRouteError(err instanceof Error ? err.message : 'This map could not be opened.');
        replaceHashRoute('#/');
      });
    };

    window.addEventListener('popstate', syncFromLocation);
    window.addEventListener('hashchange', syncFromLocation);
    return () => {
      window.removeEventListener('popstate', syncFromLocation);
      window.removeEventListener('hashchange', syncFromLocation);
    };
  }, [loadMapImpl]);

  const openMap = useCallback((doc: MapDocument) => {
    setActiveMap(doc);
    setRouteError(null);
    pushHashRoute(`#/map/${encodeURIComponent(doc.metadata.id)}`);
  }, []);

  const closeMap = useCallback(() => {
    setActiveMap(null);
    setRouteError(null);
    pushHashRoute('#/');
  }, []);

  return { activeMap, loading, routeError, openMap, closeMap };
}
