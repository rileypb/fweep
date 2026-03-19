import type { Connection, ConnectionAnnotation, MapDocument, PseudoRoomKind } from './map-types';

interface ExitDescription {
  readonly direction: string;
  readonly oneWay: boolean;
  readonly annotation: ConnectionAnnotation | null;
  readonly target:
    | { readonly kind: 'room'; readonly roomName: string }
    | { readonly kind: 'pseudo-room'; readonly pseudoKind: PseudoRoomKind };
}

const descriptionDirectionOrder = [
  'north',
  'northeast',
  'east',
  'southeast',
  'south',
  'southwest',
  'west',
  'northwest',
  'up',
  'down',
  'in',
  'out',
] as const;

const directionOrder: ReadonlyMap<string, number> = new Map(
  descriptionDirectionOrder.map((direction, index) => [direction, index]),
);

function formatList(items: readonly string[], conjunction: 'and' | 'or'): string {
  if (items.length === 0) {
    return '';
  }

  if (items.length === 1) {
    return items[0];
  }

  if (items.length === 2) {
    return `${items[0]} ${conjunction} ${items[1]}`;
  }

  return `${items.slice(0, -1).join(', ')}, ${conjunction} ${items.at(-1)}`;
}

function formatTargetRoomName(roomName: string): string {
  return roomName.trim().toLowerCase().startsWith('the ') ? roomName : `the ${roomName}`;
}

function formatDirectionLead(direction: string): string {
  if (direction === 'up' || direction === 'down' || direction === 'in' || direction === 'out') {
    return direction;
  }

  return `the ${direction}`;
}

function formatPseudoTarget(pseudoKind: PseudoRoomKind): string {
  switch (pseudoKind) {
    case 'unknown':
      return 'the unknown';
    case 'death':
      return 'death';
    case 'nowhere':
      return 'nowhere';
    case 'infinite':
      return 'goes on forever';
  }
}

function describeBidirectionalRoomExit(direction: string, annotation: ConnectionAnnotation | null, roomName: string): string {
  const targetName = formatTargetRoomName(roomName);
  switch (annotation?.kind) {
    case 'door':
      return `${direction} through a door to ${targetName}`;
    case 'locked door':
      return `${direction} through a locked door to ${targetName}`;
    case 'in':
      return `${direction} into ${targetName}`;
    case 'out':
      return `${direction} to ${targetName}`;
    default:
      return `${direction} to ${targetName}`;
  }
}

function describeOneWayExit(exit: ExitDescription): string {
  const start = exit.direction === 'up' || exit.direction === 'down' || exit.direction === 'in' || exit.direction === 'out'
    ? `${exit.direction[0].toUpperCase()}${exit.direction.slice(1)} is a one-way exit`
    : `To ${formatDirectionLead(exit.direction)} is a one-way exit`;
  if (exit.target.kind === 'pseudo-room') {
    if (exit.target.pseudoKind === 'infinite') {
      return `${start} that ${formatPseudoTarget(exit.target.pseudoKind)}.`;
    }

    return `${start} that leads to ${formatPseudoTarget(exit.target.pseudoKind)}.`;
  }

  const targetName = formatTargetRoomName(exit.target.roomName);
  switch (exit.annotation?.kind) {
    case 'door':
      return `${start} through a door that leads to ${targetName}.`;
    case 'locked door':
      return `${start} through a locked door that leads to ${targetName}.`;
    case 'in':
      return `${start} that leads into ${targetName}.`;
    case 'out':
      return `${start} that leads out to ${targetName}.`;
    default:
      return `${start} that leads to ${targetName}.`;
  }
}

function compareDirections(left: string, right: string): number {
  const leftOrder = directionOrder.get(left);
  const rightOrder = directionOrder.get(right);
  if (leftOrder !== undefined && rightOrder !== undefined) {
    return leftOrder - rightOrder;
  }

  if (leftOrder !== undefined) {
    return -1;
  }

  if (rightOrder !== undefined) {
    return 1;
  }

  return left.localeCompare(right);
}

function getExitDescriptionForConnection(
  doc: MapDocument,
  roomId: string,
  direction: string,
  connection: Connection,
): ExitDescription | null {
  if (connection.sourceRoomId === roomId) {
    if (connection.target.kind === 'room') {
      const targetRoom = doc.rooms[connection.target.id];
      if (!targetRoom) {
        return null;
      }

      return {
        direction,
        oneWay: !connection.isBidirectional,
        annotation: connection.annotation,
        target: { kind: 'room', roomName: targetRoom.name },
      };
    }

    const pseudoRoom = doc.pseudoRooms[connection.target.id];
    if (!pseudoRoom) {
      return null;
    }

    return {
      direction,
      oneWay: true,
      annotation: connection.annotation,
      target: { kind: 'pseudo-room', pseudoKind: pseudoRoom.kind },
    };
  }

  if (connection.isBidirectional && connection.target.kind === 'room' && connection.target.id === roomId) {
    const sourceRoom = doc.rooms[connection.sourceRoomId];
    if (!sourceRoom) {
      return null;
    }

    return {
      direction,
      oneWay: false,
      annotation: connection.annotation,
      target: { kind: 'room', roomName: sourceRoom.name },
    };
  }

  return null;
}

function getOutgoingExits(doc: MapDocument, roomId: string): readonly ExitDescription[] {
  const room = doc.rooms[roomId];
  if (!room) {
    return [];
  }

  return Object.entries(room.directions)
    .flatMap(([direction, connectionId]) => {
      const connection = doc.connections[connectionId];
      if (!connection) {
        return [];
      }

      const exit = getExitDescriptionForConnection(doc, roomId, direction, connection);
      return exit === null ? [] : [exit];
    })
    .sort((left, right) => compareDirections(left.direction, right.direction));
}

function formatIndefiniteNoun(noun: string): string {
  const trimmed = noun.trim();
  if (trimmed.length === 0) {
    return trimmed;
  }

  if (/^(a|an|the)\b/i.test(trimmed)) {
    return trimmed;
  }

  return `${/^[aeiou]/i.test(trimmed) ? 'an' : 'a'} ${trimmed}`;
}

function describeItems(doc: MapDocument, roomId: string): string | null {
  const itemNames = Object.values(doc.items)
    .filter((item) => item.roomId === roomId)
    .map((item) => formatIndefiniteNoun(item.name))
    .sort((left, right) => left.localeCompare(right));

  if (itemNames.length === 0) {
    return null;
  }

  return `You see ${formatList(itemNames, 'and')} here.`;
}

function describeExits(roomName: string, exits: readonly ExitDescription[]): string {
  if (exits.length === 0) {
    return `From ${roomName}, one cannot go anywhere.`;
  }

  const ordinaryExits = exits.filter(
    (exit): exit is ExitDescription & { target: { kind: 'room'; roomName: string } } =>
      !exit.oneWay && exit.target.kind === 'room',
  );
  const oneWayExits = exits.filter((exit) => exit.oneWay);
  const sections: string[] = [];

  if (ordinaryExits.length > 0) {
    sections.push(
      `From ${roomName}, one can go ${formatList(
        ordinaryExits.map((exit) => describeBidirectionalRoomExit(exit.direction, exit.annotation, exit.target.roomName)),
        'or',
      )}.`,
    );
  } else if (oneWayExits.length === 0) {
    sections.push(`From ${roomName}, one cannot go anywhere.`);
  }

  for (const exit of oneWayExits) {
    sections.push(describeOneWayExit(exit));
  }

  return sections.join(' ');
}

export function describeRoomForCli(doc: MapDocument, roomId: string): string {
  const room = doc.rooms[roomId];
  if (!room) {
    throw new Error(`Room "${roomId}" not found.`);
  }

  return describeRoomForCliLines(doc, roomId).join('\n\n');
}

export function describeRoomForCliLines(doc: MapDocument, roomId: string): readonly string[] {
  const room = doc.rooms[roomId];
  if (!room) {
    throw new Error(`Room "${roomId}" not found.`);
  }

  return [
    describeExits(room.name, getOutgoingExits(doc, roomId)),
    describeItems(doc, roomId),
    room.isDark ? 'It is dark.' : null,
  ].filter((section): section is string => section !== null);
}
