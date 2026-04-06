import { useCallback, useEffect, useRef, useState } from 'react';
import { createLocalFileAssociatedGameMetadata, inferLocalFileGameFormat } from '../domain/associated-game';
import { searchIfdbGames, viewIfdbGame } from '../domain/ifdb-client';
import type { NormalizedIfdbSearchResult } from '../domain/ifdb';
import type { AssociatedGameMetadata } from '../domain/map-types';
import {
  buildEmbeddedPlayerSrc,
  buildParchmentSrc,
  clampParchmentPanelHeightWithinInsets,
  clampParchmentPanelWidth,
  getEmbeddedPlayerIdForFormat,
  getEmbeddedPlayerInstance,
  getNextParchmentPanelWidthFromKey,
  loadStoredParchmentPanelWidth,
  PARCHMENT_LOCAL_FILE_RETRY_ATTEMPTS,
  PARCHMENT_LOCAL_FILE_RETRY_DELAY_MS,
  PARCHMENT_PANEL_DEFAULT_WIDTH_PX,
  persistParchmentPanelWidth,
} from '../components/parchment-panel-helpers';

interface UseParchmentPanelOptions {
  readonly activeMapId: string | null;
  readonly associatedGame: AssociatedGameMetadata | null;
  readonly defaultStoryUrlForNewMap?: string | null;
  readonly shouldLoadDefaultStoryForActiveMap?: boolean;
  readonly setAssociatedGameMetadata: (associatedGame: AssociatedGameMetadata | null) => void;
  readonly parchmentDeviceInputRef: React.RefObject<HTMLInputElement | null>;
  readonly parchmentIframeRef: React.RefObject<HTMLIFrameElement | null>;
  readonly heightTopInsetPx?: number;
  readonly heightBottomInsetPx?: number;
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
  readonly beginParchmentPanelCornerResize: (
    pointerId: number,
    pointerStartX: number,
    pointerStartY: number,
    dockEdge?: 'left' | 'right',
  ) => void;
  readonly handleParchmentPanelCornerResizeKeyDown: (
    event: React.KeyboardEvent<HTMLElement>,
    dockEdge?: 'left' | 'right',
  ) => void;
  readonly handleIfdbSearchSubmit: (event: React.FormEvent<HTMLFormElement>) => Promise<void>;
  readonly handleIfdbAuthorSearch: (author: string) => Promise<void>;
  readonly handleIfdbGameSelected: (tuid: string) => Promise<void>;
  readonly handleOpenParchmentFileChooser: () => void;
  readonly handlePlayDefaultStory: () => void;
  readonly handleParchmentDeviceFileChange: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  readonly handleResetParchmentPanel: () => void;
  readonly handleParchmentIframeLoad: () => void;
}

export function useParchmentPanel({
  activeMapId,
  associatedGame,
  defaultStoryUrlForNewMap = null,
  shouldLoadDefaultStoryForActiveMap = false,
  setAssociatedGameMetadata,
  parchmentDeviceInputRef,
  parchmentIframeRef,
  heightTopInsetPx = 16,
  heightBottomInsetPx = 16,
}: UseParchmentPanelOptions): UseParchmentPanelResult {
  const [parchmentPanelWidth, setParchmentPanelWidth] = useState(() => (
    typeof window === 'undefined'
      ? PARCHMENT_PANEL_DEFAULT_WIDTH_PX
      : loadStoredParchmentPanelWidth(window.innerWidth)
  ));
  const [parchmentPanelHeight, setParchmentPanelHeight] = useState(() => (
    typeof window === 'undefined'
      ? 600
      : clampParchmentPanelHeightWithinInsets(window.innerHeight, window.innerHeight, heightTopInsetPx, heightBottomInsetPx)
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
  const [isAssociatedGameSyncSuppressed, setIsAssociatedGameSyncSuppressed] = useState(false);
  const syncedParchmentMapIdRef = useRef<string | null>(null);
  const pendingLocalFileRetryTimeoutRef = useRef<number | null>(null);

  const deviceLinkLabel = associatedGame?.sourceType === 'local-file' && associatedGame.title.trim().length > 0
    ? `Reconnect ${associatedGame.title}`
    : 'Or click here to play a story file from your device';

  const enrichIfdbSearchResultsWithPlayability = useCallback(async (
    results: readonly NormalizedIfdbSearchResult[],
  ): Promise<readonly NormalizedIfdbSearchResult[]> => {
    const enrichedResults = await Promise.all(results.map(async (result) => {
      try {
        const resolvedGame = await viewIfdbGame(result.tuid);
        return {
          ...result,
          isPlayable: resolvedGame.storyUrl !== null,
        };
      } catch {
        return {
          ...result,
          isPlayable: false,
        };
      }
    }));

    return enrichedResults;
  }, []);

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
      setParchmentPanelHeight(
        clampParchmentPanelHeightWithinInsets(
          window.innerHeight,
          window.innerHeight,
          heightTopInsetPx,
          heightBottomInsetPx,
        ),
      );
    };

    updateViewportAvailability();
    window.addEventListener('resize', updateViewportAvailability);
    return () => {
      window.removeEventListener('resize', updateViewportAvailability);
    };
  }, [heightBottomInsetPx, heightTopInsetPx]);

  const beginParchmentPanelCornerResize = useCallback((
    pointerId: number,
    pointerStartX: number,
    _pointerStartY: number,
    dockEdge: 'left' | 'right' = 'right',
  ) => {
    const startWidth = parchmentPanelWidth;
    const directionMultiplier = dockEdge === 'left' ? -1 : 1;

    const handlePointerMove = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) {
        return;
      }

      const nextWidth = clampParchmentPanelWidth(
        startWidth + ((pointerStartX - event.clientX) * directionMultiplier),
        window.innerWidth,
      );
      setParchmentPanelWidth(nextWidth);
    };

    const finishResize = (event: PointerEvent): void => {
      if (event.pointerId !== pointerId) {
        return;
      }

      const nextWidth = clampParchmentPanelWidth(
        startWidth + ((pointerStartX - event.clientX) * directionMultiplier),
        window.innerWidth,
      );
      setParchmentPanelWidth(nextWidth);
      persistParchmentPanelWidth(nextWidth);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishResize);
      window.removeEventListener('pointercancel', finishResize);
      document.body.classList.remove('app-shell--resizing-side-panel-corner');
    };

    document.body.classList.add('app-shell--resizing-side-panel-corner');
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishResize);
    window.addEventListener('pointercancel', finishResize);
  }, [parchmentPanelWidth]);

  useEffect(() => () => {
    document.body.classList.remove('app-shell--resizing-side-panel-corner');
  }, []);

  useEffect(() => () => {
    if (pendingLocalFileRetryTimeoutRef.current !== null) {
      window.clearTimeout(pendingLocalFileRetryTimeoutRef.current);
    }
  }, []);

  const performIfdbSearch = useCallback(async (query: string): Promise<void> => {
    const trimmedQuery = query.trim();
    if (trimmedQuery.length === 0) {
      setIfdbSearchResults([]);
      setIfdbSearchError(null);
      return;
    }

    setIsIfdbSearching(true);
    setIfdbSearchError(null);

    try {
      const results = await searchIfdbGames(trimmedQuery);
      const enrichedResults = await enrichIfdbSearchResultsWithPlayability(results);
      setIfdbSearchResults(enrichedResults);
    } catch (error) {
      setIfdbSearchResults([]);
      setIfdbSearchError(error instanceof Error ? error.message : 'IFDB search failed.');
    } finally {
      setIsIfdbSearching(false);
    }
  }, [enrichIfdbSearchResultsWithPlayability]);

  const handleIfdbSearchSubmit = useCallback(async (event: React.FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    await performIfdbSearch(ifdbSearchQuery);
  }, [ifdbSearchQuery, performIfdbSearch]);

  const handleIfdbAuthorSearch = useCallback(async (author: string): Promise<void> => {
    setIfdbSearchQuery(author);
    await performIfdbSearch(author);
  }, [performIfdbSearch]);

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
      setIsAssociatedGameSyncSuppressed(false);
      return;
    }

    if (!isAssociatedGameSyncSuppressed && associatedGame?.sourceType === 'ifdb' && associatedGame.storyUrl !== null) {
      setParchmentSrc(buildEmbeddedPlayerSrc(associatedGame.storyUrl, associatedGame.format, activeMapId));
      if (!isParchmentChooserForcedVisible && !isParchmentGameViewVisible) {
        setIsParchmentGameViewVisible(true);
      }
      return;
    }

    if (
      hasSwitchedMaps
      && shouldLoadDefaultStoryForActiveMap
      && associatedGame === null
      && defaultStoryUrlForNewMap !== null
    ) {
      resetChooserState();
      setParchmentSrc(buildEmbeddedPlayerSrc(
        defaultStoryUrlForNewMap,
        inferLocalFileGameFormat(defaultStoryUrlForNewMap),
        activeMapId,
      ));
      setIsParchmentGameViewVisible(true);
      setIsParchmentChooserForcedVisible(false);
      setPendingLocalFile(null);
      setIsAssociatedGameSyncSuppressed(false);
      return;
    }

    if (hasSwitchedMaps) {
      resetChooserState();
      setParchmentSrc(buildParchmentSrc(null));
      setIsParchmentGameViewVisible(false);
      setIsParchmentChooserForcedVisible(false);
      setPendingLocalFile(null);
      setIsAssociatedGameSyncSuppressed(false);
    }
  }, [
    activeMapId,
    associatedGame?.sourceType,
    associatedGame?.storyUrl,
    associatedGame,
    defaultStoryUrlForNewMap,
    isAssociatedGameSyncSuppressed,
    isParchmentChooserForcedVisible,
    isParchmentGameViewVisible,
    resetChooserState,
    shouldLoadDefaultStoryForActiveMap,
  ]);

  const handleOpenParchmentFileChooser = useCallback((): void => {
    parchmentDeviceInputRef.current?.click();
  }, [parchmentDeviceInputRef]);

  const handlePlayDefaultStory = useCallback((): void => {
    if (defaultStoryUrlForNewMap === null) {
      return;
    }

    if (pendingLocalFileRetryTimeoutRef.current !== null) {
      window.clearTimeout(pendingLocalFileRetryTimeoutRef.current);
      pendingLocalFileRetryTimeoutRef.current = null;
    }

    setIfdbSearchError(null);
    setPendingLocalFile(null);
    setParchmentSrc(buildEmbeddedPlayerSrc(
      defaultStoryUrlForNewMap,
      inferLocalFileGameFormat(defaultStoryUrlForNewMap),
      activeMapId,
    ));
    setIsParchmentChooserForcedVisible(false);
    setIsParchmentGameViewVisible(true);
    setIsAssociatedGameSyncSuppressed(true);
  }, [activeMapId, defaultStoryUrlForNewMap]);

  const tryLoadParchmentLocalFile = useCallback(async (
    selectedFile: File,
    reportUnavailable: boolean,
  ): Promise<boolean> => {
    const selectedFormat = inferLocalFileGameFormat(selectedFile.name);
    const embeddedPlayer = getEmbeddedPlayerInstance(parchmentIframeRef.current, selectedFormat);
    if (embeddedPlayer === null || typeof embeddedPlayer.load_uploaded_file !== 'function') {
      if (reportUnavailable) {
        const playerName = getEmbeddedPlayerIdForFormat(selectedFormat) === 'quixe' ? 'Quixe' : 'Parchment';
        setIfdbSearchError(`${playerName} is not ready to open a local file yet.`);
        setPendingLocalFile(null);
      }
      return false;
    }

    setIfdbSearchError(null);

    try {
      await embeddedPlayer.load_uploaded_file(selectedFile);
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
    setParchmentSrc(buildEmbeddedPlayerSrc(null, inferLocalFileGameFormat(selectedFile.name), activeMapId));
    setPendingLocalFile(selectedFile);
    setIsParchmentChooserForcedVisible(false);
    setIsParchmentGameViewVisible(true);
    setIsAssociatedGameSyncSuppressed(false);

    await tryLoadParchmentLocalFile(selectedFile, false);
  }, [activeMapId, tryLoadParchmentLocalFile]);

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
    setIsAssociatedGameSyncSuppressed(false);
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

  const handleParchmentPanelCornerResizeKeyDown = useCallback((
    event: React.KeyboardEvent<HTMLElement>,
    dockEdge: 'left' | 'right' = 'right',
  ): void => {
    const effectiveKey = dockEdge === 'left'
      ? event.key === 'ArrowLeft'
        ? 'ArrowRight'
        : event.key === 'ArrowRight'
          ? 'ArrowLeft'
          : event.key
      : event.key;
    const nextWidth = getNextParchmentPanelWidthFromKey(effectiveKey, parchmentPanelWidth, window.innerWidth);
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
    beginParchmentPanelCornerResize,
    handleParchmentPanelCornerResizeKeyDown,
    handleIfdbSearchSubmit,
    handleIfdbAuthorSearch,
    handleIfdbGameSelected,
    handleOpenParchmentFileChooser,
    handlePlayDefaultStory,
    handleParchmentDeviceFileChange,
    handleResetParchmentPanel,
    handleParchmentIframeLoad,
  };
}
