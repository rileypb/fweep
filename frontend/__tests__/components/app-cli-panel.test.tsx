import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { AppCliPanel } from '../../src/components/app-cli-panel';

function createProps(overrides: Partial<React.ComponentProps<typeof AppCliPanel>> = {}): React.ComponentProps<typeof AppCliPanel> {
  return {
    gameOutputRef: { current: null },
    gameOutputLines: ['hello world'],
    onGameOutputClick: jest.fn(),
    cliInputRef: { current: null },
    cliImportInputRef: { current: null },
    cliCommand: '',
    hasUsedCliInput: true,
    cliHistory: [],
    cliHistoryIndex: null,
    cliHistoryDraft: '',
    cliSuggestions: [],
    highlightedCliSuggestionIndex: 0,
    isSuggestionMenuOpen: false,
    isOutputCollapsed: false,
    isImportingScript: false,
    onSubmit: jest.fn(),
    onCliCommandChange: jest.fn(),
    onCliInputFocus: jest.fn(),
    onCliInputBlur: jest.fn(),
    onCliCaretChange: jest.fn(),
    onToggleSuggestions: jest.fn(),
    consumeCliSlashFocusSuppression: jest.fn(() => false),
    onCliHistoryNavigate: jest.fn(),
    onCliSuggestionHighlightMove: jest.fn(),
    onCliSuggestionHighlightSet: jest.fn(),
    onAcceptHighlightedSuggestion: jest.fn(() => false),
    onCloseSuggestions: jest.fn(),
    onToggleOutputCollapsed: jest.fn(),
    onImportScriptChange: jest.fn(),
    ...overrides,
  };
}

describe('AppCliPanel', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('renders a resize handle when the output log is expanded', () => {
    render(<AppCliPanel {...createProps()} />);

    expect(screen.getByRole('separator', { name: 'Resize output log' })).toBeInTheDocument();
  });

  it('does not render a resize handle when the output log is collapsed', () => {
    render(<AppCliPanel {...createProps({ isOutputCollapsed: true })} />);

    expect(screen.queryByRole('separator', { name: 'Resize output log' })).not.toBeInTheDocument();
  });

  it('supports keyboard resizing from the separator', () => {
    render(<AppCliPanel {...createProps()} />);

    const separator = screen.getByRole('separator', { name: 'Resize output log' });
    const output = screen.getByText('hello world').closest('.app-game-output');

    fireEvent.keyDown(separator, { key: 'ArrowUp' });

    expect(output).toHaveStyle({ height: '180px' });
  });
});
