import { useState, useCallback, useRef, useEffect } from 'react';
import { useEditorStore } from '../state/editor-store';
import type { Room, Connection } from '../domain/map-types';
import {
  computeConnectionPath,
  computeSegmentArrowheadPoints,
  computePreviewPath,
  pointsToSvgString,
} from '../graph/connection-geometry';

export interface MapCanvasProps {
  mapName: string;
  /** Whether the background grid is visible. Defaults to true. */
  showGrid?: boolean;
}

/* ---- Inline name input ---- */

function RoomNameInput({ roomId }: { roomId: string }): React.JSX.Element {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const committedRef = useRef(false);
  const renameRoom = useEditorStore((s) => s.renameRoom);
  const removeRoom = useEditorStore((s) => s.removeRoom);
  const clearEditingRoomId = useEditorStore((s) => s.clearEditingRoomId);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const commit = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      removeRoom(roomId);
    } else {
      renameRoom(roomId, trimmed);
      clearEditingRoomId();
    }
  }, [value, roomId, renameRoom, removeRoom, clearEditingRoomId]);

  const cancel = useCallback(() => {
    if (committedRef.current) return;
    committedRef.current = true;
    removeRoom(roomId);
  }, [roomId, removeRoom]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commit();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancel();
      }
    },
    [commit, cancel],
  );

  return (
    <input
      ref={inputRef}
      className="room-name-input"
      type="text"
      aria-label="Room name"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={commit}
    />
  );
}

/* ---- Directional handles ---- */

const DIRECTION_HANDLES = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;

interface DirectionHandlesProps {
  onHandleMouseDown?: (direction: string, e: React.MouseEvent) => void;
}

function DirectionHandles({ onHandleMouseDown }: DirectionHandlesProps): React.JSX.Element {
  return (
    <>
      {DIRECTION_HANDLES.map((dir) => (
        <div
          key={dir}
          className={`direction-handle direction-handle--${dir}`}
          data-testid={`direction-handle-${dir}`}
          data-direction={dir}
          onMouseDown={(e) => {
            if (onHandleMouseDown) {
              e.stopPropagation();
              onHandleMouseDown(dir, e);
            }
          }}
        />
      ))}
    </>
  );
}

/* ---- Room node ---- */

function RoomNode({ room, isEditing }: { room: Room; isEditing: boolean }): React.JSX.Element {
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

  const isDragging = roomDrag !== null && roomDrag.roomId === room.id;
  const dragOffset = isDragging ? roomDrag : null;

  // Compute visual position: during drag, add offset; otherwise use room.position
  const visualX = dragOffset ? room.position.x + dragOffset.dx : room.position.x;
  const visualY = dragOffset ? room.position.y + dragOffset.dy : room.position.y;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button !== 0 || isEditing) return;

      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startY = e.clientY;

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
          moveRoom(room.id, {
            x: room.position.x + dx,
            y: room.position.y + dy,
          });
        }
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [isEditing, room.id, room.position.x, room.position.y, moveRoom, startRoomDrag, updateRoomDrag, endRoomDrag],
  );

  const handleDirectionMouseDown = useCallback(
    (direction: string, e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();

      startConnectionDrag(room.id, direction, e.clientX, e.clientY);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        updateConnectionDrag(moveEvent.clientX, moveEvent.clientY);
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
    [room.id, startConnectionDrag, updateConnectionDrag, completeConnectionDrag, cancelConnectionDrag],
  );

  return (
    <div
      className={`room-node${isDragging ? ' room-node--dragging' : ''}`}
      data-testid="room-node"
      data-room-id={room.id}
      style={{ transform: `translate(${visualX}px, ${visualY}px)` }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onMouseDown={handleMouseDown}
    >
      {isEditing ? (
        <RoomNameInput roomId={room.id} />
      ) : (
        <span className="room-node-name">{room.name}</span>
      )}
      {hovered && !isEditing && !isDragging && (
        <DirectionHandles onHandleMouseDown={handleDirectionMouseDown} />
      )}
    </div>
  );
}

/* ---- Connection lines ---- */

/**
 * Apply a drag offset to a room's position if it's currently being dragged.
 */
function applyDragOffset(room: Room, roomDrag: { roomId: string; dx: number; dy: number } | null): Room {
  if (!roomDrag || roomDrag.roomId !== room.id) return room;
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

        if (conn.sourceRoomId === conn.targetRoomId) {
          // Self-connection: render a loop via the connection path
          const points = computeConnectionPath(src, tgt, conn);
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

        const points = computeConnectionPath(src, tgt, conn);
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
        const points = computePreviewPath(
          adjustedSrc,
          connectionDrag.sourceDirection,
          connectionDrag.cursorX,
          connectionDrag.cursorY,
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
  const doc = useEditorStore((s) => s.doc);
  const editingRoomId = useEditorStore((s) => s.editingRoomId);
  const addRoomAtPosition = useEditorStore((s) => s.addRoomAtPosition);
  const setEditingRoomId = useEditorStore((s) => s.setEditingRoomId);

  const rooms = doc ? Object.values(doc.rooms) : [];

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!e.shiftKey) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const roomId = addRoomAtPosition('', { x, y });
      setEditingRoomId(roomId);
    },
    [addRoomAtPosition, setEditingRoomId],
  );

  const classes = ['map-canvas', showGrid ? 'map-canvas--grid' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} data-testid="map-canvas" onClick={handleCanvasClick}>
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

      {doc && (
        <ConnectionLines rooms={doc.rooms} connections={doc.connections} />
      )}

      {rooms.map((room) => (
        <RoomNode key={room.id} room={room} isEditing={editingRoomId === room.id} />
      ))}
    </div>
  );
}
