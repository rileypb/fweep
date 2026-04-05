import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';
import { addConnection, addItem, addRoom } from '../../src/domain/map-operations';
import { createConnection, createEmptyMap, createItem, createRoom } from '../../src/domain/map-types';
import { useAppCli } from '../../src/hooks/use-app-cli';
import { useEditorStore } from '../../src/state/editor-store';
import type { MapDocument } from '../../src/domain/map-types';
import type { MapZoomRequest, RoomUiRequest, ViewportFocusRequest } from '../../src/hooks/use-app-cli';

function createOptions(activeMap: MapDocument | null = createEmptyMap('CLI Map')) {
  return {
    activeMap,
    loadDocument: jest.fn<(doc: MapDocument) => void>(),
    unloadDocument: jest.fn<() => void>(),
    chooseGame: jest.fn<() => void>(),
    onOpenCliHelpPanel: jest.fn<() => void>(),
    routeCrossInputCommandToParchment: jest.fn<(command: string) => boolean>().mockReturnValue(false),
    requestedRoomEditorRequest: null,
    requestedRoomRevealRequest: null,
    requestedViewportFocusRequest: null,
    requestedMapZoomRequest: null,
    setRequestedRoomEditorRequest: jest.fn<(request: RoomUiRequest | null) => void>(),
    setRequestedRoomRevealRequest: jest.fn<(request: RoomUiRequest | null) => void>(),
    setRequestedViewportFocusRequest: jest.fn<(request: ViewportFocusRequest | null) => void>(),
    setRequestedMapZoomRequest: jest.fn<(request: MapZoomRequest | null) => void>(),
  };
}

function createStoreBackedOptions(activeMap: MapDocument | null = createEmptyMap('CLI Map')) {
  return {
    ...createOptions(activeMap),
    loadDocument: (doc: MapDocument) => {
      useEditorStore.getState().loadDocument(doc);
    },
    unloadDocument: () => {
      useEditorStore.getState().unloadDocument();
    },
  };
}

beforeEach(() => {
  jest.restoreAllMocks();
  window.localStorage.clear();
  useEditorStore.setState(useEditorStore.getInitialState());
});

describe('useAppCli', () => {
  it('loads cached CLI output for the active map and persists the restored snapshot', async () => {
    const doc = createEmptyMap('Cached CLI Map');
    const cachedLines = ['**fweep**', 'An interactive map creator by Phil Riley', 'Release 0000000 / Serial number 000000', '', '>show kitchen', 'Shown.', ''];
    const options = createOptions(doc);

    window.localStorage.setItem(`fweep-cli-output:${doc.metadata.id}`, JSON.stringify(cachedLines));

    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(options.loadDocument).toHaveBeenCalledWith(expect.objectContaining({
        metadata: expect.objectContaining({ id: doc.metadata.id }),
        cliOutputLines: doc.cliOutputLines,
      }));
    });

    expect(result.current.gameOutputLines).toEqual(cachedLines);
  });

  it('ignores malformed cached CLI output snapshots', async () => {
    const doc = createEmptyMap('Malformed Cache Map');
    const options = createOptions(doc);
    window.localStorage.setItem(`fweep-cli-output:${doc.metadata.id}`, '{not json');

    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(options.loadDocument).toHaveBeenCalledWith(expect.objectContaining({
        metadata: expect.objectContaining({ id: doc.metadata.id }),
      }));
    });

    expect(result.current.gameOutputLines).toEqual(doc.cliOutputLines);
  });

  it('routes backslash-prefixed commands to parchment when available', () => {
    const options = createOptions(null);
    options.routeCrossInputCommandToParchment.mockReturnValue(true);
    const { result } = renderHook(() => useAppCli(options));
    let submission: ReturnType<typeof result.current.submitCliCommandText> | null = null;

    act(() => {
      submission = result.current.submitCliCommandText('\\look', {
        clearInputState: false,
        selectCliInput: false,
      });
    });

    expect(options.routeCrossInputCommandToParchment).toHaveBeenCalledWith('look');
    expect(submission).toEqual({ ok: true, shouldSelectCliInput: false });
  });

  it('treats a doubled leading backslash as a literal local command', () => {
    const options = createOptions(null);
    const { result } = renderHook(() => useAppCli(options));

    act(() => {
      result.current.submitCliCommandText('\\\\look', {
        clearInputState: false,
        selectCliInput: false,
      });
    });

    expect(options.routeCrossInputCommandToParchment).not.toHaveBeenCalled();
    expect(result.current.gameOutputLines).toContain('I didn\'t understand you.');
  });

  it('reports a routed parchment command failure in the CLI output', () => {
    const options = createOptions(null);
    const { result } = renderHook(() => useAppCli(options));

    act(() => {
      result.current.submitCliCommandText('\\look', {
        clearInputState: false,
        selectCliInput: false,
      });
    });

    expect(result.current.gameOutputLines).toEqual([
      '>\\look',
      'No interactive fiction game is ready to receive commands.',
      '',
    ]);
  });

  it('opens the game chooser from the choose-game CLI command', () => {
    const options = createOptions(null);
    const { result } = renderHook(() => useAppCli(options));

    act(() => {
      result.current.submitCliCommandText('choose a game', {
        clearInputState: false,
        selectCliInput: false,
      });
    });

    expect(options.chooseGame).toHaveBeenCalledTimes(1);
    expect(result.current.gameOutputLines).toEqual([
      '>choose a game',
      'Opened the game chooser.',
      '',
    ]);
  });


  it('opens the room editor request for edit commands', async () => {
    let doc = createEmptyMap('Edit Command Map');
    doc = addRoom(doc, { ...createRoom('Kitchen'), position: { x: 10, y: 20 } });
    const kitchenId = Object.keys(doc.rooms)[0]!;
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    let submission: ReturnType<typeof result.current.submitCliCommandText> | null = null;
    act(() => {
      submission = result.current.submitCliCommandText('edit Kitchen', {
        clearInputState: false,
      });
    });

    expect(submission).toEqual({ ok: true, shouldSelectCliInput: false });
    expect(options.setRequestedRoomEditorRequest).toHaveBeenCalledWith(expect.objectContaining({
      roomId: kitchenId,
      requestId: expect.any(Number),
    }));
    expect(useEditorStore.getState().selectedRoomIds).toEqual([kitchenId]);
    expect(result.current.gameOutputLines).toContain('Edited.');
  });

  it('reveals and selects rooms for show commands', async () => {
    let doc = createEmptyMap('Show Command Map');
    doc = addRoom(doc, { ...createRoom('Kitchen'), position: { x: 10, y: 20 } });
    const kitchenId = Object.keys(doc.rooms)[0]!;
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    act(() => {
      result.current.submitCliCommandText('show Kitchen', {
        clearInputState: false,
      });
    });

    expect(options.setRequestedRoomRevealRequest).toHaveBeenCalledWith(expect.objectContaining({
      roomId: kitchenId,
      requestId: expect.any(Number),
    }));
    expect(useEditorStore.getState().selectedRoomIds).toEqual([kitchenId]);
    expect(result.current.gameOutputLines).toContain('**Kitchen**');
  });

  it('creates rooms and requests viewport focus for create commands', async () => {
    const doc = createEmptyMap('Create Command Map');
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    act(() => {
      result.current.submitCliCommandText('create Kitchen', {
        clearInputState: false,
      });
    });

    const rooms = Object.values(useEditorStore.getState().doc?.rooms ?? {});
    expect(rooms.map((room) => room.name)).toContain('Kitchen');
    expect(options.setRequestedViewportFocusRequest).toHaveBeenCalledWith(expect.objectContaining({
      roomIds: [expect.any(String)],
      requestId: expect.any(Number),
    }));
    expect(result.current.gameOutputLines).toContain('Created.');
  });

  it('validates zoom percentages and emits absolute zoom requests', async () => {
    const doc = createEmptyMap('Zoom Command Map');
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    act(() => {
      result.current.submitCliCommandText('zoom 0%', {
        clearInputState: false,
      });
    });
    expect(result.current.gameOutputLines).toContain('Zoom must be greater than 0%.');

    act(() => {
      result.current.submitCliCommandText('zoom 150%', {
        clearInputState: false,
      });
    });
    expect(options.setRequestedMapZoomRequest).toHaveBeenCalledWith(expect.objectContaining({
      mode: 'absolute',
      targetZoom: 1.5,
      requestId: expect.any(Number),
    }));
    expect(result.current.gameOutputLines).toContain('Zoomed to 150%.');
  });

  it('opens the CLI help panel and emits relative zoom requests', async () => {
    const doc = createEmptyMap('Help And Relative Zoom Map');
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    act(() => {
      result.current.submitCliCommandText('help', { clearInputState: false });
      result.current.submitCliCommandText('zoom in', { clearInputState: false });
      result.current.submitCliCommandText('zoom out', { clearInputState: false });
      result.current.submitCliCommandText('zoom reset', { clearInputState: false });
    });

    expect(options.onOpenCliHelpPanel).toHaveBeenCalledTimes(1);
    expect(result.current.gameOutputLines).toContain('Opened the CLI help panel.');
    expect(options.setRequestedMapZoomRequest).toHaveBeenNthCalledWith(1, expect.objectContaining({
      mode: 'relative',
      direction: 'in',
      requestId: expect.any(Number),
    }));
    expect(options.setRequestedMapZoomRequest).toHaveBeenNthCalledWith(2, expect.objectContaining({
      mode: 'relative',
      direction: 'out',
      requestId: expect.any(Number),
    }));
    expect(options.setRequestedMapZoomRequest).toHaveBeenNthCalledWith(3, expect.objectContaining({
      mode: 'reset',
      requestId: expect.any(Number),
    }));
  });


  it('navigates from the selected room and reveals the destination', async () => {
    let doc = createEmptyMap('Navigate Command Map');
    const kitchen = { ...createRoom('Kitchen'), position: { x: 10, y: 20 } };
    const hallway = { ...createRoom('Hallway'), position: { x: 110, y: 20 } };
    doc = addRoom(doc, kitchen);
    doc = addRoom(doc, hallway);
    doc = addConnection(doc, createConnection(kitchen.id, hallway.id, true), 'east', 'west');
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    act(() => {
      useEditorStore.getState().selectRoom(kitchen.id);
      result.current.submitCliCommandText('east', { clearInputState: false });
    });

    expect(useEditorStore.getState().selectedRoomIds).toEqual([hallway.id]);
    expect(options.setRequestedRoomRevealRequest).toHaveBeenLastCalledWith(expect.objectContaining({
      roomId: hallway.id,
      requestId: expect.any(Number),
    }));
    expect(result.current.gameOutputLines).toContain('**Hallway**');
  });

  it('reports navigation errors when no room is selected or the exit does not exist', async () => {
    let doc = createEmptyMap('Navigate Error Map');
    const kitchen = { ...createRoom('Kitchen'), position: { x: 10, y: 20 } };
    doc = addRoom(doc, kitchen);
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    act(() => {
      result.current.submitCliCommandText('east', { clearInputState: false });
    });
    expect(result.current.gameOutputLines).toContain('Select exactly one room to navigate from.');

    act(() => {
      useEditorStore.getState().selectRoom(kitchen.id);
      result.current.submitCliCommandText('east', { clearInputState: false });
    });
    expect(result.current.gameOutputLines).toContain("You can't go east from Kitchen.");
  });

  it('puts, takes, and takes all items through CLI commands', async () => {
    let doc = createEmptyMap('Item Command Map');
    const cellar = { ...createRoom('Cellar'), position: { x: 10, y: 20 } };
    doc = addRoom(doc, cellar);
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    act(() => {
      result.current.submitCliCommandText('put lantern in Cellar', { clearInputState: false });
    });
    expect(Object.values(useEditorStore.getState().doc?.items ?? {}).map((item) => item.name)).toContain('lantern');
    expect(result.current.gameOutputLines).toContain('Dropped.');

    act(() => {
      result.current.submitCliCommandText('take lantern from Cellar', { clearInputState: false });
    });
    expect(Object.values(useEditorStore.getState().doc?.items ?? {})).toHaveLength(0);
    expect(result.current.gameOutputLines).toContain('Taken.');

    act(() => {
      result.current.submitCliCommandText('put lamp in Cellar', { clearInputState: false });
      result.current.submitCliCommandText('put book in Cellar', { clearInputState: false });
      result.current.submitCliCommandText('take all from Cellar', { clearInputState: false });
    });
    expect(Object.values(useEditorStore.getState().doc?.items ?? {})).toHaveLength(0);
  });

  it('treats quoted room names as exact matches for item transfer commands', async () => {
    let doc = createEmptyMap('Quoted Item Transfer Map');
    const storageRoom = { ...createRoom('Storage Room'), id: 'storage-room', position: { x: 10, y: 20 } };
    const farStorage = { ...createRoom('Far end of the storage room'), id: 'far-storage', position: { x: 110, y: 20 } };
    doc = addRoom(doc, storageRoom);
    doc = addRoom(doc, farStorage);
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    act(() => {
      result.current.submitCliCommandText('put lantern in "Storage Room"', { clearInputState: false });
    });

    const storedItems = Object.values(useEditorStore.getState().doc?.items ?? {});
    expect(storedItems).toHaveLength(1);
    expect(storedItems[0]?.roomId).toBe(storageRoom.id);
    expect(result.current.gameOutputLines).not.toContain('Room reference "Storage Room" is ambiguous.');
    expect(result.current.gameOutputLines).toContain('Dropped.');
  });

  it('reports missing items on take commands', async () => {
    let doc = createEmptyMap('Missing Item Map');
    const cellar = { ...createRoom('Cellar'), position: { x: 10, y: 20 } };
    doc = addRoom(doc, cellar);
    doc = addItem(doc, { ...createItem('Lamp', cellar.id), id: 'item-lamp' });
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    act(() => {
      result.current.submitCliCommandText('take lantern from Cellar', { clearInputState: false });
    });

    expect(result.current.gameOutputLines).toContain('Could not find lantern in Cellar.');
    expect(Object.values(useEditorStore.getState().doc?.items ?? {}).map((item) => item.name)).toEqual(['Lamp']);
  });

  it('creates pseudo-room exits from the selected room', async () => {
    let doc = createEmptyMap('Pseudo Room Map');
    const kitchen = { ...createRoom('Kitchen'), position: { x: 10, y: 20 } };
    doc = addRoom(doc, kitchen);
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    act(() => {
      useEditorStore.getState().selectRoom(kitchen.id);
      result.current.submitCliCommandText('north is unknown', { clearInputState: false });
    });

    expect(Object.keys(useEditorStore.getState().doc?.pseudoRooms ?? {})).toHaveLength(1);
    expect(useEditorStore.getState().doc?.rooms[kitchen.id]?.directions.north).toBeDefined();
    expect(options.setRequestedRoomRevealRequest).toHaveBeenLastCalledWith(expect.objectContaining({
      roomId: kitchen.id,
      requestId: expect.any(Number),
    }));
    expect(result.current.gameOutputLines).toContain('Marked exit as unknown.');
  });

  it('creates multiple pseudo-room exits from the selected room with one command', async () => {
    let doc = createEmptyMap('Batch Pseudo Room Map');
    const kitchen = { ...createRoom('Kitchen'), position: { x: 10, y: 20 } };
    doc = addRoom(doc, kitchen);
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    act(() => {
      useEditorStore.getState().selectRoom(kitchen.id);
      result.current.submitCliCommandText('north and south are unknown', { clearInputState: false });
    });

    expect(Object.keys(useEditorStore.getState().doc?.pseudoRooms ?? {})).toHaveLength(2);
    expect(useEditorStore.getState().doc?.rooms[kitchen.id]?.directions.north).toBeDefined();
    expect(useEditorStore.getState().doc?.rooms[kitchen.id]?.directions.south).toBeDefined();
    expect(result.current.gameOutputLines).toContain('Marked exits as unknown.');
  });

  it('reports pseudo-room creation errors when no room is selected', async () => {
    let doc = createEmptyMap('Pseudo Room Error Map');
    const kitchen = { ...createRoom('Kitchen'), position: { x: 10, y: 20 } };
    doc = addRoom(doc, kitchen);
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    act(() => {
      result.current.submitCliCommandText('north is unknown', { clearInputState: false });
    });

    expect(result.current.gameOutputLines).toContain('Select exactly one room to set an exit on.');
  });

  it('supports explicit-source pseudo-room commands and respects pronoun bindings there too', async () => {
    let doc = createEmptyMap('Explicit Pseudo Room Map');
    const kitchen = { ...createRoom('Kitchen'), position: { x: 10, y: 20 } };
    doc = addRoom(doc, kitchen);
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    act(() => {
      result.current.submitCliCommandText('north of Kitchen is unknown', { clearInputState: false });
    });
    expect(useEditorStore.getState().doc?.rooms[kitchen.id]?.directions.north).toBeDefined();

    act(() => {
      result.current.submitCliCommandText('west of it lies death', { clearInputState: false });
    });
    expect(useEditorStore.getState().doc?.rooms[kitchen.id]?.directions.west).toBeDefined();
    expect(result.current.gameOutputLines).toContain('Marked exit as death.');
  });

  it('reports unbound pronouns for explicit-source pseudo-room commands', async () => {
    let doc = createEmptyMap('Explicit Pseudo Room Pronoun Error Map');
    const kitchen = { ...createRoom('Kitchen'), position: { x: 10, y: 20 } };
    doc = addRoom(doc, kitchen);
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    act(() => {
      result.current.submitCliCommandText('west of it lies death', { clearInputState: false });
    });

    expect(result.current.gameOutputLines).toContain('Nothing is currently bound to "it".');
  });

  it('deletes rooms and clears the pronoun binding when the deleted room was bound to it', async () => {
    let doc = createEmptyMap('Delete Command Map');
    const kitchen = { ...createRoom('Kitchen'), position: { x: 10, y: 20 } };
    doc = addRoom(doc, kitchen);
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    act(() => {
      result.current.submitCliCommandText('show Kitchen', { clearInputState: false });
      result.current.submitCliCommandText('delete it', { clearInputState: false });
    });

    expect(useEditorStore.getState().doc?.rooms[kitchen.id]).toBeUndefined();
    expect(result.current.gameOutputLines).toContain('Deleted.');

    act(() => {
      result.current.submitCliCommandText('show it', { clearInputState: false });
    });

    expect(result.current.gameOutputLines).toContain('Nothing is currently bound to "it".');
  });

  it('connects rooms, annotates the connection, and disconnects it again', async () => {
    let doc = createEmptyMap('Connection Command Map');
    const kitchen = { ...createRoom('Kitchen'), position: { x: 10, y: 20 } };
    const hallway = { ...createRoom('Hallway'), position: { x: 110, y: 20 } };
    doc = addRoom(doc, kitchen);
    doc = addRoom(doc, hallway);
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    act(() => {
      result.current.submitCliCommandText('connect Kitchen east to Hallway', { clearInputState: false });
    });
    const connectedDoc = useEditorStore.getState().doc;
    const connectionId = connectedDoc?.rooms[kitchen.id]?.directions.east;
    expect(connectionId).toBeDefined();
    expect(result.current.gameOutputLines).toContain('Connected.');

    act(() => {
      result.current.submitCliCommandText('Kitchen to Hallway is door', { clearInputState: false });
    });
    expect(useEditorStore.getState().doc?.connections[connectionId!]?.annotation).toEqual({ kind: 'door' });
    expect(result.current.gameOutputLines).toContain('Marked.');

    act(() => {
      result.current.submitCliCommandText('disconnect Kitchen east from Hallway', { clearInputState: false });
    });
    expect(useEditorStore.getState().doc?.connections[connectionId!]).toBeUndefined();
    expect(result.current.gameOutputLines).toContain('Disconnected.');
  });

  it('creates or connects rooms with selected-room-relative connect commands', async () => {
    let doc = createEmptyMap('Relative Connect Map');
    const kitchen = { ...createRoom('Kitchen'), position: { x: 10, y: 20 } };
    const hallway = { ...createRoom('Hallway'), position: { x: 110, y: 20 } };
    doc = addRoom(doc, kitchen);
    doc = addRoom(doc, hallway);
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    act(() => {
      useEditorStore.getState().selectRoom(kitchen.id);
      result.current.submitCliCommandText('east is Hallway', { clearInputState: false });
    });
    expect(useEditorStore.getState().doc?.rooms[kitchen.id]?.directions.east).toBeDefined();
    expect(result.current.gameOutputLines).toContain('Connected.');

    act(() => {
      useEditorStore.getState().selectRoom(kitchen.id);
      result.current.submitCliCommandText('north is Observatory', { clearInputState: false });
    });
    expect(Object.values(useEditorStore.getState().doc?.rooms ?? {}).map((room) => room.name)).toContain('Observatory');
    expect(result.current.gameOutputLines).toContain('Created and connected.');
  });

  it('creates missing rooms for explicit-source relative connect commands', async () => {
    let doc = createEmptyMap('Explicit Relative Connect Map');
    const foyer = { ...createRoom('Foo'), position: { x: 10, y: 20 } };
    doc = addRoom(doc, foyer);
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    act(() => {
      result.current.submitCliCommandText('below foo is bar', { clearInputState: false });
    });
    const bar = Object.values(useEditorStore.getState().doc?.rooms ?? {}).find((room) => room.name === 'bar');
    expect(bar).toBeDefined();
    expect(useEditorStore.getState().doc?.rooms[foyer.id]?.directions.down).toBeDefined();
    expect(useEditorStore.getState().doc?.rooms[bar!.id]?.directions.up).toBeDefined();
    expect(result.current.gameOutputLines).toContain('Created and connected.');

    act(() => {
      result.current.submitCliCommandText('north of foo is baz', { clearInputState: false });
    });
    const baz = Object.values(useEditorStore.getState().doc?.rooms ?? {}).find((room) => room.name === 'baz');
    expect(baz).toBeDefined();
    expect(useEditorStore.getState().doc?.rooms[foyer.id]?.directions.north).toBeDefined();
    expect(useEditorStore.getState().doc?.rooms[baz!.id]?.directions.south).toBeDefined();
    expect(result.current.gameOutputLines).toContain('Created and connected.');
  });

  it('uses the opposite direction on the target room for explicit-source relative connects', async () => {
    let doc = createEmptyMap('Explicit Relative Direction Map');
    const carnival = { ...createRoom('Carnival'), position: { x: 10, y: 20 } };
    const foobar = { ...createRoom('Foobar'), position: { x: -90, y: 20 } };
    doc = addRoom(doc, carnival);
    doc = addRoom(doc, foobar);
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    act(() => {
      result.current.submitCliCommandText('west of carnival is foobar', { clearInputState: false });
    });

    const nextDoc = useEditorStore.getState().doc;
    const connectionId = nextDoc?.rooms[carnival.id]?.directions.west;
    expect(connectionId).toBeDefined();
    expect(nextDoc?.rooms[foobar.id]?.directions.east).toBe(connectionId);
    expect(nextDoc?.rooms[foobar.id]?.directions.west).toBeUndefined();
    expect(result.current.gameOutputLines).toContain('Connected.');
  });

  it('applies adjectives to the target room for relative connect commands', async () => {
    let doc = createEmptyMap('Relative Connect Adjectives Map');
    const foyer = { ...createRoom('Foyer'), position: { x: 10, y: 20 } };
    const attic = { ...createRoom('Attic'), position: { x: 10, y: -80 } };
    doc = addRoom(doc, foyer);
    doc = addRoom(doc, attic);
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    act(() => {
      result.current.submitCliCommandText('above foyer is attic, which is dark', { clearInputState: false });
    });
    const darkenedAttic = Object.values(useEditorStore.getState().doc?.rooms ?? {}).find((room) => room.name === 'Attic');
    expect(darkenedAttic?.isDark).toBe(true);
    expect(result.current.gameOutputLines).toContain('Connected.');

    act(() => {
      result.current.submitCliCommandText('below foyer is cellar, which is lit', { clearInputState: false });
    });
    const cellar = Object.values(useEditorStore.getState().doc?.rooms ?? {}).find((room) => room.name === 'cellar');
    expect(cellar?.isDark).toBe(false);
    expect(result.current.gameOutputLines).toContain('Created and connected.');
  });

  it('reports connection annotation errors when no connection exists', async () => {
    let doc = createEmptyMap('Annotation Error Map');
    const kitchen = { ...createRoom('Kitchen'), position: { x: 10, y: 20 } };
    const hallway = { ...createRoom('Hallway'), position: { x: 110, y: 20 } };
    doc = addRoom(doc, kitchen);
    doc = addRoom(doc, hallway);
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    act(() => {
      result.current.submitCliCommandText('Kitchen to Hallway is door', { clearInputState: false });
    });

    expect(result.current.gameOutputLines).toContain('There are no connections between Kitchen and Hallway.');
  });

  it('reports when disconnect is ambiguous across multiple connections', async () => {
    let doc = createEmptyMap('Disconnect Ambiguity Map');
    const kitchen = { ...createRoom('Kitchen'), position: { x: 10, y: 20 } };
    const hallway = { ...createRoom('Hallway'), position: { x: 110, y: 20 } };
    doc = addRoom(doc, kitchen);
    doc = addRoom(doc, hallway);
    doc = addConnection(doc, createConnection(kitchen.id, hallway.id, true), 'east', 'west');
    doc = addConnection(doc, createConnection(kitchen.id, hallway.id, true), 'north', 'south');
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    act(() => {
      result.current.submitCliCommandText('disconnect Kitchen from Hallway', { clearInputState: false });
    });

    expect(result.current.gameOutputLines).toContain(
      'There are multiple connections between Kitchen and Hallway. Use "disconnect Kitchen <direction> from Hallway".',
    );
  });

  it('reports a direction-specific disconnect failure when no matching exit exists', async () => {
    let doc = createEmptyMap('Disconnect Direction Error Map');
    const kitchen = { ...createRoom('Kitchen'), position: { x: 10, y: 20 } };
    const hallway = { ...createRoom('Hallway'), position: { x: 110, y: 20 } };
    doc = addRoom(doc, kitchen);
    doc = addRoom(doc, hallway);
    doc = addConnection(doc, createConnection(kitchen.id, hallway.id, true), 'east', 'west');
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    act(() => {
      result.current.submitCliCommandText('disconnect Kitchen north from Hallway', { clearInputState: false });
    });

    expect(result.current.gameOutputLines).toContain('There is no connection from Kitchen going north to Hallway.');
  });

  it('adds sticky notes with notate commands', async () => {
    let doc = createEmptyMap('Notate Command Map');
    const kitchen = { ...createRoom('Kitchen'), position: { x: 10, y: 20 } };
    doc = addRoom(doc, kitchen);
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    act(() => {
      result.current.submitCliCommandText('notate Kitchen with hello there', { clearInputState: false });
    });

    expect(Object.values(useEditorStore.getState().doc?.stickyNotes ?? {}).map((note) => note.text)).toContain('hello there');
    expect(result.current.gameOutputLines).toContain('Notated.');
  });

  it('reports describe and notate selection errors when no single room is selected', async () => {
    let doc = createEmptyMap('Selection Error Map');
    const kitchen = { ...createRoom('Kitchen'), position: { x: 10, y: 20 } };
    const hall = { ...createRoom('Hall'), position: { x: 110, y: 20 } };
    doc = addRoom(doc, kitchen);
    doc = addRoom(doc, hall);
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    act(() => {
      result.current.submitCliCommandText('describe', { clearInputState: false });
      result.current.submitCliCommandText('annotate with hello', { clearInputState: false });
    });
    expect(result.current.gameOutputLines).toContain("You must select a room you want described. Use the 'show' command to select a room.");
    expect(result.current.gameOutputLines).toContain("You must select a room to annotate. Use the 'show' command to select a room.");

    act(() => {
      useEditorStore.setState((state) => ({
        ...state,
        selectedRoomIds: [kitchen.id, hall.id],
      }));
      result.current.submitCliCommandText('describe', { clearInputState: false });
      result.current.submitCliCommandText('annotate with hello', { clearInputState: false });
    });
    expect(result.current.gameOutputLines).toContain("You must select only one room at a time. Use the 'show' command to select a room.");
    expect(result.current.gameOutputLines).toContain("You must select only one room at a time. Use the 'show' command to select a room.");
  });

  it('applies room-lighting adjectives and describes rooms by name and selection', async () => {
    let doc = createEmptyMap('Room Adjective Map');
    const kitchen = { ...createRoom('Kitchen'), position: { x: 10, y: 20 } };
    doc = addRoom(doc, kitchen);
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    act(() => {
      result.current.submitCliCommandText('Kitchen is dark', { clearInputState: false });
      result.current.submitCliCommandText('describe Kitchen', { clearInputState: false });
      useEditorStore.getState().selectRoom(kitchen.id);
      result.current.submitCliCommandText('describe', { clearInputState: false });
    });

    expect(useEditorStore.getState().doc?.rooms[kitchen.id]?.isDark).toBe(true);
    expect(result.current.gameOutputLines).toContain('Marked as dark.');
    expect(result.current.gameOutputLines).toContain('It is dark.');
    expect(result.current.gameOutputLines.filter((line) => line === 'From Kitchen, one cannot go anywhere.').length).toBeGreaterThan(0);
  });

  it('reports stale selected-room errors for describe and notate when selection no longer resolves', async () => {
    let doc = createEmptyMap('Stale Selection Map');
    const kitchen = { ...createRoom('Kitchen'), position: { x: 10, y: 20 } };
    doc = addRoom(doc, kitchen);
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    act(() => {
      useEditorStore.setState((state) => ({
        ...state,
        selectedRoomIds: ['missing-room-id'],
      }));
      result.current.submitCliCommandText('describe', { clearInputState: false });
      result.current.submitCliCommandText('annotate with hello', { clearInputState: false });
    });

    expect(result.current.gameOutputLines).toContain("You must select a room you want described. Use the 'show' command to select a room.");
    expect(result.current.gameOutputLines).toContain("You must select a room to annotate. Use the 'show' command to select a room.");
  });

  it('creates and connects a new dark room relative to an existing room', async () => {
    let doc = createEmptyMap('Create And Connect Map');
    const hallway = { ...createRoom('Hallway'), position: { x: 110, y: 20 } };
    doc = addRoom(doc, hallway);
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    act(() => {
      result.current.submitCliCommandText('create Kitchen, which is dark, east of Hallway', { clearInputState: false });
    });

    const createdRoom = Object.values(useEditorStore.getState().doc?.rooms ?? {}).find((room) => room.name === 'Kitchen');
    expect(createdRoom).toBeDefined();
    expect(createdRoom?.isDark).toBe(true);
    expect(useEditorStore.getState().selectedRoomIds).toEqual([createdRoom!.id]);
    expect(useEditorStore.getState().doc?.rooms[createdRoom!.id]?.directions.west).toBeDefined();
    expect(options.setRequestedViewportFocusRequest).toHaveBeenCalledWith(expect.objectContaining({
      roomIds: [createdRoom!.id, hallway.id],
      requestId: expect.any(Number),
    }));
    expect(result.current.gameOutputLines).toContain('Created and connected.');
  });

  it('reports ambiguous and unknown room references across command families', async () => {
    let doc = createEmptyMap('Ambiguous Room Map');
    const kitchenA = { ...createRoom('Kitchen'), id: 'kitchen-a', position: { x: 10, y: 20 } };
    const kitchenB = { ...createRoom('Kitchen Pantry'), id: 'kitchen-b', position: { x: 110, y: 20 } };
    const hall = { ...createRoom('Hall'), position: { x: 210, y: 20 } };
    doc = addRoom(doc, kitchenA);
    doc = addRoom(doc, kitchenB);
    doc = addRoom(doc, hall);
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    act(() => {
      result.current.submitCliCommandText('show Kitchen', { clearInputState: false });
      result.current.submitCliCommandText('Kitchen is lit', { clearInputState: false });
      result.current.submitCliCommandText('connect Hall east to Missing', { clearInputState: false });
      useEditorStore.getState().selectRoom(hall.id);
      result.current.submitCliCommandText('east is Kitchen', { clearInputState: false });
      result.current.submitCliCommandText('create Loft east of Kitchen', { clearInputState: false });
    });

    expect(result.current.gameOutputLines).toContain('The name "Kitchen" is ambiguous. It could match "Kitchen" or "Kitchen Pantry".');
    expect(result.current.gameOutputLines).toContain('Unknown room "Missing".');
  });

  it('undoes and redoes CLI changes, including the empty-history error', async () => {
    const doc = createEmptyMap('Undo Redo Map');
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    act(() => {
      result.current.submitCliCommandText('undo', { clearInputState: false });
    });
    expect(result.current.gameOutputLines).toContain('Nothing to undo.');

    act(() => {
      result.current.submitCliCommandText('create Kitchen', { clearInputState: false });
      result.current.submitCliCommandText('undo', { clearInputState: false });
    });
    expect(Object.values(useEditorStore.getState().doc?.rooms ?? {})).toHaveLength(0);
    expect(result.current.gameOutputLines).toContain('Undone.');

    act(() => {
      result.current.submitCliCommandText('redo', { clearInputState: false });
    });
    expect(Object.values(useEditorStore.getState().doc?.rooms ?? {}).map((room) => room.name)).toContain('Kitchen');
    expect(result.current.gameOutputLines).toContain('Redone.');

    act(() => {
      result.current.submitCliCommandText('redo', { clearInputState: false });
    });
    expect(result.current.gameOutputLines).toContain('Nothing to redo.');
  });

  it('falls back to describing commands when no active document is loaded', () => {
    const options = createOptions(null);
    const { result } = renderHook(() => useAppCli(options));

    act(() => {
      result.current.submitCliCommandText('create Kitchen', { clearInputState: false });
    });

    expect(result.current.gameOutputLines).toContain('create a room called Kitchen');
  });

  it('mirrors appended output batches to the submit callback and respects selection flags', async () => {
    const doc = createEmptyMap('Submit Callback Map');
    const options = createStoreBackedOptions(doc);
    const { result } = renderHook(() => useAppCli(options));

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.id).toBe(doc.metadata.id);
    });

    const onOutputAppended = jest.fn<(lines: readonly string[]) => void>();

    let submission: ReturnType<typeof result.current.submitCliCommandText> | null = null;
    act(() => {
      submission = result.current.submitCliCommandText('help', {
        clearInputState: true,
        selectCliInput: false,
        onOutputAppended,
      });
    });

    expect(submission).toEqual({ ok: true, shouldSelectCliInput: false });
    expect(onOutputAppended).toHaveBeenCalledWith(expect.arrayContaining(['>help', 'Opened the CLI help panel.']));
  });
});
