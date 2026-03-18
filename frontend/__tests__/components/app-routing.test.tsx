import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addConnection, addItem, addPseudoRoom, addRoom } from '../../src/domain/map-operations';
import { getCliHelpOverviewLines, getCliHelpTopicLines } from '../../src/domain/cli-help';
import { createConnection, createEmptyMap, createItem, createPseudoRoom, createRoom, DEFAULT_CLI_OUTPUT_LINES } from '../../src/domain/map-types';
import type { MapDocument } from '../../src/domain/map-types';
import { getRoomNodeDimensions } from '../../src/graph/room-label-geometry';
import { loadMap, saveMap } from '../../src/storage/map-store';
import { App } from '../../src/app';
import { useEditorStore } from '../../src/state/editor-store';

/** Push a hash route into jsdom's location and fire popstate. */
function navigateTo(hashRoute: string) {
  window.history.pushState({}, '', hashRoute);
}

function setViewportWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
}

function getGameOutputBox(): HTMLElement {
  return screen.getByRole('log', { name: /game output log/i });
}

function getCliInput(): HTMLInputElement {
  return screen.getByRole('combobox', { name: /cli command/i }) as HTMLInputElement;
}

function renderApp(): ReturnType<typeof render> {
  return render(<App />);
}

async function openSavedMap(doc: MapDocument): Promise<void> {
  await saveMap(doc);
  navigateTo(`#/map/${doc.metadata.id}`);
}

async function renderAppWithSavedMap(doc: MapDocument): Promise<void> {
  await openSavedMap(doc);
  renderApp();
  await screen.findByLabelText(`Map name: ${doc.metadata.name}`);
}

async function renderAppWithOpenMap(mapName = 'Opened Map') {
  const doc = createEmptyMap(mapName);
  await renderAppWithSavedMap(doc);
  return doc;
}

function expectGameOutputToContain(...fragments: readonly string[]) {
  const value = getGameOutputBox().textContent ?? '';
  for (const fragment of fragments) {
    const capitalizedFragment = fragment.length > 0
      ? `${fragment[0].toUpperCase()}${fragment.slice(1)}`
      : fragment;
    expect(value.includes(fragment) || value.includes(capitalizedFragment)).toBe(true);
  }
}

function getRenderedCliLine(line: string): string {
  return line.replace(/\*\*(.+?)\*\*/g, '$1');
}

async function openCliSuggestions(user: ReturnType<typeof userEvent.setup>, input = getCliInput()): Promise<void> {
  await user.click(input);
  await user.keyboard('/');
}

async function submitCliCommand(command: string): Promise<HTMLInputElement> {
  const input = getCliInput();
  await act(async () => {
    fireEvent.change(input, { target: { value: command } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
  });
  return input;
}

beforeEach(() => {
  // Reset URL to the selection screen before each test
  window.history.replaceState({}, '', '#/');
  setViewportWidth(1024);
  // Reset editor store
  useEditorStore.setState(useEditorStore.getInitialState());
});

describe('URL routing', () => {
  it('renders selection-screen controls', () => {
    renderApp();

    expect(screen.queryByRole('button', { name: /disable grid snapping/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /switch to .+ mode/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^help$/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/cli command/i)).not.toBeInTheDocument();
    expect(screen.queryByText('fweep!')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /prettify layout/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /redo/i })).not.toBeInTheDocument();
  });

  it('shows a desktop-only message when the viewport is narrower than 960px', () => {
    setViewportWidth(959);

    renderApp();

    expect(screen.getByRole('heading', { name: /optimized for desktop/i })).toBeInTheDocument();
    expect(screen.getByText(/please come back on a desktop or laptop/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create a new map/i })).not.toBeInTheDocument();
  });

  it('returns to the normal app when the viewport grows back to desktop width', async () => {
    setViewportWidth(959);
    renderApp();

    expect(screen.getByRole('heading', { name: /optimized for desktop/i })).toBeInTheDocument();

    act(() => {
      setViewportWidth(1024);
      window.dispatchEvent(new Event('resize'));
    });

    expect(await screen.findByRole('dialog', { name: /choose a map/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /import from file/i })).toBeInTheDocument();
  });

  it('switches the CLI placeholder after the input has been used once', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI Placeholder Map');

    const input = getCliInput();
    expect(input).toHaveAttribute('placeholder', 'Type help');

    await user.type(input, 'help');
    await user.clear(input);

    expect(input).toHaveAttribute('placeholder', 'Type / to open suggestions');

    fireEvent.blur(input);

    expect(input).toHaveAttribute('placeholder', 'Type / to type commands');
  });

  it('keeps suggestions closed on focus and opens them with /', async () => {
    const user = userEvent.setup();
    const map = addRoom(createEmptyMap('CLI Suggestions Map'), { ...createRoom('Cellar'), position: { x: 0, y: 0 } });
    await renderAppWithSavedMap(map);

    const input = getCliInput();
    expect(input).toHaveAttribute('role', 'combobox');

    await user.click(input);
    expect(screen.queryByRole('listbox', { name: /cli suggestions/i })).not.toBeInTheDocument();

    await user.keyboard('/');
    expect(screen.getByRole('listbox', { name: /cli suggestions/i })).toBeInTheDocument();
    const optionText = screen.getAllByRole('option').map((option) => option.textContent ?? '');
    expect(optionText.some((text) => text.includes('create'))).toBe(true);
    expect(optionText.some((text) => text.includes('connect'))).toBe(true);
    expect(optionText.some((text) => text.includes('arrange'))).toBe(true);
    expect(optionText.some((text) => text.includes('north'))).toBe(true);
    expect(optionText).toContain('<room>');
  });

  it('toggles suggestions with / without inserting a slash into the CLI input', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI Slash Toggle Map');

    const input = getCliInput();

    await user.click(input);
    await user.keyboard('/');
    expect(input).toHaveValue('');
    expect(screen.getByRole('listbox', { name: /cli suggestions/i })).toBeInTheDocument();

    await user.keyboard('/');
    expect(input).toHaveValue('');
    expect(screen.queryByRole('listbox', { name: /cli suggestions/i })).not.toBeInTheDocument();
  });

  it('accepts the highlighted suggestion with Tab and immediately suggests the next legal words', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI Accept Suggestion Map');

    const input = getCliInput();

    await openCliSuggestions(user, input);
    await user.type(input, 'c');
    await user.keyboard('{Tab}');

    expect(document.activeElement).toBe(input);
    expect(input).toHaveValue('create ');
    expect(screen.getByRole('listbox', { name: /cli suggestions/i })).toBeInTheDocument();
    expect(screen.getAllByRole('option').map((option) => option.textContent ?? '')).toEqual(['<new room name>']);
  });

  it('uses arrow keys to navigate suggestions while the suggestion menu is open', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI Suggestion Navigation Map');

    const input = getCliInput();

    await openCliSuggestions(user, input);
    await user.type(input, 'c');
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Tab}');

    expect(input).toHaveValue('connect ');
  });

  it('uses arrow keys to navigate default suggestions before any typing', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI Default Suggestion Navigation Map');

    const input = getCliInput();

    await openCliSuggestions(user, input);
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Tab}');

    expect(input).toHaveValue('connect ');
  });

  it('scrolls the suggestion popup to keep the highlighted option visible', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI Suggestion Scroll Map');

    const input = getCliInput();

    await openCliSuggestions(user, input);

    const listbox = screen.getByRole('listbox', { name: /cli suggestions/i });
    Object.defineProperty(listbox, 'clientHeight', {
      configurable: true,
      value: 90,
    });
    Object.defineProperty(listbox, 'scrollTop', {
      configurable: true,
      writable: true,
      value: 0,
    });

    screen.getAllByRole('option').forEach((option, index) => {
      Object.defineProperty(option, 'offsetTop', {
        configurable: true,
        value: index * 30,
      });
      Object.defineProperty(option, 'offsetHeight', {
        configurable: true,
        value: 30,
      });
    });

    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');

    expect(listbox.scrollTop).toBeGreaterThan(0);
  });

  it('keeps arrow keys on suggestions even when command history exists', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI Suggestion Navigation With History Map');

    await submitCliCommand('help');

    const input = getCliInput();

    await openCliSuggestions(user, input);
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Tab}');

    expect(input).toHaveValue('connect ');
  });

  it('shows legal next-word suggestions immediately after typing a space', async () => {
    const user = userEvent.setup();
    const map = addRoom(createEmptyMap('CLI Next Word Map'), { ...createRoom('Cellar'), position: { x: 0, y: 0 } });
    await renderAppWithSavedMap(map);

    const input = getCliInput();

    await openCliSuggestions(user, input);
    await user.type(input, 'create ');

    const optionText = screen.getAllByRole('option').map((option) => option.textContent ?? '');
    expect(optionText).toEqual(['<new room name>']);
  });

  it('suggests the as a first-token starter and room/way after the', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI The Starter Suggestions Map');

    const input = getCliInput();

    await openCliSuggestions(user, input);
    await user.type(input, 't');

    expect(screen.getAllByRole('option').map((option) => option.textContent ?? '')).toContain('the');

    await user.type(input, 'he ');

    expect(screen.getAllByRole('option').map((option) => option.textContent ?? '')).toEqual(['room', 'way']);
  });

  it('shows a new-room placeholder after create and connect plus a space', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI Create And Connect Placeholder Map');

    const input = getCliInput();

    await openCliSuggestions(user, input);
    await user.type(input, 'create and connect ');

    const optionText = screen.getAllByRole('option').map((option) => option.textContent ?? '');
    expect(optionText).toEqual(['<new room name>']);
  });

  it('shows only "to" after one-way in connect command suggestions', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI One Way Suggestions Map');

    const input = getCliInput();

    await openCliSuggestions(user, input);
    await user.type(input, 'connect Kitchen north one-way ');

    expect(screen.getAllByRole('option').map((option) => option.textContent ?? '')).toEqual(['to']);
  });

  it('shows a room placeholder at the start of a show room slot', async () => {
    const user = userEvent.setup();
    const map = addRoom(createEmptyMap('CLI Room Placeholder Map'), { ...createRoom('Pool'), position: { x: 0, y: 0 } });
    await renderAppWithSavedMap(map);

    const input = getCliInput();

    await openCliSuggestions(user, input);
    await user.type(input, 'show ');

    expect(screen.getAllByRole('option').map((option) => option.textContent ?? '')).toEqual(['<room>']);
  });

  it('shows only dark and lit after a room-led is phrase', async () => {
    const user = userEvent.setup();
    const map = addRoom(createEmptyMap('CLI Room Lighting Suggestions Map'), { ...createRoom('Kitchen'), position: { x: 0, y: 0 } });
    await renderAppWithSavedMap(map);

    const input = getCliInput();

    await openCliSuggestions(user, input);
    await user.type(input, 'Kitchen is ');

    expect(screen.getAllByRole('option').map((option) => option.textContent ?? '')).toEqual(['dark', 'lit']);
  });

  it('closes suggestions after a completed room-led adjective phrase', async () => {
    const user = userEvent.setup();
    const map = addRoom(createEmptyMap('CLI Completed Room Lighting Suggestions Map'), {
      ...createRoom('Kitchen'),
      position: { x: 0, y: 0 },
    });
    await renderAppWithSavedMap(map);

    const input = getCliInput();

    await openCliSuggestions(user, input);
    await user.type(input, 'Kitchen is lit ');

    expect(screen.queryByRole('listbox', { name: /cli suggestions/i })).not.toBeInTheDocument();
  });

  it('inserts is after a completed room-to-room phrase without deleting the target room', async () => {
    const user = userEvent.setup();
    await renderAppWithSavedMap(createEmptyMap('CLI Room To Room Suggestions Map'));

    const input = getCliInput();

    await openCliSuggestions(user, input);
    await user.type(input, 'bedroom to bathroom ');

    expect(screen.getAllByRole('option').map((option) => option.textContent ?? '')).toEqual(['is']);

    await user.keyboard('{Tab}');

    expect(input).toHaveValue('bedroom to bathroom is ');
  });

  it('switches from the room placeholder to real matching rooms once typing begins', async () => {
    const user = userEvent.setup();
    let map = createEmptyMap('CLI Room Match Suggestions Map');
    map = addRoom(map, { ...createRoom('Pool'), position: { x: 0, y: 0 } });
    map = addRoom(map, { ...createRoom('Pool House'), position: { x: 40, y: 0 } });
    await renderAppWithSavedMap(map);

    const input = getCliInput();

    await openCliSuggestions(user, input);
    await user.type(input, 'show p');

    expect(screen.getAllByRole('option').map((option) => option.textContent ?? '')).toEqual(['Pool', 'Pool House']);
  });

  it('keeps suggesting a longer multi-word room after a space inside the room reference', async () => {
    const user = userEvent.setup();
    const map = addRoom(createEmptyMap('CLI Multi Word Room Suggestions Map'), { ...createRoom('Living Room'), position: { x: 0, y: 0 } });
    await renderAppWithSavedMap(map);

    const input = getCliInput();

    await openCliSuggestions(user, input);
    await user.type(input, 'connect living ');

    expect(screen.getAllByRole('option').map((option) => option.textContent ?? '')).toEqual(
      expect.arrayContaining(['Living Room', 'north']),
    );
  });

  it('leaves the input unchanged when the new-room placeholder is accepted', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI Placeholder Accept Map');

    const input = getCliInput();

    await openCliSuggestions(user, input);
    await user.type(input, 'create ');
    await user.keyboard('{Tab}');

    expect(document.activeElement).toBe(input);
    expect(input).toHaveValue('create ');
    expect(screen.getByRole('listbox', { name: /cli suggestions/i })).toBeInTheDocument();
  });

  it('shows adjective and relative-create suggestions after create plus a room name and space', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI Create Modifier Suggestions Map');

    const input = getCliInput();

    await openCliSuggestions(user, input);
    await user.type(input, 'create Kitchen ');

    const optionText = screen.getAllByRole('option').map((option) => option.textContent ?? '');
    expect(optionText.some((text) => text.includes(', which is'))).toBe(true);
    expect(optionText.some((text) => text.includes('above'))).toBe(true);
    expect(optionText.some((text) => text.includes('north'))).toBe(true);
  });

  it('reuses an existing comma when accepting the adjective phrase suggestion', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI Existing Comma Suggestion Map');

    const input = getCliInput();

    await openCliSuggestions(user, input);
    await user.type(input, 'create foobar,');
    await user.keyboard('{Tab}');

    expect(input).toHaveValue('create foobar, which is ');
  });

  it('shows only "of" after a create direction and space', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI Create Direction Suggestions Map');

    const input = getCliInput();

    await openCliSuggestions(user, input);
    await user.type(input, 'create foobar north ');

    expect(screen.getAllByRole('option').map((option) => option.textContent ?? '')).toEqual(['of']);
  });

  it('requires a comma after create adjective phrases before showing directions', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI Create Adjective Comma Suggestions Map');

    const input = getCliInput();

    await openCliSuggestions(user, input);
    await user.type(input, 'create foobar, which is lit ');
    expect(screen.getAllByRole('option').map((option) => option.textContent ?? '')).toEqual([',']);

    await user.type(input, ', ');
    const optionText = screen.getAllByRole('option').map((option) => option.textContent ?? '');
    expect(optionText).toContain('north');
  });

  it('closes suggestions after a complete relative create phrase', async () => {
    const user = userEvent.setup();
    const map = addRoom(createEmptyMap('CLI Complete Relative Create Map'), { ...createRoom('Pool'), position: { x: 0, y: 0 } });
    await renderAppWithSavedMap(map);

    const input = getCliInput();

    await openCliSuggestions(user, input);
    await user.type(input, 'create foobar north of pool ');

    expect(screen.queryByRole('listbox', { name: /cli suggestions/i })).not.toBeInTheDocument();
  });

  it('closes the suggestion menu on Escape without clearing the current draft', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI Suggestion Escape Map');

    const input = getCliInput();

    await openCliSuggestions(user, input);
    await user.type(input, 'c');
    expect(screen.getByRole('listbox', { name: /cli suggestions/i })).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(input).toHaveValue('c');
    expect(screen.queryByRole('listbox', { name: /cli suggestions/i })).not.toBeInTheDocument();
  });

  it('accepts a room suggestion and executes the resulting command', async () => {
    const user = userEvent.setup();
    const cellar = { ...createRoom('Cellar'), position: { x: 120, y: 160 } };
    const map = addRoom(createEmptyMap('CLI Room Suggestion Map'), cellar);
    await renderAppWithSavedMap(map);

    const input = getCliInput();

    await openCliSuggestions(user, input);
    await user.type(input, 'show c');
    await user.keyboard('{Tab}');
    await user.keyboard('{Enter}');

    expectGameOutputToContain('show Cellar', 'Cellar');
    expect(Array.from(getGameOutputBox().querySelectorAll('strong')).some((node) => node.textContent === 'Cellar')).toBe(true);
  });

  it('keeps suggestions enabled after submitting a command when slash-mode was open', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI Suggestion Persistence Map');

    const input = getCliInput();

    await openCliSuggestions(user, input);
    await user.type(input, 'help{enter}');

    expect(input).toHaveValue('');
    expect(screen.getByRole('listbox', { name: /cli suggestions/i })).toBeInTheDocument();
  });

  it('navigates CLI command history with the up and down arrows', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI History Map');

    const input = getCliInput();

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

  it('keeps the first CLI history entry selected when pressing ArrowUp repeatedly', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI History Ceiling Map');

    const input = getCliInput();

    await user.type(input, 'help{enter}');
    await user.type(input, 'arrange{enter}');

    await user.keyboard('{ArrowUp}');
    await user.keyboard('{ArrowUp}');
    await user.keyboard('{ArrowUp}');

    expect(input).toHaveValue('help');
  });

  it('restores the in-progress CLI draft after leaving command history', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI Draft Map');

    const input = getCliInput();

    await user.type(input, 'help{enter}');
    await user.type(input, 'arrange{enter}');
    await user.type(input, 'sho');
    await user.keyboard('{Escape}');

    await user.keyboard('{ArrowUp}');
    expect(input).toHaveValue('arrange');

    await user.keyboard('{ArrowDown}');
    expect(input).toHaveValue('sho');
  });

  it('restores the in-progress CLI draft when leaving the newest history entry', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI Draft Restore Map');

    const input = getCliInput();

    await user.type(input, 'help{enter}');
    await user.type(input, 'arrange{enter}');
    await user.type(input, 'sho');
    await user.keyboard('{Escape}');

    await user.keyboard('{ArrowUp}');
    expect(input).toHaveValue('arrange');

    await user.keyboard('{ArrowDown}');
    expect(input).toHaveValue('sho');
  });

  it('focuses the CLI input without opening suggestions when / is pressed outside a text editor', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI Focus Map');

    const input = getCliInput();
    const helpButton = screen.getByRole('button', { name: /help/i });

    helpButton.focus();
    expect(document.activeElement).toBe(helpButton);

    await user.keyboard('/');

    expect(document.activeElement).toBe(input);
    expect(input).toHaveValue('');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
    expect(screen.queryByRole('listbox', { name: /cli suggestions/i })).not.toBeInTheDocument();
  });

  it('keeps suggestions closed when refocusing the CLI via / after they were previously open', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI Refocus Slash Map');

    const input = getCliInput();
    await user.click(input);
    await user.keyboard('/');
    expect(screen.getByRole('listbox', { name: /cli suggestions/i })).toBeInTheDocument();

    fireEvent.blur(input);

    await user.keyboard('/');

    expect(document.activeElement).toBe(input);
    expect(screen.queryByRole('listbox', { name: /cli suggestions/i })).not.toBeInTheDocument();
  });

  it('focuses the CLI input when the output log is clicked', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI Output Focus Map');

    const input = getCliInput();

    await user.click(getGameOutputBox());

    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('keeps suggestions closed when the output log refocuses the CLI after they were previously open', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI Output Refocus Map');

    const input = getCliInput();

    await user.click(input);
    await user.keyboard('/');
    expect(screen.getByRole('listbox', { name: /cli suggestions/i })).toBeInTheDocument();

    fireEvent.blur(input);

    await user.click(getGameOutputBox());

    expect(document.activeElement).toBe(input);
    expect(screen.queryByRole('listbox', { name: /cli suggestions/i })).not.toBeInTheDocument();
  });

  it('collapses the output log to widen the minimap viewport approximation and persists that state', async () => {
    const user = userEvent.setup();
    const doc = createEmptyMap('CLI Collapse Map');
    const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
    const hallway = { ...createRoom('Hallway'), position: { x: 160, y: 120 } };
    let savedDoc = addRoom(doc, kitchen);
    savedDoc = addRoom(savedDoc, hallway);
    await renderAppWithSavedMap(savedDoc);

    const canvas = await screen.findByTestId('map-canvas');
    jest.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 1200,
      bottom: 800,
      width: 1200,
      height: 800,
      toJSON: () => ({}),
    });

    act(() => {
      window.dispatchEvent(new Event('resize'));
    });

    const viewport = await screen.findByTestId('map-minimap-viewport');
    const initialWidth = Number(viewport.getAttribute('width'));

    await user.click(screen.getByRole('button', { name: /collapse output log/i }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /expand output log/i })).toBeInTheDocument();
    });

    const collapsedWidth = Number(screen.getByTestId('map-minimap-viewport').getAttribute('width'));
    expect(collapsedWidth).toBeGreaterThan(initialWidth);

    await waitFor(async () => {
      const reloaded = await loadMap(savedDoc.metadata.id);
      expect(reloaded?.view.cliOutputCollapsed).toBe(true);
    });
  });

  it('uses / to toggle suggestions in an already focused CLI input without inserting it', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI Slash Map');

    const input = getCliInput();

    await user.click(input);
    await user.keyboard('/');

    expect(document.activeElement).toBe(input);
    expect(input).toHaveValue('');
    expect(screen.getByRole('listbox', { name: /cli suggestions/i })).toBeInTheDocument();
  });

  it('does not steal / from a focused textarea, select, or contenteditable element', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI Slash Editable Elements Map');

    const textarea = document.createElement('textarea');
    document.body.append(textarea);
    textarea.focus();
    await user.keyboard('/');
    expect(document.activeElement).toBe(textarea);

    const select = document.createElement('select');
    select.innerHTML = '<option value="one">One</option><option value="two">Two</option>';
    document.body.append(select);
    select.focus();
    await user.keyboard('/');
    expect(document.activeElement).toBe(select);

    const editable = document.createElement('div');
    editable.contentEditable = 'true';
    editable.tabIndex = 0;
    Object.defineProperty(editable, 'isContentEditable', {
      configurable: true,
      value: true,
    });
    document.body.append(editable);
    editable.focus();
    await user.keyboard('/');
    expect(document.activeElement).toBe(editable);
  });

  it('opens the hidden script import input when the import button is clicked', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI Script Button Map');

    const fileInput = document.querySelector('.app-cli-import-input') as HTMLInputElement;
    const clickSpy = jest.spyOn(fileInput, 'click');

    await user.click(screen.getByRole('button', { name: /import map script/i }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('reveals a room for go to <room> CLI commands', async () => {
    const kitchen = { ...createRoom('Kitchen'), position: { x: 120, y: 160 } };
    let doc = createEmptyMap('CLI Go To Map');
    doc = addRoom(doc, kitchen);
    await renderAppWithSavedMap(doc);

    await submitCliCommand('go to Kitchen');

    expectGameOutputToContain('go to Kitchen', 'Kitchen');
    expect(Array.from(getGameOutputBox().querySelectorAll('strong')).some((node) => node.textContent === 'Kitchen')).toBe(true);
  });

  it('imports a script file by executing each CLI line in order', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI Script Import Map');

    const fileInput = document.querySelector('.app-cli-import-input') as HTMLInputElement;
    const scriptFile = new File(
      ['create Kitchen\ncreate Hallway\nconnect Kitchen east to Hallway'],
      'map-script.txt',
      { type: 'text/plain' },
    );

    await user.upload(fileInput, scriptFile);

    await waitFor(() => {
      const state = useEditorStore.getState();
      expect(Object.values(state.doc?.rooms ?? {})).toHaveLength(2);
      expect(Object.values(state.doc?.connections ?? {})).toHaveLength(1);
    });

    expectGameOutputToContain(
      'create Kitchen',
      'create Hallway',
      'connect Kitchen east to Hallway',
      'Imported 3 commands from "map-script.txt".',
    );
    await waitFor(() => {
      expect(fileInput).toHaveValue('');
    });
  });

  it('puts items into a room through the CLI', async () => {
    await renderAppWithOpenMap('CLI Put Items Map');

    await submitCliCommand('create Kitchen');
    await submitCliCommand('put lantern, key, and sword in Kitchen');

    await waitFor(() => {
      const items = Object.values(useEditorStore.getState().doc?.items ?? {});
      expect(items).toHaveLength(3);
      expect(items.map((item) => item.name)).toEqual(['lantern', 'key', 'sword']);
      expect(new Set(items.map((item) => item.roomId))).toEqual(new Set([Object.keys(useEditorStore.getState().doc?.rooms ?? {})[0]]));
    });

    expectGameOutputToContain('put lantern, key, and sword in Kitchen', 'Placed.');
  });

  it('takes items from a room through the CLI', async () => {
    const doc = createEmptyMap('CLI Take Items Map');
    const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
    let savedDoc = addRoom(doc, kitchen);
    savedDoc = addItem(savedDoc, createItem('lantern', kitchen.id));
    savedDoc = addItem(savedDoc, createItem('key', kitchen.id));
    savedDoc = addItem(savedDoc, createItem('sword', kitchen.id));
    await renderAppWithSavedMap(savedDoc);

    await submitCliCommand('take lantern, key from Kitchen');

    await waitFor(() => {
      const items = Object.values(useEditorStore.getState().doc?.items ?? {});
      expect(items).toHaveLength(1);
      expect(items[0]?.name).toBe('sword');
    });

    expectGameOutputToContain('take lantern, key from Kitchen', 'Took.');
  });

  it('takes all items from a room through the CLI', async () => {
    const doc = createEmptyMap('CLI Take All Items Map');
    const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
    let savedDoc = addRoom(doc, kitchen);
    savedDoc = addItem(savedDoc, createItem('lantern', kitchen.id));
    savedDoc = addItem(savedDoc, createItem('key', kitchen.id));
    savedDoc = addItem(savedDoc, createItem('sword', kitchen.id));
    await renderAppWithSavedMap(savedDoc);

    await submitCliCommand('take all from Kitchen');

    await waitFor(() => {
      expect(Object.values(useEditorStore.getState().doc?.items ?? {})).toHaveLength(0);
    });

    expectGameOutputToContain('take all from Kitchen', 'Took.');
  });

  it('gets items from a room through the CLI', async () => {
    const doc = createEmptyMap('CLI Get Items Map');
    const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
    let savedDoc = addRoom(doc, kitchen);
    savedDoc = addItem(savedDoc, createItem('lantern', kitchen.id));
    savedDoc = addItem(savedDoc, createItem('key', kitchen.id));
    await renderAppWithSavedMap(savedDoc);

    await submitCliCommand('get all from Kitchen');

    await waitFor(() => {
      expect(Object.values(useEditorStore.getState().doc?.items ?? {})).toHaveLength(0);
    });

    expectGameOutputToContain('get all from Kitchen', 'Took.');
  });

  it('rolls back script import changes when a later line fails', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI Script Rollback Map');

    const fileInput = document.querySelector('.app-cli-import-input') as HTMLInputElement;
    const scriptFile = new File(
      ['create Kitchen\nconnect Kitchen east to Hallway'],
      'broken-script.txt',
      { type: 'text/plain' },
    );

    await user.upload(fileInput, scriptFile);

    await waitFor(() => {
      expect(Object.values(useEditorStore.getState().doc?.rooms ?? {})).toHaveLength(0);
    });

    expectGameOutputToContain(
      'create Kitchen',
      'connect Kitchen east to Hallway',
      'Unknown room "Hallway".',
      'Import aborted on line 2. Rolled back 1 successful command.',
    );
    await waitFor(() => {
      expect(fileInput).toHaveValue('');
    });
  });

  it('reports when an imported script file has no commands', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI Empty Script Map');

    const fileInput = document.querySelector('.app-cli-import-input') as HTMLInputElement;
    const scriptFile = new File(['\n  \n'], 'empty-script.txt', { type: 'text/plain' });

    await user.upload(fileInput, scriptFile);

    await waitFor(() => {
      expectGameOutputToContain('No commands found in "empty-script.txt".');
    });
    await waitFor(() => {
      expect(fileInput).toHaveValue('');
    });
  });

  it('reports file read failures when importing a script', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI Script Failure Map');

    const fileInput = document.querySelector('.app-cli-import-input') as HTMLInputElement;
    const scriptFile = new File(['ignored'], 'broken-script.txt', { type: 'text/plain' });
    Object.defineProperty(scriptFile, 'text', {
      configurable: true,
      value: jest.fn(async () => {
        throw new Error('Disk read failed.');
      }),
    });

    await user.upload(fileInput, scriptFile);

    await waitFor(() => {
      expectGameOutputToContain('Unable to import "broken-script.txt": Disk read failed.');
      expect(fileInput).toHaveValue('');
    });
  });

  it('executes a connect command from the CLI when the named rooms exist', async () => {
    const user = userEvent.setup();
    const kitchen = { ...createRoom('Kitchen'), position: { x: 40, y: 40 } };
    const hallway = { ...createRoom('Hallway'), position: { x: 240, y: 40 } };
    let doc = createEmptyMap('CLI Connect Parse Map');
    doc = addRoom(addRoom(doc, kitchen), hallway);
    await renderAppWithSavedMap(doc);

    const input = getCliInput();
    await user.type(input, 'connect Kitchen east to Hallway{enter}');

    expectGameOutputToContain(
      'connect Kitchen east to Hallway',
      'Connected.',
    );
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('lists CLI help topics for the help command', async () => {
    const doc = createEmptyMap('CLI Command List Map');
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli command list map/i);

    const input = getCliInput();
    await user.type(input, 'help{enter}');

    expectGameOutputToContain(...getCliHelpOverviewLines());
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('lists room help for help rooms', async () => {
    const doc = createEmptyMap('CLI Room Help Map');
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli room help map/i);

    const input = getCliInput();
    await user.type(input, 'help rooms{enter}');

    expectGameOutputToContain(...getCliHelpTopicLines('rooms'));
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('does not leak room-led suggestions after a completed help topic', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI Help Suggestion Isolation Map');

    const input = getCliInput();

    await openCliSuggestions(user, input);
    await user.type(input, 'help rooms ');

    expect(screen.queryByRole('listbox', { name: /cli suggestions/i })).not.toBeInTheDocument();
  });

  it('rearranges the map for the arrange CLI command', async () => {
    const roomA = { ...createRoom('A'), position: { x: 320, y: 320 } };
    const roomB = { ...createRoom('B'), position: { x: 40, y: 40 } };
    let doc = createEmptyMap('CLI Arrange Map');
    doc = addRoom(addRoom(doc, roomA), roomB);
    doc = addConnection(doc, createConnection(roomA.id, roomB.id, true), 'north', 'south');
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli arrange map/i);

    const input = getCliInput();
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
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli prettify map/i);

    const input = getCliInput();
    await user.type(input, 'prettify{enter}');

    const updatedDoc = useEditorStore.getState().doc!;
    expect(updatedDoc.rooms[roomB.id].position.x).toBe(updatedDoc.rooms[roomA.id].position.x);
    expect(updatedDoc.rooms[roomB.id].position.y).toBeLessThan(updatedDoc.rooms[roomA.id].position.y);
    expectGameOutputToContain('prettify', 'arranged.');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('shows the hidden easter egg output for the fweep command', async () => {
    const doc = createEmptyMap('CLI Fweep Egg Map');
    await openSavedMap(doc);

    renderApp();
    await screen.findByText(/cli fweep egg map/i);

    await submitCliCommand('fweep');

    expectGameOutputToContain(
      'fweep',
      'With keen disappointment, you note that nothing has changed.',
      'Then, you slowly realize that you are black, have two wing-like appendages, and are flying a few feet above the ground.',
      'Thanks to your sonar-like bat senses, you can tell that there are surfaces above you, below you, to the south and to the east.',
    );
  });

  it('creates, selects, and centers a room for the create CLI command', async () => {
    const doc = createEmptyMap('CLI Map');
    await openSavedMap(doc);
    jest.useFakeTimers();

    try {
      renderApp();
      await screen.findByText(/cli map/i);

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

      const input = getCliInput();
      await act(async () => {
        fireEvent.change(input, { target: { value: 'create Kitchen' } });
        fireEvent.submit(input.closest('form') as HTMLFormElement);
        jest.advanceTimersByTime(200);
      });
      await act(async () => {
        jest.advanceTimersByTime(200);
      });

      const state = useEditorStore.getState();
      const rooms = Object.values(state.doc?.rooms ?? {});
      const rootFontSizePx = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
      const visibleMapLeftInset = (rootFontSizePx + (window.innerWidth * 0.02))
        + Math.min(
          Math.min(window.innerWidth * 0.375, rootFontSizePx * 27),
          Math.max(window.innerWidth - (rootFontSizePx + (window.innerWidth * 0.02)) - rootFontSizePx, 0),
        );
      const visibleCenterX = visibleMapLeftInset + (Math.max(300 - visibleMapLeftInset, 0) / 2);

      expect(rooms).toHaveLength(1);
      expect(rooms[0].name).toBe('Kitchen');
      expect(state.selectedRoomIds).toEqual([rooms[0].id]);
      const roomDimensions = getRoomNodeDimensions(rooms[0], 'square-classic');
      expect(state.mapPanOffset.x).toBeCloseTo(
        visibleCenterX - (rooms[0].position.x + (roomDimensions.width / 2)),
      );
      expect(state.mapPanOffset.y).toBeCloseTo(
        (200 / 2) - (rooms[0].position.y + (roomDimensions.height / 2)),
      );
      expectGameOutputToContain('create Kitchen', 'created');
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(input.value.length);
    } finally {
      await act(async () => {
        jest.runOnlyPendingTimers();
      });
      jest.useRealTimers();
    }
  });

  it('centers a created room correctly after zooming out', async () => {
    const doc = createEmptyMap('CLI Zoomed Create Map');
    await openSavedMap(doc);
    jest.useFakeTimers();

    try {
      renderApp();
      await screen.findByText(/cli zoomed create map/i);

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
        fireEvent.wheel(canvas, { ctrlKey: true, deltaY: 100, clientX: 150, clientY: 100 });
        jest.advanceTimersByTime(200);
      });

      const input = getCliInput();
      await act(async () => {
        fireEvent.change(input, { target: { value: 'create Kitchen' } });
        fireEvent.submit(input.closest('form') as HTMLFormElement);
        jest.advanceTimersByTime(200);
      });
      await act(async () => {
        jest.advanceTimersByTime(200);
      });

      const state = useEditorStore.getState();
      const room = Object.values(state.doc?.rooms ?? {})[0];
      const zoom = 1 / 1.1;
      const rootFontSizePx = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
      const visibleMapLeftInset = (rootFontSizePx + (window.innerWidth * 0.02))
        + Math.min(
          Math.min(window.innerWidth * 0.375, rootFontSizePx * 27),
          Math.max(window.innerWidth - (rootFontSizePx + (window.innerWidth * 0.02)) - rootFontSizePx, 0),
        );
      const visibleCenterX = visibleMapLeftInset + (Math.max(300 - visibleMapLeftInset, 0) / 2);

      expect(room).toBeDefined();
      const roomDimensions = getRoomNodeDimensions(room, 'square-classic');
      expect(state.mapPanOffset.x).toBeCloseTo(
        visibleCenterX - ((room.position.x + (roomDimensions.width / 2)) * zoom),
      );
      expect(state.mapPanOffset.y).toBeCloseTo(
        (200 / 2) - ((room.position.y + (roomDimensions.height / 2)) * zoom),
      );
    } finally {
      await act(async () => {
        jest.runOnlyPendingTimers();
      });
      jest.useRealTimers();
    }
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
    await openSavedMap(doc);

    renderApp();
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
      target: { kind: 'room', id: living?.id },
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
    await openSavedMap(doc);

    renderApp();
    await screen.findByText(/cli pronoun preserve map/i);

    await submitCliCommand('show living room');
    await submitCliCommand('connect kitchen e to it');
    await submitCliCommand('edit it');

    expect(await screen.findByRole('dialog', { name: /room editor/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /room name/i })).toHaveValue('Living Room');
  });

  it('treats quoted room references as exact matches instead of partial matches', async () => {
    let doc = createEmptyMap('CLI Exact Quote Map');
    doc = {
      ...doc,
      rooms: {
        path: {
          id: 'path',
          name: 'path',
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
        gate: {
          id: 'gate',
          name: 'path through the iron gate',
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
    await openSavedMap(doc);

    renderApp();
    await screen.findByText(/cli exact quote map/i);

    await submitCliCommand('connect "path through the iron gate" w to "path"');

    const connection = Object.values(useEditorStore.getState().doc?.connections ?? {})[0];
    expect(connection).toMatchObject({
      sourceRoomId: 'gate',
      target: { kind: 'room', id: 'path' },
    });
  });

  it('reports an error when it is unbound', async () => {
    const doc = createEmptyMap('CLI Pronoun Error Map');
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli pronoun error map/i);

    const input = getCliInput();
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
    await openSavedMap(doc);

    const user = userEvent.setup();

    renderApp();
    await screen.findByText(/cli delete map/i);

    const input = getCliInput();
    await user.type(input, 'delete kitchen{enter}');

    const state = useEditorStore.getState();
    expect(Object.values(state.doc?.rooms ?? {})).toHaveLength(0);
    expectGameOutputToContain('delete kitchen', 'deleted');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('reports an unknown room for delete when no matching room exists', async () => {
    const doc = createEmptyMap('CLI Delete Error Map');
    await openSavedMap(doc);

    const user = userEvent.setup();

    renderApp();
    await screen.findByText(/cli delete error map/i);

    const input = getCliInput();
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
    await openSavedMap(doc);

    const user = userEvent.setup();

    renderApp();
    await screen.findByText(/cli duplicate delete map/i);

    const input = getCliInput();
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
    await openSavedMap(doc);

    try {
      renderApp();
      await screen.findByText(/cli edit map/i);

      const input = getCliInput();
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
    await openSavedMap(doc);

    try {
      renderApp();
      await screen.findByText(/cli show map/i);

      const input = getCliInput();
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
      const roomDimensions = getRoomNodeDimensions(doc.rooms['room-1'], 'square-classic');
      expect(useEditorStore.getState().mapPanOffset).toEqual({
        x: visibleCenterX - (1200 + (roomDimensions.width / 2)),
        y: (200 / 2) - (160 + (roomDimensions.height / 2)),
      });
      expectGameOutputToContain('show kitchen', 'Kitchen');
      expect(Array.from(getGameOutputBox().querySelectorAll('strong')).some((node) => node.textContent === 'Kitchen')).toBe(true);
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(input.value.length);
    } finally {
      await act(async () => {
        jest.runOnlyPendingTimers();
      });
      jest.useRealTimers();
    }
  });

  it('navigates with go <direction> using the selected room connection in that exact direction', async () => {
    jest.useFakeTimers();
    const kitchenEastConnection = {
      ...createConnection('kitchen', { kind: 'room', id: 'hallway' }),
      id: 'kitchen-east',
    };
    let doc = createEmptyMap('CLI Direction Go Map');
    doc = {
      ...doc,
      rooms: {
        kitchen: {
          id: 'kitchen',
          name: 'Kitchen',
          description: '',
          position: { x: 1200, y: 160 },
          directions: { east: 'kitchen-east' },
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
          position: { x: 1400, y: 160 },
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
          position: { x: 1400, y: 160 },
          directions: {},
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
      },
      connections: {
        'kitchen-east': kitchenEastConnection,
      },
    };
    await openSavedMap(doc);

    try {
      renderApp();
      await screen.findByText(/cli direction go map/i);

      act(() => {
        useEditorStore.getState().setSelectedRoomIds(['kitchen']);
      });

      const input = getCliInput();
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
        fireEvent.change(input, { target: { value: 'go east' } });
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

      expect(useEditorStore.getState().selectedRoomIds).toEqual(['hallway']);
      const roomDimensions = getRoomNodeDimensions(doc.rooms.hallway, 'square-classic');
      expect(useEditorStore.getState().mapPanOffset).toEqual({
        x: visibleCenterX - (1400 + (roomDimensions.width / 2)),
        y: (200 / 2) - (160 + (roomDimensions.height / 2)),
      });
      expectGameOutputToContain('go east', 'Hallway');
      expect(Array.from(getGameOutputBox().querySelectorAll('strong')).some((node) => node.textContent === 'Hallway')).toBe(true);
    } finally {
      await act(async () => {
        jest.runOnlyPendingTimers();
      });
      jest.useRealTimers();
    }
  });

  it('navigates with a bare direction using only connected exits from the selected room', async () => {
    let doc = createEmptyMap('CLI Direction Bare Map');
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
        pantry: {
          id: 'pantry',
          name: 'Pantry',
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
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli direction bare map/i);

    act(() => {
      useEditorStore.getState().setSelectedRoomIds(['kitchen']);
    });

    const input = getCliInput();
    await user.type(input, 'east{enter}');

    expect(useEditorStore.getState().selectedRoomIds).toEqual(['kitchen']);
    expectGameOutputToContain('east', `You can't go east from Kitchen.`);
    expect(Array.from(getGameOutputBox().querySelectorAll('strong')).some((node) => node.textContent === 'Pantry')).toBe(false);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('reports an unknown room for edit when no matching room exists', async () => {
    const doc = createEmptyMap('CLI Edit Error Map');
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli edit error map/i);

    const input = getCliInput();
    await user.type(input, 'edit kitchen{enter}');

    expectGameOutputToContain('edit kitchen', 'Unknown room "kitchen".');
    expect(screen.queryByRole('dialog', { name: /room editor/i })).not.toBeInTheDocument();
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('reports an unknown room for show when no matching room exists', async () => {
    const doc = createEmptyMap('CLI Show Error Map');
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli show error map/i);

    const input = getCliInput();
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
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli notate map/i);

    const input = getCliInput();
    await user.type(input, 'notate kitchen with this room has nice wallpaper{enter}');

    const state = useEditorStore.getState();
    const stickyNotes = Object.values(state.doc?.stickyNotes ?? {});
    const stickyNoteLinks = Object.values(state.doc?.stickyNoteLinks ?? {});

    expect(stickyNotes).toHaveLength(1);
    expect(stickyNotes[0].text).toBe('this room has nice wallpaper');
    expect(stickyNoteLinks).toHaveLength(1);
    expect(stickyNoteLinks[0]).toMatchObject({
      stickyNoteId: stickyNotes[0].id,
      target: { kind: 'room', id: 'kitchen' },
    });
    expect(state.selectedStickyNoteIds).toEqual([stickyNotes[0].id]);
    expectGameOutputToContain('notate kitchen with this room has nice wallpaper', 'notated.');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('updates room lighting for the dark and lit CLI commands', async () => {
    let doc = createEmptyMap('CLI Lighting Map');
    doc = addRoom(doc, {
      ...createRoom('Kitchen'),
      id: 'kitchen',
      position: { x: 240, y: 160 },
    });
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli lighting map/i);

    const input = getCliInput();
    await user.type(input, 'Kitchen is dark{enter}');
    expect(useEditorStore.getState().doc?.rooms.kitchen?.isDark).toBe(true);
    expectGameOutputToContain('Kitchen is dark', 'marked as dark');

    await user.type(input, 'Kitchen is lit{enter}');
    expect(useEditorStore.getState().doc?.rooms.kitchen?.isDark).toBe(false);
    expectGameOutputToContain('Kitchen is lit', 'marked as lit');
  });

  it('creates a dark room with the adjective create syntax', async () => {
    await renderAppWithOpenMap('CLI Adjective Create Map');

    const user = userEvent.setup();
    const input = getCliInput();
    await user.type(input, 'create Kitchen, which is dark{enter}');

    const createdRoom = Object.values(useEditorStore.getState().doc?.rooms ?? {}).find((room) => room.name === 'Kitchen');
    expect(createdRoom?.isDark).toBe(true);
    expectGameOutputToContain('create Kitchen, which is dark', 'created');
  });

  it('creates and connects a dark room with adjective modifiers', async () => {
    let doc = createEmptyMap('CLI Adjective Connection Map');
    doc = addRoom(doc, {
      ...createRoom('Hallway'),
      id: 'hallway',
      position: { x: 240, y: 160 },
    });
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli adjective connection map/i);

    const input = getCliInput();
    await user.type(input, 'create Kitchen, which is dark, east of Hallway{enter}');

    const stateAfterRelativeCreate = useEditorStore.getState();
    const relativeCreateRoom = Object.values(stateAfterRelativeCreate.doc?.rooms ?? {}).find((room) => room.name === 'Kitchen');
    expect(relativeCreateRoom?.isDark).toBe(true);
    expect(relativeCreateRoom?.directions.west).toBeDefined();

    await user.type(input, 'create and connect Pantry, which is lit, east to Hallway{enter}');

    const stateAfterCreateAndConnect = useEditorStore.getState();
    const createdAndConnectedRoom = Object.values(stateAfterCreateAndConnect.doc?.rooms ?? {}).find((room) => room.name === 'Pantry');
    expect(createdAndConnectedRoom?.isDark).toBe(false);
    expect(createdAndConnectedRoom?.directions.east).toBeDefined();
    expectGameOutputToContain('create Kitchen, which is dark, east of Hallway', 'created and connected');
    expectGameOutputToContain('create and connect Pantry, which is lit, east to Hallway', 'created and connected');
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
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli annotate map/i);

    const input = getCliInput();
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
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli notate prettify map/i);

    const input = getCliInput();
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
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli duplicate edit map/i);

    const input = getCliInput();
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
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli duplicate show map/i);

    const input = getCliInput();
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
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli notate error map/i);

    const input = getCliInput();
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
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli duplicate notate map/i);

    const input = getCliInput();
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
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli connect map/i);

    const input = getCliInput();
    await user.type(input, 'connect kitchen east one-way to hallway{enter}');

    const state = useEditorStore.getState();
    const connections = Object.values(state.doc?.connections ?? {});
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      sourceRoomId: 'kitchen',
      target: { kind: 'room', id: 'hallway' },
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
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli connect two way map/i);

    const input = getCliInput();
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
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli connect replace map/i);

    const input = getCliInput();
    await user.type(input, 'connect kitchen east to hallway{enter}');
    await user.clear(input);
    await user.type(input, 'connect kitchen east to pantry{enter}');

    const state = useEditorStore.getState();
    const connections = Object.values(state.doc?.connections ?? {});
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      sourceRoomId: 'kitchen',
      target: { kind: 'room', id: 'pantry' },
    });
    expect(state.doc?.rooms.kitchen?.directions.east).toBe(connections[0].id);
    expect(state.doc?.rooms.hallway?.directions.west).toBeUndefined();
    expect(state.doc?.rooms.pantry?.directions.west).toBe(connections[0].id);
  });

  it('updates all connections between two rooms for connection annotation CLI commands and can clear them again', async () => {
    const sharedDoor = {
      ...createConnection('bedroom', { kind: 'room', id: 'bathroom' }),
      id: 'bedroom-to-bathroom',
      isBidirectional: true as const,
    };
    const reverseOneWay = {
      ...createConnection('bathroom', { kind: 'room', id: 'bedroom' }),
      id: 'bathroom-to-bedroom',
      isBidirectional: false as const,
    };
    let doc = createEmptyMap('CLI Connection Annotation Map');
    doc = {
      ...doc,
      rooms: {
        bedroom: {
          id: 'bedroom',
          name: 'Bedroom',
          description: '',
          position: { x: 120, y: 160 },
          directions: { east: sharedDoor.id, south: reverseOneWay.id },
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
        bathroom: {
          id: 'bathroom',
          name: 'Bathroom',
          description: '',
          position: { x: 240, y: 160 },
          directions: { west: sharedDoor.id },
          isDark: false,
          locked: false,
          shape: 'rectangle' as const,
          fillColorIndex: 0,
          strokeColorIndex: 0,
          strokeStyle: 'solid' as const,
        },
      },
      connections: {
        [sharedDoor.id]: sharedDoor,
        [reverseOneWay.id]: reverseOneWay,
      },
    };
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli connection annotation map/i);

    const input = getCliInput();
    await user.type(input, 'bedroom to bathroom is a locked door{enter}');

    let state = useEditorStore.getState();
    expect(state.doc?.connections[sharedDoor.id]?.annotation).toEqual({ kind: 'locked door' });
    expect(state.doc?.connections[reverseOneWay.id]?.annotation).toEqual({ kind: 'locked door' });
    expectGameOutputToContain('bedroom to bathroom is a locked door', 'Marked.');

    await user.clear(input);
    await user.type(input, 'bedroom to bathroom is clear{enter}');

    state = useEditorStore.getState();
    expect(state.doc?.connections[sharedDoor.id]?.annotation).toBeNull();
    expect(state.doc?.connections[reverseOneWay.id]?.annotation).toBeNull();
    expectGameOutputToContain('bedroom to bathroom is clear', 'Cleared.');
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
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli connect error map/i);

    const input = getCliInput();
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
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli connect ambiguous map/i);

    const input = getCliInput();
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
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli self connect map/i);

    const input = getCliInput();
    await user.type(input, 'connect kitchen east to kitchen west{enter}');

    const state = useEditorStore.getState();
    const connections = Object.values(state.doc?.connections ?? {});
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      sourceRoomId: 'kitchen',
      target: { kind: 'room', id: 'kitchen' },
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
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli connect prettify map/i);

    const input = getCliInput();
    await user.type(input, 'connect kitchen east to hallway{enter}');

    expect(useEditorStore.getState().doc?.rooms.pantry?.position).toEqual({ x: 480, y: 320 });
  });

  it('creates an unknown pseudo-room exit from the CLI', async () => {
    let doc = createEmptyMap('CLI Unknown Exit Map');
    doc = {
      ...doc,
      rooms: {
        bedroom: {
          id: 'bedroom',
          name: 'Bedroom',
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
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli unknown exit map/i);

    const input = getCliInput();
    await user.type(input, 'west of bedroom is unknown{enter}');

    const state = useEditorStore.getState();
    const pseudoRooms = Object.values(state.doc?.pseudoRooms ?? {});
    const connections = Object.values(state.doc?.connections ?? {});

    expect(pseudoRooms).toHaveLength(1);
    expect(pseudoRooms[0]).toMatchObject({ kind: 'unknown' });
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      sourceRoomId: 'bedroom',
      target: { kind: 'pseudo-room', id: pseudoRooms[0]?.id },
      isBidirectional: false,
    });
    expect(state.doc?.rooms.bedroom?.directions.west).toBe(connections[0].id);
    expect(state.selectedConnectionIds).toEqual([connections[0].id]);
    expectGameOutputToContain('west of bedroom is unknown', 'marked exit as unknown');
  });

  it('creates vertical pseudo-room exits from the CLI shorthand', async () => {
    let doc = createEmptyMap('CLI Vertical Unknown Exit Map');
    doc = {
      ...doc,
      rooms: {
        bedroom: {
          id: 'bedroom',
          name: 'Bedroom',
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
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli vertical unknown exit map/i);

    const input = getCliInput();
    await user.type(input, 'Above Bedroom is unknown{enter}');

    const state = useEditorStore.getState();
    const pseudoRooms = Object.values(state.doc?.pseudoRooms ?? {});
    const connections = Object.values(state.doc?.connections ?? {});

    expect(pseudoRooms).toHaveLength(1);
    expect(pseudoRooms[0]).toMatchObject({ kind: 'unknown' });
    expect(connections).toHaveLength(1);
    expect(state.doc?.rooms.bedroom?.directions.up).toBe(connections[0].id);
    expectGameOutputToContain('Above Bedroom is unknown', 'marked exit as unknown');
  });

  it('replaces an unknown pseudo-room exit with an infinite one in place', async () => {
    const bedroom = {
      id: 'bedroom',
      name: 'Bedroom',
      description: '',
      position: { x: 240, y: 160 },
      directions: {},
      isDark: false,
      locked: false,
      shape: 'rectangle' as const,
      fillColorIndex: 0,
      strokeColorIndex: 0,
      strokeStyle: 'solid' as const,
    };
    const unknown = { ...createPseudoRoom('unknown'), id: 'unknown-exit', position: { x: 80, y: 160 } };
    const placeholderConnection = { ...createConnection(bedroom.id, { kind: 'pseudo-room', id: unknown.id }, false), id: 'placeholder-conn' };
    let doc = addRoom(createEmptyMap('CLI Replace Pseudo Map'), bedroom);
    doc = addPseudoRoom(doc, unknown);
    doc = addConnection(doc, placeholderConnection, 'west');
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli replace pseudo map/i);

    const input = getCliInput();
    await user.type(input, 'west of bedroom goes on forever{enter}');

    const state = useEditorStore.getState();
    expect(state.doc?.pseudoRooms['unknown-exit']).toMatchObject({ kind: 'infinite' });
    expect(state.doc?.connections['placeholder-conn']).toMatchObject({
      sourceRoomId: 'bedroom',
      target: { kind: 'pseudo-room', id: 'unknown-exit' },
      isBidirectional: false,
    });
    expect(Object.keys(state.doc?.pseudoRooms ?? {})).toEqual(['unknown-exit']);
    expect(Object.keys(state.doc?.connections ?? {})).toEqual(['placeholder-conn']);
    expectGameOutputToContain('west of bedroom goes on forever', 'marked exit as going on forever');
  });

  it('replaces a vertical pseudo-room exit with an infinite one in place', async () => {
    const bedroom = {
      id: 'bedroom',
      name: 'Bedroom',
      description: '',
      position: { x: 240, y: 160 },
      directions: {},
      isDark: false,
      locked: false,
      shape: 'rectangle' as const,
      fillColorIndex: 0,
      strokeColorIndex: 0,
      strokeStyle: 'solid' as const,
    };
    const unknown = { ...createPseudoRoom('unknown'), id: 'unknown-exit', position: { x: 240, y: 320 } };
    const placeholderConnection = { ...createConnection(bedroom.id, { kind: 'pseudo-room', id: unknown.id }, false), id: 'placeholder-conn' };
    let doc = addRoom(createEmptyMap('CLI Replace Vertical Pseudo Map'), bedroom);
    doc = addPseudoRoom(doc, unknown);
    doc = addConnection(doc, placeholderConnection, 'down');
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli replace vertical pseudo map/i);

    const input = getCliInput();
    await user.type(input, 'Below Bedroom goes on forever{enter}');

    const state = useEditorStore.getState();
    expect(state.doc?.pseudoRooms['unknown-exit']).toMatchObject({ kind: 'infinite' });
    expect(state.doc?.connections['placeholder-conn']).toMatchObject({
      sourceRoomId: 'bedroom',
      target: { kind: 'pseudo-room', id: 'unknown-exit' },
      isBidirectional: false,
    });
    expect(state.doc?.rooms.bedroom?.directions.down).toBe('placeholder-conn');
    expectGameOutputToContain('Below Bedroom goes on forever', 'marked exit as going on forever');
  });

  it('creates a death pseudo-room from a natural-language CLI phrase', async () => {
    const castle = {
      id: 'castle',
      name: 'Castle',
      description: '',
      position: { x: 240, y: 160 },
      directions: {},
      isDark: false,
      locked: false,
      shape: 'rectangle' as const,
      fillColorIndex: 0,
      strokeColorIndex: 0,
      strokeStyle: 'solid' as const,
    };
    let doc = createEmptyMap('CLI Death Exit Map');
    doc = addRoom(doc, castle);
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli death exit map/i);

    const input = getCliInput();
    await user.type(input, 'west of castle lies death{enter}');

    const state = useEditorStore.getState();
    const pseudoRooms = Object.values(state.doc?.pseudoRooms ?? {});
    const connections = Object.values(state.doc?.connections ?? {});

    expect(pseudoRooms).toHaveLength(1);
    expect(pseudoRooms[0]).toMatchObject({ kind: 'death' });
    expect(connections).toHaveLength(1);
    expect(state.doc?.rooms.castle?.directions.west).toBe(connections[0].id);
    expectGameOutputToContain('west of castle lies death', 'marked exit as death');
  });

  it('creates a nowhere pseudo-room from a natural-language CLI phrase', async () => {
    const castle = {
      id: 'castle',
      name: 'Castle',
      description: '',
      position: { x: 240, y: 160 },
      directions: {},
      isDark: false,
      locked: false,
      shape: 'rectangle' as const,
      fillColorIndex: 0,
      strokeColorIndex: 0,
      strokeStyle: 'solid' as const,
    };
    let doc = createEmptyMap('CLI Nowhere Exit Map');
    doc = addRoom(doc, castle);
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli nowhere exit map/i);

    const input = getCliInput();
    await user.type(input, 'west of castle leads nowhere{enter}');

    const state = useEditorStore.getState();
    const pseudoRooms = Object.values(state.doc?.pseudoRooms ?? {});
    const connections = Object.values(state.doc?.connections ?? {});

    expect(pseudoRooms).toHaveLength(1);
    expect(pseudoRooms[0]).toMatchObject({ kind: 'nowhere' });
    expect(connections).toHaveLength(1);
    expect(state.doc?.rooms.castle?.directions.west).toBe(connections[0].id);
    expectGameOutputToContain('west of castle leads nowhere', 'marked exit as leading nowhere');
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
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli create connect map/i);

    const input = getCliInput();
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
      target: { kind: 'room', id: 'hallway' },
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

  it('centers create-and-connect results correctly after zooming out', async () => {
    let doc = createEmptyMap('CLI Zoomed Create Connect Map');
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
    await openSavedMap(doc);
    jest.useFakeTimers();

    try {
      renderApp();
      await screen.findByText(/cli zoomed create connect map/i);

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
        fireEvent.wheel(canvas, { ctrlKey: true, deltaY: 100, clientX: 150, clientY: 100 });
        jest.advanceTimersByTime(200);
      });

      const input = getCliInput();
      await act(async () => {
        fireEvent.change(input, { target: { value: 'create and connect Kitchen east to Hallway' } });
        fireEvent.submit(input.closest('form') as HTMLFormElement);
        jest.advanceTimersByTime(200);
      });
      await act(async () => {
        jest.advanceTimersByTime(200);
      });

      const state = useEditorStore.getState();
      const createdRoom = Object.values(state.doc?.rooms ?? {}).find((room) => room.name === 'Kitchen');
      const hallway = state.doc?.rooms.hallway;
      const zoom = 1 / 1.1;
      const rootFontSizePx = Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
      const visibleMapLeftInset = (rootFontSizePx + (window.innerWidth * 0.02))
        + Math.min(
          Math.min(window.innerWidth * 0.375, rootFontSizePx * 27),
          Math.max(window.innerWidth - (rootFontSizePx + (window.innerWidth * 0.02)) - rootFontSizePx, 0),
        );
      const visibleCenterX = visibleMapLeftInset + (Math.max(300 - visibleMapLeftInset, 0) / 2);

      expect(createdRoom).toBeDefined();
      expect(hallway).toBeDefined();

      const left = Math.min(createdRoom!.position.x, hallway!.position.x);
      const createdRoomDimensions = getRoomNodeDimensions(createdRoom!, 'square-classic');
      const hallwayDimensions = getRoomNodeDimensions(hallway!, 'square-classic');
      const right = Math.max(
        createdRoom!.position.x + createdRoomDimensions.width,
        hallway!.position.x + hallwayDimensions.width,
      );
      const top = Math.min(createdRoom!.position.y, hallway!.position.y);
      const bottom = Math.max(createdRoom!.position.y + createdRoomDimensions.height, hallway!.position.y + hallwayDimensions.height);

      expect(state.mapPanOffset.x).toBeCloseTo(visibleCenterX - (((left + right) / 2) * zoom));
      expect(state.mapPanOffset.y).toBeCloseTo((200 / 2) - (((top + bottom) / 2) * zoom));
    } finally {
      await act(async () => {
        jest.runOnlyPendingTimers();
      });
      jest.useRealTimers();
    }
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
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli relative create connect map/i);

    const input = getCliInput();
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

  it('converts a pseudo-room placeholder into a normal room for relative create commands', async () => {
    const bedroom = {
      id: 'bedroom',
      name: 'Bedroom',
      description: '',
      position: { x: 240, y: 160 },
      directions: {},
      isDark: false,
      locked: false,
      shape: 'rectangle' as const,
      fillColorIndex: 0,
      strokeColorIndex: 0,
      strokeStyle: 'solid' as const,
    };
    const unknown = { ...createPseudoRoom('unknown'), id: 'unknown-exit', position: { x: 80, y: 160 } };
    const placeholderConnection = { ...createConnection(bedroom.id, { kind: 'pseudo-room', id: unknown.id }, false), id: 'placeholder-conn' };
    let doc = addRoom(createEmptyMap('CLI Convert Placeholder Map'), bedroom);
    doc = addPseudoRoom(doc, unknown);
    doc = addConnection(doc, placeholderConnection, 'west');
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli convert placeholder map/i);

    const input = getCliInput();
    await user.type(input, 'create Pantry west of Bedroom{enter}');

    const state = useEditorStore.getState();
    expect(state.doc?.pseudoRooms['unknown-exit']).toBeUndefined();
    expect(state.doc?.rooms['unknown-exit']).toMatchObject({ name: 'Pantry' });
    expect(state.doc?.connections['placeholder-conn']).toMatchObject({
      sourceRoomId: 'bedroom',
      target: { kind: 'room', id: 'unknown-exit' },
      isBidirectional: true,
    });
    expect(state.doc?.rooms.bedroom?.directions.west).toBe('placeholder-conn');
    expect(state.doc?.rooms['unknown-exit']?.directions.east).toBe('placeholder-conn');
    expect(state.selectedRoomIds).toEqual(['unknown-exit', 'bedroom']);
    expect(state.selectedConnectionIds).toEqual(['placeholder-conn']);
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
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli relative above below map/i);

    const input = getCliInput();
    await user.type(input, 'create Kitchen above Hallway{enter}');

    const state = useEditorStore.getState();
    const rooms = Object.values(state.doc?.rooms ?? {});
    const createdRoom = rooms.find((room) => room.name === 'Kitchen');
    const connections = Object.values(state.doc?.connections ?? {});

    expect(createdRoom).toBeDefined();
    expect(connections).toHaveLength(1);
    expect(connections[0]).toMatchObject({
      sourceRoomId: createdRoom?.id,
      target: { kind: 'room', id: 'hallway' },
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
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli create connect prettify map/i);

    const input = getCliInput();
    await user.type(input, 'create and connect Kitchen east to Hallway{enter}');

    const state = useEditorStore.getState();
    expect(state.doc?.rooms.hallway?.position).toEqual({ x: 520, y: 280 });
    expect(state.doc?.rooms.pantry?.position).toEqual({ x: 760, y: 440 });
  });

  it('reports an unknown room for create and connect when the target room does not exist', async () => {
    const doc = createEmptyMap('CLI Create Connect Error Map');
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli create connect error map/i);

    const input = getCliInput();
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
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli undo map/i);

    const input = getCliInput();
    await user.type(input, 'create Kitchen{enter}');
    expect(Object.values(useEditorStore.getState().doc?.rooms ?? {})).toHaveLength(1);

    fireEvent.change(input, { target: { value: 'undo' } });
    fireEvent.submit(input.closest('form') as HTMLFormElement);
    expect(Object.values(useEditorStore.getState().doc?.rooms ?? {})).toHaveLength(0);
    expectGameOutputToContain('create Kitchen', 'created', 'undo', 'undone');
  });

  it('redoes the previous undone command for the redo CLI command', async () => {
    const doc = createEmptyMap('CLI Redo Map');
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli redo map/i);

    const input = getCliInput();
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
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli empty undo map/i);

    const input = getCliInput();
    await user.type(input, 'undo{enter}');

    expectGameOutputToContain('undo', 'Nothing to undo.');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('reports when there is nothing to redo for the redo CLI command', async () => {
    const doc = createEmptyMap('CLI Empty Redo Map');
    await openSavedMap(doc);

    const user = userEvent.setup();
    renderApp();
    await screen.findByText(/cli empty redo map/i);

    const input = getCliInput();
    await user.type(input, 'redo{enter}');

    expectGameOutputToContain('redo', 'Nothing to redo.');
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it('logs a syntax error for an invalid CLI command', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('CLI Syntax Error Map');

    const input = getCliInput();
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

  it('retains the full game output history', async () => {
    await renderAppWithOpenMap('CLI Output History Map');

    const input = getCliInput();
    const form = input.closest('form') as HTMLFormElement;

    for (let index = 1; index <= 7; index += 1) {
      fireEvent.change(input, { target: { value: `blorb room ${index}` } });
      fireEvent.submit(form);
    }

    const outputLines = (getGameOutputBox().textContent ?? '').split('\n');
    expect(outputLines).toHaveLength(DEFAULT_CLI_OUTPUT_LINES.length + 21);
    expect(outputLines.slice(0, DEFAULT_CLI_OUTPUT_LINES.length)).toEqual(
      DEFAULT_CLI_OUTPUT_LINES.map(getRenderedCliLine),
    );
    expect(outputLines[4]).toBe('>blorb room 1');
    expect(outputLines[5]).toContain("I didn't understand you.");
    expect(outputLines[6]).toBe('');
    expect(outputLines[22]).toBe('>blorb room 7');
    expect(outputLines[23]).toContain("I didn't understand you.");
    expect(outputLines[24]).toBe('');
  });

  it('opens and closes the help dialog', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('Help Dialog Map');

    await user.click(screen.getByRole('button', { name: /help/i }));
    expect(screen.getByRole('dialog', { name: /help/i })).toBeInTheDocument();
    expect(screen.getByText(/fweep help/i)).toBeInTheDocument();
    expect(screen.getByText(/navigating the map/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /close help/i }));
    expect(screen.queryByRole('dialog', { name: /help/i })).not.toBeInTheDocument();
  });

  it('closes the help dialog from the backdrop and Escape key, and renders subheadings and rules', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('Help Escape Map');

    await user.click(screen.getByRole('button', { name: /help/i }));
    expect(screen.getByRole('heading', { name: /creating, editing and deleting rooms/i })).toBeInTheDocument();

    await user.click(document.querySelector('.help-backdrop') as HTMLElement);
    expect(screen.queryByRole('dialog', { name: /help/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /help/i }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: /help/i })).not.toBeInTheDocument();
  });

  it('shows the map selection dialog at the root URL', async () => {
    navigateTo('#/');
    renderApp();
    expect(await screen.findByRole('dialog', { name: /choose a map/i })).toBeInTheDocument();
  });

  it('loads and displays a saved map when URL is #/map/<id>', async () => {
    const doc = createEmptyMap('Routed Map');
    await openSavedMap(doc);
    renderApp();

    expect(await screen.findByText(/routed map/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /prettify layout/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /undo/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /redo/i })).toBeInTheDocument();
    // Should NOT show the selection dialog
    expect(screen.queryByRole('dialog', { name: /choose a map/i })).not.toBeInTheDocument();
  });

  it('restores the saved CLI output log when the map is reloaded', async () => {
    const user = userEvent.setup();
    const doc = createEmptyMap('Persisted Output Map');
    await openSavedMap(doc);
    const firstRender = renderApp();
    await screen.findByText(/persisted output map/i);

    const input = getCliInput();
    await user.type(input, 'help{enter}');

    await waitFor(() => loadMap(doc.metadata.id).then((persisted) => {
      expect(persisted?.cliOutputLines).toEqual(expect.arrayContaining([
        ...DEFAULT_CLI_OUTPUT_LINES,
        '>help',
        ...getCliHelpOverviewLines(),
      ]));
      expect(persisted?.cliOutputLines).toContain('help rooms');
    }));

    firstRender.unmount();
    renderApp();

    await screen.findByText(/persisted output map/i);
    expect(getGameOutputBox().textContent ?? '').toContain('>help');
    expect(getGameOutputBox().textContent ?? '').toContain('help rooms');
  });

  it('persists the default CLI banner when an existing map has an empty output log', async () => {
    const doc = {
      ...createEmptyMap('Empty Output Banner Map'),
      cliOutputLines: [],
    };
    await openSavedMap(doc);
    renderApp();

    await screen.findByText(/empty output banner map/i);
    expect(getGameOutputBox().textContent ?? '').toContain(getRenderedCliLine(DEFAULT_CLI_OUTPUT_LINES[0]));
    expect(getGameOutputBox().textContent ?? '').toContain(DEFAULT_CLI_OUTPUT_LINES[1]);

    await waitFor(() => loadMap(doc.metadata.id).then((persisted) => {
      expect(persisted?.cliOutputLines).toEqual([...DEFAULT_CLI_OUTPUT_LINES]);
    }));
  });

  it('does not reopen a stale edit request after returning to the map list and reopening the map', async () => {
    const user = userEvent.setup();
    const doc = createEmptyMap('Stale Edit Request Map');
    await openSavedMap(doc);
    renderApp();
    await screen.findByText(/stale edit request map/i);

    const input = getCliInput();
    await user.type(input, 'create room{enter}');
    await user.type(input, 'edit room{enter}');

    await user.click(screen.getByRole('button', { name: /back to maps/i }));
    await screen.findByRole('dialog', { name: /choose a map/i });

    await user.click(screen.getByText('Stale Edit Request Map').closest('button') as HTMLButtonElement);
    await screen.findByText(/stale edit request map/i);

    expect(screen.queryByRole('dialog', { name: /room editor/i })).not.toBeInTheDocument();
  });

  it('opens the room editor after creating a room and then editing it from the CLI', async () => {
    jest.useFakeTimers();
    const doc = createEmptyMap('Create Then Edit Map');
    await openSavedMap(doc);

    try {
      renderApp();
      await screen.findByText(/create then edit map/i);

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

      const input = getCliInput();
      await act(async () => {
        fireEvent.change(input, { target: { value: 'create room' } });
        fireEvent.submit(input.closest('form') as HTMLFormElement);
        jest.advanceTimersByTime(200);
      });
      await act(async () => {
        fireEvent.change(input, { target: { value: 'edit room' } });
        fireEvent.submit(input.closest('form') as HTMLFormElement);
        jest.advanceTimersByTime(500);
      });

      expect(await screen.findByRole('dialog', { name: /room editor/i })).toBeInTheDocument();
      expect(screen.getByRole('textbox', { name: /room name/i })).toHaveValue('room');
      expectGameOutputToContain('create room', 'created', 'edit room', 'edited');
    } finally {
      await act(async () => {
        jest.runOnlyPendingTimers();
      });
      jest.useRealTimers();
    }
  });

  it('returns to the selection screen from the map header back button', async () => {
    const doc = createEmptyMap('Return Map');
    await openSavedMap(doc);
    const user = userEvent.setup();
    renderApp();

    await screen.findByText(/return map/i);
    await user.click(screen.getByRole('button', { name: /back to maps/i }));

    await waitFor(() => {
      expect(window.location.hash).toBe('#/');
    });
    expect(await screen.findByRole('dialog', { name: /choose a map/i })).toBeInTheDocument();
  });

  it('autosaves after undoing back to the originally loaded state', async () => {
    const originalDoc = createEmptyMap('Undo Save Map');
    await openSavedMap(originalDoc);
    renderApp();

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

  it('persists a room added immediately before the app unmounts', async () => {
    const doc = createEmptyMap('Immediate Refresh Map');
    await openSavedMap(doc);
    const rendered = renderApp();

    await screen.findByText(/immediate refresh map/i);

    act(() => {
      useEditorStore.getState().addRoomAtPosition('Kitchen', { x: 0, y: 0 });
    });

    rendered.unmount();

    await waitFor(() => loadMap(doc.metadata.id).then((persisted) => {
      expect(Object.values(persisted?.rooms ?? {}).map((room) => room.name)).toContain('Kitchen');
    }));
  });

  it('updates the URL when a map is selected from the dialog', async () => {
    const doc = createEmptyMap('Clickable Map');
    await saveMap(doc);

    navigateTo('#/');
    const user = userEvent.setup();
    renderApp();

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
    renderApp();

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
    renderApp();

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
    renderApp();

    expect(await screen.findByRole('dialog', { name: /choose a map/i })).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'This map could not be opened because its saved data is invalid or incompatible.',
    );
  });
});
