import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { addRoom } from '../../src/domain/map-operations';
import { createEmptyMap, createRoom } from '../../src/domain/map-types';
import type { MapDocument } from '../../src/domain/map-types';
import { loadMap, saveMap } from '../../src/storage/map-store';
import { App } from '../../src/app';
import { useEditorStore } from '../../src/state/editor-store';
import { cacheMapViewSession, loadCachedMapViewSession } from '../../src/state/map-view-session-cache';

const BEZIER_TOGGLE_ICON_PATH = 'M296 200L296 152L344 152L344 200L296 200zM288 96C261.5 96 240 117.5 240 144L240 148L121.6 148C111.2 126.7 89.3 112 64 112C28.7 112 0 140.7 0 176C0 211.3 28.7 240 64 240C89.3 240 111.2 225.3 121.6 204L188.5 204C129.6 243.6 89.6 309 84.5 384L80 384C53.5 384 32 405.5 32 432L32 496C32 522.5 53.5 544 80 544L144 544C170.5 544 192 522.5 192 496L192 432C192 405.5 170.5 384 144 384L140.7 384C146.6 317 189.2 260.6 248.2 234.9C256.8 247.6 271.4 256 288 256L352 256C368.6 256 383.1 247.6 391.8 234.9C450.8 260.6 493.4 317 499.3 384L496 384C469.5 384 448 405.5 448 432L448 496C448 522.5 469.5 544 496 544L560 544C586.5 544 608 522.5 608 496L608 432C608 405.5 586.5 384 560 384L555.5 384C550.5 309 510.4 243.6 451.5 204L518.4 204C528.8 225.3 550.7 240 576 240C611.3 240 640 211.3 640 176C640 140.7 611.3 112 576 112C550.7 112 528.8 126.7 518.4 148L400 148L400 144C400 117.5 378.5 96 352 96L288 96zM88 440L136 440L136 488L88 488L88 440zM504 488L504 440L552 440L552 488L504 488z';
const STRAIGHT_TOGGLE_ICON_PATH = 'M128 160C128 142.3 142.3 128 160 128L320 128C337.7 128 352 142.3 352 160L352 448L448 448L448 320C448 302.3 462.3 288 480 288L544 288C561.7 288 576 302.3 576 320C576 337.7 561.7 352 544 352L512 352L512 480C512 497.7 497.7 512 480 512L320 512C302.3 512 288 497.7 288 480L288 192L192 192L192 320C192 337.7 177.7 352 160 352L96 352C78.3 352 64 337.7 64 320C64 302.3 78.3 288 96 288L128 288L128 160z';

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

function renderApp(): ReturnType<typeof render> {
  return render(<App />);
}

async function flushAppEffects(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

async function loadParchmentIframe(iframe: HTMLIFrameElement): Promise<void> {
  await act(async () => {
    fireEvent.load(iframe);
    await Promise.resolve();
  });
}

async function openSavedMap(doc: MapDocument): Promise<void> {
  await saveMap(doc);
  navigateTo(`#/map/${doc.metadata.id}`);
}

async function renderAppWithSavedMap(doc: MapDocument): Promise<void> {
  window.localStorage.setItem('fweep-startup-tips-enabled', 'false');
  await openSavedMap(doc);
  renderApp();
  await screen.findByLabelText(`Map name: ${doc.metadata.name}`);
  await flushAppEffects();
}

async function renderAppWithOpenMap(mapName = 'Opened Map') {
  const doc = createEmptyMap(mapName);
  await renderAppWithSavedMap(doc);
  return doc;
}

beforeEach(() => {
  jest.restoreAllMocks();
  // Reset URL to the selection screen before each test
  window.history.replaceState({}, '', '#/');
  setViewportWidth(1024);
  window.localStorage.removeItem('fweep-welcome-dialog-seen');
  window.localStorage.setItem('fweep-startup-tips-enabled', 'false');
  window.localStorage.removeItem('fweep-startup-tip-index');
  window.localStorage.removeItem('fweep-parchment-panel-width');
  window.localStorage.removeItem('fweep-parchment-panel-height');
  (globalThis as { __FWEEP_TEST_DEV__?: boolean }).__FWEEP_TEST_DEV__ = false;
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

  it('keeps the fweep wordmark clear of the parchment panel even when the minimap can hug the right edge', async () => {
    window.localStorage.setItem('fweep-parchment-panel-width', '420');
    window.localStorage.setItem('fweep-parchment-panel-height', '240');

    await renderAppWithOpenMap();

    expect(screen.getByRole('heading', { name: 'fweep' })).toHaveStyle({ right: '16px' });
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

  it('shows only the chooser/search panel when no game is active', async () => {
    await renderAppWithOpenMap('IFDB Panel Map');

    expect(screen.getByRole('separator', { name: /resize game panel width/i })).toBeInTheDocument();
    expect(screen.getByRole('separator', { name: /resize game panel height/i })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: /search IFDB for a game/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^search$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /play a story file from your device/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /or play the fweep intro game/i })).toBeInTheDocument();
    expect(screen.queryByTitle(/interactive fiction player/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /choose game/i })).not.toBeInTheDocument();
  });

  it('keeps the chooser tip visible while typing until search results appear', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('IFDB Tip Visibility Map');

    const searchInput = screen.getByRole('textbox', { name: /search IFDB for a game/i });

    expect(screen.getByRole('button', { name: /or play the fweep intro game/i })).toBeInTheDocument();

    await user.type(searchInput, 'exam');

    expect(screen.getByRole('button', { name: /or play the fweep intro game/i })).toBeInTheDocument();
  });

  it('shows the associated game title beneath the map name chip when a game is linked', async () => {
    const doc = createEmptyMap('Linked Map');
    const linkedDoc: MapDocument = {
      ...doc,
      metadata: {
        ...doc.metadata,
        associatedGame: {
          sourceType: 'ifdb',
          tuid: 'abc123',
          ifid: 'IFID-123',
          title: 'The Example Game',
          author: 'Pat Example',
          storyUrl: 'https://example.com/game.ulx',
          format: 'glulx',
        },
      },
    };

    await renderAppWithSavedMap(linkedDoc);

    expect(screen.getByText('The Example Game')).toHaveClass('app-map-name-chip__game-title');
  });

  it('shows a reconnect prompt when the map is linked to a local story file', async () => {
    const doc = createEmptyMap('Reconnect Map');
    const linkedDoc: MapDocument = {
      ...doc,
      metadata: {
        ...doc.metadata,
        associatedGame: {
          sourceType: 'local-file',
          tuid: null,
          ifid: null,
          title: 'Galaxy Jones.gblorb',
          author: null,
          storyUrl: null,
          format: 'glulx',
        },
      },
    };

    await renderAppWithSavedMap(linkedDoc);

    expect(screen.getByRole('button', { name: /reconnect galaxy jones\.gblorb/i })).toBeInTheDocument();
  });

  it('searches IFDB on manual submit and renders matching results', async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        games: [
          {
            tuid: 'abc123',
            title: 'The Example Game',
            author: 'Pat Example',
            link: 'https://ifdb.org/viewgame?id=abc123',
            coverArtLink: 'https://ifdb.org/coverart?id=abc123&version=4',
            published: {
              machine: '2024-10-15',
              printable: 'October 15, 2024',
            },
            averageRating: 4.25,
          },
        ],
      }),
    } as Response);
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    await renderAppWithOpenMap('IFDB Search Map');

    await user.type(screen.getByRole('textbox', { name: /search IFDB for a game/i }), 'example game');
    await user.click(screen.getByRole('button', { name: /^search$/i }));

    expect(await screen.findByText('The Example Game')).toBeInTheDocument();
    expect(screen.getByText(/Pat Example/)).toBeInTheDocument();
    expect(screen.getByText(/October 15, 2024/)).toBeInTheDocument();
    const coverArt = screen.getByRole('img', { name: /cover art for the example game/i });
    expect(coverArt).toHaveAttribute(
      'src',
      'https://ifdb.org/coverart?id=abc123&version=4',
    );
    expect(coverArt).toHaveClass('app-parchment-panel__result-cover');
    const ifdbLink = screen.getByRole('link', { name: /view the example game on IFDB/i });
    expect(ifdbLink).toHaveAttribute('href', 'https://ifdb.org/viewgame?id=abc123');
  });

  it('clears IFDB results when the search is submitted with only whitespace', async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        games: [
          {
            tuid: 'abc123',
            title: 'The Example Game',
          },
        ],
      }),
    } as Response);
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    await renderAppWithOpenMap('IFDB Blank Search Map');

    const searchInput = screen.getByRole('textbox', { name: /search IFDB for a game/i });
    await user.type(searchInput, 'example game');
    await user.click(screen.getByRole('button', { name: /^search$/i }));
    expect(await screen.findByText('The Example Game')).toBeInTheDocument();

    await user.clear(searchInput);
    await user.type(searchInput, '   ');
    await user.click(screen.getByRole('button', { name: /^search$/i }));

    expect(screen.queryByText('The Example Game')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('shows IFDB search failures from manual submit', async () => {
    const user = userEvent.setup();
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: jest.fn<typeof fetch>().mockRejectedValue(new Error('Network down')),
    });

    await renderAppWithOpenMap('IFDB Search Error Map');

    await user.type(screen.getByRole('textbox', { name: /search IFDB for a game/i }), 'example game');
    await user.click(screen.getByRole('button', { name: /^search$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Network down');
    expect(screen.queryByText('The Example Game')).not.toBeInTheDocument();
  });

  it('clears the chooser search state when leaving one map and opening another', async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn<typeof fetch>().mockResolvedValue({
      ok: true,
      json: async () => ({
        games: [
          {
            tuid: 'abc123',
            title: 'The Example Game',
          },
        ],
      }),
    } as Response);
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    const firstMap = createEmptyMap('First Search Map');
    const secondMap = createEmptyMap('Second Search Map');
    await saveMap(firstMap);
    await saveMap(secondMap);

    navigateTo(`#/map/${firstMap.metadata.id}`);
    renderApp();
    await screen.findByLabelText(`Map name: ${firstMap.metadata.name}`);

    const firstSearchInput = screen.getByRole('textbox', { name: /search IFDB for a game/i });
    await user.type(firstSearchInput, 'example game');
    await user.click(screen.getByRole('button', { name: /^search$/i }));
    expect(await screen.findByText('The Example Game')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /back to maps/i }));
    await screen.findByRole('dialog', { name: /choose a map/i });

    const secondMapLabel = await screen.findByText('Second Search Map');
    await user.click(secondMapLabel.closest('button') as HTMLButtonElement);
    await screen.findByLabelText(`Map name: ${secondMap.metadata.name}`);

    const secondSearchInput = screen.getByRole('textbox', { name: /search IFDB for a game/i }) as HTMLInputElement;
    expect(secondSearchInput).toHaveValue('');
    expect(screen.queryByText('The Example Game')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('loads the selected IFDB game into Parchment and persists the association on the map', async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          games: [
            {
              tuid: 'abc123',
              title: 'The Example Game',
              author: 'Pat Example',
              published: {
                machine: '2024-10-15',
                printable: 'October 15, 2024',
              },
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          identification: {
            ifids: ['IFID-123'],
          },
          bibliographic: {
            title: 'The Example Game',
            author: 'Pat Example',
          },
          ifdb: {
            tuid: 'abc123',
            downloads: {
              links: [
                {
                  title: 'Playable Glulx release',
                  url: 'https://example.com/game.ulx',
                  format: 'glulx',
                  isGame: true,
                },
              ],
            },
          },
        }),
      } as Response);
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    await renderAppWithOpenMap('IFDB Selection Map');

    await user.type(screen.getByRole('textbox', { name: /search IFDB for a game/i }), 'example game');
    await user.click(screen.getByRole('button', { name: /^search$/i }));
    await user.click(await screen.findByRole('button', { name: /play the example game/i }));

    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/ifdb/viewgame?tuid=abc123');

    const iframe = await screen.findByTitle(/interactive fiction player/i) as HTMLIFrameElement;
    await waitFor(() => {
      expect(iframe.getAttribute('src')).toBe('/parchment.html?autoplay=1&do_vm_autosave=1&story=https%3A%2F%2Fexample.com%2Fgame.ulx');
    });
    expect(screen.getByRole('button', { name: /choose game/i })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /search IFDB for a game/i })).not.toBeInTheDocument();
    expect(useEditorStore.getState().doc?.metadata.associatedGame).toEqual({
      sourceType: 'ifdb',
      tuid: 'abc123',
      ifid: 'IFID-123',
      title: 'The Example Game',
      author: 'Pat Example',
      storyUrl: 'https://example.com/game.ulx',
      format: 'glulx',
    });
  });

  it('searches IFDB for an author when the author name is clicked in search results', async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          games: [
            {
              tuid: 'abc123',
              title: 'The Example Game',
              author: 'Pat Example',
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          games: [
            {
              tuid: 'def456',
              title: 'Another Example Game',
              author: 'Pat Example',
            },
          ],
        }),
      } as Response);
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    await renderAppWithOpenMap('IFDB Author Search Map');

    const searchInput = screen.getByRole('textbox', { name: /search IFDB for a game/i });
    await user.type(searchInput, 'example game');
    await user.click(screen.getByRole('button', { name: /^search$/i }));
    await screen.findByRole('button', { name: /play the example game/i });

    await user.click(screen.getByRole('button', { name: /search IFDB for games by Pat Example/i }));

    await screen.findByRole('button', { name: /play another example game/i });
    expect(searchInput).toHaveValue('Pat Example');
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/ifdb/search?query=example+game');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/ifdb/search?query=Pat+Example');
  });

  it('loads the selected IFDB game when the cover art is clicked', async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          games: [
            {
              tuid: 'abc123',
              title: 'The Example Game',
              author: 'Pat Example',
              link: 'https://ifdb.org/viewgame?id=abc123',
              coverArtLink: 'https://ifdb.org/coverart?id=abc123&version=4',
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          identification: {
            ifids: ['IFID-123'],
          },
          bibliographic: {
            title: 'The Example Game',
            author: 'Pat Example',
          },
          ifdb: {
            tuid: 'abc123',
            downloads: {
              links: [
                {
                  title: 'Playable Glulx release',
                  url: 'https://example.com/game.ulx',
                  format: 'glulx',
                  isGame: true,
                },
              ],
            },
          },
        }),
      } as Response);
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    await renderAppWithOpenMap('IFDB Cover Selection Map');

    await user.type(screen.getByRole('textbox', { name: /search IFDB for a game/i }), 'example game');
    await user.click(screen.getByRole('button', { name: /^search$/i }));
    await user.click(await screen.findByRole('button', { name: /play the example game via cover art/i }));

    const iframe = await screen.findByTitle(/interactive fiction player/i) as HTMLIFrameElement;
    await waitFor(() => {
      expect(iframe.getAttribute('src')).toBe('/parchment.html?autoplay=1&do_vm_autosave=1&story=https%3A%2F%2Fexample.com%2Fgame.ulx');
    });
  });

  it('alerts when an IFDB result has no supported downloadable story file', async () => {
    const user = userEvent.setup();
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
    const fetchMock = jest.fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          games: [
            {
              tuid: 'abc123',
              title: 'The Example Game',
              author: 'Pat Example',
            },
          ],
        }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          identification: {
            ifids: ['IFID-123'],
          },
          bibliographic: {
            title: 'The Example Game',
            author: 'Pat Example',
          },
          ifdb: {
            tuid: 'abc123',
            downloads: {
              links: [],
            },
          },
        }),
      } as Response);
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    await renderAppWithOpenMap('IFDB Unsupported Selection Map');

    await user.type(screen.getByRole('textbox', { name: /search IFDB for a game/i }), 'example game');
    await user.click(screen.getByRole('button', { name: /^search$/i }));
    await user.click(await screen.findByRole('button', { name: /play the example game/i }));

    expect(alertSpy).toHaveBeenCalledWith('No supported downloadable story file is available for The Example Game.');
    expect(screen.getByRole('textbox', { name: /search IFDB for a game/i })).toBeInTheDocument();
    expect(screen.queryByTitle(/interactive fiction player/i)).not.toBeInTheDocument();
  });

  it('shows IFDB game lookup failures in the chooser panel', async () => {
    const user = userEvent.setup();
    const fetchMock = jest.fn<typeof fetch>()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          games: [
            {
              tuid: 'abc123',
              title: 'The Example Game',
            },
          ],
        }),
      } as Response)
      .mockRejectedValueOnce(new Error('Lookup failed'));
    Object.defineProperty(globalThis, 'fetch', {
      configurable: true,
      writable: true,
      value: fetchMock,
    });

    await renderAppWithOpenMap('IFDB Lookup Error Map');

    await user.type(screen.getByRole('textbox', { name: /search IFDB for a game/i }), 'example game');
    await user.click(screen.getByRole('button', { name: /^search$/i }));
    await user.click(await screen.findByRole('button', { name: /play the example game/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Lookup failed');
    expect(screen.getByRole('textbox', { name: /search IFDB for a game/i })).toBeInTheDocument();
  });

  it('opens a fweep-owned file chooser from the side-panel control', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('Parchment Chooser Map');

    const clickSpy = jest.fn<() => void>();
    const chooserInput = document.querySelector('.app-parchment-panel__device-input') as HTMLInputElement | null;
    expect(chooserInput).not.toBeNull();
    chooserInput!.click = clickSpy;

    await user.click(screen.getByRole('button', { name: /play a story file from your device/i }));

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('opens a fweep-owned file chooser from the keyboard shortcut', async () => {
    await renderAppWithOpenMap('Parchment Shortcut Chooser Map');

    const clickSpy = jest.fn<() => void>();
    const chooserInput = document.querySelector('.app-parchment-panel__device-input') as HTMLInputElement | null;
    expect(chooserInput).not.toBeNull();
    chooserInput!.click = clickSpy;

    fireEvent.keyDown(window, { key: 'F', altKey: true, shiftKey: true });

    expect(clickSpy).toHaveBeenCalledTimes(1);
  });

  it('loads a locally chosen file into the parchment iframe', async () => {
    await renderAppWithOpenMap('Parchment Local File Map');

    const chooserInput = document.querySelector('.app-parchment-panel__device-input') as HTMLInputElement | null;
    expect(chooserInput).not.toBeNull();

    const file = new File(['story data'], 'story.ulx', { type: 'application/octet-stream' });
    await act(async () => {
      fireEvent.change(chooserInput!, {
        target: {
          files: [file],
        },
      });
    });

    const iframe = await screen.findByTitle(/interactive fiction player/i) as HTMLIFrameElement;
    const loadUploadedFile = jest.fn<(file: File) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      value: {
        parchment: {
          load_uploaded_file: loadUploadedFile,
        },
      },
    });
    await loadParchmentIframe(iframe);

    expect(loadUploadedFile).toHaveBeenCalledTimes(1);
    expect(loadUploadedFile).toHaveBeenCalledWith(file);
    expect(screen.getByRole('button', { name: /choose game/i })).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /search IFDB for a game/i })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(useEditorStore.getState().doc?.metadata.associatedGame).toEqual({
        sourceType: 'local-file',
        tuid: null,
        ifid: null,
        title: 'story.ulx',
        author: null,
        storyUrl: null,
        format: 'glulx',
      });
    });
  });

  it('shows a local-file loading error when Parchment rejects the upload', async () => {
    await renderAppWithOpenMap('Parchment Local File Error Map');

    const chooserInput = document.querySelector('.app-parchment-panel__device-input') as HTMLInputElement | null;
    expect(chooserInput).not.toBeNull();

    const file = new File(['story data'], 'story.ulx', { type: 'application/octet-stream' });
    await act(async () => {
      fireEvent.change(chooserInput!, {
        target: {
          files: [file],
        },
      });
    });

    const iframe = await screen.findByTitle(/interactive fiction player/i) as HTMLIFrameElement;
    const loadUploadedFile = jest.fn<(file: File) => Promise<void>>().mockRejectedValue(new Error('Upload failed'));
    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      value: {
        parchment: {
          load_uploaded_file: loadUploadedFile,
        },
      },
    });
    await loadParchmentIframe(iframe);

    expect(await screen.findByRole('alert')).toHaveTextContent('Upload failed');
    expect(useEditorStore.getState().doc?.metadata.associatedGame).toBeNull();
  });

  it('ignores an empty local-file chooser selection', async () => {
    await renderAppWithOpenMap('Parchment Empty File Selection Map');

    const chooserInput = document.querySelector('.app-parchment-panel__device-input') as HTMLInputElement | null;
    expect(chooserInput).not.toBeNull();

    await act(async () => {
      fireEvent.change(chooserInput!, {
        target: {
          files: [],
        },
      });
    });

    expect(screen.queryByTitle(/interactive fiction player/i)).not.toBeInTheDocument();
    expect(useEditorStore.getState().doc?.metadata.associatedGame).toBeNull();
  });

  it('does nothing when the parchment iframe loads without a pending local file', async () => {
    const doc = createEmptyMap('Parchment Idle Load Map');
    const linkedDoc: MapDocument = {
      ...doc,
      metadata: {
        ...doc.metadata,
        associatedGame: {
          sourceType: 'ifdb',
          tuid: 'abc123',
          ifid: 'IFID-123',
          title: 'The Example Game',
          author: 'Pat Example',
          storyUrl: 'https://example.com/game.ulx',
          format: 'glulx',
        },
      },
    };

    await renderAppWithSavedMap(linkedDoc);

    const iframe = await screen.findByTitle(/interactive fiction player/i) as HTMLIFrameElement;
    await loadParchmentIframe(iframe);

    expect(screen.getByRole('button', { name: /choose game/i })).toBeInTheDocument();
    expect(useEditorStore.getState().doc?.metadata.associatedGame?.storyUrl).toBe('https://example.com/game.ulx');
  });

  it('clears a pending local-file retry when reset is clicked', async () => {
    jest.useFakeTimers();
    try {
      await renderAppWithOpenMap('Parchment Reset Retry Map');

      const chooserInput = document.querySelector('.app-parchment-panel__device-input') as HTMLInputElement | null;
      expect(chooserInput).not.toBeNull();

      const file = new File(['story data'], 'story.ulx', { type: 'application/octet-stream' });
      await act(async () => {
        fireEvent.change(chooserInput!, {
          target: {
            files: [file],
          },
        });
      });

      const iframe = await screen.findByTitle(/interactive fiction player/i) as HTMLIFrameElement;
      Object.defineProperty(iframe, 'contentWindow', {
        configurable: true,
        value: {},
      });

      await loadParchmentIframe(iframe);
      await userEvent.setup({ advanceTimers: jest.advanceTimersByTime }).click(screen.getByRole('button', { name: /choose game/i }));
      act(() => {
        jest.runOnlyPendingTimers();
      });

      expect(screen.getByRole('textbox', { name: /search IFDB for a game/i })).toBeInTheDocument();
      expect(screen.queryByTitle(/interactive fiction player/i)).not.toBeInTheDocument();
    } finally {
      jest.useRealTimers();
    }
  });

  it('calls the parchment uploader with the parchment instance as this', async () => {
    await renderAppWithOpenMap('Parchment Bound Method Map');

    const chooserInput = document.querySelector('.app-parchment-panel__device-input') as HTMLInputElement | null;
    expect(chooserInput).not.toBeNull();

    const file = new File(['story data'], 'story.ulx', { type: 'application/octet-stream' });
    await act(async () => {
      fireEvent.change(chooserInput!, {
        target: {
          files: [file],
        },
      });
    });

    const iframe = await screen.findByTitle(/interactive fiction player/i) as HTMLIFrameElement;
    const parchmentInstance = {
      seenFile: null as File | null,
      async load_uploaded_file(this: { seenFile: File | null }, file: File) {
        this.seenFile = file;
      },
    };
    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      value: {
        parchment: parchmentInstance,
      },
    });
    await loadParchmentIframe(iframe);

    expect(parchmentInstance.seenFile).toBe(file);
  });

  it('retries opening a local file until parchment becomes ready after iframe load', async () => {
    jest.useFakeTimers();

    try {
      await renderAppWithOpenMap('Parchment Delayed Ready Map');

      const chooserInput = document.querySelector('.app-parchment-panel__device-input') as HTMLInputElement | null;
      expect(chooserInput).not.toBeNull();

      const file = new File(['story data'], 'story.ulx', { type: 'application/octet-stream' });
      await act(async () => {
        fireEvent.change(chooserInput!, {
          target: {
            files: [file],
          },
        });
      });

      const iframe = await screen.findByTitle(/interactive fiction player/i) as HTMLIFrameElement;
      Object.defineProperty(iframe, 'contentWindow', {
        configurable: true,
        value: {},
      });
      await loadParchmentIframe(iframe);

      const loadUploadedFile = jest.fn<(nextFile: File) => Promise<void>>().mockResolvedValue(undefined);
      Object.defineProperty(iframe, 'contentWindow', {
        configurable: true,
        value: {
          parchment: {
            load_uploaded_file: loadUploadedFile,
          },
        },
      });

      await act(async () => {
        await jest.advanceTimersByTimeAsync(300);
      });

      await waitFor(() => {
        expect(loadUploadedFile).toHaveBeenCalledTimes(1);
      });
      expect(loadUploadedFile).toHaveBeenCalledWith(file);
    } finally {
      jest.useRealTimers();
    }
  });

  it('shows an error if parchment is not ready to receive a local file', async () => {
    jest.useFakeTimers();

    try {
    await renderAppWithOpenMap('Parchment Not Ready Map');

    const chooserInput = document.querySelector('.app-parchment-panel__device-input') as HTMLInputElement | null;
    expect(chooserInput).not.toBeNull();

    const file = new File(['story data'], 'story.ulx', { type: 'application/octet-stream' });
    await act(async () => {
      fireEvent.change(chooserInput!, {
        target: {
          files: [file],
        },
      });
    });

    const iframe = await screen.findByTitle(/interactive fiction player/i) as HTMLIFrameElement;
    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      value: {},
    });
    await loadParchmentIframe(iframe);

    await act(async () => {
      await jest.advanceTimersByTimeAsync(1200);
    });

    expect(await screen.findByRole('alert')).toHaveTextContent(/parchment is not ready to open a local file/i);
    } finally {
      jest.useRealTimers();
    }
  });

  it('returns from the game view to the chooser when reset is clicked', async () => {
    const user = userEvent.setup();
    const doc = createEmptyMap('Reset Panel Map');
    const linkedDoc: MapDocument = {
      ...doc,
      metadata: {
        ...doc.metadata,
        associatedGame: {
          sourceType: 'ifdb',
          tuid: 'abc123',
          ifid: 'IFID-123',
          title: 'The Example Game',
          author: 'Pat Example',
          storyUrl: 'https://example.com/game.ulx',
          format: 'glulx',
        },
      },
    };

    await renderAppWithSavedMap(linkedDoc);

    expect(await screen.findByTitle(/interactive fiction player/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /choose game/i }));

    expect(screen.getByRole('textbox', { name: /search IFDB for a game/i })).toBeInTheDocument();
    expect(screen.queryByTitle(/interactive fiction player/i)).not.toBeInTheDocument();
  });

  it('shows the alternate connection style icon on the toggle button', async () => {
    const user = userEvent.setup();
    await renderAppWithOpenMap('Connection Style Toggle Map');

    const toCurvedButton = screen.getByRole('button', { name: /toggle curved connections/i });
    expect(toCurvedButton.querySelector('path')?.getAttribute('d')).toBe(BEZIER_TOGGLE_ICON_PATH);

    await user.click(toCurvedButton);

    const toStraightButton = screen.getByRole('button', { name: /toggle straight connections/i });
    expect(toStraightButton.querySelector('path')?.getAttribute('d')).toBe(STRAIGHT_TOGGLE_ICON_PATH);
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

  it('warns before browser unload when the parchment game view is visible', async () => {
    const doc = createEmptyMap('Unload Warning Map');
    const linkedDoc: MapDocument = {
      ...doc,
      metadata: {
        ...doc.metadata,
        associatedGame: {
          sourceType: 'ifdb',
          tuid: 'abc123',
          ifid: 'IFID-123',
          title: 'The Example Game',
          author: 'Pat Example',
          storyUrl: 'https://example.com/game.ulx',
          format: 'glulx',
        },
      },
    };

    await renderAppWithSavedMap(linkedDoc);
    expect(await screen.findByTitle(/interactive fiction player/i)).toBeInTheDocument();

    const event = new Event('beforeunload', { cancelable: true });
    Object.defineProperty(event, 'returnValue', {
      configurable: true,
      writable: true,
      value: '',
    });

    const dispatchResult = window.dispatchEvent(event);
    const unloadEvent = event as Event & { returnValue?: unknown };

    expect(dispatchResult).toBe(false);
    expect(event.defaultPrevented).toBe(true);
    expect(unloadEvent.returnValue).toBe('');
  });

  it('does not warn before browser unload when the chooser/search panel is visible', async () => {
    await renderAppWithOpenMap('Chooser Unload Map');
    expect(screen.getByRole('textbox', { name: /search IFDB for a game/i })).toBeInTheDocument();

    const event = new Event('beforeunload', { cancelable: true });
    Object.defineProperty(event, 'returnValue', {
      configurable: true,
      writable: true,
      value: undefined,
    });

    const dispatchResult = window.dispatchEvent(event);
    const unloadEvent = event as Event & { returnValue?: unknown };

    expect(dispatchResult).toBe(true);
    expect(event.defaultPrevented).toBe(false);
    expect(unloadEvent.returnValue).toBeUndefined();
  });

  it('returns map command suggestions to the parchment iframe on request', async () => {
    const doc = addRoom(createEmptyMap('Game Suggestion Request Map'), { ...createRoom('Kitchen'), position: { x: 100, y: 100 } });
    const linkedDoc: MapDocument = {
      ...doc,
      metadata: {
        ...doc.metadata,
        associatedGame: {
          sourceType: 'ifdb',
          tuid: 'abc123',
          ifid: 'IFID-123',
          title: 'The Example Game',
          author: 'Pat Example',
          storyUrl: 'https://example.com/game.ulx',
          format: 'glulx',
        },
      },
    };

    await renderAppWithSavedMap(linkedDoc);
    const iframe = await screen.findByTitle(/interactive fiction player/i) as HTMLIFrameElement;
    const postMessage = jest.fn<(message: unknown, targetOrigin: string) => void>();
    const iframeWindowMock = { postMessage };
    Object.defineProperty(iframe, 'contentWindow', {
      configurable: true,
      value: iframeWindowMock,
    });

    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        data: { type: 'fweep:request-cli-suggestions', requestId: 7, command: 'sh', caretPosition: 2 },
        origin: window.location.origin,
        source: iframeWindowMock as unknown as MessageEventSource,
      }));
    });

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'fweep:render-cli-suggestions',
          requestId: 7,
          command: 'sh',
          caretPosition: 2,
          suggestionResult: expect.objectContaining({
            suggestions: expect.arrayContaining([
              expect.objectContaining({
                label: 'show',
                insertText: 'show',
              }),
            ]),
          }),
        }),
        window.location.origin,
      );
    });
  });

  it('warns before leaving to the map selection screen when the parchment game view is visible', async () => {
    const confirmSpy = jest.spyOn(window, 'confirm').mockReturnValue(false);
    const doc = createEmptyMap('Protected Return Map');
    const linkedDoc: MapDocument = {
      ...doc,
      metadata: {
        ...doc.metadata,
        associatedGame: {
          sourceType: 'ifdb',
          tuid: 'abc123',
          ifid: 'IFID-123',
          title: 'The Example Game',
          author: 'Pat Example',
          storyUrl: 'https://example.com/game.ulx',
          format: 'glulx',
        },
      },
    };

    await renderAppWithSavedMap(linkedDoc);
    const user = userEvent.setup();
    expect(await screen.findByTitle(/interactive fiction player/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /back to maps/i }));

    expect(confirmSpy).toHaveBeenCalledWith('You may have an unsaved game. Do you really want to leave?');
    expect(window.location.hash).toBe(`#/map/${linkedDoc.metadata.id}`);
    expect(screen.getByTitle(/interactive fiction player/i)).toBeInTheDocument();
  });

  it('leaves to the map selection screen after confirmation when the parchment game view is visible', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    const doc = createEmptyMap('Confirmed Return Map');
    const linkedDoc: MapDocument = {
      ...doc,
      metadata: {
        ...doc.metadata,
        associatedGame: {
          sourceType: 'ifdb',
          tuid: 'abc123',
          ifid: 'IFID-123',
          title: 'The Example Game',
          author: 'Pat Example',
          storyUrl: 'https://example.com/game.ulx',
          format: 'glulx',
        },
      },
    };

    await renderAppWithSavedMap(linkedDoc);
    const user = userEvent.setup();
    expect(await screen.findByTitle(/interactive fiction player/i)).toBeInTheDocument();

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

  it('keeps a cached map viewport across switching away, reopening, and refreshing', async () => {
    const user = userEvent.setup();
    const map1 = createEmptyMap('Map One');
    const map2 = createEmptyMap('Map Two');
    const map3 = createEmptyMap('Map Three');
    await saveMap(map1);
    await saveMap(map2);
    await saveMap(map3);

    navigateTo(`#/map/${map1.metadata.id}`);
    let rendered = renderApp();

    await screen.findByLabelText(`Map name: ${map1.metadata.name}`);

    act(() => {
      cacheMapViewSession(map1.metadata.id, { x: 180, y: -90 }, 1);
      useEditorStore.getState().setMapPanOffset({ x: 180, y: -90 });
    });

    await user.click(screen.getByRole('button', { name: /back to maps/i }));
    await screen.findByRole('dialog', { name: /choose a map/i });

    await user.click((await screen.findByText(map2.metadata.name)).closest('button') as HTMLButtonElement);
    await screen.findByLabelText(`Map name: ${map2.metadata.name}`);

    await user.click(screen.getByRole('button', { name: /back to maps/i }));
    await screen.findByRole('dialog', { name: /choose a map/i });

    await user.click((await screen.findByText(map3.metadata.name)).closest('button') as HTMLButtonElement);
    await screen.findByLabelText(`Map name: ${map3.metadata.name}`);

    await user.click(screen.getByRole('button', { name: /back to maps/i }));
    await screen.findByRole('dialog', { name: /choose a map/i });

    await user.click((await screen.findByText(map1.metadata.name)).closest('button') as HTMLButtonElement);
    await screen.findByLabelText(`Map name: ${map1.metadata.name}`);

    expect(loadCachedMapViewSession(map1.metadata.id)).toEqual({
      pan: { x: 180, y: -90 },
      zoom: 1,
    });
    expect(useEditorStore.getState().mapPanOffset).toEqual({ x: 180, y: -90 });

    rendered.unmount();

    window.history.replaceState({}, '', `#/map/${map1.metadata.id}`);
    rendered = renderApp();

    await screen.findByLabelText(`Map name: ${map1.metadata.name}`);
    expect(useEditorStore.getState().mapPanOffset).toEqual({ x: 180, y: -90 });

    rendered.unmount();
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
    expect(await screen.findByRole('dialog', { name: /welcome/i })).toBeInTheDocument();
  });

  it('shows the tips dialog when a map is opened', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('fweep-welcome-dialog-seen', 'true');
    window.localStorage.setItem('fweep-startup-tips-enabled', 'true');
    const doc = createEmptyMap('Tips Map');
    await saveMap(doc);
    navigateTo(`#/map/${doc.metadata.id}`);
    renderApp();
    await screen.findByLabelText(`Map name: ${doc.metadata.name}`);

    const tipsDialog = await screen.findByRole('dialog', { name: /tips/i });
    expect(tipsDialog).toHaveTextContent(/press r, then click empty canvas/i);

    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /tips/i })).not.toBeInTheDocument();
    });
  });

  it('shows the welcome dialog only once overall, starting with the first created map', async () => {
    navigateTo('#/');
    const user = userEvent.setup();
    renderApp();

    await user.type(screen.getByPlaceholderText('Map name'), 'First Map');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    const welcomeDialog = await screen.findByRole('dialog', { name: /welcome/i });
    expect(welcomeDialog).toHaveTextContent(/thanks for trying out fweep/i);

    await user.click(screen.getByRole('button', { name: /^ok$/i }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /welcome/i })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: /back to maps/i }));
    expect(await screen.findByRole('dialog', { name: /choose a map/i })).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Map name'), 'Second Map');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await screen.findByText(/second map/i);
    expect(screen.queryByRole('dialog', { name: /welcome/i })).not.toBeInTheDocument();
  });

  it('shows tips after the welcome dialog is dismissed on first open', async () => {
    navigateTo('#/');
    const user = userEvent.setup();
    window.localStorage.setItem('fweep-startup-tips-enabled', 'true');
    renderApp();

    await user.type(screen.getByPlaceholderText('Map name'), 'Tips After Welcome Map');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByRole('dialog', { name: /welcome/i })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /tips/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^ok$/i }));

    expect(await screen.findByRole('dialog', { name: /tips/i })).toBeInTheDocument();
  });

  it('stops showing tips for all maps when disabled from the dialog', async () => {
    navigateTo('#/');
    const user = userEvent.setup();
    window.localStorage.setItem('fweep-startup-tips-enabled', 'true');
    renderApp();

    await user.type(screen.getByPlaceholderText('Map name'), 'No More Tips Map');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await user.click(await screen.findByRole('button', { name: /^ok$/i }));
    expect(await screen.findByRole('dialog', { name: /tips/i })).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /don't show tips at startup/i }));
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));

    await user.click(screen.getByRole('button', { name: /back to maps/i }));
    expect(await screen.findByRole('dialog', { name: /choose a map/i })).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('Map name'), 'Second No Tips Map');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    await screen.findByText(/second no tips map/i);
    expect(screen.queryByRole('dialog', { name: /welcome/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /tips/i })).not.toBeInTheDocument();
    expect(window.localStorage.getItem('fweep-startup-tips-enabled')).toBe('false');
  });

  it('starts each map-open tips dialog at the next stored tip and wraps after the end', async () => {
    const user = userEvent.setup();
    window.localStorage.setItem('fweep-welcome-dialog-seen', 'true');
    window.localStorage.setItem('fweep-startup-tips-enabled', 'true');

    const firstDoc = createEmptyMap('Rotating Tips One');
    await saveMap(firstDoc);
    navigateTo(`#/map/${firstDoc.metadata.id}`);
    renderApp();
    await screen.findByLabelText(`Map name: ${firstDoc.metadata.name}`);

    expect(await screen.findByText(/press r, then click empty canvas/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^cancel$/i }));
    expect(window.localStorage.getItem('fweep-startup-tip-index')).toBe('1');

    await user.click(screen.getByRole('button', { name: /back to maps/i }));
    await screen.findByRole('dialog', { name: /choose a map/i });

    await user.type(screen.getByPlaceholderText('Map name'), 'Rotating Tips Two');
    await user.click(screen.getByRole('button', { name: 'Create' }));

    expect(await screen.findByText(/drag from a room's directional handle/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^next$/i }));
    expect(await screen.findByText(/press \/ in the cli input/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^done$/i }));
    expect(window.localStorage.getItem('fweep-startup-tip-index')).toBe('0');
  });

  it('persists the next startup tip index when the tips dialog is dismissed with Escape', async () => {
    window.localStorage.setItem('fweep-welcome-dialog-seen', 'true');
    window.localStorage.setItem('fweep-startup-tips-enabled', 'true');

    const doc = createEmptyMap('Escape Tips Map');
    await saveMap(doc);
    navigateTo(`#/map/${doc.metadata.id}`);
    renderApp();
    await screen.findByLabelText(`Map name: ${doc.metadata.name}`);

    expect(await screen.findByText(/press r, then click empty canvas/i)).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(window.localStorage.getItem('fweep-startup-tip-index')).toBe('1');
  });

  it('shows the welcome dialog the first time an existing map is opened', async () => {
    const doc = createEmptyMap('Existing Map');
    await saveMap(doc);

    navigateTo('#/');
    const user = userEvent.setup();
    renderApp();

    await user.click(await screen.findByText('Existing Map'));

    await screen.findByText(/existing map/i);
    expect(await screen.findByRole('dialog', { name: /welcome/i })).toBeInTheDocument();
  });

  it('shows the welcome dialog the first time a map is imported', async () => {
    navigateTo('#/');
    const user = userEvent.setup();
    renderApp();

    const fileInput = document.querySelector('.map-selection-file-input') as HTMLInputElement;
    const fileContents = JSON.stringify(createEmptyMap('Imported Welcome Map'));
    const file = new File(
      [fileContents],
      'imported-map.json',
      { type: 'application/json' },
    );
    if (typeof file.text !== 'function') {
      (file as File & { text: () => Promise<string> }).text = async () => fileContents;
    }

    await user.upload(fileInput, file);

    await screen.findByText(/imported welcome map/i);
    expect(await screen.findByRole('dialog', { name: /welcome/i })).toBeInTheDocument();
  });

  it('reopens the welcome dialog with Ctrl+Shift+W in development', async () => {
    (globalThis as { __FWEEP_TEST_DEV__?: boolean }).__FWEEP_TEST_DEV__ = true;
    const user = userEvent.setup();
    await renderAppWithOpenMap('Welcome Hotkey Map');

    expect(screen.queryByRole('dialog', { name: /welcome/i })).not.toBeInTheDocument();

    await user.keyboard('{Control>}{Shift>}w{/Shift}{/Control}');

    expect(await screen.findByRole('dialog', { name: /welcome/i })).toBeInTheDocument();
  });

  it('closes the welcome dialog with Escape', async () => {
    (globalThis as { __FWEEP_TEST_DEV__?: boolean }).__FWEEP_TEST_DEV__ = true;
    const user = userEvent.setup();
    await renderAppWithOpenMap('Welcome Escape Map');

    await user.keyboard('{Control>}{Shift>}w{/Shift}{/Control}');
    expect(await screen.findByRole('dialog', { name: /welcome/i })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /welcome/i })).not.toBeInTheDocument();
    });
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
