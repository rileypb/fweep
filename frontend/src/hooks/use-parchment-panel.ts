import { useCallback, useEffect, useRef, useState } from 'react';
import { createLocalFileAssociatedGameMetadata } from '../domain/associated-game';
import { searchIfdbGames, viewIfdbGame } from '../domain/ifdb-client';
import type { NormalizedIfdbSearchResult } from '../domain/ifdb';
import type { AssociatedGameMetadata } from '../domain/map-types';
import {
  buildParchmentSrc,
  clampParchmentPanelHeight,
  clampParchmentPanelWidth,
  getDefaultParchmentPanelHeight,
  getNextParchmentPanelHeightFromKey,
  getNextParchmentPanelWidthFromKey,
  getParchmentInstance,
  loadStoredParchmentPanelHeight,
  loadStoredParchmentPanelWidth,
  PARCHMENT_LOCAL_FILE_RETRY_ATTEMPTS,
  PARCHMENT_LOCAL_FILE_RETRY_DELAY_MS,
  PARCHMENT_PANEL_DEFAULT_WIDTH_PX,
  persistParchmentPanelHeight,
  persistParchmentPanelWidth,
} from '../components/parchment-panel-helpers';

interface UseParchmentPanelOptions {
  readonly activeMapId: string | null;
  readonly associatedGame: AssociatedGameMetadata | null;
  readonly setAssociatedGameMetadata: (associatedGame: AssociatedGameMetadata | null) => void;
  readonly parchmentDeviceInputRef: React.RefObject<HTMLInputElement | null>;
  readonly parchmentIframeRef: React.RefObject<HTMLIFrameElement | null>;
}

interface UseParchmentPanelResult {
  readonly parchmentPanelWidth: number;
  readonly parchmentPanelHeight: number;
  readonly ifdbSearchQuery: string;
  readonly ifdbSearchResults: readonly NormalizedIfdbSearchResult[];
  readonly ifdbSearchError: string | null;
  readonly isIfdbSearching: boolean;
  readonly loadingIfdbGameTuid: string | null;
  readonly parchmentSrc: string;
  readonly isParchmentGameViewVisible: boolean;
  readonly deviceLinkLabel: string;
  readonly setIfdbSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  readonly beginParchmentPanelResize: (pointerId: number, pointerStartX: number) => void;
  readonly beginParchmentPanelHeightResize: (pointerId: number, pointerStartY: number) => void;
  readonly handleParchmentPanelWidthResizeKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  readonly handleParchmentPanelHeightResizeKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void;
  readonly handleIfdbSearchSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  readonly handleIfdbGameSelected: (tuid: string) => Promise<void>;
  readonly handleOpenParchmentFileChooser: () => void;
  readonly handleParchmentDeviceFileChange: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  readonly handleResetParchmentPanel: () => void;
  readonly handleParchmentIframeLoad: () => void;
}

export function useParchmentPanel({
  activeMapId,
  associatedGame,
  setAssociatedGameMetadata,
  parchmentDeviceInputRef,
  parchmentIframeRef,
}: UseParchmentPanelOptions): UseParchmentPanelResult {
  const [parchmentPanelWidth, setParchmentPanelWidth] = useState(() => (
    typeof window === 'undefined'
      ? PARCHMENT_PANEL_DEFAULT_WIDTH_PX
      : loadStoredParchmentPanelWidth(window.innerWidth)
  ));
  const [parchmentPanelHeight, setParchmentPanelHeight] = useState(() => (
    typeof window === 'undefined'
      ? 600
      : loadStoredParchmentPanelHeight(window.innerHeight)
  ));
  const [ifdbSearchQuery, setIfdbSearchQuery] = useState('');
  const [ifdbSearchResults, setIfdbSearchResults] = useState<readonly NormalizedIfdbSearchResult[]>([]);
  const [ifdbSearchError, setIfdbSearchError] = useState<string | null>(null);
  const [isIfdbSearching, setIsIfdbSearching] = useState(false);
  const [loadingIfdbGameTuid, setLoadingIfdbGameTuid] = useState<string | null>(null);
  const [parchmentSrc, setParchmentSrc] = useState(() => buildParchmentSrc(null));
  const [isParchmentGameViewVisible, setIsParchmentGameViewVisible] = useState(false);
  const [isParchmentChooserForcedVisible, setIsParchmentChooserForcedVisible] = useState(false);
  const [pendingLocalFile, setPendingLocalFile] = useState<File | null>(null);
  const syncedParchmentMapIdRef = useRef<string | null>(null);
  const pendingLocalFileRetryTimeoutRef = useRef<number | null>(null);

  const deviceLinkLabel = associatedGame?.sourceType === 'local-file' && associatedGame.title.trim().length > 0
    ? `Reconnect ${associatedGame.title}`
    : 'Or, click here to play a story file from your device';

  const resetChooserState = useCallback((): void => {
    setIfdbSearchQuery('');
    setIfdbSearchResults([]);
    setIfdbSearchError(null);
    setIsIfdbSearching(false);
    setLoadingIfdbGameTuid(null);
  }, []);

  useEffect(() => {
    const updateViewportAvailability = () => {
      setParchmentPanelWidth((current) => {
        const nextWidth = clampParchmentPanelWidth(current, window.innerWidth);
        if (nextWidth !== current) {
          persistParchmentPanelWidth(nextWidth);
        }
        return nextWidth;
      });
      setParchmentPanelHeight((current) => {
        const nextHeight = clampParchmentPanelHeight(current, window.innerHeight);
        if (nextHeight !== current) {
          persistParchmentPanelHeight(nextHeight);
        }
        return nextHeight;
      });
    };

    updateViewportAvailability();
    window.addEventListener('resize', updateViewportAvailability);
    return () => {
      window.removeEventListener('resize', updateViewportAvailability);
    };
  }, []);

  const beginParchmentPanelResize = useCallback((pointerId: number, pointerStartX: number) => {
    const startWidth = parchmentPanelWidth;

    const handlePointerMove = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) {
        return;
      }

      const nextWidth = clampParchmentPanelWidth(startWidth + (pointerStartX - event.clientX), window.innerWidth);
      setParchmentPanelWidth(nextWidth);
    };

    const finishResize = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) {
        return;
      }

      const nextWidth = clampParchmentPanelWidth(startWidth + (pointerStartX - event.clientX), window.innerWidth);
      setParchmentPanelWidth(nextWidth);
      persistParchmentPanelWidth(nextWidth);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishResize);
      window.removeEventListener('pointercancel', finishResize);
      document.body.classList.remove('app-shell--resizing-side-panel');
    };

    document.body.classList.add('app-shell--resizing-side-panel');
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishResize);
    window.addEventListener('pointercancel', finishResize);
  }, [parchmentPanelWidth]);

  const beginParchmentPanelHeightResize = useCallback((pointerId: number, pointerStartY: number) => {
    const startHeight = parchmentPanelHeight;

    const handlePointerMove = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) {
        return;
      }

      const nextHeight = clampParchmentPanelHeight(startHeight + (pointerStartY - event.clientY), window.innerHeight);
      setParchmentPanelHeight(nextHeight);
    };

    const finishResize = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) {
        return;
      }

      const nextHeight = clampParchmentPanelHeight(startHeight + (pointerStartY - event.clientY), window.innerHeight);
      setParchmentPanelHeight(nextHeight);
      persistParchmentPanelHeight(nextHeight);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishResize);
      window.removeEventListener('pointercancel', finishResize);
      document.body.classList.remove('app-shell--resizing-side-panel-height');
    };

    document.body.classList.add('app-shell--resizing-side-panel-height');
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishResize);
    window.addEventListener('pointercancel', finishResize);
  }, [parchmentPanelHeight]);

  useEffect(() => () => {
    document.body.classList.remove('app-shell--resizing-side-panel');
    document.body.classList.remove('app-shell--resizing-side-panel-height');
  }, []);

  useEffect(() => () => {
    if (pendingLocalFileRetryTimeoutRef.current !== null) {
      window.clearTimeout(pendingLocalFileRetryTimeoutRef.current);
    }
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
        setIfdbSearchError(null);
        window.alert(`No supported downloadable story file is available for ${resolvedGame.title}.`);
        return;
      }

      setPendingLocalFile(null);
      setIsParchmentChooserForcedVisible(false);
      setIsParchmentGameViewVisible(true);
      setAssociatedGameMetadata(resolvedGame);
    } catch (error) {
      setIfdbSearchError(error instanceof Error ? error.message : 'IFDB game lookup failed.');
    } finally {
      setLoadingIfdbGameTuid(null);
    }
  }, [setAssociatedGameMetadata]);

  useEffect(() => {
    const hasSwitchedMaps = syncedParchmentMapIdRef.current !== activeMapId;
    syncedParchmentMapIdRef.current = activeMapId;

    if (activeMapId === null) {
      resetChooserState();
      setParchmentSrc(buildParchmentSrc(null));
      setIsParchmentGameViewVisible(false);
      setIsParchmentChooserForcedVisible(false);
      setPendingLocalFile(null);
      return;
    }

    if (associatedGame?.sourceType === 'ifdb' && associatedGame.storyUrl !== null) {
      setParchmentSrc(buildParchmentSrc(associatedGame.storyUrl));
      if (!isParchmentChooserForcedVisible && !isParchmentGameViewVisible) {
        setIsParchmentGameViewVisible(true);
      }
      return;
    }

    if (hasSwitchedMaps) {
      resetChooserState();
      setParchmentSrc(buildParchmentSrc(null));
      setIsParchmentGameViewVisible(false);
      setIsParchmentChooserForcedVisible(false);
      setPendingLocalFile(null);
    }
  }, [
    activeMapId,
    associatedGame?.sourceType,
    associatedGame?.storyUrl,
    isParchmentChooserForcedVisible,
    isParchmentGameViewVisible,
    resetChooserState,
  ]);

  const handleOpenParchmentFileChooser = useCallback((): void => {
    parchmentDeviceInputRef.current?.click();
  }, [parchmentDeviceInputRef]);

  const tryLoadParchmentLocalFile = useCallback(async (
    selectedFile: File,
    reportUnavailable: boolean,
  ): Promise<boolean> => {
    const parchment = getParchmentInstance(parchmentIframeRef.current);
    if (parchment === null || typeof parchment.load_uploaded_file !== 'function') {
      if (reportUnavailable) {
        setIfdbSearchError('Parchment is not ready to open a local file yet.');
        setPendingLocalFile(null);
      }
      return false;
    }

    setIfdbSearchError(null);

    try {
      await parchment.load_uploaded_file(selectedFile);
      setAssociatedGameMetadata(createLocalFileAssociatedGameMetadata(selectedFile));
      setPendingLocalFile(null);
      return true;
    } catch (error) {
      setPendingLocalFile(null);
      setIfdbSearchError(error instanceof Error ? error.message : 'Opening the local story file failed.');
      return true;
    }
  }, [parchmentIframeRef, setAssociatedGameMetadata]);

  const handleParchmentDeviceFileChange = useCallback(async (
    event: React.ChangeEvent<HTMLInputElement>,
  ): Promise<void> => {
    const selectedFile = event.target.files?.[0] ?? null;
    event.target.value = '';

    if (selectedFile === null) {
      return;
    }

    setIfdbSearchError(null);
    setParchmentSrc(buildParchmentSrc(null));
    setPendingLocalFile(selectedFile);
    setIsParchmentChooserForcedVisible(false);
    setIsParchmentGameViewVisible(true);

    await tryLoadParchmentLocalFile(selectedFile, false);
  }, [tryLoadParchmentLocalFile]);

  const handleResetParchmentPanel = useCallback((): void => {
    if (pendingLocalFileRetryTimeoutRef.current !== null) {
      window.clearTimeout(pendingLocalFileRetryTimeoutRef.current);
      pendingLocalFileRetryTimeoutRef.current = null;
    }
    setIfdbSearchError(null);
    setPendingLocalFile(null);
    setParchmentSrc(buildParchmentSrc(null));
    setIsParchmentChooserForcedVisible(true);
    setIsParchmentGameViewVisible(false);
  }, []);

  const retryPendingParchmentLocalFileLoad = useCallback((selectedFile: File, attemptsRemaining: number): void => {
    void (async () => {
      const didFinish = await tryLoadParchmentLocalFile(selectedFile, attemptsRemaining <= 0);
      if (didFinish || attemptsRemaining <= 0) {
        pendingLocalFileRetryTimeoutRef.current = null;
        return;
      }

      pendingLocalFileRetryTimeoutRef.current = window.setTimeout(() => {
        retryPendingParchmentLocalFileLoad(selectedFile, attemptsRemaining - 1);
      }, PARCHMENT_LOCAL_FILE_RETRY_DELAY_MS);
    })();
  }, [tryLoadParchmentLocalFile]);

  const handleParchmentIframeLoad = useCallback((): void => {
    if (pendingLocalFile === null) {
      return;
    }

    if (pendingLocalFileRetryTimeoutRef.current !== null) {
      window.clearTimeout(pendingLocalFileRetryTimeoutRef.current);
      pendingLocalFileRetryTimeoutRef.current = null;
    }

    retryPendingParchmentLocalFileLoad(pendingLocalFile, PARCHMENT_LOCAL_FILE_RETRY_ATTEMPTS);
  }, [pendingLocalFile, retryPendingParchmentLocalFileLoad]);

  const handleParchmentPanelHeightResizeKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>): void => {
    const nextHeight = getNextParchmentPanelHeightFromKey(event.key, parchmentPanelHeight, window.innerHeight);
    if (nextHeight === null) {
      return;
    }

    event.preventDefault();
    setParchmentPanelHeight(nextHeight);
    persistParchmentPanelHeight(nextHeight);
  }, [parchmentPanelHeight]);

  const handleParchmentPanelWidthResizeKeyDown = useCallback((event: React.KeyboardEvent<HTMLElement>): void => {
    const nextWidth = getNextParchmentPanelWidthFromKey(event.key, parchmentPanelWidth, window.innerWidth);
    if (nextWidth === null) {
      return;
    }

    event.preventDefault();
    setParchmentPanelWidth(nextWidth);
    persistParchmentPanelWidth(nextWidth);
  }, [parchmentPanelWidth]);

  return {
    parchmentPanelWidth,
    parchmentPanelHeight,
    ifdbSearchQuery,
    ifdbSearchResults,
    ifdbSearchError,
    isIfdbSearching,
    loadingIfdbGameTuid,
    parchmentSrc,
    isParchmentGameViewVisible,
    deviceLinkLabel,
    setIfdbSearchQuery,
    beginParchmentPanelResize,
    beginParchmentPanelHeightResize,
    handleParchmentPanelWidthResizeKeyDown,
    handleParchmentPanelHeightResizeKeyDown,
    handleIfdbSearchSubmit,
    handleIfdbGameSelected,
    handleOpenParchmentFileChooser,
    handleParchmentDeviceFileChange,
    handleResetParchmentPanel,
    handleParchmentIframeLoad,
  };
}
