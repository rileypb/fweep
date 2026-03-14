import type { Connection, Room } from '../domain/map-types';
import {
  getConnectionGeometryLength,
  ROOM_HEIGHT,
  sampleConnectionGeometryAtFraction,
  type ConnectionRenderGeometry,
  type Point,
} from './connection-geometry';
import { getRoomNodeWidth } from './minimap-geometry';

const CONNECTION_ANNOTATION_OFFSET = 8;
const CONNECTION_ANNOTATION_LENGTH_RATIO = 0.8;
const CONNECTION_ANNOTATION_ARROWHEAD_LENGTH = 10;
const CONNECTION_ANNOTATION_ARROWHEAD_WIDTH = 8;
const CONNECTION_ANNOTATION_TEXT_OFFSET = 12;
const CONNECTION_ANNOTATION_CHAR_WIDTH = 7;
const CONNECTION_ANNOTATION_PADDING = 12;
const PASS_THROUGH_GAP_PADDING = 6;
const PASS_THROUGH_CROSSBAR_LENGTH = 10;

export interface VisibleConnectionSegment {
  readonly start: Point;
  readonly end: Point;
}

export interface VisibleConnectionSegmentsResult {
  readonly segments: readonly VisibleConnectionSegment[];
  readonly crossbars: readonly VisibleConnectionSegment[];
  readonly hasGap: boolean;
}

export interface ConnectionAnnotationGeometry {
  readonly lineStart: Point;
  readonly lineEnd: Point;
  readonly arrowTip: Point;
  readonly arrowBaseA: Point;
  readonly arrowBaseB: Point;
  readonly textPosition: Point;
  readonly rotationDegrees: number;
}

function getSegmentLength(start: Point, end: Point): number {
  return Math.hypot(end.x - start.x, end.y - start.y);
}

function getRoomBounds(room: Room): { left: number; right: number; top: number; bottom: number } {
  const roomWidth = getRoomNodeWidth(room);
  return {
    left: room.position.x - PASS_THROUGH_GAP_PADDING,
    right: room.position.x + roomWidth + PASS_THROUGH_GAP_PADDING,
    top: room.position.y - PASS_THROUGH_GAP_PADDING,
    bottom: room.position.y + ROOM_HEIGHT + PASS_THROUGH_GAP_PADDING,
  };
}

function getSegmentGapIntervals(
  start: Point,
  end: Point,
  roomsToSkipAcross: readonly Room[],
): readonly { start: number; end: number }[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return [];
  }

  const intervals = roomsToSkipAcross.flatMap((room) => {
    const bounds = getRoomBounds(room);
    let tMin = 0;
    let tMax = 1;

    if (dx === 0) {
      if (start.x < bounds.left || start.x > bounds.right) {
        return [];
      }
    } else {
      const tx1 = (bounds.left - start.x) / dx;
      const tx2 = (bounds.right - start.x) / dx;
      tMin = Math.max(tMin, Math.min(tx1, tx2));
      tMax = Math.min(tMax, Math.max(tx1, tx2));
    }

    if (dy === 0) {
      if (start.y < bounds.top || start.y > bounds.bottom) {
        return [];
      }
    } else {
      const ty1 = (bounds.top - start.y) / dy;
      const ty2 = (bounds.bottom - start.y) / dy;
      tMin = Math.max(tMin, Math.min(ty1, ty2));
      tMax = Math.min(tMax, Math.max(ty1, ty2));
    }

    if (tMax <= 0 || tMin >= 1 || tMin >= tMax) {
      return [];
    }

    return [{
      start: Math.max(0, tMin),
      end: Math.min(1, tMax),
    }];
  });

  if (intervals.length === 0) {
    return [];
  }

  const sortedIntervals = [...intervals].sort((left, right) => left.start - right.start);
  const mergedIntervals: Array<{ start: number; end: number }> = [];

  sortedIntervals.forEach((interval) => {
    const previous = mergedIntervals[mergedIntervals.length - 1];
    if (!previous || interval.start > previous.end) {
      mergedIntervals.push({ ...interval });
      return;
    }

    previous.end = Math.max(previous.end, interval.end);
  });

  return mergedIntervals;
}

function normalizeAnnotationNormal(normal: Point, preferPositiveX: boolean): Point {
  if (!preferPositiveX) {
    return normal;
  }

  if (normal.x < 0 || (normal.x === 0 && normal.y < 0)) {
    return {
      x: -normal.x,
      y: -normal.y,
    };
  }

  return normal;
}

export function getDerivedVerticalAnnotationKind(
  connection: Connection,
  sourceDirection: string | null,
  targetDirection: string | null,
): 'up' | 'down' | null {
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

export function getLongestSegment(points: readonly Point[]): { start: Point; end: Point } | null {
  let bestSegment: { start: Point; end: Point } | null = null;
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

export function getVisibleConnectionSegments(
  connection: Connection,
  points: readonly Point[],
  rooms: Readonly<Record<string, Room>>,
): VisibleConnectionSegmentsResult {
  if (points.length < 2) {
    return { segments: [], crossbars: [], hasGap: false };
  }

  const unrelatedRooms = Object.values(rooms).filter((room) => room.id !== connection.sourceRoomId && room.id !== connection.targetRoomId);
  const visibleSegments: VisibleConnectionSegment[] = [];
  const crossbars: VisibleConnectionSegment[] = [];
  let hasGap = false;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const gapIntervals = getSegmentGapIntervals(start, end, unrelatedRooms);

    if (gapIntervals.length === 0) {
      visibleSegments.push({ start, end });
      continue;
    }

    hasGap = true;
    const segmentLength = Math.hypot(dx, dy);
    const normalX = segmentLength === 0 ? 0 : -dy / segmentLength;
    const normalY = segmentLength === 0 ? 0 : dx / segmentLength;
    const halfCrossbarLength = PASS_THROUGH_CROSSBAR_LENGTH / 2;

    let cursor = 0;
    gapIntervals.forEach((interval) => {
      const gapStartPoint = {
        x: start.x + (dx * interval.start),
        y: start.y + (dy * interval.start),
      };
      const gapEndPoint = {
        x: start.x + (dx * interval.end),
        y: start.y + (dy * interval.end),
      };

      crossbars.push({
        start: {
          x: gapStartPoint.x - (normalX * halfCrossbarLength),
          y: gapStartPoint.y - (normalY * halfCrossbarLength),
        },
        end: {
          x: gapStartPoint.x + (normalX * halfCrossbarLength),
          y: gapStartPoint.y + (normalY * halfCrossbarLength),
        },
      });
      crossbars.push({
        start: {
          x: gapEndPoint.x - (normalX * halfCrossbarLength),
          y: gapEndPoint.y - (normalY * halfCrossbarLength),
        },
        end: {
          x: gapEndPoint.x + (normalX * halfCrossbarLength),
          y: gapEndPoint.y + (normalY * halfCrossbarLength),
        },
      });

      if (interval.start > cursor) {
        visibleSegments.push({
          start: {
            x: start.x + (dx * cursor),
            y: start.y + (dy * cursor),
          },
          end: {
            x: start.x + (dx * interval.start),
            y: start.y + (dy * interval.start),
          },
        });
      }
      cursor = Math.max(cursor, interval.end);
    });

    if (cursor < 1) {
      visibleSegments.push({
        start: {
          x: start.x + (dx * cursor),
          y: start.y + (dy * cursor),
        },
        end,
      });
    }
  }

  return {
    segments: visibleSegments.filter((segment) => getSegmentLength(segment.start, segment.end) > 0.1),
    crossbars: crossbars.filter((segment) => getSegmentLength(segment.start, segment.end) > 0.1),
    hasGap,
  };
}

export function getAnnotationGeometryFromSegment(
  segment: { start: Point; end: Point },
  reverseDirection: boolean,
  annotationLabel: string,
  compactLength: boolean,
  preferPositiveNormalX = false,
): ConnectionAnnotationGeometry | null {
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
  const normal = normalizeAnnotationNormal({ x: -uy, y: ux }, preferPositiveNormalX);
  const annotationCenterX = ((segment.start.x + segment.end.x) / 2) + (normal.x * CONNECTION_ANNOTATION_OFFSET);
  const annotationCenterY = ((segment.start.y + segment.end.y) / 2) + (normal.y * CONNECTION_ANNOTATION_OFFSET);
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

  return {
    lineStart,
    lineEnd,
    arrowTip,
    arrowBaseA: {
      x: arrowBaseCenter.x + (normal.x * (CONNECTION_ANNOTATION_ARROWHEAD_WIDTH / 2)),
      y: arrowBaseCenter.y + (normal.y * (CONNECTION_ANNOTATION_ARROWHEAD_WIDTH / 2)),
    },
    arrowBaseB: {
      x: arrowBaseCenter.x - (normal.x * (CONNECTION_ANNOTATION_ARROWHEAD_WIDTH / 2)),
      y: arrowBaseCenter.y - (normal.y * (CONNECTION_ANNOTATION_ARROWHEAD_WIDTH / 2)),
    },
    textPosition: {
      x: annotationCenterX + (normal.x * CONNECTION_ANNOTATION_TEXT_OFFSET),
      y: annotationCenterY + (normal.y * CONNECTION_ANNOTATION_TEXT_OFFSET),
    },
    rotationDegrees: (Math.atan2(directionY, directionX) * 180) / Math.PI,
  };
}

export function getAnnotationGeometryFromRenderGeometry(
  geometry: ConnectionRenderGeometry,
  reverseDirection: boolean,
  annotationLabel: string,
  compactLength: boolean,
  preferPositiveNormalX = false,
): ConnectionAnnotationGeometry | null {
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
  const normal = normalizeAnnotationNormal({ x: -uy, y: ux }, preferPositiveNormalX);
  const annotationCenterX = sample.point.x + (normal.x * CONNECTION_ANNOTATION_OFFSET);
  const annotationCenterY = sample.point.y + (normal.y * CONNECTION_ANNOTATION_OFFSET);
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

  return {
    lineStart,
    lineEnd,
    arrowTip,
    arrowBaseA: {
      x: arrowBaseCenter.x + (normal.x * (CONNECTION_ANNOTATION_ARROWHEAD_WIDTH / 2)),
      y: arrowBaseCenter.y + (normal.y * (CONNECTION_ANNOTATION_ARROWHEAD_WIDTH / 2)),
    },
    arrowBaseB: {
      x: arrowBaseCenter.x - (normal.x * (CONNECTION_ANNOTATION_ARROWHEAD_WIDTH / 2)),
      y: arrowBaseCenter.y - (normal.y * (CONNECTION_ANNOTATION_ARROWHEAD_WIDTH / 2)),
    },
    textPosition: {
      x: annotationCenterX + (normal.x * CONNECTION_ANNOTATION_TEXT_OFFSET),
      y: annotationCenterY + (normal.y * CONNECTION_ANNOTATION_TEXT_OFFSET),
    },
    rotationDegrees: (Math.atan2(directionY, directionX) * 180) / Math.PI,
  };
}

export function getDirectionalAnnotationGeometry(
  annotationKind: 'up' | 'down' | 'in' | 'out',
  annotationLabel: string,
  geometry: ConnectionRenderGeometry,
  points: readonly Point[],
): ConnectionAnnotationGeometry | null {
  const compactLength = annotationKind === 'up' || annotationKind === 'down';
  const reverseDirection = annotationKind === 'out';
  const preferPositiveNormalX = annotationKind === 'up' || annotationKind === 'down';

  if (geometry.kind === 'polyline') {
    const segment = getLongestSegment(points);
    if (!segment) {
      return null;
    }

    const dy = segment.end.y - segment.start.y;
    return getAnnotationGeometryFromSegment(
      segment,
      annotationKind === 'up' ? dy > 0 : annotationKind === 'down' ? dy < 0 : reverseDirection,
      annotationLabel,
      compactLength,
      preferPositiveNormalX,
    );
  }

  return getAnnotationGeometryFromRenderGeometry(
    geometry,
    annotationKind === 'up'
      ? (sampleConnectionGeometryAtFraction(geometry, 0.5)?.tangent.y ?? 0) > 0
      : annotationKind === 'down'
        ? (sampleConnectionGeometryAtFraction(geometry, 0.5)?.tangent.y ?? 0) < 0
        : reverseDirection,
    annotationLabel,
    compactLength,
    preferPositiveNormalX,
  );
}

export function normalizeReadableTextRotation(rotationDegrees: number): number {
  if (rotationDegrees > 90) {
    return rotationDegrees - 180;
  }
  if (rotationDegrees <= -90) {
    return rotationDegrees + 180;
  }
  return rotationDegrees;
}
