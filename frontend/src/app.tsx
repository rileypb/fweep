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
      return 'undid.';
    case 'redo':
      return 'redid.';
  }
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
  const mapPanOffset = useEditorStore((s) => s.mapPanOffset);
  const canUndo = useEditorStore((s) => s.canUndo);
  const canRedo = useEditorStore((s) => s.canRedo);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const pendingInitialSaveSkipDocRef = useRef<object | null>(null);
  const cliInputRef = useRef<HTMLInputElement | null>(null);
  const gameOutputRef = useRef<HTMLTextAreaElement | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isGameOutputCollapsed, setIsGameOutputCollapsed] = useState(false);
  const [cliCommand, setCliCommand] = useState('');
  const [hasUsedCliInput, setHasUsedCliInput] = useState(false);
  const [gameOutputLines, setGameOutputLines] = useState<string[]>([]);
  const [cliPronounRoomId, setCliPronounRoomId] = useState<string | null>(null);
  const [requestedRoomEditorRequest, setRequestedRoomEditorRequest] = useState<{ roomId: string; requestId: number } | null>(null);
  const [requestedRoomRevealRequest, setRequestedRoomRevealRequest] = useState<{ roomId: string; requestId: number } | null>(null);
  const [nextUiRequestId, setNextUiRequestId] = useState(1);

  // Sync the router's active map into the editor store.
  useEffect(() => {
    if (activeMap) {
      setCliPronounRoomId(null);
      pendingInitialSaveSkipDocRef.current = activeMap;
      loadDocument(activeMap);
    } else {
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
    if (isGameOutputCollapsed || gameOutputRef.current === null) {
      return;
    }

    gameOutputRef.current.scrollTop = gameOutputRef.current.scrollHeight;
  }, [gameOutputLines, isGameOutputCollapsed]);

  const appendGameOutput = (lines: readonly string[]) => {
    setGameOutputLines((previousLines) => [...previousLines, ...lines, '']);
  };

  const reportCliError = (submittedInput: string, error: CliError) => {
    appendGameOutput([formatCliEcho(submittedInput), formatCliError(error)]);
    cliInputRef.current?.select();
  };

  const issueUiRequestId = (): number => {
    const requestId = nextUiRequestId;
    setNextUiRequestId(requestId + 1);
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
      reportCliError(submittedInput, createAmbiguousRoomCliError(commandKind, roomName));
      return true;
    }

    return false;
  };

  return (
    <main className="app-shell">
      <div className="app-cli-stack">
        <button
          type="button"
          className={`app-game-output-toggle${isGameOutputCollapsed ? ' app-game-output-toggle--collapsed' : ''}`}
          aria-label={isGameOutputCollapsed ? 'Expand output log' : 'Collapse output log'}
          title={isGameOutputCollapsed ? 'Expand output log' : 'Collapse output log'}
          onClick={() => {
            setIsGameOutputCollapsed((previous) => !previous);
          }}
        >
          {isGameOutputCollapsed ? '▲' : '▼'}
        </button>
        {!isGameOutputCollapsed && (
          <textarea
            id="app-game-output"
            className="app-game-output"
            aria-label="Game output"
            readOnly
            rows={20}
            ref={gameOutputRef}
            value={gameOutputLines.join('\n')}
          />
        )}
        <div className="app-cli-bar">
          <form
            className="app-cli-form"
            onSubmit={(event) => {
              event.preventDefault();
              setHasUsedCliInput(true);
              let shouldSelectCliInput = true;
              const submittedInput = cliCommand;
              const command = parseCliCommand(submittedInput);
              if (command === null) {
                reportCliError(submittedInput, createParseCliError());
                return;
              }

              if (command.kind === 'help') {
                appendGameOutput([formatCliEcho(submittedInput), ...CLI_COMMAND_FORMS]);
              } else if (command.kind === 'create' && storeDoc !== null) {
                const plan = planCreateRoomFromCli(
                  storeDoc,
                  command.roomName,
                  { width: window.innerWidth, height: window.innerHeight },
                  mapPanOffset,
                );
                const roomId = addRoomAtPosition(plan.roomName, plan.position);
                setCliPronounRoomId(roomId);
                selectRoom(roomId);
                setMapPanOffset({
                  x: (window.innerWidth / 2) - plan.position.x,
                  y: (window.innerHeight / 2) - plan.position.y,
                });
                appendGameOutput([formatCliEcho(submittedInput), describeCliOutcome(command)]);
              } else if (command.kind === 'delete' && storeDoc !== null) {
                const roomMatch = resolveRoomByCliReference(storeDoc, command.roomName, cliPronounRoomId);
                if (reportRoomReferenceError(submittedInput, roomMatch, 'delete', command.roomName)) {
                  return;
                }
                if (roomMatch.kind !== 'one') {
                  return;
                }
                removeRoom(roomMatch.room.id);
                setCliPronounRoomId((previous) => (previous === roomMatch.room.id ? null : previous));
                appendGameOutput([formatCliEcho(submittedInput), describeCliOutcome(command)]);
              } else if (command.kind === 'edit' && storeDoc !== null) {
                const roomMatch = resolveRoomByCliReference(storeDoc, command.roomName, cliPronounRoomId);
                if (reportRoomReferenceError(submittedInput, roomMatch, 'edit', command.roomName)) {
                  return;
                }
                if (roomMatch.kind !== 'one') {
                  return;
                }
                selectRoom(roomMatch.room.id);
                setCliPronounRoomId(roomMatch.room.id);
                setRequestedRoomEditorRequest({
                  roomId: roomMatch.room.id,
                  requestId: issueUiRequestId(),
                });
                appendGameOutput([formatCliEcho(submittedInput), describeCliOutcome(command)]);
                shouldSelectCliInput = false;
              } else if (command.kind === 'show' && storeDoc !== null) {
                const roomMatch = resolveRoomByCliReference(storeDoc, command.roomName, cliPronounRoomId);
                if (reportRoomReferenceError(submittedInput, roomMatch, 'show', command.roomName)) {
                  return;
                }
                if (roomMatch.kind !== 'one') {
                  return;
                }
                selectRoom(roomMatch.room.id);
                setCliPronounRoomId(roomMatch.room.id);
                setRequestedRoomRevealRequest({
                  roomId: roomMatch.room.id,
                  requestId: issueUiRequestId(),
                });
                appendGameOutput([formatCliEcho(submittedInput), describeCliOutcome(command)]);
              } else if (command.kind === 'notate' && storeDoc !== null) {
                const roomMatch = resolveRoomByCliReference(storeDoc, command.roomName, cliPronounRoomId);
                if (reportRoomReferenceError(submittedInput, roomMatch, 'notate', command.roomName)) {
                  return;
                }
                if (roomMatch.kind !== 'one') {
                  return;
                }
                addStickyNoteForRoom(roomMatch.room.id, command.noteText);
                setCliPronounRoomId(roomMatch.room.id);
                appendGameOutput([formatCliEcho(submittedInput), describeCliOutcome(command)]);
              } else if (command.kind === 'connect' && storeDoc !== null) {
                const sourceRoomMatch = resolveRoomByCliReference(storeDoc, command.sourceRoomName, cliPronounRoomId);
                if (reportRoomReferenceError(submittedInput, sourceRoomMatch, 'connect', command.sourceRoomName)) {
                  return;
                }
                if (sourceRoomMatch.kind !== 'one') {
                  return;
                }

                const targetRoomMatch = resolveRoomByCliReference(storeDoc, command.targetRoomName, cliPronounRoomId);
                if (reportRoomReferenceError(submittedInput, targetRoomMatch, 'connect', command.targetRoomName)) {
                  return;
                }
                if (targetRoomMatch.kind !== 'one') {
                  return;
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
                if (!isCliPronounReference(command.targetRoomName)) {
                  setCliPronounRoomId(sourceRoomMatch.room.id);
                }
                appendGameOutput([formatCliEcho(submittedInput), describeCliOutcome(command)]);
              } else if (command.kind === 'create-and-connect' && storeDoc !== null) {
                const targetRoomMatch = resolveRoomByCliReference(storeDoc, command.targetRoomName, cliPronounRoomId);
                if (reportRoomReferenceError(submittedInput, targetRoomMatch, 'create-and-connect', command.targetRoomName)) {
                  return;
                }
                if (targetRoomMatch.kind !== 'one') {
                  return;
                }

                const plan = planCreateRoomFromCli(
                  storeDoc,
                  command.sourceRoomName,
                  { width: window.innerWidth, height: window.innerHeight },
                  mapPanOffset,
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
                if (!isCliPronounReference(command.targetRoomName)) {
                  setCliPronounRoomId(result.roomId);
                }
                if (createdRoom && targetRoom) {
                  setMapPanOffset({
                    x: (window.innerWidth / 2) - ((createdRoom.position.x + targetRoom.position.x) / 2),
                    y: (window.innerHeight / 2) - ((createdRoom.position.y + targetRoom.position.y) / 2),
                  });
                }
                appendGameOutput([formatCliEcho(submittedInput), describeCliOutcome(command)]);
              } else if (command.kind === 'undo') {
                if (!canUndo) {
                  appendGameOutput([formatCliEcho(submittedInput), 'Nothing to undo.']);
                  cliInputRef.current?.select();
                  return;
                }
                undo();
                appendGameOutput([formatCliEcho(submittedInput), describeCliOutcome(command)]);
              } else if (command.kind === 'redo') {
                if (!canRedo) {
                  appendGameOutput([formatCliEcho(submittedInput), 'Nothing to redo.']);
                  cliInputRef.current?.select();
                  return;
                }
                redo();
                appendGameOutput([formatCliEcho(submittedInput), describeCliOutcome(command)]);
              } else {
                const description = parseCliCommandDescription(submittedInput);
                if (description === null) {
                  reportCliError(submittedInput, createParseCliError());
                  return;
                }
                appendGameOutput([formatCliEcho(submittedInput), description]);
              }

              if (shouldSelectCliInput) {
                cliInputRef.current?.select();
              }
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
                placeholder={hasUsedCliInput ? 'Enter a command' : 'Type help'}
                autoComplete="off"
                spellCheck={false}
                ref={cliInputRef}
                value={cliCommand}
                onChange={(event) => {
                  if (!hasUsedCliInput && event.target.value.trim().length > 0) {
                    setHasUsedCliInput(true);
                  }
                  setCliCommand(event.target.value);
                }}
              />
            </div>
          </form>
        </div>
      </div>
      <div className="app-controls app-controls--settings">
        {activeMap !== null && (
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
        )}
        {activeMap !== null && (
          <div
            className="app-control-chip app-control-chip--plain"
            aria-label={`Map name: ${activeMap.metadata.name}`}
          >
            {activeMap.metadata.name}
          </div>
        )}
        {activeMap !== null && (
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
        )}
        {activeMap !== null && (
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
        )}
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
        <h1 className="app-title">fweep</h1>
      </div>
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
          requestedRoomEditorRequest={requestedRoomEditorRequest}
          requestedRoomRevealRequest={requestedRoomRevealRequest}
        />
      )}
    </main>
  );
}
