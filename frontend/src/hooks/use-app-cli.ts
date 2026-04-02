import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  parseCliCommand,
  parseCliCommandDescription,
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
  type CliErrorCommandKind,
  type CliError,
} from '../domain/cli-errors';
import { findRoomsByCliName, resolveRoomByCliReference } from '../domain/cli-execution';
import { DEFAULT_CLI_OUTPUT_LINES, type MapDocument } from '../domain/map-types';
import { useEditorStore } from '../state/editor-store';
import { createSelectionSnapshot, type SelectionSnapshot } from '../state/editor-store-selection';
import { applyCachedMapViewSession } from '../state/map-view-session-cache';
import { saveMap } from '../storage/map-store';
import { MAX_MAP_VIEWPORT_ZOOM, MIN_MAP_VIEWPORT_ZOOM } from '../components/use-map-viewport';
import { runHelpImageMapCommand, type HelpImageScriptState } from '../domain/help-image-script';

export interface RoomUiRequest {
  readonly roomId: string;
  readonly requestId: number;
}

export interface ViewportFocusRequest {
  readonly roomIds: readonly string[];
  readonly requestId: number;
}

export interface MapZoomRequest {
  readonly mode: 'relative' | 'reset' | 'absolute';
  readonly direction?: 'in' | 'out';
  readonly targetZoom?: number;
  readonly requestId: number;
}

interface UseAppCliOptions {
  readonly activeMap: MapDocument | null;
  readonly loadDocument: (doc: MapDocument) => void;
  readonly unloadDocument: () => void;
  readonly chooseGame: () => void;
  readonly routeCrossInputCommandToParchment: (command: string) => boolean;
  readonly requestedRoomEditorRequest: RoomUiRequest | null;
  readonly requestedRoomRevealRequest: RoomUiRequest | null;
  readonly requestedViewportFocusRequest: ViewportFocusRequest | null;
  readonly requestedMapZoomRequest: MapZoomRequest | null;
  readonly setRequestedRoomEditorRequest: (request: RoomUiRequest | null) => void;
  readonly setRequestedRoomRevealRequest: (request: RoomUiRequest | null) => void;
  readonly setRequestedViewportFocusRequest: (request: ViewportFocusRequest | null) => void;
  readonly setRequestedMapZoomRequest: (request: MapZoomRequest | null) => void;
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
  readonly submitCliCommandText: (
    submittedInput: string,
    options?: {
      readonly clearInputState?: boolean;
      readonly selectCliInput?: boolean;
      readonly onOutputAppended?: (lines: readonly string[]) => void;
    },
  ) => { ok: boolean; shouldSelectCliInput: boolean };
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
  readonly flushDocumentSave: () => Promise<void>;
}

type CrossInputRoutedSubmission =
  | { readonly kind: 'normal'; readonly localInput: string }
  | { readonly kind: 'literal'; readonly localInput: string }
  | { readonly kind: 'route-to-parchment'; readonly parchmentInput: string };

function getCrossInputRoutedSubmission(submittedInput: string): CrossInputRoutedSubmission {
  if (!submittedInput.startsWith('\\')) {
    return { kind: 'normal', localInput: submittedInput };
  }

  if (submittedInput.startsWith('\\\\')) {
    return { kind: 'literal', localInput: submittedInput.slice(1) };
  }

  const parchmentInput = submittedInput.slice(1);
  if (parchmentInput.length === 0) {
    return { kind: 'normal', localInput: submittedInput };
  }

  return { kind: 'route-to-parchment', parchmentInput };
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
    case 'choose-game':
      return 'Opened the game chooser.';
    case 'zoom':
      if (command.mode === 'relative') {
        return command.direction === 'in' ? 'Zoomed in.' : 'Zoomed out.';
      }

      if (command.mode === 'reset') {
        return 'Reset zoom.';
      }

      return `Zoomed to ${command.zoomPercent}%.`;
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
      if (command.pseudoKind === 'elsewhere') {
        return 'Marked exit as leading to somewhere else.';
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
    case 'selected-room-relative-connect':
      return 'Connected.';
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

function getSelectionSnapshotFromEditorState(state: ReturnType<typeof useEditorStore.getState>): SelectionSnapshot {
  return createSelectionSnapshot({
    roomIds: state.selectedRoomIds,
    pseudoRoomIds: state.selectedPseudoRoomIds,
    stickyNoteIds: state.selectedStickyNoteIds,
    connectionIds: state.selectedConnectionIds,
    stickyNoteLinkIds: state.selectedStickyNoteLinkIds,
  });
}

export function useAppCli({
  activeMap,
  loadDocument,
  unloadDocument,
  chooseGame,
  routeCrossInputCommandToParchment,
  requestedRoomEditorRequest,
  requestedRoomRevealRequest,
  requestedViewportFocusRequest,
  requestedMapZoomRequest,
  setRequestedRoomEditorRequest,
  setRequestedRoomRevealRequest,
  setRequestedViewportFocusRequest,
  setRequestedMapZoomRequest,
}: UseAppCliOptions): UseAppCliResult {
  const applyCliSessionSnapshot = useEditorStore((s) => s.applyCliSessionSnapshot);
  const redo = useEditorStore((s) => s.redo);
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
  const latestAreCliSuggestionsEnabledRef = useRef(areCliSuggestionsEnabled);
  const outputAppendListenerRef = useRef<((lines: readonly string[]) => void) | null>(null);
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingSelectionRangeRef = useRef<{ start: number; end: number } | null>(null);
  latestGameOutputLinesRef.current = gameOutputLines;
  latestStoreDocRef.current = storeDoc;
  latestActiveMapRef.current = activeMap;
  latestAreCliSuggestionsEnabledRef.current = areCliSuggestionsEnabled;
  const hasOpenMap = activeMap !== null;
  const cliSuggestionResult = getCliSuggestions(cliCommand, cliCaretIndex, storeDoc);
  const cliSuggestions = cliSuggestionResult?.suggestions ?? [];
  const isCliSuggestionMenuOpen = cliHistoryIndex === null && areCliSuggestionsEnabled && cliSuggestions.length > 0;
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

  const flushDocumentSave = async (): Promise<void> => {
    const currentDoc = latestStoreDocRef.current;
    if (currentDoc !== null) {
      queueSave(currentDoc);
    }

    await saveQueueRef.current.catch(() => undefined);
  };

  useLayoutEffect(() => {
    if (activeMap) {
      const restoredActiveMap = applyCachedMapViewSession(activeMap);
      const cachedCliOutputLines = loadCachedCliOutputLines(activeMap.metadata.id);
      const restoredCliOutputLines = cachedCliOutputLines !== null && cachedCliOutputLines.length > restoredActiveMap.cliOutputLines.length
        ? cachedCliOutputLines
        : restoredActiveMap.cliOutputLines;
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
      loadDocument(restoredActiveMap);

      if (restoredCliOutputLines !== restoredActiveMap.cliOutputLines) {
        latestGameOutputLinesRef.current = restoredCliOutputLines;
        queueSaveSnapshot(restoredActiveMap, restoredCliOutputLines);
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
    const handlePageHide = () => {
      const currentDoc = latestStoreDocRef.current;
      if (currentDoc !== null) {
        queueSave(currentDoc);
      }
    };

    window.addEventListener('pagehide', handlePageHide);
    return () => {
      window.removeEventListener('pagehide', handlePageHide);
    };
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
      focusCliInput(latestAreCliSuggestionsEnabledRef.current);
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
    outputAppendListenerRef.current?.(lines);
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

  const getCliHistoryOptions = (
    liveEditorState: ReturnType<typeof useEditorStore.getState>,
    selectionAfter?: SelectionSnapshot,
    historyMergeKey?: string,
  ) => ({
    ...(historyMergeKey === undefined ? {} : { historyMergeKey }),
    selectionBefore: getSelectionSnapshotFromEditorState(liveEditorState),
    ...(selectionAfter === undefined ? {} : { selectionAfter }),
  });

  const reportRoomReferenceError = (
    submittedInput: string,
    roomMatch: ReturnType<typeof resolveRoomByCliReference>,
    commandKind: 'delete' | 'edit' | 'describe' | 'show' | 'notate' | 'connect' | 'disconnect' | 'create-and-connect' | 'selected-room-relative-connect' | 'set-room-adjective' | 'set-connection-annotation' | 'put-items' | 'take-items' | 'take-all-items',
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

  const createCliSessionStateFromEditor = (
    liveEditorState: ReturnType<typeof useEditorStore.getState>,
    pronounRoomId: string | null,
  ): HelpImageScriptState | null => {
    if (liveEditorState.doc === null) {
      return null;
    }

    return {
      doc: liveEditorState.doc,
      pronounRoomId,
      selectedRoomIds: liveEditorState.selectedRoomIds,
      selectedPseudoRoomIds: liveEditorState.selectedPseudoRoomIds,
      selectedStickyNoteIds: liveEditorState.selectedStickyNoteIds,
      selectedConnectionIds: liveEditorState.selectedConnectionIds,
      selectedStickyNoteLinkIds: liveEditorState.selectedStickyNoteLinkIds,
      undoStack: [],
      redoStack: [],
    };
  };

  const applyCliSessionStateToEditor = (
    currentEditorState: ReturnType<typeof useEditorStore.getState>,
    nextState: HelpImageScriptState,
    historyMergeKey?: string,
  ): void => {
    applyCliSessionSnapshot(
      {
        doc: nextState.doc,
        selectedRoomIds: nextState.selectedRoomIds,
        selectedPseudoRoomIds: nextState.selectedPseudoRoomIds,
        selectedStickyNoteIds: nextState.selectedStickyNoteIds,
        selectedConnectionIds: nextState.selectedConnectionIds,
        selectedStickyNoteLinkIds: nextState.selectedStickyNoteLinkIds,
      },
      getCliHistoryOptions(
        currentEditorState,
        createSelectionSnapshot({
          roomIds: nextState.selectedRoomIds,
          pseudoRoomIds: nextState.selectedPseudoRoomIds,
          stickyNoteIds: nextState.selectedStickyNoteIds,
          connectionIds: nextState.selectedConnectionIds,
          stickyNoteLinkIds: nextState.selectedStickyNoteLinkIds,
        }),
        historyMergeKey,
      ),
    );
    setCliPronounRoomReference(nextState.pronounRoomId);
  };

  const getCliErrorCommandKind = (command: CliCommand): Exclude<CliErrorCommandKind, null> | null => {
    switch (command.kind) {
      case 'delete':
      case 'edit':
      case 'describe':
      case 'show':
      case 'notate':
      case 'connect':
      case 'disconnect':
      case 'create-and-connect':
      case 'selected-room-relative-connect':
      case 'set-room-adjective':
      case 'set-connection-annotation':
      case 'put-items':
      case 'take-items':
      case 'take-all-items':
        return command.kind;
      default:
        return null;
    }
  };

  const translateSharedEngineError = (
    command: CliCommand,
    error: Error,
    doc: MapDocument,
    pronounRoomId: string | null,
  ): string => {
    if (error.message === 'The script referenced "it" before any room was established.') {
      return createUnboundPronounCliError().message;
    }

    const unknownRoomMatch = /^Could not find room "(.+)"\.$/.exec(error.message);
    if (unknownRoomMatch) {
      return createUnknownRoomCliError(unknownRoomMatch[1] ?? '').message;
    }

    const ambiguousRoomMatch = /^Room reference "(.+)" is ambiguous\.$/.exec(error.message);
    if (ambiguousRoomMatch) {
      const roomName = ambiguousRoomMatch[1] ?? '';
      const commandKind = getCliErrorCommandKind(command);
      if (commandKind !== null) {
        return createAmbiguousRoomCliError(commandKind, roomName, findRoomsByCliName(doc, roomName).map((room) => room.name)).message;
      }
    }

    if (command.kind === 'set-connection-annotation' && error.message === 'There are no connections between those rooms.') {
      const sourceRoomMatch = resolveRoomByCliReference(doc, command.sourceRoom.text, command.sourceRoom.exact, pronounRoomId);
      const targetRoomMatch = resolveRoomByCliReference(doc, command.targetRoom.text, command.targetRoom.exact, pronounRoomId);
      if (sourceRoomMatch.kind === 'one' && targetRoomMatch.kind === 'one') {
        return `There are no connections between ${sourceRoomMatch.room.name} and ${targetRoomMatch.room.name}.`;
      }
    }

    if (command.kind === 'disconnect') {
      const sourceRoomMatch = resolveRoomByCliReference(doc, command.sourceRoom.text, command.sourceRoom.exact, pronounRoomId);
      const targetRoomMatch = resolveRoomByCliReference(doc, command.targetRoom.text, command.targetRoom.exact, pronounRoomId);
      if (sourceRoomMatch.kind === 'one' && targetRoomMatch.kind === 'one') {
        if (error.message.startsWith('Multiple matching connections exist')) {
          return `There are multiple connections between ${sourceRoomMatch.room.name} and ${targetRoomMatch.room.name}. Use "disconnect ${sourceRoomMatch.room.name} <direction> from ${targetRoomMatch.room.name}".`;
        }

        if (error.message.startsWith('No matching connection exists')) {
          return command.sourceDirection === null
            ? `There are no connections between ${sourceRoomMatch.room.name} and ${targetRoomMatch.room.name}.`
            : `There is no connection from ${sourceRoomMatch.room.name} going ${command.sourceDirection} to ${targetRoomMatch.room.name}.`;
        }
      }
    }

    return error.message;
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

    if (command.kind === 'zoom') {
      if (command.mode === 'absolute') {
        const zoomPercent = command.zoomPercent ?? 0;
        if (zoomPercent <= 0) {
          appendGameOutput([formatCliEcho(trimmedInput), 'Zoom must be greater than 0%.']);
          return { ok: false, shouldSelectCliInput };
        }

        const targetZoom = zoomPercent / 100;
        if (targetZoom < MIN_MAP_VIEWPORT_ZOOM || targetZoom > MAX_MAP_VIEWPORT_ZOOM) {
          appendGameOutput([
            formatCliEcho(trimmedInput),
            `Zoom must be between ${MIN_MAP_VIEWPORT_ZOOM * 100}% and ${MAX_MAP_VIEWPORT_ZOOM * 100}%.`,
          ]);
          return { ok: false, shouldSelectCliInput };
        }

        setRequestedMapZoomRequest({
          mode: 'absolute',
          targetZoom,
          requestId: issueUiRequestId(),
        });
        appendGameOutput([formatCliEcho(trimmedInput), describeCliOutcome(command)]);
        return { ok: true, shouldSelectCliInput };
      }

      setRequestedMapZoomRequest({
        mode: command.mode,
        direction: command.direction,
        requestId: issueUiRequestId(),
      });
      appendGameOutput([formatCliEcho(trimmedInput), describeCliOutcome(command)]);
      return { ok: true, shouldSelectCliInput };
    }

    if (
      currentDoc !== null
      && (
        command.kind === 'arrange'
        || command.kind === 'navigate'
        || command.kind === 'create'
        || command.kind === 'put-items'
        || command.kind === 'take-items'
        || command.kind === 'take-all-items'
        || command.kind === 'create-pseudo-room'
        || command.kind === 'delete'
        || command.kind === 'show'
        || command.kind === 'set-room-adjective'
        || command.kind === 'selected-room-relative-connect'
        || command.kind === 'set-connection-annotation'
        || command.kind === 'notate'
        || command.kind === 'connect'
        || command.kind === 'disconnect'
        || command.kind === 'create-and-connect'
      )
    ) {
      const cliSessionState = createCliSessionStateFromEditor(liveEditorState, currentPronounRoomId);
      if (cliSessionState === null) {
        appendGameOutput([formatCliEcho(trimmedInput), 'No map is open.']);
        return { ok: false, shouldSelectCliInput };
      }

      if (command.kind === 'notate' && command.room === null) {
        if (liveEditorState.selectedRoomIds.length === 0) {
          appendGameOutput([
            formatCliEcho(trimmedInput),
            "You must select a room to annotate. Use the 'show' command to select a room.",
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
        if (!currentDoc.rooms[selectedRoomId]) {
          appendGameOutput([
            formatCliEcho(trimmedInput),
            "You must select a room to annotate. Use the 'show' command to select a room.",
          ]);
          return { ok: false, shouldSelectCliInput };
        }
      }

      const shouldReportCreatedAndConnected = command.kind === 'selected-room-relative-connect' && (() => {
        const targetRoomMatch = resolveRoomByCliReference(currentDoc, command.targetRoom.text, command.targetRoom.exact, currentPronounRoomId);
        return targetRoomMatch.kind !== 'one';
      })();

      try {
        const nextState = runHelpImageMapCommand(cliSessionState, trimmedInput, {
          viewportSize: { width: window.innerWidth, height: window.innerHeight },
          panOffset: currentMapPanOffset,
        });
        const appliedState = command.kind === 'create-and-connect' && nextState.pronounRoomId !== null
          ? { ...nextState, selectedRoomIds: [nextState.pronounRoomId] }
          : nextState;
        applyCliSessionStateToEditor(liveEditorState, appliedState);

        if (command.kind === 'navigate' || command.kind === 'show') {
          const roomId = nextState.selectedRoomIds[0] ?? null;
          const roomName = roomId ? nextState.doc.rooms[roomId]?.name ?? null : null;
          if (roomId !== null) {
            setRequestedRoomRevealRequest({
              roomId,
              requestId: issueUiRequestId(),
            });
          }
          appendGameOutput([formatCliEcho(trimmedInput), roomName ? `**${roomName}**` : describeCliOutcome(command)]);
          return { ok: true, shouldSelectCliInput };
        }

        if (command.kind === 'create') {
          const roomId = nextState.selectedRoomIds[0] ?? null;
          if (roomId !== null) {
            setRequestedViewportFocusRequest({
              roomIds: [roomId],
              requestId: issueUiRequestId(),
            });
          }
          appendGameOutput([formatCliEcho(trimmedInput), describeCliOutcome(command)]);
          return { ok: true, shouldSelectCliInput };
        }

        if (command.kind === 'create-pseudo-room') {
          const roomId = nextState.pronounRoomId;
          if (roomId !== null) {
            setRequestedRoomRevealRequest({
              roomId,
              requestId: issueUiRequestId(),
            });
          }
          appendGameOutput([formatCliEcho(trimmedInput), describeCliOutcome(command)]);
          return { ok: true, shouldSelectCliInput };
        }

        if (command.kind === 'create-and-connect') {
          if (nextState.selectedRoomIds.length > 0) {
            setRequestedViewportFocusRequest({
              roomIds: nextState.selectedRoomIds,
              requestId: issueUiRequestId(),
            });
          }
          appendGameOutput([formatCliEcho(trimmedInput), describeCliOutcome(command)]);
          return { ok: true, shouldSelectCliInput };
        }

        if (command.kind === 'selected-room-relative-connect' && shouldReportCreatedAndConnected) {
          appendGameOutput([formatCliEcho(trimmedInput), 'Created and connected.']);
          return { ok: true, shouldSelectCliInput };
        }

        appendGameOutput([formatCliEcho(trimmedInput), describeCliOutcome(command)]);
        return { ok: true, shouldSelectCliInput };
      } catch (error) {
        appendGameOutput([
          formatCliEcho(trimmedInput),
          error instanceof Error ? translateSharedEngineError(command, error, currentDoc, currentPronounRoomId) : 'Command failed.',
        ]);
        return { ok: false, shouldSelectCliInput };
      }
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

    if (command.kind === 'choose-game') {
      chooseGame();
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

  const submitCliCommandText = (
    submittedInput: string,
    options?: {
      readonly clearInputState?: boolean;
      readonly selectCliInput?: boolean;
      readonly onOutputAppended?: (lines: readonly string[]) => void;
    },
  ): { ok: boolean; shouldSelectCliInput: boolean } => {
    const clearInputState = options?.clearInputState ?? false;
    const selectCliInput = options?.selectCliInput ?? true;
    const onOutputAppended = options?.onOutputAppended;

    if (clearInputState) {
      setHasUsedCliInput(true);
      setCliHistoryIndex(null);
      setCliHistoryDraft('');
      setCliCommand('');
      setCliCaretIndex(0);
      setHighlightedCliSuggestionIndex(0);
    }

    if (submittedInput.trim().length > 0) {
      setCliHistory((previousHistory) => [...previousHistory, submittedInput]);
    }

    const routedSubmission = getCrossInputRoutedSubmission(submittedInput);
    if (routedSubmission.kind === 'route-to-parchment') {
      const routed = routeCrossInputCommandToParchment(routedSubmission.parchmentInput);
      setAreCliSuggestionsEnabled(false);
      if (!routed) {
        appendGameOutput([
          formatCliEcho(submittedInput),
          'No interactive fiction game is ready to receive commands.',
        ]);
        if (selectCliInput) {
          cliInputRef.current?.select();
        }
        return { ok: false, shouldSelectCliInput: selectCliInput };
      }

      if (selectCliInput) {
        cliInputRef.current?.select();
      }
      return { ok: true, shouldSelectCliInput: selectCliInput };
    }

    const mirroredOutputBatches: string[][] = [];
    outputAppendListenerRef.current = (lines) => {
      mirroredOutputBatches.push([...lines]);
    };
    const { ok, shouldSelectCliInput: shouldSelectCliInputAfterRun } = runCliCommand(routedSubmission.localInput);
    outputAppendListenerRef.current = null;
    if (onOutputAppended) {
      const flattenedLines = mirroredOutputBatches.flat();
      if (flattenedLines.length > 0) {
        onOutputAppended(flattenedLines);
      }
    }
    const shouldKeepSuggestionsEnabled = ok && shouldKeepSuggestionsEnabledAfterSubmit(
      areCliSuggestionsEnabled,
      submittedInput,
    );
    setAreCliSuggestionsEnabled(shouldKeepSuggestionsEnabled);
    const shouldSelectCliInput = selectCliInput && shouldSelectCliInputAfterRun;
    if (shouldSelectCliInput) {
      cliInputRef.current?.select();
    }
    return { ok, shouldSelectCliInput };
  };

  const handleCliSubmit = () => {
    void submitCliCommandText(cliCommand, {
      clearInputState: true,
      selectCliInput: true,
    });
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

    let replaceStart = highlightedCliSuggestion.replaceStart ?? cliSuggestionResult.replaceStart;
    const replaceEnd = highlightedCliSuggestion.replaceEnd ?? cliSuggestionResult.replaceEnd;
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

    const replacementText = cliCommand.slice(replaceStart, replaceEnd);
    const shouldWrapInsertedTextInQuotes = replacementText.startsWith('"')
      && !highlightedCliSuggestion.insertText.startsWith('"');
    const unquotedInsertedText = shouldWrapInsertedTextInQuotes
      ? `"${highlightedCliSuggestion.insertText.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
      : highlightedCliSuggestion.insertText;
    const baseInsertedText = shouldReuseExistingComma && !unquotedInsertedText.startsWith(',')
      ? `${foundExistingComma ? ',' : ', '}${unquotedInsertedText}`
      : unquotedInsertedText;
    const suffixNeedsSpace = replaceEnd >= cliCommand.length
      || /\s|,/.test(cliCommand[replaceEnd] ?? '');
    const insertedText = suffixNeedsSpace
      ? `${baseInsertedText} `
      : baseInsertedText;
    const nextValue = `${cliCommand.slice(0, replaceStart)}${insertedText}${cliCommand.slice(replaceEnd)}`;
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
        requestedMapZoomRequest,
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
          setRequestedMapZoomRequest(importSnapshot.requestedMapZoomRequest);
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
    submitCliCommandText,
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
    handleGameOutputClick: () => focusCliInput(areCliSuggestionsEnabled),
    flushDocumentSave,
  };
}
