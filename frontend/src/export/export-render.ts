import { BACKGROUND_LAYER_CHUNK_SIZE, type Connection, type Room, type StickyNote, type StickyNoteLink } from '../domain/map-types';
import { getRoomFillColor, getRoomStrokeColor } from '../domain/room-color-palette';
import { blobToCanvas, createSizedCanvas } from '../components/map-background-raster';
import { getRoomStrokeDasharray } from '../components/map-canvas-helpers';
import {
  computeConnectionPath,
  computeGeometryArrowheadPoints,
  createConnectionRenderGeometry,
  findRoomDirectionForConnection,
  getConnectionGeometryLength,
  ROOM_CORNER_RADIUS,
  ROOM_HEIGHT,
  sampleConnectionGeometryAtFraction,
  type ConnectionRenderGeometry,
  type Point,
} from '../graph/connection-geometry';
import { getRoomNodeWidth } from '../graph/minimap-geometry';
import { PADLOCK_BODY, PADLOCK_KEYHOLE, PADLOCK_KEY_STEM } from '../graph/padlock-geometry';
import { getRoomLabelLayout } from '../graph/room-label-geometry';
import { traceRoomShapePath } from '../graph/room-shape-geometry';
import { getStickyNoteCenter, getStickyNoteHeight, getStickyNoteWrappedLines, STICKY_NOTE_WIDTH } from '../graph/sticky-note-geometry';
import { listBackgroundChunksInBounds } from '../storage/map-store';
import type { ExportRegion, ExportRenderInput } from './export-types';
import { validateExportBounds } from './export-bounds';

const LIGHT_CANVAS_BACKGROUND = '#ffffff';
const DARK_CANVAS_BACKGROUND = '#111827';
const LIGHT_GRID_COLOR = 'rgba(0, 0, 0, 0.07)';
const DARK_GRID_COLOR = 'rgba(255, 255, 255, 0.06)';
const LIGHT_FOREGROUND = '#111827';
const DARK_FOREGROUND = '#f3f4f6';
const CONNECTION_ANNOTATION_OFFSET = 8;
const CONNECTION_ANNOTATION_LENGTH_RATIO = 0.8;
const CONNECTION_ANNOTATION_ARROWHEAD_LENGTH = 10;
const CONNECTION_ANNOTATION_ARROWHEAD_WIDTH = 8;
const CONNECTION_ANNOTATION_TEXT_OFFSET = 12;
const CONNECTION_ANNOTATION_CHAR_WIDTH = 7;
const CONNECTION_ANNOTATION_PADDING = 12;
const PASS_THROUGH_GAP_PADDING = 6;
const PASS_THROUGH_CROSSBAR_LENGTH = 10;

interface VisibleConnectionSegment {
  readonly start: Point;
  readonly end: Point;
}

interface VisibleConnectionSegmentsResult {
  readonly segments: readonly VisibleConnectionSegment[];
  readonly crossbars: readonly VisibleConnectionSegment[];
  readonly hasGap: boolean;
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

function getBoundsSize(bounds: ExportRegion): { width: number; height: number } {
  return {
    width: Math.max(0, bounds.right - bounds.left),
    height: Math.max(0, bounds.bottom - bounds.top),
  };
}

function getGridColor(theme: ExportRenderInput['theme']): string {
  return theme === 'dark' ? DARK_GRID_COLOR : LIGHT_GRID_COLOR;
}

function getCanvasBackground(theme: ExportRenderInput['theme']): string {
  return theme === 'dark' ? DARK_CANVAS_BACKGROUND : LIGHT_CANVAS_BACKGROUND;
}

function getForegroundColor(theme: ExportRenderInput['theme']): string {
  return theme === 'dark' ? DARK_FOREGROUND : LIGHT_FOREGROUND;
}

function setDashArray(context: CanvasRenderingContext2D, strokeStyle: Connection['strokeStyle'] | Room['strokeStyle']): void {
  const dash = getRoomStrokeDasharray(strokeStyle);
  context.setLineDash(dash ? dash.split(' ').map((segment) => Number(segment)) : []);
}

function drawRoomShape(context: CanvasRenderingContext2D, room: Room, theme: ExportRenderInput['theme']): void {
  const width = getRoomNodeWidth(room);
  const left = room.position.x;
  const top = room.position.y;

  context.beginPath();
  traceRoomShapePath(context, room.shape, left, top, width, ROOM_HEIGHT, ROOM_CORNER_RADIUS);

  context.fillStyle = getRoomFillColor(room.fillColorIndex, theme);
  context.strokeStyle = getRoomStrokeColor(room.strokeColorIndex, theme);
  context.lineWidth = 2;
  setDashArray(context, room.strokeStyle);
  context.fill();
  context.stroke();
  context.setLineDash([]);
}

function drawRoomLabel(context: CanvasRenderingContext2D, room: Room, theme: ExportRenderInput['theme']): void {
  const width = getRoomNodeWidth(room);
  const labelLayout = getRoomLabelLayout(room, width, ROOM_HEIGHT);
  const foreground = getForegroundColor(theme);
  const roomStroke = getRoomStrokeColor(room.strokeColorIndex, theme);

  if (room.locked && labelLayout.lockX !== null && labelLayout.lockY !== null) {
    const offsetX = room.position.x + labelLayout.lockX;
    const offsetY = room.position.y + labelLayout.lockY;

    context.save();
    context.translate(offsetX, offsetY);
    context.strokeStyle = roomStroke;
    context.fillStyle = roomStroke;
    context.lineWidth = 1.5;
    context.lineCap = 'round';
    context.beginPath();
    context.moveTo(3, 7);
    context.lineTo(3, 5.5);
    context.bezierCurveTo(3, 2.8, 5, 1, 6, 1);
    context.bezierCurveTo(7, 1, 9, 2.8, 9, 5.5);
    context.lineTo(9, 7);
    context.stroke();

    const bodyRight = PADLOCK_BODY.x + PADLOCK_BODY.width;
    const bodyBottom = PADLOCK_BODY.y + PADLOCK_BODY.height;
    const bodyRadius = PADLOCK_BODY.rx;
    context.beginPath();
    context.moveTo(PADLOCK_BODY.x + bodyRadius, PADLOCK_BODY.y);
    context.lineTo(bodyRight - bodyRadius, PADLOCK_BODY.y);
    context.quadraticCurveTo(bodyRight, PADLOCK_BODY.y, bodyRight, PADLOCK_BODY.y + bodyRadius);
    context.lineTo(bodyRight, bodyBottom - bodyRadius);
    context.quadraticCurveTo(bodyRight, bodyBottom, bodyRight - bodyRadius, bodyBottom);
    context.lineTo(PADLOCK_BODY.x + bodyRadius, bodyBottom);
    context.quadraticCurveTo(PADLOCK_BODY.x, bodyBottom, PADLOCK_BODY.x, bodyBottom - bodyRadius);
    context.lineTo(PADLOCK_BODY.x, PADLOCK_BODY.y + bodyRadius);
    context.quadraticCurveTo(PADLOCK_BODY.x, PADLOCK_BODY.y, PADLOCK_BODY.x + bodyRadius, PADLOCK_BODY.y);
    context.closePath();
    context.fill();
    context.stroke();

    context.fillStyle = theme === 'dark' ? '#111827' : '#ffffff';
    context.beginPath();
    context.arc(PADLOCK_KEYHOLE.cx, PADLOCK_KEYHOLE.cy, PADLOCK_KEYHOLE.r, 0, Math.PI * 2);
    context.fill();
    context.beginPath();
    context.moveTo(PADLOCK_KEY_STEM.x1, PADLOCK_KEY_STEM.y1);
    context.lineTo(PADLOCK_KEY_STEM.x2, PADLOCK_KEY_STEM.y2);
    context.strokeStyle = theme === 'dark' ? '#111827' : '#ffffff';
    context.lineWidth = 1;
    context.stroke();
    context.restore();
  }

  context.fillStyle = getForegroundColor(theme);
  context.font = '600 13px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillText(room.name, room.position.x + labelLayout.textX, room.position.y + labelLayout.textY);
}

function drawStickyNote(context: CanvasRenderingContext2D, stickyNote: StickyNote): void {
  const width = STICKY_NOTE_WIDTH;
  const height = getStickyNoteHeight(stickyNote.text);
  const foldSize = 18;
  const left = stickyNote.position.x;
  const top = stickyNote.position.y;
  const right = left + width;
  const bottom = top + height;

  context.beginPath();
  context.moveTo(left, top);
  context.lineTo(right, top);
  context.lineTo(right, bottom - foldSize);
  context.lineTo(right - foldSize, bottom);
  context.lineTo(left, bottom);
  context.closePath();
  context.fillStyle = '#f1e67d';
  context.strokeStyle = 'rgba(120, 105, 18, 0.34)';
  context.lineWidth = 1;
  context.fill();
  context.stroke();

  context.beginPath();
  context.moveTo(right - foldSize, bottom);
  context.lineTo(right - foldSize, bottom - foldSize);
  context.lineTo(right, bottom - foldSize);
  context.closePath();
  context.fillStyle = 'rgba(196, 176, 54, 0.32)';
  context.fill();

  context.fillStyle = '#4c4312';
  context.font = '500 15px Georgia, serif';
  context.textAlign = 'left';
  context.textBaseline = 'top';

  const paddingLeft = 16;
  const paddingTop = 16;
  const lineHeight = 20;
  getStickyNoteWrappedLines(stickyNote.text).forEach((line, index) => {
    context.fillText(line, left + paddingLeft, top + paddingTop + (index * lineHeight));
  });
}

function drawStickyNoteLink(
  context: CanvasRenderingContext2D,
  doc: ExportRenderInput['doc'],
  stickyNoteLink: StickyNoteLink,
): void {
  const stickyNote = doc.stickyNotes[stickyNoteLink.stickyNoteId];
  const room = doc.rooms[stickyNoteLink.roomId];
  if (!stickyNote || !room) {
    return;
  }

  const stickyNoteCenter = getStickyNoteCenter(stickyNote);
  const roomCenter = {
    x: room.position.x + (getRoomNodeWidth(room) / 2),
    y: room.position.y + (ROOM_HEIGHT / 2),
  };

  context.beginPath();
  context.moveTo(stickyNoteCenter.x, stickyNoteCenter.y);
  context.lineTo(roomCenter.x, roomCenter.y);
  context.strokeStyle = '#8a8156';
  context.lineWidth = 2;
  context.setLineDash([5, 4]);
  context.stroke();
  context.setLineDash([]);
}

function drawConnectionGeometry(context: CanvasRenderingContext2D, geometry: ConnectionRenderGeometry): void {
  context.beginPath();

  if (geometry.kind === 'polyline') {
    if (geometry.points.length === 0) {
      return;
    }
    context.moveTo(geometry.points[0].x, geometry.points[0].y);
    geometry.points.slice(1).forEach((point) => {
      context.lineTo(point.x, point.y);
    });
    return;
  }

  context.moveTo(geometry.start.x, geometry.start.y);
  if (geometry.kind === 'quadratic') {
    context.quadraticCurveTo(geometry.control.x, geometry.control.y, geometry.end.x, geometry.end.y);
    return;
  }

  context.bezierCurveTo(
    geometry.control1.x,
    geometry.control1.y,
    geometry.control2.x,
    geometry.control2.y,
    geometry.end.x,
    geometry.end.y,
  );
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

function getVisibleConnectionSegments(
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
    segments: visibleSegments.filter((segment) => Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y) > 0.1),
    crossbars: crossbars.filter((segment) => Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y) > 0.1),
    hasGap,
  };
}

function drawConnectionLine(
  context: CanvasRenderingContext2D,
  doc: ExportRenderInput['doc'],
  connection: Connection,
  theme: ExportRenderInput['theme'],
): { geometry: ConnectionRenderGeometry; points: readonly Point[] } | null {
  const sourceRoom = doc.rooms[connection.sourceRoomId];
  const targetRoom = doc.rooms[connection.targetRoomId];
  if (!sourceRoom || !targetRoom) {
    return null;
  }

  const sourceDimensions = { width: getRoomNodeWidth(sourceRoom), height: ROOM_HEIGHT };
  const targetDimensions = { width: getRoomNodeWidth(targetRoom), height: ROOM_HEIGHT };
  const points = computeConnectionPath(sourceRoom, targetRoom, connection, undefined, sourceDimensions, targetDimensions);
  const geometry = createConnectionRenderGeometry(
    points,
    connection.isBidirectional,
    doc.view.useBezierConnections,
    connection.sourceRoomId === connection.targetRoomId,
  );

  context.strokeStyle = getRoomStrokeColor(connection.strokeColorIndex, theme);
  context.lineWidth = 2;
  setDashArray(context, connection.strokeStyle);
  if (geometry.kind === 'polyline' && connection.sourceRoomId !== connection.targetRoomId) {
    const visiblePolylineResult = getVisibleConnectionSegments(connection, points, doc.rooms);
    if (visiblePolylineResult.hasGap) {
      visiblePolylineResult.segments.forEach((segment) => {
        context.beginPath();
        context.moveTo(segment.start.x, segment.start.y);
        context.lineTo(segment.end.x, segment.end.y);
        context.stroke();
      });
      visiblePolylineResult.crossbars.forEach((segment) => {
        context.beginPath();
        context.moveTo(segment.start.x, segment.start.y);
        context.lineTo(segment.end.x, segment.end.y);
        context.stroke();
      });
    } else {
      drawConnectionGeometry(context, geometry);
      context.stroke();
    }
  } else {
    drawConnectionGeometry(context, geometry);
    context.stroke();
  }
  context.setLineDash([]);

  if (!connection.isBidirectional) {
    const arrowheads = computeGeometryArrowheadPoints(geometry, 12, 10);
    arrowheads.forEach((triangle) => {
      context.beginPath();
      context.moveTo(triangle[0].x, triangle[0].y);
      context.lineTo(triangle[1].x, triangle[1].y);
      context.lineTo(triangle[2].x, triangle[2].y);
      context.closePath();
      context.fillStyle = getRoomStrokeColor(connection.strokeColorIndex, theme);
      context.fill();
    });
  }

  return { geometry, points };
}

function drawConnectionLabels(
  context: CanvasRenderingContext2D,
  sourceRoom: Room,
  targetRoom: Room,
  connection: Connection,
  geometry: ConnectionRenderGeometry,
  points: readonly Point[],
  theme: ExportRenderInput['theme'],
): void {
  context.fillStyle = getForegroundColor(theme);
  context.font = '600 12px sans-serif';
  context.textBaseline = 'middle';

  const drawEndpointLabel = (label: string, start: Point, end: Point): void => {
    const trimmed = label.trim();
    if (!trimmed) {
      return;
    }
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const centerX = (start.x + end.x) / 2;
    const centerY = (start.y + end.y) / 2;
    if (Math.abs(dx) >= Math.abs(dy)) {
      context.textAlign = 'center';
      context.fillText(trimmed, centerX, centerY - 8);
    } else {
      context.textAlign = 'start';
      context.fillText(trimmed, centerX + 10, centerY);
    }
  };

  if (points.length >= 2) {
    drawEndpointLabel(connection.startLabel, points[0], points[1]);
    if (connection.isBidirectional) {
      drawEndpointLabel(connection.endLabel, points[points.length - 2], points[points.length - 1]);
    }
  }

  const annotationKind = connection.annotation?.kind ?? getDerivedVerticalAnnotationKind(connection, sourceRoom, targetRoom);
  const annotationLabel = annotationKind === 'text'
    ? connection.annotation?.text?.trim() ?? ''
    : annotationKind === 'up' || annotationKind === 'down'
      ? annotationKind
      : annotationKind === 'in' || annotationKind === 'out'
        ? 'in'
        : '';

  if (!annotationLabel) {
    return;
  }

  context.font = '600 14px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  if (annotationKind === 'up' || annotationKind === 'down' || annotationKind === 'in' || annotationKind === 'out') {
    const directionalAnnotation = getDirectionalAnnotationGeometry(annotationKind, annotationLabel, geometry, points);
    if (!directionalAnnotation) {
      return;
    }

    context.beginPath();
    context.moveTo(directionalAnnotation.lineStart.x, directionalAnnotation.lineStart.y);
    context.lineTo(directionalAnnotation.lineEnd.x, directionalAnnotation.lineEnd.y);
    context.strokeStyle = getRoomStrokeColor(connection.strokeColorIndex, theme);
    context.lineWidth = 2;
    context.stroke();

    context.beginPath();
    context.moveTo(directionalAnnotation.arrowTip.x, directionalAnnotation.arrowTip.y);
    context.lineTo(directionalAnnotation.arrowBaseA.x, directionalAnnotation.arrowBaseA.y);
    context.lineTo(directionalAnnotation.arrowBaseB.x, directionalAnnotation.arrowBaseB.y);
    context.closePath();
    context.fillStyle = getRoomStrokeColor(connection.strokeColorIndex, theme);
    context.fill();

    context.fillStyle = getForegroundColor(theme);
    context.save();
    context.translate(directionalAnnotation.textPosition.x, directionalAnnotation.textPosition.y);
    context.rotate((normalizeReadableTextRotation(directionalAnnotation.rotationDegrees) * Math.PI) / 180);
    context.fillText(annotationLabel, 0, 0);
    context.restore();
    return;
  }

  if (annotationKind === 'text') {
    const textAnnotationGeometry = geometry.kind === 'polyline'
      ? (() => {
        const segment = getLongestSegment(points);
        return segment ? getAnnotationGeometryFromSegment(segment, false, annotationLabel, false, false) : null;
      })()
      : getAnnotationGeometryFromRenderGeometry(geometry, false, annotationLabel, false, false);

    if (!textAnnotationGeometry) {
      return;
    }

    context.save();
    context.translate(textAnnotationGeometry.textPosition.x, textAnnotationGeometry.textPosition.y);
    context.rotate((normalizeReadableTextRotation(textAnnotationGeometry.rotationDegrees) * Math.PI) / 180);
    context.fillText(annotationLabel, 0, 0);
    context.restore();
    return;
  }

  const sample = sampleConnectionGeometryAtFraction(geometry, 0.5);
  if (!sample) {
    return;
  }

  const tangentLength = Math.hypot(sample.tangent.x, sample.tangent.y) || 1;
  const normalX = -sample.tangent.y / tangentLength;
  const normalY = sample.tangent.x / tangentLength;
  const textX = sample.point.x + (normalX * (CONNECTION_ANNOTATION_OFFSET + CONNECTION_ANNOTATION_TEXT_OFFSET));
  const textY = sample.point.y + (normalY * (CONNECTION_ANNOTATION_OFFSET + CONNECTION_ANNOTATION_TEXT_OFFSET));
  context.fillText(annotationLabel, textX, textY);
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

function getLongestSegment(points: readonly Point[]): { start: Point; end: Point } | null {
  let bestSegment: { start: Point; end: Point } | null = null;
  let bestLength = -1;

  for (let index = 0; index < points.length - 1; index += 1) {
    const start = points[index];
    const end = points[index + 1];
    const length = Math.hypot(end.x - start.x, end.y - start.y);
    if (length > bestLength) {
      bestLength = length;
      bestSegment = { start, end };
    }
  }

  return bestSegment;
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

function getDirectionalAnnotationGeometry(
  annotationKind: 'up' | 'down' | 'in' | 'out',
  annotationLabel: string,
  geometry: ConnectionRenderGeometry,
  points: readonly Point[],
): {
  lineStart: Point;
  lineEnd: Point;
  arrowTip: Point;
  arrowBaseA: Point;
  arrowBaseB: Point;
  textPosition: Point;
  rotationDegrees: number;
} | null {
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

function getAnnotationGeometryFromSegment(
  segment: { start: Point; end: Point },
  reverseDirection: boolean,
  annotationLabel: string,
  compactLength: boolean,
  preferPositiveNormalX: boolean,
): {
  lineStart: Point;
  lineEnd: Point;
  arrowTip: Point;
  arrowBaseA: Point;
  arrowBaseB: Point;
  textPosition: Point;
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

function getAnnotationGeometryFromRenderGeometry(
  geometry: ConnectionRenderGeometry,
  reverseDirection: boolean,
  annotationLabel: string,
  compactLength: boolean,
  preferPositiveNormalX: boolean,
): {
  lineStart: Point;
  lineEnd: Point;
  arrowTip: Point;
  arrowBaseA: Point;
  arrowBaseB: Point;
  textPosition: Point;
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

function drawGrid(
  context: CanvasRenderingContext2D,
  bounds: ExportRegion,
  theme: ExportRenderInput['theme'],
): void {
  const gridSize = 40;
  const startX = Math.floor(bounds.left / gridSize) * gridSize;
  const endX = Math.ceil(bounds.right / gridSize) * gridSize;
  const startY = Math.floor(bounds.top / gridSize) * gridSize;
  const endY = Math.ceil(bounds.bottom / gridSize) * gridSize;

  context.beginPath();
  for (let x = startX; x <= endX; x += gridSize) {
    context.moveTo(x, bounds.top);
    context.lineTo(x, bounds.bottom);
  }
  for (let y = startY; y <= endY; y += gridSize) {
    context.moveTo(bounds.left, y);
    context.lineTo(bounds.right, y);
  }
  context.strokeStyle = getGridColor(theme);
  context.lineWidth = 1;
  context.stroke();
}

async function drawBackgroundRaster(
  context: CanvasRenderingContext2D,
  input: ExportRenderInput,
): Promise<void> {
  const activeLayerId = input.doc.background.activeLayerId;
  const activeLayer = activeLayerId ? input.doc.background.layers[activeLayerId] : null;
  if (!activeLayer || !activeLayer.visible) {
    return;
  }

  const minChunkX = Math.floor(input.bounds.left / BACKGROUND_LAYER_CHUNK_SIZE);
  const maxChunkX = Math.floor((input.bounds.right - 1) / BACKGROUND_LAYER_CHUNK_SIZE);
  const minChunkY = Math.floor(input.bounds.top / BACKGROUND_LAYER_CHUNK_SIZE);
  const maxChunkY = Math.floor((input.bounds.bottom - 1) / BACKGROUND_LAYER_CHUNK_SIZE);
  const chunks = await listBackgroundChunksInBounds(
    input.doc.metadata.id,
    activeLayer.id,
    minChunkX,
    maxChunkX,
    minChunkY,
    maxChunkY,
  );

  context.save();
  context.globalAlpha = activeLayer.opacity;
  for (const chunk of chunks) {
    const chunkCanvas = await blobToCanvas(chunk.blob);
    context.drawImage(
      chunkCanvas,
      chunk.chunkX * BACKGROUND_LAYER_CHUNK_SIZE,
      chunk.chunkY * BACKGROUND_LAYER_CHUNK_SIZE,
    );
  }
  context.restore();
}

function getRenderableConnections(input: ExportRenderInput): readonly Connection[] {
  if (input.settings.scope !== 'selection') {
    return Object.values(input.doc.connections);
  }

  return input.selectedConnectionIds
    .map((connectionId) => input.doc.connections[connectionId])
    .filter((connection): connection is Connection => Boolean(connection));
}

function getRenderableRooms(input: ExportRenderInput): readonly Room[] {
  if (input.settings.scope !== 'selection') {
    return Object.values(input.doc.rooms);
  }

  return input.selectedRoomIds
    .map((roomId) => input.doc.rooms[roomId])
    .filter((room): room is Room => Boolean(room));
}

function getRenderableStickyNotes(input: ExportRenderInput): readonly StickyNote[] {
  if (input.settings.scope !== 'selection') {
    return Object.values(input.doc.stickyNotes);
  }

  return input.selectedStickyNoteIds
    .map((stickyNoteId) => input.doc.stickyNotes[stickyNoteId])
    .filter((stickyNote): stickyNote is StickyNote => Boolean(stickyNote));
}

function getRenderableStickyNoteLinks(input: ExportRenderInput): readonly StickyNoteLink[] {
  if (input.settings.scope !== 'selection') {
    return Object.values(input.doc.stickyNoteLinks);
  }

  return input.selectedStickyNoteLinkIds
    .map((stickyNoteLinkId) => input.doc.stickyNoteLinks[stickyNoteLinkId])
    .filter((stickyNoteLink): stickyNoteLink is StickyNoteLink => Boolean(stickyNoteLink));
}

export async function renderExportCanvas(input: ExportRenderInput): Promise<HTMLCanvasElement> {
  const validationError = validateExportBounds(input.bounds, input.settings.scale);
  if (validationError) {
    throw new Error(validationError.message);
  }

  const { width, height } = getBoundsSize(input.bounds);
  const outputWidth = Math.ceil(width * input.settings.scale);
  const outputHeight = Math.ceil(height * input.settings.scale);
  const canvas = createSizedCanvas(outputWidth, outputHeight);
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('Could not create export canvas.');
  }

  if (input.settings.background === 'theme-canvas') {
    context.fillStyle = getCanvasBackground(input.theme);
    context.fillRect(0, 0, outputWidth, outputHeight);
  } else if (input.settings.background === 'white') {
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, outputWidth, outputHeight);
  } else {
    context.clearRect(0, 0, outputWidth, outputHeight);
  }

  const renderableConnections = getRenderableConnections(input);
  const renderableRooms = getRenderableRooms(input);
  const renderableStickyNotes = getRenderableStickyNotes(input);
  const renderableStickyNoteLinks = getRenderableStickyNoteLinks(input);

  context.save();
  context.scale(input.settings.scale, input.settings.scale);
  context.translate(-input.bounds.left, -input.bounds.top);

  if (input.settings.includeGrid) {
    drawGrid(context, input.bounds, input.theme);
  }

  if (input.settings.includeBackgroundDrawing) {
    await drawBackgroundRaster(context, input);
  }

  const renderedConnectionGeometry = renderableConnections.map((connection) => ({
    connection,
    result: drawConnectionLine(context, input.doc, connection, input.theme),
  }));

  renderableStickyNoteLinks.forEach((stickyNoteLink) => {
    drawStickyNoteLink(context, input.doc, stickyNoteLink);
  });

  renderableRooms.forEach((room) => {
    drawRoomShape(context, room, input.theme);
  });

  renderedConnectionGeometry.forEach(({ connection, result }) => {
    if (result) {
      const sourceRoom = input.doc.rooms[connection.sourceRoomId];
      const targetRoom = input.doc.rooms[connection.targetRoomId];
      if (sourceRoom && targetRoom) {
        drawConnectionLabels(context, sourceRoom, targetRoom, connection, result.geometry, result.points, input.theme);
      }
    }
  });

  renderableRooms.forEach((room) => {
    drawRoomLabel(context, room, input.theme);
  });

  renderableStickyNotes.forEach((stickyNote) => {
    drawStickyNote(context, stickyNote);
  });

  context.restore();
  return canvas;
}
