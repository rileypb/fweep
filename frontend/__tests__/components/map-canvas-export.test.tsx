import { beforeEach, describe, expect, it } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MapCanvas } from '../../src/components/map-canvas';
import { createEmptyMap, createRoom } from '../../src/domain/map-types';
import { addRoom } from '../../src/domain/map-operations';
import { useEditorStore } from '../../src/state/editor-store';

function resetStore(): void {
  useEditorStore.setState(useEditorStore.getInitialState());
}

describe('MapCanvas export flow', () => {
  beforeEach(() => {
    resetStore();
    useEditorStore.getState().loadDocument(createEmptyMap('Test'));
  });

  it('opens the export dialog from the header button', async () => {
    const user = userEvent.setup();
    render(<MapCanvas mapName="Test" />);

    await user.click(screen.getByRole('button', { name: 'Export PNG' }));

    expect(screen.getByTestId('export-png-dialog')).toBeInTheDocument();
  });

  it('opens the export dialog in selection scope when there is a selection', async () => {
    const user = userEvent.setup();
    const room = { ...createRoom('Kitchen'), id: 'room-1', position: { x: 40, y: 60 } };
    useEditorStore.getState().loadDocument(addRoom(createEmptyMap('Test'), room));
    useEditorStore.getState().selectRoom(room.id);

    render(<MapCanvas mapName="Test" />);

    await user.click(screen.getByRole('button', { name: 'Export PNG' }));

    expect(screen.getByLabelText('Scope')).toHaveValue('selection');
  });

  it('shows an export region overlay only in region mode', async () => {
    const user = userEvent.setup();
    render(<MapCanvas mapName="Test" />);

    await user.click(screen.getByRole('button', { name: 'Export PNG' }));
    await user.selectOptions(screen.getByLabelText('Scope'), 'region');
    await user.click(screen.getByRole('button', { name: 'Select Region' }));

    expect(screen.queryByTestId('export-png-dialog')).not.toBeInTheDocument();

    const canvas = screen.getByTestId('map-canvas');
    fireEvent.mouseDown(canvas, { clientX: 20, clientY: 30, button: 0 });
    fireEvent.mouseMove(document, { clientX: 140, clientY: 110 });
    fireEvent.mouseUp(document, { clientX: 140, clientY: 110 });

    expect(screen.getByTestId('export-png-dialog')).toBeInTheDocument();
    const overlay = screen.getByTestId('map-canvas-export-region');
    expect(overlay).toBeInTheDocument();
    expect(overlay).toHaveStyle({ width: '120px', height: '80px' });
  });
});
