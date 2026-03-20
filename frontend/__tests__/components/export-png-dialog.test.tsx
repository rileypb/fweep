import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
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

  it('defaults the background image export option to enabled', () => {
    useEditorStore.getState().loadDocument({
      ...createEmptyMap('Test'),
      background: {
        ...createEmptyMap('Test').background,
        referenceImage: {
          id: 'background-image-1',
          name: 'overlay.png',
          mimeType: 'image/png',
          dataUrl: 'data:image/png;base64,AAAA',
          sourceUrl: null,
          width: 640,
          height: 480,
          zoom: 1,
          position: { x: 0, y: 0 },
        },
      },
    });

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

    expect(screen.getByLabelText('Include background image')).toBeChecked();
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

  it('moves focus into the dialog, traps Tab, and restores focus on close', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn<() => void>();
    useEditorStore.getState().loadDocument(createEmptyMap('Test'));

    function Harness(): React.JSX.Element {
      const [isOpen, setIsOpen] = React.useState(false);

      return (
        <>
          <button type="button" onClick={() => setIsOpen(true)}>Open export</button>
          <button type="button">After export</button>
          <ExportPngDialog
            isOpen={isOpen}
            mapName="Test"
            onClose={() => {
              onClose();
              setIsOpen(false);
            }}
            canvasViewportSize={{ width: 800, height: 600 }}
            panOffset={{ x: 0, y: 0 }}
            onScopeChange={() => {}}
            onRequestRegionSelection={() => {}}
          />
        </>
      );
    }

    render(<Harness />);

    const openButton = screen.getByRole('button', { name: /open export/i });
    await user.click(openButton);

    expect(screen.getByLabelText('Scope')).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: /close export dialog/i })).toHaveFocus();

    await user.tab({ shift: true });
    expect(screen.getByTestId('export-png-dialog')).toContainElement(document.activeElement as HTMLElement | SVGElement | null);

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(openButton).toHaveFocus();
    });
  });
});
