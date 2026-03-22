import { useCallback, useEffect, useRef, useState } from 'react';
import { AppCliPanel } from './components/app-cli-panel';
import { HelpDialog } from './components/help-dialog';
import { MapCanvas } from './components/map-canvas';
import { MapSelectionDialog } from './components/map-selection-dialog';
import { SnapToggle } from './components/snap-toggle';
import { ThemeToggle } from './components/theme-toggle';
import { WelcomeDialog } from './components/welcome-dialog';
import { useAppCli } from './hooks/use-app-cli';
import { useMapRouter } from './hooks/use-map-router';
import { useEditorStore } from './state/editor-store';
import { MAP_CANVAS_THEMES, type MapCanvasTheme } from './domain/map-types';
import { searchIfdbGames, viewIfdbGame } from './domain/ifdb-client';
import type { NormalizedIfdbSearchResult } from './domain/ifdb';
import { createLocalFileAssociatedGameMetadata } from './domain/associated-game';

const DESKTOP_ONLY_MIN_WIDTH_PX = 960;
const SHAPES_SOLID_FULL_PATH = 'M288 96C288 78.3 273.7 64 256 64L96 64C78.3 64 64 78.3 64 96L64 256C64 273.7 78.3 288 96 288L256 288C273.7 288 288 273.7 288 256L288 96zM384 64C348.7 64 320 92.7 320 128L320 224C320 259.3 348.7 288 384 288L512 288C547.3 288 576 259.3 576 224L576 128C576 92.7 547.3 64 512 64L384 64zM192 352C174.3 352 160 366.3 160 384L160 544C160 561.7 174.3 576 192 576L448 576C465.7 576 480 561.7 480 544L480 384C480 366.3 465.7 352 448 352L192 352z';
const SQUARE_REGULAR_FULL_PATH = 'M480 144C488.8 144 496 151.2 496 160L496 480C496 488.8 488.8 496 480 496L160 496C151.2 496 144 488.8 144 480L144 160C144 151.2 151.2 144 160 144L480 144zM160 96C124.7 96 96 124.7 96 160L96 480C96 515.3 124.7 544 160 544L480 544C515.3 544 544 515.3 544 480L544 160C544 124.7 515.3 96 480 96L160 96z';
const QUESTION_SOLID_FULL_PATH = 'M224 224C224 171 267 128 320 128C373 128 416 171 416 224C416 266.7 388.1 302.9 349.5 315.4C321.1 324.6 288 350.7 288 392L288 416C288 433.7 302.3 448 320 448C337.7 448 352 433.7 352 416L352 392C352 390.3 352.6 387.9 355.5 384.7C358.5 381.4 363.4 378.2 369.2 376.3C433.5 355.6 480 295.3 480 224C480 135.6 408.4 64 320 64C231.6 64 160 135.6 160 224C160 241.7 174.3 256 192 256C209.7 256 224 241.7 224 224zM320 576C342.1 576 360 558.1 360 536C360 513.9 342.1 496 320 496C297.9 496 280 513.9 280 536C280 558.1 297.9 576 320 576z';
const BEZIER_CURVE_SOLID_FULL_PATH = 'M296 200L296 152L344 152L344 200L296 200zM288 96C261.5 96 240 117.5 240 144L240 148L121.6 148C111.2 126.7 89.3 112 64 112C28.7 112 0 140.7 0 176C0 211.3 28.7 240 64 240C89.3 240 111.2 225.3 121.6 204L188.5 204C129.6 243.6 89.6 309 84.5 384L80 384C53.5 384 32 405.5 32 432L32 496C32 522.5 53.5 544 80 544L144 544C170.5 544 192 522.5 192 496L192 432C192 405.5 170.5 384 144 384L140.7 384C146.6 317 189.2 260.6 248.2 234.9C256.8 247.6 271.4 256 288 256L352 256C368.6 256 383.1 247.6 391.8 234.9C450.8 260.6 493.4 317 499.3 384L496 384C469.5 384 448 405.5 448 432L448 496C448 522.5 469.5 544 496 544L560 544C586.5 544 608 522.5 608 496L608 432C608 405.5 586.5 384 560 384L555.5 384C550.5 309 510.4 243.6 451.5 204L518.4 204C528.8 225.3 550.7 240 576 240C611.3 240 640 211.3 640 176C640 140.7 611.3 112 576 112C550.7 112 528.8 126.7 518.4 148L400 148L400 144C400 117.5 378.5 96 352 96L288 96zM88 440L136 440L136 488L88 488L88 440zM504 488L504 440L552 440L552 488L504 488z';
const WAVE_SQUARE_SOLID_FULL_PATH = 'M128 160C128 142.3 142.3 128 160 128L320 128C337.7 128 352 142.3 352 160L352 448L448 448L448 320C448 302.3 462.3 288 480 288L544 288C561.7 288 576 302.3 576 320C576 337.7 561.7 352 544 352L512 352L512 480C512 497.7 497.7 512 480 512L320 512C302.3 512 288 497.7 288 480L288 192L192 192L192 320C192 337.7 177.7 352 160 352L96 352C78.3 352 64 337.7 64 320C64 302.3 78.3 288 96 288L128 288L128 160z';
const WELCOME_DIALOG_SEEN_STORAGE_KEY = 'fweep-welcome-dialog-seen';
const PARCHMENT_PANEL_WIDTH_STORAGE_KEY = 'fweep-parchment-panel-width';
const PARCHMENT_PANEL_DEFAULT_WIDTH_PX = 420;
const PARCHMENT_PANEL_MIN_WIDTH_PX = 300;
const PARCHMENT_PANEL_MAX_VIEWPORT_RATIO = 0.48;
const PARCHMENT_PANEL_RIGHT_MARGIN_PX = 16;
const PARCHMENT_PANEL_HANDLE_OFFSET_PX = 12;
const PARCHMENT_FOCUS_TOGGLE_SHORTCUT_KEY = 'Slash';
const batImage = new URL('../bat.png', import.meta.url).href;

function isDesktopViewport(): boolean {
  return typeof window === 'undefined' || window.innerWidth >= DESKTOP_ONLY_MIN_WIDTH_PX;
}

function getAppCliLeftOffset(viewportWidth: number, rootFontSizePx: number): number {
  return rootFontSizePx + (viewportWidth * 0.02);
}

function getAppCliStackWidth(viewportWidth: number, rootFontSizePx: number): number {
  const leftOffset = getAppCliLeftOffset(viewportWidth, rootFontSizePx);
  const preferredStackWidth = viewportWidth <= 720
    ? Math.min(viewportWidth * 0.52, rootFontSizePx * 18)
    : Math.min(viewportWidth * 0.375, rootFontSizePx * 27);
  return Math.min(preferredStackWidth, Math.max(viewportWidth - leftOffset - rootFontSizePx, 0));
}

function hasSeenWelcomeDialog(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(WELCOME_DIALOG_SEEN_STORAGE_KEY) === 'true';
}

function markWelcomeDialogSeen(): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(WELCOME_DIALOG_SEEN_STORAGE_KEY, 'true');
}

function isWelcomeHotkeyEnabled(): boolean {
  return import.meta.env?.DEV === true || (globalThis as { __FWEEP_TEST_DEV__?: boolean }).__FWEEP_TEST_DEV__ === true;
}

function getDefaultParchmentPanelWidth(viewportWidth: number): number {
  return clampParchmentPanelWidth(PARCHMENT_PANEL_DEFAULT_WIDTH_PX, viewportWidth);
}

function clampParchmentPanelWidth(width: number, viewportWidth: number): number {
  const maxWidth = Math.max(
    PARCHMENT_PANEL_MIN_WIDTH_PX,
    Math.floor(viewportWidth * PARCHMENT_PANEL_MAX_VIEWPORT_RATIO),
  );
  return Math.min(Math.max(width, PARCHMENT_PANEL_MIN_WIDTH_PX), maxWidth);
}

function loadStoredParchmentPanelWidth(viewportWidth: number): number {
  if (typeof window === 'undefined') {
    return getDefaultParchmentPanelWidth(viewportWidth);
  }

  const rawValue = window.localStorage.getItem(PARCHMENT_PANEL_WIDTH_STORAGE_KEY);
  if (rawValue === null) {
    return getDefaultParchmentPanelWidth(viewportWidth);
  }

  const parsedValue = Number(rawValue);
  if (!Number.isFinite(parsedValue)) {
    return getDefaultParchmentPanelWidth(viewportWidth);
  }

  return clampParchmentPanelWidth(parsedValue, viewportWidth);
}

function persistParchmentPanelWidth(width: number): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(PARCHMENT_PANEL_WIDTH_STORAGE_KEY, String(Math.round(width)));
}

function getNextCanvasTheme(current: MapCanvasTheme): MapCanvasTheme {
  const currentIndex = MAP_CANVAS_THEMES.indexOf(current);
  if (currentIndex < 0) {
    return MAP_CANVAS_THEMES[0];
  }

  return MAP_CANVAS_THEMES[(currentIndex + 1) % MAP_CANVAS_THEMES.length];
}

function buildParchmentSrc(storyUrl: string | null): string {
  if (storyUrl === null) {
    return '/parchment.html';
  }

  const params = new URLSearchParams({
    story: storyUrl,
  });
  return `/parchment.html?${params.toString()}`;
}

type ParchmentWindow = Window & {
  parchment?: {
    load_uploaded_file?: (file: File) => Promise<void> | void;
  };
};

type ParchmentInstance = NonNullable<ParchmentWindow['parchment']>;

function getParchmentInstance(iframeElement: HTMLIFrameElement | null): ParchmentInstance | null {
  const iframeWindow = iframeElement?.contentWindow as ParchmentWindow | null;
  const parchment = iframeWindow?.parchment;
  return parchment !== undefined ? parchment : null;
}

export function App(): React.JSX.Element {
  const { activeMap, loading, openMap, closeMap, routeError } = useMapRouter();
  const loadDocument = useEditorStore((s) => s.loadDocument);
  const unloadDocument = useEditorStore((s) => s.unloadDocument);
  const showGridEnabled = useEditorStore((s) => s.showGridEnabled);
  const useBezierConnectionsEnabled = useEditorStore((s) => s.useBezierConnectionsEnabled);
  const cliOutputCollapsedEnabled = useEditorStore((s) => s.cliOutputCollapsedEnabled);
  const mapVisualStyle = useEditorStore((s) => s.mapVisualStyle);
  const mapCanvasTheme = useEditorStore((s) => s.mapCanvasTheme);
  const toggleShowGrid = useEditorStore((s) => s.toggleShowGrid);
  const toggleUseBezierConnections = useEditorStore((s) => s.toggleUseBezierConnections);
  const toggleCliOutputCollapsed = useEditorStore((s) => s.toggleCliOutputCollapsed);
  const setMapVisualStyle = useEditorStore((s) => s.setMapVisualStyle);
  const setMapCanvasTheme = useEditorStore((s) => s.setMapCanvasTheme);
  const associatedGame = useEditorStore((s) => s.doc?.metadata.associatedGame ?? null);
  const setAssociatedGameMetadata = useEditorStore((s) => s.setAssociatedGameMetadata);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isWelcomeOpen, setIsWelcomeOpen] = useState(false);
  const [pendingWelcomeMapId, setPendingWelcomeMapId] = useState<string | null>(null);
  const [hasDesktopViewport, setHasDesktopViewport] = useState(isDesktopViewport);
  const [parchmentPanelWidth, setParchmentPanelWidth] = useState(() => (
    typeof window === 'undefined'
      ? PARCHMENT_PANEL_DEFAULT_WIDTH_PX
      : loadStoredParchmentPanelWidth(window.innerWidth)
  ));
  const [ifdbSearchQuery, setIfdbSearchQuery] = useState('');
  const [ifdbSearchResults, setIfdbSearchResults] = useState<readonly NormalizedIfdbSearchResult[]>([]);
  const [ifdbSearchError, setIfdbSearchError] = useState<string | null>(null);
  const [isIfdbSearching, setIsIfdbSearching] = useState(false);
  const [loadingIfdbGameTuid, setLoadingIfdbGameTuid] = useState<string | null>(null);
  const [parchmentSrc, setParchmentSrc] = useState(() => buildParchmentSrc(null));
  const [requestedRoomEditorRequest, setRequestedRoomEditorRequest] = useState<import('./hooks/use-app-cli').RoomUiRequest | null>(null);
  const [requestedRoomRevealRequest, setRequestedRoomRevealRequest] = useState<import('./hooks/use-app-cli').RoomUiRequest | null>(null);
  const [requestedViewportFocusRequest, setRequestedViewportFocusRequest] = useState<import('./hooks/use-app-cli').ViewportFocusRequest | null>(null);
  const parchmentIframeRef = useRef<HTMLIFrameElement | null>(null);
  const parchmentDeviceInputRef = useRef<HTMLInputElement | null>(null);
  const lastFocusedFweepElementRef = useRef<HTMLElement | null>(null);
  const syncedParchmentMapIdRef = useRef<string | null>(null);
  const rootFontSizePx = typeof window === 'undefined'
    ? 16
    : Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
  const hasOpenMap = activeMap !== null;
  const parchmentDeviceLinkLabel = associatedGame?.sourceType === 'local-file' && associatedGame.title.trim().length > 0
    ? `Reconnect ${associatedGame.title}`
    : 'Or, click here to play a story file from your device';
  const visibleMapLeftInset = typeof window === 'undefined'
    ? 0
    : getAppCliLeftOffset(window.innerWidth, rootFontSizePx)
      + (cliOutputCollapsedEnabled ? 0 : getAppCliStackWidth(window.innerWidth, rootFontSizePx));
  const visibleMapRightInset = hasOpenMap
    ? parchmentPanelWidth + PARCHMENT_PANEL_RIGHT_MARGIN_PX + PARCHMENT_PANEL_HANDLE_OFFSET_PX
    : 0;
  const {
    cliInputRef,
    cliImportInputRef,
    gameOutputRef,
    cliCommand,
    hasUsedCliInput,
    cliHistory,
    cliHistoryIndex,
    cliHistoryDraft,
    cliSuggestions,
    highlightedCliSuggestionIndex,
    isCliSuggestionMenuOpen,
    gameOutputLines,
    isImportingScript,
    handleCliSubmit,
    handleCliCommandChange,
    handleCliInputFocus,
    handleCliInputBlur,
    handleCliCaretChange,
    toggleCliSuggestions,
    consumeCliSlashFocusSuppression,
    handleCliHistoryNavigate,
    moveCliSuggestionHighlight,
    setCliSuggestionHighlight,
    applyHighlightedCliSuggestion,
    closeCliSuggestions,
    handleImportScriptChange,
    handleGameOutputClick,
    flushDocumentSave,
  } = useAppCli({
    activeMap,
    loadDocument,
    unloadDocument,
    requestedRoomEditorRequest,
    requestedRoomRevealRequest,
    requestedViewportFocusRequest,
    setRequestedRoomEditorRequest,
    setRequestedRoomRevealRequest,
    setRequestedViewportFocusRequest,
  });

  useEffect(() => {
    const updateViewportAvailability = () => {
      setHasDesktopViewport(isDesktopViewport());
      setParchmentPanelWidth((current) => {
        const nextWidth = clampParchmentPanelWidth(current, window.innerWidth);
        if (nextWidth !== current) {
          persistParchmentPanelWidth(nextWidth);
        }
        return nextWidth;
      });
    };

    updateViewportAvailability();
    window.addEventListener('resize', updateViewportAvailability);
    return () => {
      window.removeEventListener('resize', updateViewportAvailability);
    };
  }, []);

  const beginParchmentPanelResize = useCallback((pointerStartX: number) => {
    const startWidth = parchmentPanelWidth;

    const handlePointerMove = (event: PointerEvent): void => {
      const nextWidth = clampParchmentPanelWidth(startWidth + (pointerStartX - event.clientX), window.innerWidth);
      setParchmentPanelWidth(nextWidth);
      persistParchmentPanelWidth(nextWidth);
    };

    const handlePointerUp = (): void => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      document.body.classList.remove('app-shell--resizing-side-panel');
    };

    document.body.classList.add('app-shell--resizing-side-panel');
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }, [parchmentPanelWidth]);

  useEffect(() => () => {
    document.body.classList.remove('app-shell--resizing-side-panel');
  }, []);

  useEffect(() => {
    if (activeMap !== null) {
      return;
    }

    setIsWelcomeOpen(false);
    setPendingWelcomeMapId(null);
    setRequestedRoomEditorRequest(null);
    setRequestedRoomRevealRequest(null);
    setRequestedViewportFocusRequest(null);
  }, [activeMap]);

  useEffect(() => {
    if (activeMap === null || pendingWelcomeMapId === null || activeMap.metadata.id !== pendingWelcomeMapId) {
      return;
    }

    markWelcomeDialogSeen();
    setPendingWelcomeMapId(null);
    setIsWelcomeOpen(true);
  }, [activeMap, pendingWelcomeMapId]);

  const handleRequestedRoomEditorHandled = useCallback((requestId: number) => {
    setRequestedRoomEditorRequest((current) => current?.requestId === requestId ? null : current);
  }, []);

  const handleRequestedRoomRevealHandled = useCallback((requestId: number) => {
    setRequestedRoomRevealRequest((current) => current?.requestId === requestId ? null : current);
  }, []);

  const handleRequestedViewportFocusHandled = useCallback((requestId: number) => {
    setRequestedViewportFocusRequest((current) => current?.requestId === requestId ? null : current);
  }, []);

  const handleIfdbSearchSubmit = useCallback(async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();

    const trimmedQuery = ifdbSearchQuery.trim();
    if (trimmedQuery.length === 0) {
      setIfdbSearchResults([]);
      setIfdbSearchError(null);
      return;
    }

    setIsIfdbSearching(true);
    setIfdbSearchError(null);

    try {
      const results = await searchIfdbGames(trimmedQuery);
      setIfdbSearchResults(results);
    } catch (error) {
      setIfdbSearchResults([]);
      setIfdbSearchError(error instanceof Error ? error.message : 'IFDB search failed.');
    } finally {
      setIsIfdbSearching(false);
    }
  }, [ifdbSearchQuery]);

  const handleIfdbGameSelected = useCallback(async (tuid: string): Promise<void> => {
    setLoadingIfdbGameTuid(tuid);
    setIfdbSearchError(null);

    try {
      const resolvedGame = await viewIfdbGame(tuid);
      if (resolvedGame.storyUrl === null) {
        setIfdbSearchError(`No supported downloadable story file is available for ${resolvedGame.title}.`);
        return;
      }

      setAssociatedGameMetadata(resolvedGame);
    } catch (error) {
      setIfdbSearchError(error instanceof Error ? error.message : 'IFDB game lookup failed.');
    } finally {
      setLoadingIfdbGameTuid(null);
    }
  }, [setAssociatedGameMetadata]);

  useEffect(() => {
    const activeMapId = activeMap?.metadata.id ?? null;
    const hasSwitchedMaps = syncedParchmentMapIdRef.current !== activeMapId;
    syncedParchmentMapIdRef.current = activeMapId;

    if (activeMapId === null) {
      setParchmentSrc(buildParchmentSrc(null));
      return;
    }

    if (associatedGame?.sourceType === 'ifdb' && associatedGame.storyUrl !== null) {
      setParchmentSrc(buildParchmentSrc(associatedGame.storyUrl));
      return;
    }

    if (hasSwitchedMaps) {
      setParchmentSrc(buildParchmentSrc(null));
    }
  }, [activeMap?.metadata.id, associatedGame?.sourceType, associatedGame?.storyUrl]);

  const handleOpenParchmentFileChooser = useCallback((): void => {
    parchmentDeviceInputRef.current?.click();
  }, []);

  const handleParchmentDeviceFileChange = useCallback(async (
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const selectedFile = event.target.files?.[0] ?? null;
    event.target.value = '';

    if (selectedFile === null) {
      return;
    }

    const parchment = getParchmentInstance(parchmentIframeRef.current);
    if (parchment === null || typeof parchment.load_uploaded_file !== 'function') {
      setIfdbSearchError('Parchment is not ready to open a local file yet.');
      return;
    }

    setIfdbSearchError(null);

    try {
      await parchment.load_uploaded_file(selectedFile);
      setAssociatedGameMetadata(createLocalFileAssociatedGameMetadata(selectedFile));
    } catch (error) {
      setIfdbSearchError(error instanceof Error ? error.message : 'Opening the local story file failed.');
    }
  }, [setAssociatedGameMetadata]);

  const focusFweepMain = useCallback((): void => {
    window.focus();

    const lastFocusedElement = lastFocusedFweepElementRef.current;
    if (
      lastFocusedElement !== null
      && lastFocusedElement.isConnected
      && lastFocusedElement !== parchmentIframeRef.current
    ) {
      lastFocusedElement.focus();
      return;
    }

    const mapCanvasElement = document.querySelector('[data-testid="map-canvas"]');
    if (mapCanvasElement instanceof HTMLElement) {
      mapCanvasElement.focus();
      return;
    }

    cliInputRef.current?.focus();
  }, [cliInputRef]);

  const focusParchmentPanel = useCallback((): void => {
    const iframeElement = parchmentIframeRef.current;
    if (iframeElement === null) {
      return;
    }

    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && activeElement !== iframeElement) {
      lastFocusedFweepElementRef.current = activeElement;
    }

    iframeElement.focus();
    iframeElement.contentWindow?.focus();
  }, []);

  const handleParchmentFocusToggle = useCallback((event: KeyboardEvent): void => {
    if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.code !== PARCHMENT_FOCUS_TOGGLE_SHORTCUT_KEY) {
      return;
    }

    event.preventDefault();
    focusFweepMain();
  }, [focusFweepMain]);

  useEffect(() => {
    const handleFocusIn = (event: FocusEvent): void => {
      if (!(event.target instanceof HTMLElement) || event.target === parchmentIframeRef.current) {
        return;
      }

      lastFocusedFweepElementRef.current = event.target;
    };

    document.addEventListener('focusin', handleFocusIn);
    return () => {
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, []);

  useEffect(() => {
    if (!hasOpenMap) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (!event.ctrlKey || event.altKey || event.metaKey || event.shiftKey || event.code !== PARCHMENT_FOCUS_TOGGLE_SHORTCUT_KEY) {
        return;
      }

      event.preventDefault();

      if (document.activeElement === parchmentIframeRef.current) {
        focusFweepMain();
        return;
      }

      focusParchmentPanel();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [focusFweepMain, focusParchmentPanel, hasOpenMap]);

  useEffect(() => {
    if (!hasOpenMap) {
      return;
    }

    const iframeElement = parchmentIframeRef.current;
    if (iframeElement === null) {
      return;
    }

    let cleanup: (() => void) | null = null;

    const registerParchmentShortcut = (): void => {
      cleanup?.();

      const iframeWindow = iframeElement.contentWindow;
      const iframeDocument = iframeElement.contentDocument;
      if (iframeWindow === null || iframeDocument === null) {
        return;
      }

      iframeWindow.addEventListener('keydown', handleParchmentFocusToggle, true);
      iframeDocument.addEventListener('keydown', handleParchmentFocusToggle, true);
      cleanup = () => {
        iframeWindow.removeEventListener('keydown', handleParchmentFocusToggle, true);
        iframeDocument.removeEventListener('keydown', handleParchmentFocusToggle, true);
      };
    };

    iframeElement.addEventListener('load', registerParchmentShortcut);
    registerParchmentShortcut();

    return () => {
      iframeElement.removeEventListener('load', registerParchmentShortcut);
      cleanup?.();
    };
  }, [handleParchmentFocusToggle, hasOpenMap]);

  useEffect(() => {
    if (!isHelpOpen && !isWelcomeOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (isWelcomeOpen) {
          setIsWelcomeOpen(false);
          return;
        }

        setIsHelpOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isHelpOpen, isWelcomeOpen]);

  useEffect(() => {
    if (!isWelcomeHotkeyEnabled()) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey || event.key.toLowerCase() !== 'w') {
        return;
      }

      event.preventDefault();
      setIsHelpOpen(false);
      setIsWelcomeOpen(true);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleMapSelected = useCallback(async (doc: Parameters<typeof openMap>[0], _reason: 'create' | 'open' | 'import') => {
    await flushDocumentSave();

    if (!hasSeenWelcomeDialog()) {
      setPendingWelcomeMapId(doc.metadata.id);
    } else {
      setPendingWelcomeMapId(null);
    }

    openMap(doc);
  }, [flushDocumentSave, openMap]);

  const handleCloseMap = useCallback(async () => {
    await flushDocumentSave();
    closeMap();
  }, [closeMap, flushDocumentSave]);

  if (!hasDesktopViewport) {
    return (
      <main className="app-shell app-shell--desktop-only">
        <section className="desktop-only-panel" aria-labelledby="desktop-only-title">
          <div className="desktop-only-art" aria-hidden="true">
            <img className="desktop-only-art-image" src={batImage} alt="" />
          </div>
          <div className="desktop-only-copy">
            <p className="desktop-only-eyebrow">Too Small For Mapping</p>
            <h1 id="desktop-only-title" className="desktop-only-title">Optimized for desktop</h1>
            <p className="desktop-only-body">
              fweep works best on a wider screen. Please come back on a desktop or laptop to create and edit maps.
            </p>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell" data-canvas-theme={hasOpenMap ? mapCanvasTheme : undefined}>
      {hasOpenMap && (
        <>
          <div className="app-left-rail-backdrop" aria-hidden="true" />
          <AppCliPanel
            gameOutputRef={gameOutputRef}
            gameOutputLines={gameOutputLines}
            onGameOutputClick={handleGameOutputClick}
            cliInputRef={cliInputRef}
            cliImportInputRef={cliImportInputRef}
            cliCommand={cliCommand}
            hasUsedCliInput={hasUsedCliInput}
            cliHistory={cliHistory}
            cliHistoryIndex={cliHistoryIndex}
            cliHistoryDraft={cliHistoryDraft}
            cliSuggestions={cliSuggestions}
            highlightedCliSuggestionIndex={highlightedCliSuggestionIndex}
            isSuggestionMenuOpen={isCliSuggestionMenuOpen}
            isOutputCollapsed={cliOutputCollapsedEnabled}
            isImportingScript={isImportingScript}
            onSubmit={handleCliSubmit}
            onCliCommandChange={handleCliCommandChange}
            onCliInputFocus={handleCliInputFocus}
            onCliInputBlur={handleCliInputBlur}
            onCliCaretChange={handleCliCaretChange}
            onToggleSuggestions={toggleCliSuggestions}
            consumeCliSlashFocusSuppression={consumeCliSlashFocusSuppression}
            onCliHistoryNavigate={handleCliHistoryNavigate}
            onCliSuggestionHighlightMove={moveCliSuggestionHighlight}
            onCliSuggestionHighlightSet={setCliSuggestionHighlight}
            onAcceptHighlightedSuggestion={applyHighlightedCliSuggestion}
            onCloseSuggestions={closeCliSuggestions}
            onToggleOutputCollapsed={toggleCliOutputCollapsed}
            onImportScriptChange={handleImportScriptChange}
          />
          <div
            className="app-control-chip app-map-name-chip app-control-chip--plain"
            aria-label={`Map name: ${activeMap.metadata.name}`}
          >
            <span className="app-map-name-chip__map-title">{`Map: ${activeMap.metadata.name}`}</span>
            {associatedGame?.title ? (
              <span className="app-map-name-chip__game-title">{associatedGame.title}</span>
            ) : null}
          </div>
        </>
      )}
      {hasOpenMap && (
        <>
          <div className="app-controls app-controls--settings">
            <button
              type="button"
              className="app-control-button app-control-button--plain"
              aria-label="Back to maps"
              title="Back to maps"
              onClick={() => {
                void handleCloseMap();
              }}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <path d="M9.5 3.5 5 8l4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5.5 8H13" strokeLinecap="round" />
              </svg>
            </button>
            <button
              type="button"
              className="app-control-button"
              aria-label="Toggle grid"
              title="Toggle grid"
              aria-pressed={showGridEnabled}
              onClick={toggleShowGrid}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <line x1="0" y1="4" x2="16" y2="4" />
                <line x1="0" y1="8" x2="16" y2="8" />
                <line x1="0" y1="12" x2="16" y2="12" />
                <line x1="4" y1="0" x2="4" y2="16" />
                <line x1="8" y1="0" x2="8" y2="16" />
                <line x1="12" y1="0" x2="12" y2="16" />
              </svg>
            </button>
            <button
              type="button"
              className="app-control-button"
              aria-label={useBezierConnectionsEnabled ? 'Toggle straight connections' : 'Toggle curved connections'}
              title={useBezierConnectionsEnabled ? 'Toggle straight connections' : 'Toggle curved connections'}
              aria-pressed={!useBezierConnectionsEnabled}
              onClick={toggleUseBezierConnections}
            >
              <svg width="16" height="16" viewBox="0 0 640 640" fill="currentColor" aria-hidden="true">
                <path d={useBezierConnectionsEnabled ? WAVE_SQUARE_SOLID_FULL_PATH : BEZIER_CURVE_SOLID_FULL_PATH} />
              </svg>
            </button>
            <SnapToggle />
            <button
              type="button"
              className="app-control-button"
              aria-label="Toggle map visual style"
              title="Toggle map visual style"
              aria-pressed={mapVisualStyle === 'square-classic'}
              onClick={() => setMapVisualStyle(mapVisualStyle === 'default' ? 'square-classic' : 'default')}
            >
              <svg width="16" height="16" viewBox="0 0 640 640" fill="currentColor" aria-hidden="true">
                <path d={mapVisualStyle === 'square-classic' ? SHAPES_SOLID_FULL_PATH : SQUARE_REGULAR_FULL_PATH} />
              </svg>
            </button>
            <button
              type="button"
              className="app-control-button"
              aria-label={`Cycle canvas theme (current: ${mapCanvasTheme})`}
              title={`Cycle canvas theme (current: ${mapCanvasTheme})`}
              onClick={() => setMapCanvasTheme(getNextCanvasTheme(mapCanvasTheme))}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
                <path d="M3 2.5h8.5a2 2 0 0 1 2 2V12a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 12V3a.5.5 0 0 1 .5-.5Z" />
                <path d="M5 6.25c1 .7 2 .7 3 0s2-.7 3 0" />
                <path d="M5 9c1 .7 2 .7 3 0s2-.7 3 0" />
              </svg>
            </button>
            <ThemeToggle />
            <button
              type="button"
              className="app-control-button"
              aria-label="Help"
              title="Help"
              onClick={() => setIsHelpOpen(true)}
            >
              <svg width="16" height="16" viewBox="0 0 640 640" fill="currentColor" aria-hidden="true">
                <path d={QUESTION_SOLID_FULL_PATH} />
              </svg>
            </button>
          </div>
          <h1 className="app-title" style={{ right: `${Math.max(16, visibleMapRightInset)}px` }}>fweep</h1>
          <div
            className="app-parchment-panel"
            style={{ width: `${parchmentPanelWidth}px` }}
          >
            <div
              className="app-parchment-panel__resize-handle"
              role="separator"
              aria-orientation="vertical"
              aria-label="Resize game panel"
              tabIndex={0}
              onPointerDown={(event) => {
                event.preventDefault();
                beginParchmentPanelResize(event.clientX);
              }}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') {
                  return;
                }

                event.preventDefault();
                const delta = event.key === 'ArrowLeft' ? 32 : -32;
                const nextWidth = clampParchmentPanelWidth(parchmentPanelWidth + delta, window.innerWidth);
                setParchmentPanelWidth(nextWidth);
                persistParchmentPanelWidth(nextWidth);
              }}
            />
            <div className="app-parchment-panel__frame">
              <div className="app-parchment-panel__header">
                <a
                  href="https://github.com/curiousdannii/parchment"
                  target="_blank"
                  rel="noreferrer"
                >
                  PARCHMENT by Dannii Willis
                </a>
              </div>
              <form className="app-parchment-panel__search" onSubmit={(event) => { void handleIfdbSearchSubmit(event); }}>
                <label className="app-parchment-panel__search-label" htmlFor="app-ifdb-search">
                  Search IFDB for a game
                </label>
                <div className="app-parchment-panel__search-row">
                  <input
                    id="app-ifdb-search"
                    className="app-parchment-panel__search-input"
                    type="text"
                    value={ifdbSearchQuery}
                    onChange={(event) => {
                      setIfdbSearchQuery(event.target.value);
                    }}
                  />
                  <button type="submit" className="app-parchment-panel__search-button" disabled={isIfdbSearching}>
                    {isIfdbSearching ? 'Searching...' : 'Search'}
                  </button>
                </div>
                <button
                  type="button"
                  className="app-parchment-panel__device-link"
                  onClick={handleOpenParchmentFileChooser}
                >
                  {parchmentDeviceLinkLabel}
                </button>
                <input
                  ref={parchmentDeviceInputRef}
                  className="app-parchment-panel__device-input"
                  type="file"
                  tabIndex={-1}
                  onChange={(event) => {
                    void handleParchmentDeviceFileChange(event);
                  }}
                />
                {ifdbSearchError ? (
                  <p className="app-parchment-panel__search-status" role="alert">{ifdbSearchError}</p>
                ) : null}
                {ifdbSearchResults.length > 0 ? (
                  <div className="app-parchment-panel__results" aria-label="IFDB search results">
                    {ifdbSearchResults.map((result) => (
                      <article key={result.tuid} className="app-parchment-panel__result">
                        {result.coverArtUrl ? (
                          <img
                            className="app-parchment-panel__result-cover"
                            src={result.coverArtUrl}
                            alt={`Cover art for ${result.title}`}
                          />
                        ) : null}
                        <h2 className="app-parchment-panel__result-title">
                          <button
                            type="button"
                            className="app-parchment-panel__result-button"
                            aria-label={`Play ${result.title}`}
                            disabled={loadingIfdbGameTuid === result.tuid}
                            onClick={() => {
                              void handleIfdbGameSelected(result.tuid);
                            }}
                          >
                            {loadingIfdbGameTuid === result.tuid ? `Loading ${result.title}...` : result.title}
                          </button>
                        </h2>
                        <p className="app-parchment-panel__result-meta">
                          {result.author ?? 'Unknown author'}
                        </p>
                        {result.publishedDisplay ? (
                          <p className="app-parchment-panel__result-meta">{result.publishedDisplay}</p>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : null}
              </form>
              <iframe
                ref={parchmentIframeRef}
                className="app-parchment-panel__iframe"
                src={parchmentSrc}
                title="Interactive fiction player"
              />
            </div>
          </div>
        </>
      )}
      <HelpDialog isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      <WelcomeDialog isOpen={isWelcomeOpen} onClose={() => setIsWelcomeOpen(false)} />
      {loading ? null : activeMap === null ? (
        <MapSelectionDialog
          onMapSelected={(doc, reason) => {
            void handleMapSelected(doc, reason);
          }}
          initialError={routeError}
        />
      ) : (
        <MapCanvas
          mapName={activeMap.metadata.name}
          onBack={() => {
            void handleCloseMap();
          }}
          visibleMapLeftInset={visibleMapLeftInset}
          visibleMapRightInset={visibleMapRightInset}
          requestedRoomEditorRequest={requestedRoomEditorRequest}
          requestedRoomRevealRequest={requestedRoomRevealRequest}
          requestedViewportFocusRequest={requestedViewportFocusRequest}
          onRequestedRoomEditorHandled={handleRequestedRoomEditorHandled}
          onRequestedRoomRevealHandled={handleRequestedRoomRevealHandled}
          onRequestedViewportFocusHandled={handleRequestedViewportFocusHandled}
        />
      )}
    </main>
  );
}
