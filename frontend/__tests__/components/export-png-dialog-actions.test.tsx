import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addRoom } from '../../src/domain/map-operations';
import { createEmptyMap, createRoom } from '../../src/domain/map-types';
import { useEditorStore } from '../../src/state/editor-store';

type RenderExportCanvasFn = (input: import('../../src/export/export-types').ExportRenderInput) => Promise<HTMLCanvasElement>;
type ExportPngToDownloadFn = (args: {
  readonly mapName: string;
  readonly scope: import('../../src/export/export-types').ExportScope;
  readonly canvas: HTMLCanvasElement;
}) => Promise<void>;

const mockRenderExportCanvas = jest.fn<RenderExportCanvasFn>();
const mockExportPngToDownload = jest.fn<ExportPngToDownloadFn>();

await jest.unstable_mockModule('../../src/export/export-render', () => ({
  renderExportCanvas: mockRenderExportCanvas,
}));

await jest.unstable_mockModule('../../src/export/export-png', () => ({
  exportPngToDownload: mockExportPngToDownload,
}));

const { ExportPngDialog } = await import('../../src/components/export-png-dialog');

function resetStore(): void {
  useEditorStore.setState(useEditorStore.getInitialState());
}

describe('ExportPngDialog actions', () => {
  beforeEach(() => {
    resetStore();
    document.documentElement.setAttribute('data-theme', 'light');
    mockRenderExportCanvas.mockReset();
    mockExportPngToDownload.mockReset();
  });

  function loadDocWithSelection(): string {
    const room = { ...createRoom('Kitchen'), id: 'room-1', position: { x: 40, y: 60 } };
    useEditorStore.getState().loadDocument(addRoom(createEmptyMap('Export Test'), room));
    useEditorStore.getState().selectRoom(room.id);
    return room.id;
  }

  it('closes from cancel, close button, and backdrop and clears export region', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn<() => void>();
    loadDocWithSelection();
    useEditorStore.getState().beginExportRegion({ x: 10, y: 20 });
    useEditorStore.getState().updateExportRegion({ x: 30, y: 40 });
    useEditorStore.getState().commitExportRegion();

    const { unmount } = render(
      <ExportPngDialog
        isOpen
        mapName="Export Test"
        onClose={onClose}
        canvasViewportSize={{ width: 800, height: 600 }}
        panOffset={{ x: 0, y: 0 }}
        onScopeChange={() => {}}
        onRequestRegionSelection={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(useEditorStore.getState().exportRegion).toBeNull();

    unmount();
    useEditorStore.getState().beginExportRegion({ x: 10, y: 20 });
    useEditorStore.getState().updateExportRegion({ x: 30, y: 40 });
    useEditorStore.getState().commitExportRegion();
    render(
      <ExportPngDialog
        isOpen
        mapName="Export Test"
        onClose={onClose}
        canvasViewportSize={{ width: 800, height: 600 }}
        panOffset={{ x: 0, y: 0 }}
        onScopeChange={() => {}}
        onRequestRegionSelection={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Close export dialog' }));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(useEditorStore.getState().exportRegion).toBeNull();

    fireEvent.click(screen.getByTestId('export-png-overlay').firstElementChild as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('preserves shared settings when switching scopes', async () => {
    const user = userEvent.setup();
    loadDocWithSelection();

    render(
      <ExportPngDialog
        isOpen
        mapName="Export Test"
        onClose={() => {}}
        canvasViewportSize={{ width: 800, height: 600 }}
        panOffset={{ x: 0, y: 0 }}
        onScopeChange={() => {}}
        onRequestRegionSelection={() => {}}
      />,
    );

    await user.selectOptions(screen.getByLabelText('Scale'), '4');
    await user.selectOptions(screen.getByLabelText('Background'), 'transparent');
    await user.click(screen.getByLabelText('Include background drawing'));
    await user.click(screen.getByLabelText('Include grid'));
    await user.selectOptions(screen.getByLabelText('Scope'), 'viewport');

    expect(screen.getByLabelText('Scale')).toHaveValue('4');
    expect(screen.getByLabelText('Background')).toHaveValue('transparent');
    expect(screen.getByLabelText('Include background drawing')).not.toBeChecked();
    expect(screen.getByLabelText('Include grid')).toBeChecked();
    expect(screen.getByLabelText('Padding')).toHaveValue(0);
  });

  it('renders and downloads a png successfully', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn<() => void>();
    loadDocWithSelection();
    const fakeCanvas = {} as HTMLCanvasElement;
    mockRenderExportCanvas.mockResolvedValue(fakeCanvas);
    mockExportPngToDownload.mockResolvedValue(undefined);

    render(
      <ExportPngDialog
        isOpen
        mapName="Export Test"
        onClose={onClose}
        canvasViewportSize={{ width: 800, height: 600 }}
        panOffset={{ x: 0, y: 0 }}
        onScopeChange={() => {}}
        onRequestRegionSelection={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Export PNG' }));

    await waitFor(() => {
      expect(mockRenderExportCanvas).toHaveBeenCalledTimes(1);
    });
    expect(mockExportPngToDownload).toHaveBeenCalledTimes(1);
    expect(mockExportPngToDownload.mock.calls[0]?.[0]).toEqual({
      mapName: 'Export Test',
      scope: 'selection',
      canvas: fakeCanvas,
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows a runtime error when export rendering fails and recovers the button state', async () => {
    const user = userEvent.setup();
    loadDocWithSelection();
    mockRenderExportCanvas.mockRejectedValue(new Error('Render failed.'));

    render(
      <ExportPngDialog
        isOpen
        mapName="Export Test"
        onClose={() => {}}
        canvasViewportSize={{ width: 800, height: 600 }}
        panOffset={{ x: 0, y: 0 }}
        onScopeChange={() => {}}
        onRequestRegionSelection={() => {}}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Export PNG' }));

    expect(await screen.findByText('Render failed.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Export PNG' })).toBeEnabled();
    expect(mockExportPngToDownload).not.toHaveBeenCalled();
  });
});
