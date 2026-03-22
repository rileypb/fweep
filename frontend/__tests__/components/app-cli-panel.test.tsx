import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  AppCliPanel,
  clampCliOutputHeight,
  loadStoredCliOutputHeight,
  renderCliOutputLine,
  storeCliOutputHeight,
} from '../../src/components/app-cli-panel';

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

  it('loads, stores, and clamps the output height safely', () => {
    expect(loadStoredCliOutputHeight()).toBeNull();

    window.localStorage.setItem('fweep-cli-output-height', '179');
    expect(loadStoredCliOutputHeight()).toBeNull();

    storeCliOutputHeight(221.7);
    expect(loadStoredCliOutputHeight()).toBe(222);

    storeCliOutputHeight(null);
    expect(window.localStorage.getItem('fweep-cli-output-height')).toBeNull();
    expect(clampCliOutputHeight(100, 200)).toBe(180);
    expect(clampCliOutputHeight(500, 240)).toBe(240);
  });

  it('renders bold output fragments and empty lines safely', () => {
    const { container, rerender } = render(<div>{renderCliOutputLine('plain **bold** text')}</div>);

    expect(container.querySelector('strong')).toHaveTextContent('bold');
    expect(container).toHaveTextContent('plain bold text');

    rerender(<div>{renderCliOutputLine('')}</div>);

    expect(container.firstChild).toBeEmptyDOMElement();
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

  it('resets the output height on separator double-click', () => {
    window.localStorage.setItem('fweep-cli-output-height', '260');
    render(<AppCliPanel {...createProps()} />);

    const separator = screen.getByRole('separator', { name: 'Resize output log' });
    const output = screen.getByText('hello world').closest('.app-game-output');

    expect(output).toHaveStyle({ height: '260px' });

    fireEvent.doubleClick(separator);

    expect(output).not.toHaveStyle({ height: '260px' });
    expect(window.localStorage.getItem('fweep-cli-output-height')).toBeNull();
  });

  it('reports output top changes and supports pointer resizing from the handle', () => {
    const onOutputTopChange = jest.fn();
    const originalResizeObserver = globalThis.ResizeObserver;
    const addEventListenerSpy = jest.spyOn(window, 'addEventListener');
    const removeEventListenerSpy = jest.spyOn(window, 'removeEventListener');
    // Force the window-resize fallback branch.
    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: undefined,
    });

    const { container, unmount } = render(<AppCliPanel {...createProps({ onOutputTopChange })} />);

    const stack = container.querySelector('.app-cli-stack') as HTMLDivElement;
    const output = container.querySelector('.app-game-output') as HTMLDivElement;
    const cliBar = container.querySelector('.app-cli-bar') as HTMLDivElement;
    const separator = screen.getByRole('separator', { name: 'Resize output log' });

    expect(stack).not.toBeNull();
    expect(output).not.toBeNull();
    expect(cliBar).not.toBeNull();

    stack.getBoundingClientRect = jest.fn(() => ({
      x: 0, y: 0, width: 400, height: 500, top: 0, right: 400, bottom: 500, left: 0, toJSON: () => ({}),
    }));
    output.getBoundingClientRect = jest.fn(() => ({
      x: 0, y: 140, width: 400, height: 220, top: 140, right: 400, bottom: 360, left: 0, toJSON: () => ({}),
    }));
    cliBar.getBoundingClientRect = jest.fn(() => ({
      x: 0, y: 420, width: 400, height: 68, top: 420, right: 400, bottom: 488, left: 0, toJSON: () => ({}),
    }));

    fireEvent.pointerDown(separator, { clientY: 240 });
    expect(document.body).toHaveClass('app-cli-resizing');
    fireEvent.pointerMove(window, { clientY: 210 });
    fireEvent.pointerUp(window);

    expect(document.body).not.toHaveClass('app-cli-resizing');
    expect(onOutputTopChange).toHaveBeenCalledWith(140);
    expect(addEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));

    unmount();

    expect(removeEventListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(onOutputTopChange).toHaveBeenCalledWith(null);

    Object.defineProperty(globalThis, 'ResizeObserver', {
      configurable: true,
      writable: true,
      value: originalResizeObserver,
    });
  });

  it('handles suggestion and history keyboard shortcuts from the CLI input', () => {
    const onToggleSuggestions = jest.fn();
    const onCloseSuggestions = jest.fn();
    const onAcceptHighlightedSuggestion = jest.fn(() => true);
    const onCliSuggestionHighlightMove = jest.fn();
    const onCliHistoryNavigate = jest.fn();
    const onSubmit = jest.fn();

    render(
      <AppCliPanel
        {...createProps({
          cliHistory: ['look'],
          cliCommand: 'look',
          cliHistoryDraft: '',
          isSuggestionMenuOpen: true,
          cliSuggestions: [{
            id: 'suggestion-1',
            kind: 'command',
            label: 'look',
            insertText: 'look',
            detail: null,
          }],
          onToggleSuggestions,
          onCloseSuggestions,
          onAcceptHighlightedSuggestion,
          onCliSuggestionHighlightMove,
          onCliHistoryNavigate,
          onSubmit,
        })}
      />,
    );

    const input = screen.getByRole('combobox', { name: /cli command/i });
    fireEvent.focus(input);

    fireEvent.keyDown(input, { key: '/', code: 'Slash' });
    fireEvent.keyDown(input, { key: 'Escape' });
    fireEvent.keyDown(input, { key: 'Tab' });
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(onToggleSuggestions).toHaveBeenCalledTimes(1);
    expect(onCloseSuggestions).toHaveBeenCalledTimes(1);
    expect(onAcceptHighlightedSuggestion).toHaveBeenCalledTimes(1);
    expect(onCliSuggestionHighlightMove).toHaveBeenCalledWith('up');

    return Promise.resolve().then(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onCliHistoryNavigate).not.toHaveBeenCalled();
    });
  });

  it('suppresses slash focus toggles and ignores downward history when already at the draft', () => {
    const onToggleSuggestions = jest.fn();
    const onCliHistoryNavigate = jest.fn();
    render(
      <AppCliPanel
        {...createProps({
          cliHistory: ['look'],
          cliCommand: 'look',
          cliHistoryIndex: null,
          cliHistoryDraft: 'look',
          consumeCliSlashFocusSuppression: jest.fn(() => true),
          onToggleSuggestions,
          onCliHistoryNavigate,
        })}
      />,
    );

    const input = screen.getByRole('combobox', { name: /cli command/i });
    fireEvent.keyDown(input, { key: '/', code: 'Slash' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    expect(onToggleSuggestions).not.toHaveBeenCalled();
    expect(onCliHistoryNavigate).not.toHaveBeenCalled();
  });
});
