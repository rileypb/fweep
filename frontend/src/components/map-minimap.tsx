import { useCallback, useMemo, useRef } from 'react';
import type { Connection, Room, RoomShape } from '../domain/map-types';
import { getRoomStrokeColor, type ThemeMode } from '../domain/room-color-palette';
import type { PanOffset } from './use-map-viewport';
import {
  clampPointToMinimap,
  computeWorldBounds,
  createMinimapTransform,
  fromMinimapPoint,
  getMinimapConnectionPoints,
  getMinimapRoomRect,
  getMinimapViewportRect,
} from '../graph/minimap-geometry';

const MINIMAP_WIDTH = 180;
const MINIMAP_HEIGHT = 140;
const MINIMAP_KEYBOARD_STEP = 48;

interface CanvasRectLike {
  readonly width: number;
  readonly height: number;
}

export interface MapMinimapProps {
  readonly rooms: Readonly<Record<string, Room>>;
  readonly connections: Readonly<Record<string, Connection>>;
  readonly selectedRoomIds: readonly string[];
  readonly selectedConnectionIds: readonly string[];
  readonly panOffset: PanOffset;
  readonly canvasRect: CanvasRectLike | null;
  readonly theme: ThemeMode;
  readonly disabled?: boolean;
  readonly onPanToMapPoint: (point: { x: number; y: number }) => void;
  readonly onPanBy: (delta: PanOffset) => void;
}

function getMinimapShapePath(shape: RoomShape, width: number, height: number): string {
  if (shape === 'diamond') {
    return `M ${width / 2} 0 L ${width} ${height / 2} L ${width / 2} ${height} L 0 ${height / 2} Z`;
  }

  if (shape === 'oval') {
    return `M ${width / 2} 0 A ${width / 2} ${height / 2} 0 1 1 ${width / 2} ${height} A ${width / 2} ${height / 2} 0 1 1 ${width / 2} 0`;
  }

  if (shape === 'octagon') {
    const insetX = Math.min(12, width * 0.18);
    const insetY = Math.min(10, height * 0.28);
    return [
      `M ${insetX} 0`,
      `L ${width - insetX} 0`,
      `L ${width} ${insetY}`,
      `L ${width} ${height - insetY}`,
      `L ${width - insetX} ${height}`,
      `L ${insetX} ${height}`,
      `L 0 ${height - insetY}`,
      `L 0 ${insetY}`,
      'Z',
    ].join(' ');
  }

  const radius = Math.min(8, width / 5, height / 5);
  return [
    `M ${radius} 0`,
    `L ${width - radius} 0`,
    `Q ${width} 0 ${width} ${radius}`,
    `L ${width} ${height - radius}`,
    `Q ${width} ${height} ${width - radius} ${height}`,
    `L ${radius} ${height}`,
    `Q 0 ${height} 0 ${height - radius}`,
    `L 0 ${radius}`,
    `Q 0 0 ${radius} 0`,
    'Z',
  ].join(' ');
}

export function MapMinimap({
  rooms,
  connections,
  selectedRoomIds,
  selectedConnectionIds,
  panOffset,
  canvasRect,
  theme,
  disabled = false,
  onPanToMapPoint,
  onPanBy,
}: MapMinimapProps): React.JSX.Element | null {
  const roomEntries = useMemo(() => Object.values(rooms), [rooms]);
  const worldBounds = useMemo(() => computeWorldBounds(roomEntries), [roomEntries]);
  const transform = useMemo(
    () => worldBounds
      ? createMinimapTransform(worldBounds, { width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT })
      : null,
    [worldBounds],
  );
  const viewportRect = useMemo(
    () => transform && canvasRect
      ? getMinimapViewportRect(panOffset, { width: canvasRect.width, height: canvasRect.height }, transform)
      : null,
    [canvasRect, panOffset, transform],
  );
  const dragStateRef = useRef<{ previousX: number; previousY: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const getSvgMinimapPoint = useCallback((clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || !transform) {
      return null;
    }

    return clampPointToMinimap({
      x: ((clientX - rect.left) / rect.width) * MINIMAP_WIDTH,
      y: ((clientY - rect.top) / rect.height) * MINIMAP_HEIGHT,
    }, transform);
  }, [transform]);

  const recenterFromClientPoint = useCallback((clientX: number, clientY: number, target: SVGSVGElement) => {
    if (!transform) {
      return;
    }

    const rect = target.getBoundingClientRect();
    const minimapPoint = clampPointToMinimap({
      x: ((clientX - rect.left) / rect.width) * MINIMAP_WIDTH,
      y: ((clientY - rect.top) / rect.height) * MINIMAP_HEIGHT,
    }, transform);

    onPanToMapPoint(fromMinimapPoint(minimapPoint, transform));
  }, [onPanToMapPoint, transform]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>) => {
    if (disabled) {
      return;
    }

    if (event.key === 'Home') {
      if (!worldBounds) {
        return;
      }

      event.preventDefault();
      onPanToMapPoint({
        x: worldBounds.left + (worldBounds.width / 2),
        y: worldBounds.top + (worldBounds.height / 2),
      });
      return;
    }

    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      onPanBy({ x: MINIMAP_KEYBOARD_STEP, y: 0 });
      return;
    }

    if (event.key === 'ArrowRight') {
      event.preventDefault();
      onPanBy({ x: -MINIMAP_KEYBOARD_STEP, y: 0 });
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      onPanBy({ x: 0, y: MINIMAP_KEYBOARD_STEP });
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      onPanBy({ x: 0, y: -MINIMAP_KEYBOARD_STEP });
    }
  }, [disabled, onPanBy, onPanToMapPoint, worldBounds]);

  if (!transform || !viewportRect) {
    return null;
  }

  return (
    <section
      className={`map-minimap${disabled ? ' map-minimap--disabled' : ''}`}
      data-testid="map-minimap"
      aria-label="Map overview"
      aria-description="Click to recenter the map; drag the frame to pan."
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <svg
        ref={svgRef}
        className="map-minimap__svg"
        data-testid="map-minimap-svg"
        viewBox={`0 0 ${MINIMAP_WIDTH} ${MINIMAP_HEIGHT}`}
        onClick={(event) => {
          if (disabled || dragStateRef.current) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          recenterFromClientPoint(event.clientX, event.clientY, event.currentTarget);
        }}
      >
        <rect className="map-minimap__frame" x="0.5" y="0.5" width={MINIMAP_WIDTH - 1} height={MINIMAP_HEIGHT - 1} rx="12" />
        {Object.values(connections).map((connection) => {
          const points = getMinimapConnectionPoints(rooms, connection, transform);
          if (points.length === 0) {
            return null;
          }

          const isSelected = selectedConnectionIds.includes(connection.id);
          return (
            <polyline
              key={connection.id}
              className={`map-minimap__connection${isSelected ? ' map-minimap__connection--selected' : ''}`}
              points={points.map((point) => `${point.x},${point.y}`).join(' ')}
              fill="none"
              style={{
                stroke: isSelected ? '#f59e0b' : getRoomStrokeColor(connection.strokeColorIndex, theme),
              }}
            />
          );
        })}
        {roomEntries.map((room) => {
          const rect = getMinimapRoomRect(room, transform);
          const isSelected = selectedRoomIds.includes(room.id);

          return (
            <g
              key={room.id}
              className={`map-minimap__room${isSelected ? ' map-minimap__room--selected' : ''}`}
              transform={`translate(${rect.left} ${rect.top})`}
            >
              <path d={getMinimapShapePath(room.shape, rect.width, rect.height)} />
            </g>
          );
        })}
        <rect
          className="map-minimap__viewport"
          data-testid="map-minimap-viewport"
          x={viewportRect.x}
          y={viewportRect.y}
          width={viewportRect.width}
          height={viewportRect.height}
          rx="8"
          onMouseDown={(event) => {
            if (disabled || !transform) {
              return;
            }

            event.preventDefault();
            event.stopPropagation();
            dragStateRef.current = { previousX: event.clientX, previousY: event.clientY };

            const handleMouseMove = (moveEvent: MouseEvent) => {
              if (!dragStateRef.current) {
                return;
              }

              const current = dragStateRef.current;
              const previousMinimapPoint = getSvgMinimapPoint(current.previousX, current.previousY);
              const nextMinimapPoint = getSvgMinimapPoint(moveEvent.clientX, moveEvent.clientY);
              if (!previousMinimapPoint || !nextMinimapPoint) {
                return;
              }

              const previousPoint = fromMinimapPoint(previousMinimapPoint, transform);
              const nextPoint = fromMinimapPoint(nextMinimapPoint, transform);

              dragStateRef.current = { previousX: moveEvent.clientX, previousY: moveEvent.clientY };
              onPanBy({
                x: -(nextPoint.x - previousPoint.x),
                y: -(nextPoint.y - previousPoint.y),
              });
            };

            const handleMouseUp = () => {
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);
              dragStateRef.current = null;
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
          }}
        />
      </svg>
      <div className="map-minimap__hint" aria-hidden="true">
        Overview
      </div>
    </section>
  );
}
