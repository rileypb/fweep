import { useState, useCallback, useRef, useEffect } from 'react';
import { useEditorStore } from '../state/editor-store';
import { ROOM_SHAPES, type Room, type Connection, type RoomShape } from '../domain/map-types';
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
const ROOM_TEXT_CHAR_WIDTH = 6.78;
const ROOM_HORIZONTAL_PADDING = 24;
const HANDLE_RADIUS = 5;

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
  onClose: () => void;
}

function RoomEditorOverlay({ roomId, panOffset, canvasRect, onClose }: RoomEditorOverlayProps): React.JSX.Element | null {
  const room = useEditorStore((s) => s.doc?.rooms[roomId] ?? null);
  const renameRoom = useEditorStore((s) => s.renameRoom);
  const describeRoom = useEditorStore((s) => s.describeRoom);
  const setRoomShape = useEditorStore((s) => s.setRoomShape);
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
        onClick={onClose}
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
          {renderRoomShape(room.shape, roomGeometry.width, roomGeometry.height)}
        </svg>
        <input
          ref={nameInputRef}
          className="room-name-input room-editor-room-name-input"
          data-testid="room-editor-name-input"
          type="text"
          aria-label="Room name"
          value={room.name}
          onChange={(e) => renameRoom(room.id, e.target.value)}
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
            onChange={(e) => describeRoom(room.id, e.target.value)}
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
                  {renderRoomShape(shape, 44, 28)}
                </svg>
                <span>{shape}</span>
              </button>
            ))}
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

function renderRoomShape(shape: RoomShape, width: number, height: number): React.JSX.Element {
  if (shape === 'diamond') {
    return (
      <polygon
        className="room-node-shape"
        points={`${width / 2},0 ${width},${height / 2} ${width / 2},${height} 0,${height / 2}`}
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
      />
    );
  }

  if (shape === 'octagon') {
    return (
      <polygon
        className="room-node-shape"
        points={getOctagonPoints(width, height)}
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
  isSelected: boolean;
  isRoomEditorOpen: boolean;
  onOpenRoomEditor: (roomId: string) => void;
  toMapPoint: (clientX: number, clientY: number) => PanOffset;
}

function RoomNode({ room, isSelected, isRoomEditorOpen, onOpenRoomEditor, toMapPoint }: RoomNodeProps): React.JSX.Element {
  const [hovered, setHovered] = useState(false);
  const moveRoom = useEditorStore((s) => s.moveRoom);
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
          draggedRoomIds.forEach((draggedRoomId) => {
            const draggedRoom = useEditorStore.getState().doc?.rooms[draggedRoomId];
            if (!draggedRoom) {
              return;
            }

            moveRoom(draggedRoomId, {
              x: draggedRoom.position.x + dx,
              y: draggedRoom.position.y + dy,
            });
          });
        } else if (upEvent.shiftKey) {
          addRoomToSelection(room.id);
        } else {
          selectRoom(room.id);
        }
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [addRoomToSelection, isRoomEditorOpen, isSelected, moveRoom, room.id, selectRoom, startRoomDrag, updateRoomDrag, endRoomDrag],
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
        {renderRoomShape(room.shape, roomWidth, ROOM_HEIGHT)}
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

function ConnectionLines({ rooms, connections }: {
  rooms: Readonly<Record<string, Room>>;
  connections: Readonly<Record<string, Connection>>;
}): React.JSX.Element {
  const connectionDrag = useEditorStore((s) => s.connectionDrag);
  const roomDrag = useEditorStore((s) => s.roomDrag);
  const entries = Object.values(connections);

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
        pointerEvents: 'none',
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
              <polyline
                data-testid={`connection-line-${conn.id}`}
                className="connection-line connection-line--self"
                points={pointsToSvgString(points)}
                fill="none"
                stroke="#6366f1"
                strokeWidth="2"
              />
              {arrowPointSets.map((arrowPoints, index) => (
                <polygon
                  key={`${conn.id}-arrow-${index}`}
                  data-testid={`connection-arrow-${conn.id}-${index}`}
                  points={pointsToSvgString(arrowPoints)}
                  fill="#6366f1"
                />
              ))}
            </g>
          );
        }

        const points = computeConnectionPath(src, tgt, conn, undefined, srcDimensions, tgtDimensions);
        const arrowPointSets = !conn.isBidirectional ? computeSegmentArrowheadPoints(points) : [];
        return (
          <g key={conn.id}>
            <polyline
              data-testid={`connection-line-${conn.id}`}
              className="connection-line"
              points={pointsToSvgString(points)}
              fill="none"
              stroke="#6366f1"
              strokeWidth="2"
            />
            {arrowPointSets.map((arrowPoints, index) => (
              <polygon
                key={`${conn.id}-arrow-${index}`}
                data-testid={`connection-arrow-${conn.id}-${index}`}
                points={pointsToSvgString(arrowPoints)}
                fill="#6366f1"
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
  const [panOffset, setPanOffset] = useState<PanOffset>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [isAutoPanning, setIsAutoPanning] = useState(false);
  const [selectionBox, setSelectionBox] = useState<SelectionBox | null>(null);
  const doc = useEditorStore((s) => s.doc);
  const selectedRoomIds = useEditorStore((s) => s.selectedRoomIds);
  const addRoomAtPosition = useEditorStore((s) => s.addRoomAtPosition);
  const clearRoomSelection = useEditorStore((s) => s.clearRoomSelection);
  const setSelectedRoomIds = useEditorStore((s) => s.setSelectedRoomIds);
  const removeSelectedRooms = useEditorStore((s) => s.removeSelectedRooms);
  const connectionDrag = useEditorStore((s) => s.connectionDrag);
  const canvasRef = useRef<HTMLDivElement>(null);
  const panOffsetRef = useRef<PanOffset>({ x: 0, y: 0 });
  const autoPanTimeoutRef = useRef<number | null>(null);
  const suppressCanvasClickRef = useRef(false);
  const [canvasRect, setCanvasRect] = useState<DOMRect | null>(null);

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

    setIsAutoPanning(true);
    setPanOffset((prev) => ({
      x: prev.x + (targetCenterX - roomCenterX),
      y: prev.y + (targetTopY - roomTopY),
    }));

    if (autoPanTimeoutRef.current !== null) {
      window.clearTimeout(autoPanTimeoutRef.current);
    }

    autoPanTimeoutRef.current = window.setTimeout(() => {
      setIsAutoPanning(false);
      autoPanTimeoutRef.current = null;
    }, AUTO_PAN_ANIMATION_MS);
  }, []);

  const openRoomEditor = useCallback((roomId: string) => {
    panToRoomEditorPosition(roomId);
    setRoomEditorId(roomId);
  }, [panToRoomEditorPosition]);

  const handleCanvasSelectionMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.shiftKey || roomEditorId !== null || connectionDrag !== null) {
      return;
    }

    const target = e.target as Element | null;
    if (target?.closest('[data-room-id], .map-canvas-header')) {
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
      setSelectedRoomIds(getRoomsWithinSelectionBox(rooms, panOffsetRef.current, canvasRect, nextSelectionBox));
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
        setSelectedRoomIds(getRoomsWithinSelectionBox(rooms, panOffsetRef.current, canvasRect, finalSelectionBox));
      }

      setSelectionBox(null);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [canvasRect, connectionDrag, roomEditorId, rooms, setSelectedRoomIds]);

  const handleCanvasMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 1 || roomEditorId !== null || connectionDrag !== null) {
      return;
    }

    const target = e.target as Element | null;
    if (target?.closest('[data-room-id], .map-canvas-header')) {
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
  }, [connectionDrag, roomEditorId]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (roomEditorId) return;

      if (suppressCanvasClickRef.current) {
        suppressCanvasClickRef.current = false;
        return;
      }

      const target = e.target as Element | null;
      if (target?.closest('[data-room-id], .map-canvas-header')) {
        return;
      }

      canvasRef.current?.focus();

      if (!e.shiftKey) {
        clearRoomSelection();
        return;
      }

      const { x, y } = toMapPoint(e.clientX, e.clientY);

      const roomId = addRoomAtPosition('Room', { x, y });
      openRoomEditor(roomId);
    },
    [addRoomAtPosition, clearRoomSelection, openRoomEditor, roomEditorId, toMapPoint],
  );

  const handleCanvasKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (roomEditorId !== null || connectionDrag !== null) {
      return;
    }

    if (isEditableTarget(e.target)) {
      return;
    }

    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (selectedRoomIds.length === 0) {
        return;
      }

      e.preventDefault();
      removeSelectedRooms();
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
  }, [connectionDrag, openRoomEditor, removeSelectedRooms, roomEditorId, rooms, selectedRoomIds]);

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
      onKeyDown={handleCanvasKeyDown}
      tabIndex={-1}
      style={showGrid ? { backgroundPosition: `${panOffset.x}px ${panOffset.y}px` } : undefined}
    >
      <div
        className={`map-canvas-scene${roomEditorId ? ' map-canvas-scene--editor-open' : ''}`}
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
            <ConnectionLines rooms={doc.rooms} connections={doc.connections} />
          )}

          {rooms.map((room) => (
            <RoomNode
              key={room.id}
              room={room}
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
          onClose={closeRoomEditor}
        />
      )}
    </div>
  );
}
