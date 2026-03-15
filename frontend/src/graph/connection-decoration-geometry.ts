import type { Connection, MapVisualStyle, Room } from '../domain/map-types';
import {
  flattenConnectionGeometry,
  getConnectionGeometryLength,
  sampleConnectionGeometryAtFraction,
  type ConnectionRenderGeometry,
  type Point,
} from './connection-geometry';
import { getRoomNodeDimensions } from './room-label-geometry';

const CONNECTION_ANNOTATION_OFFSET = 8;
const CONNECTION_ANNOTATION_LENGTH_RATIO = 0.8;
const CONNECTION_ANNOTATION_ARROWHEAD_LENGTH = 10;
const CONNECTION_ANNOTATION_ARROWHEAD_WIDTH = 8;
const CONNECTION_ANNOTATION_TEXT_OFFSET = 12;
const CONNECTION_ANNOTATION_CHAR_WIDTH = 7;
const CONNECTION_ANNOTATION_PADDING = 12;
const PASS_THROUGH_GAP_PADDING = 6;
const PASS_THROUGH_CROSSBAR_LENGTH = 10;
const GAP_MERGE_TOLERANCE = 0.5;

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

interface PolylineSegmentInfo {
  readonly start: Point;
  readonly end: Point;
  readonly length: number;
  readonly startDistance: number;
  readonly endDistance: number;
}

function getRoomBounds(
  room: Room,
  visualStyle: MapVisualStyle = 'default',
): { left: number; right: number; top: number; bottom: number } {
  const dimensions = getRoomNodeDimensions(room, visualStyle);
  return {
    left: room.position.x - PASS_THROUGH_GAP_PADDING,
    right: room.position.x + dimensions.width + PASS_THROUGH_GAP_PADDING,
    top: room.position.y - PASS_THROUGH_GAP_PADDING,
    bottom: room.position.y + dimensions.height + PASS_THROUGH_GAP_PADDING,
  };
}

function getSegmentGapIntervals(
  start: Point,
  end: Point,
  roomsToSkipAcross: readonly Room[],
  visualStyle: MapVisualStyle = 'default',
): readonly { start: number; end: number }[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return [];
  }

  const intervals = roomsToSkipAcross.flatMap((room) => {
    const bounds = getRoomBounds(room, visualStyle);
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

export function getDirectionalAnnotationReverseDirection(
  annotationKind: 'up' | 'down' | 'in' | 'out',
  sourceDirection: string | null,
  targetDirection: string | null,
): boolean | null {
  if (annotationKind === 'out') {
    return true;
  }

  if (annotationKind === 'up' || annotationKind === 'down') {
    const sourceMatches = sourceDirection === annotationKind;
    const targetMatches = targetDirection === annotationKind;
    if (sourceMatches !== targetMatches) {
      return targetMatches;
    }
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
  pointsOrGeometry: readonly Point[] | ConnectionRenderGeometry,
  rooms: Readonly<Record<string, Room>>,
  visualStyle: MapVisualStyle = 'default',
): VisibleConnectionSegmentsResult {
  const points = 'kind' in pointsOrGeometry
    ? flattenConnectionGeometry(pointsOrGeometry)
    : pointsOrGeometry;
  if (points.length < 2) {
    return { segments: [], crossbars: [], hasGap: false };
  }

  const unrelatedRooms = Object.values(rooms).filter((room) => (
    room.id !== connection.sourceRoomId
    && !(connection.target.kind === 'room' && room.id === connection.target.id)
  ));
  const segmentInfos: PolylineSegmentInfo[] = [];
  let totalLength = 0;
  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const length = getSegmentLength(start, end);
    segmentInfos.push({
      start,
      end,
      length,
      startDistance: totalLength,
      endDistance: totalLength + length,
    });
    totalLength += length;
  }

  const mergedGapIntervals = segmentInfos
    .flatMap((segmentInfo) => (
      getSegmentGapIntervals(segmentInfo.start, segmentInfo.end, unrelatedRooms, visualStyle)
        .map((interval) => ({
          start: segmentInfo.startDistance + (segmentInfo.length * interval.start),
          end: segmentInfo.startDistance + (segmentInfo.length * interval.end),
        }))
    ))
    .sort((left, right) => left.start - right.start)
    .reduce<Array<{ start: number; end: number }>>((merged, interval) => {
      const previous = merged[merged.length - 1];
      if (!previous || interval.start > previous.end + GAP_MERGE_TOLERANCE) {
        merged.push({ ...interval });
        return merged;
      }

      previous.end = Math.max(previous.end, interval.end);
      return merged;
    }, []);

  if (mergedGapIntervals.length === 0) {
    return {
      segments: segmentInfos
        .filter((segment) => segment.length > 0.1)
        .map((segment) => ({ start: segment.start, end: segment.end })),
      crossbars: [],
      hasGap: false,
    };
  }

  const getPointAtDistance = (distance: number): Point => {
    const clampedDistance = Math.min(Math.max(distance, 0), totalLength);
    for (const segmentInfo of segmentInfos) {
      if (segmentInfo.length === 0) {
        continue;
      }

      if (clampedDistance <= segmentInfo.endDistance) {
        const ratio = (clampedDistance - segmentInfo.startDistance) / segmentInfo.length;
        return {
          x: segmentInfo.start.x + ((segmentInfo.end.x - segmentInfo.start.x) * ratio),
          y: segmentInfo.start.y + ((segmentInfo.end.y - segmentInfo.start.y) * ratio),
        };
      }
    }

    return points[points.length - 1];
  };

  const getSegmentInfoAtDistance = (distance: number): PolylineSegmentInfo | null => {
    const clampedDistance = Math.min(Math.max(distance, 0), totalLength);
    for (const segmentInfo of segmentInfos) {
      if (segmentInfo.length === 0) {
        continue;
      }

      if (clampedDistance >= segmentInfo.startDistance && clampedDistance <= segmentInfo.endDistance) {
        return segmentInfo;
      }
    }

    return segmentInfos.find((segmentInfo) => segmentInfo.length > 0) ?? null;
  };

  const appendVisibleSegmentsBetweenDistances = (
    startDistance: number,
    endDistance: number,
    target: VisibleConnectionSegment[],
  ): void => {
    if (endDistance <= startDistance) {
      return;
    }

    for (const segmentInfo of segmentInfos) {
      if (segmentInfo.length === 0) {
        continue;
      }

      const overlapStart = Math.max(startDistance, segmentInfo.startDistance);
      const overlapEnd = Math.min(endDistance, segmentInfo.endDistance);
      if (overlapEnd <= overlapStart) {
        continue;
      }

      target.push({
        start: getPointAtDistance(overlapStart),
        end: getPointAtDistance(overlapEnd),
      });
    }
  };

  const createCrossbarAtDistance = (distance: number): VisibleConnectionSegment | null => {
    const segmentInfo = getSegmentInfoAtDistance(distance);
    if (!segmentInfo || segmentInfo.length === 0) {
      return null;
    }

    const dx = segmentInfo.end.x - segmentInfo.start.x;
    const dy = segmentInfo.end.y - segmentInfo.start.y;
    const normalX = -dy / segmentInfo.length;
    const normalY = dx / segmentInfo.length;
    const halfCrossbarLength = PASS_THROUGH_CROSSBAR_LENGTH / 2;
    const point = getPointAtDistance(distance);

    return {
      start: {
        x: point.x - (normalX * halfCrossbarLength),
        y: point.y - (normalY * halfCrossbarLength),
      },
      end: {
        x: point.x + (normalX * halfCrossbarLength),
        y: point.y + (normalY * halfCrossbarLength),
      },
    };
  };

  const visibleSegments: VisibleConnectionSegment[] = [];
  const crossbars: VisibleConnectionSegment[] = [];
  let cursor = 0;
  mergedGapIntervals.forEach((interval) => {
    appendVisibleSegmentsBetweenDistances(cursor, interval.start, visibleSegments);

    const startCrossbar = createCrossbarAtDistance(interval.start);
    if (startCrossbar) {
      crossbars.push(startCrossbar);
    }

    const endCrossbar = createCrossbarAtDistance(interval.end);
    if (endCrossbar) {
      crossbars.push(endCrossbar);
    }

    cursor = Math.max(cursor, interval.end);
  });
  appendVisibleSegmentsBetweenDistances(cursor, totalLength, visibleSegments);

  return {
    segments: visibleSegments.filter((segment) => getSegmentLength(segment.start, segment.end) > 0.1),
    crossbars: crossbars.filter((segment) => getSegmentLength(segment.start, segment.end) > 0.1),
    hasGap: true,
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
  sourceDirection: string | null = null,
  targetDirection: string | null = null,
): ConnectionAnnotationGeometry | null {
  const compactLength = annotationKind === 'up' || annotationKind === 'down';
  const reverseDirection = annotationKind === 'out';
  const preferPositiveNormalX = annotationKind === 'up' || annotationKind === 'down';
  const semanticReverseDirection = getDirectionalAnnotationReverseDirection(annotationKind, sourceDirection, targetDirection);

  if (geometry.kind === 'polyline') {
    const segment = getLongestSegment(points);
    if (!segment) {
      return null;
    }

    const dy = segment.end.y - segment.start.y;
    return getAnnotationGeometryFromSegment(
      segment,
      semanticReverseDirection ?? (annotationKind === 'up' ? dy > 0 : annotationKind === 'down' ? dy < 0 : reverseDirection),
      annotationLabel,
      compactLength,
      preferPositiveNormalX,
    );
  }

  return getAnnotationGeometryFromRenderGeometry(
    geometry,
    semanticReverseDirection ?? (
      annotationKind === 'up'
        ? (sampleConnectionGeometryAtFraction(geometry, 0.5)?.tangent.y ?? 0) > 0
        : annotationKind === 'down'
          ? (sampleConnectionGeometryAtFraction(geometry, 0.5)?.tangent.y ?? 0) < 0
          : reverseDirection
    ),
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
