import { ROOM_SHAPES, type MapDocument, type MapMetadata, type Room } from '../domain/map-types';

const DB_NAME = 'fweep';
const DB_VERSION = 1;
const STORE_NAME = 'maps';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'metadata.id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode,
): IDBObjectStore {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

function normalizeRoom(room: Room | (Omit<Room, 'shape'> & { shape?: Room['shape'] })): Room {
  const shape = room.shape && ROOM_SHAPES.includes(room.shape) ? room.shape : 'rectangle';
  return {
    ...room,
    shape,
  };
}

function normalizeMapDocument(doc: MapDocument): MapDocument {
  const rooms = Object.fromEntries(
    Object.entries(doc.rooms).map(([roomId, room]) => [roomId, normalizeRoom(room)]),
  );

  return {
    ...doc,
    rooms,
  };
}

/**
 * Return metadata for every stored map, sorted by most-recently-edited first.
 */
export async function listMaps(): Promise<MapMetadata[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx(db, 'readonly');
    const request = store.getAll();

    request.onsuccess = () => {
      const docs = request.result as MapDocument[];
      const metas = docs
        .map((d) => d.metadata)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
      resolve(metas);
    };
    request.onerror = () => reject(request.error);
  });
}

/** Persist a full map document (create or overwrite). */
export async function saveMap(doc: MapDocument): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx(db, 'readwrite');
    const request = store.put(normalizeMapDocument(doc));
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/** Load a single map document by ID. Returns undefined if not found. */
export async function loadMap(id: string): Promise<MapDocument | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx(db, 'readonly');
    const request = store.get(id);
    request.onsuccess = () => {
      const result = request.result as MapDocument | undefined;
      resolve(result ? normalizeMapDocument(result) : undefined);
    };
    request.onerror = () => reject(request.error);
  });
}

/** Delete a map by ID. */
export async function deleteMap(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx(db, 'readwrite');
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

/**
 * Import a map from a JSON file.
 * Validates that the file contains a parseable MapDocument with required fields.
 * Returns the imported document.
 */
export async function importMapFromFile(file: File): Promise<MapDocument> {
  const text = await file.text();
  let doc: MapDocument;
  try {
    doc = JSON.parse(text) as MapDocument;
  } catch {
    throw new Error('File is not valid JSON.');
  }
  if (
    typeof doc?.schemaVersion !== 'number' ||
    typeof doc?.metadata?.id !== 'string' ||
    typeof doc?.metadata?.name !== 'string'
  ) {
    throw new Error('File does not contain a valid fweep map.');
  }
  const normalizedDoc = normalizeMapDocument(doc);
  await saveMap(normalizedDoc);
  return normalizedDoc;
}
