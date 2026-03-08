import { useState, useCallback, useRef, useEffect } from 'react';
import { useEditorStore } from '../state/editor-store';
import {
  CONNECTION_ANNOTATION_KINDS,
  ROOM_SHAPES,
  ROOM_STROKE_STYLES,
  type Connection,
  type Room,
  type RoomShape,
  type RoomStrokeStyle,
} from '../domain/map-types';
import {
  getRoomFillColor,
  getRoomStrokeColor,
  ROOM_FILL_PALETTE,
  ROOM_STROKE_PALETTE,
  type RoomColorPaletteEntry,
  type ThemeMode,
} from '../domain/room-color-palette';
import {
  computeConnectionPath,
  computeSegmentArrowheadPoints,
  computePreviewPath,
  getHandleOffset,
  pointsToSvgString,
  ROOM_HEIGHT,
  ROOM_CORNER_RADIUS,
  ROOM_WIDTH,
} from '../graph/connection-geometry';
import { normalizeDirection } from '../domain/directions';

const AUTO_PAN_ANIMATION_MS = 320;
const ROOM_VISIBILITY_PADDING = 24;
const ROOM_TEXT_CHAR_WIDTH = 6.78;
const ROOM_HORIZONTAL_PADDING = 24;
const HANDLE_RADIUS = 5;
const CONNECTION_ANNOTATION_OFFSET = 8;
const CONNECTION_ANNOTATION_LENGTH_RATIO = 0.8;
const CONNECTION_ANNOTATION_ARROWHEAD_LENGTH = 10;
const CONNECTION_ANNOTATION_ARROWHEAD_WIDTH = 8;
const CONNECTION_ANNOTATION_TEXT_OFFSET = 12;

interface PanOffset {
  x: number;
  y: number;
}

interface SelectionBox {
  readonly startX: number;
  readonly startY: number;
  readonly currentX: number;
  readonly currentY: number;
}

interface RoomScreenGeometry {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
}

export interface MapCanvasProps {
  mapName: string;
  /** Whether the background grid is visible. Defaults to true. */
  showGrid?: boolean;
}

/* ---- Room editor overlay ---- */

interface RoomEditorOverlayProps {
  roomId: string;
  panOffset: PanOffset;
  canvasRect: DOMRect | null;
  theme: ThemeMode;
  onClose: () => void;
  onBackdropClose: () => void;
}

interface ConnectionEditorOverlayProps {
  connectionId: string;
  onClose: () => void;
  onBackdropClose: () => void;
}

interface ColorChipGroupProps {
  label: string;
  options: readonly RoomColorPaletteEntry[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  testIdPrefix: string;
}

function ColorChipGroup({
  label,
  options,
  selectedIndex,
  onSelect,
  testIdPrefix,
}: ColorChipGroupProps): React.JSX.Element {
  return (
    <div className="room-color-chip-group" role="radiogroup" aria-label={label}>
      {options.map((color, index) => {
        const isSelected = index === selectedIndex;
        return (
          <button
            key={`${label}-${color.label}`}
            type="button"
            role="radio"
            aria-label={`${label}: ${color.label}`}
            aria-checked={isSelected}
            className={`room-color-chip${isSelected ? ' room-color-chip--selected' : ''}`}
            data-testid={`${testIdPrefix}-${index}`}
            style={{
              '--room-chip-light': color.light,
              '--room-chip-dark': color.dark,
            } as React.CSSProperties}
            onClick={() => onSelect(index)}
          >
            <span className="room-color-chip-swatch" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

function ConnectionEditorOverlay({
  connectionId,
  onClose,
  onBackdropClose,
}: ConnectionEditorOverlayProps): React.JSX.Element | null {
  const connection = useEditorStore((s) => s.doc?.connections[connectionId] ?? null);
  const setConnectionAnnotation = useEditorStore((s) => s.setConnectionAnnotation);
  const setConnectionStyle = useEditorStore((s) => s.setConnectionStyle);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  if (!connection) {
    return null;
  }

  const selectedAnnotationKind = connection.annotation?.kind ?? null;
  const annotationText = connection.annotation?.kind === 'text' ? connection.annotation.text ?? '' : '';
  const presetAnnotationKinds = CONNECTION_ANNOTATION_KINDS.filter((kind) => kind !== 'text');

  return (
    <div className="connection-editor-overlay" data-testid="connection-editor-overlay">
      <div
        className="connection-editor-backdrop"
        aria-hidden="true"
        onClick={onBackdropClose}
      />
      <div
        className="connection-editor-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Connection editor"
        data-testid="connection-editor-dialog"
      >
        <button
          className="connection-editor-close"
          type="button"
          aria-label="Close connection editor"
          onClick={onClose}
        >
          ×
        </button>
        <div className="connection-editor-content">
          <fieldset className="connection-annotation-group">
            <legend className="room-editor-label">Annotation</legend>
            {presetAnnotationKinds.map((kind) => (
              <label key={kind} className="connection-annotation-option">
                <input
                  type="radio"
                  name={`connection-annotation-${connection.id}`}
                  checked={selectedAnnotationKind === kind}
                  onChange={() => setConnectionAnnotation(connection.id, { kind })}
                />
                <span>{kind}</span>
              </label>
            ))}
            <label className="connection-annotation-option connection-annotation-option--text">
              <input
                type="radio"
                name={`connection-annotation-${connection.id}`}
                checked={selectedAnnotationKind === 'text'}
                onChange={() => setConnectionAnnotation(connection.id, { kind: 'text', text: annotationText })}
              />
              <span>Text</span>
              <input
                className="room-editor-input connection-annotation-text-input"
                type="text"
                aria-label="Connection annotation text"
                value={annotationText}
                onFocus={() => {
                  if (selectedAnnotationKind !== 'text') {
                    setConnectionAnnotation(connection.id, { kind: 'text', text: annotationText });
                  }
                }}
                onChange={(e) => setConnectionAnnotation(connection.id, { kind: 'text', text: e.target.value })}
              />
            </label>
          </fieldset>
          <div className="room-editor-field">
            <span className="room-editor-label">Stroke color</span>
            <ColorChipGroup
              label="Connection stroke color"
              options={ROOM_STROKE_PALETTE}
              selectedIndex={connection.strokeColorIndex}
              onSelect={(strokeColorIndex) => setConnectionStyle(connection.id, { strokeColorIndex })}
              testIdPrefix="connection-stroke-color-chip"
            />
          </div>
          <div className="room-editor-field">
            <label className="room-editor-label" htmlFor="connection-editor-stroke-style-input">
              Stroke style
            </label>
            <select
              id="connection-editor-stroke-style-input"
              className="room-editor-input"
              aria-label="Connection stroke style"
              value={connection.strokeStyle}
              onChange={(e) => setConnectionStyle(connection.id, { strokeStyle: e.target.value as RoomStrokeStyle })}
            >
              {ROOM_STROKE_STYLES.map((strokeStyle) => (
                <option key={strokeStyle} value={strokeStyle}>
                  {strokeStyle}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}

function RoomEditorOverlay({
  roomId,
  panOffset,
  canvasRect,
  theme,
  onClose,
  onBackdropClose,
}: RoomEditorOverlayProps): React.JSX.Element | null {
  const room = useEditorStore((s) => s.doc?.rooms[roomId] ?? null);
  const renameRoom = useEditorStore((s) => s.renameRoom);
  const describeRoom = useEditorStore((s) => s.describeRoom);
  const setRoomShape = useEditorStore((s) => s.setRoomShape);
  const setRoomStyle = useEditorStore((s) => s.setRoomStyle);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const descriptionInputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, []);

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();
      descriptionInputRef.current?.focus();
    }
  }, [onClose]);

  const handleDescriptionKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  }, [onClose]);

  if (!room) {
    return null;
  }

  const roomGeometry = getRoomScreenGeometry(room, panOffset, canvasRect);

  return (
    <div className="room-editor-overlay" data-testid="room-editor-overlay">
      <div
        className="room-editor-backdrop"
        aria-hidden="true"
        onClick={onBackdropClose}
      />
      <div
        className="room-node room-editor-room-node"
        data-testid="room-editor-room-node"
        data-room-shape={room.shape}
        style={{
          transform: `translate(${roomGeometry.centerX}px, ${roomGeometry.top}px) translateX(-50%)`,
          width: `${roomGeometry.width}px`,
          height: `${roomGeometry.height}px`,
        }}
      >
        <svg
          className="room-editor-room-svg"
          aria-hidden="true"
          width={roomGeometry.width}
          height={roomGeometry.height}
        >
          {renderRoomShape(room.shape, roomGeometry.width, roomGeometry.height, room, theme)}
        </svg>
        <input
          ref={nameInputRef}
          className="room-name-input room-editor-room-name-input"
          data-testid="room-editor-name-input"
          type="text"
          aria-label="Room name"
          value={room.name}
          onChange={(e) => renameRoom(room.id, e.target.value, { historyMergeKey: `room:${room.id}:name` })}
          onKeyDown={handleNameKeyDown}
        />
      </div>
      <div
        className="room-editor-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Room editor"
        data-testid="room-editor-dialog"
      >
        <button
          className="room-editor-close"
          type="button"
          aria-label="Close room editor"
          onClick={onClose}
        >
          ×
        </button>

        <div className="room-editor-content">
          <aside className="room-editor-sidebar">
            <div className="room-editor-field">
              <span className="room-editor-label">Fill color</span>
              <ColorChipGroup
                label="Fill color"
                options={ROOM_FILL_PALETTE}
                selectedIndex={room.fillColorIndex}
                onSelect={(fillColorIndex) => setRoomStyle(room.id, { fillColorIndex })}
                testIdPrefix="room-fill-color-chip"
              />
            </div>

            <div className="room-editor-field">
              <span className="room-editor-label">Stroke color</span>
              <ColorChipGroup
                label="Stroke color"
                options={ROOM_STROKE_PALETTE}
                selectedIndex={room.strokeColorIndex}
                onSelect={(strokeColorIndex) => setRoomStyle(room.id, { strokeColorIndex })}
                testIdPrefix="room-stroke-color-chip"
              />
            </div>

            <div className="room-editor-field">
              <label className="room-editor-label" htmlFor="room-editor-stroke-style-input">
                Stroke style
              </label>
              <select
                id="room-editor-stroke-style-input"
                className="room-editor-input"
                aria-label="Stroke style"
                value={room.strokeStyle}
                onChange={(e) => setRoomStyle(room.id, { strokeStyle: e.target.value as RoomStrokeStyle })}
              >
                {ROOM_STROKE_STYLES.map((strokeStyle) => (
                  <option key={strokeStyle} value={strokeStyle}>
                    {strokeStyle}
                  </option>
                ))}
              </select>
            </div>
          </aside>

          <div className="room-editor-main">
            <div className="room-editor-field">
              <label className="room-editor-label" htmlFor="room-editor-description-input">
                Description
              </label>
              <textarea
                id="room-editor-description-input"
                ref={descriptionInputRef}
                className="room-editor-textarea"
                data-testid="room-editor-description-input"
                value={room.description}
                onChange={(e) => describeRoom(room.id, e.target.value, { historyMergeKey: `room:${room.id}:description` })}
                onKeyDown={handleDescriptionKeyDown}
                rows={8}
              />
            </div>

            <div className="room-editor-field">
              <span className="room-editor-label">Shape</span>
              <div className="room-shape-picker" role="radiogroup" aria-label="Room shape">
                {ROOM_SHAPES.map((shape) => (
                  <button
                    key={shape}
                    type="button"
                    role="radio"
                    aria-checked={room.shape === shape}
                    className={`room-shape-option${room.shape === shape ? ' room-shape-option--selected' : ''}`}
                    data-testid={`room-shape-option-${shape}`}
                    onClick={() => setRoomShape(room.id, shape)}
                  >
                    <svg className="room-shape-option-preview" width="44" height="28" viewBox="0 0 44 28" aria-hidden="true">
                      {renderRoomShape(shape, 44, 28, room, theme)}
                    </svg>
                    <span>{shape}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- Directional handles ---- */

const DIRECTION_HANDLES = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;

interface DirectionHandlesProps {
  roomWidth: number;
  roomHeight: number;
  roomShape: RoomShape;
  onHandleMouseDown?: (direction: string, e: React.MouseEvent) => void;
}

function getRoomNodeWidth(name: string): number {
  return Math.max(ROOM_WIDTH, Math.round((name.length * ROOM_TEXT_CHAR_WIDTH) + ROOM_HORIZONTAL_PADDING));
}

function getRoomScreenGeometry(room: Room, panOffset: PanOffset, canvasRect: DOMRect | null): RoomScreenGeometry {
  const width = getRoomNodeWidth(room.name);
  const left = (canvasRect?.left ?? 0) + room.position.x + panOffset.x;
  const top = (canvasRect?.top ?? 0) + room.position.y + panOffset.y;

  return {
    left,
    top,
    width,
    height: ROOM_HEIGHT,
    centerX: left + (width / 2),
  };
}

function getSelectionBounds(selectionBox: SelectionBox): { left: number; top: number; width: number; height: number } {
  const left = Math.min(selectionBox.startX, selectionBox.currentX);
  const top = Math.min(selectionBox.startY, selectionBox.currentY);
  const width = Math.abs(selectionBox.currentX - selectionBox.startX);
  const height = Math.abs(selectionBox.currentY - selectionBox.startY);

  return { left, top, width, height };
}

function getRoomsWithinSelectionBox(
  rooms: readonly Room[],
  panOffset: PanOffset,
  canvasRect: DOMRect | null,
  selectionBox: SelectionBox,
): string[] {
  const bounds = getSelectionBounds(selectionBox);
  const boxRight = bounds.left + bounds.width;
  const boxBottom = bounds.top + bounds.height;

  return rooms
    .filter((room) => {
      const geometry = getRoomScreenGeometry(room, panOffset, canvasRect);
      const roomLeft = geometry.left - (canvasRect?.left ?? 0);
      const roomTop = geometry.top - (canvasRect?.top ?? 0);
      const roomRight = roomLeft + geometry.width;
      const roomBottom = roomTop + geometry.height;

      return roomLeft <= boxRight
        && roomRight >= bounds.left
        && roomTop <= boxBottom
        && roomBottom >= bounds.top;
    })
    .map((room) => room.id);
}

function isPointWithinBounds(
  point: { x: number; y: number },
  bounds: { left: number; top: number; width: number; height: number },
): boolean {
  const right = bounds.left + bounds.width;
  const bottom = bounds.top + bounds.height;
  return point.x >= bounds.left && point.x <= right && point.y >= bounds.top && point.y <= bottom;
}

function lineSegmentsIntersect(
  startA: { x: number; y: number },
  endA: { x: number; y: number },
  startB: { x: number; y: number },
  endB: { x: number; y: number },
): boolean {
  const cross = (origin: { x: number; y: number }, p1: { x: number; y: number }, p2: { x: number; y: number }) =>
    ((p1.x - origin.x) * (p2.y - origin.y)) - ((p1.y - origin.y) * (p2.x - origin.x));

  const onSegment = (start: { x: number; y: number }, point: { x: number; y: number }, end: { x: number; y: number }) =>
    point.x >= Math.min(start.x, end.x)
    && point.x <= Math.max(start.x, end.x)
    && point.y >= Math.min(start.y, end.y)
    && point.y <= Math.max(start.y, end.y);

  const d1 = cross(startA, endA, startB);
  const d2 = cross(startA, endA, endB);
  const d3 = cross(startB, endB, startA);
  const d4 = cross(startB, endB, endA);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  if (d1 === 0 && onSegment(startA, startB, endA)) return true;
  if (d2 === 0 && onSegment(startA, endB, endA)) return true;
  if (d3 === 0 && onSegment(startB, startA, endB)) return true;
  if (d4 === 0 && onSegment(startB, endA, endB)) return true;

  return false;
}

function doesPolylineIntersectBounds(
  points: ReturnType<typeof computeConnectionPath>,
  bounds: { left: number; top: number; width: number; height: number },
): boolean {
  if (points.some((point) => isPointWithinBounds(point, bounds))) {
    return true;
  }

  const rectLeft = bounds.left;
  const rectTop = bounds.top;
  const rectRight = bounds.left + bounds.width;
  const rectBottom = bounds.top + bounds.height;
  const rectEdges = [
    [{ x: rectLeft, y: rectTop }, { x: rectRight, y: rectTop }],
    [{ x: rectRight, y: rectTop }, { x: rectRight, y: rectBottom }],
    [{ x: rectRight, y: rectBottom }, { x: rectLeft, y: rectBottom }],
    [{ x: rectLeft, y: rectBottom }, { x: rectLeft, y: rectTop }],
  ] as const;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    if (rectEdges.some(([edgeStart, edgeEnd]) => lineSegmentsIntersect(start, end, edgeStart, edgeEnd))) {
      return true;
    }
  }

  return false;
}

function getConnectionsWithinSelectionBox(
  rooms: Readonly<Record<string, Room>>,
  connections: Readonly<Record<string, Connection>>,
  panOffset: PanOffset,
  selectionBox: SelectionBox,
): string[] {
  const bounds = getSelectionBounds(selectionBox);

  return Object.values(connections)
    .filter((connection) => {
      const sourceRoom = rooms[connection.sourceRoomId];
      const targetRoom = rooms[connection.targetRoomId];
      if (!sourceRoom || !targetRoom) {
        return false;
      }

      const sourceDimensions = { width: getRoomNodeWidth(sourceRoom.name), height: ROOM_HEIGHT };
      const targetDimensions = { width: getRoomNodeWidth(targetRoom.name), height: ROOM_HEIGHT };
      const points = computeConnectionPath(sourceRoom, targetRoom, connection, undefined, sourceDimensions, targetDimensions)
        .map((point) => ({
          x: point.x + panOffset.x,
          y: point.y + panOffset.y,
        }));

      return doesPolylineIntersectBounds(points, bounds);
    })
    .map((connection) => connection.id);
}

type ArrowDirection = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

interface RoomCenter {
  readonly x: number;
  readonly y: number;
}

function getRoomCenter(room: Room): RoomCenter {
  return {
    x: room.position.x + (getRoomNodeWidth(room.name) / 2),
    y: room.position.y + (ROOM_HEIGHT / 2),
  };
}

function getDirectionalScore(
  direction: ArrowDirection,
  source: RoomCenter,
  candidate: RoomCenter,
): number | null {
  const dx = candidate.x - source.x;
  const dy = candidate.y - source.y;
  const offAxisPenalty = 2;

  switch (direction) {
    case 'ArrowRight':
      if (dx <= 0) {
        return null;
      }
      if (Math.abs(dy) > dx) {
        return null;
      }
      return dx + (Math.abs(dy) * offAxisPenalty);
    case 'ArrowLeft':
      if (dx >= 0) {
        return null;
      }
      if (Math.abs(dy) > Math.abs(dx)) {
        return null;
      }
      return Math.abs(dx) + (Math.abs(dy) * offAxisPenalty);
    case 'ArrowDown':
      if (dy <= 0) {
        return null;
      }
      if (Math.abs(dx) > dy) {
        return null;
      }
      return dy + (Math.abs(dx) * offAxisPenalty);
    case 'ArrowUp':
      if (dy >= 0) {
        return null;
      }
      if (Math.abs(dx) > Math.abs(dy)) {
        return null;
      }
      return Math.abs(dy) + (Math.abs(dx) * offAxisPenalty);
  }
}

function findNearestRoomInDirection(
  rooms: readonly Room[],
  selectedRoomId: string,
  direction: ArrowDirection,
): Room | null {
  const sourceRoom = rooms.find((room) => room.id === selectedRoomId);
  if (!sourceRoom) {
    return null;
  }

  const sourceCenter = getRoomCenter(sourceRoom);
  let bestMatch: { room: Room; score: number } | null = null;

  for (const room of rooms) {
    if (room.id === selectedRoomId) {
      continue;
    }

    const score = getDirectionalScore(direction, sourceCenter, getRoomCenter(room));
    if (score === null) {
      continue;
    }

    if (!bestMatch || score < bestMatch.score) {
      bestMatch = { room, score };
    }
  }

  return bestMatch?.room ?? null;
}

function getPanDeltaToRevealRoom(
  room: Room,
  panOffset: PanOffset,
  canvasRect: DOMRect | null,
): PanOffset {
  const roomGeometry = getRoomScreenGeometry(room, panOffset, canvasRect);
  const canvasWidth = canvasRect?.width ?? 0;
  const canvasHeight = canvasRect?.height ?? 0;
  const roomLeft = roomGeometry.left - (canvasRect?.left ?? 0);
  const roomTop = roomGeometry.top - (canvasRect?.top ?? 0);
  const roomRight = roomLeft + roomGeometry.width;
  const roomBottom = roomTop + roomGeometry.height;

  let dx = 0;
  let dy = 0;

  if (roomLeft < ROOM_VISIBILITY_PADDING) {
    dx = ROOM_VISIBILITY_PADDING - roomLeft;
  } else if (roomRight > (canvasWidth - ROOM_VISIBILITY_PADDING)) {
    dx = (canvasWidth - ROOM_VISIBILITY_PADDING) - roomRight;
  }

  if (roomTop < ROOM_VISIBILITY_PADDING) {
    dy = ROOM_VISIBILITY_PADDING - roomTop;
  } else if (roomBottom > (canvasHeight - ROOM_VISIBILITY_PADDING)) {
    dy = (canvasHeight - ROOM_VISIBILITY_PADDING) - roomBottom;
  }

  return { x: dx, y: dy };
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.isContentEditable
    || target instanceof HTMLInputElement
    || target instanceof HTMLTextAreaElement
    || target instanceof HTMLSelectElement;
}

function getOctagonPoints(width: number, height: number): string {
  const insetX = Math.min(12, width * 0.18);
  const insetY = Math.min(10, height * 0.28);
  return [
    `${insetX},0`,
    `${width - insetX},0`,
    `${width},${insetY}`,
    `${width},${height - insetY}`,
    `${width - insetX},${height}`,
    `${insetX},${height}`,
    `0,${height - insetY}`,
    `0,${insetY}`,
  ].join(' ');
}

function getRoomStrokeDasharray(strokeStyle: RoomStrokeStyle): string | undefined {
  if (strokeStyle === 'dashed') {
    return '8 5';
  }

  if (strokeStyle === 'dotted') {
    return '2 4';
  }

  return undefined;
}

function getDocumentTheme(): ThemeMode {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function useDocumentTheme(): ThemeMode {
  const [theme, setTheme] = useState<ThemeMode>(getDocumentTheme);

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(getDocumentTheme());
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });

    return () => {
      observer.disconnect();
    };
  }, []);

  return theme;
}

function renderRoomShape(
  shape: RoomShape,
  width: number,
  height: number,
  roomStyle?: Pick<Room, 'fillColorIndex' | 'strokeColorIndex' | 'strokeStyle'>,
  theme: ThemeMode = 'light',
): React.JSX.Element {
  const shapeStyleProps = roomStyle ? {
    style: {
      fill: getRoomFillColor(roomStyle.fillColorIndex, theme),
      stroke: getRoomStrokeColor(roomStyle.strokeColorIndex, theme),
      strokeDasharray: getRoomStrokeDasharray(roomStyle.strokeStyle),
    },
  } : undefined;

  if (shape === 'diamond') {
    return (
      <polygon
        className="room-node-shape"
        points={`${width / 2},0 ${width},${height / 2} ${width / 2},${height} 0,${height / 2}`}
        {...shapeStyleProps}
      />
    );
  }

  if (shape === 'oval') {
    return (
      <ellipse
        className="room-node-shape"
        cx={width / 2}
        cy={height / 2}
        rx={width / 2}
        ry={height / 2}
        {...shapeStyleProps}
      />
    );
  }

  if (shape === 'octagon') {
    return (
      <polygon
        className="room-node-shape"
        points={getOctagonPoints(width, height)}
        {...shapeStyleProps}
      />
    );
  }

  return (
    <rect
      className="room-node-shape"
      x={0}
      y={0}
      width={width}
      height={height}
      rx={ROOM_CORNER_RADIUS}
      ry={ROOM_CORNER_RADIUS}
      {...shapeStyleProps}
    />
  );
}

function DirectionHandles({ roomWidth, roomHeight, roomShape, onHandleMouseDown }: DirectionHandlesProps): React.JSX.Element {
  return (
    <>
      {DIRECTION_HANDLES.map((dir) => {
        const handleOffset = getHandleOffset(normalizeDirection(dir), { width: roomWidth, height: roomHeight }, roomShape);
        if (!handleOffset) {
          return null;
        }

        return (
          <circle
            key={dir}
            className="direction-handle"
            data-testid={`direction-handle-${dir}`}
            data-direction={dir}
            cx={handleOffset.x}
            cy={handleOffset.y}
            r={HANDLE_RADIUS}
            onMouseDown={(e) => {
              if (onHandleMouseDown) {
                e.stopPropagation();
                onHandleMouseDown(dir, e);
              }
            }}
          />
        );
      })}
    </>
  );
}

/* ---- Room node ---- */

interface RoomNodeProps {
  room: Room;
  theme: ThemeMode;
  isSelected: boolean;
  isRoomEditorOpen: boolean;
  onOpenRoomEditor: (roomId: string) => void;
  toMapPoint: (clientX: number, clientY: number) => PanOffset;
}

function RoomNode({ room, theme, isSelected, isRoomEditorOpen, onOpenRoomEditor, toMapPoint }: RoomNodeProps): React.JSX.Element {
  const [hovered, setHovered] = useState(false);
  const moveRooms = useEditorStore((s) => s.moveRooms);
  const startConnectionDrag = useEditorStore((s) => s.startConnectionDrag);
  const updateConnectionDrag = useEditorStore((s) => s.updateConnectionDrag);
  const completeConnectionDrag = useEditorStore((s) => s.completeConnectionDrag);
  const cancelConnectionDrag = useEditorStore((s) => s.cancelConnectionDrag);
  const startRoomDrag = useEditorStore((s) => s.startRoomDrag);
  const updateRoomDrag = useEditorStore((s) => s.updateRoomDrag);
  const endRoomDrag = useEditorStore((s) => s.endRoomDrag);
  const roomDrag = useEditorStore((s) => s.roomDrag);
  const selectRoom = useEditorStore((s) => s.selectRoom);
  const addRoomToSelection = useEditorStore((s) => s.addRoomToSelection);

  const isDragging = roomDrag !== null && roomDrag.roomIds.includes(room.id);
  const dragOffset = isDragging ? roomDrag : null;

  // Compute visual position: during drag, add offset; otherwise use room.position
  const visualX = dragOffset ? room.position.x + dragOffset.dx : room.position.x;
  const visualY = dragOffset ? room.position.y + dragOffset.dy : room.position.y;
  const roomWidth = getRoomNodeWidth(room.name);

  const openRoomEditor = useCallback(() => {
    onOpenRoomEditor(room.id);
  }, [onOpenRoomEditor, room.id]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (e.button !== 0 || isRoomEditorOpen) return;

      e.preventDefault();
      e.stopPropagation();
      const canvasElement = e.currentTarget.closest('[data-testid="map-canvas"]');
      if (canvasElement instanceof HTMLDivElement) {
        canvasElement.focus();
      }

      const startX = e.clientX;
      const startY = e.clientY;
      const draggedRoomIds = isSelected
        ? useEditorStore.getState().selectedRoomIds
        : [room.id];

      startRoomDrag(room.id);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const dx = moveEvent.clientX - startX;
        const dy = moveEvent.clientY - startY;
        updateRoomDrag(dx, dy);
      };

      const handleMouseUp = (upEvent: MouseEvent) => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);

        const dx = upEvent.clientX - startX;
        const dy = upEvent.clientY - startY;
        endRoomDrag();

        if (dx !== 0 || dy !== 0) {
          const nextPositions = Object.fromEntries(
            draggedRoomIds.flatMap((draggedRoomId) => {
              const draggedRoom = useEditorStore.getState().doc?.rooms[draggedRoomId];
              if (!draggedRoom) {
                return [];
              }

              return [[draggedRoomId, {
                x: draggedRoom.position.x + dx,
                y: draggedRoom.position.y + dy,
              }]];
            }),
          );
          moveRooms(nextPositions);
        } else if (upEvent.shiftKey) {
          addRoomToSelection(room.id);
        } else {
          selectRoom(room.id);
        }
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [addRoomToSelection, endRoomDrag, isRoomEditorOpen, isSelected, moveRooms, room.id, selectRoom, startRoomDrag, updateRoomDrag],
  );

  const handleDirectionMouseDown = useCallback(
    (direction: string, e: React.MouseEvent) => {
      if (e.button !== 0 || isRoomEditorOpen) return;
      e.preventDefault();

      const startPoint = toMapPoint(e.clientX, e.clientY);

      startConnectionDrag(room.id, direction, startPoint.x, startPoint.y);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const cursorPoint = toMapPoint(moveEvent.clientX, moveEvent.clientY);
        updateConnectionDrag(cursorPoint.x, cursorPoint.y);
      };

      const handleMouseUp = (upEvent: MouseEvent) => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);

        // Check if we released on a room node (or a direction handle within one)
        const target = upEvent.target as Element | null;
        const roomEl = target?.closest?.('[data-room-id]') as HTMLElement | null;
        if (roomEl) {
          const targetRoomId = roomEl.getAttribute('data-room-id')!;
          // If dropped directly on a direction handle, use that direction
          const handleEl = target?.closest?.('[data-direction]') as HTMLElement | null;
          const targetDir = handleEl?.getAttribute('data-direction') ?? undefined;
          completeConnectionDrag(targetRoomId, targetDir);
        } else {
          cancelConnectionDrag();
        }
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [room.id, isRoomEditorOpen, startConnectionDrag, updateConnectionDrag, completeConnectionDrag, cancelConnectionDrag, toMapPoint],
  );

  return (
    <>
      <svg
        className={`room-node${isDragging ? ' room-node--dragging' : ''}`}
        data-testid="room-node"
        data-room-id={room.id}
        data-room-shape={room.shape}
        width={roomWidth}
        height={ROOM_HEIGHT}
        style={{ transform: `translate(${visualX}px, ${visualY}px)` }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onMouseDown={handleMouseDown}
        onDoubleClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          openRoomEditor();
        }}
      >
        {isSelected && (
          <rect
            className="room-selection-outline"
            data-testid="room-selection-outline"
            x={-4}
            y={-4}
            width={roomWidth + 8}
            height={ROOM_HEIGHT + 8}
            rx={12}
            ry={12}
          />
        )}
        {renderRoomShape(room.shape, roomWidth, ROOM_HEIGHT, room, theme)}
        <text
          className="room-node-name"
          x={roomWidth / 2}
          y={ROOM_HEIGHT / 2}
          dominantBaseline="middle"
          textAnchor="middle"
        >
          {room.name}
        </text>
        {hovered && !isDragging && !isRoomEditorOpen && (
          <DirectionHandles
            roomWidth={roomWidth}
            roomHeight={ROOM_HEIGHT}
            roomShape={room.shape}
            onHandleMouseDown={handleDirectionMouseDown}
          />
        )}
      </svg>
    </>
  );
}

/* ---- Connection lines ---- */

/**
 * Apply a drag offset to a room's position if it's currently being dragged.
 */
function applyDragOffset(room: Room, roomDrag: { roomIds: readonly string[]; dx: number; dy: number } | null): Room {
  if (!roomDrag || !roomDrag.roomIds.includes(room.id)) return room;
  return {
    ...room,
    position: {
      x: room.position.x + roomDrag.dx,
      y: room.position.y + roomDrag.dy,
    },
  };
}

interface VectorPoint {
  readonly x: number;
  readonly y: number;
}

function getSegmentLength(start: VectorPoint, end: VectorPoint): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

function getLongestSegment(points: readonly VectorPoint[]): { start: VectorPoint; end: VectorPoint } | null {
  let bestSegment: { start: VectorPoint; end: VectorPoint } | null = null;
  let bestLength = -1;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const length = getSegmentLength(start, end);
    if (length > bestLength) {
      bestLength = length;
      bestSegment = { start, end };
    }
  }

  return bestSegment;
}

function getAnnotationGeometry(
  segment: { start: VectorPoint; end: VectorPoint },
  reverseDirection: boolean,
): {
  lineStart: VectorPoint;
  lineEnd: VectorPoint;
  arrowTip: VectorPoint;
  arrowBaseCenter: VectorPoint;
  arrowBaseA: VectorPoint;
  arrowBaseB: VectorPoint;
  textPosition: VectorPoint;
  rotationDegrees: number;
} | null {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return null;
  }

  const ux = dx / length;
  const uy = dy / length;
  const directionX = reverseDirection ? -ux : ux;
  const directionY = reverseDirection ? -uy : uy;
  const normalX = -uy;
  const normalY = ux;
  const centerX = (segment.start.x + segment.end.x) / 2;
  const centerY = (segment.start.y + segment.end.y) / 2;
  const annotationCenterX = centerX + (normalX * CONNECTION_ANNOTATION_OFFSET);
  const annotationCenterY = centerY + (normalY * CONNECTION_ANNOTATION_OFFSET);
  const annotationLength = length * CONNECTION_ANNOTATION_LENGTH_RATIO;
  const halfLength = annotationLength / 2;
  const lineStart = {
    x: annotationCenterX - (directionX * halfLength),
    y: annotationCenterY - (directionY * halfLength),
  };
  const lineEnd = {
    x: annotationCenterX + (directionX * halfLength),
    y: annotationCenterY + (directionY * halfLength),
  };
  const arrowTip = lineEnd;
  const arrowBaseCenter = {
    x: arrowTip.x - (directionX * CONNECTION_ANNOTATION_ARROWHEAD_LENGTH),
    y: arrowTip.y - (directionY * CONNECTION_ANNOTATION_ARROWHEAD_LENGTH),
  };
  const arrowBaseA = {
    x: arrowBaseCenter.x + (normalX * (CONNECTION_ANNOTATION_ARROWHEAD_WIDTH / 2)),
    y: arrowBaseCenter.y + (normalY * (CONNECTION_ANNOTATION_ARROWHEAD_WIDTH / 2)),
  };
  const arrowBaseB = {
    x: arrowBaseCenter.x - (normalX * (CONNECTION_ANNOTATION_ARROWHEAD_WIDTH / 2)),
    y: arrowBaseCenter.y - (normalY * (CONNECTION_ANNOTATION_ARROWHEAD_WIDTH / 2)),
  };
  const textPosition = {
    x: annotationCenterX + (normalX * CONNECTION_ANNOTATION_TEXT_OFFSET),
    y: annotationCenterY + (normalY * CONNECTION_ANNOTATION_TEXT_OFFSET),
  };
  const rotationDegrees = (Math.atan2(directionY, directionX) * 180) / Math.PI;

  return {
    lineStart,
    lineEnd,
    arrowTip,
    arrowBaseCenter,
    arrowBaseA,
    arrowBaseB,
    textPosition,
    rotationDegrees,
  };
}

function getSelfAnnotationPosition(points: readonly VectorPoint[]): VectorPoint | null {
  if (points.length === 0) {
    return null;
  }

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
  }

  return {
    x: maxX + CONNECTION_ANNOTATION_OFFSET,
    y: minY - CONNECTION_ANNOTATION_OFFSET,
  };
}

function ConnectionLines({ rooms, connections, onOpenConnectionEditor, theme }: {
  rooms: Readonly<Record<string, Room>>;
  connections: Readonly<Record<string, Connection>>;
  onOpenConnectionEditor: (connectionId: string) => void;
  theme: ThemeMode;
}): React.JSX.Element {
  const connectionDrag = useEditorStore((s) => s.connectionDrag);
  const roomDrag = useEditorStore((s) => s.roomDrag);
  const selectedConnectionIds = useEditorStore((s) => s.selectedConnectionIds);
  const selectConnection = useEditorStore((s) => s.selectConnection);
  const addConnectionToSelection = useEditorStore((s) => s.addConnectionToSelection);
  const entries = Object.values(connections);

  const renderConnectionLine = (
    conn: Connection,
    points: ReturnType<typeof computeConnectionPath>,
    isSelfConnection: boolean,
  ): React.JSX.Element => {
    const isSelected = selectedConnectionIds.includes(conn.id);
    const baseClassName = isSelfConnection ? 'connection-line connection-line--self' : 'connection-line';
    const annotationKind = conn.annotation?.kind;
    const rendersVerticalAnnotation = annotationKind === 'up' || annotationKind === 'down';
    const annotationLabel = rendersVerticalAnnotation ? 'up' : annotationKind;
    const annotationSegment = rendersVerticalAnnotation && !isSelfConnection ? getLongestSegment(points) : null;
    const annotationGeometry = annotationSegment
      ? getAnnotationGeometry(annotationSegment, annotationKind === 'down')
      : null;
    const selfAnnotationPosition = rendersVerticalAnnotation && isSelfConnection
      ? getSelfAnnotationPosition(points)
      : null;
    const connectionStroke = getRoomStrokeColor(conn.strokeColorIndex, theme);

    return (
      <>
        <polyline
          data-testid={`connection-hit-target-${conn.id}`}
          data-connection-id={conn.id}
          className="connection-hit-target"
          points={pointsToSvgString(points)}
          fill="none"
          stroke="transparent"
          strokeWidth="18"
          style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
          onClick={(e) => {
            e.stopPropagation();
            if (e.shiftKey) {
              addConnectionToSelection(conn.id);
            } else {
              selectConnection(conn.id);
            }
          }}
          onDoubleClick={(e) => {
            e.stopPropagation();
            selectConnection(conn.id);
            onOpenConnectionEditor(conn.id);
          }}
        />
        <polyline
          data-testid={`connection-line-${conn.id}`}
          className={`${baseClassName}${isSelected ? ' connection-line--selected' : ''}`}
          points={pointsToSvgString(points)}
          fill="none"
          style={{
            stroke: connectionStroke,
            strokeWidth: isSelected ? 6 : 2,
            strokeDasharray: getRoomStrokeDasharray(conn.strokeStyle),
            pointerEvents: 'none',
          }}
        />
        {isSelected && (
          <polyline
            data-testid={`connection-selection-inner-${conn.id}`}
            className="connection-line connection-line--selected-inner"
            points={pointsToSvgString(points)}
            fill="none"
            style={{
              stroke: '#f59e0b',
              strokeWidth: 2,
              pointerEvents: 'none',
            }}
          />
        )}
        {annotationGeometry && (
          <>
            <line
              data-testid={`connection-annotation-line-${conn.id}`}
              className="connection-annotation-line"
              x1={annotationGeometry.lineStart.x}
              y1={annotationGeometry.lineStart.y}
              x2={annotationGeometry.lineEnd.x}
              y2={annotationGeometry.lineEnd.y}
              stroke={connectionStroke}
              strokeWidth="2"
              pointerEvents="none"
            />
            <polygon
              data-testid={`connection-annotation-arrow-${conn.id}`}
              className="connection-annotation-arrow"
              points={pointsToSvgString([
                annotationGeometry.arrowTip,
                annotationGeometry.arrowBaseA,
                annotationGeometry.arrowBaseB,
              ])}
              fill={connectionStroke}
              pointerEvents="none"
            />
            <text
              data-testid={`connection-annotation-text-${conn.id}`}
              className="connection-annotation-text"
              x={annotationGeometry.textPosition.x}
              y={annotationGeometry.textPosition.y}
              textAnchor="middle"
              dominantBaseline="middle"
            >
              {annotationLabel}
            </text>
          </>
        )}
        {selfAnnotationPosition && (
          <text
            data-testid={`connection-annotation-text-${conn.id}`}
            className="connection-annotation-text"
            x={selfAnnotationPosition.x}
            y={selfAnnotationPosition.y}
            textAnchor="start"
            dominantBaseline="middle"
          >
            {annotationLabel}
          </text>
        )}
      </>
    );
  };

  return (
    <svg
      className="connection-svg-overlay"
      data-testid="connection-svg-overlay"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        zIndex: 2,
      }}
    >
      {entries.map((conn) => {
        const rawSrc = rooms[conn.sourceRoomId];
        const rawTgt = rooms[conn.targetRoomId];
        if (!rawSrc || !rawTgt) return null;

        // Apply drag offset for real-time edge update
        const src = applyDragOffset(rawSrc, roomDrag);
        const tgt = applyDragOffset(rawTgt, roomDrag);
        const srcDimensions = { width: getRoomNodeWidth(src.name), height: ROOM_HEIGHT };
        const tgtDimensions = { width: getRoomNodeWidth(tgt.name), height: ROOM_HEIGHT };

        if (conn.sourceRoomId === conn.targetRoomId) {
          // Self-connection: render a loop via the connection path
          const points = computeConnectionPath(src, tgt, conn, undefined, srcDimensions, tgtDimensions);
          const arrowPointSets = !conn.isBidirectional ? computeSegmentArrowheadPoints(points) : [];
          return (
            <g key={conn.id}>
              {renderConnectionLine(conn, points, true)}
              {arrowPointSets.map((arrowPoints, index) => (
                <polygon
                  key={`${conn.id}-arrow-${index}`}
                  data-testid={`connection-arrow-${conn.id}-${index}`}
                  points={pointsToSvgString(arrowPoints)}
                  fill={getRoomStrokeColor(conn.strokeColorIndex, theme)}
                />
              ))}
            </g>
          );
        }

        const points = computeConnectionPath(src, tgt, conn, undefined, srcDimensions, tgtDimensions);
        const arrowPointSets = !conn.isBidirectional ? computeSegmentArrowheadPoints(points) : [];
        return (
          <g key={conn.id}>
            {renderConnectionLine(conn, points, false)}
            {arrowPointSets.map((arrowPoints, index) => (
              <polygon
                key={`${conn.id}-arrow-${index}`}
                data-testid={`connection-arrow-${conn.id}-${index}`}
                points={pointsToSvgString(arrowPoints)}
                fill={getRoomStrokeColor(conn.strokeColorIndex, theme)}
              />
            ))}
          </g>
        );
      })}

      {connectionDrag && (() => {
        const srcRoom = rooms[connectionDrag.sourceRoomId];
        if (!srcRoom) return null;
        const adjustedSrc = applyDragOffset(srcRoom, roomDrag);
        const srcDimensions = { width: getRoomNodeWidth(adjustedSrc.name), height: ROOM_HEIGHT };
        const points = computePreviewPath(
          adjustedSrc,
          connectionDrag.sourceDirection,
          connectionDrag.cursorX,
          connectionDrag.cursorY,
          undefined,
          srcDimensions,
        );
        return (
          <polyline
            data-testid="connection-preview-line"
            className="connection-preview-line"
            points={pointsToSvgString(points)}
            fill="none"
            stroke="#6366f1"
            strokeWidth="2"
            strokeDasharray="6 4"
            opacity="0.6"
          />
        );
      })()}
    </svg>
  );
}

/* ---- Canvas ---- */

export function MapCanvas({ mapName, showGrid: initialShowGrid = true }: MapCanvasProps): React.JSX.Element {
  const [showGrid, setShowGrid] = useState(initialShowGrid);
  const [roomEditorId, setRoomEditorId] = useState<string | null>(null);
  const [connectionEditorId, setConnectionEditorId] = useState<string | null>(null);
  const [panOffset, setPanOffset] = useState<PanOffset>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isAutoPanning, setIsAutoPanning] = useState(false);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const doc = useEditorStore((s) => s.doc);
  const selectedRoomIds = useEditorStore((s) => s.selectedRoomIds);
  const clearSelection = useEditorStore((s) => s.clearSelection);
  const addRoomAtPosition = useEditorStore((s) => s.addRoomAtPosition);
  const setSelection = useEditorStore((s) => s.setSelection);
  const removeSelectedRooms = useEditorStore((s) => s.removeSelectedRooms);
  const removeSelectedConnections = useEditorStore((s) => s.removeSelectedConnections);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const connectionDrag = useEditorStore((s) => s.connectionDrag);
  const canvasRef = useRef<HTMLDivElement>(null);
  const panOffsetRef = useRef<PanOffset>({ x: 0, y: 0 });
  const autoPanTimeoutRef = useRef<number | null>(null);
  const suppressCanvasClickRef = useRef(false);
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);
  const theme = useDocumentTheme();

  const rooms = doc ? Object.values(doc.rooms) : [];

  useEffect(() => {
    panOffsetRef.current = panOffset;
  }, [panOffset]);

  useEffect(() => {
    if (!canvasRef.current) {
      return;
    }

    const updateCanvasRect = () => {
      if (canvasRef.current) {
        setCanvasRect(canvasRef.current.getBoundingClientRect());
      }
    };

    updateCanvasRect();
    window.addEventListener('resize', updateCanvasRect);

    return () => {
      window.removeEventListener('resize', updateCanvasRect);
    };
  }, []);

  useEffect(() => () => {
    if (autoPanTimeoutRef.current !== null) {
      window.clearTimeout(autoPanTimeoutRef.current);
    }
  }, []);

  const toMapPoint = useCallback((clientX: number, clientY: number): PanOffset => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const left = rect?.left ?? 0;
    const top = rect?.top ?? 0;

    return {
      x: clientX - left - panOffset.x,
      y: clientY - top - panOffset.y,
    };
  }, [panOffset.x, panOffset.y]);

  const closeRoomEditor = useCallback(() => {
    setRoomEditorId(null);
    requestAnimationFrame(() => {
      canvasRef.current?.focus();
    });
  }, []);

  const closeConnectionEditor = useCallback(() => {
    setConnectionEditorId(null);
    requestAnimationFrame(() => {
      canvasRef.current?.focus();
    });
  }, []);

  const closeRoomEditorFromBackdrop = useCallback(() => {
    clearSelection();
    closeRoomEditor();
  }, [clearSelection, closeRoomEditor]);

  const closeConnectionEditorFromBackdrop = useCallback(() => {
    clearSelection();
    closeConnectionEditor();
  }, [clearSelection, closeConnectionEditor]);

  const startAutoPanAnimation = useCallback(() => {
    setIsAutoPanning(true);

    if (autoPanTimeoutRef.current !== null) {
      window.clearTimeout(autoPanTimeoutRef.current);
    }

    autoPanTimeoutRef.current = window.setTimeout(() => {
      setIsAutoPanning(false);
      autoPanTimeoutRef.current = null;
    }, AUTO_PAN_ANIMATION_MS);
  }, []);

  const panToRoomEditorPosition = useCallback((roomId: string) => {
    const canvasEl = canvasRef.current;
    const room = useEditorStore.getState().doc?.rooms[roomId];
    if (!canvasEl || !room) {
      return;
    }

    const canvasRect = canvasEl.getBoundingClientRect();
    const canvasWidth = canvasRect.width || canvasEl.clientWidth;
    const canvasHeight = canvasRect.height || canvasEl.clientHeight;
    const roomGeometry = getRoomScreenGeometry(room, panOffsetRef.current, canvasRect);
    const roomCenterX = roomGeometry.centerX - canvasRect.left;
    const roomTopY = roomGeometry.top - canvasRect.top;

    const targetCenterX = canvasWidth / 2;
    const targetTopY = canvasHeight / 3;

    startAutoPanAnimation();
    setPanOffset((prev) => ({
      x: prev.x + (targetCenterX - roomCenterX),
      y: prev.y + (targetTopY - roomTopY),
    }));
  }, [startAutoPanAnimation]);

  const openRoomEditor = useCallback((roomId: string) => {
    setConnectionEditorId(null);
    panToRoomEditorPosition(roomId);
    setRoomEditorId(roomId);
  }, [panToRoomEditorPosition]);

  const openConnectionEditor = useCallback((connectionId: string) => {
    setRoomEditorId(null);
    setConnectionEditorId(connectionId);
  }, []);

  const panRoomIntoView = useCallback((room: Room) => {
    const currentCanvasRect = canvasRef.current?.getBoundingClientRect() ?? canvasRect;
    const delta = getPanDeltaToRevealRoom(room, panOffsetRef.current, currentCanvasRect);

    if (delta.x === 0 && delta.y === 0) {
      return;
    }

    startAutoPanAnimation();
    setPanOffset((prev) => ({
      x: prev.x + delta.x,
      y: prev.y + delta.y,
    }));
  }, [canvasRect, startAutoPanAnimation]);

  const handleCanvasSelectionMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.shiftKey || roomEditorId !== null || connectionEditorId !== null || connectionDrag !== null) {
      return;
    }

    const target = e.target as Element | null;
    if (target?.closest('[data-room-id], [data-connection-id], .map-canvas-header')) {
      return;
    }

    e.preventDefault();

    const initialSelectionBox: SelectionBox = {
      startX: e.clientX - (canvasRect?.left ?? 0),
      startY: e.clientY - (canvasRect?.top ?? 0),
      currentX: e.clientX - (canvasRect?.left ?? 0),
      currentY: e.clientY - (canvasRect?.top ?? 0),
    };

    setSelectionBox(initialSelectionBox);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const nextSelectionBox: SelectionBox = {
        startX: initialSelectionBox.startX,
        startY: initialSelectionBox.startY,
        currentX: moveEvent.clientX - (canvasRect?.left ?? 0),
        currentY: moveEvent.clientY - (canvasRect?.top ?? 0),
      };

      setSelectionBox(nextSelectionBox);
        setSelection(
          getRoomsWithinSelectionBox(rooms, panOffsetRef.current, canvasRect, nextSelectionBox),
          doc ? getConnectionsWithinSelectionBox(doc.rooms, doc.connections, panOffsetRef.current, nextSelectionBox) : [],
        );
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      const finalSelectionBox: SelectionBox = {
        startX: initialSelectionBox.startX,
        startY: initialSelectionBox.startY,
        currentX: upEvent.clientX - (canvasRect?.left ?? 0),
        currentY: upEvent.clientY - (canvasRect?.top ?? 0),
      };
      const bounds = getSelectionBounds(finalSelectionBox);
      const didDrag = bounds.width > 0 || bounds.height > 0;

      if (didDrag) {
        suppressCanvasClickRef.current = true;
        setSelection(
          getRoomsWithinSelectionBox(rooms, panOffsetRef.current, canvasRect, finalSelectionBox),
          doc ? getConnectionsWithinSelectionBox(doc.rooms, doc.connections, panOffsetRef.current, finalSelectionBox) : [],
        );
      }

      setSelectionBox(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [canvasRect, connectionDrag, connectionEditorId, doc, roomEditorId, rooms, setSelection]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 1 || roomEditorId !== null || connectionEditorId !== null || connectionDrag !== null) {
      return;
    }

    const target = e.target as Element | null;
    if (target?.closest('[data-room-id], [data-connection-id], .map-canvas-header')) {
      return;
    }

    e.preventDefault();

    const startX = e.clientX;
    const startY = e.clientY;
    const startPan = panOffsetRef.current;

    if (autoPanTimeoutRef.current !== null) {
      window.clearTimeout(autoPanTimeoutRef.current);
      autoPanTimeoutRef.current = null;
    }
    setIsAutoPanning(false);
    setIsPanning(true);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      setPanOffset({
        x: startPan.x + (moveEvent.clientX - startX),
        y: startPan.y + (moveEvent.clientY - startY),
      });
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      setIsPanning(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [connectionDrag, connectionEditorId, roomEditorId]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (roomEditorId || connectionEditorId) return;

      if (suppressCanvasClickRef.current) {
        suppressCanvasClickRef.current = false;
        return;
      }

      const target = e.target as Element | null;
      if (target?.closest('[data-room-id], [data-connection-id], .map-canvas-header')) {
        return;
      }

      canvasRef.current?.focus();
      clearSelection();
    },
    [clearSelection, connectionEditorId, roomEditorId],
  );

  const handleCanvasDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (roomEditorId || connectionEditorId) return;

      const target = e.target as Element | null;
      if (target?.closest('[data-room-id], [data-connection-id], .map-canvas-header')) {
        return;
      }

      const { x, y } = toMapPoint(e.clientX, e.clientY);
      const roomId = addRoomAtPosition('Room', { x, y });
      openRoomEditor(roomId);
    },
    [addRoomAtPosition, connectionEditorId, openRoomEditor, roomEditorId, toMapPoint],
  );

  const handleCanvasKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (roomEditorId !== null || connectionEditorId !== null || connectionDrag !== null) {
      return;
    }

    if (isEditableTarget(e.target)) {
      return;
    }

    const isUndoShortcut = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'z';
    const isRedoShortcut = (
      (e.ctrlKey || e.metaKey)
      && !e.altKey
      && (
        (e.key.toLowerCase() === 'z' && e.shiftKey)
        || (e.key.toLowerCase() === 'y' && !e.shiftKey)
      )
    );

    if (isRedoShortcut) {
      e.preventDefault();
      redo();
      return;
    }

    if (isUndoShortcut) {
      e.preventDefault();
      undo();
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      const { selectedConnectionIds } = useEditorStore.getState();
      if (selectedRoomIds.length === 0 && selectedConnectionIds.length === 0) {
        return;
      }

      e.preventDefault();
      removeSelectedRooms();
      removeSelectedConnections();
      return;
    }

    if (e.key === 'Enter') {
      if (selectedRoomIds.length !== 1) {
        return;
      }

      e.preventDefault();
      openRoomEditor(selectedRoomIds[0]);
      return;
    }

    if (
      e.key !== 'ArrowUp'
      && e.key !== 'ArrowDown'
      && e.key !== 'ArrowLeft'
      && e.key !== 'ArrowRight'
    ) {
      return;
    }

    if (selectedRoomIds.length === 0) {
      return;
    }

    const nearestRoom = findNearestRoomInDirection(rooms, selectedRoomIds[0], e.key);
    if (!nearestRoom) {
      return;
    }

    e.preventDefault();
    useEditorStore.getState().selectRoom(nearestRoom.id);
    panRoomIntoView(nearestRoom);
  }, [connectionDrag, connectionEditorId, openRoomEditor, panRoomIntoView, redo, removeSelectedConnections, removeSelectedRooms, roomEditorId, rooms, selectedRoomIds, undo]);

  const classes = [
    'map-canvas',
    showGrid ? 'map-canvas--grid' : '',
    isPanning ? 'map-canvas--panning' : '',
    isAutoPanning ? 'map-canvas--grid-animated' : '',
  ]
    .filter(Boolean)
    .join(' ');
  const effectiveCanvasRect = canvasRect ?? canvasRef.current?.getBoundingClientRect() ?? null;

  return (
    <div
      ref={canvasRef}
      className={classes}
      data-testid="map-canvas"
      onMouseDown={(e) => {
        handleCanvasSelectionMouseDown(e);
        handleCanvasMouseDown(e);
      }}
      onClick={handleCanvasClick}
      onDoubleClick={handleCanvasDoubleClick}
      onKeyDown={handleCanvasKeyDown}
      tabIndex={-1}
      style={showGrid ? { backgroundPosition: `${panOffset.x}px ${panOffset.y}px` } : undefined}
    >
      <div
        className={`map-canvas-scene${roomEditorId || connectionEditorId ? ' map-canvas-scene--editor-open' : ''}`}
        data-testid="map-canvas-scene"
      >
        <header className="map-canvas-header">
          <span className="map-canvas-title">{mapName}</span>
          <button
            className="map-canvas-grid-toggle"
            type="button"
            aria-label="Toggle grid"
            title="Toggle grid"
            onClick={() => setShowGrid((prev) => !prev)}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <line x1="0" y1="4" x2="16" y2="4" />
              <line x1="0" y1="8" x2="16" y2="8" />
              <line x1="0" y1="12" x2="16" y2="12" />
              <line x1="4" y1="0" x2="4" y2="16" />
              <line x1="8" y1="0" x2="8" y2="16" />
              <line x1="12" y1="0" x2="12" y2="16" />
            </svg>
          </button>
        </header>

        <div
          className={`map-canvas-content${isAutoPanning ? ' map-canvas-content--animated' : ''}`}
          data-testid="map-canvas-content"
          style={{ transform: `translate(${panOffset.x}px, ${panOffset.y}px)` }}
        >
          {doc && (
            <ConnectionLines
              rooms={doc.rooms}
              connections={doc.connections}
              onOpenConnectionEditor={openConnectionEditor}
              theme={theme}
            />
          )}

          {rooms.map((room) => (
            <RoomNode
              key={room.id}
              room={room}
              theme={theme}
              isSelected={selectedRoomIds.includes(room.id)}
              isRoomEditorOpen={roomEditorId !== null}
              onOpenRoomEditor={openRoomEditor}
              toMapPoint={toMapPoint}
            />
          ))}
        </div>

        {selectionBox && (
          <div
            className="map-canvas-selection-box"
            data-testid="map-canvas-selection-box"
            style={getSelectionBounds(selectionBox)}
          />
        )}
      </div>

      {roomEditorId && (
        <RoomEditorOverlay
          roomId={roomEditorId}
          panOffset={panOffset}
          canvasRect={effectiveCanvasRect}
          theme={theme}
          onClose={closeRoomEditor}
          onBackdropClose={closeRoomEditorFromBackdrop}
        />
      )}
      {connectionEditorId && (
        <ConnectionEditorOverlay
          connectionId={connectionEditorId}
          onClose={closeConnectionEditor}
          onBackdropClose={closeConnectionEditorFromBackdrop}
        />
      )}
    </div>
  );
}
