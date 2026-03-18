import React from 'react';

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
  readonly isOutputCollapsed: boolean;
  readonly isImportingScript: boolean;
  readonly onSubmit: () => void;
  readonly onCliCommandChange: (value: string) => void;
  readonly onCliHistoryNavigate: (direction: 'up' | 'down') => void;
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
  isOutputCollapsed,
  isImportingScript,
  onSubmit,
  onCliCommandChange,
  onCliHistoryNavigate,
  onToggleOutputCollapsed,
  onImportScriptChange,
}: AppCliPanelProps): React.JSX.Element {
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
              onKeyDown={(event) => {
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
        </form>
      </div>
    </div>
  );
}
