import type { MapDocument, MapVisualStyle, Position, Room, StickyNote } from '../domain/map-types';
import { toPseudoRoomVisualRoom } from '../domain/pseudo-room-helpers';
import { getRoomNodeDimensions } from './room-label-geometry';
import { getStickyNoteHeight, STICKY_NOTE_WIDTH } from './sticky-note-geometry';
const ROOM_VERTICAL_GAP = 24;
const ROOM_HORIZONTAL_GAP = 40;
const STICKY_NOTE_GAP = 24;

export const PRETTIFY_GRID_SIZE = 20;
export const PRETTIFY_HORIZONTAL_SPACING = 200;
export const PRETTIFY_VERTICAL_SPACING = 160;

const RELAXATION_ITERATIONS = 80;
const SPRING_STRENGTH = 0.14;
const ANCHOR_STRENGTH = 0.035;
const REPULSION_STRENGTH = 18_000;
const MAX_STEP = 18;

interface Vector {
  x: number;
  y: number;
}

interface DirectionConstraint {
  readonly fromRoomId: string;
  readonly toRoomId: string;
  readonly delta: Vector;
}

interface PrettifiedLayoutPositions {
  readonly roomPositions: Readonly<Record<string, Position>>;
  readonly pseudoRoomPositions: Readonly<Record<string, Position>>;
  readonly stickyNotePositions: Readonly<Record<string, Position>>;
}

const COMPASS_DIRECTION_VECTORS: Readonly<Record<string, Vector>> = {
  north: { x: 0, y: -1 },
  northeast: { x: 1, y: -1 },
  east: { x: 1, y: 0 },
  southeast: { x: 1, y: 1 },
  south: { x: 0, y: 1 },
  southwest: { x: -1, y: 1 },
  west: { x: -1, y: 0 },
  northwest: { x: -1, y: -1 },
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
};

function snapCoordinate(value: number): number {
  const snapped = Math.round(value / PRETTIFY_GRID_SIZE) * PRETTIFY_GRID_SIZE;
  return Object.is(snapped, -0) ? 0 : snapped;
}

function getRoomDimensions(room: Room, visualStyle: MapVisualStyle): { readonly width: number; readonly height: number } {
  return getRoomNodeDimensions(room, visualStyle);
}

function estimateRoomWidth(room: Room, visualStyle: MapVisualStyle): number {
  return getRoomDimensions(room, visualStyle).width;
}

function getLayoutRoom(doc: MapDocument, roomId: string): Room | null {
  const room = doc.rooms[roomId];
  if (room) {
    return room;
  }

  const pseudoRoom = doc.pseudoRooms[roomId];
  return pseudoRoom ? toPseudoRoomVisualRoom(pseudoRoom) : null;
}

function getLayoutPosition(doc: MapDocument, roomId: string): Position | null {
  const room = doc.rooms[roomId];
  if (room) {
    return room.position;
  }

  return doc.pseudoRooms[roomId]?.position ?? null;
}

function toRoomCenter(room: Room, position: Position, visualStyle: MapVisualStyle): Vector {
  const dimensions = getRoomDimensions(room, visualStyle);
  return {
    x: position.x + (dimensions.width / 2),
    y: position.y + (dimensions.height / 2),
  };
}

function toRoomTopLeft(room: Room, center: Vector, visualStyle: MapVisualStyle): Position {
  const dimensions = getRoomDimensions(room, visualStyle);
  return {
    x: center.x - (dimensions.width / 2),
    y: center.y - (dimensions.height / 2),
  };
}

function getConstraintDelta(direction: string): Vector | undefined {
  const vector = COMPASS_DIRECTION_VECTORS[direction];
  if (!vector) {
    return undefined;
  }

  return {
    x: vector.x * PRETTIFY_HORIZONTAL_SPACING,
    y: vector.y * PRETTIFY_VERTICAL_SPACING,
  };
}

function deriveDirectionConstraints(doc: MapDocument): DirectionConstraint[] {
  const constraints: DirectionConstraint[] = [];

  for (const room of Object.values(doc.rooms)) {
    for (const [direction, connectionId] of Object.entries(room.directions)) {
      const connection = doc.connections[connectionId];
      const delta = getConstraintDelta(direction);
      if (!connection || !delta) {
        continue;
      }

      const otherRoomId = connection.sourceRoomId === room.id
        ? connection.target.id
        : connection.target.kind === 'room' && connection.target.id === room.id
          ? connection.sourceRoomId
          : undefined;

      if (!otherRoomId || otherRoomId === room.id || !getLayoutRoom(doc, otherRoomId)) {
        continue;
      }

      constraints.push({
        fromRoomId: room.id,
        toRoomId: otherRoomId,
        delta,
      });
    }
  }

  return constraints;
}

function positionsEqual(
  left: Readonly<Record<string, Position>>,
  right: Readonly<Record<string, Position>>,
): boolean {
  const leftRoomIds = Object.keys(left).sort();
  const rightRoomIds = Object.keys(right).sort();
  if (leftRoomIds.length !== rightRoomIds.length) {
    return false;
  }

  for (let index = 0; index < leftRoomIds.length; index += 1) {
    const leftRoomId = leftRoomIds[index];
    const rightRoomId = rightRoomIds[index];
    if (leftRoomId !== rightRoomId) {
      return false;
    }

    const leftPosition = left[leftRoomId];
    const rightPosition = right[rightRoomId];
    if (leftPosition.x !== rightPosition.x || leftPosition.y !== rightPosition.y) {
      return false;
    }
  }

  return true;
}

function comparePositionsLexicographically(
  left: Readonly<Record<string, Position>>,
  right: Readonly<Record<string, Position>>,
): number {
  const roomIds = Array.from(new Set([...Object.keys(left), ...Object.keys(right)])).sort();
  for (const roomId of roomIds) {
    const leftPosition = left[roomId];
    const rightPosition = right[roomId];
    if (!leftPosition && !rightPosition) {
      continue;
    }
    if (!leftPosition) {
      return -1;
    }
    if (!rightPosition) {
      return 1;
    }
    if (leftPosition.y !== rightPosition.y) {
      return leftPosition.y - rightPosition.y;
    }
    if (leftPosition.x !== rightPosition.x) {
      return leftPosition.x - rightPosition.x;
    }
  }

  return 0;
}

function compareLayoutPositionsLexicographically(
  leftRooms: Readonly<Record<string, Position>>,
  leftPseudoRooms: Readonly<Record<string, Position>>,
  rightRooms: Readonly<Record<string, Position>>,
  rightPseudoRooms: Readonly<Record<string, Position>>,
): number {
  const roomComparison = comparePositionsLexicographically(leftRooms, rightRooms);
  if (roomComparison !== 0) {
    return roomComparison;
  }

  return comparePositionsLexicographically(leftPseudoRooms, rightPseudoRooms);
}

function withRoomPositions(doc: MapDocument, positions: Readonly<Record<string, Position>>): MapDocument {
  return {
    ...doc,
    rooms: Object.fromEntries(
      Object.entries(doc.rooms).map(([roomId, room]) => [
        roomId,
        positions[roomId] ? { ...room, position: positions[roomId] } : room,
      ]),
    ),
  };
}

function withPseudoRoomPositions(doc: MapDocument, positions: Readonly<Record<string, Position>>): MapDocument {
  return {
    ...doc,
    pseudoRooms: Object.fromEntries(
      Object.entries(doc.pseudoRooms).map(([pseudoRoomId, pseudoRoom]) => [
        pseudoRoomId,
        positions[pseudoRoomId] ? { ...pseudoRoom, position: positions[pseudoRoomId] } : pseudoRoom,
      ]),
    ),
  };
}

function getConnectedComponents(roomIds: readonly string[], constraints: readonly DirectionConstraint[]): string[][] {
  const adjacency = new Map<string, Set<string>>();
  for (const roomId of roomIds) {
    adjacency.set(roomId, new Set());
  }

  for (const constraint of constraints) {
    adjacency.get(constraint.fromRoomId)?.add(constraint.toRoomId);
    adjacency.get(constraint.toRoomId)?.add(constraint.fromRoomId);
  }

  const remaining = new Set(roomIds);
  const components: string[][] = [];

  while (remaining.size > 0) {
    const [startRoomId] = remaining;
    const queue = [startRoomId];
    const component: string[] = [];
    remaining.delete(startRoomId);

    while (queue.length > 0) {
      const roomId = queue.shift()!;
      component.push(roomId);

      for (const neighborId of adjacency.get(roomId) ?? []) {
        if (!remaining.has(neighborId)) {
          continue;
        }

        remaining.delete(neighborId);
        queue.push(neighborId);
      }
    }

    components.push(component.sort());
  }

  return components;
}

function computeSeedPositions(componentRoomIds: readonly string[], constraints: readonly DirectionConstraint[]): Map<string, Vector> {
  const componentSet = new Set(componentRoomIds);
  const adjacency = new Map<string, Array<{ roomId: string; delta: Vector }>>();

  for (const roomId of componentRoomIds) {
    adjacency.set(roomId, []);
  }

  for (const constraint of constraints) {
    if (!componentSet.has(constraint.fromRoomId) || !componentSet.has(constraint.toRoomId)) {
      continue;
    }

    adjacency.get(constraint.fromRoomId)?.push({ roomId: constraint.toRoomId, delta: constraint.delta });
    adjacency.get(constraint.toRoomId)?.push({
      roomId: constraint.fromRoomId,
      delta: { x: -constraint.delta.x, y: -constraint.delta.y },
    });
  }

  const seedPositions = new Map<string, Vector>();
  const anchorRoomId = [...componentRoomIds].sort()[0];
  const queue = [anchorRoomId];
  seedPositions.set(anchorRoomId, { x: 0, y: 0 });

  while (queue.length > 0) {
    const roomId = queue.shift()!;
    const position = seedPositions.get(roomId)!;

    for (const neighbor of adjacency.get(roomId) ?? []) {
      if (seedPositions.has(neighbor.roomId)) {
        continue;
      }

      seedPositions.set(neighbor.roomId, {
        x: position.x + neighbor.delta.x,
        y: position.y + neighbor.delta.y,
      });
      queue.push(neighbor.roomId);
    }
  }

  for (const roomId of componentRoomIds) {
    if (!seedPositions.has(roomId)) {
      seedPositions.set(roomId, { x: 0, y: 0 });
    }
  }

  return seedPositions;
}

function computeSeedCentroid(roomIds: readonly string[], seedPositions: ReadonlyMap<string, Vector>): Vector {
  const total = roomIds.reduce(
    (acc, roomId) => {
      const position = seedPositions.get(roomId)!;
      return { x: acc.x + position.x, y: acc.y + position.y };
    },
    { x: 0, y: 0 },
  );

  return {
    x: total.x / roomIds.length,
    y: total.y / roomIds.length,
  };
}

function getCentroidAnchorRoomIds(componentRoomIds: readonly string[], doc: MapDocument): readonly string[] {
  const realRoomIds = componentRoomIds.filter((roomId) => roomId in doc.rooms);
  return realRoomIds.length > 0 ? realRoomIds : componentRoomIds;
}

function computeComponentSeedOffset(
  componentRoomIds: readonly string[],
  seedPositions: ReadonlyMap<string, Vector>,
  doc: MapDocument,
  lockedRoomIds: ReadonlySet<string>,
): Vector {
  const centroidAnchorRoomIds = getCentroidAnchorRoomIds(componentRoomIds, doc);
  const visualStyle = doc.view.visualStyle;
  const lockedComponentRoomIds = centroidAnchorRoomIds.filter((roomId) => lockedRoomIds.has(roomId));
  if (lockedComponentRoomIds.length > 0) {
    const total = lockedComponentRoomIds.reduce(
      (acc, roomId) => {
        const room = getLayoutRoom(doc, roomId)!;
        const position = getLayoutPosition(doc, roomId)!;
        const actualCenter = toRoomCenter(room, position, visualStyle);
        const seedCenter = seedPositions.get(roomId)!;
        return {
          x: acc.x + (actualCenter.x - seedCenter.x),
          y: acc.y + (actualCenter.y - seedCenter.y),
        };
      },
      { x: 0, y: 0 },
    );

    return {
      x: total.x / lockedComponentRoomIds.length,
      y: total.y / lockedComponentRoomIds.length,
    };
  }

  const seedCentroid = computeSeedCentroid(centroidAnchorRoomIds, seedPositions);
  const originalCentroid = computeOriginalCentroid(centroidAnchorRoomIds, doc);
  return {
    x: originalCentroid.x - seedCentroid.x,
    y: originalCentroid.y - seedCentroid.y,
  };
}

function limitStep(value: number): number {
  return Math.max(-MAX_STEP, Math.min(MAX_STEP, value));
}

function relaxComponent(
  roomIds: readonly string[],
  seedPositions: ReadonlyMap<string, Vector>,
  constraints: readonly DirectionConstraint[],
  lockedRoomIds: ReadonlySet<string>,
): Map<string, Vector> {
  const positions = new Map<string, Vector>();
  for (const roomId of roomIds) {
    const seed = seedPositions.get(roomId)!;
    positions.set(roomId, { x: seed.x, y: seed.y });
  }

  for (let iteration = 0; iteration < RELAXATION_ITERATIONS; iteration += 1) {
    const forces = new Map<string, Vector>();
    for (const roomId of roomIds) {
      forces.set(roomId, { x: 0, y: 0 });
    }

    for (const constraint of constraints) {
      if (!positions.has(constraint.fromRoomId) || !positions.has(constraint.toRoomId)) {
        continue;
      }

      const fromPosition = positions.get(constraint.fromRoomId)!;
      const toPosition = positions.get(constraint.toRoomId)!;
      const errorX = (toPosition.x - fromPosition.x) - constraint.delta.x;
      const errorY = (toPosition.y - fromPosition.y) - constraint.delta.y;
      const fromLocked = lockedRoomIds.has(constraint.fromRoomId);
      const toLocked = lockedRoomIds.has(constraint.toRoomId);

      if (!fromLocked && !toLocked) {
        forces.get(constraint.fromRoomId)!.x += errorX * SPRING_STRENGTH * 0.5;
        forces.get(constraint.fromRoomId)!.y += errorY * SPRING_STRENGTH * 0.5;
        forces.get(constraint.toRoomId)!.x -= errorX * SPRING_STRENGTH * 0.5;
        forces.get(constraint.toRoomId)!.y -= errorY * SPRING_STRENGTH * 0.5;
      } else if (!fromLocked) {
        forces.get(constraint.fromRoomId)!.x += errorX * SPRING_STRENGTH;
        forces.get(constraint.fromRoomId)!.y += errorY * SPRING_STRENGTH;
      } else if (!toLocked) {
        forces.get(constraint.toRoomId)!.x -= errorX * SPRING_STRENGTH;
        forces.get(constraint.toRoomId)!.y -= errorY * SPRING_STRENGTH;
      }
    }

    for (let index = 0; index < roomIds.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < roomIds.length; otherIndex += 1) {
        const roomId = roomIds[index];
        const otherRoomId = roomIds[otherIndex];
        const position = positions.get(roomId)!;
        const otherPosition = positions.get(otherRoomId)!;
        const dx = otherPosition.x - position.x;
        const dy = otherPosition.y - position.y;
        const distanceSquared = Math.max((dx * dx) + (dy * dy), 1);
        const distance = Math.sqrt(distanceSquared);
        const repulsion = REPULSION_STRENGTH / distanceSquared;
        const forceX = (dx / distance) * repulsion;
        const forceY = (dy / distance) * repulsion;
        const roomLocked = lockedRoomIds.has(roomId);
        const otherRoomLocked = lockedRoomIds.has(otherRoomId);

        if (!roomLocked && !otherRoomLocked) {
          forces.get(roomId)!.x -= forceX;
          forces.get(roomId)!.y -= forceY;
          forces.get(otherRoomId)!.x += forceX;
          forces.get(otherRoomId)!.y += forceY;
        } else if (!roomLocked) {
          forces.get(roomId)!.x -= forceX;
          forces.get(roomId)!.y -= forceY;
        } else if (!otherRoomLocked) {
          forces.get(otherRoomId)!.x += forceX;
          forces.get(otherRoomId)!.y += forceY;
        }
      }
    }

    for (const roomId of roomIds) {
      if (lockedRoomIds.has(roomId)) {
        continue;
      }

      const seed = seedPositions.get(roomId)!;
      const position = positions.get(roomId)!;
      const force = forces.get(roomId)!;
      force.x += (seed.x - position.x) * ANCHOR_STRENGTH;
      force.y += (seed.y - position.y) * ANCHOR_STRENGTH;

      position.x += limitStep(force.x);
      position.y += limitStep(force.y);
    }
  }

  return positions;
}

function computeOriginalCentroid(roomIds: readonly string[], doc: MapDocument): Vector {
  const visualStyle = doc.view.visualStyle;
  const total = roomIds.reduce(
      (acc, roomId) => {
      const room = getLayoutRoom(doc, roomId)!;
      const position = getLayoutPosition(doc, roomId)!;
      const center = toRoomCenter(room, position, visualStyle);
      return { x: acc.x + center.x, y: acc.y + center.y };
    },
    { x: 0, y: 0 },
  );

  return {
    x: total.x / roomIds.length,
    y: total.y / roomIds.length,
  };
}

function computePlacedCentroid(
  roomIds: readonly string[],
  positions: ReadonlyMap<string, Position>,
  doc: MapDocument,
): Vector {
  const visualStyle = doc.view.visualStyle;
  const total = roomIds.reduce(
    (acc, roomId) => {
      const position = positions.get(roomId);
      if (!position) {
        return acc;
      }
      const room = getLayoutRoom(doc, roomId)!;
      const center = toRoomCenter(room, position, visualStyle);
      return { x: acc.x + center.x, y: acc.y + center.y };
    },
    { x: 0, y: 0 },
  );

  return {
    x: total.x / roomIds.length,
    y: total.y / roomIds.length,
  };
}

function overlapsPlacedRooms(
  roomId: string,
  candidatePosition: Position,
  placedPositions: ReadonlyMap<string, Position>,
  doc: MapDocument,
): boolean {
  const room = getLayoutRoom(doc, roomId)!;
  const visualStyle = doc.view.visualStyle;
  const candidateDimensions = getRoomDimensions(room, visualStyle);
  const candidateLeft = candidatePosition.x;
  const candidateRight = candidateLeft + candidateDimensions.width + ROOM_HORIZONTAL_GAP;
  const candidateTop = candidatePosition.y;
  const candidateBottom = candidateTop + candidateDimensions.height + ROOM_VERTICAL_GAP;

  for (const [placedRoomId, placedPosition] of placedPositions) {
    if (placedRoomId === roomId) {
      continue;
    }

    const placedRoom = getLayoutRoom(doc, placedRoomId)!;
    const placedDimensions = getRoomDimensions(placedRoom, visualStyle);
    const placedLeft = placedPosition.x;
    const placedRight = placedLeft + placedDimensions.width + ROOM_HORIZONTAL_GAP;
    const placedTop = placedPosition.y;
    const placedBottom = placedTop + placedDimensions.height + ROOM_VERTICAL_GAP;

    const intersectsHorizontally = candidateLeft < placedRight && candidateRight > placedLeft;
    const intersectsVertically = candidateTop < placedBottom && candidateBottom > placedTop;
    if (intersectsHorizontally && intersectsVertically) {
      return true;
    }
  }

  return false;
}

function findNearestOpenPosition(
  roomId: string,
  preferredPosition: Position,
  currentPosition: Position,
  placedPositions: ReadonlyMap<string, Position>,
  doc: MapDocument,
): Position {
  if (!overlapsPlacedRooms(roomId, preferredPosition, placedPositions, doc)) {
    return preferredPosition;
  }

  for (let radius = 1; radius <= 12; radius += 1) {
    const candidates: Position[] = [];
    for (let dx = -radius; dx <= radius; dx += 1) {
      candidates.push({ x: preferredPosition.x + (dx * PRETTIFY_GRID_SIZE), y: preferredPosition.y + (-radius * PRETTIFY_GRID_SIZE) });
      candidates.push({ x: preferredPosition.x + (dx * PRETTIFY_GRID_SIZE), y: preferredPosition.y + (radius * PRETTIFY_GRID_SIZE) });
    }

    for (let dy = -(radius - 1); dy <= radius - 1; dy += 1) {
      candidates.push({ x: preferredPosition.x + (-radius * PRETTIFY_GRID_SIZE), y: preferredPosition.y + (dy * PRETTIFY_GRID_SIZE) });
      candidates.push({ x: preferredPosition.x + (radius * PRETTIFY_GRID_SIZE), y: preferredPosition.y + (dy * PRETTIFY_GRID_SIZE) });
    }

    const validCandidates = candidates
      .filter((candidate) => !overlapsPlacedRooms(roomId, candidate, placedPositions, doc))
      .sort((left, right) => {
        const leftPreferredDistance = ((left.x - preferredPosition.x) ** 2) + ((left.y - preferredPosition.y) ** 2);
        const rightPreferredDistance = ((right.x - preferredPosition.x) ** 2) + ((right.y - preferredPosition.y) ** 2);
        if (leftPreferredDistance !== rightPreferredDistance) {
          return leftPreferredDistance - rightPreferredDistance;
        }

        const leftCurrentDistance = ((left.x - currentPosition.x) ** 2) + ((left.y - currentPosition.y) ** 2);
        const rightCurrentDistance = ((right.x - currentPosition.x) ** 2) + ((right.y - currentPosition.y) ** 2);
        if (leftCurrentDistance !== rightCurrentDistance) {
          return leftCurrentDistance - rightCurrentDistance;
        }

        return (left.y - right.y) || (left.x - right.x);
      });

    if (validCandidates.length > 0) {
      return validCandidates[0];
    }
  }

  return preferredPosition;
}

function canTranslateComponent(
  roomIds: readonly string[],
  delta: Position,
  placedPositions: ReadonlyMap<string, Position>,
  doc: MapDocument,
): boolean {
  const visualStyle = doc.view.visualStyle;
  if (delta.x === 0 && delta.y === 0) {
    return true;
  }

  const componentRoomIds = new Set(roomIds);
  const shiftedPositions = new Map<string, Position>();
  for (const roomId of roomIds) {
    const position = placedPositions.get(roomId);
    if (!position) {
      return false;
    }
    shiftedPositions.set(roomId, {
      x: position.x + delta.x,
      y: position.y + delta.y,
    });
  }

  for (const roomId of roomIds) {
    const shiftedPosition = shiftedPositions.get(roomId)!;
    for (const [otherRoomId, otherPosition] of placedPositions) {
      if (componentRoomIds.has(otherRoomId)) {
        continue;
      }

      const room = doc.rooms[roomId];
      const otherRoom = getLayoutRoom(doc, otherRoomId)!;
      const roomDimensions = getRoomDimensions(room, visualStyle);
      const otherRoomDimensions = getRoomDimensions(otherRoom, visualStyle);
      const candidateLeft = shiftedPosition.x;
      const candidateRight = candidateLeft + roomDimensions.width + ROOM_HORIZONTAL_GAP;
      const candidateTop = shiftedPosition.y;
      const candidateBottom = candidateTop + roomDimensions.height + ROOM_VERTICAL_GAP;
      const otherLeft = otherPosition.x;
      const otherRight = otherLeft + otherRoomDimensions.width + ROOM_HORIZONTAL_GAP;
      const otherTop = otherPosition.y;
      const otherBottom = otherTop + otherRoomDimensions.height + ROOM_VERTICAL_GAP;

      const intersectsHorizontally = candidateLeft < otherRight && candidateRight > otherLeft;
      const intersectsVertically = candidateTop < otherBottom && candidateBottom > otherTop;
      if (intersectsHorizontally && intersectsVertically) {
        return false;
      }
    }
  }

  return true;
}

function getStickyNoteBounds(stickyNote: StickyNote, position: Position) {
  return {
    left: position.x,
    top: position.y,
    right: position.x + STICKY_NOTE_WIDTH,
    bottom: position.y + getStickyNoteHeight(stickyNote.text),
  };
}

function getRoomBounds(room: Room, position: Position, visualStyle: MapVisualStyle) {
  const dimensions = getRoomDimensions(room, visualStyle);
  return {
    left: position.x,
    top: position.y,
    right: position.x + dimensions.width,
    bottom: position.y + dimensions.height,
  };
}

function intersectsWithGap(
  left: { left: number; top: number; right: number; bottom: number },
  right: { left: number; top: number; right: number; bottom: number },
  gap: number,
): boolean {
  return (
    left.left < (right.right + gap)
    && (left.right + gap) > right.left
    && left.top < (right.bottom + gap)
    && (left.bottom + gap) > right.top
  );
}

function overlapsRoomOrStickyNote(
  stickyNoteId: string,
  candidatePosition: Position,
  layoutPositions: Readonly<Record<string, Position>>,
  placedStickyNotes: ReadonlyMap<string, Position>,
  doc: MapDocument,
): boolean {
  const stickyNote = doc.stickyNotes[stickyNoteId];
  const candidateBounds = getStickyNoteBounds(stickyNote, candidatePosition);
  const visualStyle = doc.view.visualStyle;

  for (const [roomId, roomPosition] of Object.entries(layoutPositions)) {
    const room = getLayoutRoom(doc, roomId);
    if (room && intersectsWithGap(candidateBounds, getRoomBounds(room, roomPosition, visualStyle), STICKY_NOTE_GAP)) {
      return true;
    }
  }

  for (const [placedStickyNoteId, placedPosition] of placedStickyNotes) {
    if (placedStickyNoteId === stickyNoteId) {
      continue;
    }

    const placedStickyNote = doc.stickyNotes[placedStickyNoteId];
    if (intersectsWithGap(candidateBounds, getStickyNoteBounds(placedStickyNote, placedPosition), STICKY_NOTE_GAP)) {
      return true;
    }
  }

  return false;
}

function findNearestOpenStickyNotePosition(
  stickyNoteId: string,
  preferredPosition: Position,
  currentPosition: Position,
  layoutPositions: Readonly<Record<string, Position>>,
  placedStickyNotes: ReadonlyMap<string, Position>,
  doc: MapDocument,
): Position {
  if (!overlapsRoomOrStickyNote(stickyNoteId, preferredPosition, layoutPositions, placedStickyNotes, doc)) {
    return preferredPosition;
  }

  for (let radius = 1; radius <= 16; radius += 1) {
    const candidates: Position[] = [];
    for (let dx = -radius; dx <= radius; dx += 1) {
      candidates.push({ x: preferredPosition.x + (dx * PRETTIFY_GRID_SIZE), y: preferredPosition.y + (-radius * PRETTIFY_GRID_SIZE) });
      candidates.push({ x: preferredPosition.x + (dx * PRETTIFY_GRID_SIZE), y: preferredPosition.y + (radius * PRETTIFY_GRID_SIZE) });
    }

    for (let dy = -(radius - 1); dy <= radius - 1; dy += 1) {
      candidates.push({ x: preferredPosition.x + (-radius * PRETTIFY_GRID_SIZE), y: preferredPosition.y + (dy * PRETTIFY_GRID_SIZE) });
      candidates.push({ x: preferredPosition.x + (radius * PRETTIFY_GRID_SIZE), y: preferredPosition.y + (dy * PRETTIFY_GRID_SIZE) });
    }

    const validCandidates = candidates
      .filter((candidate) => !overlapsRoomOrStickyNote(stickyNoteId, candidate, layoutPositions, placedStickyNotes, doc))
      .sort((left, right) => {
        const leftPreferredDistance = ((left.x - preferredPosition.x) ** 2) + ((left.y - preferredPosition.y) ** 2);
        const rightPreferredDistance = ((right.x - preferredPosition.x) ** 2) + ((right.y - preferredPosition.y) ** 2);
        if (leftPreferredDistance !== rightPreferredDistance) {
          return leftPreferredDistance - rightPreferredDistance;
        }

        const leftCurrentDistance = ((left.x - currentPosition.x) ** 2) + ((left.y - currentPosition.y) ** 2);
        const rightCurrentDistance = ((right.x - currentPosition.x) ** 2) + ((right.y - currentPosition.y) ** 2);
        if (leftCurrentDistance !== rightCurrentDistance) {
          return leftCurrentDistance - rightCurrentDistance;
        }

        return (left.y - right.y) || (left.x - right.x);
      });

    if (validCandidates.length > 0) {
      return validCandidates[0];
    }
  }

  return preferredPosition;
}

function getPreferredStickyNotePosition(
  stickyNoteId: string,
  layoutPositions: Readonly<Record<string, Position>>,
  doc: MapDocument,
): Position {
  const stickyNote = doc.stickyNotes[stickyNoteId];
  const visualStyle = doc.view.visualStyle;
  const linkedRoomIds = Object.values(doc.stickyNoteLinks)
    .filter((stickyNoteLink) => stickyNoteLink.stickyNoteId === stickyNoteId && layoutPositions[stickyNoteLink.target.id] !== undefined)
    .map((stickyNoteLink) => stickyNoteLink.target.id)
    .sort();

  if (linkedRoomIds.length === 0) {
    return {
      x: snapCoordinate(stickyNote.position.x),
      y: snapCoordinate(stickyNote.position.y),
    };
  }

  const linkedRoom = getLayoutRoom(doc, linkedRoomIds[0]);
  const linkedRoomPosition = layoutPositions[linkedRoomIds[0]];
  if (!linkedRoom) {
    return {
      x: snapCoordinate(stickyNote.position.x),
      y: snapCoordinate(stickyNote.position.y),
    };
  }
  const roomDimensions = getRoomDimensions(linkedRoom, visualStyle);
  const noteHeight = getStickyNoteHeight(stickyNote.text);

  const candidatePositions = [
    {
      x: snapCoordinate(linkedRoomPosition.x + roomDimensions.width + STICKY_NOTE_GAP),
      y: snapCoordinate(linkedRoomPosition.y + ((roomDimensions.height - noteHeight) / 2)),
    },
    {
      x: snapCoordinate(linkedRoomPosition.x - STICKY_NOTE_WIDTH - STICKY_NOTE_GAP),
      y: snapCoordinate(linkedRoomPosition.y + ((roomDimensions.height - noteHeight) / 2)),
    },
    {
      x: snapCoordinate(linkedRoomPosition.x + ((roomDimensions.width - STICKY_NOTE_WIDTH) / 2)),
      y: snapCoordinate(linkedRoomPosition.y + roomDimensions.height + STICKY_NOTE_GAP),
    },
    {
      x: snapCoordinate(linkedRoomPosition.x + ((roomDimensions.width - STICKY_NOTE_WIDTH) / 2)),
      y: snapCoordinate(linkedRoomPosition.y - noteHeight - STICKY_NOTE_GAP),
    },
  ];

  return candidatePositions.sort((left, right) => {
    const leftDistance = ((left.x - stickyNote.position.x) ** 2) + ((left.y - stickyNote.position.y) ** 2);
    const rightDistance = ((right.x - stickyNote.position.x) ** 2) + ((right.y - stickyNote.position.y) ** 2);
    return leftDistance - rightDistance;
  })[0];
}

function computePrettifiedStickyNotePositions(
  doc: MapDocument,
  roomPositions: Readonly<Record<string, Position>>,
  pseudoRoomPositions: Readonly<Record<string, Position>>,
): Readonly<Record<string, Position>> {
  const layoutPositions = {
    ...roomPositions,
    ...pseudoRoomPositions,
  };
  const stickyNoteIds = Object.keys(doc.stickyNotes).sort((leftId, rightId) => {
    const leftLinked = Object.values(doc.stickyNoteLinks).some((link) => link.stickyNoteId === leftId);
    const rightLinked = Object.values(doc.stickyNoteLinks).some((link) => link.stickyNoteId === rightId);
    if (leftLinked !== rightLinked) {
      return leftLinked ? -1 : 1;
    }

    return leftId.localeCompare(rightId);
  });

  const placedStickyNotes = new Map<string, Position>();
  for (const stickyNoteId of stickyNoteIds) {
    const stickyNote = doc.stickyNotes[stickyNoteId];
    const preferredPosition = getPreferredStickyNotePosition(stickyNoteId, layoutPositions, doc);
    placedStickyNotes.set(
      stickyNoteId,
      findNearestOpenStickyNotePosition(
        stickyNoteId,
        preferredPosition,
        stickyNote.position,
        layoutPositions,
        placedStickyNotes,
        doc,
      ),
    );
  }

  return Object.fromEntries(placedStickyNotes.entries());
}

function recenterUnlockedComponents(
  components: readonly string[][],
  targetCentroids: ReadonlyMap<string, Vector>,
  lockedRoomIds: ReadonlySet<string>,
  placedPositions: Map<string, Position>,
  doc: MapDocument,
): void {
  for (const componentRoomIds of components) {
    if (componentRoomIds.some((roomId) => lockedRoomIds.has(roomId))) {
      continue;
    }

    const componentKey = componentRoomIds.join('\0');
    const targetCentroid = targetCentroids.get(componentKey);
    if (!targetCentroid) {
      continue;
    }

    const currentCentroid = computePlacedCentroid(componentRoomIds, placedPositions, doc);
    const delta = {
      x: snapCoordinate(targetCentroid.x - currentCentroid.x),
      y: snapCoordinate(targetCentroid.y - currentCentroid.y),
    };

    if (!canTranslateComponent(componentRoomIds, delta, placedPositions, doc)) {
      continue;
    }

    for (const roomId of componentRoomIds) {
      const position = placedPositions.get(roomId)!;
      placedPositions.set(roomId, {
        x: position.x + delta.x,
        y: position.y + delta.y,
      });
    }
  }
}

function computePrettifiedRoomPositionsSinglePass(
  doc: MapDocument,
  extraLockedRoomIds: ReadonlySet<string> = new Set<string>(),
): { readonly roomPositions: Readonly<Record<string, Position>>; readonly pseudoRoomPositions: Readonly<Record<string, Position>> } {
  const roomIds = [...Object.keys(doc.rooms), ...Object.keys(doc.pseudoRooms)].sort();
  if (roomIds.length === 0) {
    return { roomPositions: {}, pseudoRoomPositions: {} };
  }
  const lockedRoomIds = new Set(roomIds.filter((roomId) => (doc.rooms[roomId]?.locked ?? false) || extraLockedRoomIds.has(roomId)));
  const unlockedRoomIds = roomIds.filter((roomId) => !lockedRoomIds.has(roomId));

  const constraints = deriveDirectionConstraints(doc);
  const components = getConnectedComponents(roomIds, constraints);
  const normalizedPositions = new Map<string, Vector>();
  const componentTargetCentroids = new Map<string, Vector>();

  for (const componentRoomIds of components) {
    const relativeSeedPositions = computeSeedPositions(componentRoomIds, constraints);
    const seedOffset = computeComponentSeedOffset(componentRoomIds, relativeSeedPositions, doc, lockedRoomIds);
    const absoluteSeedPositions = new Map<string, Vector>();

    for (const roomId of componentRoomIds) {
      if (lockedRoomIds.has(roomId)) {
        const room = getLayoutRoom(doc, roomId)!;
        const position = getLayoutPosition(doc, roomId)!;
        absoluteSeedPositions.set(roomId, toRoomCenter(room, position, doc.view.visualStyle));
        continue;
      }

      const seed = relativeSeedPositions.get(roomId)!;
      absoluteSeedPositions.set(roomId, {
        x: seed.x + seedOffset.x,
        y: seed.y + seedOffset.y,
      });
    }

    const relaxedPositions = relaxComponent(componentRoomIds, absoluteSeedPositions, constraints, lockedRoomIds);
    const centroidAnchorRoomIds = getCentroidAnchorRoomIds(componentRoomIds, doc);
    componentTargetCentroids.set(
      componentRoomIds.join('\0'),
      computeSeedCentroid(centroidAnchorRoomIds, relaxedPositions),
    );

    for (const roomId of componentRoomIds) {
      normalizedPositions.set(roomId, relaxedPositions.get(roomId)!);
    }
  }

  const placedPositions = new Map<string, Position>();
  for (const roomId of lockedRoomIds) {
    placedPositions.set(roomId, doc.rooms[roomId].position);
  }

  const orderedRoomIds = unlockedRoomIds.sort((leftRoomId, rightRoomId) => {
    const leftPosition = normalizedPositions.get(leftRoomId)!;
    const rightPosition = normalizedPositions.get(rightRoomId)!;
    return (leftPosition.y - rightPosition.y) || (leftPosition.x - rightPosition.x) || leftRoomId.localeCompare(rightRoomId);
  });

  for (const roomId of orderedRoomIds) {
    const center = normalizedPositions.get(roomId)!;
    const snappedCenter = {
      x: snapCoordinate(center.x),
      y: snapCoordinate(center.y),
    };
    const room = getLayoutRoom(doc, roomId)!;
    const currentPosition = getLayoutPosition(doc, roomId)!;
    const topLeft = toRoomTopLeft(room, snappedCenter, doc.view.visualStyle);
    const snappedPosition = {
      x: topLeft.x,
      y: topLeft.y,
    };

    placedPositions.set(
      roomId,
      findNearestOpenPosition(roomId, snappedPosition, currentPosition, placedPositions, doc),
    );
  }

  recenterUnlockedComponents(components, componentTargetCentroids, lockedRoomIds, placedPositions, doc);

  const roomPositions = Object.fromEntries(
    [...placedPositions.entries()].filter(([roomId]) => roomId in doc.rooms),
  );
  const pseudoRoomPositions = Object.fromEntries(
    [...placedPositions.entries()].filter(([roomId]) => roomId in doc.pseudoRooms),
  );

  return { roomPositions, pseudoRoomPositions };
}

function computeStablePrettifiedPositions(
  doc: MapDocument,
  extraLockedRoomIds: ReadonlySet<string>,
): { readonly roomPositions: Readonly<Record<string, Position>>; readonly pseudoRoomPositions: Readonly<Record<string, Position>> } {
  const currentRoomPositions = Object.fromEntries(
    Object.entries(doc.rooms).map(([roomId, room]) => [roomId, room.position]),
  ) as Record<string, Position>;
  const currentPseudoRoomPositions = Object.fromEntries(
    Object.entries(doc.pseudoRooms).map(([pseudoRoomId, pseudoRoom]) => [pseudoRoomId, pseudoRoom.position]),
  ) as Record<string, Position>;
  const firstPass = computePrettifiedRoomPositionsSinglePass(doc, extraLockedRoomIds);
  const secondPassDoc = withPseudoRoomPositions(withRoomPositions(doc, firstPass.roomPositions), firstPass.pseudoRoomPositions);
  const secondPass = computePrettifiedRoomPositionsSinglePass(secondPassDoc, extraLockedRoomIds);

  if (
    positionsEqual(firstPass.roomPositions, secondPass.roomPositions)
    && positionsEqual(firstPass.pseudoRoomPositions, secondPass.pseudoRoomPositions)
  ) {
    return firstPass;
  }

  if (
    positionsEqual(secondPass.roomPositions, currentRoomPositions)
    && positionsEqual(secondPass.pseudoRoomPositions, currentPseudoRoomPositions)
  ) {
    return compareLayoutPositionsLexicographically(
      currentRoomPositions,
      currentPseudoRoomPositions,
      firstPass.roomPositions,
      firstPass.pseudoRoomPositions,
    ) <= 0
      ? {
        roomPositions: currentRoomPositions,
        pseudoRoomPositions: currentPseudoRoomPositions,
      }
      : firstPass;
  }

  return firstPass;
}

export function computePrettifiedRoomPositions(
  doc: MapDocument,
  extraLockedRoomIds: ReadonlySet<string> = new Set<string>(),
): Readonly<Record<string, Position>> {
  return computeStablePrettifiedPositions(doc, extraLockedRoomIds).roomPositions;
}

export function computePrettifiedLayoutPositions(
  doc: MapDocument,
  extraLockedRoomIds: ReadonlySet<string> = new Set<string>(),
): PrettifiedLayoutPositions {
  const { roomPositions, pseudoRoomPositions } = computeStablePrettifiedPositions(doc, extraLockedRoomIds);
  return {
    roomPositions,
    pseudoRoomPositions,
    stickyNotePositions: computePrettifiedStickyNotePositions(doc, roomPositions, pseudoRoomPositions),
  };
}
