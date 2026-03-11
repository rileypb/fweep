import { useEditorStore } from '../state/editor-store';
import {
  type Connection,
  type Room,
  type StickyNote,
  type StickyNoteLink,
} from '../domain/map-types';
import { getRoomStrokeColor, type ThemeMode } from '../domain/room-color-palette';
import {
  type ConnectionRenderGeometry,
  connectionGeometryToSvgPath,
  computeConnectionPath,
  computeGeometryArrowheadPoints,
  computePreviewPath,
  createConnectionRenderGeometry,
  findRoomDirectionForConnection,
  getConnectionGeometryLength,
  sampleConnectionGeometryAtFraction,
  pointsToSvgString,
  ROOM_HEIGHT,
} from '../graph/connection-geometry';
import { getRoomNodeWidth } from '../graph/minimap-geometry';
import { getRoomStrokeDasharray } from './map-canvas-helpers';
import { getStickyNoteCenter } from '../graph/sticky-note-geometry';
import { PADLOCK_HEIGHT, PADLOCK_WIDTH } from '../graph/padlock-geometry';
import { PadlockGlyph } from './padlock-glyph';

const CONNECTION_ANNOTATION_OFFSET = 8;
const CONNECTION_ANNOTATION_LENGTH_RATIO = 0.8;
const CONNECTION_ANNOTATION_ARROWHEAD_LENGTH = 10;
const CONNECTION_ANNOTATION_ARROWHEAD_WIDTH = 8;
const CONNECTION_ANNOTATION_TEXT_OFFSET = 12;
const CONNECTION_ANNOTATION_CHAR_WIDTH = 7;
const CONNECTION_ANNOTATION_PADDING = 12;
const CONNECTION_DOOR_WIDTH = 12;
const CONNECTION_DOOR_HEIGHT = 16;
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

interface VectorPoint {
  readonly x: number;
  readonly y: number;
}

interface ConnectionLabelGeometry {
  readonly x: number;
  readonly y: number;
  readonly textAnchor: 'start' | 'middle';
}

function getDerivedVerticalAnnotationKind(connection: Connection, sourceRoom: Room, targetRoom: Room): 'up' | 'down' | null {
  const sourceDirection = findRoomDirectionForConnection(sourceRoom, connection.id);
  const targetDirection = connection.isBidirectional
    ? findRoomDirectionForConnection(targetRoom, connection.id)
    : null;

  const sourceIsUp = sourceDirection === 'up';
  const targetIsUp = targetDirection === 'up';
  if ((sourceIsUp || targetIsUp) && !(sourceIsUp && targetIsUp)) {
    return 'up';
  }

  const sourceIsDown = sourceDirection === 'down';
  const targetIsDown = targetDirection === 'down';
  if ((sourceIsDown || targetIsDown) && !(sourceIsDown && targetIsDown)) {
    return 'down';
  }

  return null;
}

function getSegmentLength(start: VectorPoint, end: VectorPoint): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

function getLongestSegment(points: readonly VectorPoint[]): { start: VectorPoint; end: VectorPoint } | null {
  let bestSegment: { start: VectorPoint; end: VectorPoint } | null = null;
  let bestLength = -1;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const length = getSegmentLength(start, end);
    if (length > bestLength) {
      bestLength = length;
      bestSegment = { start, end };
    }
  }

  return bestSegment;
}

function getAnnotationGeometry(
  segment: { start: VectorPoint; end: VectorPoint },
  reverseDirection: boolean,
  annotationLabel: string,
  compactLength: boolean,
): {
  lineStart: VectorPoint;
  lineEnd: VectorPoint;
  arrowTip: VectorPoint;
  arrowBaseA: VectorPoint;
  arrowBaseB: VectorPoint;
  textPosition: VectorPoint;
  rotationDegrees: number;
} | null {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const length = Math.hypot(dx, dy);
  if (length === 0) {
    return null;
  }

  const ux = dx / length;
  const uy = dy / length;
  const directionX = reverseDirection ? -ux : ux;
  const directionY = reverseDirection ? -uy : uy;
  const normalX = -uy;
  const normalY = ux;
  const centerX = (segment.start.x + segment.end.x) / 2;
  const centerY = (segment.start.y + segment.end.y) / 2;
  const annotationCenterX = centerX + (normalX * CONNECTION_ANNOTATION_OFFSET);
  const annotationCenterY = centerY + (normalY * CONNECTION_ANNOTATION_OFFSET);
  const annotationLength = compactLength
    ? Math.min(
      length * CONNECTION_ANNOTATION_LENGTH_RATIO,
      Math.max(
        CONNECTION_ANNOTATION_ARROWHEAD_LENGTH + CONNECTION_ANNOTATION_PADDING,
        (annotationLabel.length * CONNECTION_ANNOTATION_CHAR_WIDTH) + CONNECTION_ANNOTATION_PADDING,
      ),
    )
    : length * CONNECTION_ANNOTATION_LENGTH_RATIO;
  const halfLength = annotationLength / 2;
  const lineStart = {
    x: annotationCenterX - (directionX * halfLength),
    y: annotationCenterY - (directionY * halfLength),
  };
  const lineEnd = {
    x: annotationCenterX + (directionX * halfLength),
    y: annotationCenterY + (directionY * halfLength),
  };
  const arrowTip = lineEnd;
  const arrowBaseCenter = {
    x: arrowTip.x - (directionX * CONNECTION_ANNOTATION_ARROWHEAD_LENGTH),
    y: arrowTip.y - (directionY * CONNECTION_ANNOTATION_ARROWHEAD_LENGTH),
  };
  const arrowBaseA = {
    x: arrowBaseCenter.x + (normalX * (CONNECTION_ANNOTATION_ARROWHEAD_WIDTH / 2)),
    y: arrowBaseCenter.y + (normalY * (CONNECTION_ANNOTATION_ARROWHEAD_WIDTH / 2)),
  };
  const arrowBaseB = {
    x: arrowBaseCenter.x - (normalX * (CONNECTION_ANNOTATION_ARROWHEAD_WIDTH / 2)),
    y: arrowBaseCenter.y - (normalY * (CONNECTION_ANNOTATION_ARROWHEAD_WIDTH / 2)),
  };
  const textPosition = {
    x: annotationCenterX + (normalX * CONNECTION_ANNOTATION_TEXT_OFFSET),
    y: annotationCenterY + (normalY * CONNECTION_ANNOTATION_TEXT_OFFSET),
  };
  const rotationDegrees = (Math.atan2(directionY, directionX) * 180) / Math.PI;

  return {
    lineStart,
    lineEnd,
    arrowTip,
    arrowBaseA,
    arrowBaseB,
    textPosition,
    rotationDegrees,
  };
}

function normalizeReadableTextRotation(rotationDegrees: number): number {
  if (rotationDegrees > 90) {
    return rotationDegrees - 180;
  }
  if (rotationDegrees <= -90) {
    return rotationDegrees + 180;
  }
  return rotationDegrees;
}

function getSelfAnnotationPosition(points: readonly VectorPoint[]): VectorPoint | null {
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

function getSegmentCenter(segment: { start: VectorPoint; end: VectorPoint }): VectorPoint {
  return {
    x: (segment.start.x + segment.end.x) / 2,
    y: (segment.start.y + segment.end.y) / 2,
  };
}

function getAnnotationGeometryFromRenderGeometry(
  geometry: ConnectionRenderGeometry,
  reverseDirection: boolean,
  annotationLabel: string,
  compactLength: boolean,
): {
  lineStart: VectorPoint;
  lineEnd: VectorPoint;
  arrowTip: VectorPoint;
  arrowBaseA: VectorPoint;
  arrowBaseB: VectorPoint;
  textPosition: VectorPoint;
  rotationDegrees: number;
} | null {
  const sample = sampleConnectionGeometryAtFraction(geometry, 0.5);
  if (!sample) {
    return null;
  }

  const tangentLength = Math.hypot(sample.tangent.x, sample.tangent.y);
  if (tangentLength === 0) {
    return null;
  }

  const ux = sample.tangent.x / tangentLength;
  const uy = sample.tangent.y / tangentLength;
  const directionX = reverseDirection ? -ux : ux;
  const directionY = reverseDirection ? -uy : uy;
  const normalX = -uy;
  const normalY = ux;
  const annotationCenterX = sample.point.x + (normalX * CONNECTION_ANNOTATION_OFFSET);
  const annotationCenterY = sample.point.y + (normalY * CONNECTION_ANNOTATION_OFFSET);
  const annotationLength = compactLength
    ? Math.min(
      getConnectionGeometryLength(geometry) * CONNECTION_ANNOTATION_LENGTH_RATIO,
      Math.max(
        CONNECTION_ANNOTATION_ARROWHEAD_LENGTH + CONNECTION_ANNOTATION_PADDING,
        (annotationLabel.length * CONNECTION_ANNOTATION_CHAR_WIDTH) + CONNECTION_ANNOTATION_PADDING,
      ),
    )
    : getConnectionGeometryLength(geometry) * CONNECTION_ANNOTATION_LENGTH_RATIO;
  const halfLength = annotationLength / 2;
  const lineStart = {
    x: annotationCenterX - (directionX * halfLength),
    y: annotationCenterY - (directionY * halfLength),
  };
  const lineEnd = {
    x: annotationCenterX + (directionX * halfLength),
    y: annotationCenterY + (directionY * halfLength),
  };
  const arrowTip = lineEnd;
  const arrowBaseCenter = {
    x: arrowTip.x - (directionX * CONNECTION_ANNOTATION_ARROWHEAD_LENGTH),
    y: arrowTip.y - (directionY * CONNECTION_ANNOTATION_ARROWHEAD_LENGTH),
  };
  const arrowBaseA = {
    x: arrowBaseCenter.x + (normalX * (CONNECTION_ANNOTATION_ARROWHEAD_WIDTH / 2)),
    y: arrowBaseCenter.y + (normalY * (CONNECTION_ANNOTATION_ARROWHEAD_WIDTH / 2)),
  };
  const arrowBaseB = {
    x: arrowBaseCenter.x - (normalX * (CONNECTION_ANNOTATION_ARROWHEAD_WIDTH / 2)),
    y: arrowBaseCenter.y - (normalY * (CONNECTION_ANNOTATION_ARROWHEAD_WIDTH / 2)),
  };
  const textPosition = {
    x: annotationCenterX + (normalX * CONNECTION_ANNOTATION_TEXT_OFFSET),
    y: annotationCenterY + (normalY * CONNECTION_ANNOTATION_TEXT_OFFSET),
  };

  return {
    lineStart,
    lineEnd,
    arrowTip,
    arrowBaseA,
    arrowBaseB,
    textPosition,
    rotationDegrees: (Math.atan2(directionY, directionX) * 180) / Math.PI,
  };
}

function getConnectionCenterFromGeometry(geometry: ConnectionRenderGeometry): VectorPoint | null {
  return sampleConnectionGeometryAtFraction(geometry, 0.5)?.point ?? null;
}

function getStubLabelGeometry(
  start: VectorPoint,
  end: VectorPoint,
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
  connections: Readonly<Record<string, Connection>>;
  stickyNotes: Readonly<Record<string, StickyNote>>;
  stickyNoteLinks: Readonly<Record<string, StickyNoteLink>>;
  onOpenConnectionEditor: (connectionId: string) => void;
  theme: ThemeMode;
}

export function MapCanvasConnections({
  rooms,
  connections,
  stickyNotes,
  stickyNoteLinks,
  onOpenConnectionEditor,
  theme,
}: MapCanvasConnectionsProps): React.JSX.Element {
  const connectionDrag = useEditorStore((s) => s.connectionDrag);
  const stickyNoteLinkDrag = useEditorStore((s) => s.stickyNoteLinkDrag);
  const selectionDrag = useEditorStore((s) => s.selectionDrag);
  const canvasInteractionMode = useEditorStore((s) => s.canvasInteractionMode);
  const selectedConnectionIds = useEditorStore((s) => s.selectedConnectionIds);
  const selectedStickyNoteLinkIds = useEditorStore((s) => s.selectedStickyNoteLinkIds);
  const useBezierConnectionsEnabled = useEditorStore((s) => s.useBezierConnectionsEnabled);
  const selectConnection = useEditorStore((s) => s.selectConnection);
  const addConnectionToSelection = useEditorStore((s) => s.addConnectionToSelection);
  const selectStickyNoteLink = useEditorStore((s) => s.selectStickyNoteLink);
  const addStickyNoteLinkToSelection = useEditorStore((s) => s.addStickyNoteLinkToSelection);
  const interactionsDisabled = canvasInteractionMode === 'draw';
  const entries = Object.values(connections);
  const stickyNoteLinkEntries = Object.values(stickyNoteLinks);

  const renderConnectionLine = (
    conn: Connection,
    sourceRoom: Room,
    targetRoom: Room,
    points: ReturnType<typeof computeConnectionPath>,
    geometry: ConnectionRenderGeometry,
    isSelfConnection: boolean,
  ): React.JSX.Element => {
    const isSelected = selectedConnectionIds.includes(conn.id);
    const baseClassName = isSelfConnection ? 'connection-line connection-line--self' : 'connection-line';
    const annotationKind = conn.annotation?.kind ?? getDerivedVerticalAnnotationKind(conn, sourceRoom, targetRoom);
    const annotationText = annotationKind === 'text' ? conn.annotation?.text?.trim() ?? '' : '';
    const rendersDirectionalAnnotation = annotationKind === 'up'
      || annotationKind === 'down'
      || annotationKind === 'in'
      || annotationKind === 'out';
    const rendersTextAnnotation = annotationKind === 'text' && annotationText.length > 0;
    const annotationLabel = annotationKind === 'up' || annotationKind === 'down'
      ? annotationKind
      : annotationKind === 'in' || annotationKind === 'out'
        ? 'in'
        : annotationText;
    const usesCompactDirectionalArrow = annotationKind === 'up' || annotationKind === 'down';
    const rendersDoorAnnotation = annotationKind === 'door';
    const rendersLockedDoorAnnotation = annotationKind === 'locked door';
    const annotationSegment = geometry.kind === 'polyline' && rendersDirectionalAnnotation && !isSelfConnection
      ? getLongestSegment(points)
      : null;
    const textAnnotationSegment = geometry.kind === 'polyline' && rendersTextAnnotation ? getLongestSegment(points) : null;
    const doorSegment = geometry.kind === 'polyline' && rendersDoorAnnotation ? getLongestSegment(points) : null;
    const lockedDoorSegment = geometry.kind === 'polyline' && rendersLockedDoorAnnotation ? getLongestSegment(points) : null;
    const annotationGeometry = geometry.kind === 'polyline'
      ? (annotationSegment
        ? getAnnotationGeometry(
          annotationSegment,
          annotationKind === 'down' || annotationKind === 'out',
          annotationLabel,
          usesCompactDirectionalArrow,
        )
        : null)
      : rendersDirectionalAnnotation && !isSelfConnection
        ? getAnnotationGeometryFromRenderGeometry(
          geometry,
          annotationKind === 'down' || annotationKind === 'out',
          annotationLabel,
          usesCompactDirectionalArrow,
        )
        : null;
    const textAnnotationGeometry = geometry.kind === 'polyline'
      ? (textAnnotationSegment ? getAnnotationGeometry(textAnnotationSegment, false, annotationLabel, false) : null)
      : rendersTextAnnotation
        ? getAnnotationGeometryFromRenderGeometry(geometry, false, annotationLabel, false)
        : null;
    const selfAnnotationPosition = rendersDirectionalAnnotation && isSelfConnection
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
            <polyline
              data-testid={`connection-line-${conn.id}`}
              className={`${baseClassName}${isSelected ? ' connection-line--selected' : ''}`}
              points={pointsToSvgString(points)}
              fill="none"
              style={{
                stroke: connectionStroke,
                strokeWidth: isSelected ? 6 : 2,
                strokeDasharray: getRoomStrokeDasharray(conn.strokeStyle),
                pointerEvents: 'none',
              }}
            />
            {isSelected && (
              <polyline
                data-testid={`connection-selection-inner-${conn.id}`}
                className="connection-line connection-line--selected-inner"
                points={pointsToSvgString(points)}
                fill="none"
                style={{
                  stroke: '#f59e0b',
                  strokeWidth: 2,
                  pointerEvents: 'none',
                }}
              />
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
            <path
              data-testid={`connection-line-${conn.id}`}
              className={`${baseClassName}${isSelected ? ' connection-line--selected' : ''}`}
              d={pathData ?? ''}
              fill="none"
              style={{
                stroke: connectionStroke,
                strokeWidth: isSelected ? 6 : 2,
                strokeDasharray: getRoomStrokeDasharray(conn.strokeStyle),
                pointerEvents: 'none',
              }}
            />
            {isSelected && (
              <path
                data-testid={`connection-selection-inner-${conn.id}`}
                className="connection-line connection-line--selected-inner"
                d={pathData ?? ''}
                fill="none"
                style={{
                  stroke: '#f59e0b',
                  strokeWidth: 2,
                  pointerEvents: 'none',
                }}
              />
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
            transform={`translate(${doorCenter.x - (CONNECTION_DOOR_WIDTH / 2)} ${doorCenter.y - (CONNECTION_DOOR_HEIGHT / 2)})`}
            pointerEvents="none"
          >
            <path
              d={`M1 ${CONNECTION_DOOR_HEIGHT - 1} L1 7 Q${CONNECTION_DOOR_WIDTH / 2} 1 ${CONNECTION_DOOR_WIDTH - 1} 7 L${CONNECTION_DOOR_WIDTH - 1} ${CONNECTION_DOOR_HEIGHT - 1} Z`}
              fill={connectionStroke}
              stroke={connectionStroke}
              strokeWidth="1.5"
            />
          </g>
        )}
        {lockedDoorCenter && (
          <g
            data-testid={`connection-annotation-padlock-${conn.id}`}
            className="connection-annotation-padlock"
            transform={`translate(${lockedDoorCenter.x - (PADLOCK_WIDTH / 2)} ${lockedDoorCenter.y - (PADLOCK_HEIGHT / 2)})`}
            pointerEvents="none"
          >
            <PadlockGlyph
              bodyColor={connectionStroke}
              keyholeColor={theme === 'dark' ? '#111827' : '#ffffff'}
            />
          </g>
        )}
      </>
    );
  };

  const renderConnectionEndpointLabels = (
    conn: Connection,
    points: ReturnType<typeof computeConnectionPath>,
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
          zIndex: 2,
        }}
      >
        {entries.map((conn) => {
          const rawSrc = rooms[conn.sourceRoomId];
          const rawTgt = rooms[conn.targetRoomId];
          if (!rawSrc || !rawTgt) return null;

          const src = applyDragOffset(rawSrc, selectionDrag);
          const tgt = applyDragOffset(rawTgt, selectionDrag);
          const srcDimensions = { width: getRoomNodeWidth(src), height: ROOM_HEIGHT };
          const tgtDimensions = { width: getRoomNodeWidth(tgt), height: ROOM_HEIGHT };
          const points = computeConnectionPath(src, tgt, conn, undefined, srcDimensions, tgtDimensions);
          const geometry = createConnectionRenderGeometry(
            points,
            conn.isBidirectional,
            useBezierConnectionsEnabled,
            conn.sourceRoomId === conn.targetRoomId,
          );
          const arrowPointSets = !conn.isBidirectional ? computeGeometryArrowheadPoints(geometry) : [];

          return (
            <g key={conn.id}>
              {renderConnectionLine(conn, src, tgt, points, geometry, conn.sourceRoomId === conn.targetRoomId)}
              {arrowPointSets.map((arrowPoints, index) => (
                <polygon
                  key={`${conn.id}-arrow-${index}`}
                  data-testid={`connection-arrow-${conn.id}-${index}`}
                  points={pointsToSvgString(arrowPoints)}
                  fill={getRoomStrokeColor(conn.strokeColorIndex, theme)}
                />
              ))}
            </g>
          );
        })}

        {stickyNoteLinkEntries.map((stickyNoteLink) => {
          const rawStickyNote = stickyNotes[stickyNoteLink.stickyNoteId];
          const rawRoom = rooms[stickyNoteLink.roomId];
          if (!rawStickyNote || !rawRoom) {
            return null;
          }

          const stickyNote = getStickyNoteWithDrag(rawStickyNote);
          const room = applyDragOffset(rawRoom, selectionDrag);
          const stickyNoteCenter = getStickyNoteCenter(stickyNote);
          const roomCenter = {
            x: room.position.x + (getRoomNodeWidth(room) / 2),
            y: room.position.y + (ROOM_HEIGHT / 2),
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
          const adjustedSrc = applyDragOffset(srcRoom, selectionDrag);
          const srcDimensions = { width: getRoomNodeWidth(adjustedSrc), height: ROOM_HEIGHT };
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
          zIndex: 6,
        }}
      >
        {entries.map((conn) => {
          const rawSrc = rooms[conn.sourceRoomId];
          const rawTgt = rooms[conn.targetRoomId];
          if (!rawSrc || !rawTgt) return null;

          const src = applyDragOffset(rawSrc, selectionDrag);
          const tgt = applyDragOffset(rawTgt, selectionDrag);
          const srcDimensions = { width: getRoomNodeWidth(src), height: ROOM_HEIGHT };
          const tgtDimensions = { width: getRoomNodeWidth(tgt), height: ROOM_HEIGHT };
          const points = computeConnectionPath(src, tgt, conn, undefined, srcDimensions, tgtDimensions);

          return <g key={`labels-${conn.id}`}>{renderConnectionEndpointLabels(conn, points)}</g>;
        })}
      </svg>
    </>
  );
}
