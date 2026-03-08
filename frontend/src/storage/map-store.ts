import {
  DEFAULT_ROOM_STROKE_STYLE,
  ROOM_SHAPES,
  ROOM_STROKE_STYLES,
  type MapDocument,
  type MapMetadata,
  type Room,
} from '../domain/map-types';
import { MapValidationError, parseUntrustedMapDocument } from '../domain/validation';
import {
  DEFAULT_ROOM_FILL_COLOR_INDEX,
  DEFAULT_ROOM_STROKE_COLOR_INDEX,
  findRoomFillColorIndexByLegacyColor,
  findRoomStrokeColorIndexByLegacyColor,
  isValidRoomFillColorIndex,
  isValidRoomStrokeColorIndex,
} from '../domain/room-color-palette';

const DB_NAME = 'fweep';
const DB_VERSION = 1;
const STORE_NAME = 'maps';

export const MAX_IMPORT_FILE_BYTES = 1_048_576;

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

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

function normalizeRoom(
  room: Room | (
    Omit<Room, 'shape' | 'fillColorIndex' | 'strokeColorIndex' | 'strokeStyle'> & {
      shape?: Room['shape'];
      fillColorIndex?: Room['fillColorIndex'];
      strokeColorIndex?: Room['strokeColorIndex'];
      fillColor?: string;
      strokeColor?: string;
      strokeStyle?: Room['strokeStyle'];
    }
  ),
): Room {
  const legacyRoom = room as typeof room & { fillColor?: string; strokeColor?: string };
  const shape = room.shape && ROOM_SHAPES.includes(room.shape) ? room.shape : 'rectangle';
  const {
    fillColor: _legacyFillColor,
    strokeColor: _legacyStrokeColor,
    ...restRoom
  } = legacyRoom;
  const fillColorIndex = isValidRoomFillColorIndex(room.fillColorIndex)
    ? room.fillColorIndex
    : typeof legacyRoom.fillColor === 'string'
      ? findRoomFillColorIndexByLegacyColor(legacyRoom.fillColor) ?? DEFAULT_ROOM_FILL_COLOR_INDEX
      : DEFAULT_ROOM_FILL_COLOR_INDEX;
  const strokeColorIndex = isValidRoomStrokeColorIndex(room.strokeColorIndex)
    ? room.strokeColorIndex
    : typeof legacyRoom.strokeColor === 'string'
      ? findRoomStrokeColorIndexByLegacyColor(legacyRoom.strokeColor) ?? DEFAULT_ROOM_STROKE_COLOR_INDEX
      : DEFAULT_ROOM_STROKE_COLOR_INDEX;
  const strokeStyle = room.strokeStyle && ROOM_STROKE_STYLES.includes(room.strokeStyle)
    ? room.strokeStyle
    : DEFAULT_ROOM_STROKE_STYLE;

  return {
    ...restRoom,
    shape,
    fillColorIndex,
    strokeColorIndex,
    strokeStyle,
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

function formatMegabytes(byteCount: number): string {
  return `${Math.round(byteCount / (1024 * 1024))} MB`;
}

function toUserMessage(err: unknown, fallback: string): string {
  if (err instanceof MapValidationError) {
    return err.message;
  }
  if (err instanceof Error) {
    return err.message;
  }

  return fallback;
}

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

export async function saveMap(doc: MapDocument): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx(db, 'readwrite');
    const request = store.put(normalizeMapDocument(doc));
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function loadMap(id: string): Promise<MapDocument | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx(db, 'readonly');
    const request = store.get(id);
    request.onsuccess = () => {
      const result = request.result as unknown;
      if (result === undefined) {
        resolve(undefined);
        return;
      }

      try {
        const parsed = parseUntrustedMapDocument(result, 'invalid-saved-map');
        resolve(parsed);
      } catch (err) {
        if (err instanceof MapValidationError) {
          reject(new MapValidationError(
            'invalid-saved-map',
            'This map could not be opened because its saved data is invalid or incompatible.',
            err.issues,
          ));
          return;
        }
        reject(err);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteMap(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const store = tx(db, 'readwrite');
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function importMapFromFile(file: File): Promise<MapDocument> {
  if (file.size > MAX_IMPORT_FILE_BYTES) {
    throw new Error(`Map file is too large to import. Maximum size is ${formatMegabytes(MAX_IMPORT_FILE_BYTES)}.`);
  }

  const text = await file.text();
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(text) as unknown;
  } catch {
    throw new Error('File is not valid JSON.');
  }

  let doc: MapDocument;
  try {
    doc = parseUntrustedMapDocument(parsedJson);
  } catch (err: unknown) {
    throw new Error(toUserMessage(err, 'File does not contain a valid fweep map.'));
  }

  await saveMap(doc);
  return doc;
}
