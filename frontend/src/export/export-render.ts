import { BACKGROUND_LAYER_CHUNK_SIZE, type Connection, type Room, type StickyNote, type StickyNoteLink } from '../domain/map-types';
import { getRoomFillColor, getRoomStrokeColor } from '../domain/room-color-palette';
import { blobToCanvas, createSizedCanvas } from '../components/map-background-raster';
import { getRoomStrokeDasharray } from '../components/map-canvas-helpers';
import {
  computeConnectionPath,
  computeGeometryArrowheadPoints,
  createConnectionRenderGeometry,
  findRoomDirectionForConnection,
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
import { getStickyNoteCenter, getStickyNoteHeight, STICKY_NOTE_WIDTH } from '../graph/sticky-note-geometry';
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
  stickyNote.text.split('\n').forEach((line, index) => {
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

  drawConnectionGeometry(context, geometry);
  context.strokeStyle = getRoomStrokeColor(connection.strokeColorIndex, theme);
  context.lineWidth = 2;
  setDashArray(context, connection.strokeStyle);
  context.stroke();
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

  const sample = sampleConnectionGeometryAtFraction(geometry, 0.5);
  if (!sample) {
    return;
  }

  const tangentLength = Math.hypot(sample.tangent.x, sample.tangent.y) || 1;
  const normalX = -sample.tangent.y / tangentLength;
  const normalY = sample.tangent.x / tangentLength;
  const textX = sample.point.x + (normalX * (CONNECTION_ANNOTATION_OFFSET + CONNECTION_ANNOTATION_TEXT_OFFSET));
  const textY = sample.point.y + (normalY * (CONNECTION_ANNOTATION_OFFSET + CONNECTION_ANNOTATION_TEXT_OFFSET));

  context.font = '600 14px sans-serif';
  context.textAlign = 'center';
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
