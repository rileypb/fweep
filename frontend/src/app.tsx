import { useCallback, useEffect, useState } from 'react';
import { AppCliPanel } from './components/app-cli-panel';
import { HelpDialog } from './components/help-dialog';
import { MapCanvas } from './components/map-canvas';
import { MapSelectionDialog } from './components/map-selection-dialog';
import { SnapToggle } from './components/snap-toggle';
import { ThemeToggle } from './components/theme-toggle';
import { useAppCli } from './hooks/use-app-cli';
import { useMapRouter } from './hooks/use-map-router';
import { useEditorStore } from './state/editor-store';

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

export function App(): React.JSX.Element {
  const { activeMap, loading, openMap, closeMap, routeError } = useMapRouter();
  const loadDocument = useEditorStore((s) => s.loadDocument);
  const unloadDocument = useEditorStore((s) => s.unloadDocument);
  const showGridEnabled = useEditorStore((s) => s.showGridEnabled);
  const useBezierConnectionsEnabled = useEditorStore((s) => s.useBezierConnectionsEnabled);
  const cliOutputCollapsedEnabled = useEditorStore((s) => s.cliOutputCollapsedEnabled);
  const mapVisualStyle = useEditorStore((s) => s.mapVisualStyle);
  const toggleShowGrid = useEditorStore((s) => s.toggleShowGrid);
  const toggleUseBezierConnections = useEditorStore((s) => s.toggleUseBezierConnections);
  const toggleCliOutputCollapsed = useEditorStore((s) => s.toggleCliOutputCollapsed);
  const setMapVisualStyle = useEditorStore((s) => s.setMapVisualStyle);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [requestedRoomEditorRequest, setRequestedRoomEditorRequest] = useState<import('./hooks/use-app-cli').RoomUiRequest | null>(null);
  const [requestedRoomRevealRequest, setRequestedRoomRevealRequest] = useState<import('./hooks/use-app-cli').RoomUiRequest | null>(null);
  const [requestedViewportFocusRequest, setRequestedViewportFocusRequest] = useState<import('./hooks/use-app-cli').ViewportFocusRequest | null>(null);
  const rootFontSizePx = typeof window === 'undefined'
    ? 16
    : Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || 16;
  const visibleMapLeftInset = typeof window === 'undefined'
    ? 0
    : getAppCliLeftOffset(window.innerWidth, rootFontSizePx)
      + (cliOutputCollapsedEnabled ? 0 : getAppCliStackWidth(window.innerWidth, rootFontSizePx));
  const hasOpenMap = activeMap !== null;
  const {
    cliInputRef,
    cliImportInputRef,
    gameOutputRef,
    cliCommand,
    hasUsedCliInput,
    cliHistory,
    cliHistoryIndex,
    cliHistoryDraft,
    gameOutputLines,
    isImportingScript,
    handleCliSubmit,
    handleCliCommandChange,
    handleCliHistoryNavigate,
    handleImportScriptChange,
    handleGameOutputClick,
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
    if (activeMap !== null) {
      return;
    }

    setRequestedRoomEditorRequest(null);
    setRequestedRoomRevealRequest(null);
    setRequestedViewportFocusRequest(null);
  }, [activeMap]);

  const handleRequestedRoomEditorHandled = useCallback((requestId: number) => {
    setRequestedRoomEditorRequest((current) => current?.requestId === requestId ? null : current);
  }, []);

  const handleRequestedRoomRevealHandled = useCallback((requestId: number) => {
    setRequestedRoomRevealRequest((current) => current?.requestId === requestId ? null : current);
  }, []);

  const handleRequestedViewportFocusHandled = useCallback((requestId: number) => {
    setRequestedViewportFocusRequest((current) => current?.requestId === requestId ? null : current);
  }, []);

  useEffect(() => {
    if (!isHelpOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsHelpOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isHelpOpen]);

  return (
    <main className="app-shell">
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
            isOutputCollapsed={cliOutputCollapsedEnabled}
            isImportingScript={isImportingScript}
            onSubmit={handleCliSubmit}
            onCliCommandChange={handleCliCommandChange}
            onCliHistoryNavigate={handleCliHistoryNavigate}
            onToggleOutputCollapsed={toggleCliOutputCollapsed}
            onImportScriptChange={handleImportScriptChange}
          />
          <div
            className="app-control-chip app-map-name-chip app-control-chip--plain"
            aria-label={`Map name: ${activeMap.metadata.name}`}
          >
            {`Map: ${activeMap.metadata.name}`}
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
              onClick={closeMap}
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
              aria-label="Toggle polyline connections"
              title="Toggle polyline connections"
              aria-pressed={!useBezierConnectionsEnabled}
              onClick={toggleUseBezierConnections}
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
                <path d="M2 12h4L10 4h4" strokeLinecap="round" strokeLinejoin="round" />
                <circle cx="2" cy="12" r="1.2" fill="currentColor" stroke="none" />
                <circle cx="10" cy="4" r="1.2" fill="currentColor" stroke="none" />
                <circle cx="14" cy="4" r="1.2" fill="currentColor" stroke="none" />
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
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <rect x="2.5" y="2.5" width="4" height="4" />
                <rect x="9.5" y="2.5" width="4" height="4" rx="1.5" />
                <rect x="2.5" y="9.5" width="4" height="4" transform="rotate(45 4.5 11.5)" />
                <rect x="9.5" y="9.5" width="4" height="4" />
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
              ?
            </button>
          </div>
          <h1 className="app-title">fweep!</h1>
        </>
      )}
      <HelpDialog isOpen={isHelpOpen} onClose={() => setIsHelpOpen(false)} />
      {loading ? null : activeMap === null ? (
        <MapSelectionDialog onMapSelected={openMap} initialError={routeError} />
      ) : (
        <MapCanvas
          mapName={activeMap.metadata.name}
          onBack={closeMap}
          visibleMapLeftInset={visibleMapLeftInset}
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
