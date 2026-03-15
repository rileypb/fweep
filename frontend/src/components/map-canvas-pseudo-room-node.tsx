import { useCallback } from 'react';
import { type PseudoRoom } from '../domain/map-types';
import { type ThemeMode, getRoomLabelColor } from '../domain/room-color-palette';
import { toPseudoRoomVisualRoom } from '../domain/pseudo-room-helpers';
import { getRoomNodeDimensions } from '../graph/room-label-geometry';
import { useEditorStore } from '../state/editor-store';

const PSEUDO_ROOM_SYMBOL_FONT_SIZE = 112;

export interface MapCanvasPseudoRoomNodeProps {
  pseudoRoom: PseudoRoom;
  theme: ThemeMode;
  onOpenPseudoRoomEditor: (pseudoRoomId: string) => void;
}

export function MapCanvasPseudoRoomNode({
  pseudoRoom,
  theme,
  onOpenPseudoRoomEditor,
}: MapCanvasPseudoRoomNodeProps): React.JSX.Element {
  const visualRoom = toPseudoRoomVisualRoom(pseudoRoom);
  const movePseudoRoom = useEditorStore((s) => s.movePseudoRoom);
  const mapVisualStyle = useEditorStore((s) => s.mapVisualStyle);
  const roomDimensions = getRoomNodeDimensions(visualRoom, mapVisualStyle);
  const roomLabelColor = getRoomLabelColor(theme);

  const handleMouseDown = useCallback((event: React.MouseEvent<SVGSVGElement>) => {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const startX = event.clientX;
    const startY = event.clientY;

    const handleMouseMove = () => {
      // Drag preview is intentionally omitted for pseudo-rooms in v1.
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      const dx = upEvent.clientX - startX;
      const dy = upEvent.clientY - startY;
      if (dx !== 0 || dy !== 0) {
        movePseudoRoom(pseudoRoom.id, {
          x: pseudoRoom.position.x + dx,
          y: pseudoRoom.position.y + dy,
        });
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [movePseudoRoom, pseudoRoom.id, pseudoRoom.position.x, pseudoRoom.position.y]);

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
        transform: `translate(${pseudoRoom.position.x}px, ${pseudoRoom.position.y}px)`,
        cursor: 'move',
        zIndex: 7,
      }}
      onMouseDown={handleMouseDown}
      onDoubleClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onOpenPseudoRoomEditor(pseudoRoom.id);
      }}
    >
      <text
        x={roomDimensions.width / 2}
        y={roomDimensions.height / 2}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{ fill: roomLabelColor, pointerEvents: 'none', fontSize: `${PSEUDO_ROOM_SYMBOL_FONT_SIZE}px`, fontWeight: 700 }}
      >
        {visualRoom.name}
      </text>
    </svg>
  );
}
