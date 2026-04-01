interface CliHelpPanelProps {
  readonly isOpen: boolean;
  readonly onToggle: () => void;
}

export function CliHelpPanel({ isOpen, onToggle }: CliHelpPanelProps): React.JSX.Element {
  return (
    <aside
      className={`cli-help-panel${isOpen ? ' cli-help-panel--open' : ''}`}
      aria-label="CLI help panel"
      data-testid="cli-help-panel"
    >
      <div className="cli-help-panel__header">
        <button
          type="button"
          className="cli-help-panel__toggle"
          aria-label={isOpen ? 'Collapse CLI help panel' : 'Expand CLI help panel'}
          aria-expanded={isOpen}
          aria-controls="cli-help-panel-body"
          onClick={onToggle}
        >
          <svg
            className={`cli-help-panel__arrow${isOpen ? ' cli-help-panel__arrow--open' : ''}`}
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M7.5 2.25 3.75 6l3.75 3.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span className="cli-help-panel__title">help</span>
      </div>
      <div
        id="cli-help-panel-body"
        className="cli-help-panel__body"
        aria-hidden={!isOpen}
      />
    </aside>
  );
}
