import { parseCliCommand, type CliRoomAdjective } from './cli-command';
import { planCreateRoomFromCli, resolveRoomByCliReference, isCliPronounReference } from './cli-execution';
import { normalizeDirection } from './directions';
import { computePrettifiedLayoutPositions } from '../graph/prettify-layout';
import { addConnection, addRoom, deleteConnection, setRoomDark, setRoomPositions } from './map-operations';
import { createConnection, createEmptyMap, createRoom, type MapDocument, type Position } from './map-types';

export type HelpImageScriptStep =
  | { readonly kind: 'clear'; readonly lineNumber: number }
  | { readonly kind: 'map-command'; readonly lineNumber: number; readonly commandText: string }
  | { readonly kind: 'export'; readonly lineNumber: number; readonly fileName: string };

export interface HelpImageScriptState {
  readonly doc: MapDocument;
  readonly pronounRoomId: string | null;
  readonly undoStack: readonly MapDocument[];
  readonly redoStack: readonly MapDocument[];
}

export interface HelpImageScriptCommandOptions {
  readonly viewportSize?: { readonly width: number; readonly height: number };
  readonly panOffset?: Position;
}

const DEFAULT_VIEWPORT_SIZE = { width: 800, height: 600 } as const;
const DEFAULT_PAN_OFFSET = { x: 0, y: 0 } as const;

function prettifyCliConnectionResult(doc: MapDocument, movableRoomIds: readonly string[]): MapDocument {
  const movableSet = new Set(movableRoomIds);
  const transientLockedRoomIds = new Set(
    Object.keys(doc.rooms).filter((roomId) => !movableSet.has(roomId)),
  );
  const { roomPositions } = computePrettifiedLayoutPositions(doc, transientLockedRoomIds);
  return setRoomPositions(doc, roomPositions);
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

function pushUndoState(state: HelpImageScriptState): HelpImageScriptState {
  return {
    ...state,
    undoStack: [...state.undoStack, state.doc],
    redoStack: [],
  };
}

function updateStateDoc(
  state: HelpImageScriptState,
  nextDoc: MapDocument,
  pronounRoomId: string | null = state.pronounRoomId,
): HelpImageScriptState {
  return {
    ...state,
    doc: nextDoc,
    pronounRoomId,
  };
}

function resolveOneRoom(doc: MapDocument, requestedName: string, pronounRoomId: string | null): string {
  const match = resolveRoomByCliReference(doc, requestedName, false, pronounRoomId);
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

export function parseHelpImageScript(scriptText: string): readonly HelpImageScriptStep[] {
  return scriptText
    .split(/\r?\n/)
    .map((rawLine, index) => ({
      lineNumber: index + 1,
      line: rawLine.trim(),
    }))
    .filter((entry) => entry.line.length > 0)
    .map<HelpImageScriptStep>((entry) => {
      if (entry.line === 'clear') {
        return {
          kind: 'clear',
          lineNumber: entry.lineNumber,
        };
      }

      const exportMatch = entry.line.match(/^export\s+(.+)$/i);
      if (exportMatch) {
        return {
          kind: 'export',
          lineNumber: entry.lineNumber,
          fileName: exportMatch[1]!.trim(),
        };
      }

      return {
        kind: 'map-command',
        lineNumber: entry.lineNumber,
        commandText: entry.line,
      };
    });
}

export function createHelpImageScriptState(mapName = 'Help Images'): HelpImageScriptState {
  return {
    doc: createEmptyMap(mapName),
    pronounRoomId: null,
    undoStack: [],
    redoStack: [],
  };
}

export function clearHelpImageScriptState(state: HelpImageScriptState): HelpImageScriptState {
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
    undoStack: [],
    redoStack: [],
  };
}

export function runHelpImageMapCommand(
  inputState: HelpImageScriptState,
  commandText: string,
  options?: HelpImageScriptCommandOptions,
): HelpImageScriptState {
  const command = parseCliCommand(commandText.trim());
  if (command === null) {
    throw new Error(`Could not parse command "${commandText}".`);
  }

  const viewportSize = options?.viewportSize ?? DEFAULT_VIEWPORT_SIZE;
  const panOffset = options?.panOffset ?? DEFAULT_PAN_OFFSET;

  switch (command.kind) {
    case 'create': {
      const state = pushUndoState(inputState);
      const plan = planCreateRoomFromCli(state.doc, command.roomName, viewportSize, panOffset);
      let nextDoc = addRoom(state.doc, {
        ...createRoom(plan.roomName),
        position: plan.position,
      });
      const roomId = Object.keys(nextDoc.rooms).at(-1) ?? null;
      if (roomId === null) {
        throw new Error('Failed to create room.');
      }

      if (command.adjective !== null) {
        nextDoc = applyRoomAdjective(nextDoc, roomId, command.adjective);
      }

      return updateStateDoc(state, nextDoc, roomId);
    }

    case 'connect': {
      const state = pushUndoState(inputState);
      const sourceRoomId = resolveOneRoom(state.doc, command.sourceRoom.text, state.pronounRoomId);
      const targetRoomId = resolveOneRoom(state.doc, command.targetRoom.text, state.pronounRoomId);
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
      return updateStateDoc(state, nextDoc, nextPronounRoomId);
    }

    case 'create-and-connect': {
      const state = pushUndoState(inputState);
      const targetRoomId = resolveOneRoom(state.doc, command.targetRoom.text, state.pronounRoomId);
      const plan = planCreateRoomFromCli(state.doc, command.sourceRoomName, viewportSize, panOffset);
      let nextDoc = addRoom(state.doc, {
        ...createRoom(plan.roomName),
        position: plan.position,
      });
      const createdRoomId = Object.keys(nextDoc.rooms).at(-1) ?? null;
      if (createdRoomId === null) {
        throw new Error('Failed to create room.');
      }

      const connectionResult = applyCliConnection(
        nextDoc,
        createdRoomId,
        command.sourceDirection,
        targetRoomId,
        {
          oneWay: command.oneWay,
          targetDirection: command.targetDirection,
        },
      );
      nextDoc = createdRoomId === targetRoomId
        ? connectionResult.doc
        : prettifyCliConnectionResult(connectionResult.doc, [createdRoomId, targetRoomId]);

      if (command.adjective !== null) {
        nextDoc = applyRoomAdjective(nextDoc, createdRoomId, command.adjective);
      }

      const nextPronounRoomId = isCliPronounReference(command.targetRoom.text) ? state.pronounRoomId : createdRoomId;
      return updateStateDoc(state, nextDoc, nextPronounRoomId);
    }

    case 'disconnect': {
      const state = pushUndoState(inputState);
      const sourceRoomId = resolveOneRoom(state.doc, command.sourceRoom.text, state.pronounRoomId);
      const targetRoomId = resolveOneRoom(state.doc, command.targetRoom.text, state.pronounRoomId);
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
      return updateStateDoc(state, nextDoc, nextPronounRoomId);
    }

    case 'undo': {
      const previousDoc = inputState.undoStack.at(-1);
      if (!previousDoc) {
        throw new Error('Nothing to undo.');
      }

      return {
        ...inputState,
        doc: previousDoc,
        undoStack: inputState.undoStack.slice(0, -1),
        redoStack: [...inputState.redoStack, inputState.doc],
      };
    }

    case 'redo': {
      const nextDoc = inputState.redoStack.at(-1);
      if (!nextDoc) {
        throw new Error('Nothing to redo.');
      }

      return {
        ...inputState,
        doc: nextDoc,
        undoStack: [...inputState.undoStack, inputState.doc],
        redoStack: inputState.redoStack.slice(0, -1),
      };
    }

    default:
      throw new Error(`Script runner does not support "${command.kind}" yet.`);
  }
}
