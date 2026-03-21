import {
  BACKGROUND_LAYER_CHUNK_SIZE,
  MAP_CANVAS_THEMES,
  MAP_VISUAL_STYLES,
  DEFAULT_ROOM_STROKE_STYLE,
  ROOM_SHAPES,
  ROOM_STROKE_STYLES,
  createEmptyBackground,
  type MapDocument,
  type MapCanvasTheme,
  type MapMetadata,
  type MapView,
  type Room,
} from '../domain/map-types';
import { createTextureSeed } from '../domain/map-defaults';
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
const DB_VERSION = 3;
const STORE_NAME = 'maps';
const BACKGROUND_CHUNK_STORE_NAME = 'background-chunks';
const BACKGROUND_CHUNK_MAP_INDEX = 'by-map-id';
const TEXTURE_TILE_STORE_NAME = 'texture-tiles';
const TEXTURE_TILE_MAP_INDEX = 'by-map-id';

export const MAX_IMPORT_FILE_BYTES = 1_048_576;

export interface BackgroundChunkRecord {
  readonly key: string;
  readonly mapId: string;
  readonly layerId: string;
  readonly chunkX: number;
  readonly chunkY: number;
  readonly width: number;
  readonly height: number;
  readonly blob: Blob;
  readonly updatedAt: string;
}

export interface BackgroundChunkLocation {
  readonly mapId: string;
  readonly layerId: string;
  readonly chunkX: number;
  readonly chunkY: number;
}

export interface BackgroundChunkSaveInput extends BackgroundChunkLocation {
  readonly blob: Blob;
}

export interface RasterChunkHistoryEntry {
  readonly key: string;
  readonly before: Blob | null;
  readonly after: Blob | null;
}

export interface TextureTileLocation {
  readonly mapId: string;
  readonly canvasTheme: Exclude<MapCanvasTheme, 'default'>;
  readonly themeVariant: 'light' | 'dark';
  readonly textureSeed: number;
  readonly generatorVersion: number;
  readonly tileSize: number;
}

export interface TextureTileRecord extends TextureTileLocation {
  readonly key: string;
  readonly blob: Blob;
  readonly updatedAt: string;
}

export function getBackgroundChunkKey(location: BackgroundChunkLocation): string {
  return `${location.mapId}:${location.layerId}:${location.chunkX}:${location.chunkY}`;
}

export function getTextureTileKey(location: TextureTileLocation): string {
  return [
    location.mapId,
    location.canvasTheme,
    location.themeVariant,
    location.textureSeed,
    location.generatorVersion,
    location.tileSize,
  ].join(':');
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'metadata.id' });
      }
      if (!db.objectStoreNames.contains(BACKGROUND_CHUNK_STORE_NAME)) {
        const chunkStore = db.createObjectStore(BACKGROUND_CHUNK_STORE_NAME, { keyPath: 'key' });
        chunkStore.createIndex(BACKGROUND_CHUNK_MAP_INDEX, 'mapId', { unique: false });
      }
      if (!db.objectStoreNames.contains(TEXTURE_TILE_STORE_NAME)) {
        const textureStore = db.createObjectStore(TEXTURE_TILE_STORE_NAME, { keyPath: 'key' });
        textureStore.createIndex(TEXTURE_TILE_MAP_INDEX, 'mapId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE_NAME, mode).objectStore(STORE_NAME);
}

function normalizeBackground(doc: MapDocument): MapDocument['background'] {
  const background = doc.background ?? createEmptyBackground();
  const layers = Object.fromEntries(
    Object.entries(background.layers ?? {}).map(([layerId, layer]) => [
      layerId,
      {
        id: layer.id,
        name: layer.name,
        visible: layer.visible ?? true,
        opacity: typeof layer.opacity === 'number' ? layer.opacity : 1,
        pixelSize: typeof layer.pixelSize === 'number' ? layer.pixelSize : 1,
        chunkSize: typeof layer.chunkSize === 'number' ? layer.chunkSize : BACKGROUND_LAYER_CHUNK_SIZE,
      },
    ]),
  );
  const activeLayerId = background.activeLayerId && background.activeLayerId in layers
    ? background.activeLayerId
    : null;
  const referenceImage = (
    background.referenceImage
    && typeof background.referenceImage.id === 'string'
    && typeof background.referenceImage.name === 'string'
    && typeof background.referenceImage.mimeType === 'string'
    && typeof background.referenceImage.dataUrl === 'string'
    && (typeof background.referenceImage.sourceUrl === 'string' || background.referenceImage.sourceUrl === null || background.referenceImage.sourceUrl === undefined)
    && typeof background.referenceImage.width === 'number'
    && Number.isFinite(background.referenceImage.width)
    && background.referenceImage.width > 0
    && typeof background.referenceImage.height === 'number'
    && Number.isFinite(background.referenceImage.height)
    && background.referenceImage.height > 0
    && typeof background.referenceImage.zoom === 'number'
    && Number.isFinite(background.referenceImage.zoom)
    && background.referenceImage.zoom > 0
  )
    ? {
      id: background.referenceImage.id,
      name: background.referenceImage.name,
      mimeType: background.referenceImage.mimeType,
      dataUrl: background.referenceImage.dataUrl,
      sourceUrl: background.referenceImage.sourceUrl ?? null,
      width: background.referenceImage.width,
      height: background.referenceImage.height,
      zoom: background.referenceImage.zoom,
      position: background.referenceImage.position ?? { x: 0, y: 0 },
    }
    : null;

  return {
    layers,
    activeLayerId,
    referenceImage,
  };
}

function normalizeRoom(
  room: Room | (
    Omit<Room, 'locked' | 'shape' | 'fillColorIndex' | 'strokeColorIndex' | 'strokeStyle'> & {
      locked?: Room['locked'];
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
    locked: typeof room.locked === 'boolean' ? room.locked : false,
    shape,
    fillColorIndex,
    strokeColorIndex,
    strokeStyle,
  };
}

function normalizeConnection(
  connection: MapDocument['connections'][string] | (
    Omit<MapDocument['connections'][string], 'annotation' | 'strokeColorIndex' | 'strokeStyle'> & {
      targetRoomId?: string;
      annotation?: MapDocument['connections'][string]['annotation'];
      strokeColorIndex?: number;
      strokeColor?: string;
      strokeStyle?: Room['strokeStyle'];
    }
  ),
): MapDocument['connections'][string] {
  const legacyConnection = connection as typeof connection & {
    strokeColor?: string;
    targetRoomId?: string;
  };
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
    target: connection.target ?? {
      kind: 'room',
      id: 'targetRoomId' in legacyConnection && typeof legacyConnection.targetRoomId === 'string'
        ? legacyConnection.targetRoomId
        : '',
    },
    annotation,
    strokeColorIndex,
    strokeStyle,
  };
}

function normalizeMapView(view: MapDocument['view'] | undefined): MapView {
  const rawCanvasTheme = (view as { canvasTheme?: string } | undefined)?.canvasTheme;
  const normalizedCanvasThemeValue = rawCanvasTheme === 'contours'
    ? 'antique'
    : rawCanvasTheme;
  const normalizedCanvasTheme = normalizedCanvasThemeValue !== undefined
    && MAP_CANVAS_THEMES.includes(normalizedCanvasThemeValue as MapCanvasTheme)
    ? normalizedCanvasThemeValue as MapCanvasTheme
    : 'default';

  return {
    pan: {
      x: typeof view?.pan?.x === 'number' ? view.pan.x : 0,
      y: typeof view?.pan?.y === 'number' ? view.pan.y : 0,
    },
    zoom: typeof view?.zoom === 'number' && Number.isFinite(view.zoom) ? view.zoom : 1,
    visualStyle: view?.visualStyle && MAP_VISUAL_STYLES.includes(view.visualStyle) ? view.visualStyle : 'square-classic',
    canvasTheme: normalizedCanvasTheme,
    textureSeed: typeof view?.textureSeed === 'number' && Number.isFinite(view.textureSeed)
      ? Math.trunc(view.textureSeed)
      : createTextureSeed(),
    showGrid: typeof view?.showGrid === 'boolean' ? view.showGrid : true,
    snapToGrid: typeof view?.snapToGrid === 'boolean' ? view.snapToGrid : true,
    useBezierConnections: typeof view?.useBezierConnections === 'boolean' ? view.useBezierConnections : false,
    cliOutputCollapsed: typeof view?.cliOutputCollapsed === 'boolean' ? view.cliOutputCollapsed : false,
  };
}

function normalizeMapDocument(doc: MapDocument): MapDocument {
  const rooms = Object.fromEntries(
    Object.entries(doc.rooms).map(([roomId, room]) => [roomId, normalizeRoom(room)]),
  );
  const pseudoRooms = doc.pseudoRooms ?? {};
  const connections = Object.fromEntries(
    Object.entries(doc.connections).map(([connectionId, connection]) => [connectionId, normalizeConnection(connection)]),
  );

  return {
    ...doc,
    view: normalizeMapView(doc.view),
    background: normalizeBackground(doc),
    cliOutputLines: Array.isArray(doc.cliOutputLines)
      ? doc.cliOutputLines.filter((line): line is string => typeof line === 'string')
      : [],
    rooms,
    pseudoRooms,
    connections,
    stickyNotes: doc.stickyNotes ?? {},
    stickyNoteLinks: doc.stickyNoteLinks ?? {},
  };
}

function formatMegabytes(byteCount: number): string {
  return `${Math.round(byteCount / (1024 * 1024))} MB`;
}

function createImportedMapDocument(doc: MapDocument): MapDocument {
  const now = new Date().toISOString();

  return {
    ...doc,
    metadata: {
      ...doc.metadata,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    },
  };
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
    const transaction = db.transaction([STORE_NAME, BACKGROUND_CHUNK_STORE_NAME, TEXTURE_TILE_STORE_NAME], 'readwrite');
    const mapStore = transaction.objectStore(STORE_NAME);
    const chunkStore = transaction.objectStore(BACKGROUND_CHUNK_STORE_NAME);
    const textureStore = transaction.objectStore(TEXTURE_TILE_STORE_NAME);
    const mapRequest = mapStore.delete(id);
    const index = chunkStore.index(BACKGROUND_CHUNK_MAP_INDEX);
    const cursorRequest = index.openCursor(IDBKeyRange.only(id));
    const textureIndex = textureStore.index(TEXTURE_TILE_MAP_INDEX);
    const textureCursorRequest = textureIndex.openCursor(IDBKeyRange.only(id));

    mapRequest.onerror = () => reject(mapRequest.error);
    cursorRequest.onerror = () => reject(cursorRequest.error);
    textureCursorRequest.onerror = () => reject(textureCursorRequest.error);
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (!cursor) {
        return;
      }
      cursor.delete();
      cursor.continue();
    };
    textureCursorRequest.onsuccess = () => {
      const cursor = textureCursorRequest.result;
      if (!cursor) {
        return;
      }
      cursor.delete();
      cursor.continue();
    };

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function loadTextureTile(location: TextureTileLocation): Promise<TextureTileRecord | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(TEXTURE_TILE_STORE_NAME, 'readonly');
    const store = transaction.objectStore(TEXTURE_TILE_STORE_NAME);
    const request = store.get(getTextureTileKey(location));
    request.onsuccess = () => resolve(request.result as TextureTileRecord | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function saveTextureTile(location: TextureTileLocation, blob: Blob): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(TEXTURE_TILE_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(TEXTURE_TILE_STORE_NAME);
    store.put({
      key: getTextureTileKey(location),
      ...location,
      blob,
      updatedAt: new Date().toISOString(),
    } satisfies TextureTileRecord);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function loadBackgroundChunk(
  mapId: string,
  layerId: string,
  chunkX: number,
  chunkY: number,
): Promise<BackgroundChunkRecord | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(BACKGROUND_CHUNK_STORE_NAME, 'readonly');
    const store = transaction.objectStore(BACKGROUND_CHUNK_STORE_NAME);
    const request = store.get(getBackgroundChunkKey({ mapId, layerId, chunkX, chunkY }));
    request.onsuccess = () => resolve(request.result as BackgroundChunkRecord | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function saveBackgroundChunks(chunks: readonly BackgroundChunkSaveInput[]): Promise<void> {
  if (chunks.length === 0) {
    return;
  }

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(BACKGROUND_CHUNK_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(BACKGROUND_CHUNK_STORE_NAME);
    const now = new Date().toISOString();

    chunks.forEach((chunk) => {
      store.put({
        key: getBackgroundChunkKey(chunk),
        mapId: chunk.mapId,
        layerId: chunk.layerId,
        chunkX: chunk.chunkX,
        chunkY: chunk.chunkY,
        width: BACKGROUND_LAYER_CHUNK_SIZE,
        height: BACKGROUND_LAYER_CHUNK_SIZE,
        blob: chunk.blob,
        updatedAt: now,
      } satisfies BackgroundChunkRecord);
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function deleteBackgroundChunksForMap(mapId: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(BACKGROUND_CHUNK_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(BACKGROUND_CHUNK_STORE_NAME);
    const index = store.index(BACKGROUND_CHUNK_MAP_INDEX);
    const request = index.openCursor(IDBKeyRange.only(mapId));

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        return;
      }
      cursor.delete();
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function deleteBackgroundChunks(keys: readonly string[]): Promise<void> {
  if (keys.length === 0) {
    return;
  }

  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(BACKGROUND_CHUNK_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(BACKGROUND_CHUNK_STORE_NAME);
    keys.forEach((key) => {
      store.delete(key);
    });
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function restoreBackgroundChunks(
  mapId: string,
  layerId: string,
  chunks: readonly RasterChunkHistoryEntry[],
  direction: 'undo' | 'redo',
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(BACKGROUND_CHUNK_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(BACKGROUND_CHUNK_STORE_NAME);
    const now = new Date().toISOString();

    chunks.forEach((chunk) => {
      const [storedMapId, storedLayerId, chunkXText, chunkYText] = chunk.key.split(':');
      const nextBlob = direction === 'undo' ? chunk.before : chunk.after;
      if (nextBlob === null) {
        store.delete(chunk.key);
        return;
      }

      store.put({
        key: chunk.key,
        mapId: storedMapId || mapId,
        layerId: storedLayerId || layerId,
        chunkX: Number(chunkXText),
        chunkY: Number(chunkYText),
        width: BACKGROUND_LAYER_CHUNK_SIZE,
        height: BACKGROUND_LAYER_CHUNK_SIZE,
        blob: nextBlob,
        updatedAt: now,
      } satisfies BackgroundChunkRecord);
    });

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function listBackgroundChunksInBounds(
  mapId: string,
  layerId: string,
  minChunkX: number,
  maxChunkX: number,
  minChunkY: number,
  maxChunkY: number,
): Promise<BackgroundChunkRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(BACKGROUND_CHUNK_STORE_NAME, 'readonly');
    const store = transaction.objectStore(BACKGROUND_CHUNK_STORE_NAME);
    const index = store.index(BACKGROUND_CHUNK_MAP_INDEX);
    const request = index.openCursor(IDBKeyRange.only(mapId));
    const matches: BackgroundChunkRecord[] = [];

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(matches.filter((chunk) => (
          chunk.layerId === layerId
          && chunk.chunkX >= minChunkX
          && chunk.chunkX <= maxChunkX
          && chunk.chunkY >= minChunkY
          && chunk.chunkY <= maxChunkY
        )));
        return;
      }

      matches.push(cursor.value as BackgroundChunkRecord);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

export async function listBackgroundChunksForLayer(
  mapId: string,
  layerId: string,
): Promise<BackgroundChunkRecord[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(BACKGROUND_CHUNK_STORE_NAME, 'readonly');
    const store = transaction.objectStore(BACKGROUND_CHUNK_STORE_NAME);
    const index = store.index(BACKGROUND_CHUNK_MAP_INDEX);
    const request = index.openCursor(IDBKeyRange.only(mapId));
    const matches: BackgroundChunkRecord[] = [];

    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) {
        resolve(matches.filter((chunk) => chunk.layerId === layerId));
        return;
      }

      matches.push(cursor.value as BackgroundChunkRecord);
      cursor.continue();
    };
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

  const importedDoc = createImportedMapDocument(doc);
  await saveMap(importedDoc);
  return importedDoc;
}
