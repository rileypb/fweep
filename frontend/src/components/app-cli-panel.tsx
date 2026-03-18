import React from 'react';
import type { CliSuggestion } from '../domain/cli-suggestions';

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
  readonly onCliHistoryNavigate: (direction: 'up' | 'down') => void;
  readonly onCliSuggestionHighlightMove: (direction: 'up' | 'down') => void;
  readonly onCliSuggestionHighlightSet: (index: number) => void;
  readonly onAcceptHighlightedSuggestion: () => boolean;
  readonly onCloseSuggestions: () => void;
  readonly onToggleOutputCollapsed: () => void;
  readonly onImportScriptChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
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
  onCliHistoryNavigate,
  onCliSuggestionHighlightMove,
  onCliSuggestionHighlightSet,
  onAcceptHighlightedSuggestion,
  onCloseSuggestions,
  onToggleOutputCollapsed,
  onImportScriptChange,
}: AppCliPanelProps): React.JSX.Element {
  const activeSuggestion = isSuggestionMenuOpen
    ? cliSuggestions[highlightedCliSuggestionIndex] ?? null
    : null;

  return (
    <div className={`app-cli-stack${isOutputCollapsed ? ' app-cli-stack--collapsed' : ''}`}>
      <div
        id="app-game-output"
        className={`app-game-output${isOutputCollapsed ? ' app-game-output--collapsed' : ''}`}
        role="log"
        aria-live="polite"
        aria-relevant="additions text"
        aria-atomic="false"
        aria-label="Game output log"
        ref={gameOutputRef}
        onClick={onGameOutputClick}
      >
        <div className="app-game-output-content">
          {gameOutputLines.map((line, index) => (
            <React.Fragment key={`game-output-line-${index}`}>
              {renderCliOutputLine(line)}
              {index < gameOutputLines.length - 1 ? '\n' : null}
            </React.Fragment>
          ))}
        </div>
      </div>
      <div className="app-cli-bar">
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
              placeholder={hasUsedCliInput ? '' : 'Type help'}
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
                if (event.key === 'Escape' && isSuggestionMenuOpen) {
                  event.preventDefault();
                  event.stopPropagation();
                  onCloseSuggestions();
                  return;
                }

                if (event.key === 'Tab' && isSuggestionMenuOpen) {
                  const accepted = onAcceptHighlightedSuggestion();
                  if (accepted) {
                    event.preventDefault();
                    event.stopPropagation();
                  }
                  return;
                }

                if ((event.key === 'ArrowUp' || event.key === 'ArrowDown')
                  && isSuggestionMenuOpen
                  && (cliCommand.trim().length > 0 || cliHistory.length === 0)) {
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
              onFocus={onCliInputFocus}
              onBlur={onCliInputBlur}
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
            <button
              className="app-cli-collapse-button"
              type="button"
              aria-label={isOutputCollapsed ? 'Expand output log' : 'Collapse output log'}
              title={isOutputCollapsed ? 'Expand output log' : 'Collapse output log'}
              onClick={onToggleOutputCollapsed}
            >
              {isOutputCollapsed ? 'More' : 'Less'}
            </button>
            <input
              ref={cliImportInputRef}
              className="app-cli-import-input"
              type="file"
              accept=".txt,text/plain"
              tabIndex={-1}
              onChange={onImportScriptChange}
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
          {isSuggestionMenuOpen && (
            <div
              id="app-cli-suggestion-list"
              className="app-cli-suggestion-list"
              role="listbox"
              aria-label="CLI suggestions"
            >
              {cliSuggestions.map((suggestion, index) => {
                const isActive = index === highlightedCliSuggestionIndex;
                const isPlaceholder = suggestion.kind === 'placeholder';
                return (
                  <div
                    key={suggestion.id}
                    id={suggestion.id}
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
