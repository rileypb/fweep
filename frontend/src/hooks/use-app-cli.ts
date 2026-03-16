import { useEffect, useRef, useState } from 'react';
import {
  parseCliCommand,
  parseCliCommandDescription,
  type CliRoomAdjective,
  type CliCommand,
} from '../domain/cli-command';
import { getCliHelpOverviewLines, getCliHelpTopicLines } from '../domain/cli-help';
import { parseCliScript } from '../domain/cli-script';
import {
  createAmbiguousRoomCliError,
  createParseCliError,
  createUnboundPronounCliError,
  createUnknownRoomCliError,
  type CliError,
} from '../domain/cli-errors';
import { isCliPronounReference, planCreateRoomFromCli, resolveRoomByCliReference } from '../domain/cli-execution';
import { DEFAULT_CLI_OUTPUT_LINES, type MapDocument } from '../domain/map-types';
import { useEditorStore } from '../state/editor-store';
import { saveMap } from '../storage/map-store';

export interface RoomUiRequest {
  readonly roomId: string;
  readonly requestId: number;
}

export interface ViewportFocusRequest {
  readonly roomIds: readonly string[];
  readonly requestId: number;
}

interface UseAppCliOptions {
  readonly activeMap: MapDocument | null;
  readonly loadDocument: (doc: MapDocument) => void;
  readonly unloadDocument: () => void;
  readonly requestedRoomEditorRequest: RoomUiRequest | null;
  readonly requestedRoomRevealRequest: RoomUiRequest | null;
  readonly requestedViewportFocusRequest: ViewportFocusRequest | null;
  readonly setRequestedRoomEditorRequest: (request: RoomUiRequest | null) => void;
  readonly setRequestedRoomRevealRequest: (request: RoomUiRequest | null) => void;
  readonly setRequestedViewportFocusRequest: (request: ViewportFocusRequest | null) => void;
}

interface UseAppCliResult {
  readonly cliInputRef: React.RefObject<HTMLInputElement | null>;
  readonly cliImportInputRef: React.RefObject<HTMLInputElement | null>;
  readonly gameOutputRef: React.RefObject<HTMLDivElement | null>;
  readonly cliCommand: string;
  readonly hasUsedCliInput: boolean;
  readonly cliHistory: readonly string[];
  readonly cliHistoryIndex: number | null;
  readonly cliHistoryDraft: string;
  readonly gameOutputLines: readonly string[];
  readonly isImportingScript: boolean;
  readonly handleCliSubmit: () => void;
  readonly handleCliCommandChange: (value: string) => void;
  readonly handleCliHistoryNavigate: (direction: 'up' | 'down') => void;
  readonly handleImportScriptChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  readonly handleGameOutputClick: () => void;
}

function formatCliError(error: CliError): string {
  return [error.message, error.detail, error.suggestion].filter((part): part is string => part !== null).join(' ');
}

function formatCliEcho(input: string): string {
  return `>${input}`;
}

function describeCliOutcome(command: CliCommand): string {
  switch (command.kind) {
    case 'help':
      return 'Listed available commands.';
    case 'arrange':
      return 'Arranged.';
    case 'create':
      return 'Created.';
    case 'put-items':
      return 'Placed.';
    case 'take-items':
      return 'Took.';
    case 'take-all-items':
      return 'Took.';
    case 'create-pseudo-room':
      if (command.pseudoKind === 'unknown') {
        return 'Marked exit as unknown.';
      }
      if (command.pseudoKind === 'infinite') {
        return 'Marked exit as going on forever.';
      }
      if (command.pseudoKind === 'death') {
        return 'Marked exit as death.';
      }
      return 'Marked exit as leading nowhere.';
    case 'delete':
      return 'Deleted.';
    case 'edit':
      return 'Edited.';
    case 'notate':
      return 'Notated.';
    case 'show':
      return 'Shown.';
    case 'set-room-adjective':
      return `Marked as ${command.adjective.text}.`;
    case 'connect':
      return 'Connected.';
    case 'create-and-connect':
      return 'Created and connected.';
    case 'undo':
      return 'Undone.';
    case 'redo':
      return 'Redone.';
  }
}

function isTextEditingElement(element: EventTarget | null): boolean {
  if (!(element instanceof HTMLElement)) {
    return false;
  }

  if (element.isContentEditable) {
    return true;
  }

  if (element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) {
    return true;
  }

  if (element instanceof HTMLInputElement) {
    const nonTextInputTypes = new Set([
      'button',
      'checkbox',
      'color',
      'file',
      'hidden',
      'image',
      'radio',
      'range',
      'reset',
      'submit',
    ]);
    return !nonTextInputTypes.has(element.type);
  }

  return false;
}

async function readTextFile(file: File): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text();
  }

  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => {
      reject(reader.error ?? new Error(`Unable to read "${file.name}".`));
    };
    reader.onload = () => {
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.readAsText(file);
  });
}

export function useAppCli({
  activeMap,
  loadDocument,
  unloadDocument,
  requestedRoomEditorRequest,
  requestedRoomRevealRequest,
  requestedViewportFocusRequest,
  setRequestedRoomEditorRequest,
  setRequestedRoomRevealRequest,
  setRequestedViewportFocusRequest,
}: UseAppCliOptions): UseAppCliResult {
  const addRoomAtPosition = useEditorStore((s) => s.addRoomAtPosition);
  const addItemsToRoom = useEditorStore((s) => s.addItemsToRoom);
  const addStickyNoteForRoom = useEditorStore((s) => s.addStickyNoteForRoom);
  const connectRooms = useEditorStore((s) => s.connectRooms);
  const createRoomAndConnect = useEditorStore((s) => s.createRoomAndConnect);
  const setPseudoRoomExit = useEditorStore((s) => s.setPseudoRoomExit);
  const prettifyLayout = useEditorStore((s) => s.prettifyLayout);
  const redo = useEditorStore((s) => s.redo);
  const removeAllItemsFromRoom = useEditorStore((s) => s.removeAllItemsFromRoom);
  const removeItemsFromRoom = useEditorStore((s) => s.removeItemsFromRoom);
  const removeRoom = useEditorStore((s) => s.removeRoom);
  const setRoomDark = useEditorStore((s) => s.setRoomDark);
  const selectRoom = useEditorStore((s) => s.selectRoom);
  const storeDoc = useEditorStore((s) => s.doc);
  const undo = useEditorStore((s) => s.undo);
  const pendingInitialSaveSkipDocRef = useRef<object | null>(null);
  const pendingInitialGameOutputSkipRef = useRef<readonly string[] | null>(null);
  const cliInputRef = useRef<HTMLInputElement | null>(null);
  const cliImportInputRef = useRef<HTMLInputElement | null>(null);
  const gameOutputRef = useRef<HTMLDivElement | null>(null);
  const [cliCommand, setCliCommand] = useState('');
  const [cliHistory, setCliHistory] = useState<string[]>([]);
  const [cliHistoryIndex, setCliHistoryIndex] = useState<number | null>(null);
  const [cliHistoryDraft, setCliHistoryDraft] = useState('');
  const [hasUsedCliInput, setHasUsedCliInput] = useState(false);
  const [gameOutputLines, setGameOutputLines] = useState<string[]>([]);
  const [_cliPronounRoomId, setCliPronounRoomId] = useState<string | null>(null);
  const [isImportingScript, setIsImportingScript] = useState(false);
  const cliPronounRoomIdRef = useRef<string | null>(null);
  const nextUiRequestIdRef = useRef(1);
  const latestGameOutputLinesRef = useRef<readonly string[]>([]);
  const latestStoreDocRef = useRef<MapDocument | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const hasOpenMap = activeMap !== null;

  const focusCliInput = () => {
    cliInputRef.current?.focus();
    cliInputRef.current?.select();
  };

  const scrollGameOutputToEnd = () => {
    if (gameOutputRef.current === null) {
      return;
    }

    gameOutputRef.current.scrollTop = gameOutputRef.current.scrollHeight;
  };

  useEffect(() => {
    latestGameOutputLinesRef.current = gameOutputLines;
  }, [gameOutputLines]);

  useEffect(() => {
    latestStoreDocRef.current = storeDoc;
  }, [storeDoc]);

  const queueSave = (doc: MapDocument) => {
    const snapshot = {
      ...doc,
      cliOutputLines: [...latestGameOutputLinesRef.current],
    };

    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        await saveMap(snapshot);
      });
  };

  useEffect(() => {
    if (activeMap) {
      cliPronounRoomIdRef.current = null;
      setCliPronounRoomId(null);
      pendingInitialSaveSkipDocRef.current = activeMap;
      pendingInitialGameOutputSkipRef.current = activeMap.cliOutputLines;
      setGameOutputLines(
        activeMap.cliOutputLines.length > 0
          ? [...activeMap.cliOutputLines]
          : [...DEFAULT_CLI_OUTPUT_LINES],
      );
      loadDocument(activeMap);
    } else {
      cliPronounRoomIdRef.current = null;
      setCliPronounRoomId(null);
      pendingInitialSaveSkipDocRef.current = null;
      pendingInitialGameOutputSkipRef.current = null;
      setGameOutputLines([]);
      unloadDocument();
    }
  }, [activeMap, loadDocument, unloadDocument]);

  useEffect(() => {
    const unsubscribe = useEditorStore.subscribe((state, previousState) => {
      if (state.doc === previousState.doc || state.doc === null) {
        return;
      }

      latestStoreDocRef.current = state.doc;

      if (pendingInitialSaveSkipDocRef.current === state.doc) {
        pendingInitialSaveSkipDocRef.current = null;
        return;
      }

      pendingInitialSaveSkipDocRef.current = null;
      queueSave(state.doc);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    const currentDoc = latestStoreDocRef.current;
    if (!currentDoc) {
      return;
    }

    if (pendingInitialGameOutputSkipRef.current !== null) {
      if (pendingInitialGameOutputSkipRef.current.length === gameOutputLines.length
        && pendingInitialGameOutputSkipRef.current.every((line, index) => line === gameOutputLines[index])) {
        pendingInitialGameOutputSkipRef.current = null;
        return;
      }
      pendingInitialGameOutputSkipRef.current = null;
    }

    queueSave(currentDoc);
  }, [gameOutputLines]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/') {
        return;
      }

      if (event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      if (isTextEditingElement(event.target)) {
        return;
      }

      event.preventDefault();
      focusCliInput();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      scrollGameOutputToEnd();
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [gameOutputLines, hasOpenMap]);

  const appendGameOutput = (lines: readonly string[]) => {
    setGameOutputLines((previousLines) => [...previousLines, ...lines, '']);
  };

  const setCliPronounRoomReference = (roomId: string | null) => {
    cliPronounRoomIdRef.current = roomId;
    setCliPronounRoomId(roomId);
  };

  const reportCliError = (submittedInput: string, error: CliError) => {
    appendGameOutput([formatCliEcho(submittedInput), formatCliError(error)]);
    cliInputRef.current?.select();
  };

  const issueUiRequestId = (): number => {
    const requestId = nextUiRequestIdRef.current;
    nextUiRequestIdRef.current += 1;
    return requestId;
  };

  const applyCliRoomAdjective = (roomId: string, adjective: CliRoomAdjective): void => {
    switch (adjective.kind) {
      case 'lighting':
        setRoomDark(roomId, adjective.isDark);
        return;
    }
  };

  const reportRoomReferenceError = (
    submittedInput: string,
    roomMatch: ReturnType<typeof resolveRoomByCliReference>,
    commandKind: 'delete' | 'edit' | 'show' | 'notate' | 'connect' | 'create-and-connect' | 'set-room-adjective' | 'put-items' | 'take-items' | 'take-all-items',
    roomName: string,
  ): boolean => {
    if (roomMatch.kind === 'pronoun-unbound') {
      reportCliError(submittedInput, createUnboundPronounCliError());
      return true;
    }

    if (roomMatch.kind === 'none') {
      reportCliError(submittedInput, createUnknownRoomCliError(roomName));
      return true;
    }

    if (roomMatch.kind === 'multiple') {
      reportCliError(
        submittedInput,
        createAmbiguousRoomCliError(
          commandKind,
          roomName,
          roomMatch.rooms.map((room) => room.name),
        ),
      );
      return true;
    }

    return false;
  };

  const runCliCommand = (submittedInput: string): { ok: boolean; shouldSelectCliInput: boolean } => {
    let shouldSelectCliInput = true;
    const trimmedInput = submittedInput.trim();
    const liveEditorState = useEditorStore.getState();
    const currentDoc = liveEditorState.doc;
    const currentMapPanOffset = liveEditorState.mapPanOffset;
    const currentCanUndo = liveEditorState.canUndo;
    const currentCanRedo = liveEditorState.canRedo;
    const currentPronounRoomId = cliPronounRoomIdRef.current;

    const command = parseCliCommand(trimmedInput);
    if (command === null) {
      reportCliError(trimmedInput, createParseCliError());
      return { ok: false, shouldSelectCliInput };
    }

    if (command.kind === 'help') {
      appendGameOutput([
        formatCliEcho(trimmedInput),
        ...(command.topic === null ? getCliHelpOverviewLines() : getCliHelpTopicLines(command.topic)),
      ]);
      return { ok: true, shouldSelectCliInput };
    }

    if (command.kind === 'arrange' && currentDoc !== null) {
      prettifyLayout();
      appendGameOutput([formatCliEcho(trimmedInput), describeCliOutcome(command)]);
      return { ok: true, shouldSelectCliInput };
    }

    if (command.kind === 'create' && currentDoc !== null) {
      const plan = planCreateRoomFromCli(
        currentDoc,
        command.roomName,
        { width: window.innerWidth, height: window.innerHeight },
        currentMapPanOffset,
      );
      const roomId = addRoomAtPosition(plan.roomName, plan.position);
      if (command.adjective !== null) {
        applyCliRoomAdjective(roomId, command.adjective);
      }
      setCliPronounRoomReference(roomId);
      selectRoom(roomId);
      setRequestedViewportFocusRequest({
        roomIds: [roomId],
        requestId: issueUiRequestId(),
      });
      appendGameOutput([formatCliEcho(trimmedInput), describeCliOutcome(command)]);
      return { ok: true, shouldSelectCliInput };
    }

    if (command.kind === 'put-items' && currentDoc !== null) {
      const roomMatch = resolveRoomByCliReference(currentDoc, command.room.text, command.room.exact, currentPronounRoomId);
      if (reportRoomReferenceError(trimmedInput, roomMatch, 'put-items', command.room.text)) {
        return { ok: false, shouldSelectCliInput };
      }
      if (roomMatch.kind !== 'one') {
        return { ok: false, shouldSelectCliInput };
      }

      addItemsToRoom(roomMatch.room.id, command.itemNames);
      setCliPronounRoomReference(roomMatch.room.id);
      selectRoom(roomMatch.room.id);
      appendGameOutput([formatCliEcho(trimmedInput), describeCliOutcome(command)]);
      return { ok: true, shouldSelectCliInput };
    }

    if (command.kind === 'take-items' && currentDoc !== null) {
      const roomMatch = resolveRoomByCliReference(currentDoc, command.room.text, command.room.exact, currentPronounRoomId);
      if (reportRoomReferenceError(trimmedInput, roomMatch, 'take-items', command.room.text)) {
        return { ok: false, shouldSelectCliInput };
      }
      if (roomMatch.kind !== 'one') {
        return { ok: false, shouldSelectCliInput };
      }

      const removal = removeItemsFromRoom(roomMatch.room.id, command.itemNames);
      if (removal.missingItemNames.length > 0) {
        appendGameOutput([
          formatCliEcho(trimmedInput),
          `Could not find ${removal.missingItemNames.join(', ')} in ${roomMatch.room.name}.`,
        ]);
        return { ok: false, shouldSelectCliInput };
      }

      setCliPronounRoomReference(roomMatch.room.id);
      selectRoom(roomMatch.room.id);
      appendGameOutput([formatCliEcho(trimmedInput), describeCliOutcome(command)]);
      return { ok: true, shouldSelectCliInput };
    }

    if (command.kind === 'take-all-items' && currentDoc !== null) {
      const roomMatch = resolveRoomByCliReference(currentDoc, command.room.text, command.room.exact, currentPronounRoomId);
      if (reportRoomReferenceError(trimmedInput, roomMatch, 'take-all-items', command.room.text)) {
        return { ok: false, shouldSelectCliInput };
      }
      if (roomMatch.kind !== 'one') {
        return { ok: false, shouldSelectCliInput };
      }

      removeAllItemsFromRoom(roomMatch.room.id);
      setCliPronounRoomReference(roomMatch.room.id);
      selectRoom(roomMatch.room.id);
      appendGameOutput([formatCliEcho(trimmedInput), describeCliOutcome(command)]);
      return { ok: true, shouldSelectCliInput };
    }

    if (command.kind === 'create-pseudo-room' && currentDoc !== null) {
      const sourceRoomMatch = resolveRoomByCliReference(
        currentDoc,
        command.sourceRoom.text,
        command.sourceRoom.exact,
        currentPronounRoomId,
      );
      if (reportRoomReferenceError(trimmedInput, sourceRoomMatch, 'connect', command.sourceRoom.text)) {
        return { ok: false, shouldSelectCliInput };
      }
      if (sourceRoomMatch.kind !== 'one') {
        return { ok: false, shouldSelectCliInput };
      }

      setPseudoRoomExit(sourceRoomMatch.room.id, command.sourceDirection, command.pseudoKind);
      setCliPronounRoomReference(sourceRoomMatch.room.id);
      setRequestedRoomRevealRequest({
        roomId: sourceRoomMatch.room.id,
        requestId: issueUiRequestId(),
      });
      appendGameOutput([formatCliEcho(trimmedInput), describeCliOutcome(command)]);
      return { ok: true, shouldSelectCliInput };
    }

    if (command.kind === 'delete' && currentDoc !== null) {
      const roomMatch = resolveRoomByCliReference(currentDoc, command.room.text, command.room.exact, currentPronounRoomId);
      if (reportRoomReferenceError(trimmedInput, roomMatch, 'delete', command.room.text)) {
        return { ok: false, shouldSelectCliInput };
      }
      if (roomMatch.kind !== 'one') {
        return { ok: false, shouldSelectCliInput };
      }
      removeRoom(roomMatch.room.id);
      setCliPronounRoomReference(currentPronounRoomId === roomMatch.room.id ? null : currentPronounRoomId);
      appendGameOutput([formatCliEcho(trimmedInput), describeCliOutcome(command)]);
      return { ok: true, shouldSelectCliInput };
    }

    if (command.kind === 'edit' && currentDoc !== null) {
      const roomMatch = resolveRoomByCliReference(currentDoc, command.room.text, command.room.exact, currentPronounRoomId);
      if (reportRoomReferenceError(trimmedInput, roomMatch, 'edit', command.room.text)) {
        return { ok: false, shouldSelectCliInput };
      }
      if (roomMatch.kind !== 'one') {
        return { ok: false, shouldSelectCliInput };
      }
      selectRoom(roomMatch.room.id);
      setCliPronounRoomReference(roomMatch.room.id);
      setRequestedRoomEditorRequest({
        roomId: roomMatch.room.id,
        requestId: issueUiRequestId(),
      });
      appendGameOutput([formatCliEcho(trimmedInput), describeCliOutcome(command)]);
      shouldSelectCliInput = false;
      return { ok: true, shouldSelectCliInput };
    }

    if (command.kind === 'show' && currentDoc !== null) {
      const roomMatch = resolveRoomByCliReference(currentDoc, command.room.text, command.room.exact, currentPronounRoomId);
      if (reportRoomReferenceError(trimmedInput, roomMatch, 'show', command.room.text)) {
        return { ok: false, shouldSelectCliInput };
      }
      if (roomMatch.kind !== 'one') {
        return { ok: false, shouldSelectCliInput };
      }
      selectRoom(roomMatch.room.id);
      setCliPronounRoomReference(roomMatch.room.id);
      setRequestedRoomRevealRequest({
        roomId: roomMatch.room.id,
        requestId: issueUiRequestId(),
      });
      appendGameOutput([formatCliEcho(trimmedInput), `**${roomMatch.room.name}**`]);
      return { ok: true, shouldSelectCliInput };
    }

    if (command.kind === 'set-room-adjective' && currentDoc !== null) {
      const roomMatch = resolveRoomByCliReference(currentDoc, command.room.text, command.room.exact, currentPronounRoomId);
      if (reportRoomReferenceError(trimmedInput, roomMatch, 'set-room-adjective', command.room.text)) {
        return { ok: false, shouldSelectCliInput };
      }
      if (roomMatch.kind !== 'one') {
        return { ok: false, shouldSelectCliInput };
      }
      applyCliRoomAdjective(roomMatch.room.id, command.adjective);
      setCliPronounRoomReference(roomMatch.room.id);
      appendGameOutput([formatCliEcho(trimmedInput), describeCliOutcome(command)]);
      return { ok: true, shouldSelectCliInput };
    }

    if (command.kind === 'notate' && currentDoc !== null) {
      const roomMatch = resolveRoomByCliReference(currentDoc, command.room.text, command.room.exact, currentPronounRoomId);
      if (reportRoomReferenceError(trimmedInput, roomMatch, 'notate', command.room.text)) {
        return { ok: false, shouldSelectCliInput };
      }
      if (roomMatch.kind !== 'one') {
        return { ok: false, shouldSelectCliInput };
      }
      addStickyNoteForRoom(roomMatch.room.id, command.noteText);
      setCliPronounRoomReference(roomMatch.room.id);
      appendGameOutput([formatCliEcho(trimmedInput), describeCliOutcome(command)]);
      return { ok: true, shouldSelectCliInput };
    }

    if (command.kind === 'connect' && currentDoc !== null) {
      const sourceRoomMatch = resolveRoomByCliReference(currentDoc, command.sourceRoom.text, command.sourceRoom.exact, currentPronounRoomId);
      if (reportRoomReferenceError(trimmedInput, sourceRoomMatch, 'connect', command.sourceRoom.text)) {
        return { ok: false, shouldSelectCliInput };
      }
      if (sourceRoomMatch.kind !== 'one') {
        return { ok: false, shouldSelectCliInput };
      }

      const targetRoomMatch = resolveRoomByCliReference(currentDoc, command.targetRoom.text, command.targetRoom.exact, currentPronounRoomId);
      if (reportRoomReferenceError(trimmedInput, targetRoomMatch, 'connect', command.targetRoom.text)) {
        return { ok: false, shouldSelectCliInput };
      }
      if (targetRoomMatch.kind !== 'one') {
        return { ok: false, shouldSelectCliInput };
      }

      connectRooms(
        sourceRoomMatch.room.id,
        command.sourceDirection,
        targetRoomMatch.room.id,
        {
          oneWay: command.oneWay,
          targetDirection: command.targetDirection,
        },
      );
      if (!isCliPronounReference(command.targetRoom.text)) {
        setCliPronounRoomReference(sourceRoomMatch.room.id);
      }
      appendGameOutput([formatCliEcho(trimmedInput), describeCliOutcome(command)]);
      return { ok: true, shouldSelectCliInput };
    }

    if (command.kind === 'create-and-connect' && currentDoc !== null) {
      const targetRoomMatch = resolveRoomByCliReference(currentDoc, command.targetRoom.text, command.targetRoom.exact, currentPronounRoomId);
      if (reportRoomReferenceError(trimmedInput, targetRoomMatch, 'create-and-connect', command.targetRoom.text)) {
        return { ok: false, shouldSelectCliInput };
      }
      if (targetRoomMatch.kind !== 'one') {
        return { ok: false, shouldSelectCliInput };
      }

      const plan = planCreateRoomFromCli(
        currentDoc,
        command.sourceRoomName,
        { width: window.innerWidth, height: window.innerHeight },
        currentMapPanOffset,
      );
      const result = createRoomAndConnect(
        plan.roomName,
        plan.position,
        targetRoomMatch.room.id,
        {
          sourceDirection: command.sourceDirection,
          oneWay: command.oneWay,
          targetDirection: command.targetDirection,
        },
      );
      if (command.adjective !== null) {
        applyCliRoomAdjective(result.roomId, command.adjective);
      }
      if (!isCliPronounReference(command.targetRoom.text)) {
        setCliPronounRoomReference(result.roomId);
      }
      setRequestedViewportFocusRequest({
        roomIds: [result.roomId, targetRoomMatch.room.id],
        requestId: issueUiRequestId(),
      });
      appendGameOutput([formatCliEcho(trimmedInput), describeCliOutcome(command)]);
      return { ok: true, shouldSelectCliInput };
    }

    if (command.kind === 'undo') {
      if (!currentCanUndo) {
        appendGameOutput([formatCliEcho(trimmedInput), 'Nothing to undo.']);
        cliInputRef.current?.select();
        return { ok: false, shouldSelectCliInput };
      }
      void undo();
      appendGameOutput([formatCliEcho(trimmedInput), describeCliOutcome(command)]);
      return { ok: true, shouldSelectCliInput };
    }

    if (command.kind === 'redo') {
      if (!currentCanRedo) {
        appendGameOutput([formatCliEcho(trimmedInput), 'Nothing to redo.']);
        cliInputRef.current?.select();
        return { ok: false, shouldSelectCliInput };
      }
      void redo();
      appendGameOutput([formatCliEcho(trimmedInput), describeCliOutcome(command)]);
      return { ok: true, shouldSelectCliInput };
    }

    const description = parseCliCommandDescription(trimmedInput);
    if (description === null) {
      reportCliError(trimmedInput, createParseCliError());
      return { ok: false, shouldSelectCliInput };
    }
    appendGameOutput([formatCliEcho(trimmedInput), description]);
    return { ok: true, shouldSelectCliInput };
  };

  const handleCliSubmit = () => {
    setHasUsedCliInput(true);
    const submittedInput = cliCommand;
    if (submittedInput.trim().length > 0) {
      setCliHistory((previousHistory) => [...previousHistory, submittedInput]);
    }
    setCliHistoryIndex(null);
    setCliHistoryDraft('');
    setCliCommand('');

    const { shouldSelectCliInput } = runCliCommand(submittedInput);
    if (shouldSelectCliInput) {
      cliInputRef.current?.select();
    }
  };

  const handleCliCommandChange = (value: string) => {
    if (!hasUsedCliInput && value.trim().length > 0) {
      setHasUsedCliInput(true);
    }
    if (cliHistoryIndex !== null) {
      setCliHistoryIndex(null);
      setCliHistoryDraft(value);
    }
    setCliCommand(value);
  };

  const handleCliHistoryNavigate = (direction: 'up' | 'down') => {
    if (cliHistory.length === 0) {
      return;
    }

    if (direction === 'up') {
      if (cliHistoryIndex === null) {
        setCliHistoryDraft(cliCommand);
        const nextIndex = cliHistory.length - 1;
        setCliHistoryIndex(nextIndex);
        setCliCommand(cliHistory[nextIndex]);
        return;
      }

      const nextIndex = Math.max(cliHistoryIndex - 1, 0);
      setCliHistoryIndex(nextIndex);
      setCliCommand(cliHistory[nextIndex]);
      return;
    }

    if (cliHistoryIndex === null) {
      return;
    }

    if (cliHistoryIndex >= cliHistory.length - 1) {
      setCliHistoryIndex(null);
      setCliCommand(cliHistoryDraft);
      return;
    }

    const nextIndex = cliHistoryIndex + 1;
    setCliHistoryIndex(nextIndex);
    setCliCommand(cliHistory[nextIndex]);
  };

  const handleImportScriptChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setIsImportingScript(true);
    try {
      const scriptText = await readTextFile(file);
      const commands = parseCliScript(scriptText);

      if (commands.length === 0) {
        appendGameOutput([`No commands found in "${file.name}".`]);
        cliInputRef.current?.select();
        return;
      }

      const importSnapshot = {
        editorState: useEditorStore.getState(),
        cliPronounRoomId: cliPronounRoomIdRef.current,
        requestedRoomEditorRequest,
        requestedRoomRevealRequest,
        requestedViewportFocusRequest,
        nextUiRequestId: nextUiRequestIdRef.current,
      };

      let successfulCommands = 0;
      for (const command of commands) {
        const result = runCliCommand(command.commandText);
        if (!result.ok) {
          useEditorStore.setState(importSnapshot.editorState, true);
          setCliPronounRoomReference(importSnapshot.cliPronounRoomId);
          setRequestedRoomEditorRequest(importSnapshot.requestedRoomEditorRequest);
          setRequestedRoomRevealRequest(importSnapshot.requestedRoomRevealRequest);
          setRequestedViewportFocusRequest(importSnapshot.requestedViewportFocusRequest);
          nextUiRequestIdRef.current = importSnapshot.nextUiRequestId;
          appendGameOutput([
            `Import aborted on line ${command.lineNumber}. Rolled back ${successfulCommands} successful command${successfulCommands === 1 ? '' : 's'}.`,
          ]);
          cliInputRef.current?.select();
          return;
        }
        successfulCommands += 1;
      }

      appendGameOutput([
        `Imported ${successfulCommands} command${successfulCommands === 1 ? '' : 's'} from "${file.name}".`,
      ]);
      cliInputRef.current?.select();
    } catch (error: unknown) {
      appendGameOutput([
        `Unable to import "${file.name}": ${error instanceof Error ? error.message : String(error)}`,
      ]);
      cliInputRef.current?.select();
    } finally {
      event.target.value = '';
      setIsImportingScript(false);
    }
  };

  return {
    cliInputRef,
    cliImportInputRef,
    gameOutputRef,
    cliCommand,
    hasUsedCliInput,
    cliHistory,
    cliHistoryIndex,
    cliHistoryDraft,
    gameOutputLines,
    isImportingScript,
    handleCliSubmit,
    handleCliCommandChange,
    handleCliHistoryNavigate,
    handleImportScriptChange,
    handleGameOutputClick: focusCliInput,
  };
}
