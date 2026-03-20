import { BACKGROUND_LAYER_CHUNK_SIZE, type Connection, type Item, type Room, type StickyNote, type StickyNoteLink } from '../domain/map-types';
import {
  CONNECTION_DOOR_ICON_SIZE,
  CONNECTION_LOCKED_DOOR_ICON_SIZE,
  DUNGEON_ICON_PATH,
  LOCK_ICON_PATH,
} from '../components/connection-annotation-icon';
import {
  getPseudoRoomNodeDimensionsForRoom,
  getPseudoRoomGlyph,
  getPseudoRoomSymbolLayoutForRoom,
  toPseudoRoomVisualRoom,
} from '../domain/pseudo-room-helpers';
import {
  getPseudoRoomSymbolDefinition,
  PSEUDO_ROOM_SYMBOL_VIEWBOX_SIZE,
  tracePseudoRoomPathCommands,
} from '../domain/pseudo-room-symbols';
import { getRoomFillColor, getRoomLabelColor, getRoomStrokeColor } from '../domain/room-color-palette';
import { blobToCanvas, createSizedCanvas } from '../components/map-background-raster';
import { getRoomStrokeDasharray } from '../components/map-canvas-helpers';
import {
  computeConnectionPath,
  computeGeometryArrowheadPoints,
  createConnectionRenderGeometry,
  findRoomDirectionForConnection,
  findRoomDirectionsForConnection,
  ROOM_CORNER_RADIUS,
  sampleConnectionGeometryAtFraction,
  type ConnectionRenderGeometry,
  type Point,
} from '../graph/connection-geometry';
import { DARK_ROOM_INNER, DARK_ROOM_OUTER } from '../graph/dark-room-geometry';
import { PADLOCK_BODY, PADLOCK_KEYHOLE, PADLOCK_KEY_STEM } from '../graph/padlock-geometry';
import { getRoomForVisualStyle, getRoomLabelLayout, getRoomNodeDimensions } from '../graph/room-label-geometry';
import { traceRoomShapePath } from '../graph/room-shape-geometry';
import { getStickyNoteCenter, getStickyNoteHeight, getStickyNoteWrappedLines, STICKY_NOTE_WIDTH } from '../graph/sticky-note-geometry';
import {
  getAnnotationGeometryFromRenderGeometry,
  getAnnotationGeometryFromSegment,
  getDerivedVerticalAnnotationKind,
  getDirectionalAnnotationGeometry,
  getLongestSegment,
  getRoomPassThroughBounds,
  getVisibleConnectionSegments,
  normalizeReadableTextRotation,
  type PassThroughObstacle,
} from '../graph/connection-decoration-geometry';
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
const CONNECTION_ANNOTATION_TEXT_OFFSET = 12;
const CONNECTION_ICON_VIEWBOX_SIZE = 640;
const ROOM_ITEM_LABEL_RIGHT_INSET = 7;

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

function drawConnectionAnnotationIcon(
  context: CanvasRenderingContext2D,
  pathData: string,
  size: number,
  color: string,
): boolean {
  if (typeof Path2D === 'undefined') {
    return false;
  }

  context.save();
  context.fillStyle = color;
  context.scale(size / CONNECTION_ICON_VIEWBOX_SIZE, size / CONNECTION_ICON_VIEWBOX_SIZE);
  context.fill(new Path2D(pathData));
  context.restore();
  return true;
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

function drawRoomShape(
  context: CanvasRenderingContext2D,
  room: Room,
  theme: ExportRenderInput['theme'],
  visualStyle: ExportRenderInput['doc']['view']['visualStyle'],
): void {
  const dimensions = getRoomNodeDimensions(room, visualStyle);
  const width = dimensions.width;
  const left = room.position.x;
  const top = room.position.y;

  context.beginPath();
  if (visualStyle === 'square-classic') {
    traceRoomShapePath(context, 'rectangle', left, top, width, dimensions.height, 0);
  } else {
    traceRoomShapePath(context, room.shape, left, top, width, dimensions.height, ROOM_CORNER_RADIUS);
  }

  context.fillStyle = getRoomFillColor(room.fillColorIndex, theme);
  context.strokeStyle = getRoomStrokeColor(room.strokeColorIndex, theme);
  context.lineWidth = 2;
  setDashArray(context, room.strokeStyle);
  context.fill();
  context.stroke();
  context.setLineDash([]);
}

function drawRoomLabel(
  context: CanvasRenderingContext2D,
  room: Room,
  theme: ExportRenderInput['theme'],
  visualStyle: ExportRenderInput['doc']['view']['visualStyle'],
): void {
  const dimensions = getRoomNodeDimensions(room, visualStyle);
  const width = dimensions.width;
  const labelLayout = getRoomLabelLayout(room, width, dimensions.height, visualStyle);
  const foreground = getForegroundColor(theme);
  const roomFill = getRoomFillColor(room.fillColorIndex, theme);
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

  if (room.isDark && labelLayout.darkX !== null && labelLayout.darkY !== null) {
    const offsetX = room.position.x + labelLayout.darkX;
    const offsetY = room.position.y + labelLayout.darkY;

    context.save();
    context.translate(offsetX, offsetY);
    context.fillStyle = roomStroke;
    context.beginPath();
    context.arc(DARK_ROOM_OUTER.cx, DARK_ROOM_OUTER.cy, DARK_ROOM_OUTER.r, 0, Math.PI * 2);
    context.fill();

    context.fillStyle = roomFill;
    context.beginPath();
    context.arc(DARK_ROOM_INNER.cx, DARK_ROOM_INNER.cy, DARK_ROOM_INNER.r, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  context.fillStyle = getForegroundColor(theme);
  context.font = '600 13px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  labelLayout.lines.forEach((line, index) => {
    context.fillText(
      line,
      room.position.x + labelLayout.textX,
      room.position.y + labelLayout.firstLineY + (index * labelLayout.lineHeight),
    );
  });
}

function drawRoomItems(
  context: CanvasRenderingContext2D,
  room: Room,
  roomItems: readonly Item[],
  theme: ExportRenderInput['theme'],
  visualStyle: ExportRenderInput['doc']['view']['visualStyle'],
): void {
  if (roomItems.length === 0) {
    return;
  }

  const dimensions = getRoomNodeDimensions(room, visualStyle);
  const visibleItemNames = roomItems.slice(0, 3).map((item) => item.name);
  const hiddenItemCount = Math.max(0, roomItems.length - visibleItemNames.length);
  const itemLabelLines = hiddenItemCount > 0
    ? [...visibleItemNames, `+${hiddenItemCount} more`]
    : visibleItemNames;

  context.fillStyle = getRoomLabelColor(theme);
  context.font = '500 11px sans-serif';
  context.textAlign = 'right';
  context.textBaseline = 'top';
  itemLabelLines.forEach((line, index) => {
    context.fillText(
      line,
      room.position.x + (dimensions.width / 2) - ROOM_ITEM_LABEL_RIGHT_INSET,
      room.position.y + dimensions.height + 14 + (index * 12),
    );
  });
}

function drawPseudoRoomSymbol(
  context: CanvasRenderingContext2D,
  room: Room,
  theme: ExportRenderInput['theme'],
  visualStyle: ExportRenderInput['doc']['view']['visualStyle'],
): void {
  const symbolLayout = getPseudoRoomSymbolLayoutForRoom(room, visualStyle);
  const symbolKind = room.name === getPseudoRoomGlyph('unknown')
    ? 'unknown'
    : room.name === getPseudoRoomGlyph('infinite')
      ? 'infinite'
      : room.name === getPseudoRoomGlyph('death')
        ? 'death'
        : room.name === getPseudoRoomGlyph('elsewhere')
          ? 'elsewhere'
          : 'nowhere';
  const symbolDefinition = getPseudoRoomSymbolDefinition(symbolKind);
  const scale = symbolLayout.size / (symbolDefinition.viewBoxSize ?? PSEUDO_ROOM_SYMBOL_VIEWBOX_SIZE);

  context.save();
  context.translate(
    room.position.x + symbolLayout.x - (symbolLayout.size / 2),
    room.position.y + symbolLayout.y - (symbolLayout.size / 2),
  );
  context.scale(scale, scale);
  context.strokeStyle = getRoomLabelColor(theme);
  context.fillStyle = getRoomLabelColor(theme);

  symbolDefinition.paths.forEach((path) => {
    context.beginPath();
    tracePseudoRoomPathCommands(context, path.commands);
    context.lineWidth = path.strokeWidth;
    context.lineCap = path.lineCap ?? 'butt';
    context.lineJoin = path.lineJoin ?? 'miter';
    context.stroke();
  });

  (symbolDefinition.circles ?? []).forEach((circle) => {
    context.beginPath();
    context.arc(circle.cx, circle.cy, circle.r, 0, Math.PI * 2);
    context.fill();
  });

  if (typeof Path2D !== 'undefined') {
    (symbolDefinition.filledPaths ?? []).forEach((path) => {
      context.fill(new Path2D(path.d));
    });
  }

  context.restore();
}

function drawPseudoRoomShape(
  context: CanvasRenderingContext2D,
  room: Room,
  theme: ExportRenderInput['theme'],
  visualStyle: ExportRenderInput['doc']['view']['visualStyle'],
): void {
  const dimensions = getPseudoRoomNodeDimensionsForRoom(room, visualStyle);
  const left = room.position.x;
  const top = room.position.y;

  context.beginPath();
  if (visualStyle === 'square-classic') {
    traceRoomShapePath(context, 'rectangle', left, top, dimensions.width, dimensions.height, 0);
  } else {
    traceRoomShapePath(context, room.shape, left, top, dimensions.width, dimensions.height, ROOM_CORNER_RADIUS);
  }

  context.fillStyle = getRoomFillColor(room.fillColorIndex, theme);
  context.strokeStyle = getRoomStrokeColor(room.strokeColorIndex, theme);
  context.lineWidth = 2;
  setDashArray(context, room.strokeStyle);
  context.fill();
  context.stroke();
  context.setLineDash([]);
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
  const room = stickyNoteLink.target.kind === 'room'
    ? doc.rooms[stickyNoteLink.target.id]
    : (doc.pseudoRooms[stickyNoteLink.target.id] ? toPseudoRoomVisualRoom(doc.pseudoRooms[stickyNoteLink.target.id]) : undefined);
  if (!stickyNote || !room) {
    return;
  }

  const stickyNoteCenter = getStickyNoteCenter(stickyNote);
  const roomDimensions = stickyNoteLink.target.kind === 'room'
    ? getRoomNodeDimensions(room, doc.view.visualStyle)
    : getPseudoRoomNodeDimensionsForRoom(room, doc.view.visualStyle);
  const roomCenter = {
    x: room.position.x + (roomDimensions.width / 2),
    y: room.position.y + (roomDimensions.height / 2),
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


function drawConnectionLine(
  context: CanvasRenderingContext2D,
  doc: ExportRenderInput['doc'],
  connection: Connection,
  theme: ExportRenderInput['theme'],
): { geometry: ConnectionRenderGeometry; points: readonly Point[] } | null {
  const sourceRoom = doc.rooms[connection.sourceRoomId];
  const targetRoom = connection.target.kind === 'room'
    ? doc.rooms[connection.target.id]
    : (doc.pseudoRooms[connection.target.id] ? toPseudoRoomVisualRoom(doc.pseudoRooms[connection.target.id]) : null);
  if (!sourceRoom || !targetRoom) {
    return null;
  }

  const effectiveSourceRoom = getRoomForVisualStyle(sourceRoom, doc.view.visualStyle);
  const effectiveTargetRoom = getRoomForVisualStyle(targetRoom, doc.view.visualStyle);

  const sourceDimensions = getRoomNodeDimensions(effectiveSourceRoom, doc.view.visualStyle);
  const targetDimensions = connection.target.kind === 'room'
    ? getRoomNodeDimensions(effectiveTargetRoom, doc.view.visualStyle)
    : getPseudoRoomNodeDimensionsForRoom(effectiveTargetRoom, doc.view.visualStyle);
  const points = computeConnectionPath(
    effectiveSourceRoom,
    effectiveTargetRoom,
    connection,
    undefined,
    sourceDimensions,
    targetDimensions,
  );
  const geometry = createConnectionRenderGeometry(
    points,
    connection.isBidirectional,
    doc.view.useBezierConnections,
    connection.target.kind === 'room' && connection.sourceRoomId === connection.target.id,
  );

  context.strokeStyle = getRoomStrokeColor(connection.strokeColorIndex, theme);
  context.lineWidth = 2;
  setDashArray(context, connection.strokeStyle);
  if (!(connection.target.kind === 'room' && connection.sourceRoomId === connection.target.id)) {
    const gapObstacles: Readonly<Record<string, PassThroughObstacle>> = Object.fromEntries([
      ...Object.entries(doc.rooms).map(([roomId, room]) => [
        roomId,
        getRoomPassThroughBounds(getRoomForVisualStyle(room, doc.view.visualStyle), doc.view.visualStyle),
      ]),
      ...Object.entries(doc.pseudoRooms).map(([pseudoRoomId, pseudoRoom]) => {
        const visualRoom = getRoomForVisualStyle(
          toPseudoRoomVisualRoom(pseudoRoom),
          doc.view.visualStyle,
        );
        const dimensions = getPseudoRoomNodeDimensionsForRoom(visualRoom, doc.view.visualStyle);
        return [
          pseudoRoomId,
          {
            id: pseudoRoomId,
            left: visualRoom.position.x - 6,
            right: visualRoom.position.x + dimensions.width + 6,
            top: visualRoom.position.y - 6,
            bottom: visualRoom.position.y + dimensions.height + 6,
          },
        ];
      }),
    ]);
    const visibleGapResult = getVisibleConnectionSegments(
      connection,
      geometry.kind === 'polyline' ? points : geometry,
      gapObstacles,
    );
    if (visibleGapResult.hasGap) {
      visibleGapResult.segments.forEach((segment) => {
        context.beginPath();
        context.moveTo(segment.start.x, segment.start.y);
        context.lineTo(segment.end.x, segment.end.y);
        context.stroke();
      });
      visibleGapResult.crossbars.forEach((segment) => {
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

  const isSelfConnection = connection.target.kind === 'room' && connection.sourceRoomId === connection.target.id;
  const sourceDirections = findRoomDirectionsForConnection(sourceRoom, connection.id);
  const sourceDirection = sourceDirections[0] ?? null;
  const targetDirection = connection.isBidirectional
    ? (isSelfConnection
      ? (sourceDirections[1] ?? null)
      : (findRoomDirectionForConnection(targetRoom, connection.id) ?? null))
    : null;
  const explicitAnnotationKind = connection.annotation?.kind ?? null;
  const derivedVerticalAnnotationKind = getDerivedVerticalAnnotationKind(connection, sourceDirection, targetDirection);
  const directionalAnnotationKind = explicitAnnotationKind === 'up'
    || explicitAnnotationKind === 'down'
    || explicitAnnotationKind === 'in'
    || explicitAnnotationKind === 'out'
    ? explicitAnnotationKind
    : derivedVerticalAnnotationKind;
  const annotationLabel = explicitAnnotationKind === 'text'
    ? connection.annotation?.text?.trim() ?? ''
    : directionalAnnotationKind === 'up' || directionalAnnotationKind === 'down'
      ? directionalAnnotationKind
      : directionalAnnotationKind === 'in' || directionalAnnotationKind === 'out'
        ? 'in'
        : '';
  const doorCenter = geometry.kind === 'polyline'
    ? (() => {
      const segment = getLongestSegment(points);
      return segment
        ? {
          x: (segment.start.x + segment.end.x) / 2,
          y: (segment.start.y + segment.end.y) / 2,
        }
        : null;
    })()
    : sampleConnectionGeometryAtFraction(geometry, 0.5)?.point ?? null;

  if ((explicitAnnotationKind === 'door' || explicitAnnotationKind === 'locked door') && doorCenter) {
    const glyphColor = getRoomStrokeColor(connection.strokeColorIndex, theme);
    const glyphSize = explicitAnnotationKind === 'door'
      ? CONNECTION_DOOR_ICON_SIZE
      : CONNECTION_LOCKED_DOOR_ICON_SIZE;
    context.save();
    context.translate(doorCenter.x - (glyphSize / 2), doorCenter.y - (glyphSize / 2));

    const didDrawSvg = drawConnectionAnnotationIcon(
      context,
      explicitAnnotationKind === 'door' ? DUNGEON_ICON_PATH : LOCK_ICON_PATH,
      glyphSize,
      glyphColor,
    );

    if (!didDrawSvg) {
      context.fillStyle = glyphColor;
      context.fillRect(0, 0, glyphSize, glyphSize);
    }

    context.restore();
  }

  if (!annotationLabel) {
    return;
  }

  context.font = '600 14px sans-serif';
  context.textAlign = 'center';
  context.textBaseline = 'middle';

  if (directionalAnnotationKind === 'up' || directionalAnnotationKind === 'down' || directionalAnnotationKind === 'in' || directionalAnnotationKind === 'out') {
    const rendersSelfVerticalDirectionalAnnotation = isSelfConnection
      && (directionalAnnotationKind === 'up' || directionalAnnotationKind === 'down')
      && (sourceDirection === 'up'
        || sourceDirection === 'down'
        || targetDirection === 'up'
        || targetDirection === 'down');
    const directionalAnnotation = rendersSelfVerticalDirectionalAnnotation
      ? (() => {
        const selfVerticalSegment = getSelfVerticalAnnotationSegment(points);
        return selfVerticalSegment
          ? getAnnotationGeometryFromSegment(
            selfVerticalSegment,
            directionalAnnotationKind === 'down',
            annotationLabel,
            true,
            false,
          )
          : null;
      })()
      : getDirectionalAnnotationGeometry(
        directionalAnnotationKind,
        annotationLabel,
        geometry,
        points,
        sourceDirection,
        targetDirection,
      );
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

  if (explicitAnnotationKind === 'text') {
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

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, payload = ''] = dataUrl.split(',', 2);
  const mimeMatch = /^data:([^;]+)(;base64)?$/i.exec(header);
  const mimeType = mimeMatch?.[1] ?? 'application/octet-stream';
  const isBase64 = Boolean(mimeMatch?.[2]);
  const decoded = isBase64 ? atob(payload) : decodeURIComponent(payload);
  const bytes = new Uint8Array(decoded.length);

  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }

  return new Blob([bytes], { type: mimeType });
}

async function drawBackgroundReferenceImage(
  context: CanvasRenderingContext2D,
  input: ExportRenderInput,
): Promise<void> {
  const referenceImage = input.doc.background.referenceImage;
  if (!referenceImage) {
    return;
  }

  const imageCanvas = await blobToCanvas(dataUrlToBlob(referenceImage.dataUrl));
  const width = referenceImage.width * referenceImage.zoom;
  const height = referenceImage.height * referenceImage.zoom;
  const left = -(width / 2);
  const top = -(height / 2);

  context.drawImage(imageCanvas, left, top, width, height);
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

function getRenderablePseudoRooms(input: ExportRenderInput): readonly Room[] {
  if (input.settings.scope !== 'selection') {
    return Object.values(input.doc.pseudoRooms).map((pseudoRoom) => toPseudoRoomVisualRoom(pseudoRoom));
  }

  const renderablePseudoRooms = new Map<string, Room>();
  Object.values(input.doc.pseudoRooms).forEach((pseudoRoom) => {
    if (input.selectedRoomIds.includes(pseudoRoom.id)) {
      renderablePseudoRooms.set(pseudoRoom.id, toPseudoRoomVisualRoom(pseudoRoom));
    }
  });

  input.selectedConnectionIds.forEach((connectionId) => {
    const connection = input.doc.connections[connectionId];
    if (!connection || connection.target.kind !== 'pseudo-room') {
      return;
    }

    const pseudoRoom = input.doc.pseudoRooms[connection.target.id];
    if (!pseudoRoom) {
      return;
    }

    renderablePseudoRooms.set(pseudoRoom.id, toPseudoRoomVisualRoom(pseudoRoom));
  });

  return [...renderablePseudoRooms.values()];
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
  const renderablePseudoRooms = getRenderablePseudoRooms(input);
  const renderableStickyNotes = getRenderableStickyNotes(input);
  const renderableStickyNoteLinks = getRenderableStickyNoteLinks(input);

  context.save();
  context.scale(input.settings.scale, input.settings.scale);
  context.translate(-input.bounds.left, -input.bounds.top);

  if (input.settings.includeBackgroundImage) {
    await drawBackgroundReferenceImage(context, input);
  }

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
    drawRoomShape(context, room, input.theme, input.doc.view.visualStyle);
  });

  renderablePseudoRooms.forEach((pseudoRoom) => {
    drawPseudoRoomShape(context, pseudoRoom, input.theme, input.doc.view.visualStyle);
  });

  renderedConnectionGeometry.forEach(({ connection, result }) => {
    if (result) {
      const sourceRoom = input.doc.rooms[connection.sourceRoomId];
      const targetRoom = connection.target.kind === 'room'
        ? input.doc.rooms[connection.target.id]
        : (input.doc.pseudoRooms[connection.target.id] ? toPseudoRoomVisualRoom(input.doc.pseudoRooms[connection.target.id]) : null);
      if (sourceRoom && targetRoom) {
        drawConnectionLabels(context, sourceRoom, targetRoom, connection, result.geometry, result.points, input.theme);
      }
    }
  });

  renderableRooms.forEach((room) => {
    drawRoomLabel(context, room, input.theme, input.doc.view.visualStyle);
    drawRoomItems(
      context,
      room,
      Object.values(input.doc.items).filter((item) => item.roomId === room.id),
      input.theme,
      input.doc.view.visualStyle,
    );
  });

  renderablePseudoRooms.forEach((pseudoRoom) => {
    drawPseudoRoomSymbol(context, pseudoRoom, input.theme, input.doc.view.visualStyle);
  });

  renderableStickyNotes.forEach((stickyNote) => {
    drawStickyNote(context, stickyNote);
  });

  context.restore();
  return canvas;
}
