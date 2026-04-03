import { useEditorStore } from '../state/editor-store';
import {
  type Connection,
  type MapVisualStyle,
  type PseudoRoom,
  type Room,
  type StickyNote,
  type StickyNoteLink,
} from '../domain/map-types';
import {
  getPseudoRoomNodeDimensionsForRoom,
  toPseudoRoomVisualRoom,
} from '../domain/pseudo-room-helpers';
import { getRoomStrokeColor, type ThemeMode } from '../domain/room-color-palette';
import {
  type ConnectionRenderGeometry,
  connectionGeometryToSvgPath,
  computeConnectionPath,
  computeGeometryArrowheadPoints,
  computePreviewPath,
  createConnectionRenderGeometry,
  findRoomDirectionForConnection,
  findRoomDirectionsForConnection,
  getRoomCenter,
  getRoomPerimeterPointToward,
  sampleConnectionGeometryAtFraction,
  pointsToSvgString,
  type Point,
} from '../graph/connection-geometry';
import { getRoomNodeDimensions } from '../graph/room-label-geometry';
import { getRoomForVisualStyle } from '../graph/room-label-geometry';
import { getRoomStrokeDasharray } from './map-canvas-helpers';
import { getStickyNoteCenter } from '../graph/sticky-note-geometry';
import {
  ConnectionAnnotationIcon,
  CONNECTION_DOOR_ICON_SIZE,
  CONNECTION_LOCKED_DOOR_ICON_SIZE,
} from './connection-annotation-icon';
import type { PanOffset } from './use-map-viewport';
import {
  CONNECTION_ENDPOINT_DOT_OUTSET,
  getAnnotationGeometryFromSegment,
  getAnnotationGeometryFromRenderGeometry,
  createConnectionEndpointDotInput,
  getDirectionalAnnotationRenderIntent,
  getDerivedVerticalAnnotationKind,
  getLongestSegment,
  getRoomPassThroughBounds,
  getVisibleConnectionSegments,
  normalizeReadableTextRotation,
  spreadConnectionEndpointDots,
  type PassThroughObstacle,
  type ConnectionEndpointDotTargetBounds,
} from '../graph/connection-decoration-geometry';

const CONNECTION_ANNOTATION_OFFSET = 8;
const CONNECTION_ANNOTATION_LENGTH_RATIO = 0.8;
const CONNECTION_ANNOTATION_ARROWHEAD_LENGTH = 10;
const CONNECTION_ANNOTATION_ARROWHEAD_WIDTH = 8;
const CONNECTION_ANNOTATION_TEXT_OFFSET = 12;
const CONNECTION_ANNOTATION_CHAR_WIDTH = 7;
const CONNECTION_ANNOTATION_PADDING = 12;
const CONNECTION_REROUTE_HANDLE_RADIUS = 8;
const CONNECTION_REROUTE_HANDLE_INNER_RADIUS = 4;
const PASS_THROUGH_TINY_GAP_PADDING = 3;
function applyDragOffset(
  room: Room,
  selectionDrag: { roomIds: readonly string[]; dx: number; dy: number } | null,
): Room {
  if (!selectionDrag || !selectionDrag.roomIds.includes(room.id)) return room;
  return {
    ...room,
    position: {
      x: room.position.x + selectionDrag.dx,
      y: room.position.y + selectionDrag.dy,
    },
  };
}

function applyPseudoRoomDragOffset(
  pseudoRoom: PseudoRoom,
  selectionDrag: { pseudoRoomIds: readonly string[]; dx: number; dy: number } | null,
): PseudoRoom {
  if (!selectionDrag || !selectionDrag.pseudoRoomIds.includes(pseudoRoom.id)) {
    return pseudoRoom;
  }

  return {
    ...pseudoRoom,
    position: {
      x: pseudoRoom.position.x + selectionDrag.dx,
      y: pseudoRoom.position.y + selectionDrag.dy,
    },
  };
}

function applyStickyNoteDragOffset(
  stickyNote: StickyNote,
  selectionDrag: { stickyNoteIds: readonly string[]; dx: number; dy: number } | null,
): StickyNote {
  if (!selectionDrag || !selectionDrag.stickyNoteIds.includes(stickyNote.id)) {
    return stickyNote;
  }

  return {
    ...stickyNote,
    position: {
      x: stickyNote.position.x + selectionDrag.dx,
      y: stickyNote.position.y + selectionDrag.dy,
    },
  };
}

interface ConnectionLabelGeometry {
  readonly x: number;
  readonly y: number;
  readonly textAnchor: 'start' | 'middle';
}

function getEndpointDotPath(center: Point, radius: number, outwardNormal: Point): string {
  const visibleCenter = {
    x: center.x + (outwardNormal.x * CONNECTION_ENDPOINT_DOT_OUTSET),
    y: center.y + (outwardNormal.y * CONNECTION_ENDPOINT_DOT_OUTSET),
  };
  return `M ${visibleCenter.x - radius} ${visibleCenter.y} A ${radius} ${radius} 0 1 0 ${visibleCenter.x + radius} ${visibleCenter.y} A ${radius} ${radius} 0 1 0 ${visibleCenter.x - radius} ${visibleCenter.y} Z`;
}

function getSelfAnnotationPosition(points: readonly Point[]): Point | null {
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

function getSelfVerticalAnnotationSegment(points: readonly Point[]): { start: Point; end: Point } | null {
  const firstPeak = points[1];
  const secondPeak = points[2];
  const center = points[0];
  if (!firstPeak || !secondPeak || !center) {
    return null;
  }

  if (Math.abs(firstPeak.y - secondPeak.y) > 1e-9) {
    return null;
  }

  const isHorizontalSideAboveCenter = firstPeak.y < center.y;
  const start = isHorizontalSideAboveCenter
    ? (firstPeak.x >= secondPeak.x ? firstPeak : secondPeak)
    : (firstPeak.x <= secondPeak.x ? firstPeak : secondPeak);
  const end = isHorizontalSideAboveCenter
    ? (firstPeak.x >= secondPeak.x ? secondPeak : firstPeak)
    : (firstPeak.x <= secondPeak.x ? secondPeak : firstPeak);

  return {
    start,
    end,
  };
}

function getSegmentCenter(segment: { start: Point; end: Point }): Point {
  return {
    x: (segment.start.x + segment.end.x) / 2,
    y: (segment.start.y + segment.end.y) / 2,
  };
}

function getConnectionCenterFromGeometry(geometry: ConnectionRenderGeometry): Point | null {
  return sampleConnectionGeometryAtFraction(geometry, 0.5)?.point ?? null;
}

function getStubLabelGeometry(
  start: Point,
  end: Point,
): ConnectionLabelGeometry | null {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return null;
  }

  const center = getSegmentCenter({ start, end });
  const isMostlyHorizontal = Math.abs(dx) >= Math.abs(dy);

  if (isMostlyHorizontal) {
    return {
      x: center.x,
      y: center.y - 8,
      textAnchor: 'middle',
    };
  }

  return {
    x: center.x + 10,
    y: center.y,
    textAnchor: 'start',
  };
}

export interface MapCanvasConnectionsProps {
  rooms: Readonly<Record<string, Room>>;
  pseudoRooms: Readonly<Record<string, PseudoRoom>>;
  connections: Readonly<Record<string, Connection>>;
  stickyNotes: Readonly<Record<string, StickyNote>>;
  stickyNoteLinks: Readonly<Record<string, StickyNoteLink>>;
  onOpenConnectionEditor: (connectionId: string) => void;
  suppressCanvasClick: () => void;
  theme: ThemeMode;
  visualStyle: MapVisualStyle;
  toMapPoint: (clientX: number, clientY: number) => PanOffset;
}

export function MapCanvasConnections({
  rooms,
  pseudoRooms,
  connections,
  stickyNotes,
  stickyNoteLinks,
  onOpenConnectionEditor,
  suppressCanvasClick,
  theme,
  visualStyle,
  toMapPoint,
}: MapCanvasConnectionsProps): React.JSX.Element {
  const connectionDrag = useEditorStore((s) => s.connectionDrag);
  const stickyNoteLinkDrag = useEditorStore((s) => s.stickyNoteLinkDrag);
  const connectionEndpointDrag = useEditorStore((s) => s.connectionEndpointDrag);
  const selectionDrag = useEditorStore((s) => s.selectionDrag);
  const canvasInteractionMode = useEditorStore((s) => s.canvasInteractionMode);
  const selectedConnectionIds = useEditorStore((s) => s.selectedConnectionIds);
  const selectedStickyNoteLinkIds = useEditorStore((s) => s.selectedStickyNoteLinkIds);
  const useBezierConnectionsEnabled = useEditorStore((s) => s.useBezierConnectionsEnabled);
  const selectConnection = useEditorStore((s) => s.selectConnection);
  const addConnectionToSelection = useEditorStore((s) => s.addConnectionToSelection);
  const selectStickyNoteLink = useEditorStore((s) => s.selectStickyNoteLink);
  const addStickyNoteLinkToSelection = useEditorStore((s) => s.addStickyNoteLinkToSelection);
  const startConnectionEndpointDrag = useEditorStore((s) => s.startConnectionEndpointDrag);
  const updateConnectionEndpointDrag = useEditorStore((s) => s.updateConnectionEndpointDrag);
  const completeConnectionEndpointDrag = useEditorStore((s) => s.completeConnectionEndpointDrag);
  const cancelConnectionEndpointDrag = useEditorStore((s) => s.cancelConnectionEndpointDrag);
  const interactionsDisabled = canvasInteractionMode === 'draw';
  const entries = Object.values(connections);
  const stickyNoteLinkEntries = Object.values(stickyNoteLinks);

  const getTargetVisualRoom = (connection: Connection): Room | null => {
    if (connection.target.kind === 'room') {
      return rooms[connection.target.id] ?? null;
    }

    const pseudoRoom = pseudoRooms[connection.target.id];
    return pseudoRoom ? toPseudoRoomVisualRoom(applyPseudoRoomDragOffset(pseudoRoom, selectionDrag)) : null;
  };

  const getTargetDimensions = (connection: Connection, room: Room): { readonly width: number; readonly height: number } => (
    connection.target.kind === 'room'
      ? getRoomNodeDimensions(room, visualStyle)
      : getPseudoRoomNodeDimensionsForRoom(room, visualStyle)
  );

  const getConnectionEndpointDotBounds = (
    room: Room,
    dimensions: { readonly width: number; readonly height: number },
  ): ConnectionEndpointDotTargetBounds => ({
    id: room.id,
    left: room.position.x,
    top: room.position.y,
    width: dimensions.width,
    height: dimensions.height,
  });

  const getConnectionEndpointDotPoint = (
    room: Room,
    dimensions: { readonly width: number; readonly height: number },
    boundaryPoint: Point,
    adjacentPoint: Point | undefined,
  ): Point => {
    if (!adjacentPoint) {
      return boundaryPoint;
    }

    return getRoomPerimeterPointToward(
      room.position,
      adjacentPoint,
      dimensions,
      room.shape,
    );
  };

  const beginConnectionEndpointDrag = (
    connectionId: string,
    endpoint: 'start' | 'end',
    event: React.MouseEvent<SVGCircleElement>,
  ): void => {
    if (event.button !== 0 || interactionsDisabled) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    suppressCanvasClick();
    const startPoint = toMapPoint(event.clientX, event.clientY);
    startConnectionEndpointDrag(connectionId, endpoint, startPoint.x, startPoint.y);

    const handleMouseMove = (moveEvent: MouseEvent) => {
      suppressCanvasClick();
      const cursorPoint = toMapPoint(moveEvent.clientX, moveEvent.clientY);
      updateConnectionEndpointDrag(cursorPoint.x, cursorPoint.y);
    };

    const handleMouseUp = (upEvent: MouseEvent) => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);

      const target = (typeof document.elementFromPoint === 'function'
        ? (document.elementFromPoint(upEvent.clientX, upEvent.clientY) as Element | null)
        : null)
        ?? (upEvent.target as Element | null);
      const roomElement = target?.closest?.('[data-room-id]') as HTMLElement | null;
      if (!roomElement) {
        cancelConnectionEndpointDrag();
        return;
      }

      const targetRoomId = roomElement.getAttribute('data-room-id');
      if (!targetRoomId) {
        cancelConnectionEndpointDrag();
        return;
      }

      const handleElement = target?.closest?.('[data-direction]') as HTMLElement | null;
      const targetDirection = handleElement?.getAttribute('data-direction') ?? undefined;
      completeConnectionEndpointDrag(targetRoomId, targetDirection);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const renderConnectionLine = (
    conn: Connection,
    sourceRoom: Room,
    targetRoom: Room,
    points: readonly Point[],
    geometry: ConnectionRenderGeometry,
    isSelfConnection: boolean,
  ): React.JSX.Element => {
    const isSelected = selectedConnectionIds.includes(conn.id);
    const baseClassName = isSelfConnection ? 'connection-line connection-line--self' : 'connection-line';
    const sourceDirections = findRoomDirectionsForConnection(sourceRoom, conn.id);
    const sourceDirection = sourceDirections[0] ?? null;
    const targetDirection = conn.isBidirectional
      ? (isSelfConnection
        ? (sourceDirections[1] ?? null)
        : (findRoomDirectionForConnection(targetRoom, conn.id) ?? null))
      : null;
    const explicitAnnotationKind = conn.annotation?.kind ?? null;
    const derivedVerticalAnnotationKind = getDerivedVerticalAnnotationKind(conn, sourceDirection, targetDirection);
    const directionalAnnotationKind = explicitAnnotationKind === 'up'
      || explicitAnnotationKind === 'down'
      || explicitAnnotationKind === 'in'
      || explicitAnnotationKind === 'out'
      ? explicitAnnotationKind
      : derivedVerticalAnnotationKind;
    const annotationText = explicitAnnotationKind === 'text' ? conn.annotation?.text?.trim() ?? '' : '';
    const rendersDirectionalAnnotation = directionalAnnotationKind === 'up'
      || directionalAnnotationKind === 'down'
      || directionalAnnotationKind === 'in'
      || directionalAnnotationKind === 'out';
    const rendersTextAnnotation = explicitAnnotationKind === 'text' && annotationText.length > 0;
    const directionalAnnotationIntent = rendersDirectionalAnnotation
      ? getDirectionalAnnotationRenderIntent(
        directionalAnnotationKind,
        geometry,
        geometry.kind === 'polyline' && !isSelfConnection ? getLongestSegment(points) : null,
        sourceDirection,
        targetDirection,
      )
      : null;
    const rendersSelfVerticalDirectionalAnnotation = isSelfConnection
      && (directionalAnnotationKind === 'up' || directionalAnnotationKind === 'down')
      && (sourceDirection === 'up'
        || sourceDirection === 'down'
        || targetDirection === 'up'
        || targetDirection === 'down');
    const annotationLabel = directionalAnnotationIntent?.label ?? annotationText;
    const rendersDoorAnnotation = explicitAnnotationKind === 'door';
    const rendersLockedDoorAnnotation = explicitAnnotationKind === 'locked door';
    const textAnnotationSegment = geometry.kind === 'polyline' && rendersTextAnnotation ? getLongestSegment(points) : null;
    const doorSegment = geometry.kind === 'polyline' && rendersDoorAnnotation ? getLongestSegment(points) : null;
    const lockedDoorSegment = geometry.kind === 'polyline' && rendersLockedDoorAnnotation ? getLongestSegment(points) : null;
    let annotationGeometry: ReturnType<typeof getAnnotationGeometryFromSegment> = null;
    if (rendersSelfVerticalDirectionalAnnotation) {
      const selfVerticalSegment = getSelfVerticalAnnotationSegment(points);
      annotationGeometry = selfVerticalSegment
        ? getAnnotationGeometryFromSegment(
          selfVerticalSegment,
          directionalAnnotationKind === 'down',
          annotationLabel,
          true,
          false,
        )
        : null;
    } else if (directionalAnnotationIntent?.positionSample?.kind === 'segment') {
      annotationGeometry = getAnnotationGeometryFromSegment(
        directionalAnnotationIntent.positionSample.segment,
        directionalAnnotationIntent.reverseDirection,
        annotationLabel,
        directionalAnnotationIntent.compactLength,
        directionalAnnotationIntent.preferPositiveNormalX,
      );
    } else if (directionalAnnotationIntent?.positionSample?.kind === 'curve') {
      annotationGeometry = getAnnotationGeometryFromRenderGeometry(
        directionalAnnotationIntent.positionSample.geometry,
        directionalAnnotationIntent.reverseDirection,
        annotationLabel,
        directionalAnnotationIntent.compactLength,
        directionalAnnotationIntent.preferPositiveNormalX,
      );
    }
    const textAnnotationGeometry = geometry.kind === 'polyline'
      ? (textAnnotationSegment ? getAnnotationGeometryFromSegment(textAnnotationSegment, false, annotationLabel, false) : null)
      : rendersTextAnnotation
        ? getAnnotationGeometryFromRenderGeometry(geometry, false, annotationLabel, false)
        : null;
    const selfAnnotationPosition = rendersDirectionalAnnotation
      && isSelfConnection
      && !rendersSelfVerticalDirectionalAnnotation
      ? getSelfAnnotationPosition(points)
      : null;
    const doorCenter = geometry.kind === 'polyline'
      ? (doorSegment ? getSegmentCenter(doorSegment) : null)
      : rendersDoorAnnotation
        ? getConnectionCenterFromGeometry(geometry)
        : null;
    const lockedDoorCenter = geometry.kind === 'polyline'
      ? (lockedDoorSegment ? getSegmentCenter(lockedDoorSegment) : null)
      : rendersLockedDoorAnnotation
        ? getConnectionCenterFromGeometry(geometry)
        : null;
    const connectionStroke = getRoomStrokeColor(conn.strokeColorIndex, theme);
    const pathData = geometry.kind === 'polyline' ? null : connectionGeometryToSvgPath(geometry);
    const visiblePolylineResult = getVisibleConnectionSegments(
      conn,
      geometry.kind === 'polyline' ? points : geometry,
      gapObstacles,
    );
    const usesGapRendering = !(conn.target.kind === 'room' && conn.sourceRoomId === conn.target.id)
      && visiblePolylineResult.hasGap;
    const selectionHaloStroke = theme === 'dark' ? 'rgba(248, 113, 113, 0.55)' : 'rgba(239, 68, 68, 0.5)';
    const selectionUnderlayStroke = theme === 'dark' ? 'rgba(251, 146, 60, 0.82)' : 'rgba(234, 88, 12, 0.8)';

    return (
      <>
        {geometry.kind === 'polyline' ? (
          <>
            <polyline
              data-testid={`connection-hit-target-${conn.id}`}
              data-connection-id={conn.id}
              className="connection-hit-target"
              points={pointsToSvgString(points)}
              fill="none"
              stroke="transparent"
              strokeWidth="18"
              style={{ pointerEvents: interactionsDisabled ? 'none' : 'stroke', cursor: interactionsDisabled ? 'default' : 'pointer' }}
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
            {usesGapRendering ? (
              <>
                {isSelected && visiblePolylineResult.segments.map((segment, index) => (
                  <line
                    key={`connection-selection-halo-segment-${conn.id}-${index}`}
                    data-testid={`connection-selection-halo-segment-${conn.id}-${index}`}
                    className="connection-line connection-line--selected-halo"
                    x1={segment.start.x}
                    y1={segment.start.y}
                    x2={segment.end.x}
                    y2={segment.end.y}
                    style={{
                      stroke: selectionHaloStroke,
                      strokeWidth: 10,
                      strokeDasharray: '7 5',
                      strokeLinecap: 'round',
                      pointerEvents: 'none',
                    }}
                  />
                ))}
                {isSelected && visiblePolylineResult.segments.map((segment, index) => (
                  <line
                    key={`connection-selection-underlay-segment-${conn.id}-${index}`}
                    data-testid={`connection-selection-underlay-segment-${conn.id}-${index}`}
                    className="connection-line connection-line--selected-underlay"
                    x1={segment.start.x}
                    y1={segment.start.y}
                    x2={segment.end.x}
                    y2={segment.end.y}
                    style={{
                      stroke: selectionUnderlayStroke,
                      strokeWidth: 7,
                      strokeLinecap: 'round',
                      pointerEvents: 'none',
                    }}
                  />
                ))}
                {visiblePolylineResult.segments.map((segment, index) => (
                  <line
                    key={`connection-line-segment-${conn.id}-${index}`}
                    data-testid={`connection-line-segment-${conn.id}-${index}`}
                    className={`${baseClassName}${isSelected ? ' connection-line--selected' : ''}`}
                    x1={segment.start.x}
                    y1={segment.start.y}
                    x2={segment.end.x}
                    y2={segment.end.y}
                    style={{
                      stroke: connectionStroke,
                      strokeWidth: 2,
                      strokeDasharray: getRoomStrokeDasharray(conn.strokeStyle),
                      strokeLinecap: 'round',
                      pointerEvents: 'none',
                    }}
                  />
                ))}
              </>
            ) : (
              <>
                {isSelected && (
                  <polyline
                    data-testid={`connection-selection-halo-${conn.id}`}
                    className="connection-line connection-line--selected-halo"
                    points={pointsToSvgString(points)}
                    fill="none"
                    style={{
                      stroke: selectionHaloStroke,
                      strokeWidth: 10,
                      strokeDasharray: '7 5',
                      strokeLinecap: 'round',
                      pointerEvents: 'none',
                    }}
                  />
                )}
                {isSelected && (
                  <polyline
                    data-testid={`connection-selection-underlay-${conn.id}`}
                    className="connection-line connection-line--selected-underlay"
                    points={pointsToSvgString(points)}
                    fill="none"
                    style={{
                      stroke: selectionUnderlayStroke,
                      strokeWidth: 7,
                      strokeLinecap: 'round',
                      pointerEvents: 'none',
                    }}
                  />
                )}
                <polyline
                  data-testid={`connection-line-${conn.id}`}
                  className={`${baseClassName}${isSelected ? ' connection-line--selected' : ''}`}
                  points={pointsToSvgString(points)}
                  fill="none"
                  style={{
                    stroke: connectionStroke,
                    strokeWidth: 2,
                    strokeDasharray: getRoomStrokeDasharray(conn.strokeStyle),
                    strokeLinecap: 'round',
                    pointerEvents: 'none',
                  }}
                />
              </>
            )}
          </>
        ) : (
          <>
            <path
              data-testid={`connection-hit-target-${conn.id}`}
              data-connection-id={conn.id}
              className="connection-hit-target"
              d={pathData ?? ''}
              fill="none"
              stroke="transparent"
              strokeWidth="18"
              style={{ pointerEvents: interactionsDisabled ? 'none' : 'stroke', cursor: interactionsDisabled ? 'default' : 'pointer' }}
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
            {usesGapRendering ? (
              <>
                {isSelected && visiblePolylineResult.segments.map((segment, index) => (
                  <line
                    key={`connection-selection-halo-segment-${conn.id}-${index}`}
                    data-testid={`connection-selection-halo-segment-${conn.id}-${index}`}
                    className="connection-line connection-line--selected-halo"
                    x1={segment.start.x}
                    y1={segment.start.y}
                    x2={segment.end.x}
                    y2={segment.end.y}
                    style={{
                      stroke: selectionHaloStroke,
                      strokeWidth: 10,
                      strokeDasharray: '7 5',
                      strokeLinecap: 'round',
                      pointerEvents: 'none',
                    }}
                  />
                ))}
                {isSelected && visiblePolylineResult.segments.map((segment, index) => (
                  <line
                    key={`connection-selection-underlay-segment-${conn.id}-${index}`}
                    data-testid={`connection-selection-underlay-segment-${conn.id}-${index}`}
                    className="connection-line connection-line--selected-underlay"
                    x1={segment.start.x}
                    y1={segment.start.y}
                    x2={segment.end.x}
                    y2={segment.end.y}
                    style={{
                      stroke: selectionUnderlayStroke,
                      strokeWidth: 7,
                      strokeLinecap: 'round',
                      pointerEvents: 'none',
                    }}
                  />
                ))}
                {visiblePolylineResult.segments.map((segment, index) => (
                  <line
                    key={`connection-line-segment-${conn.id}-${index}`}
                    data-testid={`connection-line-segment-${conn.id}-${index}`}
                    className={`${baseClassName}${isSelected ? ' connection-line--selected' : ''}`}
                    x1={segment.start.x}
                    y1={segment.start.y}
                    x2={segment.end.x}
                    y2={segment.end.y}
                    style={{
                      stroke: connectionStroke,
                      strokeWidth: 2,
                      strokeDasharray: getRoomStrokeDasharray(conn.strokeStyle),
                      strokeLinecap: 'round',
                      pointerEvents: 'none',
                    }}
                  />
                ))}
              </>
            ) : (
              <>
                {isSelected && (
                  <path
                    data-testid={`connection-selection-halo-${conn.id}`}
                    className="connection-line connection-line--selected-halo"
                    d={pathData ?? ''}
                    fill="none"
                    style={{
                      stroke: selectionHaloStroke,
                      strokeWidth: 10,
                      strokeDasharray: '7 5',
                      strokeLinecap: 'round',
                      pointerEvents: 'none',
                    }}
                  />
                )}
                {isSelected && (
                  <path
                    data-testid={`connection-selection-underlay-${conn.id}`}
                    className="connection-line connection-line--selected-underlay"
                    d={pathData ?? ''}
                    fill="none"
                    style={{
                      stroke: selectionUnderlayStroke,
                      strokeWidth: 7,
                      strokeLinecap: 'round',
                      pointerEvents: 'none',
                    }}
                  />
                )}
                <path
                  data-testid={`connection-line-${conn.id}`}
                  className={`${baseClassName}${isSelected ? ' connection-line--selected' : ''}`}
                  d={pathData ?? ''}
                  fill="none"
                  style={{
                    stroke: connectionStroke,
                    strokeWidth: 2,
                    strokeDasharray: getRoomStrokeDasharray(conn.strokeStyle),
                    strokeLinecap: 'round',
                    pointerEvents: 'none',
                  }}
                />
              </>
            )}
          </>
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
              transform={`rotate(${normalizeReadableTextRotation(annotationGeometry.rotationDegrees)} ${annotationGeometry.textPosition.x} ${annotationGeometry.textPosition.y})`}
            >
              {annotationLabel}
            </text>
          </>
        )}
        {textAnnotationGeometry && (
          <text
            data-testid={`connection-annotation-text-${conn.id}`}
            className="connection-annotation-text"
            x={textAnnotationGeometry.textPosition.x}
            y={textAnnotationGeometry.textPosition.y}
            textAnchor="middle"
            dominantBaseline="middle"
            transform={`rotate(${normalizeReadableTextRotation(textAnnotationGeometry.rotationDegrees)} ${textAnnotationGeometry.textPosition.x} ${textAnnotationGeometry.textPosition.y})`}
          >
            {annotationLabel}
          </text>
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
        {doorCenter && (
          <g
            data-testid={`connection-annotation-door-${conn.id}`}
            className="connection-annotation-door"
            transform={`translate(${doorCenter.x - (CONNECTION_DOOR_ICON_SIZE / 2)} ${doorCenter.y - (CONNECTION_DOOR_ICON_SIZE / 2)})`}
            pointerEvents="none"
          >
            <ConnectionAnnotationIcon kind="door" color={connectionStroke} />
          </g>
        )}
        {lockedDoorCenter && (
          <g
            data-testid={`connection-annotation-padlock-${conn.id}`}
            className="connection-annotation-padlock"
            transform={`translate(${lockedDoorCenter.x - (CONNECTION_LOCKED_DOOR_ICON_SIZE / 2)} ${lockedDoorCenter.y - (CONNECTION_LOCKED_DOOR_ICON_SIZE / 2)})`}
            pointerEvents="none"
          >
            <ConnectionAnnotationIcon kind="locked door" color={connectionStroke} />
          </g>
        )}
      </>
    );
  };

  const renderConnectionEndpointLabels = (
    conn: Connection,
    points: readonly Point[],
  ): React.JSX.Element | null => {
    const startLabel = conn.startLabel.trim();
    const endLabel = conn.endLabel.trim();
    const startLabelGeometry = points.length >= 2 ? getStubLabelGeometry(points[0], points[1]) : null;
    const endLabelGeometry = conn.isBidirectional && points.length >= 2
      ? getStubLabelGeometry(points[points.length - 2], points[points.length - 1])
      : null;

    if ((!startLabel || !startLabelGeometry) && (!conn.isBidirectional || !endLabel || !endLabelGeometry)) {
      return null;
    }

    return (
      <>
        {startLabel.length > 0 && startLabelGeometry && (
          <text
            data-testid={`connection-start-label-${conn.id}`}
            className="connection-endpoint-label"
            x={startLabelGeometry.x}
            y={startLabelGeometry.y}
            textAnchor={startLabelGeometry.textAnchor}
            dominantBaseline="middle"
          >
            {startLabel}
          </text>
        )}
        {conn.isBidirectional && endLabel.length > 0 && endLabelGeometry && (
          <text
            data-testid={`connection-end-label-${conn.id}`}
            className="connection-endpoint-label"
            x={endLabelGeometry.x}
            y={endLabelGeometry.y}
            textAnchor={endLabelGeometry.textAnchor}
            dominantBaseline="middle"
          >
            {endLabel}
          </text>
        )}
      </>
    );
  };

  const getStickyNoteWithDrag = (stickyNote: StickyNote): StickyNote => (
    applyStickyNoteDragOffset(stickyNote, selectionDrag)
  );

  const gapObstacles: Readonly<Record<string, PassThroughObstacle>> = Object.fromEntries([
    ...Object.entries(rooms).map(([roomId, room]) => [
      roomId,
      getRoomPassThroughBounds(
        getRoomForVisualStyle(applyDragOffset(room, selectionDrag), visualStyle),
        visualStyle,
        PASS_THROUGH_TINY_GAP_PADDING,
      ),
    ]),
    ...Object.entries(pseudoRooms).map(([pseudoRoomId, pseudoRoom]) => {
      const visualRoom = getRoomForVisualStyle(
        toPseudoRoomVisualRoom(applyPseudoRoomDragOffset(pseudoRoom, selectionDrag)),
        visualStyle,
      );
      const dimensions = getPseudoRoomNodeDimensionsForRoom(visualRoom, visualStyle);
      return [
        pseudoRoomId,
        {
          id: pseudoRoomId,
          left: visualRoom.position.x - PASS_THROUGH_TINY_GAP_PADDING,
          right: visualRoom.position.x + dimensions.width + PASS_THROUGH_TINY_GAP_PADDING,
          top: visualRoom.position.y - PASS_THROUGH_TINY_GAP_PADDING,
          bottom: visualRoom.position.y + dimensions.height + PASS_THROUGH_TINY_GAP_PADDING,
        },
      ];
    }),
  ]);

  const renderConnectionRerouteHandles = (
    connection: Connection,
    start: Point,
    end: Point,
  ): React.JSX.Element | null => {
    if (!selectedConnectionIds.includes(connection.id) || interactionsDisabled) {
      return null;
    }

    return (
      <>
        {([
          ['start', start],
          ['end', end],
        ] as const).map(([endpoint, point]) => (
          <g key={`connection-reroute-handle-${connection.id}-${endpoint}`}>
            <circle
              data-testid={`connection-reroute-handle-${connection.id}-${endpoint}`}
              cx={point.x}
              cy={point.y}
              r={CONNECTION_REROUTE_HANDLE_RADIUS}
              fill="#ffffff"
              stroke="#f59e0b"
              strokeWidth="2"
              style={{ cursor: 'grab', pointerEvents: 'all' }}
              onMouseDown={(event) => beginConnectionEndpointDrag(connection.id, endpoint, event)}
            />
            <circle
              cx={point.x}
              cy={point.y}
              r={CONNECTION_REROUTE_HANDLE_INNER_RADIUS}
              fill="#f59e0b"
              pointerEvents="none"
            />
          </g>
        ))}
      </>
    );
  };

  const getConnectionReroutePreviewPoints = (
    connection: Connection,
    sourceRoom: Room,
    targetRoom: Room,
    sourceDimensions: ReturnType<typeof getRoomNodeDimensions>,
    targetDimensions: ReturnType<typeof getRoomNodeDimensions>,
    endpoint: 'start' | 'end',
    cursor: Point,
  ): Point[] => {
    const sourceDirection = findRoomDirectionForConnection(sourceRoom, connection.id);
    const targetDirection = connection.isBidirectional
      ? findRoomDirectionForConnection(targetRoom, connection.id)
      : undefined;

    if (endpoint === 'end') {
      return sourceDirection
        ? computePreviewPath(
          sourceRoom,
          sourceDirection,
          cursor.x,
          cursor.y,
          undefined,
          sourceDimensions,
        )
        : [getRoomCenter(sourceRoom.position, sourceDimensions), cursor];
    }

    if (targetDirection) {
      return [...computePreviewPath(
        targetRoom,
        targetDirection,
        cursor.x,
        cursor.y,
        undefined,
        targetDimensions,
      )].reverse();
    }

    return [
      cursor,
      getRoomCenter(targetRoom.position, targetDimensions),
    ];
  };

  const renderedConnections = entries.flatMap((conn) => {
    const rawSrc = rooms[conn.sourceRoomId];
    const rawTgt = getTargetVisualRoom(conn);
    if (!rawSrc || !rawTgt) {
      return [];
    }

    const src = getRoomForVisualStyle(applyDragOffset(rawSrc, selectionDrag), visualStyle);
    const tgt = getRoomForVisualStyle(applyDragOffset(rawTgt, selectionDrag), visualStyle);
    const srcDimensions = getRoomNodeDimensions(src, visualStyle);
    const tgtDimensions = getTargetDimensions(conn, tgt);
    const points = computeConnectionPath(src, tgt, conn, undefined, srcDimensions, tgtDimensions);
    const geometry = createConnectionRenderGeometry(
      points,
      conn.isBidirectional,
      useBezierConnectionsEnabled,
      conn.target.kind === 'room' && conn.sourceRoomId === conn.target.id,
    );
    const arrowPointSets = !conn.isBidirectional ? computeGeometryArrowheadPoints(geometry) : [];
    const startDotPoint = points.length >= 2
      ? getConnectionEndpointDotPoint(src, srcDimensions, points[0], points[1])
      : null;
    const endDotPoint = points.length >= 2
      ? getConnectionEndpointDotPoint(tgt, tgtDimensions, points[points.length - 1], points[points.length - 2])
      : null;
    const startDotInput = startDotPoint
      ? createConnectionEndpointDotInput(
        `${conn.id}-start`,
        startDotPoint,
        getConnectionEndpointDotBounds(src, srcDimensions),
      )
      : null;
    const endDotInput = endDotPoint
      ? createConnectionEndpointDotInput(
        `${conn.id}-end`,
        endDotPoint,
        getConnectionEndpointDotBounds(tgt, tgtDimensions),
      )
      : null;

    return [{
      conn,
      src,
      tgt,
      points,
      geometry,
      arrowPointSets,
      dotInputs: [startDotInput, endDotInput].filter((input): input is NonNullable<typeof input> => input !== null),
    }];
  });

  const connectionEndpointDots = spreadConnectionEndpointDots(
    renderedConnections.flatMap((renderedConnection) => renderedConnection.dotInputs),
  );
  const connectionEndpointDotById = new Map(
    connectionEndpointDots.map((dot) => [dot.id, dot] as const),
  );

  return (
    <>
      <svg
        className="connection-svg-overlay"
        data-testid="connection-svg-overlay"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          overflow: 'visible',
          pointerEvents: 'none',
          zIndex: 'var(--map-layer-connections)',
        }}
      >
        {renderedConnections.map(({ conn, src, tgt, points, geometry, arrowPointSets }) => {
          return (
            <g key={conn.id}>
              {renderConnectionLine(conn, src, tgt, points, geometry, conn.target.kind === 'room' && conn.sourceRoomId === conn.target.id)}
              {arrowPointSets.map((arrowPoints, index) => (
                <polygon
                  key={`${conn.id}-arrow-${index}`}
                  data-testid={`connection-arrow-${conn.id}-${index}`}
                  points={pointsToSvgString(arrowPoints)}
                  fill={getRoomStrokeColor(conn.strokeColorIndex, theme)}
                />
              ))}
              {(['start', 'end'] as const).map((endpoint) => {
                const dot = connectionEndpointDotById.get(`${conn.id}-${endpoint}`);
                if (!dot) {
                  return null;
                }

                return (
                  <path
                    key={`${conn.id}-endpoint-dot-${endpoint}`}
                    data-testid={`connection-endpoint-dot-${conn.id}-${endpoint}`}
                    d={getEndpointDotPath(dot.center, dot.radius, dot.outwardNormal)}
                    fill={getRoomStrokeColor(conn.strokeColorIndex, theme)}
                    pointerEvents="none"
                  />
                );
              })}
            </g>
          );
        })}

        {stickyNoteLinkEntries.map((stickyNoteLink) => {
          const rawStickyNote = stickyNotes[stickyNoteLink.stickyNoteId];
          const rawRoom = stickyNoteLink.target.kind === 'room'
            ? rooms[stickyNoteLink.target.id]
            : (pseudoRooms[stickyNoteLink.target.id]
              ? toPseudoRoomVisualRoom(applyPseudoRoomDragOffset(pseudoRooms[stickyNoteLink.target.id], selectionDrag))
              : undefined);
          if (!rawStickyNote || !rawRoom) {
            return null;
          }

          const stickyNote = getStickyNoteWithDrag(rawStickyNote);
          const room = stickyNoteLink.target.kind === 'room' ? applyDragOffset(rawRoom, selectionDrag) : rawRoom;
          const stickyNoteCenter = getStickyNoteCenter(stickyNote);
          const roomDimensions = stickyNoteLink.target.kind === 'room'
            ? getRoomNodeDimensions(room, visualStyle)
            : getPseudoRoomNodeDimensionsForRoom(room, visualStyle);
          const roomCenter = {
            x: room.position.x + (roomDimensions.width / 2),
            y: room.position.y + (roomDimensions.height / 2),
          };
          const isSelected = selectedStickyNoteLinkIds.includes(stickyNoteLink.id);

          return (
            <g key={stickyNoteLink.id}>
              <line
                data-testid={`sticky-note-link-hit-target-${stickyNoteLink.id}`}
                data-sticky-note-link-id={stickyNoteLink.id}
                className="connection-hit-target"
                x1={stickyNoteCenter.x}
                y1={stickyNoteCenter.y}
                x2={roomCenter.x}
                y2={roomCenter.y}
                stroke="transparent"
                strokeWidth="18"
                style={{ pointerEvents: interactionsDisabled ? 'none' : 'stroke', cursor: interactionsDisabled ? 'default' : 'pointer' }}
                onClick={(event) => {
                  event.stopPropagation();
                  if (event.shiftKey) {
                    addStickyNoteLinkToSelection(stickyNoteLink.id);
                  } else {
                    selectStickyNoteLink(stickyNoteLink.id);
                  }
                }}
              />
              {isSelected && (
                <line
                  data-testid={`sticky-note-link-selection-${stickyNoteLink.id}`}
                  className="sticky-note-link sticky-note-link--selected"
                  x1={stickyNoteCenter.x}
                  y1={stickyNoteCenter.y}
                  x2={roomCenter.x}
                  y2={roomCenter.y}
                  stroke="#ef4444"
                  strokeWidth="6"
                  strokeDasharray="5 4"
                />
              )}
              <line
                data-testid={`sticky-note-link-${stickyNoteLink.id}`}
                className={`sticky-note-link${isSelected ? ' sticky-note-link--selected-inner' : ''}`}
                x1={stickyNoteCenter.x}
                y1={stickyNoteCenter.y}
                x2={roomCenter.x}
                y2={roomCenter.y}
                stroke={isSelected ? '#f59e0b' : '#8a8156'}
                strokeWidth="2"
                strokeDasharray="5 4"
              />
            </g>
          );
        })}

        {connectionDrag && (() => {
          const srcRoom = rooms[connectionDrag.sourceRoomId];
          if (!srcRoom) return null;
          const adjustedSrc = getRoomForVisualStyle(applyDragOffset(srcRoom, selectionDrag), visualStyle);
          const srcDimensions = getRoomNodeDimensions(adjustedSrc, visualStyle);
          const points = computePreviewPath(
            adjustedSrc,
            connectionDrag.sourceDirection,
            connectionDrag.cursorX,
            connectionDrag.cursorY,
            undefined,
            srcDimensions,
          );
          const previewGeometry = createConnectionRenderGeometry(
            points,
            false,
            useBezierConnectionsEnabled,
            false,
          );

          return previewGeometry.kind === 'polyline' ? (
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
          ) : (
            <path
              data-testid="connection-preview-line"
              className="connection-preview-line"
              d={connectionGeometryToSvgPath(previewGeometry)}
              fill="none"
              stroke="#6366f1"
              strokeWidth="2"
              strokeDasharray="6 4"
              opacity="0.6"
            />
          );
        })()}

        {stickyNoteLinkDrag && (() => {
          const rawStickyNote = stickyNotes[stickyNoteLinkDrag.sourceStickyNoteId];
          if (!rawStickyNote) {
            return null;
          }

          const stickyNote = getStickyNoteWithDrag(rawStickyNote);
          const stickyNoteCenter = getStickyNoteCenter(stickyNote);
          return (
            <line
              data-testid="sticky-note-link-preview"
              className="sticky-note-link-preview"
              x1={stickyNoteCenter.x}
              y1={stickyNoteCenter.y}
              x2={stickyNoteLinkDrag.cursorX}
              y2={stickyNoteLinkDrag.cursorY}
              stroke="#8a8156"
              strokeWidth="2"
              strokeDasharray="5 4"
              opacity="0.7"
            />
          );
        })()}
      </svg>
      <svg
        className="connection-label-overlay"
        data-testid="connection-label-overlay"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          overflow: 'visible',
          pointerEvents: 'none',
          zIndex: 'var(--map-layer-connection-labels)',
        }}
      >
        {entries.map((conn) => {
          const rawSrc = rooms[conn.sourceRoomId];
          const rawTgt = getTargetVisualRoom(conn);
          if (!rawSrc || !rawTgt) return null;

          const src = applyDragOffset(rawSrc, selectionDrag);
          const tgt = getRoomForVisualStyle(applyDragOffset(rawTgt, selectionDrag), visualStyle);
          const effectiveSrc = getRoomForVisualStyle(src, visualStyle);
          const srcDimensions = getRoomNodeDimensions(effectiveSrc, visualStyle);
          const tgtDimensions = getTargetDimensions(conn, tgt);
          const points = computeConnectionPath(effectiveSrc, tgt, conn, undefined, srcDimensions, tgtDimensions);

          return <g key={`labels-${conn.id}`}>{renderConnectionEndpointLabels(conn, points)}</g>;
        })}
      </svg>
      <svg
        className="connection-reroute-overlay"
        data-testid="connection-reroute-overlay"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          overflow: 'visible',
          pointerEvents: 'none',
          zIndex: 'var(--map-layer-connection-reroute)',
        }}
      >
        {entries.map((conn) => {
          const rawSrc = rooms[conn.sourceRoomId];
          const rawTgt = getTargetVisualRoom(conn);
          if (!rawSrc || !rawTgt) return null;

          const src = getRoomForVisualStyle(applyDragOffset(rawSrc, selectionDrag), visualStyle);
          const tgt = getRoomForVisualStyle(applyDragOffset(rawTgt, selectionDrag), visualStyle);
          const srcDimensions = getRoomNodeDimensions(src, visualStyle);
          const tgtDimensions = getTargetDimensions(conn, tgt);
          const points = computeConnectionPath(src, tgt, conn, undefined, srcDimensions, tgtDimensions);

          return <g key={`reroute-handles-${conn.id}`}>{renderConnectionRerouteHandles(conn, points[0], points[points.length - 1])}</g>;
        })}

        {connectionEndpointDrag && (() => {
          const connection = connections[connectionEndpointDrag.connectionId];
          if (!connection) {
            return null;
          }

          const rawSrc = rooms[connection.sourceRoomId];
          const rawTgt = getTargetVisualRoom(connection);
          if (!rawSrc || !rawTgt) {
            return null;
          }

          const src = getRoomForVisualStyle(applyDragOffset(rawSrc, selectionDrag), visualStyle);
          const tgt = getRoomForVisualStyle(applyDragOffset(rawTgt, selectionDrag), visualStyle);
          const srcDimensions = getRoomNodeDimensions(src, visualStyle);
          const tgtDimensions = getTargetDimensions(connection, tgt);
          const previewPoint = {
            x: connectionEndpointDrag.cursorX,
            y: connectionEndpointDrag.cursorY,
          };
          const previewPoints = getConnectionReroutePreviewPoints(
            connection,
            src,
            tgt,
            srcDimensions,
            tgtDimensions,
            connectionEndpointDrag.endpoint,
            previewPoint,
          );
          const previewGeometry = createConnectionRenderGeometry(
            previewPoints,
            false,
            useBezierConnectionsEnabled,
            false,
          );

          return previewGeometry.kind === 'polyline' ? (
            <polyline
              data-testid="connection-reroute-preview-line"
              className="connection-preview-line"
              points={pointsToSvgString(previewPoints)}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="3"
              strokeDasharray="6 4"
              opacity="0.9"
              pointerEvents="none"
            />
          ) : (
            <path
              data-testid="connection-reroute-preview-line"
              className="connection-preview-line"
              d={connectionGeometryToSvgPath(previewGeometry)}
              fill="none"
              stroke="#f59e0b"
              strokeWidth="3"
              strokeDasharray="6 4"
              opacity="0.9"
              pointerEvents="none"
            />
          );
        })()}
      </svg>
    </>
  );
}
