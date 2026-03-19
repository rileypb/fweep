import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  parseCliCommand,
  parseCliCommandDescription,
  type CliRoomAdjective,
  type CliCommand,
} from '../domain/cli-command';
import { getCliSuggestions, type CliSuggestion } from '../domain/cli-suggestions';
import { getCliHelpOverviewLines, getCliHelpTopicLines } from '../domain/cli-help';
import { parseCliScript } from '../domain/cli-script';
import { describeRoomForCliLines } from '../domain/cli-room-description';
import {
  createAmbiguousRoomCliError,
  createParseCliError,
  createUnboundPronounCliError,
  createUnknownRoomCliError,
  type CliError,
} from '../domain/cli-errors';
import { isCliPronounReference, planCreateRoomFromCli, resolveRoomByCliReference } from '../domain/cli-execution';
import { DEFAULT_CLI_OUTPUT_LINES, type MapDocument, type Room } from '../domain/map-types';
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
  readonly cliSuggestions: readonly CliSuggestion[];
  readonly highlightedCliSuggestionIndex: number;
  readonly isCliSuggestionMenuOpen: boolean;
  readonly gameOutputLines: readonly string[];
  readonly isImportingScript: boolean;
  readonly handleCliSubmit: () => void;
  readonly handleCliCommandChange: (value: string) => void;
  readonly handleCliInputFocus: () => void;
  readonly handleCliInputBlur: () => void;
  readonly handleCliCaretChange: (caretIndex: number | null) => void;
  readonly toggleCliSuggestions: () => void;
  readonly consumeCliSlashFocusSuppression: () => boolean;
  readonly handleCliHistoryNavigate: (direction: 'up' | 'down') => void;
  readonly moveCliSuggestionHighlight: (direction: 'up' | 'down') => void;
  readonly setCliSuggestionHighlight: (index: number) => void;
  readonly applyHighlightedCliSuggestion: () => boolean;
  readonly closeCliSuggestions: () => void;
  readonly handleImportScriptChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  readonly handleGameOutputClick: () => void;
}

function formatCliError(error: CliError): string {
  return [error.message, error.detail, error.suggestion].filter((part): part is string => part !== null).join(' ');
}

function formatCliEcho(input: string): string {
  return `>${input}`;
}

function hasPersistedCliUsage(cliOutputLines: readonly string[]): boolean {
  if (cliOutputLines.length <= DEFAULT_CLI_OUTPUT_LINES.length) {
    return false;
  }

  return true;
}

function getCliOutputStorageKey(mapId: string): string {
  return `fweep-cli-output:${mapId}`;
}

function loadCachedCliOutputLines(mapId: string): readonly string[] | null {
  try {
    const rawValue = window.localStorage.getItem(getCliOutputStorageKey(mapId));
    if (rawValue === null) {
      return null;
    }

    const parsed = JSON.parse(rawValue);
    if (!Array.isArray(parsed) || !parsed.every((line) => typeof line === 'string')) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

function saveCachedCliOutputLines(mapId: string, cliOutputLines: readonly string[]): void {
  try {
    window.localStorage.setItem(getCliOutputStorageKey(mapId), JSON.stringify(cliOutputLines));
  } catch {
    // Ignore localStorage failures and fall back to IndexedDB persistence.
  }
}

const FWEEP_EASTER_EGG_LINES = [
  'With keen disappointment, you note that nothing has changed. Then, you slowly realize that you are black, have two wing-like appendages, and are flying a few feet above the ground. Thanks to your sonar-like bat senses, you can tell that there are surfaces above you, below you, to the south and to the east.',
] as const;

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

function getConnectionIdsBetweenRooms(doc: MapDocument, sourceRoomId: string, targetRoomId: string): string[] {
  return Object.values(doc.connections)
    .filter((connection) => {
      if (connection.target.kind !== 'room') {
        return false;
      }

      return (
        (connection.sourceRoomId === sourceRoomId && connection.target.id === targetRoomId)
        || (connection.sourceRoomId === targetRoomId && connection.target.id === sourceRoomId)
      );
    })
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

  const connectionId = sourceRoom.directions[sourceDirection];
  if (!connectionId) {
    return [];
  }

  return getConnectionIdsBetweenRooms(doc, sourceRoomId, targetRoomId).filter((candidateId) => candidateId === connectionId);
}

function scrollCliInputSelectionIntoView(input: HTMLInputElement): void {
  const selectionStart = input.selectionStart;
  const selectionEnd = input.selectionEnd;
  if (selectionStart === null || selectionEnd === null) {
    return;
  }

  if (selectionStart === 0 && selectionEnd === input.value.length) {
    input.scrollLeft = 0;
    return;
  }

  if (selectionStart === selectionEnd) {
    input.scrollLeft = input.scrollWidth;
  }
}

function describeCliOutcome(command: CliCommand): string {
  switch (command.kind) {
    case 'help':
      return 'Listed available commands.';
    case 'arrange':
      return 'Arranged.';
    case 'navigate':
      return 'Shown.';
    case 'create':
      return 'Created.';
    case 'put-items':
      return 'Dropped.';
    case 'take-items':
      return 'Taken.';
    case 'take-all-items':
      return 'Taken.';
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
    case 'describe':
      return 'Described.';
    case 'notate':
      return 'Notated.';
    case 'show':
      return 'Shown.';
    case 'set-room-adjective':
      return `Marked as ${command.adjective.text}.`;
    case 'set-connection-annotation':
      return command.annotation === null ? 'Cleared.' : 'Marked.';
    case 'connect':
      return 'Connected.';
    case 'disconnect':
      return 'Disconnected.';
    case 'create-and-connect':
      return 'Created and connected.';
    case 'undo':
      return 'Undone.';
    case 'redo':
      return 'Redone.';
  }
}

function intersperseBlankOutputLines(lines: readonly string[]): readonly string[] {
  if (lines.length <= 1) {
    return lines;
  }

  const output: string[] = [];
  for (const [index, line] of lines.entries()) {
    if (index > 0) {
      output.push('');
    }
    output.push(line);
  }
  return output;
}

function shouldKeepSuggestionsEnabledAfterSubmit(
  wereSuggestionsEnabled: boolean,
  submittedInput: string,
): boolean {
  if (!wereSuggestionsEnabled) {
    return false;
  }

  const command = parseCliCommand(submittedInput.trim());
  if (command?.kind === 'help' || command?.kind === 'describe') {
    return false;
  }

  return true;
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
  const deleteConnection = useEditorStore((s) => s.deleteConnection);
  const createRoomAndConnect = useEditorStore((s) => s.createRoomAndConnect);
  const setPseudoRoomExit = useEditorStore((s) => s.setPseudoRoomExit);
  const prettifyLayout = useEditorStore((s) => s.prettifyLayout);
  const redo = useEditorStore((s) => s.redo);
  const removeAllItemsFromRoom = useEditorStore((s) => s.removeAllItemsFromRoom);
  const removeItemsFromRoom = useEditorStore((s) => s.removeItemsFromRoom);
  const removeRoom = useEditorStore((s) => s.removeRoom);
  const setRoomDark = useEditorStore((s) => s.setRoomDark);
  const setConnectionAnnotations = useEditorStore((s) => s.setConnectionAnnotations);
  const selectRoom = useEditorStore((s) => s.selectRoom);
  const storeDoc = useEditorStore((s) => s.doc);
  const undo = useEditorStore((s) => s.undo);
  const shouldSkipNextDocumentSaveRef = useRef(false);
  const pendingInitialGameOutputSkipRef = useRef<readonly string[] | null>(null);
  const cliInputRef = useRef<HTMLInputElement | null>(null);
  const cliImportInputRef = useRef<HTMLInputElement | null>(null);
  const gameOutputRef = useRef<HTMLDivElement | null>(null);
  const [cliCommand, setCliCommand] = useState('');
  const [cliHistory, setCliHistory] = useState<string[]>([]);
  const [cliHistoryIndex, setCliHistoryIndex] = useState<number | null>(null);
  const [cliHistoryDraft, setCliHistoryDraft] = useState('');
  const [cliCaretIndex, setCliCaretIndex] = useState(0);
  const [hasUsedCliInput, setHasUsedCliInput] = useState(false);
  const [gameOutputLines, setGameOutputLines] = useState<string[]>([]);
  const [_cliPronounRoomId, setCliPronounRoomId] = useState<string | null>(null);
  const [isImportingScript, setIsImportingScript] = useState(false);
  const [isCliInputFocused, setIsCliInputFocused] = useState(false);
  const [areCliSuggestionsEnabled, setAreCliSuggestionsEnabled] = useState(false);
  const [highlightedCliSuggestionIndex, setHighlightedCliSuggestionIndex] = useState(0);
  const cliPronounRoomIdRef = useRef<string | null>(null);
  const nextUiRequestIdRef = useRef(1);
  const suppressNextCliSlashToggleRef = useRef(false);
  const latestGameOutputLinesRef = useRef<readonly string[]>([]);
  const latestStoreDocRef = useRef<MapDocument | null>(null);
  const latestActiveMapRef = useRef<MapDocument | null>(activeMap);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingSelectionRangeRef = useRef<{ start: number; end: number } | null>(null);
  latestGameOutputLinesRef.current = gameOutputLines;
  latestStoreDocRef.current = storeDoc;
  latestActiveMapRef.current = activeMap;
  const hasOpenMap = activeMap !== null;
  const cliSuggestionResult = getCliSuggestions(cliCommand, cliCaretIndex, storeDoc);
  const cliSuggestions = cliSuggestionResult?.suggestions ?? [];
  const isCliSuggestionMenuOpen = isCliInputFocused && cliHistoryIndex === null && areCliSuggestionsEnabled && cliSuggestions.length > 0;
  const highlightedCliSuggestion = isCliSuggestionMenuOpen
    ? cliSuggestions[Math.min(highlightedCliSuggestionIndex, cliSuggestions.length - 1)] ?? null
    : null;

  const focusCliInput = (openSuggestions = false) => {
    setAreCliSuggestionsEnabled(openSuggestions);
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
    if (pendingSelectionRangeRef.current === null || cliInputRef.current === null) {
      return;
    }

    const nextSelectionRange = pendingSelectionRangeRef.current;
    pendingSelectionRangeRef.current = null;
    cliInputRef.current.focus();
    cliInputRef.current.setSelectionRange(nextSelectionRange.start, nextSelectionRange.end);
    scrollCliInputSelectionIntoView(cliInputRef.current);
  }, [cliCommand]);

  useEffect(() => {
    setHighlightedCliSuggestionIndex(0);
  }, [cliCommand, storeDoc, cliCaretIndex]);

  const queueSaveSnapshot = (doc: MapDocument, cliOutputLines: readonly string[]) => {
    saveCachedCliOutputLines(doc.metadata.id, cliOutputLines);
    const snapshot = {
      ...doc,
      cliOutputLines: [...cliOutputLines],
    };

    saveQueueRef.current = saveQueueRef.current
      .catch(() => undefined)
      .then(async () => {
        await saveMap(snapshot);
      });
  };

  const queueSave = (doc: MapDocument) => {
    queueSaveSnapshot(doc, latestGameOutputLinesRef.current);
  };

  useLayoutEffect(() => {
    if (activeMap) {
      const cachedCliOutputLines = loadCachedCliOutputLines(activeMap.metadata.id);
      const restoredCliOutputLines = cachedCliOutputLines !== null && cachedCliOutputLines.length > activeMap.cliOutputLines.length
        ? cachedCliOutputLines
        : activeMap.cliOutputLines;
      cliPronounRoomIdRef.current = null;
      setCliPronounRoomId(null);
      setHasUsedCliInput(hasPersistedCliUsage(restoredCliOutputLines));
      shouldSkipNextDocumentSaveRef.current = true;
      pendingInitialGameOutputSkipRef.current = restoredCliOutputLines;
      setGameOutputLines(
        restoredCliOutputLines.length > 0
          ? [...restoredCliOutputLines]
          : [...DEFAULT_CLI_OUTPUT_LINES],
      );
      loadDocument(activeMap);

      if (restoredCliOutputLines !== activeMap.cliOutputLines) {
        latestGameOutputLinesRef.current = restoredCliOutputLines;
        queueSaveSnapshot(activeMap, restoredCliOutputLines);
      }
    } else {
      cliPronounRoomIdRef.current = null;
      setCliPronounRoomId(null);
      setHasUsedCliInput(false);
      shouldSkipNextDocumentSaveRef.current = false;
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

      if (shouldSkipNextDocumentSaveRef.current) {
        shouldSkipNextDocumentSaveRef.current = false;
        return;
      }

      queueSave(state.doc);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (gameOutputLines.length === 0) {
      return;
    }

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
      suppressNextCliSlashToggleRef.current = true;
      queueMicrotask(() => {
        suppressNextCliSlashToggleRef.current = false;
      });
      focusCliInput(false);
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
    let nextLines: readonly string[] = [];
    setGameOutputLines((previousLines) => {
      nextLines = [...previousLines, ...lines, ''];
      return [...nextLines];
    });
    latestGameOutputLinesRef.current = nextLines;
    const currentDoc = latestStoreDocRef.current ?? latestActiveMapRef.current;
    if (currentDoc !== null) {
      queueSaveSnapshot(currentDoc, nextLines);
    }
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

  const applyCliRoomAdjective = (
    roomId: string,
    adjective: CliRoomAdjective,
    historyMergeKey?: string,
  ): void => {
    switch (adjective.kind) {
      case 'lighting':
        setRoomDark(roomId, adjective.isDark, historyMergeKey === undefined ? undefined : { historyMergeKey });
        return;
    }
  };

  const reportRoomReferenceError = (
    submittedInput: string,
    roomMatch: ReturnType<typeof resolveRoomByCliReference>,
    commandKind: 'delete' | 'edit' | 'describe' | 'show' | 'notate' | 'connect' | 'disconnect' | 'create-and-connect' | 'set-room-adjective' | 'set-connection-annotation' | 'put-items' | 'take-items' | 'take-all-items',
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

    if (trimmedInput.toLowerCase() === 'fweep') {
      appendGameOutput([formatCliEcho(trimmedInput), ...FWEEP_EASTER_EGG_LINES]);
      return { ok: true, shouldSelectCliInput };
    }

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

    if (command.kind === 'navigate' && currentDoc !== null) {
      if (liveEditorState.selectedRoomIds.length !== 1) {
        appendGameOutput([formatCliEcho(trimmedInput), 'Select exactly one room to navigate from.']);
        return { ok: false, shouldSelectCliInput };
      }

      const sourceRoom = currentDoc.rooms[liveEditorState.selectedRoomIds[0]];
      if (!sourceRoom) {
        appendGameOutput([formatCliEcho(trimmedInput), 'Select exactly one room to navigate from.']);
        return { ok: false, shouldSelectCliInput };
      }

      const targetRoom = getRoomNavigationTarget(currentDoc, sourceRoom, command.direction);
      if (targetRoom === null) {
        appendGameOutput([formatCliEcho(trimmedInput), `You can't go ${command.direction} from ${sourceRoom.name}.`]);
        return { ok: false, shouldSelectCliInput };
      }

      selectRoom(targetRoom.id);
      setCliPronounRoomReference(targetRoom.id);
      setRequestedRoomRevealRequest({
        roomId: targetRoom.id,
        requestId: issueUiRequestId(),
      });
      appendGameOutput([formatCliEcho(trimmedInput), `**${targetRoom.name}**`]);
      return { ok: true, shouldSelectCliInput };
    }

    if (command.kind === 'create' && currentDoc !== null) {
      const historyMergeKey = `cli-create:${trimmedInput}`;
      const plan = planCreateRoomFromCli(
        currentDoc,
        command.roomName,
        { width: window.innerWidth, height: window.innerHeight },
        currentMapPanOffset,
      );
      const roomId = addRoomAtPosition(plan.roomName, plan.position, { historyMergeKey });
      if (command.adjective !== null) {
        applyCliRoomAdjective(roomId, command.adjective, historyMergeKey);
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

    if (command.kind === 'describe' && currentDoc !== null) {
      if (command.room === null) {
        if (liveEditorState.selectedRoomIds.length === 0) {
          appendGameOutput([
            formatCliEcho(trimmedInput),
            "You must select a room you want described. Use the 'show' command to select a room.",
          ]);
          return { ok: false, shouldSelectCliInput };
        }

        if (liveEditorState.selectedRoomIds.length > 1) {
          appendGameOutput([
            formatCliEcho(trimmedInput),
            "You must select only one room at a time. Use the 'show' command to select a room.",
          ]);
          return { ok: false, shouldSelectCliInput };
        }

        const selectedRoomId = liveEditorState.selectedRoomIds[0];
        const selectedRoom = currentDoc.rooms[selectedRoomId];
        if (!selectedRoom) {
          appendGameOutput([
            formatCliEcho(trimmedInput),
            "You must select a room you want described. Use the 'show' command to select a room.",
          ]);
          return { ok: false, shouldSelectCliInput };
        }

        appendGameOutput([
          formatCliEcho(trimmedInput),
          ...intersperseBlankOutputLines(describeRoomForCliLines(currentDoc, selectedRoom.id)),
        ]);
        return { ok: true, shouldSelectCliInput };
      }

      const roomMatch = resolveRoomByCliReference(currentDoc, command.room.text, command.room.exact, currentPronounRoomId);
      if (reportRoomReferenceError(trimmedInput, roomMatch, 'describe', command.room.text)) {
        return { ok: false, shouldSelectCliInput };
      }
      if (roomMatch.kind !== 'one') {
        return { ok: false, shouldSelectCliInput };
      }

      appendGameOutput([
        formatCliEcho(trimmedInput),
        ...intersperseBlankOutputLines(describeRoomForCliLines(currentDoc, roomMatch.room.id)),
      ]);
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

    if (command.kind === 'set-connection-annotation' && currentDoc !== null) {
      const sourceRoomMatch = resolveRoomByCliReference(currentDoc, command.sourceRoom.text, command.sourceRoom.exact, currentPronounRoomId);
      if (reportRoomReferenceError(trimmedInput, sourceRoomMatch, 'set-connection-annotation', command.sourceRoom.text)) {
        return { ok: false, shouldSelectCliInput };
      }
      if (sourceRoomMatch.kind !== 'one') {
        return { ok: false, shouldSelectCliInput };
      }

      const targetRoomMatch = resolveRoomByCliReference(currentDoc, command.targetRoom.text, command.targetRoom.exact, currentPronounRoomId);
      if (reportRoomReferenceError(trimmedInput, targetRoomMatch, 'set-connection-annotation', command.targetRoom.text)) {
        return { ok: false, shouldSelectCliInput };
      }
      if (targetRoomMatch.kind !== 'one') {
        return { ok: false, shouldSelectCliInput };
      }

      const connectionIds = getConnectionIdsBetweenRooms(currentDoc, sourceRoomMatch.room.id, targetRoomMatch.room.id);
      if (connectionIds.length === 0) {
        appendGameOutput([
          formatCliEcho(trimmedInput),
          `There are no connections between ${sourceRoomMatch.room.name} and ${targetRoomMatch.room.name}.`,
        ]);
        return { ok: false, shouldSelectCliInput };
      }

      setConnectionAnnotations(
        connectionIds,
        command.annotation === null ? null : { kind: command.annotation },
      );
      if (!isCliPronounReference(command.targetRoom.text)) {
        setCliPronounRoomReference(sourceRoomMatch.room.id);
      }
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

    if (command.kind === 'disconnect' && currentDoc !== null) {
      const sourceRoomMatch = resolveRoomByCliReference(currentDoc, command.sourceRoom.text, command.sourceRoom.exact, currentPronounRoomId);
      if (reportRoomReferenceError(trimmedInput, sourceRoomMatch, 'disconnect', command.sourceRoom.text)) {
        return { ok: false, shouldSelectCliInput };
      }
      if (sourceRoomMatch.kind !== 'one') {
        return { ok: false, shouldSelectCliInput };
      }

      const targetRoomMatch = resolveRoomByCliReference(currentDoc, command.targetRoom.text, command.targetRoom.exact, currentPronounRoomId);
      if (reportRoomReferenceError(trimmedInput, targetRoomMatch, 'disconnect', command.targetRoom.text)) {
        return { ok: false, shouldSelectCliInput };
      }
      if (targetRoomMatch.kind !== 'one') {
        return { ok: false, shouldSelectCliInput };
      }

      const connectionIds = command.sourceDirection === null
        ? getConnectionIdsBetweenRooms(currentDoc, sourceRoomMatch.room.id, targetRoomMatch.room.id)
        : getConnectionIdsBetweenRoomsFromSourceDirection(
          currentDoc,
          sourceRoomMatch.room.id,
          command.sourceDirection,
          targetRoomMatch.room.id,
        );

      if (connectionIds.length === 0) {
        appendGameOutput([
          formatCliEcho(trimmedInput),
          command.sourceDirection === null
            ? `There are no connections between ${sourceRoomMatch.room.name} and ${targetRoomMatch.room.name}.`
            : `There is no connection from ${sourceRoomMatch.room.name} going ${command.sourceDirection} to ${targetRoomMatch.room.name}.`,
        ]);
        return { ok: false, shouldSelectCliInput };
      }

      if (connectionIds.length > 1) {
        appendGameOutput([
          formatCliEcho(trimmedInput),
          `There are multiple connections between ${sourceRoomMatch.room.name} and ${targetRoomMatch.room.name}. Use "disconnect ${sourceRoomMatch.room.name} <direction> from ${targetRoomMatch.room.name}".`,
        ]);
        return { ok: false, shouldSelectCliInput };
      }

      deleteConnection(connectionIds[0]);
      if (!isCliPronounReference(command.targetRoom.text)) {
        setCliPronounRoomReference(sourceRoomMatch.room.id);
      }
      selectRoom(sourceRoomMatch.room.id);
      appendGameOutput([formatCliEcho(trimmedInput), describeCliOutcome(command)]);
      return { ok: true, shouldSelectCliInput };
    }

    if (command.kind === 'create-and-connect' && currentDoc !== null) {
      const historyMergeKey = `cli-create-and-connect:${trimmedInput}`;
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
          historyMergeKey,
        },
      );
      if (command.adjective !== null) {
        applyCliRoomAdjective(result.roomId, command.adjective, historyMergeKey);
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
    const submittedInput = cliCommand;
    const shouldKeepSuggestionsEnabled = shouldKeepSuggestionsEnabledAfterSubmit(
      areCliSuggestionsEnabled,
      submittedInput,
    );
    setHasUsedCliInput(true);
    if (submittedInput.trim().length > 0) {
      setCliHistory((previousHistory) => [...previousHistory, submittedInput]);
    }
    setCliHistoryIndex(null);
    setCliHistoryDraft('');
    setCliCommand('');
    setCliCaretIndex(0);
    setHighlightedCliSuggestionIndex(0);
    setAreCliSuggestionsEnabled(shouldKeepSuggestionsEnabled);

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

  const handleCliInputFocus = () => {
    setIsCliInputFocused(true);
    setCliCaretIndex(cliInputRef.current?.selectionStart ?? cliCommand.length);
  };

  const handleCliInputBlur = () => {
    setIsCliInputFocused(false);
    setAreCliSuggestionsEnabled(false);
    setHighlightedCliSuggestionIndex(0);
  };

  const toggleCliSuggestions = () => {
    setAreCliSuggestionsEnabled((current) => !current);
    setHighlightedCliSuggestionIndex(0);
  };

  const consumeCliSlashFocusSuppression = () => {
    if (!suppressNextCliSlashToggleRef.current) {
      return false;
    }

    suppressNextCliSlashToggleRef.current = false;
    return true;
  };

  const handleCliCaretChange = (caretIndex: number | null) => {
    setCliCaretIndex(caretIndex ?? cliCommand.length);
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
        setCliCaretIndex(cliHistory[nextIndex].length);
        return;
      }

      const nextIndex = Math.max(cliHistoryIndex - 1, 0);
      setCliHistoryIndex(nextIndex);
      setCliCommand(cliHistory[nextIndex]);
      setCliCaretIndex(cliHistory[nextIndex].length);
      return;
    }

    if (cliHistoryIndex === null) {
      return;
    }

    if (cliHistoryIndex >= cliHistory.length - 1) {
      setCliHistoryIndex(null);
      setCliCommand(cliHistoryDraft);
      setCliCaretIndex(cliHistoryDraft.length);
      return;
    }

    const nextIndex = cliHistoryIndex + 1;
    setCliHistoryIndex(nextIndex);
    setCliCommand(cliHistory[nextIndex]);
    setCliCaretIndex(cliHistory[nextIndex].length);
  };

  const closeCliSuggestions = () => {
    setAreCliSuggestionsEnabled(false);
    setHighlightedCliSuggestionIndex(0);
  };

  const moveCliSuggestionHighlight = (direction: 'up' | 'down') => {
    if (!isCliSuggestionMenuOpen || cliSuggestions.length === 0) {
      return;
    }

    setHighlightedCliSuggestionIndex((currentIndex) => {
      if (direction === 'up') {
        return currentIndex <= 0 ? cliSuggestions.length - 1 : currentIndex - 1;
      }

      return currentIndex >= cliSuggestions.length - 1 ? 0 : currentIndex + 1;
    });
  };

  const setCliSuggestionHighlight = (index: number) => {
    if (!isCliSuggestionMenuOpen || cliSuggestions.length === 0) {
      return;
    }

    setHighlightedCliSuggestionIndex(Math.max(0, Math.min(index, cliSuggestions.length - 1)));
  };

  const applyHighlightedCliSuggestion = (): boolean => {
    if (!isCliSuggestionMenuOpen || highlightedCliSuggestion === null || cliSuggestionResult === null) {
      return false;
    }

    if (highlightedCliSuggestion.kind === 'placeholder') {
      cliInputRef.current?.focus();
      return true;
    }

    let replaceStart = cliSuggestionResult.replaceStart;
    const shouldReuseExistingComma = (
      highlightedCliSuggestion.insertText.startsWith(',')
      || highlightedCliSuggestion.label.trimStart().startsWith(',')
    );
    let foundExistingComma = false;
    if (shouldReuseExistingComma) {
      let scanIndex = replaceStart;
      while (scanIndex > 0 && cliCommand[scanIndex - 1] === ' ') {
        scanIndex -= 1;
      }
      if (scanIndex > 0 && cliCommand[scanIndex - 1] === ',') {
        replaceStart = scanIndex - 1;
        foundExistingComma = true;
      } else if (scanIndex !== replaceStart) {
        replaceStart = scanIndex;
      }
    }

    const replacementText = cliCommand.slice(replaceStart, cliSuggestionResult.replaceEnd);
    const shouldWrapInsertedTextInQuotes = replacementText.startsWith('"')
      && !highlightedCliSuggestion.insertText.startsWith('"');
    const unquotedInsertedText = shouldWrapInsertedTextInQuotes
      ? `"${highlightedCliSuggestion.insertText.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
      : highlightedCliSuggestion.insertText;
    const baseInsertedText = shouldReuseExistingComma && !unquotedInsertedText.startsWith(',')
      ? `${foundExistingComma ? ',' : ', '}${unquotedInsertedText}`
      : unquotedInsertedText;
    const suffixNeedsSpace = cliSuggestionResult.replaceEnd >= cliCommand.length
      || /\s|,/.test(cliCommand[cliSuggestionResult.replaceEnd] ?? '');
    const insertedText = suffixNeedsSpace
      ? `${baseInsertedText} `
      : baseInsertedText;
    const nextValue = `${cliCommand.slice(0, replaceStart)}${insertedText}${cliCommand.slice(cliSuggestionResult.replaceEnd)}`;
    const nextCaretIndex = replaceStart + insertedText.length;
    pendingSelectionRangeRef.current = { start: nextCaretIndex, end: nextCaretIndex };
    setCliCommand(nextValue);
    setCliCaretIndex(nextCaretIndex);
    setHighlightedCliSuggestionIndex(0);
    setAreCliSuggestionsEnabled(true);
    return true;
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
    cliSuggestions,
    highlightedCliSuggestionIndex,
    isCliSuggestionMenuOpen,
    gameOutputLines,
    isImportingScript,
    handleCliSubmit,
    handleCliCommandChange,
    handleCliInputFocus,
    handleCliInputBlur,
    handleCliCaretChange,
    toggleCliSuggestions,
    consumeCliSlashFocusSuppression,
    handleCliHistoryNavigate,
    moveCliSuggestionHighlight,
    setCliSuggestionHighlight,
    applyHighlightedCliSuggestion,
    closeCliSuggestions,
    handleImportScriptChange,
    handleGameOutputClick: () => focusCliInput(false),
  };
}
