import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { type PseudoRoom } from '../domain/map-types';
import { type ThemeMode, getRoomLabelColor } from '../domain/room-color-palette';
import {
  PSEUDO_ROOM_SYMBOL_FONT_FAMILY,
  PSEUDO_ROOM_SYMBOL_FONT_WEIGHT,
  getPseudoRoomSymbolLayout,
  toPseudoRoomVisualRoom,
} from '../domain/pseudo-room-helpers';
import { getRoomNodeDimensions } from '../graph/room-label-geometry';
import { useEditorStore } from '../state/editor-store';

export interface MapCanvasPseudoRoomNodeProps {
  pseudoRoom: PseudoRoom;
  theme: ThemeMode;
  isSelected: boolean;
  onOpenPseudoRoomEditor: (pseudoRoomId: string) => void;
}

export function MapCanvasPseudoRoomNode({
  pseudoRoom,
  theme,
  isSelected,
  onOpenPseudoRoomEditor,
}: MapCanvasPseudoRoomNodeProps): React.JSX.Element {
  const visualRoom = toPseudoRoomVisualRoom(pseudoRoom);
  const movePseudoRooms = useEditorStore((s) => s.movePseudoRooms);
  const moveRooms = useEditorStore((s) => s.moveRooms);
  const moveStickyNotes = useEditorStore((s) => s.moveStickyNotes);
  const selectPseudoRoom = useEditorStore((s) => s.selectPseudoRoom);
  const addPseudoRoomToSelection = useEditorStore((s) => s.addPseudoRoomToSelection);
  const startPseudoRoomDrag = useEditorStore((s) => s.startPseudoRoomDrag);
  const updateRoomDrag = useEditorStore((s) => s.updateRoomDrag);
  const endRoomDrag = useEditorStore((s) => s.endRoomDrag);
  const selectionDrag = useEditorStore((s) => s.selectionDrag);
  const mapVisualStyle = useEditorStore((s) => s.mapVisualStyle);
  const roomDimensions = getRoomNodeDimensions(visualRoom, mapVisualStyle);
  const symbolLayout = getPseudoRoomSymbolLayout(pseudoRoom, mapVisualStyle);
  const textRef = useRef<SVGTextElement | null>(null);
  const [symbolAdjustment, setSymbolAdjustment] = useState({ x: 0, y: 0 });
  const roomLabelColor = getRoomLabelColor(theme);
  const isDragging = selectionDrag !== null && selectionDrag.pseudoRoomIds.includes(pseudoRoom.id);
  const visualX = pseudoRoom.position.x + (isDragging ? selectionDrag.dx : 0);
  const visualY = pseudoRoom.position.y + (isDragging ? selectionDrag.dy : 0);

  useLayoutEffect(() => {
    if (!textRef.current || typeof textRef.current.getBBox !== 'function') {
      return;
    }

    const bbox = textRef.current.getBBox();
    const nextAdjustment = {
      x: symbolLayout.x - (bbox.x + (bbox.width / 2)),
      y: symbolLayout.y - (bbox.y + (bbox.height / 2)),
    };

    setSymbolAdjustment((previous) => (
      previous.x === nextAdjustment.x && previous.y === nextAdjustment.y
        ? previous
        : nextAdjustment
    ));
  }, [symbolLayout.x, symbolLayout.y, symbolLayout.fontSize, visualRoom.name]);

  const handleMouseDown = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;
    startPseudoRoomDrag(pseudoRoom.id);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      updateRoomDrag(moveEvent.clientX - startX, moveEvent.clientY - startY);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      const dx = upEvent.clientX - startX;
      const dy = upEvent.clientY - startY;
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

        movePseudoRooms(nextPseudoRoomPositions);
        moveRooms(nextRoomPositions);
        moveStickyNotes(nextStickyNotePositions);
      } else if (upEvent.shiftKey) {
        addPseudoRoomToSelection(pseudoRoom.id);
      } else {
        selectPseudoRoom(pseudoRoom.id);
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [addPseudoRoomToSelection, endRoomDrag, movePseudoRooms, moveRooms, moveStickyNotes, pseudoRoom.id, selectPseudoRoom, startPseudoRoomDrag, updateRoomDrag]);

  return (
    <svg
      className="map-room-node map-room-node--pseudo"
      data-testid="pseudo-room-node"
      data-pseudo-room-id={pseudoRoom.id}
      width={roomDimensions.width}
      height={roomDimensions.height}
      style={{
        position: 'absolute',
        overflow: 'visible',
        transform: `translate(${visualX}px, ${visualY}px)`,
        cursor: 'move',
        zIndex: 7,
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
      <text
        ref={textRef}
        x={symbolLayout.x + symbolAdjustment.x}
        y={symbolLayout.y + symbolAdjustment.y}
        textAnchor="start"
        dominantBaseline="alphabetic"
        style={{
          fill: roomLabelColor,
          pointerEvents: 'none',
          fontFamily: PSEUDO_ROOM_SYMBOL_FONT_FAMILY,
          fontSize: `${symbolLayout.fontSize}px`,
          fontWeight: PSEUDO_ROOM_SYMBOL_FONT_WEIGHT,
        }}
      >
        {visualRoom.name}
      </text>
    </svg>
  );
}
