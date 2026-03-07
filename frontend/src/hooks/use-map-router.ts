import { useEffect, useState, useCallback } from 'react';
import type { MapDocument } from '../domain/map-types';
import { loadMap } from '../storage/map-store';

/** Extract a map ID from a `/map/<id>` pathname, or return null. */
function mapIdFromPath(pathname: string): string | null {
  const match = /^\/map\/([^/]+)$/.exec(pathname);
  return match ? match[1] : null;
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
 * - `/`            → selection dialog
 * - `/map/<id>`    → load that map from storage
 *
 * Uses the History API directly (no router library needed).
 */
export function useMapRouter(options: UseMapRouterOptions = {}): UseMapRouterResult {
  const loadMapImpl = options.loadMap ?? loadMap;
  const [activeMap, setActiveMap] = useState<MapDocument | null>(null);
  const [loading, setLoading] = useState(() => mapIdFromPath(window.location.pathname) !== null);

  // On mount: if URL already contains a map ID, try to load it.
  useEffect(() => {
    const id = mapIdFromPath(window.location.pathname);
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
          // Invalid ID — reset to selection screen
          window.history.replaceState({}, '', '/');
        }
      })
      .catch(() => {
        if (!cancelled) {
          window.history.replaceState({}, '', '/');
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
    const handlePopState = () => {
      const id = mapIdFromPath(window.location.pathname);
      if (!id) {
        setActiveMap(null);
        return;
      }
      void loadMapImpl(id).then((doc) => {
        setActiveMap(doc ?? null);
        if (!doc) {
          window.history.replaceState({}, '', '/');
        }
      });
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [loadMapImpl]);

  const openMap = useCallback((doc: MapDocument) => {
    setActiveMap(doc);
    window.history.pushState({}, '', `/map/${doc.metadata.id}`);
  }, []);

  const closeMap = useCallback(() => {
    setActiveMap(null);
    window.history.pushState({}, '', '/');
  }, []);

  return { activeMap, loading, openMap, closeMap };
}
