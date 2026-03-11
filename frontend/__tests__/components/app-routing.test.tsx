import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createEmptyMap } from '../../src/domain/map-types';
import { loadMap, saveMap } from '../../src/storage/map-store';
import { App } from '../../src/app';
import { useEditorStore } from '../../src/state/editor-store';

/** Push a hash route into jsdom's location and fire popstate. */
function navigateTo(hashRoute: string) {
  window.history.pushState({}, '', hashRoute);
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
    expect(screen.getByRole('textbox', { name: /cli command/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /prettify layout/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /redo/i })).not.toBeInTheDocument();
  });

  it('logs the parsed CLI action when the user presses Enter for an unimplemented command', async () => {
    const user = userEvent.setup();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(<App />);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'connect Kitchen east to Hallway{enter}');

    expect(logSpy).toHaveBeenCalledWith('create a two-way connection from Kitchen going east to Hallway going west');
    expect(errorSpy).not.toHaveBeenCalled();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('creates, selects, and centers a room for the create CLI command', async () => {
    const doc = createEmptyMap('CLI Map');
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

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
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);

    logSpy.mockRestore();
    errorSpy.mockRestore();
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
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(<App />);
    await screen.findByText(/cli delete map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'delete kitchen{enter}');

    const state = useEditorStore.getState();
    expect(Object.values(state.doc?.rooms ?? {})).toHaveLength(0);
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('reports an unknown room for delete when no matching room exists', async () => {
    const doc = createEmptyMap('CLI Delete Error Map');
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(<App />);
    await screen.findByText(/cli delete error map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'delete kitchen{enter}');

    expect(errorSpy).toHaveBeenCalledWith('Unknown room kitchen');
    expect(logSpy).not.toHaveBeenCalled();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);

    logSpy.mockRestore();
    errorSpy.mockRestore();
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
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(<App />);
    await screen.findByText(/cli duplicate delete map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'delete kitchen{enter}');

    expect(errorSpy).toHaveBeenCalledWith('Multiple rooms have that name. You must delete them manually.');
    expect(logSpy).not.toHaveBeenCalled();
    expect(Object.values(useEditorStore.getState().doc?.rooms ?? {})).toHaveLength(2);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('opens the room editor for the edit CLI command', async () => {
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

    const user = userEvent.setup();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(<App />);
    await screen.findByText(/cli edit map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'edit kitchen{enter}');

    expect(await screen.findByRole('dialog', { name: /room editor/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /room name/i })).toHaveValue('Kitchen');
    expect(useEditorStore.getState().selectedRoomIds).toEqual(['room-1']);
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalledWith('Unknown room kitchen');
    expect(errorSpy).not.toHaveBeenCalledWith('Multiple rooms have that name. You must edit them manually.');
    expect(errorSpy).not.toHaveBeenCalledWith("I didn't understand you.");
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('reports an unknown room for edit when no matching room exists', async () => {
    const doc = createEmptyMap('CLI Edit Error Map');
    await saveMap(doc);

    navigateTo(`#/map/${doc.metadata.id}`);

    const user = userEvent.setup();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(<App />);
    await screen.findByText(/cli edit error map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'edit kitchen{enter}');

    expect(errorSpy).toHaveBeenCalledWith('Unknown room kitchen');
    expect(logSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: /room editor/i })).not.toBeInTheDocument();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);

    logSpy.mockRestore();
    errorSpy.mockRestore();
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
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(<App />);
    await screen.findByText(/cli duplicate edit map/i);

    const input = screen.getByRole('textbox', { name: /cli command/i }) as HTMLInputElement;
    await user.type(input, 'edit kitchen{enter}');

    expect(errorSpy).toHaveBeenCalledWith('Multiple rooms have that name. You must edit them manually.');
    expect(logSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: /room editor/i })).not.toBeInTheDocument();
    expect(Object.values(useEditorStore.getState().doc?.rooms ?? {})).toHaveLength(2);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);

    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it('logs a syntax error for an invalid CLI command', async () => {
    const user = userEvent.setup();
    const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    render(<App />);

    await user.type(screen.getByRole('textbox', { name: /cli command/i }), 'create{enter}');

    expect(errorSpy).toHaveBeenCalledWith("I didn't understand you.");
    expect(logSpy).not.toHaveBeenCalled();

    logSpy.mockRestore();
    errorSpy.mockRestore();
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
    fireEvent.keyDown(window, { key: 'Escape' });
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

    await waitFor(async () => {
      const persisted = await loadMap(originalDoc.metadata.id);
      expect(Object.values(persisted?.rooms ?? {})).toHaveLength(1);
    });

    act(() => {
      useEditorStore.getState().undo();
    });

    await waitFor(async () => {
      const persisted = await loadMap(originalDoc.metadata.id);
      expect(persisted).toEqual(originalDoc);
    });
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
  });

  it('updates the URL when a new map is created', async () => {
    navigateTo('#/');
    const user = userEvent.setup();
    render(<App />);

    const input = screen.getByPlaceholderText('Map name');
    await user.type(input, 'Fresh Map');
    await user.click(screen.getByRole('button', { name: /create/i }));

    await waitFor(() => {
      expect(window.location.hash).toMatch(/^#\/map\/.+$/);
    });
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
