import type {
  Connection,
  ConnectionAnnotation,
  Item,
  MapDocument,
  Position,
  Room,
  RoomShape,
  RoomStrokeStyle,
  StickyNote,
  StickyNoteLink,
} from './map-types';

/* ------------------------------------------------------------------ */
/*  Internal helpers                                                   */
/* ------------------------------------------------------------------ */

/** Return a shallow copy of doc with an updated `updatedAt` timestamp. */
function touch(doc: MapDocument): MapDocument {
  return {
    ...doc,
    metadata: { ...doc.metadata, updatedAt: new Date().toISOString() },
  };
}

/**
 * Return a copy of the room with any direction bindings pointing to
 * one of the given connection IDs removed.
 */
function stripBindings(room: Room, removedConnectionIds: Set<string>): Room {
  const cleaned: Record<string, string> = {};
  let changed = false;
  for (const [dir, cid] of Object.entries(room.directions)) {
    if (removedConnectionIds.has(cid)) {
      changed = true;
    } else {
      cleaned[dir] = cid;
    }
  }
  return changed ? { ...room, directions: cleaned } : room;
}

/* ------------------------------------------------------------------ */
/*  addRoom                                                            */
/* ------------------------------------------------------------------ */

/** Return a new MapDocument with the given room added. */
export function addRoom(doc: MapDocument, room: Room): MapDocument {
  if (doc.rooms[room.id]) {
    throw new Error(`Room with ID "${room.id}" already exists.`);
  }
  return touch({
    ...doc,
    rooms: { ...doc.rooms, [room.id]: room },
  });
}

export function addStickyNote(doc: MapDocument, stickyNote: StickyNote): MapDocument {
  if (doc.stickyNotes[stickyNote.id]) {
    throw new Error(`Sticky note with ID "${stickyNote.id}" already exists.`);
  }

  return touch({
    ...doc,
    stickyNotes: { ...doc.stickyNotes, [stickyNote.id]: stickyNote },
  });
}

/* ------------------------------------------------------------------ */
/*  addConnection                                                      */
/* ------------------------------------------------------------------ */

/**
 * Return a new MapDocument with the given connection added and direction
 * bindings set on the relevant rooms.
 *
 * For a one-way connection, provide `sourceDirection` only.
 * For a bidirectional connection, provide both `sourceDirection` and `targetDirection`.
 *
 * If the connection already exists in the document (same ID), only the new
 * direction binding is added — this supports multiple directions pointing to
 * the same connection.
 */
export function addConnection(
  doc: MapDocument,
  connection: Connection,
  sourceDirection: string,
  targetDirection?: string,
): MapDocument {
  const sourceRoom = doc.rooms[connection.sourceRoomId];
  if (!sourceRoom) {
    throw new Error(
      `Source room "${connection.sourceRoomId}" not found.`,
    );
  }

  const targetRoom = doc.rooms[connection.targetRoomId];
  if (!targetRoom) {
    throw new Error(
      `Target room "${connection.targetRoomId}" not found.`,
    );
  }

  if (connection.isBidirectional && targetDirection === undefined) {
    throw new Error(
      'A bidirectional connection requires a reverse direction for the target room.',
    );
  }

  // Check source direction isn't already bound to a *different* connection
  const existingSourceBinding = sourceRoom.directions[sourceDirection];
  if (existingSourceBinding !== undefined && existingSourceBinding !== connection.id) {
    throw new Error(
      `Direction "${sourceDirection}" in room "${sourceRoom.name}" is already bound to connection "${existingSourceBinding}".`,
    );
  }

  // Check target direction isn't already bound (for bidirectional)
  if (targetDirection !== undefined) {
    const existingTargetBinding = targetRoom.directions[targetDirection];
    if (existingTargetBinding !== undefined && existingTargetBinding !== connection.id) {
      throw new Error(
        `Direction "${targetDirection}" in room "${targetRoom.name}" is already bound to connection "${existingTargetBinding}".`,
      );
    }
  }

  // Build updated rooms
  const updatedSource: Room = {
    ...sourceRoom,
    directions: { ...sourceRoom.directions, [sourceDirection]: connection.id },
  };

  // For self-connections (source === target), build target from updatedSource
  // so the source binding is not overwritten.
  const targetBase = connection.sourceRoomId === connection.targetRoomId ? updatedSource : targetRoom;
  let updatedTarget = targetBase;
  if (targetDirection !== undefined) {
    updatedTarget = {
      ...targetBase,
      directions: { ...targetBase.directions, [targetDirection]: connection.id },
    };
  }

  // Add or keep the connection
  const connections = { ...doc.connections, [connection.id]: connection };

  const rooms = {
    ...doc.rooms,
    [updatedSource.id]: updatedSource,
    [updatedTarget.id]: updatedTarget,
  };

  return touch({ ...doc, rooms, connections });
}

export function addStickyNoteLink(doc: MapDocument, stickyNoteLink: StickyNoteLink): MapDocument {
  if (!doc.stickyNotes[stickyNoteLink.stickyNoteId]) {
    throw new Error(`Sticky note "${stickyNoteLink.stickyNoteId}" not found.`);
  }

  if (!doc.rooms[stickyNoteLink.roomId]) {
    throw new Error(`Room "${stickyNoteLink.roomId}" not found.`);
  }

  const duplicate = Object.values(doc.stickyNoteLinks).some((link) => (
    link.stickyNoteId === stickyNoteLink.stickyNoteId && link.roomId === stickyNoteLink.roomId
  ));
  if (duplicate) {
    return doc;
  }

  return touch({
    ...doc,
    stickyNoteLinks: { ...doc.stickyNoteLinks, [stickyNoteLink.id]: stickyNoteLink },
  });
}

/* ------------------------------------------------------------------ */
/*  addItem                                                            */
/* ------------------------------------------------------------------ */

/** Return a new MapDocument with the given item added. */
export function addItem(doc: MapDocument, item: Item): MapDocument {
  if (!doc.rooms[item.roomId]) {
    throw new Error(`Room "${item.roomId}" not found. Cannot place item.`);
  }
  if (doc.items[item.id]) {
    throw new Error(`Item with ID "${item.id}" already exists.`);
  }
  return touch({
    ...doc,
    items: { ...doc.items, [item.id]: item },
  });
}

/* ------------------------------------------------------------------ */
/*  deleteRoom                                                         */
/* ------------------------------------------------------------------ */

/**
 * Remove a room and cascade-delete all connections that reference it,
 * direction bindings in other rooms that pointed to those connections,
 * and items that were placed in the room.
 */
export function deleteRoom(doc: MapDocument, roomId: string): MapDocument {
  if (!doc.rooms[roomId]) {
    throw new Error(`Room "${roomId}" not found.`);
  }

  // Identify connections involving this room
  const removedConnectionIds = new Set<string>();
  for (const [cid, conn] of Object.entries(doc.connections)) {
    if (conn.sourceRoomId === roomId || conn.targetRoomId === roomId) {
      removedConnectionIds.add(cid);
    }
  }

  // Remove the room
  const { [roomId]: _removedRoom, ...remainingRooms } = doc.rooms;

  // Clean up direction bindings in surviving rooms
  const cleanedRooms: Record<string, Room> = {};
  for (const [rid, room] of Object.entries(remainingRooms)) {
    const cleaned = stripBindings(room, removedConnectionIds);
    cleanedRooms[rid] = cleaned;
  }

  // Remove connections
  const remainingConnections: Record<string, Connection> = {};
  for (const [cid, conn] of Object.entries(doc.connections)) {
    if (!removedConnectionIds.has(cid)) {
      remainingConnections[cid] = conn;
    }
  }

  // Remove items in the deleted room
  const remainingItems: Record<string, Item> = {};
  for (const [iid, item] of Object.entries(doc.items)) {
    if (item.roomId !== roomId) {
      remainingItems[iid] = item;
    }
  }

  const remainingStickyNoteLinks = Object.fromEntries(
    Object.entries(doc.stickyNoteLinks).filter(([, link]) => link.roomId !== roomId),
  );

  return touch({
    ...doc,
    rooms: cleanedRooms,
    connections: remainingConnections,
    stickyNoteLinks: remainingStickyNoteLinks,
    items: remainingItems,
  });
}

/* ------------------------------------------------------------------ */
/*  deleteConnection                                                   */
/* ------------------------------------------------------------------ */

/**
 * Remove a connection and clean up all direction bindings that reference it
 * in both source and target rooms.
 */
export function deleteConnection(doc: MapDocument, connectionId: string): MapDocument {
  const conn = doc.connections[connectionId];
  if (!conn) {
    throw new Error(`Connection "${connectionId}" not found.`);
  }

  const removedIds = new Set([connectionId]);

  // Clean bindings in all rooms (source, target, or any room that might reference it)
  const cleanedRooms: Record<string, Room> = {};
  for (const [rid, room] of Object.entries(doc.rooms)) {
    cleanedRooms[rid] = stripBindings(room, removedIds);
  }

  const { [connectionId]: _removed, ...remainingConnections } = doc.connections;

  return touch({
    ...doc,
    rooms: cleanedRooms,
    connections: remainingConnections,
  });
}

export function deleteStickyNote(doc: MapDocument, stickyNoteId: string): MapDocument {
  if (!doc.stickyNotes[stickyNoteId]) {
    throw new Error(`Sticky note "${stickyNoteId}" not found.`);
  }

  const { [stickyNoteId]: _removedStickyNote, ...remainingStickyNotes } = doc.stickyNotes;
  const remainingStickyNoteLinks = Object.fromEntries(
    Object.entries(doc.stickyNoteLinks).filter(([, link]) => link.stickyNoteId !== stickyNoteId),
  );

  return touch({
    ...doc,
    stickyNotes: remainingStickyNotes,
    stickyNoteLinks: remainingStickyNoteLinks,
  });
}

export function deleteStickyNoteLink(doc: MapDocument, stickyNoteLinkId: string): MapDocument {
  if (!doc.stickyNoteLinks[stickyNoteLinkId]) {
    throw new Error(`Sticky note link "${stickyNoteLinkId}" not found.`);
  }

  const { [stickyNoteLinkId]: _removedStickyNoteLink, ...remainingStickyNoteLinks } = doc.stickyNoteLinks;
  return touch({
    ...doc,
    stickyNoteLinks: remainingStickyNoteLinks,
  });
}

/* ------------------------------------------------------------------ */
/*  deleteItem                                                         */
/* ------------------------------------------------------------------ */

/** Remove an item from the document. */
export function deleteItem(doc: MapDocument, itemId: string): MapDocument {
  if (!doc.items[itemId]) {
    throw new Error(`Item "${itemId}" not found.`);
  }

  const { [itemId]: _removed, ...remainingItems } = doc.items;
  return touch({ ...doc, items: remainingItems });
}

/* ------------------------------------------------------------------ */
/*  renameRoom                                                         */
/* ------------------------------------------------------------------ */

/** Return a new document with the room's name updated. */
export function renameRoom(doc: MapDocument, roomId: string, name: string): MapDocument {
  const room = doc.rooms[roomId];
  if (!room) {
    throw new Error(`Room "${roomId}" not found.`);
  }
  return touch({
    ...doc,
    rooms: { ...doc.rooms, [roomId]: { ...room, name } },
  });
}

/* ------------------------------------------------------------------ */
/*  moveRoom                                                           */
/* ------------------------------------------------------------------ */

/** Return a new document with the room's position updated. */
export function moveRoom(doc: MapDocument, roomId: string, position: Position): MapDocument {
  const room = doc.rooms[roomId];
  if (!room) {
    throw new Error(`Room "${roomId}" not found.`);
  }
  return touch({
    ...doc,
    rooms: { ...doc.rooms, [roomId]: { ...room, position } },
  });
}

export function moveStickyNote(doc: MapDocument, stickyNoteId: string, position: Position): MapDocument {
  const stickyNote = doc.stickyNotes[stickyNoteId];
  if (!stickyNote) {
    throw new Error(`Sticky note "${stickyNoteId}" not found.`);
  }

  return touch({
    ...doc,
    stickyNotes: { ...doc.stickyNotes, [stickyNoteId]: { ...stickyNote, position } },
  });
}

export function setStickyNotePositions(
  doc: MapDocument,
  positions: Readonly<Record<string, Position>>,
): MapDocument {
  let changed = false;
  const stickyNotes = { ...doc.stickyNotes };

  for (const [stickyNoteId, position] of Object.entries(positions)) {
    const stickyNote = stickyNotes[stickyNoteId];
    if (!stickyNote) {
      throw new Error(`Sticky note "${stickyNoteId}" not found.`);
    }

    if (stickyNote.position.x === position.x && stickyNote.position.y === position.y) {
      continue;
    }

    stickyNotes[stickyNoteId] = { ...stickyNote, position };
    changed = true;
  }

  return changed ? touch({ ...doc, stickyNotes }) : doc;
}

/** Return a new document with multiple room positions updated at once. */
export function setRoomPositions(
  doc: MapDocument,
  positions: Readonly<Record<string, Position>>,
): MapDocument {
  let changed = false;
  const rooms = { ...doc.rooms };

  for (const [roomId, position] of Object.entries(positions)) {
    const room = rooms[roomId];
    if (!room) {
      throw new Error(`Room "${roomId}" not found.`);
    }

    if (room.position.x === position.x && room.position.y === position.y) {
      continue;
    }

    rooms[roomId] = { ...room, position };
    changed = true;
  }

  return changed ? touch({ ...doc, rooms }) : doc;
}

/* ------------------------------------------------------------------ */
/*  describeRoom                                                       */
/* ------------------------------------------------------------------ */

/** Return a new document with the room's description updated. */
export function describeRoom(doc: MapDocument, roomId: string, description: string): MapDocument {
  const room = doc.rooms[roomId];
  if (!room) {
    throw new Error(`Room "${roomId}" not found.`);
  }
  return touch({
    ...doc,
    rooms: { ...doc.rooms, [roomId]: { ...room, description } },
  });
}

export function setStickyNoteText(doc: MapDocument, stickyNoteId: string, text: string): MapDocument {
  const stickyNote = doc.stickyNotes[stickyNoteId];
  if (!stickyNote) {
    throw new Error(`Sticky note "${stickyNoteId}" not found.`);
  }

  return touch({
    ...doc,
    stickyNotes: { ...doc.stickyNotes, [stickyNoteId]: { ...stickyNote, text } },
  });
}

/** Return a new document with the room's shape updated. */
export function setRoomShape(doc: MapDocument, roomId: string, shape: RoomShape): MapDocument {
  const room = doc.rooms[roomId];
  if (!room) {
    throw new Error(`Room "${roomId}" not found.`);
  }
  return touch({
    ...doc,
    rooms: { ...doc.rooms, [roomId]: { ...room, shape } },
  });
}

/** Return a new document with the room's visual styling updated. */
export function setRoomStyle(
  doc: MapDocument,
  roomId: string,
  style: {
    fillColorIndex?: number;
    strokeColorIndex?: number;
    strokeStyle?: RoomStrokeStyle;
  },
): MapDocument {
  const room = doc.rooms[roomId];
  if (!room) {
    throw new Error(`Room "${roomId}" not found.`);
  }
  return touch({
    ...doc,
    rooms: {
      ...doc.rooms,
      [roomId]: {
        ...room,
        ...style,
      },
    },
  });
}

/** Return a new document with the connection's visual styling updated. */
export function setConnectionStyle(
  doc: MapDocument,
  connectionId: string,
  style: {
    strokeColorIndex?: number;
    strokeStyle?: RoomStrokeStyle;
  },
): MapDocument {
  const connection = doc.connections[connectionId];
  if (!connection) {
    throw new Error(`Connection "${connectionId}" not found.`);
  }

  return touch({
    ...doc,
    connections: {
      ...doc.connections,
      [connectionId]: {
        ...connection,
        ...style,
      },
    },
  });
}

/** Return a new document with the connection's annotation updated. */
export function setConnectionAnnotation(
  doc: MapDocument,
  connectionId: string,
  annotation: ConnectionAnnotation | null,
): MapDocument {
  const connection = doc.connections[connectionId];
  if (!connection) {
    throw new Error(`Connection "${connectionId}" not found.`);
  }

  return touch({
    ...doc,
    connections: {
      ...doc.connections,
      [connectionId]: {
        ...connection,
        annotation,
      },
    },
  });
}

/** Return a new document with the connection's endpoint labels updated. */
export function setConnectionLabels(
  doc: MapDocument,
  connectionId: string,
  labels: {
    startLabel?: string;
    endLabel?: string;
  },
): MapDocument {
  const connection = doc.connections[connectionId];
  if (!connection) {
    throw new Error(`Connection "${connectionId}" not found.`);
  }

  return touch({
    ...doc,
    connections: {
      ...doc.connections,
      [connectionId]: {
        ...connection,
        ...labels,
      },
    },
  });
}

/* ------------------------------------------------------------------ */
/*  describeItem                                                       */
/* ------------------------------------------------------------------ */

/** Return a new document with the item's description updated. */
export function describeItem(doc: MapDocument, itemId: string, description: string): MapDocument {
  const item = doc.items[itemId];
  if (!item) {
    throw new Error(`Item "${itemId}" not found.`);
  }
  return touch({
    ...doc,
    items: { ...doc.items, [itemId]: { ...item, description } },
  });
}
