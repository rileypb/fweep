import { useEffect, useRef, useState } from 'react';
import { MapCanvas } from './components/map-canvas';
import { MapSelectionDialog } from './components/map-selection-dialog';
import { SnapToggle } from './components/snap-toggle';
import { ThemeToggle } from './components/theme-toggle';
import {
  CLI_COMMAND_FORMS,
  parseCliCommand,
  parseCliCommandDescription,
  type CliCommand,
} from './domain/cli-command';
import { parseCliScript } from './domain/cli-script';
import {
  createAmbiguousRoomCliError,
  createParseCliError,
  createUnboundPronounCliError,
  createUnknownRoomCliError,
  type CliError,
} from './domain/cli-errors';
import { isCliPronounReference, planCreateRoomFromCli, resolveRoomByCliReference } from './domain/cli-execution';
import { useMapRouter } from './hooks/use-map-router';
import { useEditorStore } from './state/editor-store';
import { saveMap } from './storage/map-store';
import helpMarkdown from '../../help.md?raw';

interface HelpParagraphBlock {
  readonly type: 'paragraph';
  readonly text: string;
}

interface HelpSubheadingBlock {
  readonly type: 'subheading';
  readonly text: string;
}

interface HelpRuleBlock {
  readonly type: 'rule';
}

interface HelpListBlock {
  readonly type: 'list';
  readonly items: readonly string[];
}

type HelpBlock = HelpParagraphBlock | HelpSubheadingBlock | HelpRuleBlock | HelpListBlock;

interface HelpSection {
  readonly title: string;
  readonly blocks: readonly HelpBlock[];
}

interface MutableHelpSection {
  title: string;
  blocks: HelpBlock[];
}

function renderInlineMarkdown(text: string): React.JSX.Element[] {
  return text.split(/(`[^`]+`)/g).filter(Boolean).map((segment, index) => {
    if (segment.startsWith('`') && segment.endsWith('`') && segment.length >= 2) {
      return <code key={`code-${index}`} className="help-inline-code">{segment.slice(1, -1)}</code>;
    }

    return <span key={`text-${index}`}>{segment}</span>;
  });
}

function parseHelpMarkdown(markdown: string): { title: string; sections: HelpSection[] } {
  const lines = markdown.split(/\r?\n/);
  let title = 'Help';
  const sections: MutableHelpSection[] = [];
  let currentSection: MutableHelpSection | null = null;
  let paragraphBuffer: string[] = [];
  let listBuffer: string[] = [];

  const flushParagraph = () => {
    if (!currentSection || paragraphBuffer.length === 0) {
      return;
    }

    currentSection.blocks.push({
      type: 'paragraph',
      text: paragraphBuffer.join(' '),
    });
    paragraphBuffer = [];
  };

  const flushList = () => {
    if (!currentSection || listBuffer.length === 0) {
      return;
    }

    currentSection.blocks.push({
      type: 'list',
      items: [...listBuffer],
    });
    listBuffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line.length === 0) {
      flushParagraph();
      flushList();
      continue;
    }

    if (line.startsWith('# ')) {
      flushParagraph();
      flushList();
      title = line.slice(2).trim() || title;
      continue;
    }

    if (line.startsWith('## ')) {
      flushParagraph();
      flushList();
      currentSection = {
        title: line.slice(3).trim(),
        blocks: [],
      };
      sections.push(currentSection);
      continue;
    }

    if (line.startsWith('### ')) {
      flushParagraph();
      flushList();
      if (currentSection) {
        currentSection.blocks.push({
          type: 'subheading',
          text: line.slice(4).trim(),
        });
      }
      continue;
    }

    if (line === '---') {
      flushParagraph();
      flushList();
      if (currentSection) {
        currentSection.blocks.push({ type: 'rule' });
      }
      continue;
    }

    if (line.startsWith('- ')) {
      flushParagraph();
      listBuffer.push(line.slice(2).trim());
      continue;
    }

    paragraphBuffer.push(line);
  }

  flushParagraph();
  flushList();
  return { title, sections };
}

const HELP_CONTENT = parseHelpMarkdown(helpMarkdown);

function formatCliError(error: CliError): string {
  return [error.message, error.detail, error.suggestion].filter((part): part is string => part !== null).join(' ');
}

function formatCliEcho(input: string): string {
  return `>${input}`;
}

function describeCliOutcome(command: CliCommand): string {
  switch (command.kind) {
    case 'help':
      return 'listed available commands.';
    case 'arrange':
      return 'arranged.';
    case 'create':
      return 'created.';
    case 'delete':
      return 'deleted.';
    case 'edit':
      return 'edited.';
    case 'notate':
      return 'notated.';
    case 'show':
      return 'shown.';
    case 'connect':
      return 'connected.';
    case 'create-and-connect':
      return 'created and connected.';
    case 'undo':
      return 'undone.';
    case 'redo':
      return 'redone.';
  }
}

function getAppMapVisibleLeftInset(viewportWidth: number, rootFontSizePx: number): number {
  const leftOffset = rootFontSizePx + (viewportWidth * 0.02);
  const preferredStackWidth = viewportWidth <= 720
    ? Math.min(viewportWidth * 0.52, rootFontSizePx * 18)
    : Math.min(viewportWidth * 0.375, rootFontSizePx * 27);
  const stackWidth = Math.min(preferredStackWidth, Math.max(viewportWidth - leftOffset - rootFontSizePx, 0));
  return leftOffset + stackWidth;
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

export function App(): React.JSX.Element {
  const { activeMap, loading, openMap, closeMap, routeError } = useMapRouter();
  const loadDocument = useEditorStore((s) => s.loadDocument);
  const unloadDocument = useEditorStore((s) => s.unloadDocument);
  const storeDoc = useEditorStore((s) => s.doc);
  const showGridEnabled = useEditorStore((s) => s.showGridEnabled);
  const useBezierConnectionsEnabled = useEditorStore((s) => s.useBezierConnectionsEnabled);
  const toggleShowGrid = useEditorStore((s) => s.toggleShowGrid);
  const toggleUseBezierConnections = useEditorStore((s) => s.toggleUseBezierConnections);
  const addRoomAtPosition = useEditorStore((s) => s.addRoomAtPosition);
  const addStickyNoteForRoom = useEditorStore((s) => s.addStickyNoteForRoom);
  const removeRoom = useEditorStore((s) => s.removeRoom);
  const selectRoom = useEditorStore((s) => s.selectRoom);
  const connectRooms = useEditorStore((s) => s.connectRooms);
  const createRoomAndConnect = useEditorStore((s) => s.createRoomAndConnect);
  const setMapPanOffset = useEditorStore((s) => s.setMapPanOffset);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const prettifyLayout = useEditorStore((s) => s.prettifyLayout);
  const pendingInitialSaveSkipDocRef = useRef<object | null>(null);
  const cliInputRef = useRef<HTMLInputElement | null>(null);
  const gameOutputRef = useRef<HTMLTextAreaElement | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [cliCommand, setCliCommand] = useState('');
  const [cliHistory, setCliHistory] = useState<string[]>([]);
  const [cliHistoryIndex, setCliHistoryIndex] = useState<number | null>(null);
  const [cliHistoryDraft, setCliHistoryDraft] = useState('');
  const [hasUsedCliInput, setHasUsedCliInput] = useState(false);
  const [gameOutputLines, setGameOutputLines] = useState<string[]>([]);
  const [_cliPronounRoomId, setCliPronounRoomId] = useState<string | null>(null);
  const [requestedRoomEditorRequest, setRequestedRoomEditorRequest] = useState<{ roomId: string; requestId: number } | null>(null);
  const [requestedRoomRevealRequest, setRequestedRoomRevealRequest] = useState<{ roomId: string; requestId: number } | null>(null);
  const [requestedViewportFocusRequest, setRequestedViewportFocusRequest] = useState<{ roomIds: readonly string[]; requestId: number } | null>(null);
  const [isImportingScript, setIsImportingScript] = useState(false);
  const cliPronounRoomIdRef = useRef<string | null>(null);
  const nextUiRequestIdRef = useRef(1);
  const cliImportInputRef = useRef<HTMLInputElement | null>(null);
  const rootFontSizePx = typeof window === 'undefined'
    ? 16
    : Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
  const visibleMapLeftInset = typeof window === 'undefined'
    ? 0
    : getAppMapVisibleLeftInset(window.innerWidth, rootFontSizePx);
  const hasOpenMap = activeMap !== null;

  // Sync the router's active map into the editor store.
  useEffect(() => {
    if (activeMap) {
      cliPronounRoomIdRef.current = null;
      setCliPronounRoomId(null);
      pendingInitialSaveSkipDocRef.current = activeMap;
      loadDocument(activeMap);
    } else {
      cliPronounRoomIdRef.current = null;
      setCliPronounRoomId(null);
      pendingInitialSaveSkipDocRef.current = null;
      unloadDocument();
    }
  }, [activeMap, loadDocument, unloadDocument]);

  // Auto-save when the store document changes.
  useEffect(() => {
    if (!storeDoc) return;
    if (pendingInitialSaveSkipDocRef.current === storeDoc) {
      pendingInitialSaveSkipDocRef.current = null;
      return;
    }

    pendingInitialSaveSkipDocRef.current = null;
    void saveMap(storeDoc);
  }, [storeDoc]);

  useEffect(() => {
    if (!isHelpOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsHelpOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isHelpOpen]);

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
      cliInputRef.current?.focus();
      cliInputRef.current?.select();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (gameOutputRef.current === null) {
      return;
    }

    gameOutputRef.current.scrollTop = gameOutputRef.current.scrollHeight;
  }, [gameOutputLines]);

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

  const reportRoomReferenceError = (
    submittedInput: string,
    roomMatch: ReturnType<typeof resolveRoomByCliReference>,
    commandKind: 'delete' | 'edit' | 'show' | 'notate' | 'connect' | 'create-and-connect',
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
      appendGameOutput([formatCliEcho(trimmedInput), ...CLI_COMMAND_FORMS]);
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
      setCliPronounRoomReference(roomId);
      selectRoom(roomId);
      setRequestedViewportFocusRequest({
        roomIds: [roomId],
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
      const nextDoc = useEditorStore.getState().doc;
      const createdRoom = nextDoc?.rooms[result.roomId];
      const targetRoom = nextDoc?.rooms[targetRoomMatch.room.id];
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

  const handleImportScript = async (event: React.ChangeEvent<HTMLInputElement>) => {
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

  return (
    <main className="app-shell">
      {hasOpenMap && (
        <>
          <div className="app-left-chrome-backdrop" aria-hidden="true" />
          <div className="app-cli-stack">
            <textarea
              id="app-game-output"
              className="app-game-output"
              aria-label="Game output"
              readOnly
              rows={20}
              ref={gameOutputRef}
              value={gameOutputLines.join('\n')}
            />
            <div className="app-cli-bar">
              <form
                className="app-cli-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleCliSubmit();
                }}
              >
                <label className="sr-only" htmlFor="app-cli-input">CLI command</label>
                <div className="app-cli-input-shell">
                  <span className="app-cli-prompt" aria-hidden="true">&gt;</span>
                  <input
                    id="app-cli-input"
                    className="app-cli-input"
                    type="text"
                    name="cli-command"
                    placeholder={hasUsedCliInput ? '' : 'Type help'}
                    autoComplete="off"
                    spellCheck={false}
                    ref={cliInputRef}
                    value={cliCommand}
                    onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
                    event.preventDefault();
                    void handleCliSubmit();
                    return;
                  }

                  if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
                    return;
                  }

                  if (cliHistory.length === 0) {
                    return;
                  }

                  event.preventDefault();

                  if (event.key === 'ArrowUp') {
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
                    }}
                    onChange={(event) => {
                  if (!hasUsedCliInput && event.target.value.trim().length > 0) {
                    setHasUsedCliInput(true);
                  }
                  if (cliHistoryIndex !== null) {
                    setCliHistoryIndex(null);
                    setCliHistoryDraft(event.target.value);
                  }
                  setCliCommand(event.target.value);
                    }}
                  />
                  <input
                    ref={cliImportInputRef}
                    className="app-cli-import-input"
                    type="file"
                    accept=".txt,text/plain"
                    tabIndex={-1}
                    onChange={(event) => {
                      void handleImportScript(event);
                    }}
                  />
                  <button
                    className="app-cli-import-button"
                    type="button"
                    aria-label="Import map script"
                    title="Import map script"
                    disabled={isImportingScript}
                    onClick={() => cliImportInputRef.current?.click()}
                  >
                    {isImportingScript ? 'Importing…' : 'Import'}
                  </button>
                </div>
              </form>
            </div>
          </div>
          <div
            className="app-control-chip app-map-name-chip app-control-chip--plain"
            aria-label={`Map name: ${activeMap.metadata.name}`}
          >
            {`Map: ${activeMap.metadata.name}`}
          </div>
        </>
      )}
      {hasOpenMap && (
        <>
          <div className="app-controls app-controls--settings">
            <button
              type="button"
              className="app-control-button app-control-button--plain"
              aria-label="Back to maps"
              title="Back to maps"
              onClick={closeMap}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <path d="M9.5 3.5 5 8l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5.5 8H13" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              className="app-control-button"
              aria-label="Toggle grid"
              title="Toggle grid"
              aria-pressed={showGridEnabled}
              onClick={toggleShowGrid}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <line x1="0" y1="4" x2="16" y2="4" />
                <line x1="0" y1="8" x2="16" y2="8" />
                <line x1="0" y1="12" x2="16" y2="12" />
                <line x1="4" y1="0" x2="4" y2="16" />
                <line x1="8" y1="0" x2="8" y2="16" />
                <line x1="12" y1="0" x2="12" y2="16" />
              </svg>
            </button>
            <button
              type="button"
              className="app-control-button"
              aria-label="Toggle polyline connections"
              title="Toggle polyline connections"
              aria-pressed={!useBezierConnectionsEnabled}
              onClick={toggleUseBezierConnections}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M2 12h4L10 4h4" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="2" cy="12" r="1.2" fill="currentColor" stroke="none" />
                <circle cx="10" cy="4" r="1.2" fill="currentColor" stroke="none" />
                <circle cx="14" cy="4" r="1.2" fill="currentColor" stroke="none" />
              </svg>
            </button>
            <SnapToggle />
            <ThemeToggle />
            <button
              type="button"
              className="app-control-button"
              aria-label="Help"
              title="Help"
              onClick={() => setIsHelpOpen(true)}
            >
              ?
            </button>
          </div>
          <h1 className="app-title">fweep!</h1>
        </>
      )}
      {isHelpOpen && (
        <div className="help-overlay" data-testid="help-overlay">
          <div
            className="help-backdrop"
            aria-hidden="true"
            onClick={() => setIsHelpOpen(false)}
          />
          <div
            className="help-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Help"
            data-testid="help-dialog"
          >
            <button
              className="help-close"
              type="button"
              aria-label="Close help"
              onClick={() => setIsHelpOpen(false)}
            >
              ×
            </button>
            <div className="help-content">
              <h2 className="help-heading">{HELP_CONTENT.title}</h2>
              {HELP_CONTENT.sections.map((section) => (
                <section key={section.title} className="help-section">
                  <h3 className="help-section-heading">{section.title}</h3>
                  {section.blocks.map((block, index) => {
                    if (block.type === 'paragraph') {
                      return (
                        <p key={`${section.title}-paragraph-${index}`} className="help-body">
                          {renderInlineMarkdown(block.text)}
                        </p>
                      );
                    }

                    if (block.type === 'subheading') {
                      return (
                        <h4 key={`${section.title}-subheading-${index}`} className="help-subheading">
                          {renderInlineMarkdown(block.text)}
                        </h4>
                      );
                    }

                    if (block.type === 'list') {
                      return (
                        <ul key={`${section.title}-list-${index}`} className="help-list">
                          {block.items.map((item, itemIndex) => (
                            <li key={`${section.title}-list-${index}-item-${itemIndex}`} className="help-list-item">
                              {renderInlineMarkdown(item)}
                            </li>
                          ))}
                        </ul>
                      );
                    }

                    return <hr key={`${section.title}-rule-${index}`} className="help-rule" />;
                  })}
                </section>
              ))}
            </div>
          </div>
        </div>
      )}
      {loading ? null : activeMap === null ? (
        <MapSelectionDialog onMapSelected={openMap} initialError={routeError} />
      ) : (
        <MapCanvas
          mapName={activeMap.metadata.name}
          onBack={closeMap}
          visibleMapLeftInset={visibleMapLeftInset}
          requestedRoomEditorRequest={requestedRoomEditorRequest}
          requestedRoomRevealRequest={requestedRoomRevealRequest}
          requestedViewportFocusRequest={requestedViewportFocusRequest}
        />
      )}
    </main>
  );
}
