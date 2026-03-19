import type { MapDocument } from './map-types';

interface OutgoingExit {
  readonly direction: string;
  readonly oneWay: boolean;
}

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

function formatRoomNameForDescription(roomName: string): string {
  return roomName.trim().toLowerCase().startsWith('the ') ? roomName : `the ${roomName}`;
}

function getOutgoingExits(doc: MapDocument, roomId: string): readonly OutgoingExit[] {
  const room = doc.rooms[roomId];
  if (!room) {
    return [];
  }

  return Object.entries(room.directions).flatMap(([direction, connectionId]) => {
    const connection = doc.connections[connectionId];
    if (!connection) {
      return [];
    }

    if (connection.sourceRoomId === room.id) {
      return [{ direction, oneWay: !connection.isBidirectional }];
    }

    if (connection.isBidirectional && connection.target.kind === 'room' && connection.target.id === room.id) {
      return [{ direction, oneWay: false }];
    }

    return [];
  });
}

export function describeRoomForCli(doc: MapDocument, roomId: string): string {
  const room = doc.rooms[roomId];
  if (!room) {
    throw new Error(`Room "${roomId}" not found.`);
  }

  const outgoingExits = getOutgoingExits(doc, roomId);
  const roomText = formatRoomNameForDescription(room.name);
  if (outgoingExits.length === 0) {
    return `From ${roomText}, one cannot go anywhere.`;
  }

  const directions = outgoingExits.map((exit) => exit.direction);
  const oneWayDirections = outgoingExits
    .filter((exit) => exit.oneWay)
    .map((exit) => exit.direction);
  const leadSentence = `From ${roomText}, one can go ${formatList(directions, 'or')}.`;

  if (oneWayDirections.length === 0) {
    return leadSentence;
  }

  if (oneWayDirections.length === 1) {
    return `${leadSentence} The passage ${oneWayDirections[0]} is one-way, however.`;
  }

  return `${leadSentence} The passages ${formatList(oneWayDirections, 'and')} are one-way, however.`;
}
