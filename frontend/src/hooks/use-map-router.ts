import { useEffect, useState, useCallback } from 'react';
import type { MapDocument } from '../domain/map-types';
import { loadMap } from '../storage/map-store';

/** Extract a map ID from a `#/map/<id>` hash route, or return null. */
function mapIdFromHash(hash: string): string | null {
  const normalizedHash = hash.startsWith('#') ? hash.slice(1) : hash;
  const match = /^\/map\/([^/]+)$/.exec(normalizedHash);
  return match ? match[1] : null;
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

  // On mount: if URL already contains a map ID, try to load it.
  useEffect(() => {
    const id = mapIdFromHash(currentHashRoute());
    if (!id) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    loadMapImpl(id)
      .then((doc) => {
        if (cancelled) return;
        if (doc) {
          setActiveMap(doc);
        } else {
          // Invalid ID — reset to selection screen.
          replaceHashRoute('#/');
        }
      })
      .catch(() => {
        if (!cancelled) {
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
        return;
      }

      setLoading(true);
      void loadMapImpl(id).then((doc) => {
        setActiveMap(doc ?? null);
        setLoading(false);
        if (!doc) {
          replaceHashRoute('#/');
        }
      }).catch(() => {
        setActiveMap(null);
        setLoading(false);
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
    pushHashRoute(`#/map/${doc.metadata.id}`);
  }, []);

  const closeMap = useCallback(() => {
    setActiveMap(null);
    pushHashRoute('#/');
  }, []);

  return { activeMap, loading, openMap, closeMap };
}
