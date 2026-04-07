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
const VERTICAL_PROXIMITY_SPRING_MULTIPLIER = 0.45;
const ANCHOR_STRENGTH = 0.035;
const PSEUDO_ROOM_ANCHOR_STRENGTH = 0.08;
const REPULSION_STRENGTH = 18_000;
const PSEUDO_ROOM_REPULSION_MULTIPLIER = 0.2;
const MAX_STEP = 18;
const MAX_STABILIZATION_PASSES = 6;
const COMPONENT_JIGGLE_MAX_RADIUS = 120;

interface Vector {
  x: number;
  y: number;
}

interface DirectionConstraint {
  readonly fromRoomId: string;
  readonly toRoomId: string;
  readonly delta: Vector;
  readonly springMultiplier?: number;
}

interface ComponentAnchor {
  readonly roomIds: readonly string[];
  readonly key: string;
  readonly targetCentroid: Vector;
}

interface ComponentPlacementGroup {
  readonly roomIds: readonly string[];
  readonly key: string;
}

interface PrettifiedLayoutPositions {
  readonly roomPositions: Readonly<Record<string, Position>>;
  readonly pseudoRoomPositions: Readonly<Record<string, Position>>;
  readonly stickyNotePositions: Readonly<Record<string, Position>>;
}

interface PrettifiedRoomLayout {
  readonly roomPositions: Readonly<Record<string, Position>>;
  readonly pseudoRoomPositions: Readonly<Record<string, Position>>;
  readonly stickyNotePositions: Readonly<Record<string, Position>>;
}

export interface ConnectedComponentBounds {
  readonly key: string;
  readonly roomIds: readonly string[];
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
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

function isStickyNoteLayoutId(doc: MapDocument, layoutId: string): boolean {
  return layoutId in doc.stickyNotes;
}

function getLayoutPosition(doc: MapDocument, roomId: string): Position | null {
  const room = doc.rooms[roomId];
  if (room) {
    return room.position;
  }

  const pseudoRoomPosition = doc.pseudoRooms[roomId]?.position;
  if (pseudoRoomPosition) {
    return pseudoRoomPosition;
  }

  return doc.stickyNotes[roomId]?.position ?? null;
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

function getLayoutNodeDimensions(
  doc: MapDocument,
  layoutId: string,
  visualStyle: MapVisualStyle,
): { readonly width: number; readonly height: number } {
  const stickyNote = doc.stickyNotes[layoutId];
  if (stickyNote) {
    return getStickyNoteDimensions(stickyNote);
  }

  const room = getLayoutRoom(doc, layoutId);
  if (!room) {
    return { width: 0, height: 0 };
  }

  return getRoomDimensions(room, visualStyle);
}

function toLayoutNodeCenter(
  doc: MapDocument,
  layoutId: string,
  position: Position,
  visualStyle: MapVisualStyle,
): Vector {
  const stickyNote = doc.stickyNotes[layoutId];
  if (stickyNote) {
    return toStickyNoteCenter(stickyNote, position);
  }

  const room = getLayoutRoom(doc, layoutId)!;
  return toRoomCenter(room, position, visualStyle);
}

function toLayoutNodeTopLeft(
  doc: MapDocument,
  layoutId: string,
  center: Vector,
  visualStyle: MapVisualStyle,
): Position {
  const stickyNote = doc.stickyNotes[layoutId];
  if (stickyNote) {
    return toStickyNoteTopLeft(stickyNote, center);
  }

  const room = getLayoutRoom(doc, layoutId)!;
  return toRoomTopLeft(room, center, visualStyle);
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

function deriveVerticalProximityConstraints(doc: MapDocument): DirectionConstraint[] {
  const constraints: DirectionConstraint[] = [];

  for (const room of Object.values(doc.rooms)) {
    for (const [direction, connectionId] of Object.entries(room.directions)) {
      if (direction !== 'up' && direction !== 'down') {
        continue;
      }

      const connection = doc.connections[connectionId];
      if (!connection) {
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
        delta: { x: 0, y: 0 },
        springMultiplier: VERTICAL_PROXIMITY_SPRING_MULTIPLIER,
      });
    }
  }

  return constraints;
}

function deriveConnectionConnectivityConstraints(doc: MapDocument): DirectionConstraint[] {
  const constraints: DirectionConstraint[] = [];

  for (const room of Object.values(doc.rooms)) {
    for (const connectionId of Object.values(room.directions)) {
      const connection = doc.connections[connectionId];
      if (!connection) {
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
        delta: { x: 0, y: 0 },
      });
    }
  }

  return constraints;
}

function deriveStickyNoteConstraints(doc: MapDocument): DirectionConstraint[] {
  const layoutPositions = {
    ...Object.fromEntries(Object.entries(doc.rooms).map(([roomId, room]) => [roomId, room.position])),
    ...Object.fromEntries(Object.entries(doc.pseudoRooms).map(([pseudoRoomId, pseudoRoom]) => [pseudoRoomId, pseudoRoom.position])),
  } as Readonly<Record<string, Position>>;

  return Object.values(doc.stickyNotes).flatMap((stickyNote) => {
    const preferredCenter = toStickyNoteCenter(
      stickyNote,
      getPreferredStickyNotePosition(stickyNote.id, layoutPositions, doc),
    );
    return Object.values(doc.stickyNoteLinks)
      .filter((stickyNoteLink) => stickyNoteLink.stickyNoteId === stickyNote.id)
      .map((stickyNoteLink): DirectionConstraint | null => {
        const targetPosition = layoutPositions[stickyNoteLink.target.id];
        const targetRoom = getLayoutRoom(doc, stickyNoteLink.target.id);
        if (!targetPosition || !targetRoom) {
          return null;
        }

        const targetCenter = toRoomCenter(targetRoom, targetPosition, doc.view.visualStyle);
        return {
          fromRoomId: stickyNote.id,
          toRoomId: stickyNoteLink.target.id,
          delta: {
            x: targetCenter.x - preferredCenter.x,
            y: targetCenter.y - preferredCenter.y,
          },
        } satisfies DirectionConstraint;
      })
      .filter((constraint): constraint is DirectionConstraint => constraint !== null);
  });
}

function deriveStickyNoteConnectivityConstraints(doc: MapDocument): DirectionConstraint[] {
  return Object.values(doc.stickyNoteLinks).flatMap((stickyNoteLink) => {
    const stickyNote = doc.stickyNotes[stickyNoteLink.stickyNoteId];
    const targetPosition = getLayoutPosition(doc, stickyNoteLink.target.id);
    const targetRoom = getLayoutRoom(doc, stickyNoteLink.target.id);
    if (!stickyNote || !targetPosition || !targetRoom) {
      return [];
    }

    const noteCenter = toStickyNoteCenter(stickyNote, stickyNote.position);
    const targetCenter = toRoomCenter(targetRoom, targetPosition, doc.view.visualStyle);

    return [{
      fromRoomId: stickyNote.id,
      toRoomId: stickyNoteLink.target.id,
      delta: {
        x: targetCenter.x - noteCenter.x,
        y: targetCenter.y - noteCenter.y,
      },
    } satisfies DirectionConstraint];
  });
}

function deriveStickyNoteTargetConnectivityConstraints(doc: MapDocument): DirectionConstraint[] {
  return Object.values(doc.stickyNotes).flatMap((stickyNote) => {
    const targetIds = Object.values(doc.stickyNoteLinks)
      .filter((stickyNoteLink) => stickyNoteLink.stickyNoteId === stickyNote.id)
      .map((stickyNoteLink) => stickyNoteLink.target.id)
      .filter((targetId, index, ids) => ids.indexOf(targetId) === index)
      .filter((targetId) => getLayoutRoom(doc, targetId) !== null);

    const [primaryTargetId, ...otherTargetIds] = targetIds.sort((leftId, rightId) => leftId.localeCompare(rightId));
    if (!primaryTargetId) {
      return [];
    }

    return otherTargetIds.map((targetId) => ({
      fromRoomId: primaryTargetId,
      toRoomId: targetId,
      delta: { x: 0, y: 0 },
    } satisfies DirectionConstraint));
  });
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

function getPositionsSignature(positions: Readonly<Record<string, Position>>): string {
  return Object.entries(positions)
    .sort(([leftId], [rightId]) => leftId.localeCompare(rightId))
    .map(([roomId, position]) => `${roomId}:${position.x},${position.y}`)
    .join('|');
}

function getLayoutSignature(layout: PrettifiedRoomLayout): string {
  return `${getPositionsSignature(layout.roomPositions)}::${getPositionsSignature(layout.pseudoRoomPositions)}::${getPositionsSignature(layout.stickyNotePositions ?? {})}`;
}

function getLayoutMovementScore(
  layout: PrettifiedRoomLayout,
  currentRoomPositions: Readonly<Record<string, Position>>,
  currentPseudoRoomPositions: Readonly<Record<string, Position>>,
  currentStickyNotePositions: Readonly<Record<string, Position>>,
): number {
  const roomScore = Object.entries(layout.roomPositions).reduce((total, [roomId, position]) => {
    const currentPosition = currentRoomPositions[roomId];
    if (!currentPosition) {
      return total;
    }

    return total + ((position.x - currentPosition.x) ** 2) + ((position.y - currentPosition.y) ** 2);
  }, 0);
  const pseudoRoomScore = Object.entries(layout.pseudoRoomPositions).reduce((total, [pseudoRoomId, position]) => {
    const currentPosition = currentPseudoRoomPositions[pseudoRoomId];
    if (!currentPosition) {
      return total;
    }

    return total + ((position.x - currentPosition.x) ** 2) + ((position.y - currentPosition.y) ** 2);
  }, 0);
  const stickyNoteScore = Object.entries(layout.stickyNotePositions ?? {}).reduce((total, [stickyNoteId, position]) => {
    const currentPosition = currentStickyNotePositions[stickyNoteId];
    if (!currentPosition) {
      return total;
    }

    return total + ((position.x - currentPosition.x) ** 2) + ((position.y - currentPosition.y) ** 2);
  }, 0);

  return roomScore + pseudoRoomScore + stickyNoteScore;
}

export function pickMostStablePrettifiedLayout(
  candidates: readonly PrettifiedRoomLayout[],
  currentRoomPositions: Readonly<Record<string, Position>>,
  currentPseudoRoomPositions: Readonly<Record<string, Position>>,
  currentStickyNotePositions: Readonly<Record<string, Position>> = {},
): PrettifiedRoomLayout {
  if (candidates.length === 0) {
    return {
      roomPositions: currentRoomPositions,
      pseudoRoomPositions: currentPseudoRoomPositions,
      stickyNotePositions: currentStickyNotePositions,
    };
  }

  return candidates.reduce((bestLayout, candidateLayout) => {
    const bestScore = getLayoutMovementScore(bestLayout, currentRoomPositions, currentPseudoRoomPositions, currentStickyNotePositions);
    const candidateScore = getLayoutMovementScore(candidateLayout, currentRoomPositions, currentPseudoRoomPositions, currentStickyNotePositions);
    return candidateScore < bestScore ? candidateLayout : bestLayout;
  });
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

function withStickyNotePositions(doc: MapDocument, positions: Readonly<Record<string, Position>>): MapDocument {
  return {
    ...doc,
    stickyNotes: Object.fromEntries(
      Object.entries(doc.stickyNotes).map(([stickyNoteId, stickyNote]) => [
        stickyNoteId,
        positions[stickyNoteId] ? { ...stickyNote, position: positions[stickyNoteId] } : stickyNote,
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

function getCentroidAnchorRoomIds(componentRoomIds: readonly string[], _doc: MapDocument): readonly string[] {
  return componentRoomIds;
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
        const actualCenter = toLayoutNodeCenter(doc, roomId, position, visualStyle);
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
  pseudoRoomIds: ReadonlySet<string>,
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
      const springStrength = SPRING_STRENGTH * (constraint.springMultiplier ?? 1);
      const fromLocked = lockedRoomIds.has(constraint.fromRoomId);
      const toLocked = lockedRoomIds.has(constraint.toRoomId);

      if (!fromLocked && !toLocked) {
        forces.get(constraint.fromRoomId)!.x += errorX * springStrength * 0.5;
        forces.get(constraint.fromRoomId)!.y += errorY * springStrength * 0.5;
        forces.get(constraint.toRoomId)!.x -= errorX * springStrength * 0.5;
        forces.get(constraint.toRoomId)!.y -= errorY * springStrength * 0.5;
      } else if (!fromLocked) {
        forces.get(constraint.fromRoomId)!.x += errorX * springStrength;
        forces.get(constraint.fromRoomId)!.y += errorY * springStrength;
      } else if (!toLocked) {
        forces.get(constraint.toRoomId)!.x -= errorX * springStrength;
        forces.get(constraint.toRoomId)!.y -= errorY * springStrength;
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
        const repulsionMultiplier = pseudoRoomIds.has(roomId) || pseudoRoomIds.has(otherRoomId)
          ? PSEUDO_ROOM_REPULSION_MULTIPLIER
          : 1;
        const repulsion = (REPULSION_STRENGTH * repulsionMultiplier) / distanceSquared;
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
      const anchorStrength = pseudoRoomIds.has(roomId) ? PSEUDO_ROOM_ANCHOR_STRENGTH : ANCHOR_STRENGTH;
      force.x += (seed.x - position.x) * anchorStrength;
      force.y += (seed.y - position.y) * anchorStrength;

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
      const position = getLayoutPosition(doc, roomId)!;
      const center = toLayoutNodeCenter(doc, roomId, position, visualStyle);
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
      const center = toLayoutNodeCenter(doc, roomId, position, visualStyle);
      return { x: acc.x + center.x, y: acc.y + center.y };
    },
    { x: 0, y: 0 },
  );

  return {
    x: total.x / roomIds.length,
    y: total.y / roomIds.length,
  };
}

function getLayoutNodeHorizontalGap(doc: MapDocument, leftId: string, rightId: string): number {
  return isStickyNoteLayoutId(doc, leftId) || isStickyNoteLayoutId(doc, rightId)
    ? STICKY_NOTE_GAP
    : ROOM_HORIZONTAL_GAP;
}

function getLayoutNodeVerticalGap(doc: MapDocument, topId: string, bottomId: string): number {
  return isStickyNoteLayoutId(doc, topId) || isStickyNoteLayoutId(doc, bottomId)
    ? STICKY_NOTE_GAP
    : ROOM_VERTICAL_GAP;
}

function overlapsPlacedRooms(
  roomId: string,
  candidatePosition: Position,
  placedPositions: ReadonlyMap<string, Position>,
  doc: MapDocument,
): boolean {
  const visualStyle = doc.view.visualStyle;
  const candidateDimensions = getLayoutNodeDimensions(doc, roomId, visualStyle);
  const candidateLeft = candidatePosition.x;
  const candidateRight = candidateLeft + candidateDimensions.width;
  const candidateTop = candidatePosition.y;
  const candidateBottom = candidateTop + candidateDimensions.height;

  for (const [placedRoomId, placedPosition] of placedPositions) {
    if (placedRoomId === roomId) {
      continue;
    }

    const placedDimensions = getLayoutNodeDimensions(doc, placedRoomId, visualStyle);
    const placedLeft = placedPosition.x;
    const placedRight = placedLeft + placedDimensions.width;
    const placedTop = placedPosition.y;
    const placedBottom = placedTop + placedDimensions.height;
    const horizontalGap = getLayoutNodeHorizontalGap(doc, roomId, placedRoomId);
    const verticalGap = getLayoutNodeVerticalGap(doc, roomId, placedRoomId);

    const intersectsHorizontally = candidateLeft < (placedRight + horizontalGap) && (candidateRight + horizontalGap) > placedLeft;
    const intersectsVertically = candidateTop < (placedBottom + verticalGap) && (candidateBottom + verticalGap) > placedTop;
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

      const roomDimensions = getLayoutNodeDimensions(doc, roomId, visualStyle);
      const otherRoomDimensions = getLayoutNodeDimensions(doc, otherRoomId, visualStyle);
      const candidateLeft = shiftedPosition.x;
      const candidateRight = candidateLeft + roomDimensions.width;
      const candidateTop = shiftedPosition.y;
      const candidateBottom = candidateTop + roomDimensions.height;
      const otherLeft = otherPosition.x;
      const otherRight = otherLeft + otherRoomDimensions.width;
      const otherTop = otherPosition.y;
      const otherBottom = otherTop + otherRoomDimensions.height;
      const horizontalGap = getLayoutNodeHorizontalGap(doc, roomId, otherRoomId);
      const verticalGap = getLayoutNodeVerticalGap(doc, roomId, otherRoomId);

      const intersectsHorizontally = candidateLeft < (otherRight + horizontalGap) && (candidateRight + horizontalGap) > otherLeft;
      const intersectsVertically = candidateTop < (otherBottom + verticalGap) && (candidateBottom + verticalGap) > otherTop;
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

function getStickyNoteDimensions(stickyNote: StickyNote): { readonly width: number; readonly height: number } {
  return {
    width: STICKY_NOTE_WIDTH,
    height: getStickyNoteHeight(stickyNote.text),
  };
}

function toStickyNoteCenter(stickyNote: StickyNote, position: Position): Vector {
  const dimensions = getStickyNoteDimensions(stickyNote);
  return {
    x: position.x + (dimensions.width / 2),
    y: position.y + (dimensions.height / 2),
  };
}

function toStickyNoteTopLeft(stickyNote: StickyNote, center: Vector): Position {
  const dimensions = getStickyNoteDimensions(stickyNote);
  return {
    x: center.x - (dimensions.width / 2),
    y: center.y - (dimensions.height / 2),
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
  const linkedTargets = Object.values(doc.stickyNoteLinks)
    .filter((stickyNoteLink) => stickyNoteLink.stickyNoteId === stickyNoteId && layoutPositions[stickyNoteLink.target.id] !== undefined)
    .map((stickyNoteLink) => {
      const linkedRoom = getLayoutRoom(doc, stickyNoteLink.target.id);
      const linkedRoomPosition = layoutPositions[stickyNoteLink.target.id];
      if (!linkedRoom) {
        return null;
      }

      const roomDimensions = getRoomDimensions(linkedRoom, visualStyle);
      const roomCenter = toRoomCenter(linkedRoom, linkedRoomPosition, visualStyle);
      return {
        id: stickyNoteLink.target.id,
        position: linkedRoomPosition,
        dimensions: roomDimensions,
        center: roomCenter,
      };
    })
    .filter((target): target is {
      readonly id: string;
      readonly position: Position;
      readonly dimensions: { readonly width: number; readonly height: number };
      readonly center: Vector;
    } => target !== null)
    .sort((left, right) => left.id.localeCompare(right.id));

  if (linkedTargets.length === 0) {
    return {
      x: snapCoordinate(stickyNote.position.x),
      y: snapCoordinate(stickyNote.position.y),
    };
  }
  const noteHeight = getStickyNoteHeight(stickyNote.text);

  const candidatePositions = linkedTargets.flatMap(({ position, dimensions }) => ([
    {
      x: snapCoordinate(position.x + dimensions.width + STICKY_NOTE_GAP),
      y: snapCoordinate(position.y + ((dimensions.height - noteHeight) / 2)),
    },
    {
      x: snapCoordinate(position.x - STICKY_NOTE_WIDTH - STICKY_NOTE_GAP),
      y: snapCoordinate(position.y + ((dimensions.height - noteHeight) / 2)),
    },
    {
      x: snapCoordinate(position.x + ((dimensions.width - STICKY_NOTE_WIDTH) / 2)),
      y: snapCoordinate(position.y + dimensions.height + STICKY_NOTE_GAP),
    },
    {
      x: snapCoordinate(position.x + ((dimensions.width - STICKY_NOTE_WIDTH) / 2)),
      y: snapCoordinate(position.y - noteHeight - STICKY_NOTE_GAP),
    },
  ]));

  return candidatePositions.sort((left, right) => {
    const leftCenter = {
      x: left.x + (STICKY_NOTE_WIDTH / 2),
      y: left.y + (noteHeight / 2),
    };
    const rightCenter = {
      x: right.x + (STICKY_NOTE_WIDTH / 2),
      y: right.y + (noteHeight / 2),
    };
    const leftLinkedDistance = linkedTargets.reduce(
      (total, target) => total + ((leftCenter.x - target.center.x) ** 2) + ((leftCenter.y - target.center.y) ** 2),
      0,
    );
    const rightLinkedDistance = linkedTargets.reduce(
      (total, target) => total + ((rightCenter.x - target.center.x) ** 2) + ((rightCenter.y - target.center.y) ** 2),
      0,
    );
    if (leftLinkedDistance !== rightLinkedDistance) {
      return leftLinkedDistance - rightLinkedDistance;
    }

    const leftDistance = ((left.x - stickyNote.position.x) ** 2) + ((left.y - stickyNote.position.y) ** 2);
    const rightDistance = ((right.x - stickyNote.position.x) ** 2) + ((right.y - stickyNote.position.y) ** 2);
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }

    return (left.y - right.y) || (left.x - right.x);
  })[0];
}

interface StickyNoteLayoutConstraint {
  readonly stickyNoteId: string;
  readonly targetLayoutId: string;
  readonly delta: Vector;
}

function buildStickyNoteLayoutConstraints(
  doc: MapDocument,
  layoutPositions: Readonly<Record<string, Position>>,
  stickyNoteIds: readonly string[],
): readonly StickyNoteLayoutConstraint[] {
  return stickyNoteIds.flatMap((stickyNoteId) => {
    const stickyNote = doc.stickyNotes[stickyNoteId];
    const preferredCenter = toStickyNoteCenter(
      stickyNote,
      getPreferredStickyNotePosition(stickyNoteId, layoutPositions, doc),
    );

    return Object.values(doc.stickyNoteLinks)
      .filter((stickyNoteLink) => stickyNoteLink.stickyNoteId === stickyNoteId && layoutPositions[stickyNoteLink.target.id] !== undefined)
      .map((stickyNoteLink) => {
        const targetRoom = getLayoutRoom(doc, stickyNoteLink.target.id);
        const targetPosition = layoutPositions[stickyNoteLink.target.id];
        if (!targetRoom) {
          return null;
        }

        const targetCenter = toRoomCenter(targetRoom, targetPosition, doc.view.visualStyle);
        return {
          stickyNoteId,
          targetLayoutId: stickyNoteLink.target.id,
          delta: {
            x: preferredCenter.x - targetCenter.x,
            y: preferredCenter.y - targetCenter.y,
          },
        } satisfies StickyNoteLayoutConstraint;
      })
      .filter((constraint): constraint is StickyNoteLayoutConstraint => constraint !== null);
  });
}

function relaxStickyNotePositions(
  doc: MapDocument,
  layoutPositions: Readonly<Record<string, Position>>,
  stickyNoteIds: readonly string[],
): ReadonlyMap<string, Vector> {
  const seedPositions = new Map<string, Vector>();
  for (const stickyNoteId of stickyNoteIds) {
    const stickyNote = doc.stickyNotes[stickyNoteId];
    seedPositions.set(
      stickyNoteId,
      toStickyNoteCenter(stickyNote, getPreferredStickyNotePosition(stickyNoteId, layoutPositions, doc)),
    );
  }

  const positions = new Map<string, Vector>(
    stickyNoteIds.map((stickyNoteId) => {
      const seed = seedPositions.get(stickyNoteId)!;
      return [stickyNoteId, { x: seed.x, y: seed.y }] as const;
    }),
  );
  const constraints = buildStickyNoteLayoutConstraints(doc, layoutPositions, stickyNoteIds);

  const layoutObstacles = Object.entries(layoutPositions)
    .map(([layoutId, position]) => {
      const room = getLayoutRoom(doc, layoutId);
      if (!room) {
        return null;
      }

      return {
        id: layoutId,
        center: toRoomCenter(room, position, doc.view.visualStyle),
      };
    })
    .filter((obstacle): obstacle is { readonly id: string; readonly center: Vector } => obstacle !== null);

  for (let iteration = 0; iteration < RELAXATION_ITERATIONS; iteration += 1) {
    const forces = new Map<string, Vector>(
      stickyNoteIds.map((stickyNoteId) => [stickyNoteId, { x: 0, y: 0 }] as const),
    );

    for (const constraint of constraints) {
      const stickyNotePosition = positions.get(constraint.stickyNoteId);
      const targetObstacle = layoutObstacles.find((obstacle) => obstacle.id === constraint.targetLayoutId);
      if (!stickyNotePosition || !targetObstacle) {
        continue;
      }

      const errorX = (stickyNotePosition.x - targetObstacle.center.x) - constraint.delta.x;
      const errorY = (stickyNotePosition.y - targetObstacle.center.y) - constraint.delta.y;
      forces.get(constraint.stickyNoteId)!.x -= errorX * SPRING_STRENGTH;
      forces.get(constraint.stickyNoteId)!.y -= errorY * SPRING_STRENGTH;
    }

    for (let index = 0; index < stickyNoteIds.length; index += 1) {
      for (let otherIndex = index + 1; otherIndex < stickyNoteIds.length; otherIndex += 1) {
        const stickyNoteId = stickyNoteIds[index];
        const otherStickyNoteId = stickyNoteIds[otherIndex];
        const position = positions.get(stickyNoteId)!;
        const otherPosition = positions.get(otherStickyNoteId)!;
        const dx = otherPosition.x - position.x;
        const dy = otherPosition.y - position.y;
        const distanceSquared = Math.max((dx * dx) + (dy * dy), 1);
        const distance = Math.sqrt(distanceSquared);
        const repulsion = (REPULSION_STRENGTH * PSEUDO_ROOM_REPULSION_MULTIPLIER) / distanceSquared;
        const forceX = (dx / distance) * repulsion;
        const forceY = (dy / distance) * repulsion;

        forces.get(stickyNoteId)!.x -= forceX;
        forces.get(stickyNoteId)!.y -= forceY;
        forces.get(otherStickyNoteId)!.x += forceX;
        forces.get(otherStickyNoteId)!.y += forceY;
      }
    }

    for (const stickyNoteId of stickyNoteIds) {
      const position = positions.get(stickyNoteId)!;
      const force = forces.get(stickyNoteId)!;

      for (const obstacle of layoutObstacles) {
        const dx = obstacle.center.x - position.x;
        const dy = obstacle.center.y - position.y;
        const distanceSquared = Math.max((dx * dx) + (dy * dy), 1);
        const distance = Math.sqrt(distanceSquared);
        const repulsion = (REPULSION_STRENGTH * PSEUDO_ROOM_REPULSION_MULTIPLIER) / distanceSquared;
        force.x -= (dx / distance) * repulsion;
        force.y -= (dy / distance) * repulsion;
      }

      const seed = seedPositions.get(stickyNoteId)!;
      force.x += (seed.x - position.x) * PSEUDO_ROOM_ANCHOR_STRENGTH;
      force.y += (seed.y - position.y) * PSEUDO_ROOM_ANCHOR_STRENGTH;

      position.x += limitStep(force.x);
      position.y += limitStep(force.y);
    }
  }

  return positions;
}

function computePrettifiedStickyNotePositions(
  doc: MapDocument,
  roomPositions: Readonly<Record<string, Position>>,
  pseudoRoomPositions: Readonly<Record<string, Position>>,
  extraLockedRoomIds: ReadonlySet<string> = new Set<string>(),
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

  const relaxedCenters = relaxStickyNotePositions(doc, layoutPositions, stickyNoteIds);
  const placedStickyNotes = new Map<string, Position>();
  const orderedStickyNoteIds = stickyNoteIds.slice().sort((leftId, rightId) => {
    const leftCenter = relaxedCenters.get(leftId)!;
    const rightCenter = relaxedCenters.get(rightId)!;
    return (leftCenter.y - rightCenter.y) || (leftCenter.x - rightCenter.x) || leftId.localeCompare(rightId);
  });

  for (const stickyNoteId of orderedStickyNoteIds) {
    const stickyNote = doc.stickyNotes[stickyNoteId];
    if (extraLockedRoomIds.has(stickyNoteId)) {
      placedStickyNotes.set(stickyNoteId, stickyNote.position);
      continue;
    }

    const relaxedCenter = relaxedCenters.get(stickyNoteId)!;
    const relaxedTopLeft = toStickyNoteTopLeft(stickyNote, relaxedCenter);
    const preferredPosition = {
      x: snapCoordinate(relaxedTopLeft.x),
      y: snapCoordinate(relaxedTopLeft.y),
    };
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
  componentAnchors: readonly ComponentAnchor[],
  lockedRoomIds: ReadonlySet<string>,
  placedPositions: Map<string, Position>,
  doc: MapDocument,
): void {
  for (const { roomIds: componentRoomIds, targetCentroid } of componentAnchors) {
    if (componentRoomIds.some((roomId) => lockedRoomIds.has(roomId))) {
      continue;
    }

    const centroidAnchorRoomIds = getCentroidAnchorRoomIds(componentRoomIds, doc);
    const currentCentroid = computePlacedCentroid(centroidAnchorRoomIds, placedPositions, doc);
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

function getComponentJiggleCandidates(maxRadius: number): readonly Position[] {
  const candidates: Position[] = [];

  for (let radius = 1; radius <= maxRadius; radius += 1) {
    const offset = radius * PRETTIFY_GRID_SIZE;
    candidates.push({ x: offset, y: 0 });
    candidates.push({ x: -offset, y: 0 });
    candidates.push({ x: 0, y: offset });
    candidates.push({ x: 0, y: -offset });
    candidates.push({ x: offset, y: offset });
    candidates.push({ x: offset, y: -offset });
    candidates.push({ x: -offset, y: offset });
    candidates.push({ x: -offset, y: -offset });
  }

  return candidates;
}

function getComponentBoundsSpan(bounds: { left: number; top: number; right: number; bottom: number }): { width: number; height: number } {
  return {
    width: Math.max(0, bounds.right - bounds.left),
    height: Math.max(0, bounds.bottom - bounds.top),
  };
}

function getMaxComponentSearchRadius(
  componentRoomIds: readonly string[],
  overlappingComponentRoomIdsGroups: readonly (readonly string[])[],
  placedPositions: ReadonlyMap<string, Position>,
  doc: MapDocument,
): number {
  const componentBounds = getComponentBounds(componentRoomIds, placedPositions, doc);
  if (componentBounds === null) {
    return COMPONENT_JIGGLE_MAX_RADIUS;
  }

  return Math.min(
    COMPONENT_JIGGLE_MAX_RADIUS,
    Math.max(
      1,
      ...overlappingComponentRoomIdsGroups.map((otherComponentRoomIds) => {
        const otherBounds = getComponentBounds(otherComponentRoomIds, placedPositions, doc);
        if (!otherBounds) {
          return 1;
        }

        const componentSpan = getComponentBoundsSpan(componentBounds);
        const otherSpan = getComponentBoundsSpan(otherBounds);
        return Math.ceil(
          (Math.max(componentSpan.width, otherSpan.width, componentSpan.height, otherSpan.height) / PRETTIFY_GRID_SIZE) + 2,
        );
      }),
    ),
  );
}

function getComponentBounds(
  componentRoomIds: readonly string[],
  placedPositions: ReadonlyMap<string, Position>,
  doc: MapDocument,
): { left: number; top: number; right: number; bottom: number } | null {
  const visualStyle = doc.view.visualStyle;
  let bounds: { left: number; top: number; right: number; bottom: number } | null = null;

  for (const roomId of componentRoomIds) {
    const position = placedPositions.get(roomId);
    if (!position) {
      return null;
    }

    const stickyNote = doc.stickyNotes[roomId];
    const nextBounds = stickyNote
      ? getStickyNoteBounds(stickyNote, position)
      : (() => {
        const room = getLayoutRoom(doc, roomId);
        return room ? getRoomBounds(room, position, visualStyle) : null;
      })();

    if (!nextBounds) {
      return null;
    }

    bounds = bounds === null
      ? nextBounds
      : {
        left: Math.min(bounds.left, nextBounds.left),
        top: Math.min(bounds.top, nextBounds.top),
        right: Math.max(bounds.right, nextBounds.right),
        bottom: Math.max(bounds.bottom, nextBounds.bottom),
      };
  }

  return bounds;
}

function doComponentsOverlap(
  leftComponentRoomIds: readonly string[],
  rightComponentRoomIds: readonly string[],
  placedPositions: ReadonlyMap<string, Position>,
  doc: MapDocument,
): boolean {
  const leftBounds = getComponentBounds(leftComponentRoomIds, placedPositions, doc);
  const rightBounds = getComponentBounds(rightComponentRoomIds, placedPositions, doc);
  if (!leftBounds || !rightBounds) {
    return false;
  }

  return intersectsWithGap(leftBounds, rightBounds, 0);
}

function separateOverlappingComponents(
  componentGroups: readonly (ComponentPlacementGroup | readonly string[])[],
  lockedRoomIds: ReadonlySet<string>,
  placedPositions: Map<string, Position>,
  doc: MapDocument,
): void {
  const normalizedComponentGroups = normalizeComponentPlacementGroups(componentGroups);
  const unlockedComponents = normalizedComponentGroups
    .filter(({ roomIds }) => !roomIds.some((roomId) => lockedRoomIds.has(roomId)))
    .sort((left, right) => {
      const sizeDifference = right.roomIds.length - left.roomIds.length;
      if (sizeDifference !== 0) {
        return sizeDifference;
      }
      return left.key.localeCompare(right.key);
    });

  for (let index = 1; index < unlockedComponents.length; index += 1) {
    const component = unlockedComponents[index];
    const overlappingEarlierComponents = unlockedComponents
      .slice(0, index)
      .filter((otherComponent) => doComponentsOverlap(otherComponent.roomIds, component.roomIds, placedPositions, doc));
    if (overlappingEarlierComponents.length === 0) {
      continue;
    }

    const maxSearchRadius = getMaxComponentSearchRadius(
      component.roomIds,
      overlappingEarlierComponents.map((otherComponent) => otherComponent.roomIds),
      placedPositions,
      doc,
    );
    const jiggleCandidates = getComponentJiggleCandidates(maxSearchRadius);

    for (const candidate of jiggleCandidates) {
      if (!canTranslateComponent(component.roomIds, candidate, placedPositions, doc)) {
        continue;
      }

      const translatedPositions = new Map(placedPositions);
      for (const roomId of component.roomIds) {
        const currentPosition = translatedPositions.get(roomId)!;
        translatedPositions.set(roomId, {
          x: currentPosition.x + candidate.x,
          y: currentPosition.y + candidate.y,
        });
      }

      const stillOverlaps = unlockedComponents
        .slice(0, index)
        .some((otherComponent) => doComponentsOverlap(otherComponent.roomIds, component.roomIds, translatedPositions, doc));
      if (stillOverlaps) {
        continue;
      }

      for (const roomId of component.roomIds) {
        const currentPosition = placedPositions.get(roomId)!;
        placedPositions.set(roomId, {
          x: currentPosition.x + candidate.x,
          y: currentPosition.y + candidate.y,
        });
      }
      break;
    }
  }
}

function createComponentPlacementGroups(components: readonly string[][]): readonly ComponentPlacementGroup[] {
  return components.map((componentRoomIds) => ({
    roomIds: componentRoomIds,
    key: componentRoomIds.join('\0'),
  }));
}

function normalizeComponentPlacementGroups(
  componentGroups: readonly (ComponentPlacementGroup | readonly string[])[],
): readonly ComponentPlacementGroup[] {
  const normalizedComponentGroups: ComponentPlacementGroup[] = [];

  for (const componentGroup of componentGroups) {
    if ('roomIds' in componentGroup) {
      normalizedComponentGroups.push(componentGroup);
      continue;
    }

    if (Array.isArray(componentGroup)) {
      normalizedComponentGroups.push({
        roomIds: [...componentGroup],
        key: componentGroup.join('\0'),
      });
      continue;
    }
  }

  return normalizedComponentGroups;
}

function separateOverlappingComponentAnchors(
  componentAnchors: readonly ComponentAnchor[],
  lockedRoomIds: ReadonlySet<string>,
  normalizedPositions: ReadonlyMap<string, Vector>,
  doc: MapDocument,
): readonly ComponentAnchor[] {
  const provisionalPositions = new Map<string, Position>();
  for (const [roomId, center] of normalizedPositions.entries()) {
    provisionalPositions.set(
      roomId,
      toLayoutNodeTopLeft(
        doc,
        roomId,
        {
          x: snapCoordinate(center.x),
          y: snapCoordinate(center.y),
        },
        doc.view.visualStyle,
      ),
    );
  }

  const adjustedTargetCentroids = new Map(
    componentAnchors.map((componentAnchor) => [
      componentAnchor.key,
      {
        x: componentAnchor.targetCentroid.x,
        y: componentAnchor.targetCentroid.y,
      },
    ] as const),
  );

  const unlockedComponents = componentAnchors
    .filter(({ roomIds }) => !roomIds.some((roomId) => lockedRoomIds.has(roomId)))
    .sort((left, right) => {
      const sizeDifference = right.roomIds.length - left.roomIds.length;
      if (sizeDifference !== 0) {
        return sizeDifference;
      }
      return left.key.localeCompare(right.key);
    });

  for (let index = 1; index < unlockedComponents.length; index += 1) {
    const component = unlockedComponents[index];
    const overlappingEarlierComponents = unlockedComponents
      .slice(0, index)
      .filter((otherComponent) => doComponentsOverlap(otherComponent.roomIds, component.roomIds, provisionalPositions, doc));
    if (overlappingEarlierComponents.length === 0) {
      continue;
    }

    const maxSearchRadius = getMaxComponentSearchRadius(
      component.roomIds,
      overlappingEarlierComponents.map((otherComponent) => otherComponent.roomIds),
      provisionalPositions,
      doc,
    );
    const jiggleCandidates = getComponentJiggleCandidates(maxSearchRadius);

    for (const candidate of jiggleCandidates) {
      const translatedPositions = new Map(provisionalPositions);
      for (const roomId of component.roomIds) {
        const currentPosition = translatedPositions.get(roomId)!;
        translatedPositions.set(roomId, {
          x: currentPosition.x + candidate.x,
          y: currentPosition.y + candidate.y,
        });
      }

      const stillOverlaps = unlockedComponents
        .slice(0, index)
        .some((otherComponent) => doComponentsOverlap(otherComponent.roomIds, component.roomIds, translatedPositions, doc));
      if (stillOverlaps) {
        continue;
      }

      for (const roomId of component.roomIds) {
        const currentPosition = provisionalPositions.get(roomId)!;
        provisionalPositions.set(roomId, {
          x: currentPosition.x + candidate.x,
          y: currentPosition.y + candidate.y,
        });
      }
      const currentTargetCentroid = adjustedTargetCentroids.get(component.key)!;
      adjustedTargetCentroids.set(component.key, {
        x: currentTargetCentroid.x + candidate.x,
        y: currentTargetCentroid.y + candidate.y,
      });
      break;
    }
  }

  return componentAnchors.map((componentAnchor) => ({
    ...componentAnchor,
    targetCentroid: adjustedTargetCentroids.get(componentAnchor.key)!,
  }));
}

function computeComponentAnchors(
  components: readonly string[][],
  constraints: readonly DirectionConstraint[],
  doc: MapDocument,
  lockedRoomIds: ReadonlySet<string>,
  pseudoLikeIds: ReadonlySet<string>,
): { readonly normalizedPositions: ReadonlyMap<string, Vector>; readonly componentAnchors: readonly ComponentAnchor[] } {
  const normalizedPositions = new Map<string, Vector>();
  const componentAnchors: ComponentAnchor[] = [];

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

    const relaxedPositions = relaxComponent(componentRoomIds, absoluteSeedPositions, constraints, lockedRoomIds, pseudoLikeIds);
    const centroidAnchorRoomIds = getCentroidAnchorRoomIds(componentRoomIds, doc);
    componentAnchors.push({
      roomIds: componentRoomIds,
      key: componentRoomIds.join('\0'),
      targetCentroid: computeSeedCentroid(centroidAnchorRoomIds, relaxedPositions),
    });

    for (const roomId of componentRoomIds) {
      normalizedPositions.set(roomId, relaxedPositions.get(roomId)!);
    }
  }

  return { normalizedPositions, componentAnchors };
}

function computePrettifiedRoomPositionsSinglePass(
  doc: MapDocument,
  extraLockedRoomIds: ReadonlySet<string> = new Set<string>(),
): PrettifiedRoomLayout {
  const roomIds = [...Object.keys(doc.rooms), ...Object.keys(doc.pseudoRooms), ...Object.keys(doc.stickyNotes)].sort();
  if (roomIds.length === 0 && Object.keys(doc.stickyNotes).length === 0) {
    return { roomPositions: {}, pseudoRoomPositions: {}, stickyNotePositions: {} };
  }
  const lockedRoomIds = new Set(roomIds.filter((roomId) => (doc.rooms[roomId]?.locked ?? false) || extraLockedRoomIds.has(roomId)));
  const pseudoRoomIds = new Set(Object.keys(doc.pseudoRooms));
  const stickyNoteIds = new Set(Object.keys(doc.stickyNotes));
  const pseudoLikeIds = new Set([...pseudoRoomIds, ...stickyNoteIds]);
  const unlockedRoomIds = roomIds.filter((roomId) => !lockedRoomIds.has(roomId));

  const constraints = [
    ...deriveDirectionConstraints(doc),
    ...deriveVerticalProximityConstraints(doc),
    ...deriveStickyNoteConstraints(doc),
  ];
  const connectivityConstraints = [...deriveConnectionConnectivityConstraints(doc), ...deriveStickyNoteConnectivityConstraints(doc)];
  const components = getConnectedComponents(roomIds, connectivityConstraints);
  const { normalizedPositions, componentAnchors } = computeComponentAnchors(
    components,
    constraints,
    doc,
    lockedRoomIds,
    pseudoLikeIds,
  );
  const adjustedComponentAnchors = separateOverlappingComponentAnchors(
    componentAnchors,
    lockedRoomIds,
    normalizedPositions,
    doc,
  );
  const componentPlacementGroups = createComponentPlacementGroups(components);

  const placedPositions = new Map<string, Position>();
  for (const roomId of lockedRoomIds) {
    placedPositions.set(roomId, getLayoutPosition(doc, roomId)!);
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
    const currentPosition = getLayoutPosition(doc, roomId)!;
    const topLeft = toLayoutNodeTopLeft(doc, roomId, snappedCenter, doc.view.visualStyle);
    const snappedPosition = {
      x: topLeft.x,
      y: topLeft.y,
    };

    placedPositions.set(
      roomId,
      findNearestOpenPosition(roomId, snappedPosition, currentPosition, placedPositions, doc),
    );
  }

  recenterUnlockedComponents(adjustedComponentAnchors, lockedRoomIds, placedPositions, doc);
  separateOverlappingComponents(componentPlacementGroups, lockedRoomIds, placedPositions, doc);

  const roomPositions = Object.fromEntries(
    [...placedPositions.entries()].filter(([roomId]) => roomId in doc.rooms),
  );
  const pseudoRoomPositions = Object.fromEntries(
    [...placedPositions.entries()].filter(([roomId]) => roomId in doc.pseudoRooms),
  );
  const stickyNotePositions = Object.fromEntries(
    [...placedPositions.entries()].filter(([roomId]) => roomId in doc.stickyNotes),
  );

  return { roomPositions, pseudoRoomPositions, stickyNotePositions };
}

function computeStablePrettifiedPositions(
  doc: MapDocument,
  extraLockedRoomIds: ReadonlySet<string>,
): PrettifiedRoomLayout {
  const currentRoomPositions = Object.fromEntries(
    Object.entries(doc.rooms).map(([roomId, room]) => [roomId, room.position]),
  ) as Record<string, Position>;
  const currentPseudoRoomPositions = Object.fromEntries(
    Object.entries(doc.pseudoRooms).map(([pseudoRoomId, pseudoRoom]) => [pseudoRoomId, pseudoRoom.position]),
  ) as Record<string, Position>;
  const currentStickyNotePositions = Object.fromEntries(
    Object.entries(doc.stickyNotes).map(([stickyNoteId, stickyNote]) => [stickyNoteId, stickyNote.position]),
  ) as Record<string, Position>;
  const seenLayouts = new Map<string, number>();
  const candidateLayouts: PrettifiedRoomLayout[] = [];
  let workingDoc = doc;

  for (let iteration = 0; iteration < MAX_STABILIZATION_PASSES; iteration += 1) {
    const nextLayout = computePrettifiedRoomPositionsSinglePass(workingDoc, extraLockedRoomIds);
    const nextSignature = getLayoutSignature(nextLayout);

    const seenIndex = seenLayouts.get(nextSignature);
    if (seenIndex !== undefined) {
      return pickMostStablePrettifiedLayout(
        candidateLayouts.slice(seenIndex),
        currentRoomPositions,
        currentPseudoRoomPositions,
        currentStickyNotePositions,
      );
    }

    seenLayouts.set(nextSignature, candidateLayouts.length);
    candidateLayouts.push(nextLayout);
    workingDoc = withStickyNotePositions(
      withPseudoRoomPositions(withRoomPositions(workingDoc, nextLayout.roomPositions), nextLayout.pseudoRoomPositions),
      nextLayout.stickyNotePositions,
    );
  }

  return candidateLayouts[0] ?? {
    roomPositions: currentRoomPositions,
    pseudoRoomPositions: currentPseudoRoomPositions,
    stickyNotePositions: currentStickyNotePositions,
  };
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
  return computeStablePrettifiedPositions(doc, extraLockedRoomIds);
}

export function getConnectedComponentBounds(doc: MapDocument): readonly ConnectedComponentBounds[] {
  const roomIds = [...Object.keys(doc.rooms), ...Object.keys(doc.pseudoRooms), ...Object.keys(doc.stickyNotes)].sort();
  if (roomIds.length === 0) {
    return [];
  }

  const constraints = [...deriveDirectionConstraints(doc), ...deriveStickyNoteConstraints(doc)];
  const components = getConnectedComponents(roomIds, constraints);
  const componentPlacementGroups = createComponentPlacementGroups(components);
  const placedPositions = new Map<string, Position>();

  for (const roomId of roomIds) {
    const position = getLayoutPosition(doc, roomId);
    if (position) {
      placedPositions.set(roomId, position);
    }
  }

  return componentPlacementGroups.flatMap((componentGroup) => {
    const bounds = getComponentBounds(componentGroup.roomIds, placedPositions, doc);
    if (!bounds) {
      return [];
    }

    return [{
      key: componentGroup.key,
      roomIds: componentGroup.roomIds,
      left: bounds.left,
      top: bounds.top,
      right: bounds.right,
      bottom: bounds.bottom,
    }];
  });
}

export const TEST_ONLY_PRETTIFY_LAYOUT = {
  estimateRoomWidth,
  getLayoutRoom,
  getLayoutPosition,
  getLayoutNodeDimensions,
  deriveDirectionConstraints,
  deriveVerticalProximityConstraints,
  deriveStickyNoteConstraints,
  deriveStickyNoteConnectivityConstraints,
  deriveStickyNoteTargetConnectivityConstraints,
  positionsEqual,
  getLayoutMovementScore,
  computeSeedPositions,
  computePlacedCentroid,
  getComponentBounds,
  doComponentsOverlap,
  separateOverlappingComponents,
  overlapsPlacedRooms,
  findNearestOpenPosition,
  canTranslateComponent,
  getStickyNoteBounds,
  getStickyNoteDimensions,
  toStickyNoteCenter,
  toStickyNoteTopLeft,
  getRoomBounds,
  intersectsWithGap,
  overlapsRoomOrStickyNote,
  findNearestOpenStickyNotePosition,
  getPreferredStickyNotePosition,
  buildStickyNoteLayoutConstraints,
  relaxStickyNotePositions,
  computePrettifiedStickyNotePositions,
  computeStablePrettifiedPositions,
  computeComponentAnchors,
  createComponentPlacementGroups,
  separateOverlappingComponentAnchors,
} as const;
