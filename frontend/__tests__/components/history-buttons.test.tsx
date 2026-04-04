import { beforeEach, describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import { UndoButton } from '../../src/components/undo-button';
import { RedoButton } from '../../src/components/redo-button';
import { createEmptyMap } from '../../src/domain/map-types';
import { useEditorStore } from '../../src/state/editor-store';

function resetStore(): void {
  useEditorStore.setState(useEditorStore.getInitialState());
}

describe('history buttons', () => {
  beforeEach(() => {
    resetStore();
  });

  it('does not highlight undo or redo when no history is available', () => {
    render(
      <>
        <UndoButton />
        <RedoButton />
      </>,
    );

    expect(screen.getByRole('button', { name: /undo/i })).not.toHaveClass('app-control-button--active-history');
    expect(screen.getByRole('button', { name: /redo/i })).not.toHaveClass('app-control-button--active-history');
    expect(screen.getByRole('button', { name: /undo/i })).toHaveAttribute('data-shortcut', 'Cmd/Ctrl+Z');
    expect(screen.getByRole('button', { name: /redo/i })).toHaveAttribute('data-shortcut', 'Cmd+Shift+Z / Ctrl+Y');
  });

  it('highlights undo when there is undo history', () => {
    const doc = createEmptyMap('Test');
    useEditorStore.getState().loadDocument(doc);
    useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 0, y: 0 });

    render(<UndoButton />);

    expect(screen.getByRole('button', { name: /undo/i })).toHaveClass('app-control-button--active-history');
  });

  it('highlights redo when there is redo history', () => {
    const doc = createEmptyMap('Test');
    useEditorStore.getState().loadDocument(doc);
    useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 0, y: 0 });
    useEditorStore.getState().undo();

    render(<RedoButton />);

    expect(screen.getByRole('button', { name: /redo/i })).toHaveClass('app-control-button--active-history');
  });
});
