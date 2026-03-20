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
export const CONNECTION_ENDPOINT_DOT_RADIUS = 3.75;
export const CONNECTION_ENDPOINT_DOT_OUTSET = 0;
const CONNECTION_ENDPOINT_DOT_SPACING = 10;

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

export interface AnnotationGeometryBase {
  readonly reverseDirection: boolean;
  readonly preferPositiveNormalX: boolean;
}

export interface AnnotationSegmentSample {
  readonly kind: 'segment';
  readonly segment: { start: Point; end: Point };
}

export interface AnnotationCurveSample {
  readonly kind: 'curve';
  readonly geometry: ConnectionRenderGeometry;
}

export type AnnotationPositionSample = AnnotationSegmentSample | AnnotationCurveSample;

export interface DirectionalAnnotationRenderIntent extends AnnotationGeometryBase {
  readonly label: 'up' | 'down' | 'in';
  readonly compactLength: boolean;
  readonly positionSample: AnnotationPositionSample | null;
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

export interface PassThroughObstacle {
  readonly id: string;
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

export interface ConnectionEndpointDotInput {
  readonly id: string;
  readonly groupKey: string;
  readonly center: Point;
  readonly edgeVector: Point;
  readonly outwardNormal: Point;
}

export interface ConnectionEndpointDot {
  readonly id: string;
  readonly center: Point;
  readonly radius: number;
  readonly outwardNormal: Point;
}

export interface ConnectionEndpointDotTargetBounds {
  readonly id: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export function getRoomPassThroughBounds(
  room: Room,
  visualStyle: MapVisualStyle = 'default',
): PassThroughObstacle {
  const dimensions = getRoomNodeDimensions(room, visualStyle);
  return {
    id: room.id,
    left: room.position.x - PASS_THROUGH_GAP_PADDING,
    right: room.position.x + dimensions.width + PASS_THROUGH_GAP_PADDING,
    top: room.position.y - PASS_THROUGH_GAP_PADDING,
    bottom: room.position.y + dimensions.height + PASS_THROUGH_GAP_PADDING,
  };
}

function getSegmentGapIntervals(
  start: Point,
  end: Point,
  obstaclesToSkipAcross: readonly PassThroughObstacle[],
): readonly { start: number; end: number }[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    return [];
  }

  const intervals = obstaclesToSkipAcross.flatMap((bounds) => {
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

function normalizeDotEdgeVector(vector: Point): Point {
  const length = Math.hypot(vector.x, vector.y);
  if (length === 0) {
    return { x: 1, y: 0 };
  }

  const normalized = {
    x: vector.x / length,
    y: vector.y / length,
  };

  if (normalized.x < 0 || (Math.abs(normalized.x) < 1e-9 && normalized.y < 0)) {
    return {
      x: -normalized.x,
      y: -normalized.y,
    };
  }

  return normalized;
}

export function spreadConnectionEndpointDots(
  inputs: readonly ConnectionEndpointDotInput[],
): readonly ConnectionEndpointDot[] {
  const groupedInputs = new Map<string, ConnectionEndpointDotInput[]>();

  inputs.forEach((input) => {
    const existingGroup = groupedInputs.get(input.groupKey);
    if (existingGroup) {
      existingGroup.push(input);
      return;
    }

    groupedInputs.set(input.groupKey, [input]);
  });

  return Array.from(groupedInputs.values()).flatMap((group) => {
    const sortedGroup = [...group]
      .map((input) => {
        const edgeVector = normalizeDotEdgeVector(input.edgeVector);
        const projection = (input.center.x * edgeVector.x) + (input.center.y * edgeVector.y);
        return { input, edgeVector, projection };
      })
      .sort((left, right) => (
        left.projection === right.projection
          ? left.input.id.localeCompare(right.input.id)
          : left.projection - right.projection
      ));

    let previousPlacedProjection = Number.NEGATIVE_INFINITY;

    return sortedGroup.map(({ input, edgeVector, projection }) => {
      const placedProjection = Math.max(projection, previousPlacedProjection + CONNECTION_ENDPOINT_DOT_SPACING);
      previousPlacedProjection = placedProjection;
      const offset = placedProjection - projection;

      return {
        id: input.id,
        center: {
          x: input.center.x + (edgeVector.x * offset),
          y: input.center.y + (edgeVector.y * offset),
        },
        radius: CONNECTION_ENDPOINT_DOT_RADIUS,
        outwardNormal: input.outwardNormal,
      };
    });
  });
}

export function createConnectionEndpointDotInput(
  id: string,
  point: Point,
  targetBounds: ConnectionEndpointDotTargetBounds,
): ConnectionEndpointDotInput {
  const centerX = targetBounds.left + (targetBounds.width / 2);
  const centerY = targetBounds.top + (targetBounds.height / 2);
  const normalizedX = targetBounds.width === 0 ? 0 : (point.x - centerX) / (targetBounds.width / 2);
  const normalizedY = targetBounds.height === 0 ? 0 : (point.y - centerY) / (targetBounds.height / 2);
  const isHorizontalSide = Math.abs(normalizedY) >= Math.abs(normalizedX);
  const side = isHorizontalSide
    ? (normalizedY <= 0 ? 'top' : 'bottom')
    : (normalizedX <= 0 ? 'left' : 'right');
  const outwardNormalLength = Math.hypot(point.x - centerX, point.y - centerY) || 1;

  return {
    id,
    groupKey: `${targetBounds.id}:${side}`,
    center: point,
    edgeVector: {
      x: -(point.y - centerY) / outwardNormalLength,
      y: (point.x - centerX) / outwardNormalLength,
    },
    outwardNormal: {
      x: (point.x - centerX) / outwardNormalLength,
      y: (point.y - centerY) / outwardNormalLength,
    },
  };
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

function getVerticalAnnotationReverseDirection(
  annotationKind: 'up' | 'down',
  dy: number,
): boolean {
  if (dy === 0) {
    return false;
  }

  return annotationKind === 'up' ? dy > 0 : dy < 0;
}

export function getDirectionalAnnotationRenderIntent(
  annotationKind: 'up' | 'down' | 'in' | 'out',
  geometry: ConnectionRenderGeometry,
  longestSegment: { start: Point; end: Point } | null,
  sourceDirection: string | null,
  targetDirection: string | null,
): DirectionalAnnotationRenderIntent {
  const positionSample: AnnotationPositionSample | null = geometry.kind === 'polyline'
    ? (longestSegment ? { kind: 'segment', segment: longestSegment } : null)
    : { kind: 'curve', geometry };

  if (annotationKind === 'up' || annotationKind === 'down') {
    const semanticReverseDirection = getDirectionalAnnotationReverseDirection(
      annotationKind,
      sourceDirection,
      targetDirection,
    );
    const dy = positionSample?.kind === 'segment'
      ? positionSample.segment.end.y - positionSample.segment.start.y
      : sampleConnectionGeometryAtFraction(geometry, 0.5)?.tangent.y ?? 0;

    return {
      label: annotationKind,
      compactLength: true,
      reverseDirection: semanticReverseDirection ?? getVerticalAnnotationReverseDirection(annotationKind, dy),
      preferPositiveNormalX: true,
      positionSample,
    };
  }

  return {
    label: 'in',
    compactLength: false,
    reverseDirection: annotationKind === 'out',
    preferPositiveNormalX: false,
    positionSample,
  };
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
  obstacles: Readonly<Record<string, PassThroughObstacle>>,
): VisibleConnectionSegmentsResult {
  const points = 'kind' in pointsOrGeometry
    ? flattenConnectionGeometry(pointsOrGeometry)
    : pointsOrGeometry;
  if (points.length < 2) {
    return { segments: [], crossbars: [], hasGap: false };
  }

  const unrelatedObstacles = Object.values(obstacles).filter((obstacle) => (
    obstacle.id !== connection.sourceRoomId
    && obstacle.id !== connection.target.id
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
      getSegmentGapIntervals(segmentInfo.start, segmentInfo.end, unrelatedObstacles)
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
