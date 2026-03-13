import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addConnection, addRoom } from '../../src/domain/map-operations';
import { createConnection, createEmptyMap, createRoom } from '../../src/domain/map-types';
import { ROOM_HEIGHT } from '../../src/graph/connection-geometry';
import { getRoomNodeWidth } from '../../src/graph/minimap-geometry';
import { loadMap, saveMap } from '../../src/storage/map-store';
import { App } from '../../src/app';
import { useEditorStore } from '../../src/state/editor-store';

/** Push a hash route into jsdom's location and fire popstate. */
function navigateTo(hashRoute: string) {
  window.history.pushState({}, '', hashRoute);
}

function getGameOutputBox(): HTMLTextAreaElement {
  return screen.getByRole('textbox', { name: /game output/i }) as HTMLTextAreaElement;
}

function expectGameOutputToContain(...fragments: readonly string[]) {
  const value = getGameOutputBox().value;
  for (const fragment of fragments) {
    expect(value).toContain(fragment);
  }
}

async function submitCliCommand(command: string): Promise<HTMLInputElement> {
  const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
  await act(async () => {
    fireEvent.change(input, { target: { value: command } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
  });
  return input;
}

beforeEach(() => {
  // Reset URL to the selection screen before each test
  window.history.replaceState({}, '', '#/');
  // Reset editor store
  useEditorStore.setState(useEditorStore.getInitialState());
});

describe('URL routing', () => {
  it('renders selection-screen controls', () => {
    render(<App />);

    expect(screen.getByRole('button', { name: /disable grid snapping/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /switch to .+ mode/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /help/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /cli command/i })).toHaveAttribute('placeholder', 'Type help');
    expect(screen.queryByRole('button', { name: /prettify layout/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /redo/i })).not.toBeInTheDocument();
  });

  it('switches the CLI placeholder after the input has been used once', async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    expect(input).toHaveAttribute('placeholder', 'Type help');

    await user.type(input, 'help');
    await user.clear(input);

    expect(input).toHaveAttribute('placeholder', 'Enter a command');
  });

  it('navigates CLI command history with the up and down arrows', async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;

    await user.type(input, 'help{enter}');
    await user.type(input, 'arrange{enter}');

    expect(input).toHaveValue('');

    await user.keyboard('{ArrowUp}');
    expect(input).toHaveValue('arrange');

    await user.keyboard('{ArrowUp}');
    expect(input).toHaveValue('help');

    await user.keyboard('{ArrowDown}');
    expect(input).toHaveValue('arrange');

    await user.keyboard('{ArrowDown}');
    expect(input).toHaveValue('');
  });

  it('restores the in-progress CLI draft after leaving command history', async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;

    await user.type(input, 'help{enter}');
    await user.type(input, 'arrange{enter}');
    await user.type(input, 'sho');

    await user.keyboard('{ArrowUp}');
    expect(input).toHaveValue('arrange');

    await user.keyboard('{ArrowDown}');
    expect(input).toHaveValue('sho');
  });

  it('logs the parsed CLI action when the user presses Enter for an unimplemented command', async () => {
    const user = userEvent.setup();

    render(<App />);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'connect Kitchen east to Hallway{enter}');

    expectGameOutputToContain(
      'connect Kitchen east to Hallway',
      'create a two-way connection from Kitchen going east to Hallway going west',
    );
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('lists all supported CLI command forms for the help command', async () => {
    const doc = createEmptyMap('CLI Command List Map');
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/cli command list map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'help{enter}');

    expectGameOutputToContain(
      'help',
      'arrange',
      'prettify',
      'create <room name>',
      'delete <room name>',
      'edit <room name>',
      'show <room name>',
      'notate <room name> with <note text>',
      'annotate <room name> with <note text>',
      'connect <room name> <direction> one-way to <room name>',
      'create and connect <room name> <direction> to <room name>',
      'create <room name> above <room name>',
      'redo',
    );
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('rearranges the map for the arrange CLI command', async () => {
    const roomA = { ...createRoom('A'), position: { x: 320, y: 320 } };
    const roomB = { ...createRoom('B'), position: { x: 40, y: 40 } };
    let doc = createEmptyMap('CLI Arrange Map');
    doc = addRoom(addRoom(doc, roomA), roomB);
    doc = addConnection(doc, createConnection(roomA.id, roomB.id, true), 'north', 'south');
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/cli arrange map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'arrange{enter}');

    const updatedDoc = useEditorStore.getState().doc!;
    expect(updatedDoc.rooms[roomB.id].position.x).toBe(updatedDoc.rooms[roomA.id].position.x);
    expect(updatedDoc.rooms[roomB.id].position.y).toBeLessThan(updatedDoc.rooms[roomA.id].position.y);
    expectGameOutputToContain('arrange', 'arranged.');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('accepts prettify as a synonym for the arrange CLI command', async () => {
    const roomA = { ...createRoom('A'), position: { x: 320, y: 320 } };
    const roomB = { ...createRoom('B'), position: { x: 40, y: 40 } };
    let doc = createEmptyMap('CLI Prettify Map');
    doc = addRoom(addRoom(doc, roomA), roomB);
    doc = addConnection(doc, createConnection(roomA.id, roomB.id, true), 'north', 'south');
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/cli prettify map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'prettify{enter}');

    const updatedDoc = useEditorStore.getState().doc!;
    expect(updatedDoc.rooms[roomB.id].position.x).toBe(updatedDoc.rooms[roomA.id].position.x);
    expect(updatedDoc.rooms[roomB.id].position.y).toBeLessThan(updatedDoc.rooms[roomA.id].position.y);
    expectGameOutputToContain('prettify', 'arranged.');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('creates, selects, and centers a room for the create CLI command', async () => {
    const doc = createEmptyMap('CLI Map');
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();

    render(<App />);
    await screen.findByText(/cli map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'create Kitchen{enter}');

    const state = useEditorStore.getState();
    const rooms = Object.values(state.doc?.rooms ?? {});

    expect(rooms).toHaveLength(1);
    expect(rooms[0].name).toBe('Kitchen');
    expect(state.selectedRoomIds).toEqual([rooms[0].id]);
    expect(state.mapPanOffset).toEqual({
      x: (window.innerWidth / 2) - rooms[0].position.x,
      y: (window.innerHeight / 2) - rooms[0].position.y,
    });
    expectGameOutputToContain('create Kitchen', 'created');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('supports it as a pronoun for the last direct-object room across commands', async () => {
    let doc = createEmptyMap('CLI Pronoun Map');
    doc = {
      ...doc,
      rooms: {
        living: {
          id: 'living',
          name: 'Living Room',
          description: '',
          position: { x: 480, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
      },
    };
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    render(<App />);
    await screen.findByText(/cli pronoun map/i);

    await submitCliCommand('create Kitchen');
    await submitCliCommand('connect it e to living room');
    await submitCliCommand('edit it');

    const state = useEditorStore.getState();
    const kitchen = Object.values(state.doc?.rooms ?? {}).find((room) => room.name === 'Kitchen');
    const living = state.doc?.rooms.living;
    const connection = Object.values(state.doc?.connections ?? {})[0];

    expect(kitchen).toBeDefined();
    expect(living).toBeDefined();
    expect(connection).toMatchObject({
      sourceRoomId: kitchen?.id,
      targetRoomId: living?.id,
    });
    expect(await screen.findByRole('dialog', { name: /room editor/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /room name/i })).toHaveValue('Kitchen');
  });

  it('preserves the existing it binding when it is used as the indirect object', async () => {
    let doc = createEmptyMap('CLI Pronoun Preserve Map');
    doc = {
      ...doc,
      rooms: {
        kitchen: {
          id: 'kitchen',
          name: 'Kitchen',
          description: '',
          position: { x: 120, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
        living: {
          id: 'living',
          name: 'Living Room',
          description: '',
          position: { x: 480, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
      },
    };
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    render(<App />);
    await screen.findByText(/cli pronoun preserve map/i);

    await submitCliCommand('show living room');
    await submitCliCommand('connect kitchen e to it');
    await submitCliCommand('edit it');

    expect(await screen.findByRole('dialog', { name: /room editor/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /room name/i })).toHaveValue('Living Room');
  });

  it('reports an error when it is unbound', async () => {
    const doc = createEmptyMap('CLI Pronoun Error Map');
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/cli pronoun error map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'edit it{enter}');

    expectGameOutputToContain('edit it', 'Nothing is currently bound to "it".');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('deletes a room for the delete CLI command', async () => {
    let doc = createEmptyMap('CLI Delete Map');
    const room = {
      id: 'room-1',
      name: 'Kitchen',
      description: '',
      position: { x: 120, y: 160 },
      directions: {},
      isDark: false,
      locked: false,
      shape: 'rectangle' as const,
      fillColorIndex: 0,
      strokeColorIndex: 0,
      strokeStyle: 'solid' as const,
    };
    doc = {
      ...doc,
      rooms: {
        [room.id]: room,
      },
    };
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();

    render(<App />);
    await screen.findByText(/cli delete map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'delete kitchen{enter}');

    const state = useEditorStore.getState();
    expect(Object.values(state.doc?.rooms ?? {})).toHaveLength(0);
    expectGameOutputToContain('delete kitchen', 'deleted');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('reports an unknown room for delete when no matching room exists', async () => {
    const doc = createEmptyMap('CLI Delete Error Map');
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();

    render(<App />);
    await screen.findByText(/cli delete error map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'delete kitchen{enter}');

    expectGameOutputToContain(
      'delete kitchen',
      'Unknown room "kitchen".',
    );
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('reports an error for delete when multiple rooms have the same name', async () => {
    let doc = createEmptyMap('CLI Duplicate Delete Map');
    doc = {
      ...doc,
      rooms: {
        'room-1': {
          id: 'room-1',
          name: 'Kitchen',
          description: '',
          position: { x: 120, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
        'room-2': {
          id: 'room-2',
          name: 'Kitchen',
          description: '',
          position: { x: 240, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
      },
    };
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();

    render(<App />);
    await screen.findByText(/cli duplicate delete map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'delete kitchen{enter}');

    expectGameOutputToContain(
      'delete kitchen',
      'The name "kitchen" is ambiguous. It could match "Kitchen".',
    );
    expect(Object.values(useEditorStore.getState().doc?.rooms ?? {})).toHaveLength(2);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('opens the room editor for the edit CLI command', async () => {
    jest.useFakeTimers();
    let doc = createEmptyMap('CLI Edit Map');
    doc = {
      ...doc,
      rooms: {
        'room-1': {
          id: 'room-1',
          name: 'Kitchen',
          description: '',
          position: { x: 120, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
      },
    };
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    try {
      render(<App />);
      await screen.findByText(/cli edit map/i);

      const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
      await act(async () => {
        fireEvent.change(input, { target: { value: 'edit kitchen' } });
        fireEvent.submit(input.closest('form') as HTMLFormElement);
      });
      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      expect(await screen.findByRole('dialog', { name: /room editor/i })).toBeInTheDocument();
      const roomNameInput = screen.getByRole('textbox', { name: /room name/i }) as HTMLInputElement;
      expect(roomNameInput).toHaveValue('Kitchen');
      expect(roomNameInput).toHaveFocus();
      expect(useEditorStore.getState().selectedRoomIds).toEqual(['room-1']);
      expectGameOutputToContain('edit kitchen', 'edited');
      expect(input).not.toHaveFocus();
    } finally {
      await act(async () => {
        jest.runOnlyPendingTimers();
      });
      jest.useRealTimers();
    }
  });

  it('selects and centers a room for the show CLI command', async () => {
    jest.useFakeTimers();
    let doc = createEmptyMap('CLI Show Map');
    doc = {
      ...doc,
      rooms: {
        'room-1': {
          id: 'room-1',
          name: 'Kitchen',
          description: '',
          position: { x: 1200, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
      },
    };
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    try {
      render(<App />);
      await screen.findByText(/cli show map/i);

      const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
      const canvas = screen.getByTestId('map-canvas');
      jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 300,
        bottom: 200,
        width: 300,
        height: 200,
        toJSON: () => ({}),
      });

      await act(async () => {
        fireEvent.change(input, { target: { value: 'show kitchen' } });
        fireEvent.submit(input.closest('form') as HTMLFormElement);
      });
      await act(async () => {
        jest.advanceTimersByTime(500);
      });

      const rootFontSizePx = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
      const visibleMapLeftInset = (rootFontSizePx + (window.innerWidth * 0.02))
        + Math.min(
          Math.min(window.innerWidth * 0.375, rootFontSizePx * 27),
          Math.max(window.innerWidth - (rootFontSizePx + (window.innerWidth * 0.02)) - rootFontSizePx, 0),
        );
      const visibleCenterX = visibleMapLeftInset + (Math.max(300 - visibleMapLeftInset, 0) / 2);

      expect(useEditorStore.getState().selectedRoomIds).toEqual(['room-1']);
      expect(useEditorStore.getState().mapPanOffset).toEqual({
        x: visibleCenterX - (1200 + (getRoomNodeWidth(doc.rooms['room-1']) / 2)),
        y: (200 / 2) - (160 + (ROOM_HEIGHT / 2)),
      });
      expectGameOutputToContain('show kitchen', 'shown');
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(input.value.length);
    } finally {
      await act(async () => {
        jest.runOnlyPendingTimers();
      });
      jest.useRealTimers();
    }
  });

  it('reports an unknown room for edit when no matching room exists', async () => {
    const doc = createEmptyMap('CLI Edit Error Map');
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/cli edit error map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'edit kitchen{enter}');

    expectGameOutputToContain('edit kitchen', 'Unknown room "kitchen".');
    expect(screen.queryByRole('dialog', { name: /room editor/i })).not.toBeInTheDocument();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('reports an unknown room for show when no matching room exists', async () => {
    const doc = createEmptyMap('CLI Show Error Map');
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/cli show error map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'show kitchen{enter}');

    expectGameOutputToContain('show kitchen', 'Unknown room "kitchen".');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('creates and selects a sticky note linked to the named room for the notate CLI command', async () => {
    let doc = createEmptyMap('CLI Notate Map');
    doc = {
      ...doc,
      rooms: {
        kitchen: {
          id: 'kitchen',
          name: 'Kitchen',
          description: '',
          position: { x: 120, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
      },
    };
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/cli notate map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'notate kitchen with this room has nice wallpaper{enter}');

    const state = useEditorStore.getState();
    const stickyNotes = Object.values(state.doc?.stickyNotes ?? {});
    const stickyNoteLinks = Object.values(state.doc?.stickyNoteLinks ?? {});

    expect(stickyNotes).toHaveLength(1);
    expect(stickyNotes[0].text).toBe('this room has nice wallpaper');
    expect(stickyNoteLinks).toHaveLength(1);
    expect(stickyNoteLinks[0]).toMatchObject({
      stickyNoteId: stickyNotes[0].id,
      roomId: 'kitchen',
    });
    expect(state.selectedStickyNoteIds).toEqual([stickyNotes[0].id]);
    expectGameOutputToContain('notate kitchen with this room has nice wallpaper', 'notated.');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('accepts annotate as a synonym for the notate CLI command', async () => {
    let doc = createEmptyMap('CLI Annotate Map');
    doc = {
      ...doc,
      rooms: {
        kitchen: {
          id: 'kitchen',
          name: 'Kitchen',
          description: '',
          position: { x: 120, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
      },
    };
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/cli annotate map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'annotate kitchen with remember the wallpaper{enter}');

    const stickyNotes = Object.values(useEditorStore.getState().doc?.stickyNotes ?? {});
    expect(stickyNotes).toHaveLength(1);
    expect(stickyNotes[0].text).toBe('remember the wallpaper');
    expectGameOutputToContain('annotate kitchen with remember the wallpaper', 'notated.');
  });

  it('keeps pre-existing rooms fixed during notate prettification', async () => {
    let doc = createEmptyMap('CLI Notate Prettify Map');
    doc = {
      ...doc,
      rooms: {
        kitchen: {
          id: 'kitchen',
          name: 'Kitchen',
          description: '',
          position: { x: 240, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
        pantry: {
          id: 'pantry',
          name: 'Pantry',
          description: '',
          position: { x: 520, y: 320 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
      },
    };
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/cli notate prettify map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i });
    await user.type(input, 'notate kitchen with this room has nice wallpaper{enter}');

    const state = useEditorStore.getState();
    expect(state.doc?.rooms.kitchen?.position).toEqual({ x: 240, y: 160 });
    expect(state.doc?.rooms.pantry?.position).toEqual({ x: 520, y: 320 });
  });

  it('reports an error for edit when multiple rooms have the same name', async () => {
    let doc = createEmptyMap('CLI Duplicate Edit Map');
    doc = {
      ...doc,
      rooms: {
        'room-1': {
          id: 'room-1',
          name: 'Kitchen',
          description: '',
          position: { x: 120, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
        'room-2': {
          id: 'room-2',
          name: 'Kitchen',
          description: '',
          position: { x: 240, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
      },
    };
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/cli duplicate edit map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'edit kitchen{enter}');

    expectGameOutputToContain(
      'edit kitchen',
      'The name "kitchen" is ambiguous. It could match "Kitchen".',
    );
    expect(screen.queryByRole('dialog', { name: /room editor/i })).not.toBeInTheDocument();
    expect(Object.values(useEditorStore.getState().doc?.rooms ?? {})).toHaveLength(2);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('reports an error for show when multiple rooms have the same name', async () => {
    let doc = createEmptyMap('CLI Duplicate Show Map');
    doc = {
      ...doc,
      rooms: {
        'room-1': {
          id: 'room-1',
          name: 'Kitchen',
          description: '',
          position: { x: 120, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
        'room-2': {
          id: 'room-2',
          name: 'Kitchen',
          description: '',
          position: { x: 240, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
      },
    };
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/cli duplicate show map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'show kitchen{enter}');

    expectGameOutputToContain(
      'show kitchen',
      'The name "kitchen" is ambiguous. It could match "Kitchen".',
    );
    expect(Object.values(useEditorStore.getState().doc?.rooms ?? {})).toHaveLength(2);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('reports an unknown room for notate when no matching room exists', async () => {
    const doc = createEmptyMap('CLI Notate Error Map');
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/cli notate error map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'notate kitchen with hello{enter}');

    expectGameOutputToContain('notate kitchen with hello', 'Unknown room "kitchen".');
    expect(Object.values(useEditorStore.getState().doc?.stickyNotes ?? {})).toHaveLength(0);
  });

  it('reports an error for notate when multiple rooms have the same name', async () => {
    let doc = createEmptyMap('CLI Duplicate Notate Map');
    doc = {
      ...doc,
      rooms: {
        'room-1': {
          id: 'room-1',
          name: 'Kitchen',
          description: '',
          position: { x: 120, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
        'room-2': {
          id: 'room-2',
          name: 'Kitchen',
          description: '',
          position: { x: 240, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
      },
    };
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/cli duplicate notate map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'notate kitchen with hello{enter}');

    expectGameOutputToContain(
      'notate kitchen with hello',
      'The name "kitchen" is ambiguous. It could match "Kitchen".',
    );
    expect(Object.values(useEditorStore.getState().doc?.stickyNotes ?? {})).toHaveLength(0);
  });

  it('creates and selects a one-way connection for the connect CLI command', async () => {
    let doc = createEmptyMap('CLI Connect Map');
    doc = {
      ...doc,
      rooms: {
        kitchen: {
          id: 'kitchen',
          name: 'Kitchen',
          description: '',
          position: { x: 120, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
        hallway: {
          id: 'hallway',
          name: 'Hallway',
          description: '',
          position: { x: 240, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
      },
    };
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/cli connect map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'connect kitchen east one-way to hallway{enter}');

    const state = useEditorStore.getState();
    const connections = Object.values(state.doc?.connections ?? {});
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      sourceRoomId: 'kitchen',
      targetRoomId: 'hallway',
      isBidirectional: false,
    });
    expect(state.doc?.rooms.kitchen?.directions.east).toBe(connections[0].id);
    expect(state.doc?.rooms.hallway?.directions.west).toBeUndefined();
    expect(state.selectedConnectionIds).toEqual([connections[0].id]);
    expectGameOutputToContain('connect kitchen east one-way to hallway', 'connected');
  });

  it('creates a two-way connection and default reverse direction for the connect CLI command', async () => {
    let doc = createEmptyMap('CLI Connect Two Way Map');
    doc = {
      ...doc,
      rooms: {
        kitchen: {
          id: 'kitchen',
          name: 'Kitchen',
          description: '',
          position: { x: 120, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
        hallway: {
          id: 'hallway',
          name: 'Hallway',
          description: '',
          position: { x: 240, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
      },
    };
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/cli connect two way map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i });
    await user.type(input, 'connect kitchen east to hallway{enter}');

    const state = useEditorStore.getState();
    const connections = Object.values(state.doc?.connections ?? {});
    expect(connections).toHaveLength(1);
    expect(connections[0].isBidirectional).toBe(true);
    expect(state.doc?.rooms.kitchen?.directions.east).toBe(connections[0].id);
    expect(state.doc?.rooms.hallway?.directions.west).toBe(connections[0].id);
  });

  it('replaces existing directional bindings when connect reuses a direction', async () => {
    let doc = createEmptyMap('CLI Connect Replace Map');
    doc = {
      ...doc,
      rooms: {
        kitchen: {
          id: 'kitchen',
          name: 'Kitchen',
          description: '',
          position: { x: 120, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
        hallway: {
          id: 'hallway',
          name: 'Hallway',
          description: '',
          position: { x: 240, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
        pantry: {
          id: 'pantry',
          name: 'Pantry',
          description: '',
          position: { x: 360, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
      },
    };
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/cli connect replace map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i });
    await user.type(input, 'connect kitchen east to hallway{enter}');
    await user.clear(input);
    await user.type(input, 'connect kitchen east to pantry{enter}');

    const state = useEditorStore.getState();
    const connections = Object.values(state.doc?.connections ?? {});
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      sourceRoomId: 'kitchen',
      targetRoomId: 'pantry',
    });
    expect(state.doc?.rooms.kitchen?.directions.east).toBe(connections[0].id);
    expect(state.doc?.rooms.hallway?.directions.west).toBeUndefined();
    expect(state.doc?.rooms.pantry?.directions.west).toBe(connections[0].id);
  });

  it('reports an unknown room for connect when a named room does not exist', async () => {
    let doc = createEmptyMap('CLI Connect Error Map');
    doc = {
      ...doc,
      rooms: {
        kitchen: {
          id: 'kitchen',
          name: 'Kitchen',
          description: '',
          position: { x: 120, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
      },
    };
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/cli connect error map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i });
    await user.type(input, 'connect kitchen east to hallway{enter}');

    expectGameOutputToContain('connect kitchen east to hallway', 'Unknown room "hallway".');
  });

  it('reports an ambiguity error for connect when a room name matches multiple rooms', async () => {
    let doc = createEmptyMap('CLI Connect Ambiguous Map');
    doc = {
      ...doc,
      rooms: {
        kitchen1: {
          id: 'kitchen1',
          name: 'Kitchen',
          description: '',
          position: { x: 120, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
        kitchen2: {
          id: 'kitchen2',
          name: 'Kitchen',
          description: '',
          position: { x: 240, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
        hallway: {
          id: 'hallway',
          name: 'Hallway',
          description: '',
          position: { x: 360, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
      },
    };
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/cli connect ambiguous map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i });
    await user.type(input, 'connect kitchen east to hallway{enter}');

    expectGameOutputToContain(
      'connect kitchen east to hallway',
      'The name "kitchen" is ambiguous. It could match "Kitchen".',
    );
  });

  it('supports self-loop connections', async () => {
    let doc = createEmptyMap('CLI Self Connect Map');
    doc = {
      ...doc,
      rooms: {
        kitchen: {
          id: 'kitchen',
          name: 'Kitchen',
          description: '',
          position: { x: 120, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
      },
    };
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/cli self connect map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i });
    await user.type(input, 'connect kitchen east to kitchen west{enter}');

    const state = useEditorStore.getState();
    const connections = Object.values(state.doc?.connections ?? {});
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      sourceRoomId: 'kitchen',
      targetRoomId: 'kitchen',
      isBidirectional: true,
    });
    expect(state.doc?.rooms.kitchen?.directions.east).toBe(connections[0].id);
    expect(state.doc?.rooms.kitchen?.directions.west).toBe(connections[0].id);
    expect(state.doc?.rooms.kitchen?.position).toEqual({ x: 120, y: 160 });
  });

  it('keeps uninvolved rooms fixed during connect prettification', async () => {
    let doc = createEmptyMap('CLI Connect Prettify Map');
    doc = {
      ...doc,
      rooms: {
        kitchen: {
          id: 'kitchen',
          name: 'Kitchen',
          description: '',
          position: { x: 120, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
        hallway: {
          id: 'hallway',
          name: 'Hallway',
          description: '',
          position: { x: 700, y: 520 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
        pantry: {
          id: 'pantry',
          name: 'Pantry',
          description: '',
          position: { x: 480, y: 320 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
      },
    };
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/cli connect prettify map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i });
    await user.type(input, 'connect kitchen east to hallway{enter}');

    expect(useEditorStore.getState().doc?.rooms.pantry?.position).toEqual({ x: 480, y: 320 });
  });

  it('creates and connects a room in one CLI command', async () => {
    let doc = createEmptyMap('CLI Create Connect Map');
    doc = {
      ...doc,
      rooms: {
        hallway: {
          id: 'hallway',
          name: 'Hallway',
          description: '',
          position: { x: 240, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
      },
    };
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/cli create connect map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'create and connect Kitchen east to Hallway{enter}');

    const state = useEditorStore.getState();
    const rooms = Object.values(state.doc?.rooms ?? {});
    const createdRoom = rooms.find((room) => room.name === 'Kitchen');
    const connections = Object.values(state.doc?.connections ?? {});

    expect(rooms).toHaveLength(2);
    expect(createdRoom).toBeDefined();
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      sourceRoomId: createdRoom?.id,
      targetRoomId: 'hallway',
      isBidirectional: true,
    });
    expect(state.selectedRoomIds).toEqual(expect.arrayContaining([createdRoom?.id, 'hallway']));
    expect(state.selectedConnectionIds).toEqual([connections[0].id]);
    expectGameOutputToContain('create and connect Kitchen east to Hallway', 'created and connected');

    await user.clear(input);
    await user.type(input, 'undo{enter}');

    expect(Object.values(useEditorStore.getState().doc?.rooms ?? {})).toHaveLength(1);
    expect(Object.values(useEditorStore.getState().doc?.connections ?? {})).toHaveLength(0);
    expectGameOutputToContain('undo', 'undone');
  });

  it('supports relative create-and-connect syntax', async () => {
    let doc = createEmptyMap('CLI Relative Create Connect Map');
    doc = {
      ...doc,
      rooms: {
        hallway: {
          id: 'hallway',
          name: 'Hallway',
          description: '',
          position: { x: 240, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
      },
    };
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/cli relative create connect map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'create Kitchen east of Hallway{enter}');

    const state = useEditorStore.getState();
    const rooms = Object.values(state.doc?.rooms ?? {});
    const createdRoom = rooms.find((room) => room.name === 'Kitchen');
    const connections = Object.values(state.doc?.connections ?? {});

    expect(createdRoom).toBeDefined();
    expect(connections).toHaveLength(1);
    expect(state.doc?.rooms[createdRoom!.id]?.directions.west).toBe(connections[0].id);
    expect(state.doc?.rooms.hallway?.directions.east).toBe(connections[0].id);
    expect(state.selectedRoomIds).toEqual([createdRoom!.id, 'hallway']);
    expect(state.selectedConnectionIds).toEqual([connections[0].id]);
  });

  it('supports relative above/below create syntax', async () => {
    let doc = createEmptyMap('CLI Relative Above Below Map');
    doc = {
      ...doc,
      rooms: {
        hallway: {
          id: 'hallway',
          name: 'Hallway',
          description: '',
          position: { x: 240, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
      },
    };
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/cli relative above below map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'create Kitchen above Hallway{enter}');

    const state = useEditorStore.getState();
    const rooms = Object.values(state.doc?.rooms ?? {});
    const createdRoom = rooms.find((room) => room.name === 'Kitchen');
    const connections = Object.values(state.doc?.connections ?? {});

    expect(createdRoom).toBeDefined();
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      sourceRoomId: createdRoom?.id,
      targetRoomId: 'hallway',
      isBidirectional: true,
    });
    expect(state.doc?.rooms[createdRoom!.id]?.directions.down).toBe(connections[0].id);
    expect(state.doc?.rooms.hallway?.directions.up).toBe(connections[0].id);
    expect(state.selectedRoomIds).toEqual([createdRoom!.id, 'hallway']);
    expect(state.selectedConnectionIds).toEqual([connections[0].id]);
  });

  it('keeps pre-existing rooms fixed during create-and-connect prettification', async () => {
    let doc = createEmptyMap('CLI Create Connect Prettify Map');
    doc = {
      ...doc,
      rooms: {
        hallway: {
          id: 'hallway',
          name: 'Hallway',
          description: '',
          position: { x: 520, y: 280 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
        pantry: {
          id: 'pantry',
          name: 'Pantry',
          description: '',
          position: { x: 760, y: 440 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
      },
    };
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/cli create connect prettify map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i });
    await user.type(input, 'create and connect Kitchen east to Hallway{enter}');

    const state = useEditorStore.getState();
    expect(state.doc?.rooms.hallway?.position).toEqual({ x: 520, y: 280 });
    expect(state.doc?.rooms.pantry?.position).toEqual({ x: 760, y: 440 });
  });

  it('reports an unknown room for create and connect when the target room does not exist', async () => {
    const doc = createEmptyMap('CLI Create Connect Error Map');
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/cli create connect error map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i });
    await user.type(input, 'create and connect Kitchen east to Hallway{enter}');

    expectGameOutputToContain(
      'create and connect Kitchen east to Hallway',
      'Unknown room "Hallway".',
    );
    expect(Object.values(useEditorStore.getState().doc?.rooms ?? {})).toHaveLength(0);
    expect(Object.values(useEditorStore.getState().doc?.connections ?? {})).toHaveLength(0);
  });

  it('undoes the previous command for the undo CLI command', async () => {
    const doc = createEmptyMap('CLI Undo Map');
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/cli undo map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'create Kitchen{enter}');
    expect(Object.values(useEditorStore.getState().doc?.rooms ?? {})).toHaveLength(1);

    fireEvent.change(input, { target: { value: 'undo' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(Object.values(useEditorStore.getState().doc?.rooms ?? {})).toHaveLength(0);
    expectGameOutputToContain('create Kitchen', 'created', 'undo', 'undone');
  });

  it('redoes the previous undone command for the redo CLI command', async () => {
    const doc = createEmptyMap('CLI Redo Map');
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/cli redo map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'create Kitchen{enter}');
    await user.clear(input);
    await user.type(input, 'undo{enter}');
    expect(Object.values(useEditorStore.getState().doc?.rooms ?? {})).toHaveLength(0);

    await user.clear(input);
    await user.type(input, 'redo{enter}');
    expect(Object.values(useEditorStore.getState().doc?.rooms ?? {})).toHaveLength(1);
    expect(Object.values(useEditorStore.getState().doc?.rooms ?? {})[0]?.name).toBe('Kitchen');
    expectGameOutputToContain('redo', 'redone');
  });

  it('reports when there is nothing to undo for the undo CLI command', async () => {
    const doc = createEmptyMap('CLI Empty Undo Map');
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/cli empty undo map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'undo{enter}');

    expectGameOutputToContain('undo', 'Nothing to undo.');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('reports when there is nothing to redo for the redo CLI command', async () => {
    const doc = createEmptyMap('CLI Empty Redo Map');
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/cli empty redo map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'redo{enter}');

    expectGameOutputToContain('redo', 'Nothing to redo.');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('logs a syntax error for an invalid CLI command', async () => {
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByRole('textbox', { name: /cli command/i });
    await user.type(input, 'create{enter}');

    expectGameOutputToContain(
      'create',
      "I didn't understand you.",
    );

    await user.type(input, 'x');
    expectGameOutputToContain(
      'create',
      "I didn't understand you.",
    );
  });

  it('retains the full game output history', () => {
    render(<App />);

    const input = screen.getByRole('textbox', { name: /cli command/i });
    const form = input.closest('form') as HTMLFormElement;

    for (let index = 1; index <= 7; index += 1) {
      fireEvent.change(input, { target: { value: `blorb room ${index}` } });
      fireEvent.submit(form);
    }

    const outputLines = getGameOutputBox().value.split('\n');
    expect(outputLines).toHaveLength(21);
    expect(outputLines[0]).toBe('>blorb room 1');
    expect(outputLines[1]).toContain("I didn't understand you.");
    expect(outputLines[2]).toBe('');
    expect(outputLines[18]).toBe('>blorb room 7');
    expect(outputLines[19]).toContain("I didn't understand you.");
    expect(outputLines[20]).toBe('');
  });

  it('opens and closes the help dialog', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /help/i }));
    expect(screen.getByRole('dialog', { name: /help/i })).toBeInTheDocument();
    expect(screen.getByText(/fweep help/i)).toBeInTheDocument();
    expect(screen.getByText(/navigating the map/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /close help/i }));
    expect(screen.queryByRole('dialog', { name: /help/i })).not.toBeInTheDocument();
  });

  it('closes the help dialog from the backdrop and Escape key, and renders subheadings and rules', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: /help/i }));
    expect(screen.getByRole('heading', { name: /undo\/redo/i })).toBeInTheDocument();
    expect(document.querySelectorAll('.help-rule').length).toBeGreaterThan(0);

    await user.click(document.querySelector('.help-backdrop') as HTMLElement);
    expect(screen.queryByRole('dialog', { name: /help/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /help/i }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: /help/i })).not.toBeInTheDocument();
  });

  it('shows the map selection dialog at the root URL', async () => {
    navigateTo('#/');
    render(<App />);
    expect(await screen.findByRole('dialog', { name: /choose a map/i })).toBeInTheDocument();
  });

  it('loads and displays a saved map when URL is #/map/<id>', async () => {
    const doc = createEmptyMap('Routed Map');
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);
    render(<App />);

    expect(await screen.findByText(/routed map/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /prettify layout/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /redo/i })).toBeInTheDocument();
    // Should NOT show the selection dialog
    expect(screen.queryByRole('dialog', { name: /choose a map/i })).not.toBeInTheDocument();
  });

  it('returns to the selection screen from the map header back button', async () => {
    const doc = createEmptyMap('Return Map');
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);
    const user = userEvent.setup();
    render(<App />);

    await screen.findByText(/return map/i);
    await user.click(screen.getByRole('button', { name: /back to maps/i }));

    await waitFor(() => {
      expect(window.location.hash).toBe('#/');
    });
    expect(await screen.findByRole('dialog', { name: /choose a map/i })).toBeInTheDocument();
  });

  it('autosaves after undoing back to the originally loaded state', async () => {
    const originalDoc = createEmptyMap('Undo Save Map');
    await saveMap(originalDoc);

    navigateTo(`#/map/${originalDoc.metadata.id}`);
    render(<App />);

    await screen.findByText(/undo save map/i);

    act(() => {
      useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 0, y: 0 });
    });

    await waitFor(() => loadMap(originalDoc.metadata.id).then((persisted) => {
      expect(Object.values(persisted?.rooms ?? {})).toHaveLength(1);
    }));

    act(() => {
      useEditorStore.getState().undo();
    });

    await waitFor(() => loadMap(originalDoc.metadata.id).then((persisted) => {
      expect(persisted).toEqual(originalDoc);
    }));
  });

  it('updates the URL when a map is selected from the dialog', async () => {
    const doc = createEmptyMap('Clickable Map');
    await saveMap(doc);

    navigateTo('#/');
    const user = userEvent.setup();
    render(<App />);

    const mapBtn = await screen.findByText('Clickable Map');
    await user.click(mapBtn);

    await waitFor(() => {
      expect(window.location.hash).toBe(`#/map/${doc.metadata.id}`);
    });
    expect(await screen.findByText(/clickable map/i)).toBeInTheDocument();
  });

  it('updates the URL when a new map is created', async () => {
    navigateTo('#/');
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByPlaceholderText('Map name');
    await user.type(input, 'Fresh Map');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() => {
      expect(window.location.hash).toMatch(/^#\/map\/.+$/);
    });
    expect(await screen.findByText(/fresh map/i)).toBeInTheDocument();
  });

  it('falls back to the selection dialog for an invalid map ID in the URL', async () => {
    navigateTo('#/map/nonexistent-id');
    render(<App />);

    // Should fall back to showing the selection dialog
    expect(await screen.findByRole('dialog', { name: /choose a map/i })).toBeInTheDocument();
  });

  it('shows an error when a saved map in the URL is invalid', async () => {
    const doc = createEmptyMap('Broken Routed Map');
    const brokenDoc = {
      ...doc,
      metadata: {
        ...doc.metadata,
        updatedAt: 123,
      },
    };

    await saveMap(brokenDoc as never);

    navigateTo(`#/map/${doc.metadata.id}`);
    render(<App />);

    expect(await screen.findByRole('dialog', { name: /choose a map/i })).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This map could not be opened because its saved data is invalid or incompatible.',
    );
  });
});
