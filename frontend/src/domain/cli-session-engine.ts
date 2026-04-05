import { parseCliCommand, type CliRoomAdjective } from './cli-command';
import { planCreateRoomFromCli, resolveRoomByCliReference, isCliPronounReference } from './cli-execution';
import { normalizeDirection, oppositeDirection } from './directions';
import { computePrettifiedLayoutPositions } from '../graph/prettify-layout';
import { getRoomNodeWidth } from '../graph/room-label-geometry';
import { getStickyNoteHeight } from '../graph/sticky-note-geometry';
import { describeRoomForCliLines } from './cli-room-description';
import {
  addConnection,
  addItem,
  addPseudoRoom,
  addRoom,
  addStickyNote,
  addStickyNoteLink,
  deleteConnection,
  deleteItem,
  deleteRoom,
  setConnectionAnnotation,
  setPseudoRoomKind,
  setPseudoRoomPositions,
  setRoomDark,
  setRoomPositions,
  setStickyNotePositions,
} from './map-operations';
import {
  createConnection,
  createEmptyMap,
  createItem,
  createPseudoRoom,
  createRoom,
  createStickyNote,
  createStickyNoteLink,
  type MapDocument,
  type Position,
  type Room,
} from './map-types';

export interface CliSessionState {
  readonly doc: MapDocument;
  readonly pronounRoomId: string | null;
  readonly selectedRoomIds: readonly string[];
  readonly selectedPseudoRoomIds: readonly string[];
  readonly selectedStickyNoteIds: readonly string[];
  readonly selectedConnectionIds: readonly string[];
  readonly selectedStickyNoteLinkIds: readonly string[];
  readonly undoStack: readonly CliSessionSnapshot[];
  readonly redoStack: readonly CliSessionSnapshot[];
}

export interface CliSessionSnapshot {
  readonly doc: MapDocument;
  readonly pronounRoomId: string | null;
  readonly selectedRoomIds: readonly string[];
  readonly selectedPseudoRoomIds: readonly string[];
  readonly selectedStickyNoteIds: readonly string[];
  readonly selectedConnectionIds: readonly string[];
  readonly selectedStickyNoteLinkIds: readonly string[];
}

export interface CliSessionCommandOptions {
  readonly viewportSize?: { readonly width: number; readonly height: number };
  readonly panOffset?: Position;
}

const DEFAULT_VIEWPORT_SIZE = { width: 800, height: 600 } as const;
const DEFAULT_PAN_OFFSET = { x: 0, y: 0 } as const;
const GRID_SIZE = 40;

function prettifyCliConnectionResult(doc: MapDocument, movableRoomIds: readonly string[]): MapDocument {
  const movableSet = new Set(movableRoomIds);
  const transientLockedRoomIds = new Set(
    Object.keys(doc.rooms).filter((roomId) => !movableSet.has(roomId)),
  );
  const { roomPositions } = computePrettifiedLayoutPositions(doc, transientLockedRoomIds);
  return setRoomPositions(doc, roomPositions);
}

function prettifyCliPseudoRoomResult(doc: MapDocument): MapDocument {
  const transientLockedRoomIds = new Set(Object.keys(doc.rooms));
  const { pseudoRoomPositions } = computePrettifiedLayoutPositions(doc, transientLockedRoomIds);
  return setPseudoRoomPositions(doc, pseudoRoomPositions);
}

function prettifyCliStickyNoteResult(doc: MapDocument): MapDocument {
  const transientLockedRoomIds = new Set(Object.keys(doc.rooms));
  const { stickyNotePositions } = computePrettifiedLayoutPositions(doc, transientLockedRoomIds);
  return setStickyNotePositions(doc, stickyNotePositions);
}

function getCliPseudoRoomPlacement(doc: MapDocument, sourceRoomId: string, sourceDirection: string): Position {
  const sourceRoom = doc.rooms[sourceRoomId];
  if (!sourceRoom) {
    throw new Error(`Room "${sourceRoomId}" not found.`);
  }

  const offset = GRID_SIZE * 2;
  const direction = normalizeDirection(sourceDirection);
  const deltaByDirection: Record<string, Position> = {
    north: { x: 0, y: -offset },
    south: { x: 0, y: offset },
    east: { x: offset, y: 0 },
    west: { x: -offset, y: 0 },
    northeast: { x: offset, y: -offset },
    northwest: { x: -offset, y: -offset },
    southeast: { x: offset, y: offset },
    southwest: { x: -offset, y: offset },
    up: { x: 0, y: -offset },
    down: { x: 0, y: offset },
    in: { x: -offset, y: 0 },
    out: { x: offset, y: 0 },
  };
  const delta = deltaByDirection[direction] ?? { x: offset, y: 0 };

  return {
    x: sourceRoom.position.x + delta.x,
    y: sourceRoom.position.y + delta.y,
  };
}

function normalizeEntityName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

function findMatchingItemIdsInRoom(
  doc: MapDocument,
  roomId: string,
  itemNames: readonly string[],
): {
  readonly removedItemIds: readonly string[];
  readonly missingItemNames: readonly string[];
} {
  const availableItems = Object.values(doc.items)
    .filter((item) => item.roomId === roomId)
    .map((item) => ({
      id: item.id,
      normalizedName: normalizeEntityName(item.name),
    }));
  const usedItemIds = new Set<string>();
  const removedItemIds: string[] = [];
  const missingItemNames: string[] = [];

  for (const itemName of itemNames) {
    const normalizedName = normalizeEntityName(itemName);
    const matchingItem = availableItems.find((item) => item.normalizedName === normalizedName && !usedItemIds.has(item.id));
    if (matchingItem === undefined) {
      missingItemNames.push(itemName);
      continue;
    }

    usedItemIds.add(matchingItem.id);
    removedItemIds.push(matchingItem.id);
  }

  return { removedItemIds, missingItemNames };
}

function getStickyNotePlacementForRoom(doc: MapDocument, roomId: string, text: string): Position {
  const room = doc.rooms[roomId];
  if (!room) {
    throw new Error(`Room "${roomId}" not found.`);
  }

  const noteHeight = getStickyNoteHeight(text);
  return {
    x: room.position.x + getRoomNodeWidth(room) + GRID_SIZE,
    y: room.position.y + Math.round((36 - noteHeight) / 2),
  };
}

function getConnectionIdsBetweenRooms(doc: MapDocument, sourceRoomId: string, targetRoomId: string): string[] {
  return Object.values(doc.connections)
    .filter((connection) => (
      connection.target.kind === 'room'
      && (
        (connection.sourceRoomId === sourceRoomId && connection.target.id === targetRoomId)
        || (connection.sourceRoomId === targetRoomId && connection.target.id === sourceRoomId)
      )
    ))
    .map((connection) => connection.id);
}

function getConnectionIdsBetweenRoomsFromSourceDirection(
  doc: MapDocument,
  sourceRoomId: string,
  sourceDirection: string,
  targetRoomId: string,
): string[] {
  const sourceRoom = doc.rooms[sourceRoomId];
  if (!sourceRoom) {
    return [];
  }

  const connectionId = sourceRoom.directions[normalizeDirection(sourceDirection)];
  if (!connectionId) {
    return [];
  }

  return getConnectionIdsBetweenRooms(doc, sourceRoomId, targetRoomId).filter((candidateId) => candidateId === connectionId);
}

function getRoomNavigationTarget(doc: MapDocument, room: Room, direction: string): Room | null {
  const connectionId = room.directions[direction];
  if (!connectionId) {
    return null;
  }

  const connection = doc.connections[connectionId];
  if (!connection) {
    return null;
  }

  if (connection.sourceRoomId === room.id) {
    if (connection.target.kind !== 'room') {
      return null;
    }

    return doc.rooms[connection.target.id] ?? null;
  }

  if (connection.isBidirectional && connection.target.kind === 'room' && connection.target.id === room.id) {
    return doc.rooms[connection.sourceRoomId] ?? null;
  }

  return null;
}

function createSnapshot(state: CliSessionState): CliSessionSnapshot {
  return {
    doc: state.doc,
    pronounRoomId: state.pronounRoomId,
    selectedRoomIds: state.selectedRoomIds,
    selectedPseudoRoomIds: state.selectedPseudoRoomIds,
    selectedStickyNoteIds: state.selectedStickyNoteIds,
    selectedConnectionIds: state.selectedConnectionIds,
    selectedStickyNoteLinkIds: state.selectedStickyNoteLinkIds,
  };
}

function applyCliConnection(
  doc: MapDocument,
  sourceRoomId: string,
  sourceDirection: string,
  targetRoomId: string,
  options: {
    readonly oneWay: boolean;
    readonly targetDirection: string | null;
  },
): { readonly doc: MapDocument; readonly connectionId: string } {
  const normalizedSourceDirection = normalizeDirection(sourceDirection);
  const normalizedTargetDirection = options.targetDirection === null ? null : normalizeDirection(options.targetDirection);
  const existingConnectionIds = new Set<string>();

  const sourceRoom = doc.rooms[sourceRoomId];
  if (!sourceRoom) {
    throw new Error(`Room "${sourceRoomId}" not found.`);
  }

  const sourceExistingConnectionId = sourceRoom.directions[normalizedSourceDirection];
  if (sourceExistingConnectionId) {
    existingConnectionIds.add(sourceExistingConnectionId);
  }

  if (!options.oneWay && normalizedTargetDirection !== null) {
    const targetRoom = doc.rooms[targetRoomId];
    if (!targetRoom) {
      throw new Error(`Room "${targetRoomId}" not found.`);
    }

    const targetExistingConnectionId = targetRoom.directions[normalizedTargetDirection];
    if (targetExistingConnectionId) {
      existingConnectionIds.add(targetExistingConnectionId);
    }
  }

  let nextDoc = doc;
  for (const connectionId of existingConnectionIds) {
    nextDoc = deleteConnection(nextDoc, connectionId);
  }

  const connection = createConnection(sourceRoomId, targetRoomId, !options.oneWay);
  nextDoc = addConnection(
    nextDoc,
    connection,
    normalizedSourceDirection,
    options.oneWay ? undefined : (normalizedTargetDirection ?? undefined),
  );

  return { doc: nextDoc, connectionId: connection.id };
}

function pushUndoState(state: CliSessionState): CliSessionState {
  return {
    ...state,
    undoStack: [...state.undoStack, createSnapshot(state)],
    redoStack: [],
  };
}

function updateStateDoc(
  state: CliSessionState,
  nextDoc: MapDocument,
  options?: {
    readonly pronounRoomId?: string | null;
    readonly selectedRoomIds?: readonly string[];
    readonly selectedPseudoRoomIds?: readonly string[];
    readonly selectedStickyNoteIds?: readonly string[];
    readonly selectedConnectionIds?: readonly string[];
    readonly selectedStickyNoteLinkIds?: readonly string[];
  },
): CliSessionState {
  return {
    ...state,
    doc: nextDoc,
    pronounRoomId: options?.pronounRoomId ?? state.pronounRoomId,
    selectedRoomIds: options?.selectedRoomIds ?? state.selectedRoomIds,
    selectedPseudoRoomIds: options?.selectedPseudoRoomIds ?? state.selectedPseudoRoomIds,
    selectedStickyNoteIds: options?.selectedStickyNoteIds ?? state.selectedStickyNoteIds,
    selectedConnectionIds: options?.selectedConnectionIds ?? state.selectedConnectionIds,
    selectedStickyNoteLinkIds: options?.selectedStickyNoteLinkIds ?? state.selectedStickyNoteLinkIds,
  };
}

function resolveOneRoom(
  doc: MapDocument,
  requestedName: string,
  exactOrPronounRoomId: boolean | string | null,
  pronounRoomId?: string | null,
): string {
  const exact = typeof exactOrPronounRoomId === 'boolean' ? exactOrPronounRoomId : false;
  const resolvedPronounRoomId = typeof exactOrPronounRoomId === 'boolean'
    ? (pronounRoomId ?? null)
    : exactOrPronounRoomId;
  const match = resolveRoomByCliReference(doc, requestedName, exact, resolvedPronounRoomId);
  if (match.kind === 'pronoun-unbound') {
    throw new Error('The script referenced "it" before any room was established.');
  }
  if (match.kind === 'none') {
    throw new Error(`Could not find room "${requestedName}".`);
  }
  if (match.kind === 'multiple') {
    throw new Error(`Room reference "${requestedName}" is ambiguous.`);
  }
  return match.room.id;
}

function applyRoomAdjective(doc: MapDocument, roomId: string, adjective: CliRoomAdjective | null): MapDocument {
  if (adjective === null) {
    return doc;
  }

  switch (adjective.kind) {
    case 'lighting':
      return setRoomDark(doc, roomId, adjective.isDark);
    default:
      return doc;
  }
}

export function createCliSessionState(mapName = 'CLI Session'): CliSessionState {
  return {
    doc: createEmptyMap(mapName),
    pronounRoomId: null,
    selectedRoomIds: [],
    selectedPseudoRoomIds: [],
    selectedStickyNoteIds: [],
    selectedConnectionIds: [],
    selectedStickyNoteLinkIds: [],
    undoStack: [],
    redoStack: [],
  };
}

export function clearCliSessionState(state: CliSessionState): CliSessionState {
  const clearedDoc = createEmptyMap(state.doc.metadata.name);
  return {
    doc: {
      ...clearedDoc,
      metadata: {
        ...clearedDoc.metadata,
        name: state.doc.metadata.name,
      },
    },
    pronounRoomId: null,
    selectedRoomIds: [],
    selectedPseudoRoomIds: [],
    selectedStickyNoteIds: [],
    selectedConnectionIds: [],
    selectedStickyNoteLinkIds: [],
    undoStack: [],
    redoStack: [],
  };
}

export function runCliSessionCommand(
  inputState: CliSessionState,
  commandText: string,
  options?: CliSessionCommandOptions,
): CliSessionState {
  const command = parseCliCommand(commandText.trim());
  if (command === null) {
    throw new Error(`Could not parse command "${commandText}".`);
  }

  const viewportSize = options?.viewportSize ?? DEFAULT_VIEWPORT_SIZE;
  const panOffset = options?.panOffset ?? DEFAULT_PAN_OFFSET;

  const applyPseudoRoomExit = (
    doc: CliSessionState['doc'],
    sourceRoomId: string,
    sourceDirection: string,
    pseudoKind: Parameters<typeof createPseudoRoom>[0],
  ): { readonly nextDoc: CliSessionState['doc']; readonly connectionId: string } => {
    const normalizedSourceDirection = normalizeDirection(sourceDirection);
    const sourceRoom = doc.rooms[sourceRoomId];
    if (!sourceRoom) {
      throw new Error(`Room "${sourceRoomId}" not found.`);
    }

    const existingConnectionId = sourceRoom.directions[normalizedSourceDirection];
    if (existingConnectionId) {
      const existingConnection = doc.connections[existingConnectionId];
      if (existingConnection?.target.kind === 'pseudo-room') {
        return {
          nextDoc: setPseudoRoomKind(doc, existingConnection.target.id, pseudoKind),
          connectionId: existingConnection.id,
        };
      }
    }

    let nextDoc = doc;
    if (existingConnectionId) {
      nextDoc = deleteConnection(nextDoc, existingConnectionId);
    }

    const pseudoRoom = {
      ...createPseudoRoom(pseudoKind),
      position: getCliPseudoRoomPlacement(nextDoc, sourceRoomId, normalizedSourceDirection),
    };
    const connection = createConnection(sourceRoomId, { kind: 'pseudo-room', id: pseudoRoom.id }, false);
    nextDoc = addPseudoRoom(nextDoc, pseudoRoom);
    nextDoc = addConnection(nextDoc, connection, normalizedSourceDirection);
    return {
      nextDoc,
      connectionId: connection.id,
    };
  };

  switch (command.kind) {
    case 'create': {
      const state = pushUndoState(inputState);
      const plan = planCreateRoomFromCli(state.doc, command.roomName, viewportSize, panOffset);
      const room = {
        ...createRoom(plan.roomName),
        position: plan.position,
      };
      let nextDoc = addRoom(state.doc, room);

      if (command.adjective !== null) {
        nextDoc = applyRoomAdjective(nextDoc, room.id, command.adjective);
      }

      return updateStateDoc(state, nextDoc, {
        pronounRoomId: room.id,
        selectedRoomIds: [room.id],
        selectedPseudoRoomIds: [],
        selectedStickyNoteIds: [],
        selectedConnectionIds: [],
        selectedStickyNoteLinkIds: [],
      });
    }

    case 'arrange': {
      const state = pushUndoState(inputState);
      const transientLockedRoomIds = new Set<string>();
      const { roomPositions, pseudoRoomPositions, stickyNotePositions } = computePrettifiedLayoutPositions(state.doc, transientLockedRoomIds);
      let nextDoc = setRoomPositions(state.doc, roomPositions);
      nextDoc = setPseudoRoomPositions(nextDoc, pseudoRoomPositions);
      nextDoc = setStickyNotePositions(nextDoc, stickyNotePositions);
      return updateStateDoc(state, nextDoc);
    }

    case 'show': {
      const roomId = resolveOneRoom(inputState.doc, command.room.text, command.room.exact, inputState.pronounRoomId);
      return updateStateDoc(inputState, inputState.doc, {
        pronounRoomId: roomId,
        selectedRoomIds: [roomId],
        selectedPseudoRoomIds: [],
        selectedStickyNoteIds: [],
        selectedConnectionIds: [],
        selectedStickyNoteLinkIds: [],
      });
    }

    case 'navigate': {
      if (inputState.selectedRoomIds.length !== 1) {
        throw new Error('Select exactly one room to navigate from.');
      }

      const sourceRoom = inputState.doc.rooms[inputState.selectedRoomIds[0] ?? ''];
      if (!sourceRoom) {
        throw new Error('Select exactly one room to navigate from.');
      }

      const targetRoom = getRoomNavigationTarget(inputState.doc, sourceRoom, command.direction);
      if (targetRoom === null) {
        throw new Error(`You can't go ${command.direction} from ${sourceRoom.name}.`);
      }

      return updateStateDoc(inputState, inputState.doc, {
        pronounRoomId: targetRoom.id,
        selectedRoomIds: [targetRoom.id],
        selectedPseudoRoomIds: [],
        selectedStickyNoteIds: [],
        selectedConnectionIds: [],
        selectedStickyNoteLinkIds: [],
      });
    }

    case 'put-items': {
      const state = pushUndoState(inputState);
      const roomId = resolveOneRoom(state.doc, command.room.text, command.room.exact, state.pronounRoomId);
      let nextDoc = state.doc;
      for (const itemName of command.itemNames) {
        nextDoc = addItem(nextDoc, createItem(itemName, roomId));
      }

      return updateStateDoc(state, nextDoc, {
        pronounRoomId: roomId,
        selectedRoomIds: [roomId],
      });
    }

    case 'take-items': {
      const state = pushUndoState(inputState);
      const roomId = resolveOneRoom(state.doc, command.room.text, command.room.exact, state.pronounRoomId);
      const removal = findMatchingItemIdsInRoom(state.doc, roomId, command.itemNames);
      if (removal.missingItemNames.length > 0) {
        throw new Error(`Could not find ${removal.missingItemNames.join(', ')} in ${state.doc.rooms[roomId]?.name ?? 'that room'}.`);
      }

      let nextDoc = state.doc;
      for (const itemId of removal.removedItemIds) {
        nextDoc = deleteItem(nextDoc, itemId);
      }

      return updateStateDoc(state, nextDoc, {
        pronounRoomId: roomId,
        selectedRoomIds: [roomId],
      });
    }

    case 'take-all-items': {
      const state = pushUndoState(inputState);
      const roomId = resolveOneRoom(state.doc, command.room.text, command.room.exact, state.pronounRoomId);
      let nextDoc = state.doc;
      for (const item of Object.values(state.doc.items).filter((candidate) => candidate.roomId === roomId)) {
        nextDoc = deleteItem(nextDoc, item.id);
      }

      return updateStateDoc(state, nextDoc, {
        pronounRoomId: roomId,
        selectedRoomIds: [roomId],
      });
    }

    case 'create-pseudo-room': {
      const state = pushUndoState(inputState);
      const sourceRoomId = command.sourceRoom === null
        ? (() => {
          if (state.selectedRoomIds.length !== 1) {
            throw new Error('Select exactly one room to set an exit on.');
          }
          return state.selectedRoomIds[0]!;
        })()
        : resolveOneRoom(state.doc, command.sourceRoom.text, command.sourceRoom.exact, state.pronounRoomId);
      const result = applyPseudoRoomExit(state.doc, sourceRoomId, command.sourceDirection, command.pseudoKind);
      const nextDoc = prettifyCliPseudoRoomResult(result.nextDoc);
      return updateStateDoc(state, nextDoc, {
        pronounRoomId: sourceRoomId,
        selectedRoomIds: [sourceRoomId],
        selectedPseudoRoomIds: [],
        selectedStickyNoteIds: [],
        selectedConnectionIds: [result.connectionId],
        selectedStickyNoteLinkIds: [],
      });
    }

    case 'create-pseudo-rooms': {
      const state = pushUndoState(inputState);
      const sourceRoomId = command.sourceRoom === null
        ? (() => {
          if (state.selectedRoomIds.length !== 1) {
            throw new Error('Select exactly one room to set exits on.');
          }
          return state.selectedRoomIds[0]!;
        })()
        : resolveOneRoom(state.doc, command.sourceRoom.text, command.sourceRoom.exact, state.pronounRoomId);
      let nextDoc = state.doc;
      const connectionIds: string[] = [];
      for (const sourceDirection of command.sourceDirections) {
        const result = applyPseudoRoomExit(nextDoc, sourceRoomId, sourceDirection, command.pseudoKind);
        nextDoc = result.nextDoc;
        connectionIds.push(result.connectionId);
      }

      nextDoc = prettifyCliPseudoRoomResult(nextDoc);
      return updateStateDoc(state, nextDoc, {
        pronounRoomId: sourceRoomId,
        selectedRoomIds: [sourceRoomId],
        selectedPseudoRoomIds: [],
        selectedStickyNoteIds: [],
        selectedConnectionIds: connectionIds,
        selectedStickyNoteLinkIds: [],
      });
    }

    case 'delete': {
      const state = pushUndoState(inputState);
      const roomId = resolveOneRoom(state.doc, command.room.text, command.room.exact, state.pronounRoomId);
      const nextDoc = deleteRoom(state.doc, roomId);
      return updateStateDoc(state, nextDoc, {
        pronounRoomId: state.pronounRoomId === roomId ? null : state.pronounRoomId,
        selectedRoomIds: state.selectedRoomIds.filter((id) => id !== roomId),
        selectedConnectionIds: state.selectedConnectionIds.filter((id) => nextDoc.connections[id]),
        selectedStickyNoteLinkIds: state.selectedStickyNoteLinkIds.filter((id) => nextDoc.stickyNoteLinks[id]),
      });
    }

    case 'describe': {
      if (command.room === null) {
        if (inputState.selectedRoomIds.length !== 1) {
          throw new Error('You must select exactly one room to describe.');
        }
        describeRoomForCliLines(inputState.doc, inputState.selectedRoomIds[0]!);
        return inputState;
      }
      const roomId = resolveOneRoom(inputState.doc, command.room.text, command.room.exact, inputState.pronounRoomId);
      describeRoomForCliLines(inputState.doc, roomId);
      return inputState;
    }

    case 'set-room-adjective': {
      const state = pushUndoState(inputState);
      const roomId = resolveOneRoom(state.doc, command.room.text, command.room.exact, state.pronounRoomId);
      const nextDoc = applyRoomAdjective(state.doc, roomId, command.adjective);
      return updateStateDoc(state, nextDoc, {
        pronounRoomId: roomId,
      });
    }

    case 'selected-room-relative-connect': {
      const state = pushUndoState(inputState);
      const sourceRoomId = command.sourceRoom !== null
        ? resolveOneRoom(state.doc, command.sourceRoom.text, command.sourceRoom.exact, state.pronounRoomId)
        : (() => {
          if (state.selectedRoomIds.length !== 1) {
            throw new Error('Select exactly one room to connect from.');
          }
          return state.selectedRoomIds[0]!;
        })();
      const targetMatchId = (() => {
        const match = resolveRoomByCliReference(state.doc, command.targetRoom.text, command.targetRoom.exact, state.pronounRoomId);
        if (match.kind === 'pronoun-unbound') {
          throw new Error('The script referenced "it" before any room was established.');
        }
        if (match.kind === 'multiple') {
          throw new Error(`Room reference "${command.targetRoom.text}" is ambiguous.`);
        }
        return match.kind === 'one' ? match.room.id : null;
      })();
      // IMPORTANT: For grammar like "west of Carnival is Foobar", the direction names the exit
      // on the SOURCE room. The TARGET room must therefore use the OPPOSITE direction ("east"),
      // not the same direction ("west"). We have gotten this wrong before by accidentally reusing
      // the source direction on both rooms, which flips the connection semantics.
      //
      // If you are touching this code in the future, keep this rule in mind:
      //   "<dir> of <source> is <target>" means:
      //   - source uses <dir>
      //   - target uses opposite(<dir>)
      //
      // Reusing <dir> on the target room is a bug.
      const targetDirection = oppositeDirection(normalizeDirection(command.sourceDirection)) ?? null;

      if (targetMatchId !== null) {
        const connectionResult = applyCliConnection(
          state.doc,
          sourceRoomId,
          command.sourceDirection,
          targetMatchId,
          {
            oneWay: false,
            targetDirection,
          },
        );
        let nextDoc = sourceRoomId === targetMatchId
          ? connectionResult.doc
          : prettifyCliConnectionResult(connectionResult.doc, [sourceRoomId, targetMatchId]);
        if (command.adjective !== null) {
          nextDoc = applyRoomAdjective(nextDoc, targetMatchId, command.adjective);
        }
        return updateStateDoc(state, nextDoc, {
          pronounRoomId: isCliPronounReference(command.targetRoom.text) ? state.pronounRoomId : sourceRoomId,
          selectedRoomIds: [targetMatchId],
          selectedConnectionIds: [connectionResult.connectionId],
          selectedStickyNoteIds: [],
          selectedStickyNoteLinkIds: [],
        });
      }

      const plan = planCreateRoomFromCli(state.doc, command.targetRoom.text, viewportSize, panOffset);
      let nextDoc = addRoom(state.doc, {
        ...createRoom(plan.roomName),
        position: plan.position,
      });
      const createdRoomId = Object.keys(nextDoc.rooms).find((roomId) => nextDoc.rooms[roomId]?.name === plan.roomName && !state.doc.rooms[roomId]) ?? null;
      if (createdRoomId === null) {
        throw new Error('Failed to create room.');
      }
      const connectionResult = applyCliConnection(
        nextDoc,
        sourceRoomId,
        command.sourceDirection,
        createdRoomId,
        {
          oneWay: false,
          targetDirection,
        },
      );
      nextDoc = sourceRoomId === createdRoomId
        ? connectionResult.doc
        : prettifyCliConnectionResult(connectionResult.doc, [sourceRoomId, createdRoomId]);
      if (command.adjective !== null) {
        nextDoc = applyRoomAdjective(nextDoc, createdRoomId, command.adjective);
      }
      return updateStateDoc(state, nextDoc, {
        pronounRoomId: sourceRoomId,
        selectedRoomIds: [createdRoomId],
        selectedConnectionIds: [connectionResult.connectionId],
        selectedStickyNoteIds: [],
        selectedStickyNoteLinkIds: [],
      });
    }

    case 'set-connection-annotation': {
      const state = pushUndoState(inputState);
      const sourceRoomId = resolveOneRoom(state.doc, command.sourceRoom.text, command.sourceRoom.exact, state.pronounRoomId);
      const targetRoomId = resolveOneRoom(state.doc, command.targetRoom.text, command.targetRoom.exact, state.pronounRoomId);
      const connectionIds = getConnectionIdsBetweenRooms(state.doc, sourceRoomId, targetRoomId);
      if (connectionIds.length === 0) {
        throw new Error('There are no connections between those rooms.');
      }

      let nextDoc = state.doc;
      for (const connectionId of connectionIds) {
        nextDoc = setConnectionAnnotation(nextDoc, connectionId, command.annotation === null ? null : { kind: command.annotation });
      }

      return updateStateDoc(state, nextDoc, {
        pronounRoomId: isCliPronounReference(command.targetRoom.text) ? state.pronounRoomId : sourceRoomId,
      });
    }

    case 'notate': {
      const state = pushUndoState(inputState);
      const roomId = command.room === null
        ? (() => {
          if (state.selectedRoomIds.length !== 1) {
            throw new Error('You must select exactly one room to annotate.');
          }
          return state.selectedRoomIds[0]!;
        })()
        : resolveOneRoom(state.doc, command.room.text, command.room.exact, state.pronounRoomId);
      const stickyNote = {
        ...createStickyNote(command.noteText),
        position: getStickyNotePlacementForRoom(state.doc, roomId, command.noteText),
      };
      let nextDoc = addStickyNote(state.doc, stickyNote);
      nextDoc = addStickyNoteLink(nextDoc, createStickyNoteLink(stickyNote.id, roomId));
      nextDoc = prettifyCliStickyNoteResult(nextDoc);
      return updateStateDoc(state, nextDoc, {
        pronounRoomId: roomId,
        selectedRoomIds: [],
        selectedStickyNoteIds: [stickyNote.id],
        selectedConnectionIds: [],
        selectedStickyNoteLinkIds: [],
      });
    }

    case 'connect': {
      const state = pushUndoState(inputState);
      const sourceRoomId = resolveOneRoom(state.doc, command.sourceRoom.text, command.sourceRoom.exact, state.pronounRoomId);
      const targetRoomId = resolveOneRoom(state.doc, command.targetRoom.text, command.targetRoom.exact, state.pronounRoomId);
      const connectionResult = applyCliConnection(
        state.doc,
        sourceRoomId,
        command.sourceDirection,
        targetRoomId,
        {
          oneWay: command.oneWay,
          targetDirection: command.targetDirection,
        },
      );
      const nextDoc = sourceRoomId === targetRoomId
        ? connectionResult.doc
        : prettifyCliConnectionResult(connectionResult.doc, [sourceRoomId, targetRoomId]);
      const nextPronounRoomId = isCliPronounReference(command.targetRoom.text) ? state.pronounRoomId : sourceRoomId;
      return updateStateDoc(state, nextDoc, {
        pronounRoomId: nextPronounRoomId,
        selectedRoomIds: [targetRoomId],
        selectedConnectionIds: [connectionResult.connectionId],
        selectedStickyNoteIds: [],
        selectedStickyNoteLinkIds: [],
      });
    }

    case 'create-and-connect': {
      const state = pushUndoState(inputState);
      const targetRoomId = resolveOneRoom(state.doc, command.targetRoom.text, command.targetRoom.exact, state.pronounRoomId);
      const plan = planCreateRoomFromCli(state.doc, command.sourceRoomName, viewportSize, panOffset);
      const room = {
        ...createRoom(plan.roomName),
        position: plan.position,
      };
      let nextDoc = addRoom(state.doc, room);

      const connectionResult = applyCliConnection(
        nextDoc,
        room.id,
        command.sourceDirection,
        targetRoomId,
        {
          oneWay: command.oneWay,
          targetDirection: command.targetDirection,
        },
      );
      nextDoc = room.id === targetRoomId
        ? connectionResult.doc
        : prettifyCliConnectionResult(connectionResult.doc, [room.id, targetRoomId]);

      if (command.adjective !== null) {
        nextDoc = applyRoomAdjective(nextDoc, room.id, command.adjective);
      }

      const nextPronounRoomId = isCliPronounReference(command.targetRoom.text) ? state.pronounRoomId : room.id;
      return updateStateDoc(state, nextDoc, {
        pronounRoomId: nextPronounRoomId,
        selectedRoomIds: [room.id, targetRoomId],
        selectedConnectionIds: [connectionResult.connectionId],
        selectedStickyNoteIds: [],
        selectedStickyNoteLinkIds: [],
      });
    }

    case 'disconnect': {
      const state = pushUndoState(inputState);
      const sourceRoomId = resolveOneRoom(state.doc, command.sourceRoom.text, command.sourceRoom.exact, state.pronounRoomId);
      const targetRoomId = resolveOneRoom(state.doc, command.targetRoom.text, command.targetRoom.exact, state.pronounRoomId);
      const sourceRoom = state.doc.rooms[sourceRoomId];
      const connectionIds = Object.values(state.doc.connections)
        .filter((connection) => {
          if (connection.target.kind !== 'room') {
            return false;
          }

          if (command.sourceDirection !== null) {
            return (
              connection.sourceRoomId === sourceRoomId
              && connection.target.id === targetRoomId
              && sourceRoom?.directions[normalizeDirection(command.sourceDirection)] === connection.id
            );
          }

          return (
            (connection.sourceRoomId === sourceRoomId && connection.target.id === targetRoomId)
            || (connection.sourceRoomId === targetRoomId && connection.target.id === sourceRoomId)
          );
        })
        .map((connection) => connection.id);

      if (connectionIds.length === 0) {
        throw new Error(`No matching connection exists between "${command.sourceRoom.text}" and "${command.targetRoom.text}".`);
      }

      if (connectionIds.length > 1) {
        throw new Error(`Multiple matching connections exist between "${command.sourceRoom.text}" and "${command.targetRoom.text}".`);
      }

      const nextDoc = deleteConnection(state.doc, connectionIds[0]!);
      const nextPronounRoomId = isCliPronounReference(command.targetRoom.text) ? state.pronounRoomId : sourceRoomId;
      return updateStateDoc(state, nextDoc, {
        pronounRoomId: nextPronounRoomId,
        selectedRoomIds: [sourceRoomId],
        selectedConnectionIds: [],
      });
    }

    case 'undo': {
      const previousSnapshot = inputState.undoStack.at(-1);
      if (!previousSnapshot) {
        throw new Error('Nothing to undo.');
      }

      return {
        ...inputState,
        ...previousSnapshot,
        undoStack: inputState.undoStack.slice(0, -1),
        redoStack: [...inputState.redoStack, createSnapshot(inputState)],
      };
    }

    case 'redo': {
      const nextSnapshot = inputState.redoStack.at(-1);
      if (!nextSnapshot) {
        throw new Error('Nothing to redo.');
      }

      return {
        ...inputState,
        ...nextSnapshot,
        undoStack: [...inputState.undoStack, createSnapshot(inputState)],
        redoStack: inputState.redoStack.slice(0, -1),
      };
    }

    default:
      throw new Error(`Script runner does not support "${command.kind}" yet.`);
  }
}
