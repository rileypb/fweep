import { describe, expect, it, jest } from '@jest/globals';
import { createEmptyMap } from '../../src/domain/map-types';
import {
  deleteBackgroundChunks,
  deleteBackgroundChunksForMap,
  deleteMap,
  getBackgroundChunkKey,
  importMapFromFile,
  listBackgroundChunksForLayer,
  listBackgroundChunksInBounds,
  listMaps,
  loadBackgroundChunk,
  loadMap,
  MAX_IMPORT_FILE_BYTES,
  restoreBackgroundChunks,
  saveBackgroundChunks,
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
    const request = indexedDB.open(DB_NAME, 2);
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

      expect(loaded?.rooms[roomId].fillColorIndex).toBe(0);
      expect(loaded?.rooms[roomId].strokeColorIndex).toBe(0);
      expect(loaded?.rooms[roomId].strokeStyle).toBe('solid');
      expect(loaded?.rooms[roomId].locked).toBe(false);
    });

    it('hydrates missing connection style fields from older saved maps', async () => {
      const doc = createEmptyMap('Legacy Connection Styles');
      const sourceRoomId = crypto.randomUUID();
      const targetRoomId = crypto.randomUUID();
      const connectionId = crypto.randomUUID();
      const legacyDoc = {
        ...doc,
        rooms: {
          [sourceRoomId]: {
            id: sourceRoomId,
            name: 'Kitchen',
            description: '',
            position: { x: 0, y: 0 },
            directions: { east: connectionId },
            isDark: false,
          },
          [targetRoomId]: {
            id: targetRoomId,
            name: 'Hallway',
            description: '',
            position: { x: 160, y: 0 },
            directions: { west: connectionId },
            isDark: false,
          },
        },
        connections: {
          [connectionId]: {
            id: connectionId,
            sourceRoomId,
            targetRoomId,
            isBidirectional: true,
          },
        },
      } as unknown as Parameters<typeof saveMap>[0];

      await saveMap(legacyDoc);
      const loaded = await loadMap(doc.metadata.id);

      expect(loaded?.connections[connectionId].strokeColorIndex).toBe(0);
      expect(loaded?.connections[connectionId].strokeStyle).toBe('solid');
      expect(loaded?.connections[connectionId].annotation).toBeNull();
      expect(loaded?.view).toEqual({
        pan: { x: 0, y: 0 },
        showGrid: true,
        snapToGrid: true,
        useBezierConnections: false,
      });
    });

    it('normalizes invalid background, room, connection, and view fields from legacy saved maps', async () => {
      const doc = createEmptyMap('Legacy Normalization');
      const sourceRoomId = crypto.randomUUID();
      const targetRoomId = crypto.randomUUID();
      const connectionId = crypto.randomUUID();
      const legacyDoc = {
        ...doc,
        view: {
          pan: { x: 'left', y: null },
          showGrid: 'yes',
          snapToGrid: 1,
          useBezierConnections: 'sometimes',
        },
        background: {
          activeLayerId: 'missing-layer',
          layers: {
            'layer-1': {
              id: 'layer-1',
              name: 'Layer 1',
              visible: undefined,
              opacity: 'opaque',
              pixelSize: null,
              chunkSize: 'large',
            },
          },
        },
        rooms: {
          [sourceRoomId]: {
            id: sourceRoomId,
            name: 'Kitchen',
            description: '',
            position: { x: 0, y: 0 },
            directions: { east: connectionId },
            isDark: false,
            locked: 'sure',
            shape: 'triangle',
            fillColorIndex: -1,
            strokeColorIndex: 999,
            strokeStyle: 'zigzag',
          },
          [targetRoomId]: {
            id: targetRoomId,
            name: 'Hallway',
            description: '',
            position: { x: 160, y: 0 },
            directions: { west: connectionId },
            isDark: false,
            shape: 'rectangle',
            fillColorIndex: 0,
            strokeColorIndex: 0,
            strokeStyle: 'solid',
          },
        },
        connections: {
          [connectionId]: {
            id: connectionId,
            sourceRoomId,
            targetRoomId,
            isBidirectional: true,
            annotation: { kind: 'text', text: 123 },
            strokeColorIndex: -4,
            strokeStyle: 'wavy',
          },
        },
        stickyNotes: undefined,
        stickyNoteLinks: undefined,
      } as unknown as Parameters<typeof saveMap>[0];

      await saveMap(legacyDoc);
      const loaded = await loadMap(doc.metadata.id);

      expect(loaded?.background).toEqual({
        activeLayerId: null,
        layers: {
          'layer-1': {
            id: 'layer-1',
            name: 'Layer 1',
            visible: true,
            opacity: 1,
            pixelSize: 1,
            chunkSize: 256,
          },
        },
      });
      expect(loaded?.rooms[sourceRoomId]).toMatchObject({
        locked: false,
        shape: 'rectangle',
        fillColorIndex: 0,
        strokeColorIndex: 0,
        strokeStyle: 'solid',
      });
      expect(loaded?.connections[connectionId]).toMatchObject({
        annotation: null,
        strokeColorIndex: 0,
        strokeStyle: 'solid',
      });
      expect(loaded?.view).toEqual({
        pan: { x: 0, y: 0 },
        showGrid: true,
        snapToGrid: true,
        useBezierConnections: false,
      });
      expect(loaded?.stickyNotes).toEqual({});
      expect(loaded?.stickyNoteLinks).toEqual({});
    });

    it('maps legacy direct room colors to palette indices when loading saved maps', async () => {
      const doc = createEmptyMap('Legacy Colors');
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
            fillColor: '#ffcc00',
            strokeColor: '#166534',
            strokeStyle: 'solid',
          },
        },
      } as unknown as Parameters<typeof saveMap>[0];

      await saveMap(legacyDoc);
      const loaded = await loadMap(doc.metadata.id);

      expect(loaded?.rooms[roomId].fillColorIndex).toBe(2);
      expect(loaded?.rooms[roomId].strokeColorIndex).toBe(4);
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

    it('removes background chunks associated with the map', async () => {
      const doc = createEmptyMap('With Chunks');
      const blob = new Blob(['chunk'], { type: 'image/png' });
      await saveMap(doc);
      await saveBackgroundChunks([{
        mapId: doc.metadata.id,
        layerId: 'layer-1',
        chunkX: 0,
        chunkY: 0,
        blob,
      }]);

      await deleteMap(doc.metadata.id);

      expect(await loadBackgroundChunk(doc.metadata.id, 'layer-1', 0, 0)).toBeUndefined();
    });
  });

  describe('background chunk storage', () => {
    it('treats empty chunk save and delete requests as no-ops', async () => {
      const doc = createEmptyMap('No-op Chunks');
      await saveMap(doc);

      await expect(saveBackgroundChunks([])).resolves.toBeUndefined();
      await expect(deleteBackgroundChunks([])).resolves.toBeUndefined();

      expect(await listBackgroundChunksForLayer(doc.metadata.id, 'layer-1')).toEqual([]);
    });

    it('saves and loads background chunks by coordinate', async () => {
      const doc = createEmptyMap('Chunks');
      await saveMap(doc);
      const blob = new Blob(['chunk-data'], { type: 'image/png' });

      await saveBackgroundChunks([{
        mapId: doc.metadata.id,
        layerId: 'layer-1',
        chunkX: 1,
        chunkY: -2,
        blob,
      }]);

      const loaded = await loadBackgroundChunk(doc.metadata.id, 'layer-1', 1, -2);
      expect(loaded?.key).toBe(getBackgroundChunkKey({
        mapId: doc.metadata.id,
        layerId: 'layer-1',
        chunkX: 1,
        chunkY: -2,
      }));

      const listed = await listBackgroundChunksInBounds(doc.metadata.id, 'layer-1', 0, 2, -3, 0);
      expect(listed).toHaveLength(1);
    });

    it('lists chunks for a single layer only', async () => {
      const doc = createEmptyMap('Layered Chunks');
      await saveMap(doc);
      const blob = new Blob(['chunk-data'], { type: 'image/png' });

      await saveBackgroundChunks([
        {
          mapId: doc.metadata.id,
          layerId: 'layer-1',
          chunkX: 0,
          chunkY: 0,
          blob,
        },
        {
          mapId: doc.metadata.id,
          layerId: 'layer-2',
          chunkX: 0,
          chunkY: 0,
          blob,
        },
      ]);

      const listed = await listBackgroundChunksForLayer(doc.metadata.id, 'layer-1');
      expect(listed).toHaveLength(1);
      expect(listed[0]?.layerId).toBe('layer-1');
    });

    it('deletes background chunks by explicit key', async () => {
      const doc = createEmptyMap('Delete Chunks');
      await saveMap(doc);
      const blob = new Blob(['chunk-data'], { type: 'image/png' });
      await saveBackgroundChunks([{
        mapId: doc.metadata.id,
        layerId: 'layer-1',
        chunkX: 3,
        chunkY: 4,
        blob,
      }]);

      const key = getBackgroundChunkKey({
        mapId: doc.metadata.id,
        layerId: 'layer-1',
        chunkX: 3,
        chunkY: 4,
      });
      await deleteBackgroundChunks([key]);

      expect(await loadBackgroundChunk(doc.metadata.id, 'layer-1', 3, 4)).toBeUndefined();
    });

    it('deletes every chunk for a map', async () => {
      const firstDoc = createEmptyMap('First Map Chunks');
      const secondDoc = createEmptyMap('Second Map Chunks');
      const blob = new Blob(['chunk-data'], { type: 'image/png' });
      await saveMap(firstDoc);
      await saveMap(secondDoc);
      await saveBackgroundChunks([
        {
          mapId: firstDoc.metadata.id,
          layerId: 'layer-1',
          chunkX: 0,
          chunkY: 0,
          blob,
        },
        {
          mapId: secondDoc.metadata.id,
          layerId: 'layer-1',
          chunkX: 0,
          chunkY: 0,
          blob,
        },
      ]);

      await deleteBackgroundChunksForMap(firstDoc.metadata.id);

      expect(await loadBackgroundChunk(firstDoc.metadata.id, 'layer-1', 0, 0)).toBeUndefined();
      expect(await loadBackgroundChunk(secondDoc.metadata.id, 'layer-1', 0, 0)).toBeDefined();
    });

    it('restores background chunks for undo and redo history', async () => {
      const doc = createEmptyMap('Restore Chunks');
      const beforeBlob = new Blob(['before'], { type: 'image/png' });
      const afterBlob = new Blob(['after'], { type: 'image/png' });
      await saveMap(doc);

      const key = getBackgroundChunkKey({
        mapId: doc.metadata.id,
        layerId: 'layer-1',
        chunkX: 2,
        chunkY: -1,
      });

      await restoreBackgroundChunks(doc.metadata.id, 'layer-1', [{
        key,
        before: beforeBlob,
        after: afterBlob,
      }], 'redo');

      expect(await loadBackgroundChunk(doc.metadata.id, 'layer-1', 2, -1)).toMatchObject({
        blob: afterBlob,
      });

      await restoreBackgroundChunks(doc.metadata.id, 'layer-1', [{
        key,
        before: beforeBlob,
        after: afterBlob,
      }], 'undo');

      expect(await loadBackgroundChunk(doc.metadata.id, 'layer-1', 2, -1)).toMatchObject({
        blob: beforeBlob,
      });
    });

    it('deletes restored chunks when the target history blob is null', async () => {
      const doc = createEmptyMap('Restore Delete Chunks');
      const blob = new Blob(['after'], { type: 'image/png' });
      await saveMap(doc);
      await saveBackgroundChunks([{
        mapId: doc.metadata.id,
        layerId: 'layer-1',
        chunkX: 5,
        chunkY: 6,
        blob,
      }]);

      const key = getBackgroundChunkKey({
        mapId: doc.metadata.id,
        layerId: 'layer-1',
        chunkX: 5,
        chunkY: 6,
      });

      await restoreBackgroundChunks(doc.metadata.id, 'layer-1', [{
        key,
        before: null,
        after: blob,
      }], 'undo');

      expect(await loadBackgroundChunk(doc.metadata.id, 'layer-1', 5, 6)).toBeUndefined();
    });
  });

  describe('importMapFromFile', () => {
    it('imports a valid JSON map file and persists it', async () => {
      const doc = createEmptyMap('Imported');
      const file = makeFile(JSON.stringify(doc), 'map.json');

      const imported = await importMapFromFile(file);
      expect(imported.metadata.name).toBe('Imported');
      expect(imported.metadata.id).not.toBe(doc.metadata.id);

      const loaded = await loadMap(imported.metadata.id);
      expect(loaded).toEqual(imported);
    });

    it('does not overwrite an existing saved map when an imported file reuses its id', async () => {
      const existing = createEmptyMap('Existing');
      await saveMap(existing);

      const importedDoc = {
        ...createEmptyMap('Imported Copy'),
        metadata: {
          ...createEmptyMap('Imported Copy').metadata,
          id: existing.metadata.id,
          name: 'Imported Copy',
        },
      };
      const file = makeFile(JSON.stringify(importedDoc), 'colliding-map.json');

      const imported = await importMapFromFile(file);

      expect(imported.metadata.id).not.toBe(existing.metadata.id);
      expect(imported.metadata.name).toBe('Imported Copy');
      expect(await loadMap(existing.metadata.id)).toEqual(existing);
      expect(await loadMap(imported.metadata.id)).toEqual(imported);
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
