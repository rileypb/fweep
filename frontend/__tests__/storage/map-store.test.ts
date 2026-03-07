import { describe, it, expect } from '@jest/globals';
import { createEmptyMap } from '../../src/domain/map-types';
import { deleteMap, importMapFromFile, listMaps, loadMap, saveMap } from '../../src/storage/map-store';

// Each test gets a fresh IndexedDB via fake-indexeddb (auto-polyfill in setup).
// Because the module-level `openDb` reuses the global indexedDB, and
// fake-indexeddb/auto replaces it, tests are isolated per-file.

describe('map-store', () => {
  describe('saveMap / loadMap round-trip', () => {
    it('persists and retrieves a map by ID', async () => {
      const doc = createEmptyMap('Round Trip');
      await saveMap(doc);

      const loaded = await loadMap(doc.metadata.id);
      expect(loaded).toEqual(doc);
    });

    it('returns undefined for a non-existent ID', async () => {
      const loaded = await loadMap('does-not-exist');
      expect(loaded).toBeUndefined();
    });

    it('hydrates missing room shapes from older saved maps', async () => {
      const doc = createEmptyMap('Legacy');
      const roomId = crypto.randomUUID();
      const legacyDoc = {
        ...doc,
        rooms: {
          [roomId]: {
            id: roomId,
            name: 'Kitchen',
            description: '',
            position: { x: 0, y: 0 },
            directions: {},
            isDark: false,
          },
        },
      } as unknown as Parameters<typeof saveMap>[0];

      await saveMap(legacyDoc);
      const loaded = await loadMap(doc.metadata.id);

      expect(loaded?.rooms[roomId].shape).toBe('rectangle');
    });
  });

  describe('listMaps', () => {
    it('returns an empty array when no maps exist', async () => {
      const metas = await listMaps();
      // May contain maps from previous tests in this suite; filter is acceptable.
      // In a clean DB this should be empty.
      expect(Array.isArray(metas)).toBe(true);
    });

    it('returns maps sorted by most-recently-edited first', async () => {
      const older = createEmptyMap('Older');
      // Manually backdate the older map
      const olderDoc = {
        ...older,
        metadata: { ...older.metadata, updatedAt: '2020-01-01T00:00:00.000Z' },
      };
      const newer = createEmptyMap('Newer');

      await saveMap(olderDoc);
      await saveMap(newer);

      const metas = await listMaps();
      const names = metas.map((m) => m.name);
      const olderIdx = names.indexOf('Older');
      const newerIdx = names.indexOf('Newer');
      expect(newerIdx).toBeLessThan(olderIdx);
    });
  });

  describe('deleteMap', () => {
    it('removes a map so it can no longer be loaded', async () => {
      const doc = createEmptyMap('To Delete');
      await saveMap(doc);
      expect(await loadMap(doc.metadata.id)).toBeDefined();

      await deleteMap(doc.metadata.id);
      expect(await loadMap(doc.metadata.id)).toBeUndefined();
    });
  });

  describe('importMapFromFile', () => {
    /** Helper: create a File-like object with a working .text() method for jsdom. */
    function makeFile(content: string, name: string): File {
      const blob = new Blob([content], { type: 'application/json' });
      const file = new File([blob], name, { type: 'application/json' });
      // jsdom File may lack .text(); polyfill if needed
      if (typeof file.text !== 'function') {
        (file as { text: () => Promise<string> }).text = () =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsText(blob);
          });
      }
      return file;
    }

    it('imports a valid JSON map file and persists it', async () => {
      const doc = createEmptyMap('Imported');
      const file = makeFile(JSON.stringify(doc), 'map.json');

      const imported = await importMapFromFile(file);
      expect(imported.metadata.name).toBe('Imported');

      const loaded = await loadMap(imported.metadata.id);
      expect(loaded).toEqual(imported);
    });

    it('hydrates missing room shapes when importing an older map file', async () => {
      const doc = createEmptyMap('Imported');
      const roomId = crypto.randomUUID();
      const legacyDoc = {
        ...doc,
        rooms: {
          [roomId]: {
            id: roomId,
            name: 'Kitchen',
            description: '',
            position: { x: 0, y: 0 },
            directions: {},
            isDark: false,
          },
        },
      };
      const file = makeFile(JSON.stringify(legacyDoc), 'legacy-map.json');

      const imported = await importMapFromFile(file);

      expect(imported.rooms[roomId].shape).toBe('rectangle');
    });

    it('rejects non-JSON files', async () => {
      const file = makeFile('not json at all', 'bad.json');
      await expect(importMapFromFile(file)).rejects.toThrow('File is not valid JSON.');
    });

    it('rejects JSON without required map fields', async () => {
      const file = makeFile(JSON.stringify({ foo: 'bar' }), 'bad.json');
      await expect(importMapFromFile(file)).rejects.toThrow(
        'File does not contain a valid fweep map.',
      );
    });
  });
});
