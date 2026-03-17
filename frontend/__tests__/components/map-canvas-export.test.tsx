import { beforeEach, describe, expect, it, jest } from '@jest/globals';
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

  it('downloads the current map as JSON from the header button', async () => {
    const user = userEvent.setup();
    const room = { ...createRoom('Kitchen'), id: 'room-1', position: { x: 40, y: 60 } };
    useEditorStore.getState().loadDocument(addRoom(createEmptyMap('Test'), room));

    const createObjectURL = jest.fn<(blob: Blob) => string>().mockReturnValue('blob:map-json');
    const revokeObjectURL = jest.fn<(url: string) => void>();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, writable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, writable: true, value: revokeObjectURL });
    const clickSpy = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    render(<MapCanvas mapName="Test" />);

    await user.click(screen.getByRole('button', { name: 'Export JSON' }));

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const exportedBlob = createObjectURL.mock.calls[0][0];
    expect(exportedBlob).toBeInstanceOf(Blob);
    expect(exportedBlob.type).toBe('application/json');
    expect(clickSpy).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:map-json');
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

  it('clears the region overlay when the export dialog is closed', async () => {
    const user = userEvent.setup();
    render(<MapCanvas mapName="Test" />);

    await user.click(screen.getByRole('button', { name: 'Export PNG' }));
    await user.selectOptions(screen.getByLabelText('Scope'), 'region');
    await user.click(screen.getByRole('button', { name: 'Select Region' }));

    const canvas = screen.getByTestId('map-canvas');
    fireEvent.mouseDown(canvas, { clientX: 20, clientY: 30, button: 0 });
    fireEvent.mouseMove(document, { clientX: 140, clientY: 110 });
    fireEvent.mouseUp(document, { clientX: 140, clientY: 110 });

    expect(screen.getByTestId('map-canvas-export-region')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(screen.queryByTestId('export-png-dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('map-canvas-export-region')).not.toBeInTheDocument();
    expect(useEditorStore.getState().exportRegion).toBeNull();
  });
});
