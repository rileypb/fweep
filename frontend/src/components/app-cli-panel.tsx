import React from 'react';
import type { CliSuggestion } from '../domain/cli-suggestions';

const CLI_OUTPUT_HEIGHT_STORAGE_KEY = 'fweep-cli-output-height';
const MIN_EXPANDED_OUTPUT_HEIGHT_PX = 180;
const DEFAULT_EXPANDED_OUTPUT_HEIGHT_PX = 320;
const CLI_OUTPUT_RESIZE_STEP_PX = 32;
const CLI_OUTPUT_BOTTOM_GAP_PX = 12;

function loadStoredCliOutputHeight(): number | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const rawValue = window.localStorage.getItem(CLI_OUTPUT_HEIGHT_STORAGE_KEY);
  if (rawValue === null) {
    return null;
  }

  const parsedValue = Number(rawValue);
  return Number.isFinite(parsedValue) && parsedValue >= MIN_EXPANDED_OUTPUT_HEIGHT_PX
    ? parsedValue
    : null;
}

function storeCliOutputHeight(height: number | null): void {
  if (typeof window === 'undefined') {
    return;
  }

  if (height === null) {
    window.localStorage.removeItem(CLI_OUTPUT_HEIGHT_STORAGE_KEY);
    return;
  }

  window.localStorage.setItem(CLI_OUTPUT_HEIGHT_STORAGE_KEY, String(Math.round(height)));
}

function clampCliOutputHeight(height: number, maxHeight: number): number {
  return Math.max(MIN_EXPANDED_OUTPUT_HEIGHT_PX, Math.min(height, maxHeight));
}

function renderCliOutputLine(line: string): React.ReactNode {
  const segments = line.split(/(\*\*.+?\*\*)/g).filter((segment) => segment.length > 0);
  if (segments.length === 0) {
    return null;
  }

  return segments.map((segment, index) => {
    const isBold = segment.startsWith('**') && segment.endsWith('**') && segment.length >= 4;
    if (!isBold) {
      return <span key={`text-${index}`}>{segment}</span>;
    }

    return (
      <strong key={`strong-${index}`} className="app-game-output-strong">
        {segment.slice(2, -2)}
      </strong>
    );
  });
}

interface AppCliPanelProps {
  readonly gameOutputRef: React.RefObject<HTMLDivElement | null>;
  readonly gameOutputLines: readonly string[];
  readonly onGameOutputClick: () => void;
  readonly cliInputRef: React.RefObject<HTMLInputElement | null>;
  readonly cliImportInputRef: React.RefObject<HTMLInputElement | null>;
  readonly cliCommand: string;
  readonly hasUsedCliInput: boolean;
  readonly cliHistory: readonly string[];
  readonly cliHistoryIndex: number | null;
  readonly cliHistoryDraft: string;
  readonly cliSuggestions: readonly CliSuggestion[];
  readonly highlightedCliSuggestionIndex: number;
  readonly isSuggestionMenuOpen: boolean;
  readonly isOutputCollapsed: boolean;
  readonly isImportingScript: boolean;
  readonly onSubmit: () => void;
  readonly onCliCommandChange: (value: string) => void;
  readonly onCliInputFocus: () => void;
  readonly onCliInputBlur: () => void;
  readonly onCliCaretChange: (caretIndex: number | null) => void;
  readonly onToggleSuggestions: () => void;
  readonly consumeCliSlashFocusSuppression: () => boolean;
  readonly onCliHistoryNavigate: (direction: 'up' | 'down') => void;
  readonly onCliSuggestionHighlightMove: (direction: 'up' | 'down') => void;
  readonly onCliSuggestionHighlightSet: (index: number) => void;
  readonly onAcceptHighlightedSuggestion: () => boolean;
  readonly onCloseSuggestions: () => void;
  readonly onToggleOutputCollapsed: () => void;
  readonly onImportScriptChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  readonly onOutputTopChange?: (top: number | null) => void;
}

export function AppCliPanel({
  gameOutputRef,
  gameOutputLines,
  onGameOutputClick,
  cliInputRef,
  cliImportInputRef,
  cliCommand,
  hasUsedCliInput,
  cliHistory,
  cliHistoryIndex,
  cliHistoryDraft,
  cliSuggestions,
  highlightedCliSuggestionIndex,
  isSuggestionMenuOpen,
  isOutputCollapsed,
  isImportingScript,
  onSubmit,
  onCliCommandChange,
  onCliInputFocus,
  onCliInputBlur,
  onCliCaretChange,
  onToggleSuggestions,
  consumeCliSlashFocusSuppression,
  onCliHistoryNavigate,
  onCliSuggestionHighlightMove,
  onCliSuggestionHighlightSet,
  onAcceptHighlightedSuggestion,
  onCloseSuggestions,
  onToggleOutputCollapsed,
  onImportScriptChange,
  onOutputTopChange,
}: AppCliPanelProps): React.JSX.Element {
  const [isCliInputFocused, setIsCliInputFocused] = React.useState(false);
  const [screenReaderAnnouncement, setScreenReaderAnnouncement] = React.useState('');
  const [outputHeight, setOutputHeight] = React.useState<number | null>(() => loadStoredCliOutputHeight());
  const [isResizingOutput, setIsResizingOutput] = React.useState(false);
  const stackRef = React.useRef<HTMLDivElement | null>(null);
  const outputRef = React.useRef<HTMLDivElement | null>(null);
  const cliBarRef = React.useRef<HTMLDivElement | null>(null);
  const suggestionListRef = React.useRef<HTMLDivElement | null>(null);
  const suggestionOptionRefs = React.useRef<Array<HTMLDivElement | null>>([]);
  const previousOutputLengthRef = React.useRef<number | null>(null);
  const announcementFrameRef = React.useRef<number | null>(null);
  const isSuggestionMenuInteractive = isSuggestionMenuOpen && isCliInputFocused;
  const activeSuggestion = isSuggestionMenuOpen
    ? cliSuggestions[highlightedCliSuggestionIndex] ?? null
    : null;
  const placeholderText = hasUsedCliInput
    ? (isCliInputFocused ? 'Type / to open suggestions' : 'Type / to type commands')
    : 'Type help';

  React.useLayoutEffect(() => {
    if (!isSuggestionMenuOpen) {
      return;
    }

    const suggestionList = suggestionListRef.current;
    const activeOption = suggestionOptionRefs.current[highlightedCliSuggestionIndex];
    if (suggestionList === null || activeOption === null) {
      return;
    }

    const optionTop = activeOption.offsetTop;
    const optionBottom = optionTop + activeOption.offsetHeight;
    const visibleTop = suggestionList.scrollTop;
    const visibleBottom = visibleTop + suggestionList.clientHeight;

    if (optionTop < visibleTop) {
      suggestionList.scrollTop = optionTop;
      return;
    }

    if (optionBottom > visibleBottom) {
      suggestionList.scrollTop = optionBottom - suggestionList.clientHeight;
    }
  }, [highlightedCliSuggestionIndex, isSuggestionMenuOpen, cliSuggestions]);

  React.useEffect(() => {
    if (previousOutputLengthRef.current === null) {
      previousOutputLengthRef.current = gameOutputLines.length;
      return;
    }

    if (gameOutputLines.length <= previousOutputLengthRef.current) {
      previousOutputLengthRef.current = gameOutputLines.length;
      return;
    }

    const appendedLines = gameOutputLines
      .slice(previousOutputLengthRef.current)
      .filter((line) => line.trim().length > 0)
      .map((line) => line.replace(/\*\*(.+?)\*\*/g, '$1'));
    previousOutputLengthRef.current = gameOutputLines.length;

    if (appendedLines.length === 0) {
      return;
    }

    if (announcementFrameRef.current !== null) {
      window.cancelAnimationFrame(announcementFrameRef.current);
    }

    setScreenReaderAnnouncement('');
    announcementFrameRef.current = window.requestAnimationFrame(() => {
      setScreenReaderAnnouncement(appendedLines.join(' '));
      announcementFrameRef.current = null;
    });
  }, [gameOutputLines]);

  React.useEffect(() => () => {
    if (announcementFrameRef.current !== null) {
      window.cancelAnimationFrame(announcementFrameRef.current);
    }
  }, []);

  React.useLayoutEffect(() => {
    if (onOutputTopChange === undefined) {
      return undefined;
    }

    const measure = (): void => {
      onOutputTopChange(outputRef.current?.getBoundingClientRect().top ?? null);
    };

    measure();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => {
        window.removeEventListener('resize', measure);
        onOutputTopChange(null);
      };
    }

    const resizeObserver = new ResizeObserver(measure);

    if (outputRef.current !== null) {
      resizeObserver.observe(outputRef.current);
    }

    if (stackRef.current !== null && stackRef.current !== outputRef.current) {
      resizeObserver.observe(stackRef.current);
    }

    window.addEventListener('resize', measure);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', measure);
      onOutputTopChange(null);
    };
  }, [onOutputTopChange, outputHeight, isOutputCollapsed]);

  const getMaxExpandedOutputHeight = React.useCallback((): number => {
    const stackRect = stackRef.current?.getBoundingClientRect();
    const cliBarRect = cliBarRef.current?.getBoundingClientRect();
    if (!stackRect || !cliBarRect) {
      return Number.POSITIVE_INFINITY;
    }

    return Math.max(
      MIN_EXPANDED_OUTPUT_HEIGHT_PX,
      stackRect.height - cliBarRect.height - CLI_OUTPUT_BOTTOM_GAP_PX,
    );
  }, []);

  const getCurrentExpandedOutputHeight = React.useCallback((): number => {
    const measuredHeight = outputRef.current?.getBoundingClientRect().height ?? 0;
    if (measuredHeight > 0) {
      return measuredHeight;
    }

    return outputHeight ?? DEFAULT_EXPANDED_OUTPUT_HEIGHT_PX;
  }, [outputHeight]);

  const updateOutputHeight = React.useCallback((nextHeight: number | null) => {
    if (nextHeight === null) {
      setOutputHeight(null);
      storeCliOutputHeight(null);
      return;
    }

    const clampedHeight = clampCliOutputHeight(nextHeight, getMaxExpandedOutputHeight());
    setOutputHeight(clampedHeight);
    storeCliOutputHeight(clampedHeight);
  }, [getMaxExpandedOutputHeight]);

  React.useEffect(() => {
    if (isOutputCollapsed || outputHeight === null) {
      return;
    }

    const handleResize = (): void => {
      updateOutputHeight(outputHeight);
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [isOutputCollapsed, outputHeight, updateOutputHeight]);

  const handleResizePointerDown = React.useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();

    const stackElement = stackRef.current;
    const cliBarElement = cliBarRef.current;
    if (!stackElement || !cliBarElement) {
      return;
    }

    const updateFromClientY = (clientY: number): void => {
      const stackRect = stackElement.getBoundingClientRect();
      const cliBarRect = cliBarElement.getBoundingClientRect();
      const nextHeight = stackRect.bottom - cliBarRect.height - clientY;
      updateOutputHeight(nextHeight);
    };

    setIsResizingOutput(true);
    document.body.classList.add('app-cli-resizing');
    updateFromClientY(event.clientY);

    const handlePointerMove = (moveEvent: PointerEvent): void => {
      updateFromClientY(moveEvent.clientY);
    };

    const handlePointerUp = (): void => {
      setIsResizingOutput(false);
      document.body.classList.remove('app-cli-resizing');
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, [updateOutputHeight]);

  React.useEffect(() => () => {
    document.body.classList.remove('app-cli-resizing');
  }, []);

  return (
    <div
      ref={stackRef}
      className={`app-cli-stack${isOutputCollapsed ? ' app-cli-stack--collapsed' : ''}`}
    >
      <div className="sr-only" aria-live="polite" aria-atomic="true" role="status">
        {screenReaderAnnouncement}
      </div>
      {!isOutputCollapsed && (
        <div
          className={`app-cli-resize-handle${isResizingOutput ? ' app-cli-resize-handle--active' : ''}`}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize output log"
          tabIndex={0}
          onDoubleClick={() => {
            updateOutputHeight(null);
          }}
          onPointerDown={handleResizePointerDown}
          onKeyDown={(event) => {
            if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') {
              return;
            }

            event.preventDefault();
            const currentHeight = getCurrentExpandedOutputHeight();
            const delta = event.key === 'ArrowUp' ? CLI_OUTPUT_RESIZE_STEP_PX : -CLI_OUTPUT_RESIZE_STEP_PX;
            updateOutputHeight(currentHeight + delta);
          }}
        >
          <span className="app-cli-resize-handle__grip" aria-hidden="true" />
        </div>
      )}
      <div
        ref={outputRef}
        className={`app-game-output${isOutputCollapsed ? ' app-game-output--collapsed' : ''}`}
        style={!isOutputCollapsed && outputHeight !== null
          ? {
            flex: '0 0 auto',
            height: `${outputHeight}px`,
          }
          : undefined}
      >
        <div
          id="app-game-output"
          className="app-game-output-content"
          role="log"
          aria-live="polite"
          aria-relevant="additions text"
          aria-atomic="false"
          aria-label="Game output log"
          ref={gameOutputRef}
          onClick={onGameOutputClick}
        >
          <div className="app-game-output-lines">
            {gameOutputLines.map((line, index) => (
              <div
                key={`game-output-line-${index}`}
                className={`app-game-output-line${line.length === 0 ? ' app-game-output-line--empty' : ''}`}
              >
                {line.length > 0 ? renderCliOutputLine(line) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
      <div ref={cliBarRef} className="app-cli-bar">
        <form
          className="app-cli-form"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
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
              placeholder={placeholderText}
              autoComplete="off"
              spellCheck={false}
              ref={cliInputRef}
              value={cliCommand}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={isSuggestionMenuOpen}
              aria-controls="app-cli-suggestion-list"
              aria-activedescendant={activeSuggestion?.id}
              onKeyDown={(event) => {
                if (event.key === '/' && !event.altKey && !event.ctrlKey && !event.metaKey) {
                  event.preventDefault();
                  event.stopPropagation();
                  if (consumeCliSlashFocusSuppression()) {
                    return;
                  }
                  onToggleSuggestions();
                  return;
                }

                if (event.key === 'Escape' && isSuggestionMenuInteractive) {
                  event.preventDefault();
                  event.stopPropagation();
                  onCloseSuggestions();
                  return;
                }

                if (event.key === 'Tab' && isSuggestionMenuInteractive) {
                  const accepted = onAcceptHighlightedSuggestion();
                  if (accepted) {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                  return;
                }

                if ((event.key === 'ArrowUp' || event.key === 'ArrowDown')
                  && isSuggestionMenuInteractive) {
                  event.preventDefault();
                  event.stopPropagation();
                  onCliSuggestionHighlightMove(event.key === 'ArrowUp' ? 'up' : 'down');
                  return;
                }

                if (event.key === 'Enter' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
                  event.preventDefault();
                  event.stopPropagation();
                  queueMicrotask(() => {
                    onSubmit();
                  });
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
                  onCliHistoryNavigate('up');
                  return;
                }

                if (cliHistoryIndex === null && cliHistoryDraft === cliCommand) {
                  return;
                }

                onCliHistoryNavigate('down');
              }}
              onChange={(event) => {
                onCliCommandChange(event.target.value);
                onCliCaretChange(event.target.selectionStart);
              }}
              onFocus={() => {
                setIsCliInputFocused(true);
                onCliInputFocus();
              }}
              onBlur={() => {
                setIsCliInputFocused(false);
                onCliInputBlur();
              }}
              onClick={(event) => {
                onCliCaretChange(event.currentTarget.selectionStart);
              }}
              onSelect={(event) => {
                onCliCaretChange(event.currentTarget.selectionStart);
              }}
              onKeyUp={(event) => {
                onCliCaretChange(event.currentTarget.selectionStart);
              }}
            />
            <input
              ref={cliImportInputRef}
              className="app-cli-import-input"
              type="file"
              accept=".txt,text/plain"
              tabIndex={-1}
              onChange={onImportScriptChange}
            />
          </div>
          {isSuggestionMenuOpen && (
            <div
              id="app-cli-suggestion-list"
              className="app-cli-suggestion-list"
              role="listbox"
              aria-label="CLI suggestions"
              ref={suggestionListRef}
            >
              {cliSuggestions.map((suggestion, index) => {
                const isActive = index === highlightedCliSuggestionIndex;
                const isPlaceholder = suggestion.kind === 'placeholder';
                return (
                  <div
                    key={suggestion.id}
                    id={suggestion.id}
                    ref={(element) => {
                      suggestionOptionRefs.current[index] = element;
                    }}
                    className={`app-cli-suggestion-option${isActive ? ' app-cli-suggestion-option--active' : ''}${isPlaceholder ? ' app-cli-suggestion-option--placeholder' : ''}`}
                    role="option"
                    aria-selected={isActive}
                    aria-disabled={isPlaceholder || undefined}
                    onMouseDown={(event) => {
                      event.preventDefault();
                      onCliSuggestionHighlightSet(index);
                    }}
                    onMouseEnter={() => {
                      onCliSuggestionHighlightSet(index);
                    }}
                    onClick={() => {
                      onAcceptHighlightedSuggestion();
                    }}
                  >
                    <span className="app-cli-suggestion-label">{suggestion.label}</span>
                  </div>
                );
              })}
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
