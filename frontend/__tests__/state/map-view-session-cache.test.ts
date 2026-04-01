import { jest } from '@jest/globals';
import { createEmptyMap } from '../../src/domain/map-types';
import {
  applyCachedMapViewSession,
  cacheMapViewSession,
  loadCachedMapViewSession,
} from '../../src/state/map-view-session-cache';

describe('map-view-session-cache', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('stores and loads cached pan and zoom for a map', () => {
    cacheMapViewSession('map-1', { x: 120, y: -45 }, 1.75);

    expect(loadCachedMapViewSession('map-1')).toEqual({
      pan: { x: 120, y: -45 },
      zoom: 1.75,
    });
  });

  it('applies a cached viewport over a loaded document view', () => {
    const doc = createEmptyMap('Session Map');
    cacheMapViewSession(doc.metadata.id, { x: 64, y: 96 }, 1.5);

    const restored = applyCachedMapViewSession(doc);

    expect(restored.view.pan).toEqual({ x: 64, y: 96 });
    expect(restored.view.zoom).toBe(1.5);
  });

  it('ignores malformed cached data', () => {
    const doc = createEmptyMap('Malformed');
    window.sessionStorage.setItem(`fweep-map-view:${doc.metadata.id}`, JSON.stringify({
      pan: { x: 'left', y: null },
      zoom: 'near',
    }));

    expect(loadCachedMapViewSession(doc.metadata.id)).toBeNull();
    expect(applyCachedMapViewSession(doc)).toBe(doc);
  });

  it('clamps cached zoom to the supported range', () => {
    cacheMapViewSession('map-zoom', { x: 0, y: 0 }, 99);

    expect(loadCachedMapViewSession('map-zoom')).toEqual({
      pan: { x: 0, y: 0 },
      zoom: 3,
    });
  });

  it('returns the original document when the cached viewport already matches', () => {
    const doc = createEmptyMap('Already Matching');
    cacheMapViewSession(doc.metadata.id, doc.view.pan, doc.view.zoom);

    expect(applyCachedMapViewSession(doc)).toBe(doc);
  });

  it('returns null for invalid cached JSON', () => {
    window.sessionStorage.setItem('fweep-map-view:broken', '{not valid json');

    expect(loadCachedMapViewSession('broken')).toBeNull();
  });

  it('gracefully handles session storage access failures', () => {
    const sessionStorageDescriptor = Object.getOwnPropertyDescriptor(window, 'sessionStorage');
    Object.defineProperty(window, 'sessionStorage', {
      configurable: true,
      get() {
        throw new Error('Blocked');
      },
    });

    try {
      cacheMapViewSession('map-1', { x: 12, y: 34 }, 1.2);
      expect(loadCachedMapViewSession('map-1')).toBeNull();
    } finally {
      if (sessionStorageDescriptor) {
        Object.defineProperty(window, 'sessionStorage', sessionStorageDescriptor);
      }
    }
  });
});
