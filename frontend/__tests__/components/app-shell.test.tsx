import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createEmptyMap } from '../../src/domain/map-types';
import { useEditorStore } from '../../src/state/editor-store';

const mockOpenMap = jest.fn<(doc: ReturnType<typeof createEmptyMap>) => void>();
const mockCloseMap = jest.fn<() => void>();
const mockSubmitCliCommandText = jest.fn<(command: string, options: {
  clearInputState?: boolean;
  selectCliInput?: boolean;
  onOutputAppended?: (lines: readonly string[]) => void;
}) => void>();
const mockFlushDocumentSave = jest.fn<() => Promise<void>>();
const mockBeginParchmentPanelCornerResize = jest.fn<(
  pointerId: number,
  clientX: number,
  clientY: number,
  edge: 'left' | 'right',
) => void>();
const mockHandleParchmentPanelCornerResizeKeyDown = jest.fn<(event: KeyboardEvent, edge: 'left' | 'right') => void>();
const mockHandleResetParchmentPanel = jest.fn<() => void>();
const mockHandleOpenParchmentFileChooser = jest.fn<() => void>();
const mockStartIfdbProxyHeartbeat = jest.fn<(ping: () => Promise<void>, target: Window) => () => void>();
const mockPingIfdbProxy = jest.fn<() => Promise<void>>();

let mockActiveMap = createEmptyMap('Mock Map');
let mockRouteError: string | null = null;
let mockIframeContentDocument: Document | null = null;
let mockParchmentGameViewVisible = false;

const iframeWindowMock = {
  postMessage: jest.fn<(message: unknown, targetOrigin: string) => void>(),
};

await jest.unstable_mockModule('../../src/components/help-dialog', async () => {
  const React = await import('react');
  return {
    HelpDialog: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => (
      isOpen ? (
        <div role="dialog" aria-modal="true" aria-label="Help">
          <button type="button" onClick={onClose}>Close help</button>
        </div>
      ) : null
    ),
  };
});

await jest.unstable_mockModule('../../src/components/welcome-dialog', async () => {
  const React = await import('react');
  return {
    WelcomeDialog: ({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) => (
      isOpen ? (
        <div role="dialog" aria-modal="true" aria-label="Welcome">
          <button type="button" onClick={onClose}>Close welcome</button>
        </div>
      ) : null
    ),
  };
});

await jest.unstable_mockModule('../../src/components/tips-dialog', async () => {
  const React = await import('react');
  return {
    STARTUP_TIPS: [{ title: 'One', description: 'Tip one' }, { title: 'Two', description: 'Tip two' }],
    TipsDialog: ({
      isOpen,
      onClose,
    }: {
      initialTipIndex: number;
      isOpen: boolean;
      onTipIndexChange: (index: number) => void;
      onClose: (index: number) => void;
      showTipsOnStartup: boolean;
      onShowTipsOnStartupChange: (enabled: boolean) => void;
    }) => (
      isOpen ? (
        <div role="dialog" aria-modal="true" aria-label="Tips">
          <button type="button" onClick={() => onClose(1)}>Close tips</button>
        </div>
      ) : null
    ),
  };
});

await jest.unstable_mockModule('../../src/components/map-canvas', async () => {
  const React = await import('react');
  return {
    MapCanvas: ({
      onBack,
    }: {
      mapName: string;
      actionsContainer: HTMLDivElement | null;
      onBack: () => void;
      visibleMapLeftInset: number;
      visibleMapRightInset: number;
      selectionFocusRightInset: number;
      requestedRoomEditorRequest: unknown;
      requestedRoomRevealRequest: unknown;
      requestedViewportFocusRequest: unknown;
      requestedMapZoomRequest: unknown;
      onRequestedRoomEditorHandled: (requestId: number) => void;
      onRequestedRoomRevealHandled: (requestId: number) => void;
      onRequestedViewportFocusHandled: (requestId: number) => void;
      onRequestedMapZoomHandled: (requestId: number) => void;
    }) => (
      <div>
        <div data-testid="map-canvas" tabIndex={-1}>Map canvas</div>
        <button type="button" onClick={onBack}>Back from canvas</button>
      </div>
    ),
  };
});

await jest.unstable_mockModule('../../src/components/map-selection-dialog', async () => {
  const React = await import('react');
  return {
    MapSelectionDialog: ({ initialError }: { initialError: string | null }) => (
      <div role="dialog" aria-label="Choose a map">
        {initialError ? <div role="alert">{initialError}</div> : null}
      </div>
    ),
  };
});

await jest.unstable_mockModule('../../src/components/parchment-sidebar', async () => {
  const React = await import('react');

  function MockParchmentSidebar(props: {
    deviceInputRef: { current: HTMLInputElement | null };
    iframeRef: { current: HTMLIFrameElement | null };
    searchInputRef: { current: HTMLInputElement | null };
    onCornerResizePointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
    onCornerResizeKeyDown: (event: React.KeyboardEvent<HTMLButtonElement>) => void;
  }): React.JSX.Element {
    React.useEffect(() => {
      const iframe = document.createElement('iframe');
      iframe.title = 'Interactive fiction player';
      Object.defineProperty(iframe, 'contentWindow', {
        configurable: true,
        value: iframeWindowMock,
      });
      Object.defineProperty(iframe, 'contentDocument', {
        configurable: true,
        value: mockIframeContentDocument,
      });
      props.iframeRef.current = iframe;
      props.searchInputRef.current = document.createElement('input');
      props.deviceInputRef.current = document.createElement('input');

      return () => {
        props.iframeRef.current = null;
        props.searchInputRef.current = null;
        props.deviceInputRef.current = null;
      };
    }, [props.deviceInputRef, props.iframeRef, props.searchInputRef]);

    return (
      <div>
        <button type="button" aria-label="Resize game panel" onPointerDown={props.onCornerResizePointerDown} onKeyDown={props.onCornerResizeKeyDown}>
          Corner
        </button>
      </div>
    );
  }

  return { ParchmentSidebar: MockParchmentSidebar };
});

await jest.unstable_mockModule('../../src/components/snap-toggle', async () => {
  const React = await import('react');
  return { SnapToggle: () => <button type="button">Snap toggle</button> };
});

await jest.unstable_mockModule('../../src/components/theme-toggle', async () => {
  const React = await import('react');
  return { ThemeToggle: () => <button type="button">Theme toggle</button> };
});

await jest.unstable_mockModule('../../src/hooks/use-app-cli', () => ({
  useAppCli: () => ({
    submitCliCommandText: mockSubmitCliCommandText,
    flushDocumentSave: mockFlushDocumentSave,
  }),
}));

await jest.unstable_mockModule('../../src/hooks/use-map-router', () => ({
  useMapRouter: () => ({
    activeMap: mockActiveMap,
    loading: false,
    openMap: mockOpenMap,
    closeMap: mockCloseMap,
    routeError: mockRouteError,
  }),
}));

await jest.unstable_mockModule('../../src/hooks/use-parchment-focus-toggle', () => ({
  useParchmentFocusToggle: () => undefined,
}));

await jest.unstable_mockModule('../../src/hooks/use-parchment-panel', () => ({
  useParchmentPanel: () => ({
    parchmentPanelWidth: 420,
    parchmentPanelHeight: 280,
    ifdbSearchQuery: '',
    ifdbSearchResults: [],
    ifdbSearchError: null,
    isIfdbSearching: false,
    loadingIfdbGameTuid: null,
    parchmentSrc: '/parchment.html',
    isParchmentGameViewVisible: mockParchmentGameViewVisible,
    deviceLinkLabel: 'Choose file',
    setIfdbSearchQuery: jest.fn<(value: string) => void>(),
    beginParchmentPanelCornerResize: mockBeginParchmentPanelCornerResize,
    handleParchmentPanelCornerResizeKeyDown: mockHandleParchmentPanelCornerResizeKeyDown,
    handleIfdbSearchSubmit: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    handleIfdbAuthorSearch: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    handleIfdbGameSelected: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    handleOpenParchmentFileChooser: mockHandleOpenParchmentFileChooser,
    handlePlayDefaultStory: jest.fn<() => void>(),
    handleParchmentDeviceFileChange: jest.fn<() => Promise<void>>().mockResolvedValue(undefined),
    handleResetParchmentPanel: mockHandleResetParchmentPanel,
    handleParchmentIframeLoad: jest.fn<() => void>(),
  }),
}));

await jest.unstable_mockModule('../../src/domain/ifdb-client', () => ({
  pingIfdbProxy: mockPingIfdbProxy,
}));

await jest.unstable_mockModule('../../src/domain/ifdb-proxy-heartbeat', () => ({
  startIfdbProxyHeartbeat: mockStartIfdbProxyHeartbeat,
}));

const { App } = await import('../../src/app');

function createParchmentTranscriptDocument(): Document {
  const transcriptDocument = document.implementation.createHTMLDocument('parchment');
  const bufferWindow = transcriptDocument.createElement('div');
  bufferWindow.className = 'BufferWindow';
  Object.defineProperty(bufferWindow, 'scrollHeight', {
    configurable: true,
    writable: true,
    value: 320,
  });
  Object.defineProperty(bufferWindow, 'scrollTop', {
    configurable: true,
    writable: true,
    value: 0,
  });

  const bufferInner = transcriptDocument.createElement('div');
  bufferInner.className = 'BufferWindowInner';

  const promptLine = transcriptDocument.createElement('div');
  promptLine.className = 'BufferLine';
  promptLine.setAttribute('data-testid', 'prompt-line');

  const lineInput = transcriptDocument.createElement('textarea');
  lineInput.className = 'LineInput';
  promptLine.appendChild(lineInput);

  bufferInner.appendChild(promptLine);
  bufferWindow.appendChild(bufferInner);
  transcriptDocument.body.appendChild(bufferWindow);
  return transcriptDocument;
}

function dispatchParchmentMessage(data: unknown, origin = window.location.origin, source: MessageEventSource | null = iframeWindowMock as unknown as MessageEventSource): void {
  act(() => {
    window.dispatchEvent(new MessageEvent('message', { data, origin, source }));
  });
}

beforeEach(() => {
  jest.restoreAllMocks();
  window.localStorage.clear();
  window.localStorage.setItem('fweep-welcome-dialog-seen', 'true');
  window.localStorage.setItem('fweep-startup-tips-enabled', 'false');
  useEditorStore.setState(useEditorStore.getInitialState());
  mockActiveMap = createEmptyMap('Mock Map');
  mockRouteError = null;
  mockIframeContentDocument = null;
  mockParchmentGameViewVisible = false;
  mockOpenMap.mockReset();
  mockCloseMap.mockReset();
  mockSubmitCliCommandText.mockReset();
  mockFlushDocumentSave.mockReset().mockResolvedValue(undefined);
  mockBeginParchmentPanelCornerResize.mockReset();
  mockHandleParchmentPanelCornerResizeKeyDown.mockReset();
  mockHandleResetParchmentPanel.mockReset();
  mockHandleOpenParchmentFileChooser.mockReset();
  mockStartIfdbProxyHeartbeat.mockReset().mockReturnValue(() => undefined);
  mockPingIfdbProxy.mockReset().mockResolvedValue(undefined);
  iframeWindowMock.postMessage.mockReset();
});

describe('App shell wiring', () => {
  it('mirrors parchment CLI output into the transcript when the iframe document is available', async () => {
    mockIframeContentDocument = createParchmentTranscriptDocument();
    mockSubmitCliCommandText.mockImplementation((_command, options) => {
      options.onOutputAppended?.(['>look', '**Mapped**', '']);
    });
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });

    render(<App />);

    dispatchParchmentMessage({
      type: 'fweep:submit-cli-from-parchment',
      command: 'look',
      rawInput: 'l',
    });

    await waitFor(() => {
      expect(mockSubmitCliCommandText).toHaveBeenCalledWith('look', expect.objectContaining({
        clearInputState: false,
        selectCliInput: false,
      }));
    });

    const transcriptLines = Array.from(
      mockIframeContentDocument.querySelectorAll('.fweep-cli-output-line'),
    ).map((line) => line.textContent);
    expect(transcriptLines).toEqual(['>l', 'Mapped', '\u00A0', '\u00A0']);
    expect(mockIframeContentDocument.querySelector('.fweep-cli-output-text--strong')?.textContent).toBe('Mapped');
    expect(mockIframeContentDocument.querySelector('[data-testid="prompt-line"]')?.previousElementSibling?.textContent).toBe('\u00A0');
    expect(iframeWindowMock.postMessage).toHaveBeenCalledWith(
      { type: 'fweep:restore-game-input-focus' },
      window.location.origin,
    );
    expect(iframeWindowMock.postMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: 'fweep:append-cli-output' }),
      window.location.origin,
    );
  });

  it('falls back to postMessage output mirroring when the parchment transcript is unavailable', async () => {
    mockSubmitCliCommandText.mockImplementation((_command, options) => {
      options.onOutputAppended?.(['>look', 'You can see here.']);
    });
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });

    render(<App />);

    dispatchParchmentMessage({
      type: 'fweep:submit-cli-from-parchment',
      command: 'look',
      rawInput: 'l',
    });

    await waitFor(() => {
      expect(iframeWindowMock.postMessage).toHaveBeenCalledWith(
        { type: 'fweep:append-cli-output', lines: ['>l', 'You can see here.'] },
        window.location.origin,
      );
    });
    expect(iframeWindowMock.postMessage).toHaveBeenCalledWith(
      { type: 'fweep:restore-game-input-focus' },
      window.location.origin,
    );
  });

  it('restores focus to the map canvas when parchment asks for CLI focus back', async () => {
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });

    render(<App />);
    const mapCanvas = screen.getByTestId('map-canvas');
    const focusSpy = jest.spyOn(mapCanvas, 'focus');

    dispatchParchmentMessage({ type: 'fweep:restore-cli-focus' });

    await waitFor(() => {
      expect(focusSpy).toHaveBeenCalled();
    });
  });

  it('ignores parchment messages from other origins or unrelated sources', async () => {
    render(<App />);

    dispatchParchmentMessage(
      { type: 'fweep:request-cli-suggestions', command: 'sh', caretPosition: 2 },
      'https://example.com',
    );
    dispatchParchmentMessage(
      { type: 'fweep:request-cli-suggestions', command: 'sh', caretPosition: 2 },
      window.location.origin,
      window as unknown as MessageEventSource,
    );

    await waitFor(() => {
      expect(iframeWindowMock.postMessage).not.toHaveBeenCalled();
    });
  });

  it('handles app-level keyboard shortcuts for map toggles, back, and story file chooser', async () => {
    render(<App />);

    const initialShowGrid = useEditorStore.getState().showGridEnabled;
    const initialUseBezierConnections = useEditorStore.getState().useBezierConnectionsEnabled;
    const initialSnapToGrid = useEditorStore.getState().snapToGridEnabled;
    const initialMapVisualStyle = useEditorStore.getState().mapVisualStyle;
    const initialMapCanvasTheme = useEditorStore.getState().mapCanvasTheme;

    fireEvent.keyDown(window, { key: 'g', code: 'KeyG', altKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: 'c', code: 'KeyC', altKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: 's', code: 'KeyS', altKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: 'v', code: 'KeyV', altKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: 'y', code: 'KeyY', altKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: 'f', code: 'KeyF', altKey: true, shiftKey: true });
    fireEvent.keyDown(window, { key: 'm', code: 'KeyM', altKey: true, shiftKey: true });

    expect(useEditorStore.getState().showGridEnabled).toBe(!initialShowGrid);
    expect(useEditorStore.getState().useBezierConnectionsEnabled).toBe(!initialUseBezierConnections);
    expect(useEditorStore.getState().snapToGridEnabled).toBe(!initialSnapToGrid);
    expect(useEditorStore.getState().mapVisualStyle).not.toBe(initialMapVisualStyle);
    expect(useEditorStore.getState().mapCanvasTheme).not.toBe(initialMapCanvasTheme);
    expect(mockHandleOpenParchmentFileChooser).toHaveBeenCalled();
    await waitFor(() => {
      expect(mockFlushDocumentSave).toHaveBeenCalled();
      expect(mockCloseMap).toHaveBeenCalled();
    });
  });

  it('routes the reset-game shortcut only when the game view is visible', () => {
    mockParchmentGameViewVisible = true;
    render(<App />);

    fireEvent.keyDown(window, { key: 'r', code: 'KeyR', altKey: true, shiftKey: true });

    expect(mockHandleResetParchmentPanel).toHaveBeenCalled();
    expect(mockHandleOpenParchmentFileChooser).not.toHaveBeenCalled();
  });

  it('forwards parchment resize pointer and keyboard handlers from the shell', () => {
    render(<App />);

    const cornerHandle = screen.getByRole('button', { name: /resize game panel/i });
    const setPointerCapture = jest.fn<(pointerId: number) => void>();
    Object.defineProperty(cornerHandle, 'setPointerCapture', {
      configurable: true,
      value: setPointerCapture,
    });

    const cornerPointerDown = new Event('pointerdown', { bubbles: true, cancelable: true });
    Object.defineProperties(cornerPointerDown, {
      pointerId: { configurable: true, value: 7 },
      clientX: { configurable: true, value: 360 },
      clientY: { configurable: true, value: 280 },
    });
    fireEvent(cornerHandle, cornerPointerDown);
    fireEvent.keyDown(cornerHandle, { key: 'ArrowUp' });

    expect(setPointerCapture).toHaveBeenCalledWith(7);
    expect(mockBeginParchmentPanelCornerResize).toHaveBeenCalledWith(7, 360, 280, 'left');
    expect(mockHandleParchmentPanelCornerResizeKeyDown).toHaveBeenCalledWith(expect.any(Object), 'left');
  });
});
