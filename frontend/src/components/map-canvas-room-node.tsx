import { useCallback, useState } from 'react';
import { useEditorStore } from '../state/editor-store';
import { normalizeDirection } from '../domain/directions';
import { type MapVisualStyle, type Room, type RoomShape } from '../domain/map-types';
import { getHandleOffset } from '../graph/connection-geometry';
import { getRoomLabelLayout } from '../graph/room-label-geometry';
import { getRoomNodeDimensions } from '../graph/room-label-geometry';
import { renderRoomShape } from './map-canvas-helpers';
import {
  getRoomLabelColor,
  getRoomStrokeColor,
  type ThemeMode,
} from '../domain/room-color-palette';
import type { PanOffset } from './use-map-viewport';
import { PadlockGlyph } from './padlock-glyph';

const HANDLE_RADIUS = 5;
const DIRECTION_HANDLES = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;
const VERTICAL_HANDLE_RADIUS = 4;
const NON_EMPTY_CONNECTION_DROP_SELECTOR = [
  '[data-room-id]',
  '[data-sticky-note-id]',
  '[data-connection-id]',
  '[data-sticky-note-link-id]',
  '.map-drawing-toolbar',
  '.map-canvas-actions',
  '[data-testid="map-minimap"]',
].join(', ');

interface DirectionHandlesProps {
  roomWidth: number;
  roomHeight: number;
  roomShape: RoomShape;
  visualStyle: MapVisualStyle;
  labelY: number;
  onHandleMouseDown?: (direction: string, e: React.MouseEvent) => void;
}

function getVerticalHandleOffset(
  direction: 'up' | 'down',
  roomWidth: number,
  roomHeight: number,
  labelY: number,
  visualStyle: MapVisualStyle,
): { x: number; y: number } {
  if (visualStyle === 'square-classic') {
    return {
      x: roomWidth / 2,
      y: direction === 'up' ? 10 : roomHeight - 10,
    };
  }

  return {
    x: roomWidth / 2,
    y: direction === 'up'
      ? Math.max(8, labelY - 9)
      : Math.min(roomHeight - 8, labelY + 9),
  };
}

function DirectionHandles({
  roomWidth,
  roomHeight,
  roomShape,
  visualStyle,
  labelY,
  onHandleMouseDown,
}: DirectionHandlesProps): React.JSX.Element {
  return (
    <>
      {DIRECTION_HANDLES.map((dir) => {
        const effectiveShape = visualStyle === 'square-classic' ? 'rectangle' : roomShape;
        const handleOffset = getHandleOffset(normalizeDirection(dir), { width: roomWidth, height: roomHeight }, effectiveShape);
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
      {(['up', 'down'] as const).map((dir) => {
        const handleOffset = getVerticalHandleOffset(dir, roomWidth, roomHeight, labelY, visualStyle);

        return (
          <circle
            key={dir}
            className="direction-handle direction-handle--vertical"
            data-testid={`direction-handle-${dir}`}
            data-direction={dir}
            cx={handleOffset.x}
            cy={handleOffset.y}
            r={VERTICAL_HANDLE_RADIUS}
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
  onEmptyConnectionDrop: (position: PanOffset, clientX: number, clientY: number) => void;
  toMapPoint: (clientX: number, clientY: number) => PanOffset;
}

export function MapCanvasRoomNode({
  room,
  theme,
  isSelected,
  isRoomEditorOpen,
  onOpenRoomEditor,
  onEmptyConnectionDrop,
  toMapPoint,
}: MapCanvasRoomNodeProps): React.JSX.Element {
  const [hovered, setHovered] = useState(false);
  const moveSelection = useEditorStore((s) => s.moveSelection);
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
  const canvasInteractionMode = useEditorStore((s) => s.canvasInteractionMode);
  const mapVisualStyle = useEditorStore((s) => s.mapVisualStyle);
  const interactionsDisabled = canvasInteractionMode === 'draw';

  const isDragging = selectionDrag !== null && selectionDrag.roomIds.includes(room.id);
  const dragOffset = isDragging ? selectionDrag : null;
  const visualX = dragOffset ? room.position.x + dragOffset.dx : room.position.x;
  const visualY = dragOffset ? room.position.y + dragOffset.dy : room.position.y;
  const roomDimensions = getRoomNodeDimensions(room, mapVisualStyle);
  const roomWidth = roomDimensions.width;
  const roomHeight = roomDimensions.height;
  const labelLayout = getRoomLabelLayout(room, roomWidth, roomHeight, mapVisualStyle);
  const roomLabelColor = getRoomLabelColor(theme);
  const roomStroke = getRoomStrokeColor(room.strokeColorIndex, theme);

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
      const startPoint = toMapPoint(startX, startY);
      startRoomDrag(room.id);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const cursorPoint = toMapPoint(moveEvent.clientX, moveEvent.clientY);
        updateRoomDrag(cursorPoint.x - startPoint.x, cursorPoint.y - startPoint.y);
      };

      const handleMouseUp = (upEvent: MouseEvent) => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);

        const endPoint = toMapPoint(upEvent.clientX, upEvent.clientY);
        const dx = endPoint.x - startPoint.x;
        const dy = endPoint.y - startPoint.y;
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
          const nextPseudoRoomPositions = Object.fromEntries(
            (dragSelection?.pseudoRoomIds ?? []).flatMap((draggedPseudoRoomId) => {
              const draggedPseudoRoom = useEditorStore.getState().doc?.pseudoRooms[draggedPseudoRoomId];
              if (!draggedPseudoRoom) {
                return [];
              }

              return [[draggedPseudoRoomId, {
                x: draggedPseudoRoom.position.x + dx,
                y: draggedPseudoRoom.position.y + dy,
              }]];
            }),
          );

          moveSelection({
            rooms: nextRoomPositions,
            pseudoRooms: nextPseudoRoomPositions,
            stickyNotes: nextStickyNotePositions,
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
    [addRoomToSelection, endRoomDrag, isRoomEditorOpen, moveSelection, room.id, selectRoom, startRoomDrag, toMapPoint, updateRoomDrag],
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
        } else if (target?.closest?.('[data-testid="map-canvas"]') && !target?.closest?.(NON_EMPTY_CONNECTION_DROP_SELECTOR)) {
          const targetPoint = toMapPoint(upEvent.clientX, upEvent.clientY);
          onEmptyConnectionDrop(targetPoint, upEvent.clientX, upEvent.clientY);
        } else {
          cancelConnectionDrag();
        }
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [
      cancelConnectionDrag,
      completeConnectionDrag,
      isRoomEditorOpen,
      onEmptyConnectionDrop,
      onOpenRoomEditor,
      room.id,
      startConnectionDrag,
      toMapPoint,
      updateConnectionDrag,
    ],
  );

  return (
    <svg
      className={`room-node${isDragging ? ' room-node--dragging' : ''}`}
      data-testid="room-node"
      data-room-id={room.id}
      data-room-shape={room.shape}
      data-map-visual-style={mapVisualStyle}
      width={roomWidth}
      height={roomHeight}
      style={{
        transform: `translate(${visualX}px, ${visualY}px)`,
        pointerEvents: interactionsDisabled ? 'none' : undefined,
      }}
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
          height={roomHeight + 8}
          rx={12}
          ry={12}
        />
      )}
      {renderRoomShape(room.shape, roomWidth, roomHeight, room, theme, mapVisualStyle)}
      <text
        className="room-node-name"
        x={labelLayout.textX}
        y={labelLayout.firstLineY}
        dominantBaseline="middle"
        textAnchor="middle"
        style={{ fill: roomLabelColor }}
      >
        {labelLayout.lines.map((line, index) => (
          <tspan
            key={`${room.id}-line-${index}`}
            x={labelLayout.textX}
            y={labelLayout.firstLineY + (index * labelLayout.lineHeight)}
          >
            {line}
          </tspan>
        ))}
      </text>
      {room.locked && labelLayout.lockX !== null && labelLayout.lockY !== null && (
        <g
          data-testid={`room-lock-glyph-${room.id}`}
          transform={`translate(${labelLayout.lockX} ${labelLayout.lockY})`}
          pointerEvents="none"
        >
          <PadlockGlyph
            bodyColor={roomStroke}
            keyholeColor={theme === 'dark' ? '#111827' : '#ffffff'}
          />
        </g>
      )}
      {hovered && !isDragging && !isRoomEditorOpen && !interactionsDisabled && (
        <DirectionHandles
          roomWidth={roomWidth}
          roomHeight={roomHeight}
          roomShape={room.shape}
          visualStyle={mapVisualStyle}
          labelY={labelLayout.firstLineY}
          onHandleMouseDown={handleDirectionMouseDown}
        />
      )}
    </svg>
  );
}
