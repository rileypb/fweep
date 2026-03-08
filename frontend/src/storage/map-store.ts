import {
  DEFAULT_ROOM_STROKE_STYLE,
  ROOM_SHAPES,
  ROOM_STROKE_STYLES,
  type MapDocument,
  type MapMetadata,
  type MapView,
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

function normalizeConnection(
  connection: MapDocument['connections'][string] | (
    Omit<MapDocument['connections'][string], 'annotation' | 'strokeColorIndex' | 'strokeStyle'> & {
      annotation?: MapDocument['connections'][string]['annotation'];
      strokeColorIndex?: number;
      strokeColor?: string;
      strokeStyle?: Room['strokeStyle'];
    }
  ),
): MapDocument['connections'][string] {
  const legacyConnection = connection as typeof connection & { strokeColor?: string };
  const { strokeColor: _legacyStrokeColor, ...restConnection } = legacyConnection;
  const annotation = (
    legacyConnection.annotation
    && typeof legacyConnection.annotation === 'object'
    && typeof legacyConnection.annotation.kind === 'string'
    && (
      legacyConnection.annotation.text === undefined
      || typeof legacyConnection.annotation.text === 'string'
    )
  )
    ? legacyConnection.annotation
    : null;
  const strokeColorIndex = isValidRoomStrokeColorIndex(connection.strokeColorIndex)
    ? connection.strokeColorIndex
    : typeof legacyConnection.strokeColor === 'string'
      ? findRoomStrokeColorIndexByLegacyColor(legacyConnection.strokeColor) ?? DEFAULT_ROOM_STROKE_COLOR_INDEX
      : DEFAULT_ROOM_STROKE_COLOR_INDEX;
  const strokeStyle = connection.strokeStyle && ROOM_STROKE_STYLES.includes(connection.strokeStyle)
    ? connection.strokeStyle
    : DEFAULT_ROOM_STROKE_STYLE;

  return {
    ...restConnection,
    annotation,
    strokeColorIndex,
    strokeStyle,
  };
}

function normalizeMapView(view: MapDocument['view'] | undefined): MapView {
  return {
    pan: {
      x: typeof view?.pan?.x === 'number' ? view.pan.x : 0,
      y: typeof view?.pan?.y === 'number' ? view.pan.y : 0,
    },
    showGrid: typeof view?.showGrid === 'boolean' ? view.showGrid : true,
    snapToGrid: typeof view?.snapToGrid === 'boolean' ? view.snapToGrid : true,
  };
}

function normalizeMapDocument(doc: MapDocument): MapDocument {
  const rooms = Object.fromEntries(
    Object.entries(doc.rooms).map(([roomId, room]) => [roomId, normalizeRoom(room)]),
  );
  const connections = Object.fromEntries(
    Object.entries(doc.connections).map(([connectionId, connection]) => [connectionId, normalizeConnection(connection)]),
  );

  return {
    ...doc,
    view: normalizeMapView(doc.view),
    rooms,
    connections,
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
