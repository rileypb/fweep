import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { NormalizedIfdbSearchResult } from '../../src/domain/ifdb';
import type { AssociatedGameMetadata } from '../../src/domain/map-types';
import {
  buildParchmentSrc,
  PARCHMENT_LOCAL_FILE_RETRY_ATTEMPTS,
  PARCHMENT_LOCAL_FILE_RETRY_DELAY_MS,
} from '../../src/components/parchment-panel-helpers';

const mockSearchIfdbGames = jest.fn<(query: string) => Promise<readonly NormalizedIfdbSearchResult[]>>();
const mockViewIfdbGame = jest.fn<(tuid: string) => Promise<AssociatedGameMetadata>>();

await jest.unstable_mockModule('../../src/domain/ifdb-client', () => ({
  searchIfdbGames: mockSearchIfdbGames,
  viewIfdbGame: mockViewIfdbGame,
}));

const { useParchmentPanel } = await import('../../src/hooks/use-parchment-panel');

function setViewportSize(width: number, height: number): void {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: height,
  });
}

function createRefs() {
  return {
    parchmentDeviceInputRef: { current: document.createElement('input') },
    parchmentIframeRef: { current: document.createElement('iframe') },
  };
}

function createPointerEvent(type: string, pointerId: number, coords: { clientX?: number; clientY?: number }): Event {
  const event = new Event(type);
  Object.defineProperties(event, {
    pointerId: { configurable: true, value: pointerId },
    clientX: { configurable: true, value: coords.clientX ?? 0 },
    clientY: { configurable: true, value: coords.clientY ?? 0 },
  });
  return event;
}

function createOptions(overrides?: Partial<{
  activeMapId: string | null;
  associatedGame: AssociatedGameMetadata | null;
  defaultStoryUrlForNewMap: string | null;
  shouldLoadDefaultStoryForActiveMap: boolean;
  setAssociatedGameMetadata: (associatedGame: AssociatedGameMetadata | null) => void;
  heightTopInsetPx: number;
  heightBottomInsetPx: number;
}>) {
  const refs = createRefs();
  return {
    activeMapId: 'map-1',
    associatedGame: null,
    defaultStoryUrlForNewMap: null,
    shouldLoadDefaultStoryForActiveMap: false,
    setAssociatedGameMetadata: jest.fn<(associatedGame: AssociatedGameMetadata | null) => void>(),
    heightTopInsetPx: 16,
    heightBottomInsetPx: 16,
    ...refs,
    ...overrides,
  };
}

beforeEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
  window.localStorage.clear();
  document.body.innerHTML = '';
  document.body.className = '';
  setViewportSize(1200, 900);
  mockSearchIfdbGames.mockReset();
  mockViewIfdbGame.mockReset();
});

describe('useParchmentPanel', () => {
  it('searches IFDB by query and author and reports failures', async () => {
    const firstResults: readonly NormalizedIfdbSearchResult[] = [
      {
        tuid: 'abc123',
        title: 'The Example Game',
        author: 'Pat Example',
        ifdbLink: null,
        coverArtUrl: null,
        published: null,
        publishedDisplay: null,
        publishedYear: null,
        averageRating: null,
        isPlayable: null,
      },
    ];
    const secondResults: readonly NormalizedIfdbSearchResult[] = [
      {
        tuid: 'def456',
        title: 'Another Example Game',
        author: 'Pat Example',
        ifdbLink: null,
        coverArtUrl: null,
        published: null,
        publishedDisplay: null,
        publishedYear: null,
        averageRating: null,
        isPlayable: null,
      },
    ];
    mockViewIfdbGame
      .mockResolvedValueOnce({
        sourceType: 'ifdb',
        tuid: 'abc123',
        ifid: 'IFID-123',
        title: 'The Example Game',
        author: 'Pat Example',
        storyUrl: 'https://example.com/game.ulx',
        format: 'glulx',
      })
      .mockResolvedValueOnce({
        sourceType: 'ifdb',
        tuid: 'def456',
        ifid: 'IFID-456',
        title: 'Another Example Game',
        author: 'Pat Example',
        storyUrl: null,
        format: null,
      });
    mockSearchIfdbGames
      .mockResolvedValueOnce(firstResults)
      .mockResolvedValueOnce(secondResults)
      .mockRejectedValueOnce(new Error('Search failed'));

    const { result } = renderHook(() => useParchmentPanel(createOptions()));

    await act(async () => {
      result.current.setIfdbSearchQuery('example game');
    });
    await act(async () => {
      await result.current.handleIfdbSearchSubmit({
        preventDefault: jest.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>);
    });

    expect(mockSearchIfdbGames).toHaveBeenNthCalledWith(1, 'example game');
    expect(result.current.ifdbSearchResults).toEqual([
      {
        ...firstResults[0],
        isPlayable: true,
      },
    ]);
    expect(result.current.ifdbSearchError).toBeNull();

    await act(async () => {
      await result.current.handleIfdbAuthorSearch('Pat Example');
    });

    expect(mockSearchIfdbGames).toHaveBeenNthCalledWith(2, 'Pat Example');
    expect(result.current.ifdbSearchQuery).toBe('Pat Example');
    expect(result.current.ifdbSearchResults).toEqual([
      {
        ...secondResults[0],
        isPlayable: false,
      },
    ]);

    await act(async () => {
      result.current.setIfdbSearchQuery('broken');
    });
    await act(async () => {
      await result.current.handleIfdbSearchSubmit({
        preventDefault: jest.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>);
    });

    expect(result.current.ifdbSearchResults).toEqual([]);
    expect(result.current.ifdbSearchError).toBe('Search failed');
  });

  it('clears search state for blank queries without hitting IFDB', async () => {
    const { result } = renderHook(() => useParchmentPanel(createOptions()));

    await act(async () => {
      result.current.setIfdbSearchQuery('   ');
      await result.current.handleIfdbSearchSubmit({
        preventDefault: jest.fn(),
      } as unknown as React.FormEvent<HTMLFormElement>);
    });

    expect(mockSearchIfdbGames).not.toHaveBeenCalled();
    expect(result.current.ifdbSearchResults).toEqual([]);
    expect(result.current.ifdbSearchError).toBeNull();
  });

  it('selects IFDB games, alerts for unsupported downloads, and reports lookup failures', async () => {
    const setAssociatedGameMetadata = jest.fn<(associatedGame: AssociatedGameMetadata | null) => void>();
    const supportedGame: AssociatedGameMetadata = {
      sourceType: 'ifdb',
      tuid: 'abc123',
      ifid: 'IFID-123',
      title: 'The Example Game',
      author: 'Pat Example',
      storyUrl: 'https://example.com/game.ulx',
      format: 'glulx',
    };
    mockViewIfdbGame
      .mockResolvedValueOnce({
        ...supportedGame,
        storyUrl: null,
      })
      .mockRejectedValueOnce(new Error('Lookup failed'))
      .mockResolvedValueOnce(supportedGame);
    const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});

    const { result } = renderHook(() => useParchmentPanel(createOptions({ setAssociatedGameMetadata })));

    await act(async () => {
      await result.current.handleIfdbGameSelected('missing-download');
    });
    expect(alertSpy).toHaveBeenCalledWith('No supported downloadable story file is available for The Example Game.');
    expect(setAssociatedGameMetadata).not.toHaveBeenCalled();
    expect(result.current.loadingIfdbGameTuid).toBeNull();

    await act(async () => {
      await result.current.handleIfdbGameSelected('lookup-error');
    });
    expect(result.current.ifdbSearchError).toBe('Lookup failed');
    expect(result.current.loadingIfdbGameTuid).toBeNull();

    await act(async () => {
      await result.current.handleIfdbGameSelected('supported');
    });
    expect(setAssociatedGameMetadata).toHaveBeenCalledWith(supportedGame);
    expect(result.current.isParchmentGameViewVisible).toBe(true);
    expect(result.current.ifdbSearchError).toBeNull();
  });

  it('syncs the IFDB-associated game into the visible parchment view and respects reset until the map changes', async () => {
    const associatedGame: AssociatedGameMetadata = {
      sourceType: 'ifdb',
      tuid: 'abc123',
      ifid: 'IFID-123',
      title: 'The Example Game',
      author: 'Pat Example',
      storyUrl: 'https://example.com/game.ulx',
      format: 'glulx',
    };

    const { result, rerender } = renderHook(
      (options: ReturnType<typeof createOptions>) => useParchmentPanel(options),
      {
        initialProps: createOptions({
          activeMapId: 'map-1',
          associatedGame,
        }),
      },
    );

    await waitFor(() => {
      expect(result.current.parchmentSrc).toBe(buildParchmentSrc(associatedGame.storyUrl));
    });
    expect(result.current.isParchmentGameViewVisible).toBe(true);

    act(() => {
      result.current.handleResetParchmentPanel();
    });
    expect(result.current.isParchmentGameViewVisible).toBe(false);

    rerender(createOptions({
      activeMapId: 'map-1',
      associatedGame,
    }));
    expect(result.current.isParchmentGameViewVisible).toBe(false);

    rerender(createOptions({
      activeMapId: 'map-2',
      associatedGame: null,
    }));
    expect(result.current.isParchmentGameViewVisible).toBe(false);
    expect(result.current.parchmentSrc).toBe(buildParchmentSrc(null));
  });

  it('loads the bundled default story for a newly created map without associated game metadata', async () => {
    const defaultStoryUrl = '/fweep.gblorb';

    const { result } = renderHook(() => useParchmentPanel(createOptions({
      activeMapId: 'map-new',
      associatedGame: null,
      defaultStoryUrlForNewMap: defaultStoryUrl,
      shouldLoadDefaultStoryForActiveMap: true,
    })));

    await waitFor(() => {
      expect(result.current.parchmentSrc).toBe(buildParchmentSrc(defaultStoryUrl));
    });
    expect(result.current.isParchmentGameViewVisible).toBe(true);
  });

  it('can switch the chooser to the bundled intro game on demand', () => {
    const defaultStoryUrl = '/fweep.gblorb';

    const { result } = renderHook(() => useParchmentPanel(createOptions({
      activeMapId: 'map-existing',
      associatedGame: null,
      defaultStoryUrlForNewMap: defaultStoryUrl,
      shouldLoadDefaultStoryForActiveMap: false,
    })));

    act(() => {
      result.current.handlePlayDefaultStory();
    });

    expect(result.current.parchmentSrc).toBe(buildParchmentSrc(defaultStoryUrl));
    expect(result.current.isParchmentGameViewVisible).toBe(true);
  });

  it('keeps the bundled intro game selected after resetting an IFDB-loaded game', async () => {
    const defaultStoryUrl = '/fweep.gblorb';
    const associatedGame: AssociatedGameMetadata = {
      sourceType: 'ifdb',
      tuid: 'abc123',
      ifid: 'IFID-123',
      title: 'The Example Game',
      author: 'Pat Example',
      storyUrl: 'https://example.com/game.ulx',
      format: 'glulx',
    };

    const { result } = renderHook(() => useParchmentPanel(createOptions({
      activeMapId: 'map-ifdb',
      associatedGame,
      defaultStoryUrlForNewMap: defaultStoryUrl,
      shouldLoadDefaultStoryForActiveMap: false,
    })));

    await waitFor(() => {
      expect(result.current.parchmentSrc).toBe(buildParchmentSrc(associatedGame.storyUrl));
    });

    act(() => {
      result.current.handleResetParchmentPanel();
    });

    act(() => {
      result.current.handlePlayDefaultStory();
    });

    expect(result.current.parchmentSrc).toBe(buildParchmentSrc(defaultStoryUrl));
    expect(result.current.isParchmentGameViewVisible).toBe(true);
  });

  it('does not load the bundled default story for existing maps unless requested', () => {
    const defaultStoryUrl = '/fweep.gblorb';

    const { result } = renderHook(() => useParchmentPanel(createOptions({
      activeMapId: 'map-existing',
      associatedGame: null,
      defaultStoryUrlForNewMap: defaultStoryUrl,
      shouldLoadDefaultStoryForActiveMap: false,
    })));

    expect(result.current.parchmentSrc).toBe(buildParchmentSrc(null));
    expect(result.current.isParchmentGameViewVisible).toBe(false);
  });

  it('opens the device chooser and loads a local file when parchment is ready', async () => {
    const setAssociatedGameMetadata = jest.fn<(associatedGame: AssociatedGameMetadata | null) => void>();
    const options = createOptions({ setAssociatedGameMetadata });
    const clickSpy = jest.fn<() => void>();
    options.parchmentDeviceInputRef.current!.click = clickSpy;
    const loadUploadedFile = jest.fn<(file: File) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(options.parchmentIframeRef.current, 'contentWindow', {
      configurable: true,
      value: {
        parchment: {
          load_uploaded_file: loadUploadedFile,
        },
      },
    });

    const { result } = renderHook(() => useParchmentPanel(options));

    act(() => {
      result.current.handleOpenParchmentFileChooser();
    });
    expect(clickSpy).toHaveBeenCalledTimes(1);

    const file = new File(['story data'], 'story.ulx', { type: 'application/octet-stream' });
    await act(async () => {
      await result.current.handleParchmentDeviceFileChange({
        target: {
          files: [file],
          value: 'story.ulx',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    expect(loadUploadedFile).toHaveBeenCalledWith(file);
    expect(setAssociatedGameMetadata).toHaveBeenCalledWith(expect.objectContaining({
      sourceType: 'local-file',
      title: 'story.ulx',
      format: 'glulx',
    }));
    expect(result.current.isParchmentGameViewVisible).toBe(true);
    expect(result.current.ifdbSearchError).toBeNull();
  });

  it('reports local-file loading failures and no-ops on empty file selections', async () => {
    const setAssociatedGameMetadata = jest.fn<(associatedGame: AssociatedGameMetadata | null) => void>();
    const options = createOptions({ setAssociatedGameMetadata });
    const loadUploadedFile = jest.fn<(file: File) => Promise<void>>().mockRejectedValue(new Error('Upload failed'));
    Object.defineProperty(options.parchmentIframeRef.current, 'contentWindow', {
      configurable: true,
      value: {
        parchment: {
          load_uploaded_file: loadUploadedFile,
        },
      },
    });

    const { result } = renderHook(() => useParchmentPanel(options));

    await act(async () => {
      await result.current.handleParchmentDeviceFileChange({
        target: {
          files: [],
          value: '',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });
    expect(loadUploadedFile).not.toHaveBeenCalled();

    const file = new File(['story data'], 'story.ulx', { type: 'application/octet-stream' });
    await act(async () => {
      await result.current.handleParchmentDeviceFileChange({
        target: {
          files: [file],
          value: 'story.ulx',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    expect(result.current.ifdbSearchError).toBe('Upload failed');
    expect(setAssociatedGameMetadata).not.toHaveBeenCalled();
  });

  it('retries pending local-file loads after iframe load and can be reset before retry completion', async () => {
    jest.useFakeTimers();
    const options = createOptions();
    Object.defineProperty(options.parchmentIframeRef.current, 'contentWindow', {
      configurable: true,
      value: {},
    });
    const { result } = renderHook(() => useParchmentPanel(options));

    const file = new File(['story data'], 'story.ulx', { type: 'application/octet-stream' });
    await act(async () => {
      await result.current.handleParchmentDeviceFileChange({
        target: {
          files: [file],
          value: 'story.ulx',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    act(() => {
      result.current.handleParchmentIframeLoad();
    });

    act(() => {
      result.current.handleResetParchmentPanel();
      jest.advanceTimersByTime((PARCHMENT_LOCAL_FILE_RETRY_ATTEMPTS + 2) * PARCHMENT_LOCAL_FILE_RETRY_DELAY_MS);
    });

    expect(result.current.isParchmentGameViewVisible).toBe(false);
    expect(result.current.ifdbSearchError).toBeNull();
  });

  it('shows an error when parchment never becomes ready for a pending local file', async () => {
    jest.useFakeTimers();
    const options = createOptions();
    Object.defineProperty(options.parchmentIframeRef.current, 'contentWindow', {
      configurable: true,
      value: {},
    });
    const { result } = renderHook(() => useParchmentPanel(options));

    const file = new File(['story data'], 'story.ulx', { type: 'application/octet-stream' });
    await act(async () => {
      await result.current.handleParchmentDeviceFileChange({
        target: {
          files: [file],
          value: 'story.ulx',
        },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });

    act(() => {
      result.current.handleParchmentIframeLoad();
    });

    await act(async () => {
      await jest.advanceTimersByTimeAsync((PARCHMENT_LOCAL_FILE_RETRY_ATTEMPTS + 2) * PARCHMENT_LOCAL_FILE_RETRY_DELAY_MS);
    });

    expect(result.current.ifdbSearchError).toBe('Parchment is not ready to open a local file yet.');
  });

  it('resizes the panel with pointer and keyboard controls', () => {
    const { result } = renderHook(() => useParchmentPanel(createOptions()));
    const startingWidth = result.current.parchmentPanelWidth;
    const startingHeight = result.current.parchmentPanelHeight;

    act(() => {
      result.current.beginParchmentPanelResize(5, 500, 'right');
    });
    expect(document.body.classList.contains('app-shell--resizing-side-panel')).toBe(true);

    act(() => {
      window.dispatchEvent(createPointerEvent('pointermove', 9, { clientX: 200 }));
    });
    expect(result.current.parchmentPanelWidth).toBe(startingWidth);

    act(() => {
      window.dispatchEvent(createPointerEvent('pointermove', 5, { clientX: 450 }));
    });
    expect(result.current.parchmentPanelWidth).not.toBe(startingWidth);

    act(() => {
      window.dispatchEvent(createPointerEvent('pointerup', 5, { clientX: 450 }));
    });
    expect(document.body.classList.contains('app-shell--resizing-side-panel')).toBe(false);

    act(() => {
      result.current.beginParchmentPanelHeightResize(7, 500);
    });
    expect(document.body.classList.contains('app-shell--resizing-side-panel-height')).toBe(true);

    act(() => {
      window.dispatchEvent(createPointerEvent('pointermove', 7, { clientY: 550 }));
      window.dispatchEvent(createPointerEvent('pointerup', 7, { clientY: 550 }));
    });
    expect(document.body.classList.contains('app-shell--resizing-side-panel-height')).toBe(false);
    expect(result.current.parchmentPanelHeight).not.toBe(startingHeight);

    const preventWidthDefault = jest.fn();
    act(() => {
      result.current.handleParchmentPanelWidthResizeKeyDown({
        key: 'ArrowLeft',
        preventDefault: preventWidthDefault,
      } as unknown as React.KeyboardEvent<HTMLElement>, 'left');
    });
    expect(preventWidthDefault).toHaveBeenCalled();

    const preventHeightDefault = jest.fn();
    act(() => {
      result.current.handleParchmentPanelHeightResizeKeyDown({
        key: 'ArrowUp',
        preventDefault: preventHeightDefault,
      } as unknown as React.KeyboardEvent<HTMLElement>);
    });
    expect(preventHeightDefault).toHaveBeenCalled();

    const preventIgnoredDefault = jest.fn();
    act(() => {
      result.current.handleParchmentPanelWidthResizeKeyDown({
        key: 'Enter',
        preventDefault: preventIgnoredDefault,
      } as unknown as React.KeyboardEvent<HTMLElement>);
      result.current.handleParchmentPanelHeightResizeKeyDown({
        key: 'Enter',
        preventDefault: preventIgnoredDefault,
      } as unknown as React.KeyboardEvent<HTMLElement>);
    });
    expect(preventIgnoredDefault).not.toHaveBeenCalled();
  });

  it('updates persisted panel dimensions when the viewport shrinks', () => {
    const { result } = renderHook(() => useParchmentPanel(createOptions()));
    const initialWidth = result.current.parchmentPanelWidth;
    const initialHeight = result.current.parchmentPanelHeight;

    act(() => {
      setViewportSize(700, 400);
      window.dispatchEvent(new Event('resize'));
    });

    expect(result.current.parchmentPanelWidth).toBeLessThanOrEqual(initialWidth);
    expect(result.current.parchmentPanelHeight).toBeLessThanOrEqual(initialHeight);
  });

  it('clamps panel height to stay below the protected top area', () => {
    window.localStorage.setItem('fweep-parchment-panel-height', '880');

    const { result } = renderHook(() => useParchmentPanel(createOptions({
      heightTopInsetPx: 84,
      heightBottomInsetPx: 16,
    })));

    expect(result.current.parchmentPanelHeight).toBe(800);

    act(() => {
      result.current.beginParchmentPanelHeightResize(7, 500);
      window.dispatchEvent(createPointerEvent('pointermove', 7, { clientY: -200 }));
      window.dispatchEvent(createPointerEvent('pointerup', 7, { clientY: -200 }));
    });

    expect(result.current.parchmentPanelHeight).toBe(800);

    const preventDefault = jest.fn();
    act(() => {
      result.current.handleParchmentPanelHeightResizeKeyDown({
        key: 'ArrowUp',
        preventDefault,
      } as unknown as React.KeyboardEvent<HTMLElement>);
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(result.current.parchmentPanelHeight).toBe(800);
  });
});
