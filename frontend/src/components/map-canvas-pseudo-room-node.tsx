import { useCallback } from 'react';
import { type PseudoRoom } from '../domain/map-types';
import { type ThemeMode, getRoomLabelColor } from '../domain/room-color-palette';
import {
  getPseudoRoomSymbolLayout,
  toPseudoRoomVisualRoom,
} from '../domain/pseudo-room-helpers';
import {
  getPseudoRoomSymbolDefinition,
  PSEUDO_ROOM_SYMBOL_VIEWBOX_SIZE,
  pseudoRoomPathCommandsToSvgPath,
} from '../domain/pseudo-room-symbols';
import { getRoomNodeDimensions } from '../graph/room-label-geometry';
import { useEditorStore } from '../state/editor-store';
import type { PanOffset } from './use-map-viewport';

export interface MapCanvasPseudoRoomNodeProps {
  pseudoRoom: PseudoRoom;
  theme: ThemeMode;
  isSelected: boolean;
  onOpenPseudoRoomEditor: (pseudoRoomId: string) => void;
  toMapPoint: (clientX: number, clientY: number) => PanOffset;
}

export function MapCanvasPseudoRoomNode({
  pseudoRoom,
  theme,
  isSelected,
  onOpenPseudoRoomEditor,
  toMapPoint,
}: MapCanvasPseudoRoomNodeProps): React.JSX.Element {
  const visualRoom = toPseudoRoomVisualRoom(pseudoRoom);
  const moveSelection = useEditorStore((s) => s.moveSelection);
  const selectPseudoRoom = useEditorStore((s) => s.selectPseudoRoom);
  const addPseudoRoomToSelection = useEditorStore((s) => s.addPseudoRoomToSelection);
  const startPseudoRoomDrag = useEditorStore((s) => s.startPseudoRoomDrag);
  const updateRoomDrag = useEditorStore((s) => s.updateRoomDrag);
  const endRoomDrag = useEditorStore((s) => s.endRoomDrag);
  const selectionDrag = useEditorStore((s) => s.selectionDrag);
  const mapVisualStyle = useEditorStore((s) => s.mapVisualStyle);
  const roomDimensions = getRoomNodeDimensions(visualRoom, mapVisualStyle);
  const symbolLayout = getPseudoRoomSymbolLayout(pseudoRoom, mapVisualStyle);
  const symbolDefinition = getPseudoRoomSymbolDefinition(pseudoRoom.kind);
  const symbolViewBoxSize = symbolDefinition.viewBoxSize ?? PSEUDO_ROOM_SYMBOL_VIEWBOX_SIZE;
  const roomLabelColor = getRoomLabelColor(theme);
  const isDragging = selectionDrag !== null && selectionDrag.pseudoRoomIds.includes(pseudoRoom.id);
  const visualX = pseudoRoom.position.x + (isDragging ? selectionDrag.dx : 0);
  const visualY = pseudoRoom.position.y + (isDragging ? selectionDrag.dy : 0);

  const handleMouseDown = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    const startPoint = toMapPoint(startX, startY);
    startPseudoRoomDrag(pseudoRoom.id);

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
      const currentDoc = useEditorStore.getState().doc;
      const dragSelection = useEditorStore.getState().selectionDrag;
      endRoomDrag();

      if (!currentDoc?.pseudoRooms[pseudoRoom.id]) {
        return;
      }

      if (dx !== 0 || dy !== 0) {
        const nextPseudoRoomPositions = Object.fromEntries(
          (dragSelection?.pseudoRoomIds ?? [pseudoRoom.id]).flatMap((draggedPseudoRoomId) => {
            const draggedPseudoRoom = currentDoc.pseudoRooms[draggedPseudoRoomId];
            if (!draggedPseudoRoom) {
              return [];
            }

            return [[draggedPseudoRoomId, {
              x: draggedPseudoRoom.position.x + dx,
              y: draggedPseudoRoom.position.y + dy,
            }]];
          }),
        );
        const nextRoomPositions = Object.fromEntries(
          (dragSelection?.roomIds ?? []).flatMap((draggedRoomId) => {
            const draggedRoom = currentDoc.rooms[draggedRoomId];
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
            const draggedStickyNote = currentDoc.stickyNotes[draggedStickyNoteId];
            if (!draggedStickyNote) {
              return [];
            }

            return [[draggedStickyNoteId, {
              x: draggedStickyNote.position.x + dx,
              y: draggedStickyNote.position.y + dy,
            }]];
          }),
        );

        moveSelection({
          rooms: nextRoomPositions,
          pseudoRooms: nextPseudoRoomPositions,
          stickyNotes: nextStickyNotePositions,
        });
      } else if (upEvent.shiftKey) {
        addPseudoRoomToSelection(pseudoRoom.id);
      } else {
        selectPseudoRoom(pseudoRoom.id);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [addPseudoRoomToSelection, endRoomDrag, moveSelection, pseudoRoom.id, selectPseudoRoom, startPseudoRoomDrag, toMapPoint, updateRoomDrag]);

  return (
    <svg
      className={`pseudo-room-node${isDragging ? ' pseudo-room-node--dragging' : ''}`}
      data-testid="pseudo-room-node"
      data-pseudo-room-id={pseudoRoom.id}
      width={roomDimensions.width}
      height={roomDimensions.height}
      style={{
        transform: `translate(${visualX}px, ${visualY}px)`,
        cursor: 'move',
      }}
      onMouseDown={handleMouseDown}
      onClick={(event) => {
        event.stopPropagation();
      }}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpenPseudoRoomEditor(pseudoRoom.id);
      }}
    >
      {isSelected && (
        <rect
          className="room-selection-outline"
          data-testid="pseudo-room-selection-outline"
          x={-4}
          y={-4}
          width={roomDimensions.width + 8}
          height={roomDimensions.height + 8}
          rx={10}
          ry={10}
          fill="none"
          stroke="#ef4444"
          strokeWidth={2}
          pointerEvents="none"
        />
      )}
      <g
        transform={`translate(${symbolLayout.x - (symbolLayout.size / 2)} ${symbolLayout.y - (symbolLayout.size / 2)}) scale(${symbolLayout.size / symbolViewBoxSize})`}
        style={{
          color: roomLabelColor,
          pointerEvents: 'none',
        }}
      >
        {symbolDefinition.paths.map((path, index) => (
          <path
            key={`path-${pseudoRoom.id}-${index}`}
            d={pseudoRoomPathCommandsToSvgPath(path.commands)}
            fill="none"
            stroke="currentColor"
            strokeWidth={path.strokeWidth}
            strokeLinecap={path.lineCap}
            strokeLinejoin={path.lineJoin}
          />
        ))}
        {(symbolDefinition.circles ?? []).map((circle, index) => (
          <circle
            key={`circle-${pseudoRoom.id}-${index}`}
            cx={circle.cx}
            cy={circle.cy}
            r={circle.r}
            fill="currentColor"
          />
        ))}
        {(symbolDefinition.filledPaths ?? []).map((path, index) => (
          <path
            key={`filled-path-${pseudoRoom.id}-${index}`}
            d={path.d}
            fill="currentColor"
          />
        ))}
      </g>
    </svg>
  );
}
