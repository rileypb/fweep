import { useEditorStore } from '../state/editor-store';
import {
  type Connection,
  type Room,
} from '../domain/map-types';
import { getRoomStrokeColor, type ThemeMode } from '../domain/room-color-palette';
import {
  computeConnectionPath,
  computePreviewPath,
  computeSegmentArrowheadPoints,
  pointsToSvgString,
  ROOM_HEIGHT,
} from '../graph/connection-geometry';
import { getRoomNodeWidth } from '../graph/minimap-geometry';
import { getRoomStrokeDasharray } from './map-canvas-helpers';

const CONNECTION_ANNOTATION_OFFSET = 8;
const CONNECTION_ANNOTATION_LENGTH_RATIO = 0.8;
const CONNECTION_ANNOTATION_ARROWHEAD_LENGTH = 10;
const CONNECTION_ANNOTATION_ARROWHEAD_WIDTH = 8;
const CONNECTION_ANNOTATION_TEXT_OFFSET = 12;
const CONNECTION_DOOR_WIDTH = 12;
const CONNECTION_DOOR_HEIGHT = 16;
const CONNECTION_PADLOCK_WIDTH = 12;
const CONNECTION_PADLOCK_HEIGHT = 16;

function applyDragOffset(
  room: Room,
  roomDrag: { roomIds: readonly string[]; dx: number; dy: number } | null,
): Room {
  if (!roomDrag || !roomDrag.roomIds.includes(room.id)) return room;
  return {
    ...room,
    position: {
      x: room.position.x + roomDrag.dx,
      y: room.position.y + roomDrag.dy,
    },
  };
}

interface VectorPoint {
  readonly x: number;
  readonly y: number;
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
  const annotationLength = length * CONNECTION_ANNOTATION_LENGTH_RATIO;
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

export interface MapCanvasConnectionsProps {
  rooms: Readonly<Record<string, Room>>;
  connections: Readonly<Record<string, Connection>>;
  onOpenConnectionEditor: (connectionId: string) => void;
  theme: ThemeMode;
}

export function MapCanvasConnections({
  rooms,
  connections,
  onOpenConnectionEditor,
  theme,
}: MapCanvasConnectionsProps): React.JSX.Element {
  const connectionDrag = useEditorStore((s) => s.connectionDrag);
  const roomDrag = useEditorStore((s) => s.roomDrag);
  const selectedConnectionIds = useEditorStore((s) => s.selectedConnectionIds);
  const selectConnection = useEditorStore((s) => s.selectConnection);
  const addConnectionToSelection = useEditorStore((s) => s.addConnectionToSelection);
  const entries = Object.values(connections);

  const renderConnectionLine = (
    conn: Connection,
    points: ReturnType<typeof computeConnectionPath>,
    isSelfConnection: boolean,
  ): React.JSX.Element => {
    const isSelected = selectedConnectionIds.includes(conn.id);
    const baseClassName = isSelfConnection ? 'connection-line connection-line--self' : 'connection-line';
    const annotationKind = conn.annotation?.kind;
    const annotationText = annotationKind === 'text' ? conn.annotation?.text?.trim() ?? '' : '';
    const rendersDirectionalAnnotation = annotationKind === 'up'
      || annotationKind === 'down'
      || annotationKind === 'in'
      || annotationKind === 'out';
    const rendersTextAnnotation = annotationKind === 'text' && annotationText.length > 0;
    const annotationLabel = annotationKind === 'up' || annotationKind === 'down'
      ? 'up'
      : annotationKind === 'in' || annotationKind === 'out'
        ? 'in'
        : annotationText;
    const rendersDoorAnnotation = annotationKind === 'door';
    const rendersLockedDoorAnnotation = annotationKind === 'locked door';
    const annotationSegment = rendersDirectionalAnnotation && !isSelfConnection ? getLongestSegment(points) : null;
    const textAnnotationSegment = rendersTextAnnotation ? getLongestSegment(points) : null;
    const doorSegment = rendersDoorAnnotation ? getLongestSegment(points) : null;
    const lockedDoorSegment = rendersLockedDoorAnnotation ? getLongestSegment(points) : null;
    const annotationGeometry = annotationSegment
      ? getAnnotationGeometry(annotationSegment, annotationKind === 'down' || annotationKind === 'out')
      : null;
    const textAnnotationGeometry = textAnnotationSegment
      ? getAnnotationGeometry(textAnnotationSegment, false)
      : null;
    const selfAnnotationPosition = rendersDirectionalAnnotation && isSelfConnection
      ? getSelfAnnotationPosition(points)
      : null;
    const doorCenter = doorSegment ? getSegmentCenter(doorSegment) : null;
    const lockedDoorCenter = lockedDoorSegment ? getSegmentCenter(lockedDoorSegment) : null;
    const connectionStroke = getRoomStrokeColor(conn.strokeColorIndex, theme);

    return (
      <>
        <polyline
          data-testid={`connection-hit-target-${conn.id}`}
          data-connection-id={conn.id}
          className="connection-hit-target"
          points={pointsToSvgString(points)}
          fill="none"
          stroke="transparent"
          strokeWidth="18"
          style={{ pointerEvents: 'stroke', cursor: 'pointer' }}
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
            transform={`translate(${lockedDoorCenter.x - (CONNECTION_PADLOCK_WIDTH / 2)} ${lockedDoorCenter.y - (CONNECTION_PADLOCK_HEIGHT / 2)})`}
            pointerEvents="none"
          >
            <path
              d="M3 7 V5.5 C3 2.8 5 1 6 1 C7 1 9 2.8 9 5.5 V7"
              fill="none"
              stroke={connectionStroke}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            <rect
              x="2"
              y="7"
              width="8"
              height="8"
              rx="1.5"
              fill={connectionStroke}
              stroke={connectionStroke}
              strokeWidth="1.5"
            />
            <circle
              cx="6"
              cy="10.5"
              r="1"
              fill={theme === 'dark' ? '#111827' : '#ffffff'}
            />
            <line
              x1="6"
              y1="11.5"
              x2="6"
              y2="13"
              stroke={theme === 'dark' ? '#111827' : '#ffffff'}
              strokeWidth="1"
              strokeLinecap="round"
            />
          </g>
        )}
      </>
    );
  };

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
        overflow: 'visible',
        zIndex: 2,
      }}
    >
      {entries.map((conn) => {
        const rawSrc = rooms[conn.sourceRoomId];
        const rawTgt = rooms[conn.targetRoomId];
        if (!rawSrc || !rawTgt) return null;

        const src = applyDragOffset(rawSrc, roomDrag);
        const tgt = applyDragOffset(rawTgt, roomDrag);
        const srcDimensions = { width: getRoomNodeWidth(src.name), height: ROOM_HEIGHT };
        const tgtDimensions = { width: getRoomNodeWidth(tgt.name), height: ROOM_HEIGHT };
        const points = computeConnectionPath(src, tgt, conn, undefined, srcDimensions, tgtDimensions);
        const arrowPointSets = !conn.isBidirectional ? computeSegmentArrowheadPoints(points) : [];

        return (
          <g key={conn.id}>
            {renderConnectionLine(conn, points, conn.sourceRoomId === conn.targetRoomId)}
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

      {connectionDrag && (() => {
        const srcRoom = rooms[connectionDrag.sourceRoomId];
        if (!srcRoom) return null;
        const adjustedSrc = applyDragOffset(srcRoom, roomDrag);
        const srcDimensions = { width: getRoomNodeWidth(adjustedSrc.name), height: ROOM_HEIGHT };
        const points = computePreviewPath(
          adjustedSrc,
          connectionDrag.sourceDirection,
          connectionDrag.cursorX,
          connectionDrag.cursorY,
          undefined,
          srcDimensions,
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
