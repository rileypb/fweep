import type { MapDocument, MapMetadata } from '../domain/map-types';

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
    const request = store.put(doc);
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
    request.onsuccess = () => resolve(request.result as MapDocument | undefined);
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
  await saveMap(doc);
  return doc;
}
