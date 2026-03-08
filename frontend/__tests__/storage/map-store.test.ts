import { describe, expect, it, jest } from '@jest/globals';
import { createEmptyMap } from '../../src/domain/map-types';
import {
  deleteMap,
  importMapFromFile,
  listMaps,
  loadMap,
  MAX_IMPORT_FILE_BYTES,
  saveMap,
} from '../../src/storage/map-store';

const DB_NAME = 'fweep';
const STORE_NAME = 'maps';

function makeFile(content: string, name: string, sizeOverride?: number): File {
  const blob = new Blob([content], { type: 'application/json' });
  const file = new File([blob], name, { type: 'application/json' });
  if (typeof file.text !== 'function') {
    (file as { text: () => Promise<string> }).text = () =>
      new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
      });
  }
  if (sizeOverride !== undefined) {
    Object.defineProperty(file, 'size', { configurable: true, value: sizeOverride });
  }
  return file;
}

async function putRawStoredMap(rawValue: unknown): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'metadata.id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(rawValue);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

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

    it('hydrates missing room style fields from older saved maps', async () => {
      const doc = createEmptyMap('Legacy Styles');
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
            shape: 'rectangle',
          },
        },
      } as unknown as Parameters<typeof saveMap>[0];

      await saveMap(legacyDoc);
      const loaded = await loadMap(doc.metadata.id);

      expect(loaded?.rooms[roomId].fillColor).toBe('#ffffff');
      expect(loaded?.rooms[roomId].strokeColor).toBe('#6366f1');
      expect(loaded?.rooms[roomId].strokeStyle).toBe('solid');
    });

    it('rejects invalid saved maps already present in IndexedDB', async () => {
      const doc = createEmptyMap('Broken');
      const raw = {
        ...doc,
        metadata: {
          ...doc.metadata,
          updatedAt: 123,
        },
      };

      await putRawStoredMap(raw);

      await expect(loadMap(doc.metadata.id)).rejects.toThrow(
        'This map could not be opened because its saved data is invalid or incompatible.',
      );
    });
  });

  describe('listMaps', () => {
    it('returns an empty array when no maps exist', async () => {
      const metas = await listMaps();
      expect(Array.isArray(metas)).toBe(true);
    });

    it('returns maps sorted by most-recently-edited first', async () => {
      const older = createEmptyMap('Older');
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

    it('rejects oversized files before reading them', async () => {
      const file = makeFile('{}', 'huge.json', MAX_IMPORT_FILE_BYTES + 1);
      const textSpy = jest.spyOn(file, 'text');

      await expect(importMapFromFile(file)).rejects.toThrow(
        'Map file is too large to import. Maximum size is 1 MB.',
      );

      expect(textSpy).not.toHaveBeenCalled();
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

    it('rejects structurally invalid map JSON without persisting it', async () => {
      const doc = createEmptyMap('Broken Import');
      const file = makeFile(JSON.stringify({
        ...doc,
        rooms: {
          broken: {
            id: 'broken',
            name: 'Broken',
            description: '',
            position: { x: 'left', y: 0 },
            directions: {},
            isDark: false,
          },
        },
      }), 'broken.json');

      await expect(importMapFromFile(file)).rejects.toThrow('File does not contain a valid fweep map.');
      expect(await loadMap(doc.metadata.id)).toBeUndefined();
    });

    it('rejects semantically invalid map JSON without persisting it', async () => {
      const doc = createEmptyMap('Semantically Broken');
      const roomId = crypto.randomUUID();
      const file = makeFile(JSON.stringify({
        ...doc,
        rooms: {
          [roomId]: {
            id: roomId,
            name: 'Room',
            description: '',
            position: { x: 0, y: 0 },
            directions: { north: 'missing-connection' },
            isDark: false,
          },
        },
      }), 'broken-semantic.json');

      await expect(importMapFromFile(file)).rejects.toThrow('File does not contain a valid fweep map.');
      expect(await loadMap(doc.metadata.id)).toBeUndefined();
    });
  });
});
