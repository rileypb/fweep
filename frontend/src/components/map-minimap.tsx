import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BACKGROUND_LAYER_CHUNK_SIZE,
  type BackgroundDocument,
  type Connection,
  type MapVisualStyle,
  type PseudoRoom,
  type Room,
  type RoomShape,
  type StickyNote,
  type StickyNoteLink,
} from '../domain/map-types';
import { getRoomStrokeColor, type ThemeMode } from '../domain/room-color-palette';
import { toPseudoRoomVisualRoom } from '../domain/pseudo-room-helpers';
import type { PanOffset } from './use-map-viewport';
import {
  clampPointToMinimap,
  createMinimapTransform,
  fromMinimapPoint,
  getMinimapConnectionPoints,
  getRoomBounds,
  getMinimapStickyNoteLinkPoints,
  getMinimapStickyNoteRect,
  getMinimapRoomRect,
  getStickyNoteBounds,
  getMinimapViewportRect,
  mergeWorldBounds,
  toMinimapPoint,
} from '../graph/minimap-geometry';
import { getRoomShapePath } from '../graph/room-shape-geometry';
import { listBackgroundChunksForLayer, type BackgroundChunkRecord } from '../storage/map-store';

const MINIMAP_WIDTH = 180;
const MINIMAP_HEIGHT = 140;
const MINIMAP_KEYBOARD_STEP = 48;

interface CanvasRectLike {
  readonly width: number;
  readonly height: number;
}

export interface MapMinimapProps {
  readonly mapId: string;
  readonly background: BackgroundDocument;
  readonly backgroundRevision?: number;
  readonly rooms: Readonly<Record<string, Room>>;
  readonly pseudoRooms?: Readonly<Record<string, PseudoRoom>>;
  readonly connections: Readonly<Record<string, Connection>>;
  readonly stickyNotes?: Readonly<Record<string, StickyNote>>;
  readonly stickyNoteLinks?: Readonly<Record<string, StickyNoteLink>>;
  readonly selectedRoomIds: readonly string[];
  readonly selectedConnectionIds: readonly string[];
  readonly selectedStickyNoteIds?: readonly string[];
  readonly selectedStickyNoteLinkIds?: readonly string[];
  readonly panOffset: PanOffset;
  readonly zoom?: number;
  readonly visualStyle?: MapVisualStyle;
  readonly canvasRect: CanvasRectLike | null;
  readonly visibleMapLeftInset?: number;
  readonly theme: ThemeMode;
  readonly disabled?: boolean;
  readonly onPanToMapPoint: (point: { x: number; y: number }) => void;
  readonly onPanBy: (delta: PanOffset) => void;
}

interface MinimapBackgroundChunk extends BackgroundChunkRecord {
  readonly objectUrl: string;
}

function getMinimapShapePath(shape: RoomShape, width: number, height: number): string {
  return getRoomShapePath(shape, width, height, 8);
}

function getEffectiveMinimapShape(shape: RoomShape, visualStyle: MapVisualStyle): RoomShape {
  return visualStyle === 'square-classic' ? 'rectangle' : shape;
}

export function MapMinimap({
  mapId,
  background,
  backgroundRevision = 0,
  rooms,
  pseudoRooms = {},
  connections,
  stickyNotes = {},
  stickyNoteLinks = {},
  selectedRoomIds,
  selectedConnectionIds,
  selectedStickyNoteIds = [],
  selectedStickyNoteLinkIds = [],
  panOffset,
  zoom = 1,
  visualStyle = 'default',
  canvasRect,
  visibleMapLeftInset = 0,
  theme,
  disabled = false,
  onPanToMapPoint,
  onPanBy,
}: MapMinimapProps): React.JSX.Element | null {
  const roomEntries = useMemo(() => Object.values(rooms), [rooms]);
  const pseudoRoomEntries = useMemo(() => Object.values(pseudoRooms), [pseudoRooms]);
  const pseudoRoomVisualEntries = useMemo(
    () => pseudoRoomEntries.map((pseudoRoom) => toPseudoRoomVisualRoom(pseudoRoom)),
    [pseudoRoomEntries],
  );
  const stickyNoteEntries = useMemo(() => Object.values(stickyNotes), [stickyNotes]);
  const [backgroundChunks, setBackgroundChunks] = useState<readonly MinimapBackgroundChunk[]>([]);
  const activeBackgroundLayerId = background.activeLayerId;

  useEffect(() => {
    let cancelled = false;

    async function loadChunks(): Promise<void> {
      if (!activeBackgroundLayerId) {
        setBackgroundChunks((currentChunks) => {
          currentChunks.forEach((chunk) => URL.revokeObjectURL(chunk.objectUrl));
          return [];
        });
        return;
      }

      const chunks = await listBackgroundChunksForLayer(mapId, activeBackgroundLayerId);
      if (cancelled) {
        return;
      }

      setBackgroundChunks((currentChunks) => {
        currentChunks.forEach((chunk) => URL.revokeObjectURL(chunk.objectUrl));
        return chunks.map((chunk) => ({
          ...chunk,
          objectUrl: URL.createObjectURL(chunk.blob),
        }));
      });
    }

    void loadChunks();

    return () => {
      cancelled = true;
    };
  }, [activeBackgroundLayerId, backgroundRevision, mapId]);

  useEffect(() => () => {
    backgroundChunks.forEach((chunk) => URL.revokeObjectURL(chunk.objectUrl));
  }, [backgroundChunks]);

  const worldBounds = useMemo(() => {
    if (roomEntries.length > 0 || pseudoRoomVisualEntries.length > 0 || stickyNoteEntries.length > 0) {
      return mergeWorldBounds([
        ...roomEntries.map((room) => {
          const bounds = getRoomBounds(room, visualStyle);
          return {
            left: bounds.left,
            top: bounds.top,
            right: bounds.left + bounds.width,
            bottom: bounds.top + bounds.height,
          };
        }),
        ...pseudoRoomVisualEntries.map((pseudoRoom) => {
          const bounds = getRoomBounds(pseudoRoom, visualStyle);
          return {
            left: bounds.left,
            top: bounds.top,
            right: bounds.left + bounds.width,
            bottom: bounds.top + bounds.height,
          };
        }),
        ...stickyNoteEntries.map((stickyNote) => {
          const bounds = getStickyNoteBounds(stickyNote);
          return {
            left: bounds.left,
            top: bounds.top,
            right: bounds.left + bounds.width,
            bottom: bounds.top + bounds.height,
          };
        }),
      ]);
    }

    const backgroundBounds = backgroundChunks.map((chunk) => ({
      left: chunk.chunkX * BACKGROUND_LAYER_CHUNK_SIZE,
      top: chunk.chunkY * BACKGROUND_LAYER_CHUNK_SIZE,
      right: (chunk.chunkX + 1) * BACKGROUND_LAYER_CHUNK_SIZE,
      bottom: (chunk.chunkY + 1) * BACKGROUND_LAYER_CHUNK_SIZE,
    }));

    return mergeWorldBounds(backgroundBounds);
  }, [backgroundChunks, pseudoRoomVisualEntries, roomEntries, stickyNoteEntries, visualStyle]);
  const transform = useMemo(
    () => worldBounds
      ? createMinimapTransform(worldBounds, { width: MINIMAP_WIDTH, height: MINIMAP_HEIGHT })
      : null,
    [worldBounds],
  );
  const viewportRect = useMemo(
    () => transform && canvasRect
      ? getMinimapViewportRect(
        panOffset,
        { width: canvasRect.width, height: canvasRect.height },
        transform,
        zoom,
        visibleMapLeftInset,
      )
      : null,
    [canvasRect, panOffset, transform, visibleMapLeftInset, zoom],
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

  const isPlaceholder = !transform || !viewportRect;

  return (
    <section
      className={`map-minimap${disabled || isPlaceholder ? ' map-minimap--disabled' : ''}`}
      data-testid="map-minimap"
      aria-label="Map overview"
      aria-description="Click to recenter the map; drag the frame to pan."
      tabIndex={isPlaceholder ? -1 : 0}
      onKeyDown={handleKeyDown}
    >
      <svg
        ref={svgRef}
        className="map-minimap__svg"
        data-testid="map-minimap-svg"
        viewBox={`0 0 ${MINIMAP_WIDTH} ${MINIMAP_HEIGHT}`}
        onClick={(event) => {
          if (disabled || isPlaceholder || dragStateRef.current) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          recenterFromClientPoint(event.clientX, event.clientY, event.currentTarget);
        }}
      >
        <rect className="map-minimap__frame" x="0.5" y="0.5" width={MINIMAP_WIDTH - 1} height={MINIMAP_HEIGHT - 1} rx="12" />
        {!isPlaceholder && backgroundChunks.map((chunk) => {
          const topLeft = toMinimapPoint({
            x: chunk.chunkX * BACKGROUND_LAYER_CHUNK_SIZE,
            y: chunk.chunkY * BACKGROUND_LAYER_CHUNK_SIZE,
          }, transform);
          const bottomRight = toMinimapPoint({
            x: (chunk.chunkX + 1) * BACKGROUND_LAYER_CHUNK_SIZE,
            y: (chunk.chunkY + 1) * BACKGROUND_LAYER_CHUNK_SIZE,
          }, transform);

          return (
            <image
              key={chunk.key}
              className="map-minimap__background"
              data-testid="map-minimap-background-chunk"
              href={chunk.objectUrl}
              x={topLeft.x}
              y={topLeft.y}
              width={Math.max(bottomRight.x - topLeft.x, 1)}
              height={Math.max(bottomRight.y - topLeft.y, 1)}
              preserveAspectRatio="none"
            />
          );
        })}
        {!isPlaceholder && Object.values(connections).map((connection) => {
          const points = getMinimapConnectionPoints(rooms, pseudoRooms, connection, transform, visualStyle);
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
        {!isPlaceholder && Object.values(stickyNoteLinks).map((stickyNoteLink) => {
          const points = getMinimapStickyNoteLinkPoints(rooms, stickyNotes, stickyNoteLink, transform, visualStyle);
          if (points.length !== 2) {
            return null;
          }

          const isSelected = selectedStickyNoteLinkIds.includes(stickyNoteLink.id);
          return (
            <line
              key={stickyNoteLink.id}
              className={`map-minimap__sticky-note-link${isSelected ? ' map-minimap__sticky-note-link--selected' : ''}`}
              x1={points[0].x}
              y1={points[0].y}
              x2={points[1].x}
              y2={points[1].y}
            />
          );
        })}
        {!isPlaceholder && roomEntries.map((room) => {
          const rect = getMinimapRoomRect(room, transform, visualStyle);
          const isSelected = selectedRoomIds.includes(room.id);

          return (
            <g
              key={room.id}
              className={`map-minimap__room${isSelected ? ' map-minimap__room--selected' : ''}`}
              transform={`translate(${rect.left} ${rect.top})`}
            >
              <path d={getMinimapShapePath(getEffectiveMinimapShape(room.shape, visualStyle), rect.width, rect.height)} />
            </g>
          );
        })}
        {!isPlaceholder && pseudoRoomVisualEntries.map((pseudoRoom) => {
          const rect = getMinimapRoomRect(pseudoRoom, transform, visualStyle);

          return (
            <g
              key={pseudoRoom.id}
              className="map-minimap__room map-minimap__pseudo-room"
              transform={`translate(${rect.left} ${rect.top})`}
            >
              <path d={getMinimapShapePath(getEffectiveMinimapShape(pseudoRoom.shape, visualStyle), rect.width, rect.height)} />
            </g>
          );
        })}
        {!isPlaceholder && stickyNoteEntries.map((stickyNote) => {
          const rect = getMinimapStickyNoteRect(stickyNote, transform);
          const isSelected = selectedStickyNoteIds.includes(stickyNote.id);

          return (
            <rect
              key={stickyNote.id}
              className={`map-minimap__sticky-note${isSelected ? ' map-minimap__sticky-note--selected' : ''}`}
              x={rect.left}
              y={rect.top}
              width={rect.width}
              height={rect.height}
              rx="4"
            />
          );
        })}
        {!isPlaceholder && viewportRect && (
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
        )}
      </svg>
      <div className="map-minimap__hint" aria-hidden="true">
        Overview
      </div>
    </section>
  );
}
