import { describe, it, expect, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SnapToggle } from '../../src/components/snap-toggle';
import { createEmptyMap } from '../../src/domain/map-types';
import { useEditorStore } from '../../src/state/editor-store';

function resetStore(): void {
  useEditorStore.setState(useEditorStore.getInitialState());
}

describe('SnapToggle', () => {
  beforeEach(() => {
    resetStore();
  });

  it('renders a button with an accessible label', () => {
    render(<SnapToggle />);
    expect(screen.getByRole('button', { name: /disable grid snapping/i })).toBeInTheDocument();
  });

  it('toggles grid snapping in the editor store', async () => {
    const user = userEvent.setup();
    render(<SnapToggle />);

    await user.click(screen.getByRole('button', { name: /disable grid snapping/i }));
    expect(useEditorStore.getState().snapToGridEnabled).toBe(false);

    expect(screen.getByRole('button', { name: /enable grid snapping/i })).toBeInTheDocument();
  });

  it('persists the snap toggle into the loaded map view', async () => {
    const user = userEvent.setup();
    useEditorStore.getState().loadDocument(createEmptyMap('Test'));

    render(<SnapToggle />);

    await user.click(screen.getByRole('button', { name: /disable grid snapping/i }));

    expect(useEditorStore.getState().doc?.view.snapToGrid).toBe(false);
  });
});
