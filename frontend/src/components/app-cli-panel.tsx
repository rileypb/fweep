import type React from 'react';

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
  readonly isImportingScript: boolean;
  readonly onSubmit: () => void;
  readonly onCliCommandChange: (value: string) => void;
  readonly onCliHistoryNavigate: (direction: 'up' | 'down') => void;
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
  isImportingScript,
  onSubmit,
  onCliCommandChange,
  onCliHistoryNavigate,
  onImportScriptChange,
}: AppCliPanelProps): React.JSX.Element {
  return (
    <div className="app-cli-stack">
      <div
        id="app-game-output"
        className="app-game-output"
        role="textbox"
        aria-multiline="true"
        aria-readonly="true"
        aria-label="Game output"
        ref={gameOutputRef}
        onClick={onGameOutputClick}
      >
        <div className="app-game-output-content">
          {gameOutputLines.join('\n')}
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
                  onSubmit();
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
