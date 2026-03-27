import { beforeEach, describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react';
import jestAxe from 'jest-axe';
import { ConnectionEditorOverlay, RoomEditorOverlay } from '../../src/components/map-canvas-overlays';
import { ExportPngDialog } from '../../src/components/export-png-dialog';
import { HelpDialog } from '../../src/components/help-dialog';
import { MapSelectionDialog } from '../../src/components/map-selection-dialog';
import { TipsDialog } from '../../src/components/tips-dialog';
import { addConnection, addRoom } from '../../src/domain/map-operations';
import { createConnection, createEmptyMap, createRoom } from '../../src/domain/map-types';
import { useEditorStore } from '../../src/state/editor-store';

function resetStore(): void {
  useEditorStore.setState(useEditorStore.getInitialState());
}

const { axe } = jestAxe;

describe('accessibility smoke tests', () => {
  beforeEach(() => {
    resetStore();
  });

  it('has no obvious violations on the map selection dialog', async () => {
    const { container } = render(<MapSelectionDialog onMapSelected={() => undefined} />);

    const result = await axe(container);
    expect(result.violations).toEqual([]);
  });

  it('has no obvious violations on the help dialog', async () => {
    const { container } = render(<HelpDialog isOpen onClose={() => undefined} />);

    const result = await axe(container);
    expect(result.violations).toEqual([]);
  });

  it('has no obvious violations on the export dialog', async () => {
    useEditorStore.getState().loadDocument(createEmptyMap('Test'));
    const { container } = render(
      <ExportPngDialog
        isOpen
        mapName="Test"
        onClose={() => undefined}
        canvasViewportSize={{ width: 800, height: 600 }}
        panOffset={{ x: 0, y: 0 }}
        onScopeChange={() => undefined}
        onRequestRegionSelection={() => undefined}
      />,
    );

    const result = await axe(container);
    expect(result.violations).toEqual([]);
  });

  it('has no obvious violations on the tips dialog', async () => {
    const { container } = render(
      <TipsDialog
        isOpen
        showTipsOnStartup
        onClose={() => undefined}
        onShowTipsOnStartupChange={() => undefined}
      />,
    );

    const result = await axe(container);
    expect(result.violations).toEqual([]);
  });

  it('has no obvious violations on the room editor overlay', async () => {
    const room = { ...createRoom('Kitchen'), id: 'room-1', position: { x: 80, y: 120 } };
    useEditorStore.getState().loadDocument(addRoom(createEmptyMap('Test'), room));

    const { container } = render(
      <RoomEditorOverlay
        roomId={room.id}
        theme="light"
        onClose={() => undefined}
        onBackdropClose={() => undefined}
      />,
    );

    const result = await axe(container);
    expect(result.violations).toEqual([]);
  });

  it('has no obvious violations on the connection editor overlay', async () => {
    const kitchen = { ...createRoom('Kitchen'), id: 'room-1', position: { x: 80, y: 120 } };
    const hallway = { ...createRoom('Hallway'), id: 'room-2', position: { x: 240, y: 120 } };
    let doc = addRoom(createEmptyMap('Test'), kitchen);
    doc = addRoom(doc, hallway);
    const connection = createConnection(kitchen.id, hallway.id, true);
    doc = addConnection(doc, connection, 'east', 'west');
    useEditorStore.getState().loadDocument(doc);

    const { container } = render(
      <ConnectionEditorOverlay
        connectionId={connection.id}
        onClose={() => undefined}
        onBackdropClose={() => undefined}
      />,
    );

    const result = await axe(container);
    expect(result.violations).toEqual([]);
  });
});
