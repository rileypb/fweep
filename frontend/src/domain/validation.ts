import {
  BACKGROUND_LAYER_CHUNK_SIZE,
  CURRENT_SCHEMA_VERSION,
  type ConnectionAnnotation,
  DEFAULT_ROOM_STROKE_STYLE,
  ROOM_SHAPES,
  ROOM_STROKE_STYLES,
  type BackgroundDocument,
  type BackgroundLayer,
  type Connection,
  type Item,
  type MapDocument,
  type MapMetadata,
  type MapView,
  type Position,
  type Room,
  type StickyNote,
  type StickyNoteLink,
} from './map-types';
import {
  DEFAULT_ROOM_FILL_COLOR_INDEX,
  DEFAULT_ROOM_STROKE_COLOR_INDEX,
  findRoomFillColorIndexByLegacyColor,
  findRoomStrokeColorIndexByLegacyColor,
  isValidRoomFillColorIndex,
  isValidRoomStrokeColorIndex,
} from './room-color-palette';

export type ValidationSeverity = 'error' | 'warning';
export type EntityType = 'map' | 'metadata' | 'room' | 'connection' | 'sticky-note' | 'sticky-note-link' | 'item';
export type MapValidationErrorCode =
  | 'invalid-map-document'
  | 'unsupported-schema-version'
  | 'invalid-saved-map';

export const MAX_MAP_NAME_LENGTH = 200;
export const MAX_ENTITY_NAME_LENGTH = 200;
export const MAX_DESCRIPTION_LENGTH = 10_000;
export const MAX_ROOMS = 5_000;
export const MAX_CONNECTIONS = 10_000;
export const MAX_ITEMS = 10_000;
export const MAX_STICKY_NOTES = 10_000;
export const MAX_STICKY_NOTE_LINKS = 10_000;
export const MAX_DIRECTIONS_PER_ROOM = 64;

export interface ValidationIssue {
  readonly severity: ValidationSeverity;
  readonly entityType: EntityType;
  readonly entityId: string;
  readonly path: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly errors: readonly ValidationIssue[];
  readonly warnings: readonly ValidationIssue[];
}

export class MapValidationError extends Error {
  readonly code: MapValidationErrorCode;
  readonly issues: readonly ValidationIssue[];

  constructor(code: MapValidationErrorCode, message: string, issues: readonly ValidationIssue[]) {
    super(message);
    this.name = 'MapValidationError';
    this.code = code;
    this.issues = issues;
  }
}

function pushIssue(
  issues: ValidationIssue[],
  severity: ValidationSeverity,
  entityType: EntityType,
  entityId: string,
  path: string,
  message: string,
): void {
  issues.push({
    severity,
    entityType,
    entityId,
    path,
    message,
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asRecord(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
  entityType: EntityType,
  entityId: string,
): Record<string, unknown> | null {
  if (!isPlainObject(value)) {
    pushIssue(issues, 'error', entityType, entityId, path, `${path} must be an object.`);
    return null;
  }

  return value;
}

function requireString(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
  entityType: EntityType,
  entityId: string,
): string | null {
  if (typeof value !== 'string') {
    pushIssue(issues, 'error', entityType, entityId, path, `${path} must be a string.`);
    return null;
  }

  return value;
}

function parseOptionalString(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
  entityType: EntityType,
  entityId: string,
  defaultValue: string = '',
): string {
  if (value === undefined) {
    return defaultValue;
  }

  if (typeof value !== 'string') {
    pushIssue(issues, 'error', entityType, entityId, path, `${path} must be a string.`);
    return defaultValue;
  }

  return value;
}

function requireBoolean(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
  entityType: EntityType,
  entityId: string,
): boolean | null {
  if (typeof value !== 'boolean') {
    pushIssue(issues, 'error', entityType, entityId, path, `${path} must be a boolean.`);
    return null;
  }

  return value;
}

function requireFiniteNumber(
  value: unknown,
  issues: ValidationIssue[],
  path: string,
  entityType: EntityType,
  entityId: string,
): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    pushIssue(issues, 'error', entityType, entityId, path, `${path} must be a finite number.`);
    return null;
  }

  return value;
}

function validateLength(
  value: string,
  maxLength: number,
  issues: ValidationIssue[],
  path: string,
  entityType: EntityType,
  entityId: string,
  label: string,
): void {
  if (value.length > maxLength) {
    pushIssue(
      issues,
      'error',
      entityType,
      entityId,
      path,
      `${label} must be at most ${maxLength} characters long.`,
    );
  }
}

function parseMetadata(value: unknown, issues: ValidationIssue[]): MapMetadata | null {
  const metadata = asRecord(value, issues, 'metadata', 'metadata', 'metadata');
  if (!metadata) {
    return null;
  }

  const id = requireString(metadata.id, issues, 'metadata.id', 'metadata', 'metadata');
  const name = requireString(metadata.name, issues, 'metadata.name', 'metadata', 'metadata');
  const createdAt = requireString(metadata.createdAt, issues, 'metadata.createdAt', 'metadata', 'metadata');
  const updatedAt = requireString(metadata.updatedAt, issues, 'metadata.updatedAt', 'metadata', 'metadata');

  if (id === null || name === null || createdAt === null || updatedAt === null) {
    return null;
  }

  if (name.trim().length === 0) {
    pushIssue(issues, 'error', 'metadata', id, 'metadata.name', 'Map name must not be empty.');
  }
  validateLength(name, MAX_MAP_NAME_LENGTH, issues, 'metadata.name', 'metadata', id, 'Map name');

  return { id, name, createdAt, updatedAt };
}

function parseMapView(value: unknown, issues: ValidationIssue[]): MapView {
  if (value === undefined) {
    return {
      pan: { x: 0, y: 0 },
      showGrid: true,
      snapToGrid: true,
      useBezierConnections: false,
    };
  }

  const view = asRecord(value, issues, 'view', 'map', 'root');
  if (!view) {
    return {
      pan: { x: 0, y: 0 },
      showGrid: true,
      snapToGrid: true,
      useBezierConnections: false,
    };
  }

  const panRecord = asRecord(view.pan ?? { x: 0, y: 0 }, issues, 'view.pan', 'map', 'root');
  const panX = panRecord ? requireFiniteNumber(panRecord.x, issues, 'view.pan.x', 'map', 'root') : null;
  const panY = panRecord ? requireFiniteNumber(panRecord.y, issues, 'view.pan.y', 'map', 'root') : null;
  const showGrid = view.showGrid === undefined
    ? true
    : requireBoolean(view.showGrid, issues, 'view.showGrid', 'map', 'root');
  const snapToGrid = view.snapToGrid === undefined
    ? true
    : requireBoolean(view.snapToGrid, issues, 'view.snapToGrid', 'map', 'root');
  const useBezierConnections = view.useBezierConnections === undefined
    ? false
    : requireBoolean(view.useBezierConnections, issues, 'view.useBezierConnections', 'map', 'root');

  return {
    pan: {
      x: panX ?? 0,
      y: panY ?? 0,
    },
    showGrid: showGrid ?? true,
    snapToGrid: snapToGrid ?? true,
    useBezierConnections: useBezierConnections ?? false,
  };
}

function parseBackgroundLayer(
  layerId: string,
  value: unknown,
  issues: ValidationIssue[],
): BackgroundLayer | null {
  const layer = asRecord(value, issues, `background.layers.${layerId}`, 'map', 'root');
  if (!layer) {
    return null;
  }

  const id = requireString(layer.id, issues, `background.layers.${layerId}.id`, 'map', 'root');
  const name = requireString(layer.name, issues, `background.layers.${layerId}.name`, 'map', 'root');
  const visible = requireBoolean(layer.visible, issues, `background.layers.${layerId}.visible`, 'map', 'root');
  const opacity = requireFiniteNumber(layer.opacity, issues, `background.layers.${layerId}.opacity`, 'map', 'root');
  const pixelSize = requireFiniteNumber(layer.pixelSize, issues, `background.layers.${layerId}.pixelSize`, 'map', 'root');
  const chunkSize = requireFiniteNumber(layer.chunkSize, issues, `background.layers.${layerId}.chunkSize`, 'map', 'root');

  if (id === null || name === null || visible === null || opacity === null || pixelSize === null || chunkSize === null) {
    return null;
  }

  if (opacity < 0 || opacity > 1) {
    pushIssue(issues, 'error', 'map', 'root', `background.layers.${layerId}.opacity`, 'Layer opacity must be between 0 and 1.');
  }
  if (pixelSize !== 1) {
    pushIssue(issues, 'error', 'map', 'root', `background.layers.${layerId}.pixelSize`, 'Layer pixelSize must be 1.');
  }
  if (chunkSize !== BACKGROUND_LAYER_CHUNK_SIZE) {
    pushIssue(
      issues,
      'error',
      'map',
      'root',
      `background.layers.${layerId}.chunkSize`,
      `Layer chunkSize must be ${BACKGROUND_LAYER_CHUNK_SIZE}.`,
    );
  }

  return {
    id,
    name,
    visible,
    opacity,
    pixelSize,
    chunkSize,
  };
}

function parseBackground(value: unknown, issues: ValidationIssue[]): BackgroundDocument {
  if (value === undefined) {
    return {
      layers: {},
      activeLayerId: null,
    };
  }

  const background = asRecord(value, issues, 'background', 'map', 'root');
  if (!background) {
    return {
      layers: {},
      activeLayerId: null,
    };
  }

  const layersRecord = asRecord(background.layers ?? {}, issues, 'background.layers', 'map', 'root');
  const activeLayerId = background.activeLayerId === undefined || background.activeLayerId === null
    ? null
    : requireString(background.activeLayerId, issues, 'background.activeLayerId', 'map', 'root');
  const layers = Object.fromEntries(
    Object.entries(layersRecord ?? {}).flatMap(([layerId, layerValue]) => {
      const parsedLayer = parseBackgroundLayer(layerId, layerValue, issues);
      return parsedLayer ? [[layerId, parsedLayer]] : [];
    }),
  );

  if (activeLayerId !== null && !(activeLayerId in layers)) {
    pushIssue(issues, 'error', 'map', 'root', 'background.activeLayerId', 'Active background layer must reference an existing layer.');
  }

  return {
    layers,
    activeLayerId,
  };
}

function parsePosition(value: unknown, issues: ValidationIssue[], roomId: string): Position | null {
  const position = asRecord(value, issues, `rooms.${roomId}.position`, 'room', roomId);
  if (!position) {
    return null;
  }

  const x = requireFiniteNumber(position.x, issues, `rooms.${roomId}.position.x`, 'room', roomId);
  const y = requireFiniteNumber(position.y, issues, `rooms.${roomId}.position.y`, 'room', roomId);
  if (x === null || y === null) {
    return null;
  }

  return { x, y };
}

function parseDirections(value: unknown, issues: ValidationIssue[], roomId: string): Readonly<Record<string, string>> | null {
  const directions = asRecord(value, issues, `rooms.${roomId}.directions`, 'room', roomId);
  if (!directions) {
    return null;
  }

  const entries = Object.entries(directions);
  if (entries.length > MAX_DIRECTIONS_PER_ROOM) {
    pushIssue(
      issues,
      'error',
      'room',
      roomId,
      `rooms.${roomId}.directions`,
      `rooms.${roomId}.directions must not contain more than ${MAX_DIRECTIONS_PER_ROOM} entries.`,
    );
  }

  const normalizedEntries: Array<[string, string]> = [];
  for (const [direction, connectionId] of entries) {
    if (typeof connectionId !== 'string') {
      pushIssue(
        issues,
        'error',
        'room',
        roomId,
        `rooms.${roomId}.directions.${direction}`,
        `rooms.${roomId}.directions.${direction} must be a string.`,
      );
      continue;
    }

    normalizedEntries.push([direction, connectionId]);
  }

  return Object.fromEntries(normalizedEntries);
}

function parseColorIndex(
  value: unknown,
  legacyValue: unknown,
  issues: ValidationIssue[],
  path: string,
  roomId: string,
  fallback: number,
  findLegacyIndex: (color: string) => number | null,
  isValidIndex: (index: unknown) => index is number,
): number {
  if (value === undefined) {
    if (legacyValue === undefined) {
      return fallback;
    }

    if (typeof legacyValue !== 'string') {
      pushIssue(issues, 'error', 'room', roomId, path, `${path} must be a palette index.`);
      return fallback;
    }

    const legacyIndex = findLegacyIndex(legacyValue);
    if (legacyIndex === null) {
      pushIssue(issues, 'error', 'room', roomId, path, `${path} must be a valid palette index.`);
      return fallback;
    }

    return legacyIndex;
  }

  if (!isValidIndex(value)) {
    pushIssue(issues, 'error', 'room', roomId, path, `${path} must be a valid palette index.`);
    return fallback;
  }

  return value;
}

function parseRoomShape(value: unknown, issues: ValidationIssue[], roomId: string): Room['shape'] {
  if (value === undefined) {
    return 'rectangle';
  }
  if (typeof value !== 'string' || !ROOM_SHAPES.includes(value as Room['shape'])) {
    pushIssue(issues, 'error', 'room', roomId, `rooms.${roomId}.shape`, `rooms.${roomId}.shape is invalid.`);
    return 'rectangle';
  }
  return value as Room['shape'];
}

function parseStrokeStyle(
  value: unknown,
  issues: ValidationIssue[],
  entityType: EntityType,
  entityId: string,
  path: string,
): Room['strokeStyle'] {
  if (value === undefined) {
    return DEFAULT_ROOM_STROKE_STYLE;
  }
  if (typeof value !== 'string' || !ROOM_STROKE_STYLES.includes(value as Room['strokeStyle'])) {
    pushIssue(
      issues,
      'error',
      entityType,
      entityId,
      path,
      `${path} is invalid.`,
    );
    return DEFAULT_ROOM_STROKE_STYLE;
  }
  return value as Room['strokeStyle'];
}

function parseConnectionAnnotation(
  value: unknown,
  issues: ValidationIssue[],
  connectionId: string,
): ConnectionAnnotation | null {
  if (value === undefined || value === null) {
    return null;
  }

  const annotation = asRecord(
    value,
    issues,
    `connections.${connectionId}.annotation`,
    'connection',
    connectionId,
  );
  if (!annotation) {
    return null;
  }

  const kind = requireString(
    annotation.kind,
    issues,
    `connections.${connectionId}.annotation.kind`,
    'connection',
    connectionId,
  );
  if (kind === null) {
    return null;
  }

  const textValue = annotation.text;
  if (textValue !== undefined && typeof textValue !== 'string') {
    pushIssue(
      issues,
      'error',
      'connection',
      connectionId,
      `connections.${connectionId}.annotation.text`,
      `connections.${connectionId}.annotation.text must be a string.`,
    );
    return { kind };
  }

  if (kind === 'text') {
    if (typeof textValue !== 'string' || textValue.trim().length === 0) {
      pushIssue(
        issues,
        'error',
        'connection',
        connectionId,
        `connections.${connectionId}.annotation.text`,
        'Text annotations must include non-empty annotation text.',
      );
      return { kind };
    }

    validateLength(
      textValue,
      MAX_ENTITY_NAME_LENGTH,
      issues,
      `connections.${connectionId}.annotation.text`,
      'connection',
      connectionId,
      'Connection annotation text',
    );
  }

  return textValue === undefined ? { kind } : { kind, text: textValue };
}

function parseRoom(entryKey: string, value: unknown, issues: ValidationIssue[]): Room | null {
  const room = asRecord(value, issues, `rooms.${entryKey}`, 'room', entryKey);
  if (!room) {
    return null;
  }

  const id = requireString(room.id, issues, `rooms.${entryKey}.id`, 'room', entryKey);
  const name = requireString(room.name, issues, `rooms.${entryKey}.name`, 'room', entryKey);
  const description = requireString(room.description, issues, `rooms.${entryKey}.description`, 'room', entryKey);
  const position = parsePosition(room.position, issues, entryKey);
  const directions = parseDirections(room.directions, issues, entryKey);
  const isDark = requireBoolean(room.isDark, issues, `rooms.${entryKey}.isDark`, 'room', entryKey);

  if (id === null || name === null || description === null || position === null || directions === null || isDark === null) {
    return null;
  }

  if (id !== entryKey) {
    pushIssue(issues, 'error', 'room', entryKey, `rooms.${entryKey}.id`, 'Room id must match its record key.');
  }

  validateLength(name, MAX_ENTITY_NAME_LENGTH, issues, `rooms.${entryKey}.name`, 'room', entryKey, 'Room name');
  validateLength(
    description,
    MAX_DESCRIPTION_LENGTH,
    issues,
    `rooms.${entryKey}.description`,
    'room',
    entryKey,
    'Room description',
  );

  return {
    id,
    name,
    description,
    position,
    directions,
    isDark,
    shape: parseRoomShape(room.shape, issues, entryKey),
    fillColorIndex: parseColorIndex(
      room.fillColorIndex,
      room.fillColor,
      issues,
      `rooms.${entryKey}.fillColorIndex`,
      entryKey,
      DEFAULT_ROOM_FILL_COLOR_INDEX,
      findRoomFillColorIndexByLegacyColor,
      isValidRoomFillColorIndex,
    ),
    strokeColorIndex: parseColorIndex(
      room.strokeColorIndex,
      room.strokeColor,
      issues,
      `rooms.${entryKey}.strokeColorIndex`,
      entryKey,
      DEFAULT_ROOM_STROKE_COLOR_INDEX,
      findRoomStrokeColorIndexByLegacyColor,
      isValidRoomStrokeColorIndex,
    ),
    strokeStyle: parseStrokeStyle(room.strokeStyle, issues, 'room', entryKey, `rooms.${entryKey}.strokeStyle`),
  };
}

function parseConnection(entryKey: string, value: unknown, issues: ValidationIssue[]): Connection | null {
  const connection = asRecord(value, issues, `connections.${entryKey}`, 'connection', entryKey);
  if (!connection) {
    return null;
  }

  const id = requireString(connection.id, issues, `connections.${entryKey}.id`, 'connection', entryKey);
  const sourceRoomId = requireString(
    connection.sourceRoomId,
    issues,
    `connections.${entryKey}.sourceRoomId`,
    'connection',
    entryKey,
  );
  const targetRoomId = requireString(
    connection.targetRoomId,
    issues,
    `connections.${entryKey}.targetRoomId`,
    'connection',
    entryKey,
  );
  const isBidirectional = requireBoolean(
    connection.isBidirectional,
    issues,
    `connections.${entryKey}.isBidirectional`,
    'connection',
    entryKey,
  );

  if (id === null || sourceRoomId === null || targetRoomId === null || isBidirectional === null) {
    return null;
  }

  if (id !== entryKey) {
    pushIssue(
      issues,
      'error',
      'connection',
      entryKey,
      `connections.${entryKey}.id`,
      'Connection id must match its record key.',
    );
  }

  return {
    id,
    sourceRoomId,
    targetRoomId,
    isBidirectional,
    annotation: parseConnectionAnnotation(connection.annotation, issues, entryKey),
    startLabel: parseOptionalString(
      connection.startLabel,
      issues,
      `connections.${entryKey}.startLabel`,
      'connection',
      entryKey,
    ),
    endLabel: parseOptionalString(
      connection.endLabel,
      issues,
      `connections.${entryKey}.endLabel`,
      'connection',
      entryKey,
    ),
    strokeColorIndex: parseColorIndex(
      connection.strokeColorIndex,
      connection.strokeColor,
      issues,
      `connections.${entryKey}.strokeColorIndex`,
      entryKey,
      DEFAULT_ROOM_STROKE_COLOR_INDEX,
      findRoomStrokeColorIndexByLegacyColor,
      isValidRoomStrokeColorIndex,
    ),
    strokeStyle: parseStrokeStyle(
      connection.strokeStyle,
      issues,
      'connection',
      entryKey,
      `connections.${entryKey}.strokeStyle`,
    ),
  };
}

function parseItem(entryKey: string, value: unknown, issues: ValidationIssue[]): Item | null {
  const item = asRecord(value, issues, `items.${entryKey}`, 'item', entryKey);
  if (!item) {
    return null;
  }

  const id = requireString(item.id, issues, `items.${entryKey}.id`, 'item', entryKey);
  const name = requireString(item.name, issues, `items.${entryKey}.name`, 'item', entryKey);
  const description = requireString(item.description, issues, `items.${entryKey}.description`, 'item', entryKey);
  const roomId = requireString(item.roomId, issues, `items.${entryKey}.roomId`, 'item', entryKey);
  const isScenery = requireBoolean(item.isScenery, issues, `items.${entryKey}.isScenery`, 'item', entryKey);
  const isContainer = requireBoolean(item.isContainer, issues, `items.${entryKey}.isContainer`, 'item', entryKey);
  const isSupporter = requireBoolean(item.isSupporter, issues, `items.${entryKey}.isSupporter`, 'item', entryKey);
  const isLightSource = requireBoolean(
    item.isLightSource,
    issues,
    `items.${entryKey}.isLightSource`,
    'item',
    entryKey,
  );

  if (id === null || name === null || description === null || roomId === null || isScenery === null || isContainer === null
    || isSupporter === null || isLightSource === null) {
    return null;
  }

  if (id !== entryKey) {
    pushIssue(issues, 'error', 'item', entryKey, `items.${entryKey}.id`, 'Item id must match its record key.');
  }

  validateLength(name, MAX_ENTITY_NAME_LENGTH, issues, `items.${entryKey}.name`, 'item', entryKey, 'Item name');
  validateLength(
    description,
    MAX_DESCRIPTION_LENGTH,
    issues,
    `items.${entryKey}.description`,
    'item',
    entryKey,
    'Item description',
  );

  return {
    id,
    name,
    description,
    roomId,
    isScenery,
    isContainer,
    isSupporter,
    isLightSource,
  };
}

function parseStickyNote(entryKey: string, value: unknown, issues: ValidationIssue[]): StickyNote | null {
  const stickyNote = asRecord(value, issues, `stickyNotes.${entryKey}`, 'sticky-note', entryKey);
  if (!stickyNote) {
    return null;
  }

  const id = requireString(stickyNote.id, issues, `stickyNotes.${entryKey}.id`, 'sticky-note', entryKey);
  const text = requireString(stickyNote.text, issues, `stickyNotes.${entryKey}.text`, 'sticky-note', entryKey);
  const position = parsePosition(stickyNote.position, issues, entryKey);

  if (id === null || text === null || position === null) {
    return null;
  }

  if (id !== entryKey) {
    pushIssue(issues, 'error', 'sticky-note', entryKey, `stickyNotes.${entryKey}.id`, 'Sticky note id must match its record key.');
  }

  validateLength(text, MAX_DESCRIPTION_LENGTH, issues, `stickyNotes.${entryKey}.text`, 'sticky-note', entryKey, 'Sticky note text');

  return {
    id,
    text,
    position,
  };
}

function parseStickyNoteLink(entryKey: string, value: unknown, issues: ValidationIssue[]): StickyNoteLink | null {
  const stickyNoteLink = asRecord(value, issues, `stickyNoteLinks.${entryKey}`, 'sticky-note-link', entryKey);
  if (!stickyNoteLink) {
    return null;
  }

  const id = requireString(stickyNoteLink.id, issues, `stickyNoteLinks.${entryKey}.id`, 'sticky-note-link', entryKey);
  const stickyNoteId = requireString(
    stickyNoteLink.stickyNoteId,
    issues,
    `stickyNoteLinks.${entryKey}.stickyNoteId`,
    'sticky-note-link',
    entryKey,
  );
  const roomId = requireString(stickyNoteLink.roomId, issues, `stickyNoteLinks.${entryKey}.roomId`, 'sticky-note-link', entryKey);

  if (id === null || stickyNoteId === null || roomId === null) {
    return null;
  }

  if (id !== entryKey) {
    pushIssue(
      issues,
      'error',
      'sticky-note-link',
      entryKey,
      `stickyNoteLinks.${entryKey}.id`,
      'Sticky note link id must match its record key.',
    );
  }

  return {
    id,
    stickyNoteId,
    roomId,
  };
}

function parseRecordCollection<T>(
  value: unknown,
  path: 'rooms' | 'connections' | 'stickyNotes' | 'stickyNoteLinks' | 'items',
  maxEntries: number,
  issues: ValidationIssue[],
  parser: (entryKey: string, entryValue: unknown, parseIssues: ValidationIssue[]) => T | null,
): Readonly<Record<string, T>> {
  const record = asRecord(value, issues, path, 'map', path);
  if (!record) {
    return {};
  }

  const entries = Object.entries(record);
  if (entries.length > maxEntries) {
    pushIssue(issues, 'error', 'map', path, path, `${path} must not contain more than ${maxEntries} entries.`);
  }

  const normalizedEntries: Array<[string, T]> = [];
  for (const [entryKey, entryValue] of entries) {
    const parsed = parser(entryKey, entryValue, issues);
    if (parsed) {
      normalizedEntries.push([entryKey, parsed]);
    }
  }

  return Object.fromEntries(normalizedEntries);
}

export function validateMap(doc: MapDocument): ValidationResult {
  const issues: ValidationIssue[] = [];

  for (const [cid, conn] of Object.entries(doc.connections)) {
    if (!doc.rooms[conn.sourceRoomId]) {
      pushIssue(
        issues,
        'error',
        'connection',
        cid,
        `connections.${cid}.sourceRoomId`,
        `Connection "${cid}" references a missing source room "${conn.sourceRoomId}".`,
      );
    }
    if (!doc.rooms[conn.targetRoomId]) {
      pushIssue(
        issues,
        'error',
        'connection',
        cid,
        `connections.${cid}.targetRoomId`,
        `Connection "${cid}" references a missing target room "${conn.targetRoomId}".`,
      );
    }
  }

  for (const [rid, room] of Object.entries(doc.rooms)) {
    for (const [dir, connId] of Object.entries(room.directions)) {
      if (!doc.connections[connId]) {
        pushIssue(
          issues,
          'error',
          'room',
          rid,
          `rooms.${rid}.directions.${dir}`,
          `Direction binding "${dir}" in room "${room.name}" references a missing connection "${connId}".`,
        );
      }
    }
  }

  for (const [iid, item] of Object.entries(doc.items)) {
    if (!doc.rooms[item.roomId]) {
      pushIssue(
        issues,
        'error',
        'item',
        iid,
        `items.${iid}.roomId`,
        `Item "${item.name}" references a missing room "${item.roomId}".`,
      );
    }
  }

  for (const [stickyNoteLinkId, stickyNoteLink] of Object.entries(doc.stickyNoteLinks)) {
    if (!doc.stickyNotes[stickyNoteLink.stickyNoteId]) {
      pushIssue(
        issues,
        'error',
        'sticky-note-link',
        stickyNoteLinkId,
        `stickyNoteLinks.${stickyNoteLinkId}.stickyNoteId`,
        `Sticky note link "${stickyNoteLinkId}" references a missing sticky note "${stickyNoteLink.stickyNoteId}".`,
      );
    }

    if (!doc.rooms[stickyNoteLink.roomId]) {
      pushIssue(
        issues,
        'error',
        'sticky-note-link',
        stickyNoteLinkId,
        `stickyNoteLinks.${stickyNoteLinkId}.roomId`,
        `Sticky note link "${stickyNoteLinkId}" references a missing room "${stickyNoteLink.roomId}".`,
      );
    }
  }

  const roomIds = Object.keys(doc.rooms);
  if (roomIds.length > 1) {
    const connectedRoomIds = new Set<string>();
    for (const conn of Object.values(doc.connections)) {
      connectedRoomIds.add(conn.sourceRoomId);
      connectedRoomIds.add(conn.targetRoomId);
    }
    for (const [rid, room] of Object.entries(doc.rooms)) {
      if (!connectedRoomIds.has(rid)) {
        pushIssue(
          issues,
          'warning',
          'room',
          rid,
          `rooms.${rid}`,
          `Room "${room.name}" has no connections and may be unreachable.`,
        );
      }
    }
  }

  return {
    errors: issues.filter((issue) => issue.severity === 'error'),
    warnings: issues.filter((issue) => issue.severity === 'warning'),
  };
}

function throwForIssues(code: MapValidationErrorCode, message: string, issues: readonly ValidationIssue[]): never {
  throw new MapValidationError(code, message, issues);
}

export function parseUntrustedMapDocument(
  input: unknown,
  errorCode: MapValidationErrorCode = 'invalid-map-document',
): MapDocument {
  const issues: ValidationIssue[] = [];
  const doc = asRecord(input, issues, 'root', 'map', 'root');
  if (!doc) {
    throwForIssues(errorCode, 'File does not contain a valid fweep map.', issues);
  }

  const schemaVersion = doc.schemaVersion;
  if (typeof schemaVersion !== 'number') {
    pushIssue(issues, 'error', 'map', 'root', 'schemaVersion', 'schemaVersion must be a number.');
  } else if (schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throwForIssues(
      'unsupported-schema-version',
      'This fweep map uses an unsupported schema version.',
      [{
        severity: 'error',
        entityType: 'map',
        entityId: 'root',
        path: 'schemaVersion',
        message: `schemaVersion ${schemaVersion} is unsupported.`,
      }],
    );
  }

  const metadata = parseMetadata(doc.metadata, issues);
  const view = parseMapView(doc.view, issues);
  const background = parseBackground(doc.background, issues);
  const rooms = parseRecordCollection(doc.rooms, 'rooms', MAX_ROOMS, issues, parseRoom);
  const connections = parseRecordCollection(doc.connections, 'connections', MAX_CONNECTIONS, issues, parseConnection);
  const stickyNotes = parseRecordCollection(doc.stickyNotes ?? {}, 'stickyNotes', MAX_STICKY_NOTES, issues, parseStickyNote);
  const stickyNoteLinks = parseRecordCollection(doc.stickyNoteLinks ?? {}, 'stickyNoteLinks', MAX_STICKY_NOTE_LINKS, issues, parseStickyNoteLink);
  const items = parseRecordCollection(doc.items, 'items', MAX_ITEMS, issues, parseItem);

  if (!metadata || issues.some((issue) => issue.severity === 'error')) {
    throwForIssues(errorCode, 'File does not contain a valid fweep map.', issues);
  }

  const normalizedDoc: MapDocument = {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    metadata,
    view,
    background,
    rooms,
    connections,
    stickyNotes,
    stickyNoteLinks,
    items,
  };

  const semanticValidation = validateMap(normalizedDoc);
  if (semanticValidation.errors.length > 0) {
    throwForIssues(errorCode, 'File does not contain a valid fweep map.', semanticValidation.errors);
  }

  return normalizedDoc;
}
