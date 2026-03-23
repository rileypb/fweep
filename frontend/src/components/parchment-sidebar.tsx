import { useState } from 'react';
import type { NormalizedIfdbSearchResult } from '../domain/ifdb';

const PARCHMENT_PANEL_TIPS = [
  'Use Ctrl+/ to switch the keyboard focus between the game and the mapper.',
] as const;

function getRandomParchmentPanelTip(): string {
  return PARCHMENT_PANEL_TIPS[Math.floor(Math.random() * PARCHMENT_PANEL_TIPS.length)] ?? PARCHMENT_PANEL_TIPS[0];
}

interface ParchmentSidebarProps {
  readonly deviceInputRef: React.RefObject<HTMLInputElement | null>;
  readonly iframeRef: React.RefObject<HTMLIFrameElement | null>;
  readonly searchInputRef: React.RefObject<HTMLInputElement | null>;
  readonly width: number;
  readonly height: number;
  readonly isGameViewVisible: boolean;
  readonly parchmentSrc: string;
  readonly ifdbSearchQuery: string;
  readonly ifdbSearchResults: readonly NormalizedIfdbSearchResult[];
  readonly ifdbSearchError: string | null;
  readonly isIfdbSearching: boolean;
  readonly loadingIfdbGameTuid: string | null;
  readonly deviceLinkLabel: string;
  readonly onIfdbSearchQueryChange: (value: string) => void;
  readonly onIfdbSearchSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  readonly onIfdbGameSelected: (tuid: string) => void;
  readonly onOpenParchmentFileChooser: () => void;
  readonly onParchmentDeviceFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  readonly onResetParchmentPanel: () => void;
  readonly onParchmentIframeLoad: () => void;
  readonly onHeightResizePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  readonly onHeightResizeKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
  readonly onWidthResizePointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  readonly onWidthResizeKeyDown: (event: React.KeyboardEvent<HTMLDivElement>) => void;
}

export function ParchmentSidebar({
  deviceInputRef,
  iframeRef,
  searchInputRef,
  width,
  height,
  isGameViewVisible,
  parchmentSrc,
  ifdbSearchQuery,
  ifdbSearchResults,
  ifdbSearchError,
  isIfdbSearching,
  loadingIfdbGameTuid,
  deviceLinkLabel,
  onIfdbSearchQueryChange,
  onIfdbSearchSubmit,
  onIfdbGameSelected,
  onOpenParchmentFileChooser,
  onParchmentDeviceFileChange,
  onResetParchmentPanel,
  onParchmentIframeLoad,
  onHeightResizePointerDown,
  onHeightResizeKeyDown,
  onWidthResizePointerDown,
  onWidthResizeKeyDown,
}: ParchmentSidebarProps): React.JSX.Element {
  const [emptyStateTip] = useState(getRandomParchmentPanelTip);
  const shouldShowEmptyStateTip = !isGameViewVisible && ifdbSearchResults.length === 0;

  return (
    <div
      className="app-parchment-panel"
      style={{ width: `${width}px`, height: `${height}px` }}
    >
      <div
        className="app-parchment-panel__resize-handle app-parchment-panel__resize-handle--height"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize game panel height"
        tabIndex={0}
        onPointerDown={onHeightResizePointerDown}
        onKeyDown={onHeightResizeKeyDown}
      />
      <div
        className="app-parchment-panel__resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize game panel width"
        tabIndex={0}
        onPointerDown={onWidthResizePointerDown}
        onKeyDown={onWidthResizeKeyDown}
      />
      <div className="app-parchment-panel__frame">
        <input
          ref={deviceInputRef}
          className="app-parchment-panel__device-input"
          type="file"
          tabIndex={-1}
          onChange={onParchmentDeviceFileChange}
        />
        {isGameViewVisible ? (
          <>
            <div className="app-parchment-panel__game-header">
              <a
                className="app-parchment-panel__source-link"
                href="https://github.com/curiousdannii/parchment"
                target="_blank"
                rel="noreferrer"
              >
                Parchment by Dannii Willis
              </a>
              <button
                type="button"
                className="app-parchment-panel__reset-button"
                onClick={onResetParchmentPanel}
              >
                reset
              </button>
            </div>
            {ifdbSearchError ? (
              <p className="app-parchment-panel__game-status" role="alert">{ifdbSearchError}</p>
            ) : null}
            <iframe
              ref={iframeRef}
              className="app-parchment-panel__iframe"
              src={parchmentSrc}
              title="Interactive fiction player"
              onLoad={onParchmentIframeLoad}
            />
          </>
        ) : (
          <form className="app-parchment-panel__search" onSubmit={onIfdbSearchSubmit}>
            <label className="app-parchment-panel__search-label" htmlFor="app-ifdb-search">
              Search IFDB for a game
            </label>
            <div className="app-parchment-panel__search-row">
              <input
                ref={searchInputRef}
                id="app-ifdb-search"
                className="app-parchment-panel__search-input"
                type="text"
                value={ifdbSearchQuery}
                onChange={(event) => {
                  onIfdbSearchQueryChange(event.target.value);
                }}
              />
              <button type="submit" className="app-parchment-panel__search-button" disabled={isIfdbSearching}>
                {isIfdbSearching ? 'Searching...' : 'Search'}
              </button>
            </div>
            <button
              type="button"
              className="app-parchment-panel__device-link"
              onClick={onOpenParchmentFileChooser}
            >
              {deviceLinkLabel}
            </button>
            {ifdbSearchError ? (
              <p className="app-parchment-panel__search-status" role="alert">{ifdbSearchError}</p>
            ) : null}
            {shouldShowEmptyStateTip ? (
              <div className="app-parchment-panel__empty-state" aria-live="polite">
                <p className="app-parchment-panel__empty-state-label">Tip</p>
                <p className="app-parchment-panel__empty-state-tip">{emptyStateTip}</p>
              </div>
            ) : null}
            {ifdbSearchResults.length > 0 ? (
              <div className="app-parchment-panel__results" aria-label="IFDB search results">
                {ifdbSearchResults.map((result) => (
                  <article key={result.tuid} className="app-parchment-panel__result">
                    {result.coverArtUrl ? (
                      <button
                        type="button"
                        className="app-parchment-panel__result-cover-button"
                        aria-label={`Play ${result.title} via cover art`}
                        disabled={loadingIfdbGameTuid === result.tuid}
                        onClick={() => {
                          onIfdbGameSelected(result.tuid);
                        }}
                      >
                        <img
                          className="app-parchment-panel__result-cover"
                          src={result.coverArtUrl}
                          alt={`Cover art for ${result.title}`}
                        />
                      </button>
                    ) : null}
                    <h2 className="app-parchment-panel__result-title">
                      <button
                        type="button"
                        className="app-parchment-panel__result-button"
                        aria-label={`Play ${result.title}`}
                        disabled={loadingIfdbGameTuid === result.tuid}
                        onClick={() => {
                          onIfdbGameSelected(result.tuid);
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
                    {result.ifdbLink ? (
                      <p className="app-parchment-panel__result-meta">
                        <a
                          className="app-parchment-panel__result-link"
                          href={result.ifdbLink}
                          target="_blank"
                          rel="noreferrer"
                          aria-label={`View ${result.title} on IFDB`}
                        >
                          View on IFDB
                        </a>
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : null}
          </form>
        )}
      </div>
    </div>
  );
}
