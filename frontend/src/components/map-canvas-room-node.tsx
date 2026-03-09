import { useCallback, useState } from 'react';
import { useEditorStore } from '../state/editor-store';
import { normalizeDirection } from '../domain/directions';
import { type Room, type RoomShape } from '../domain/map-types';
import { getHandleOffset, ROOM_HEIGHT } from '../graph/connection-geometry';
import { getRoomNodeWidth } from '../graph/minimap-geometry';
import { renderRoomShape } from './map-canvas-helpers';
import type { ThemeMode } from '../domain/room-color-palette';
import type { PanOffset } from './use-map-viewport';

const HANDLE_RADIUS = 5;
const DIRECTION_HANDLES = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;

interface DirectionHandlesProps {
  roomWidth: number;
  roomHeight: number;
  roomShape: RoomShape;
  onHandleMouseDown?: (direction: string, e: React.MouseEvent) => void;
}

function DirectionHandles({
  roomWidth,
  roomHeight,
  roomShape,
  onHandleMouseDown,
}: DirectionHandlesProps): React.JSX.Element {
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

export interface MapCanvasRoomNodeProps {
  room: Room;
  theme: ThemeMode;
  isSelected: boolean;
  isRoomEditorOpen: boolean;
  onOpenRoomEditor: (roomId: string) => void;
  toMapPoint: (clientX: number, clientY: number) => PanOffset;
}

export function MapCanvasRoomNode({
  room,
  theme,
  isSelected,
  isRoomEditorOpen,
  onOpenRoomEditor,
  toMapPoint,
}: MapCanvasRoomNodeProps): React.JSX.Element {
  const [hovered, setHovered] = useState(false);
  const moveRooms = useEditorStore((s) => s.moveRooms);
  const startConnectionDrag = useEditorStore((s) => s.startConnectionDrag);
  const updateConnectionDrag = useEditorStore((s) => s.updateConnectionDrag);
  const completeConnectionDrag = useEditorStore((s) => s.completeConnectionDrag);
  const cancelConnectionDrag = useEditorStore((s) => s.cancelConnectionDrag);
  const startRoomDrag = useEditorStore((s) => s.startRoomDrag);
  const updateRoomDrag = useEditorStore((s) => s.updateRoomDrag);
  const endRoomDrag = useEditorStore((s) => s.endRoomDrag);
  const selectionDrag = useEditorStore((s) => s.selectionDrag);
  const selectRoom = useEditorStore((s) => s.selectRoom);
  const addRoomToSelection = useEditorStore((s) => s.addRoomToSelection);
  const moveStickyNotes = useEditorStore((s) => s.moveStickyNotes);

  const isDragging = selectionDrag !== null && selectionDrag.roomIds.includes(room.id);
  const dragOffset = isDragging ? selectionDrag : null;
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
        const dragSelection = useEditorStore.getState().selectionDrag;
        endRoomDrag();

        if (dx !== 0 || dy !== 0) {
          const nextRoomPositions = Object.fromEntries(
            (dragSelection?.roomIds ?? []).flatMap((draggedRoomId) => {
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
          const nextStickyNotePositions = Object.fromEntries(
            (dragSelection?.stickyNoteIds ?? []).flatMap((draggedStickyNoteId) => {
              const draggedStickyNote = useEditorStore.getState().doc?.stickyNotes[draggedStickyNoteId];
              if (!draggedStickyNote) {
                return [];
              }

              return [[draggedStickyNoteId, {
                x: draggedStickyNote.position.x + dx,
                y: draggedStickyNote.position.y + dy,
              }]];
            }),
          );

          moveRooms(nextRoomPositions);
          moveStickyNotes(nextStickyNotePositions);
        } else if (upEvent.shiftKey) {
          addRoomToSelection(room.id);
        } else {
          selectRoom(room.id);
        }
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [addRoomToSelection, endRoomDrag, isRoomEditorOpen, moveRooms, moveStickyNotes, room.id, selectRoom, startRoomDrag, updateRoomDrag],
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

        const target = upEvent.target as Element | null;
        const roomEl = target?.closest?.('[data-room-id]') as HTMLElement | null;
        if (roomEl) {
          const targetRoomId = roomEl.getAttribute('data-room-id')!;
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
  );
}
