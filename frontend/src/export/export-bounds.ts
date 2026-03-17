import type { Connection, MapDocument, Position, Room, StickyNote, StickyNoteLink } from '../domain/map-types';
import { getPseudoRoomNodeDimensionsForRoom, insetPseudoRoomConnectionEndpoint, toPseudoRoomVisualRoom } from '../domain/pseudo-room-helpers';
import {
  createConnectionRenderGeometry,
  type Point,
  computeConnectionPath,
  findRoomDirectionForConnection,
  sampleConnectionGeometryAtFraction,
} from '../graph/connection-geometry';
import { getRoomForVisualStyle, getRoomNodeDimensions } from '../graph/room-label-geometry';
import { getStickyNoteCenter, getStickyNoteHeight, STICKY_NOTE_WIDTH } from '../graph/sticky-note-geometry';
import type { ExportBoundsResult, ExportRegion, ExportSettings, ExportValidationError } from './export-types';

const MAX_EXPORT_DIMENSION = 8192;
const MAX_EXPORT_PIXEL_COUNT = 33_554_432;
const APPROX_LABEL_CHAR_WIDTH = 7;
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

function createEmptyBounds(): ExportRegion {
  return {
    left: Number.POSITIVE_INFINITY,
    top: Number.POSITIVE_INFINITY,
    right: Number.NEGATIVE_INFINITY,
    bottom: Number.NEGATIVE_INFINITY,
  };
}

function hasFiniteBounds(bounds: ExportRegion): boolean {
  return Number.isFinite(bounds.left)
    && Number.isFinite(bounds.top)
    && Number.isFinite(bounds.right)
    && Number.isFinite(bounds.bottom)
    && bounds.right >= bounds.left
    && bounds.bottom >= bounds.top;
}

function includePoint(bounds: ExportRegion, point: Point): ExportRegion {
  return {
    left: Math.min(bounds.left, point.x),
    top: Math.min(bounds.top, point.y),
    right: Math.max(bounds.right, point.x),
    bottom: Math.max(bounds.bottom, point.y),
  };
}

function includeRect(bounds: ExportRegion, rect: ExportRegion): ExportRegion {
  return {
    left: Math.min(bounds.left, rect.left),
    top: Math.min(bounds.top, rect.top),
    right: Math.max(bounds.right, rect.right),
    bottom: Math.max(bounds.bottom, rect.bottom),
  };
}

function applyPadding(bounds: ExportRegion, padding: number): ExportRegion {
  return {
    left: bounds.left - padding,
    top: bounds.top - padding,
    right: bounds.right + padding,
    bottom: bounds.bottom + padding,
  };
}

function getRoomBounds(room: Room, doc: MapDocument): ExportRegion {
  const dimensions = getRoomNodeDimensions(room, doc.view.visualStyle);
  return {
    left: room.position.x,
    top: room.position.y,
    right: room.position.x + dimensions.width,
    bottom: room.position.y + dimensions.height,
  };
}

function getPseudoRoomBounds(room: Room, doc: MapDocument): ExportRegion {
  const dimensions = getPseudoRoomNodeDimensionsForRoom(room, doc.view.visualStyle);
  return {
    left: room.position.x,
    top: room.position.y,
    right: room.position.x + dimensions.width,
    bottom: room.position.y + dimensions.height,
  };
}

function getStickyNoteBounds(stickyNote: StickyNote): ExportRegion {
  return {
    left: stickyNote.position.x,
    top: stickyNote.position.y,
    right: stickyNote.position.x + STICKY_NOTE_WIDTH,
    bottom: stickyNote.position.y + getStickyNoteHeight(stickyNote.text),
  };
}

function getStickyNoteLinkBounds(doc: MapDocument, stickyNoteLink: StickyNoteLink): ExportRegion | null {
  const stickyNote = doc.stickyNotes[stickyNoteLink.stickyNoteId];
  const room = stickyNoteLink.target.kind === 'room'
    ? doc.rooms[stickyNoteLink.target.id]
    : (doc.pseudoRooms[stickyNoteLink.target.id] ? toPseudoRoomVisualRoom(doc.pseudoRooms[stickyNoteLink.target.id]) : undefined);
  if (!stickyNote || !room) {
    return null;
  }

  const stickyNoteCenter = getStickyNoteCenter(stickyNote);
  const roomDimensions = stickyNoteLink.target.kind === 'room'
    ? getRoomNodeDimensions(room, doc.view.visualStyle)
    : getPseudoRoomNodeDimensionsForRoom(room, doc.view.visualStyle);
  const roomCenter = {
    x: room.position.x + (roomDimensions.width / 2),
    y: room.position.y + (roomDimensions.height / 2),
  };

  return {
    left: Math.min(stickyNoteCenter.x, roomCenter.x),
    top: Math.min(stickyNoteCenter.y, roomCenter.y),
    right: Math.max(stickyNoteCenter.x, roomCenter.x),
    bottom: Math.max(stickyNoteCenter.y, roomCenter.y),
  };
}

function approximateTextBounds(centerX: number, centerY: number, text: string, fontSize: number): ExportRegion {
  const width = Math.max(text.length * APPROX_LABEL_CHAR_WIDTH, 10);
  const height = fontSize + 4;
  return {
    left: centerX - (width / 2),
    top: centerY - (height / 2),
    right: centerX + (width / 2),
    bottom: centerY + (height / 2),
  };
}

function getEndpointLabelBounds(start: Point, end: Point, label: string): ExportRegion | null {
  if (!label.trim()) {
    return null;
  }

  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const centerX = (start.x + end.x) / 2;
  const centerY = (start.y + end.y) / 2;
  const isMostlyHorizontal = Math.abs(dx) >= Math.abs(dy);

  return approximateTextBounds(
    isMostlyHorizontal ? centerX : centerX + 10,
    isMostlyHorizontal ? centerY - 8 : centerY,
    label.trim(),
    12,
  );
}

function getConnectionTextBounds(
  doc: MapDocument,
  connection: Connection,
  points: readonly Point[],
): ExportRegion | null {
  const sourceRoom = doc.rooms[connection.sourceRoomId];
  const targetRoom = connection.target.kind === 'room'
    ? doc.rooms[connection.target.id]
    : (doc.pseudoRooms[connection.target.id] ? toPseudoRoomVisualRoom(doc.pseudoRooms[connection.target.id]) : null);
  if (!sourceRoom || !targetRoom || points.length === 0) {
    return null;
  }

  const geometry = createConnectionRenderGeometry(
    points,
    connection.isBidirectional,
    doc.view.useBezierConnections,
    connection.target.kind === 'room' && connection.sourceRoomId === connection.target.id,
  );

  let bounds = createEmptyBounds();
  let hasText = false;

  const annotationKind = connection.annotation?.kind ?? getDerivedVerticalAnnotationKind(connection, sourceRoom, targetRoom);
  const annotationText = annotationKind === 'text'
    ? connection.annotation?.text?.trim() ?? ''
    : annotationKind === 'up' || annotationKind === 'down'
      ? annotationKind
      : annotationKind === 'in' || annotationKind === 'out'
        ? 'in'
        : '';

  if (annotationText) {
    const sample = sampleConnectionGeometryAtFraction(geometry, 0.5);
    if (sample) {
      const tangentLength = Math.hypot(sample.tangent.x, sample.tangent.y) || 1;
      const normalX = -sample.tangent.y / tangentLength;
      const normalY = sample.tangent.x / tangentLength;
      const centerX = sample.point.x + (normalX * (CONNECTION_ANNOTATION_OFFSET + CONNECTION_ANNOTATION_TEXT_OFFSET));
      const centerY = sample.point.y + (normalY * (CONNECTION_ANNOTATION_OFFSET + CONNECTION_ANNOTATION_TEXT_OFFSET));
      bounds = includeRect(bounds, approximateTextBounds(centerX, centerY, annotationText, 14));
      hasText = true;
    }
  }

  const startLabelBounds = points.length >= 2 ? getEndpointLabelBounds(points[0], points[1], connection.startLabel) : null;
  if (startLabelBounds) {
    bounds = includeRect(bounds, startLabelBounds);
    hasText = true;
  }

  const endLabelBounds = connection.isBidirectional && points.length >= 2
    ? getEndpointLabelBounds(points[points.length - 2], points[points.length - 1], connection.endLabel)
    : null;
  if (endLabelBounds) {
    bounds = includeRect(bounds, endLabelBounds);
    hasText = true;
  }

  return hasText ? bounds : null;
}

function getConnectionBounds(doc: MapDocument, connection: Connection): ExportRegion | null {
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
  const points = insetPseudoRoomConnectionEndpoint(
    connection,
    computeConnectionPath(
      effectiveSourceRoom,
      effectiveTargetRoom,
      connection,
      undefined,
      sourceDimensions,
      targetDimensions,
    ),
  );
  let bounds = createEmptyBounds();

  points.forEach((point) => {
    bounds = includePoint(bounds, point);
  });

  const textBounds = getConnectionTextBounds(doc, connection, points);
  if (textBounds) {
    bounds = includeRect(bounds, textBounds);
  }

  return hasFiniteBounds(bounds) ? bounds : null;
}

export function validateExportBounds(bounds: ExportRegion | null, scale: ExportSettings['scale']): ExportValidationError | null {
  if (!bounds) {
    return null;
  }

  const width = Math.max(0, bounds.right - bounds.left);
  const height = Math.max(0, bounds.bottom - bounds.top);
  const outputWidth = Math.ceil(width * scale);
  const outputHeight = Math.ceil(height * scale);

  if (outputWidth === 0 || outputHeight === 0) {
    return {
      code: 'empty',
      message: 'Nothing to export.',
    };
  }

  if (outputWidth > MAX_EXPORT_DIMENSION) {
    return {
      code: 'width-too-large',
      message: 'Export width is too large.',
    };
  }

  if (outputHeight > MAX_EXPORT_DIMENSION) {
    return {
      code: 'height-too-large',
      message: 'Export height is too large.',
    };
  }

  if ((outputWidth * outputHeight) > MAX_EXPORT_PIXEL_COUNT) {
    return {
      code: 'pixel-count-too-large',
      message: 'Export image is too large.',
    };
  }

  return null;
}

export function getEntireMapExportBounds(doc: MapDocument, padding: number): ExportBoundsResult {
  let bounds = createEmptyBounds();
  let hasContent = false;

  Object.values(doc.rooms).forEach((room) => {
    bounds = includeRect(bounds, getRoomBounds(room, doc));
    hasContent = true;
  });

  Object.values(doc.pseudoRooms).forEach((pseudoRoom) => {
    bounds = includeRect(bounds, getPseudoRoomBounds(toPseudoRoomVisualRoom(pseudoRoom), doc));
    hasContent = true;
  });

  Object.values(doc.connections).forEach((connection) => {
    const connectionBounds = getConnectionBounds(doc, connection);
    if (!connectionBounds) {
      return;
    }
    bounds = includeRect(bounds, connectionBounds);
    hasContent = true;
  });

  Object.values(doc.stickyNotes).forEach((stickyNote) => {
    bounds = includeRect(bounds, getStickyNoteBounds(stickyNote));
    hasContent = true;
  });

  Object.values(doc.stickyNoteLinks).forEach((stickyNoteLink) => {
    const stickyNoteLinkBounds = getStickyNoteLinkBounds(doc, stickyNoteLink);
    if (!stickyNoteLinkBounds) {
      return;
    }
    bounds = includeRect(bounds, stickyNoteLinkBounds);
    hasContent = true;
  });

  if (!hasContent || !hasFiniteBounds(bounds)) {
    return {
      bounds: null,
      validationError: {
        code: 'empty',
        message: 'Nothing to export.',
      },
    };
  }

  return {
    bounds: applyPadding(bounds, padding),
    validationError: null,
  };
}

export function getViewportExportBounds(
  viewportSize: { readonly width: number; readonly height: number },
  panOffset: Position,
  padding: number,
  zoom: number = 1,
): ExportBoundsResult {
  const safeZoom = zoom > 0 ? zoom : 1;
  const bounds = applyPadding({
    left: -panOffset.x,
    top: -panOffset.y,
    right: -panOffset.x + (viewportSize.width / safeZoom),
    bottom: -panOffset.y + (viewportSize.height / safeZoom),
  }, padding);

  return {
    bounds,
    validationError: null,
  };
}

export function getSelectionExportBounds(
  doc: MapDocument,
  selectedRoomIds: readonly string[],
  selectedStickyNoteIds: readonly string[],
  selectedConnectionIds: readonly string[],
  selectedStickyNoteLinkIds: readonly string[],
  padding: number,
): ExportBoundsResult {
  let bounds = createEmptyBounds();
  let hasContent = false;

  selectedRoomIds.forEach((roomId) => {
    const room = doc.rooms[roomId];
    if (!room) {
      return;
    }
    bounds = includeRect(bounds, getRoomBounds(room, doc));
    hasContent = true;
  });

  selectedRoomIds.forEach((roomId) => {
    const pseudoRoom = doc.pseudoRooms[roomId];
    if (!pseudoRoom) {
      return;
    }
    bounds = includeRect(bounds, getPseudoRoomBounds(toPseudoRoomVisualRoom(pseudoRoom), doc));
    hasContent = true;
  });

  selectedStickyNoteIds.forEach((stickyNoteId) => {
    const stickyNote = doc.stickyNotes[stickyNoteId];
    if (!stickyNote) {
      return;
    }
    bounds = includeRect(bounds, getStickyNoteBounds(stickyNote));
    hasContent = true;
  });

  selectedConnectionIds.forEach((connectionId) => {
    const connection = doc.connections[connectionId];
    if (!connection) {
      return;
    }
    const connectionBounds = getConnectionBounds(doc, connection);
    if (!connectionBounds) {
      return;
    }
    bounds = includeRect(bounds, connectionBounds);
    hasContent = true;
  });

  selectedStickyNoteLinkIds.forEach((stickyNoteLinkId) => {
    const stickyNoteLink = doc.stickyNoteLinks[stickyNoteLinkId];
    if (!stickyNoteLink) {
      return;
    }
    const stickyNoteLinkBounds = getStickyNoteLinkBounds(doc, stickyNoteLink);
    if (!stickyNoteLinkBounds) {
      return;
    }
    bounds = includeRect(bounds, stickyNoteLinkBounds);
    hasContent = true;
  });

  if (!hasContent || !hasFiniteBounds(bounds)) {
    return {
      bounds: null,
      validationError: {
        code: 'selection-empty',
        message: 'Select rooms, sticky notes, connections, or sticky-note links first.',
      },
    };
  }

  return {
    bounds: applyPadding(bounds, padding),
    validationError: null,
  };
}

export function getRegionExportBounds(region: ExportRegion | null, padding: number): ExportBoundsResult {
  if (!region) {
    return {
      bounds: null,
      validationError: {
        code: 'region-missing',
        message: 'Drag on the canvas to choose an export area.',
      },
    };
  }

  return {
    bounds: applyPadding({
      left: Math.min(region.left, region.right),
      top: Math.min(region.top, region.bottom),
      right: Math.max(region.left, region.right),
      bottom: Math.max(region.top, region.bottom),
    }, padding),
    validationError: null,
  };
}

export function getExportBounds(args: {
  readonly doc: MapDocument;
  readonly settings: ExportSettings;
  readonly selectedRoomIds: readonly string[];
  readonly selectedStickyNoteIds: readonly string[];
  readonly selectedConnectionIds: readonly string[];
  readonly selectedStickyNoteLinkIds: readonly string[];
  readonly viewportSize?: { readonly width: number; readonly height: number };
  readonly mapPanOffset?: Position;
  readonly viewportZoom?: number;
  readonly region?: ExportRegion | null;
}): ExportBoundsResult {
  const { doc, settings } = args;

  if (settings.scope === 'viewport') {
    if (!args.viewportSize || !args.mapPanOffset) {
      return {
        bounds: null,
        validationError: {
          code: 'empty',
          message: 'Viewport export is unavailable.',
        },
      };
    }
    return getViewportExportBounds(args.viewportSize, args.mapPanOffset, settings.padding, args.viewportZoom ?? 1);
  }

  if (settings.scope === 'selection') {
    return getSelectionExportBounds(
      doc,
      args.selectedRoomIds,
      args.selectedStickyNoteIds,
      args.selectedConnectionIds,
      args.selectedStickyNoteLinkIds,
      settings.padding,
    );
  }

  if (settings.scope === 'region') {
    return getRegionExportBounds(args.region ?? null, settings.padding);
  }

  return getEntireMapExportBounds(doc, settings.padding);
}
