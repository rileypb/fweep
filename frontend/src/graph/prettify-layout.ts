import type { MapDocument, Position, Room } from '../domain/map-types';
import { getRoomNodeWidth } from './room-label-geometry';
const ROOM_HEIGHT = 36;
const ROOM_VERTICAL_GAP = 24;
const ROOM_HORIZONTAL_GAP = 40;

export const PRETTIFY_GRID_SIZE = 40;
export const PRETTIFY_HORIZONTAL_SPACING = 160;
export const PRETTIFY_VERTICAL_SPACING = 120;

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

function estimateRoomWidth(room: Room): number {
  return getRoomNodeWidth(room);
}

function toRoomCenter(room: Room, position: Position): Vector {
  return {
    x: position.x + (estimateRoomWidth(room) / 2),
    y: position.y + (ROOM_HEIGHT / 2),
  };
}

function toRoomTopLeft(room: Room, center: Vector): Position {
  return {
    x: center.x - (estimateRoomWidth(room) / 2),
    y: center.y - (ROOM_HEIGHT / 2),
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
        ? connection.targetRoomId
        : connection.targetRoomId === room.id
          ? connection.sourceRoomId
          : undefined;

      if (!otherRoomId || otherRoomId === room.id || !doc.rooms[otherRoomId]) {
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

function computeComponentSeedOffset(
  componentRoomIds: readonly string[],
  seedPositions: ReadonlyMap<string, Vector>,
  doc: MapDocument,
  lockedRoomIds: ReadonlySet<string>,
): Vector {
  const lockedComponentRoomIds = componentRoomIds.filter((roomId) => lockedRoomIds.has(roomId));
  if (lockedComponentRoomIds.length > 0) {
    const total = lockedComponentRoomIds.reduce(
      (acc, roomId) => {
        const actualCenter = toRoomCenter(doc.rooms[roomId], doc.rooms[roomId].position);
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

  const seedCentroid = computeSeedCentroid(componentRoomIds, seedPositions);
  const originalCentroid = computeOriginalCentroid(componentRoomIds, doc);
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
  const total = roomIds.reduce(
    (acc, roomId) => {
      const center = toRoomCenter(doc.rooms[roomId], doc.rooms[roomId].position);
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
  const room = doc.rooms[roomId];
  const candidateWidth = estimateRoomWidth(room);
  const candidateLeft = candidatePosition.x;
  const candidateRight = candidateLeft + candidateWidth + ROOM_HORIZONTAL_GAP;
  const candidateTop = candidatePosition.y;
  const candidateBottom = candidateTop + ROOM_HEIGHT + ROOM_VERTICAL_GAP;

  for (const [placedRoomId, placedPosition] of placedPositions) {
    if (placedRoomId === roomId) {
      continue;
    }

    const placedRoom = doc.rooms[placedRoomId];
    const placedWidth = estimateRoomWidth(placedRoom);
    const placedLeft = placedPosition.x;
    const placedRight = placedLeft + placedWidth + ROOM_HORIZONTAL_GAP;
    const placedTop = placedPosition.y;
    const placedBottom = placedTop + ROOM_HEIGHT + ROOM_VERTICAL_GAP;

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
  placedPositions: ReadonlyMap<string, Position>,
  doc: MapDocument,
): Position {
  if (!overlapsPlacedRooms(roomId, preferredPosition, placedPositions, doc)) {
    return preferredPosition;
  }

  const offsets: Position[] = [{ x: 0, y: 0 }];
  for (let radius = 1; radius <= 12; radius += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      offsets.push({ x: dx * PRETTIFY_GRID_SIZE, y: -radius * PRETTIFY_GRID_SIZE });
      offsets.push({ x: dx * PRETTIFY_GRID_SIZE, y: radius * PRETTIFY_GRID_SIZE });
    }

    for (let dy = -(radius - 1); dy <= radius - 1; dy += 1) {
      offsets.push({ x: -radius * PRETTIFY_GRID_SIZE, y: dy * PRETTIFY_GRID_SIZE });
      offsets.push({ x: radius * PRETTIFY_GRID_SIZE, y: dy * PRETTIFY_GRID_SIZE });
    }
  }

  for (const offset of offsets) {
    const candidate = {
      x: preferredPosition.x + offset.x,
      y: preferredPosition.y + offset.y,
    };
    if (!overlapsPlacedRooms(roomId, candidate, placedPositions, doc)) {
      return candidate;
    }
  }

  return preferredPosition;
}

export function computePrettifiedRoomPositions(
  doc: MapDocument,
  extraLockedRoomIds: ReadonlySet<string> = new Set<string>(),
): Readonly<Record<string, Position>> {
  const roomIds = Object.keys(doc.rooms).sort();
  if (roomIds.length === 0) {
    return {};
  }
  const lockedRoomIds = new Set(roomIds.filter((roomId) => doc.rooms[roomId].locked || extraLockedRoomIds.has(roomId)));
  const unlockedRoomIds = roomIds.filter((roomId) => !lockedRoomIds.has(roomId));

  const constraints = deriveDirectionConstraints(doc);
  const components = getConnectedComponents(roomIds, constraints);
  const normalizedPositions = new Map<string, Vector>();

  for (const componentRoomIds of components) {
    const relativeSeedPositions = computeSeedPositions(componentRoomIds, constraints);
    const seedOffset = computeComponentSeedOffset(componentRoomIds, relativeSeedPositions, doc, lockedRoomIds);
    const absoluteSeedPositions = new Map<string, Vector>();

    for (const roomId of componentRoomIds) {
      if (lockedRoomIds.has(roomId)) {
        absoluteSeedPositions.set(roomId, toRoomCenter(doc.rooms[roomId], doc.rooms[roomId].position));
        continue;
      }

      const seed = relativeSeedPositions.get(roomId)!;
      absoluteSeedPositions.set(roomId, {
        x: seed.x + seedOffset.x,
        y: seed.y + seedOffset.y,
      });
    }

    const relaxedPositions = relaxComponent(componentRoomIds, absoluteSeedPositions, constraints, lockedRoomIds);

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
    return (leftPosition.y - rightPosition.y) || (leftPosition.x - rightPosition.x);
  });

  for (const roomId of orderedRoomIds) {
    const center = normalizedPositions.get(roomId)!;
    const snappedCenter = {
      x: snapCoordinate(center.x),
      y: snapCoordinate(center.y),
    };
    const topLeft = toRoomTopLeft(doc.rooms[roomId], snappedCenter);
    const snappedPosition = {
      x: topLeft.x,
      y: topLeft.y,
    };

    placedPositions.set(
      roomId,
      findNearestOpenPosition(roomId, snappedPosition, placedPositions, doc),
    );
  }

  return Object.fromEntries(placedPositions.entries());
}
