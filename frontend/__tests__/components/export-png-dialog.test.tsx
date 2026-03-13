import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ExportPngDialog } from '../../src/components/export-png-dialog';
import { createEmptyMap, createRoom } from '../../src/domain/map-types';
import { addRoom } from '../../src/domain/map-operations';
import { useEditorStore } from '../../src/state/editor-store';

function resetStore(): void {
  useEditorStore.setState(useEditorStore.getInitialState());
}

describe('ExportPngDialog', () => {
  beforeEach(() => {
    resetStore();
    document.documentElement.setAttribute('data-theme', 'light');
    (globalThis as typeof globalThis & { __FWEEP_TEST_ENABLE_DRAWING_INTERFACE__?: boolean })
      .__FWEEP_TEST_ENABLE_DRAWING_INTERFACE__ = false;
  });

  it('defaults to entire-map when selection is empty', () => {
    useEditorStore.getState().loadDocument(createEmptyMap('Test'));
    const onScopeChange = jest.fn<(scope: 'entire-map' | 'viewport' | 'selection' | 'region') => void>();

    render(
      <ExportPngDialog
        isOpen
        mapName="Test"
        onClose={() => {}}
        canvasViewportSize={{ width: 800, height: 600 }}
        panOffset={{ x: 0, y: 0 }}
        onScopeChange={onScopeChange}
        onRequestRegionSelection={() => {}}
      />,
    );

    expect(screen.getByLabelText('Scope')).toHaveValue('entire-map');
    expect(screen.getByRole('option', { name: 'Selection' })).toBeDisabled();
    expect(onScopeChange).toHaveBeenCalledWith('entire-map');
  });

  it('defaults to selection when a selection exists', () => {
    const room = { ...createRoom('Kitchen'), id: 'room-1', position: { x: 40, y: 60 } };
    useEditorStore.getState().loadDocument(addRoom(createEmptyMap('Test'), room));
    useEditorStore.getState().selectRoom(room.id);

    render(
      <ExportPngDialog
        isOpen
        mapName="Test"
        onClose={() => {}}
        canvasViewportSize={{ width: 800, height: 600 }}
        panOffset={{ x: 0, y: 0 }}
        onScopeChange={() => {}}
        onRequestRegionSelection={() => {}}
      />,
    );

    expect(screen.getByLabelText('Scope')).toHaveValue('selection');
  });

  it('disables export for region before a region is chosen', async () => {
    const user = userEvent.setup();
    const onRequestRegionSelection = jest.fn<() => void>();
    useEditorStore.getState().loadDocument(createEmptyMap('Test'));

    render(
      <ExportPngDialog
        isOpen
        mapName="Test"
        onClose={() => {}}
        canvasViewportSize={{ width: 800, height: 600 }}
        panOffset={{ x: 0, y: 0 }}
        onScopeChange={() => {}}
        onRequestRegionSelection={onRequestRegionSelection}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Scope'), 'region');

    expect(screen.getByText('Select Region, then drag on the canvas.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Select Region' }));
    expect(onRequestRegionSelection).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Export PNG' })).toBeDisabled();
  });

  it('clears the region on first escape and closes on second escape', async () => {
    const onClose = jest.fn<() => void>();
    useEditorStore.getState().loadDocument(createEmptyMap('Test'));
    useEditorStore.getState().beginExportRegion({ x: 10, y: 20 });
    useEditorStore.getState().updateExportRegion({ x: 90, y: 120 });
    useEditorStore.getState().commitExportRegion();

    render(
      <ExportPngDialog
        isOpen
        mapName="Test"
        onClose={onClose}
        canvasViewportSize={{ width: 800, height: 600 }}
        panOffset={{ x: 0, y: 0 }}
        onScopeChange={() => {}}
        onRequestRegionSelection={() => {}}
      />,
    );

    fireEvent.change(screen.getByLabelText('Scope'), { target: { value: 'region' } });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useEditorStore.getState().exportRegion).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
