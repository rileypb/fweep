import type { NormalizedIfdbSearchResult } from '../domain/ifdb';
import { getShortcutTitle, UI_SHORTCUTS } from './ui-shortcuts';

interface ParchmentSidebarProps {
  readonly deviceInputRef: React.RefObject<HTMLInputElement | null>;
  readonly iframeRef: React.RefObject<HTMLIFrameElement | null>;
  readonly searchInputRef: React.RefObject<HTMLInputElement | null>;
  readonly width: number;
  readonly height: number;
  readonly minWidth: number;
  readonly maxWidth: number;
  readonly minHeight: number;
  readonly maxHeight: number;
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
  readonly onIfdbAuthorSearch: (author: string) => void;
  readonly onIfdbGameSelected: (tuid: string) => void;
  readonly onOpenParchmentFileChooser: () => void;
  readonly onPlayDefaultStory: () => void;
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
  minWidth,
  maxWidth,
  minHeight,
  maxHeight,
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
  onIfdbAuthorSearch,
  onIfdbGameSelected,
  onOpenParchmentFileChooser,
  onPlayDefaultStory,
  onParchmentDeviceFileChange,
  onResetParchmentPanel,
  onParchmentIframeLoad,
  onHeightResizePointerDown,
  onHeightResizeKeyDown,
  onWidthResizePointerDown,
  onWidthResizeKeyDown,
}: ParchmentSidebarProps): React.JSX.Element {
  return (
    <div
      className="app-parchment-panel"
      style={{ width: `${width}px`, height: `${height}px` }}
    >
      <span id="parchment-panel-height-resize-help" className="sr-only">
        Use Up and Down Arrow keys to resize the game panel height.
      </span>
      <span id="parchment-panel-width-resize-help" className="sr-only">
        Use Left and Right Arrow keys to resize the game panel width.
      </span>
      <div
        className="app-parchment-panel__resize-handle app-parchment-panel__resize-handle--height"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize game panel height"
        aria-describedby="parchment-panel-height-resize-help"
        aria-valuemin={Math.round(minHeight)}
        aria-valuemax={Math.round(maxHeight)}
        aria-valuenow={Math.round(height)}
        tabIndex={0}
        onPointerDown={onHeightResizePointerDown}
        onKeyDown={onHeightResizeKeyDown}
      />
      <div
        className="app-parchment-panel__resize-handle app-parchment-panel__resize-handle--right"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize game panel width"
        aria-describedby="parchment-panel-width-resize-help"
        aria-valuemin={Math.round(minWidth)}
        aria-valuemax={Math.round(maxWidth)}
        aria-valuenow={Math.round(width)}
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
                aria-keyshortcuts={UI_SHORTCUTS.resetGamePanel.ariaKeyShortcuts}
                title={getShortcutTitle('Choose game', UI_SHORTCUTS.resetGamePanel)}
                onClick={onResetParchmentPanel}
              >
                Choose game
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
              aria-keyshortcuts={UI_SHORTCUTS.openStoryFile.ariaKeyShortcuts}
              data-shortcut={UI_SHORTCUTS.openStoryFile.display}
              title={getShortcutTitle(deviceLinkLabel, UI_SHORTCUTS.openStoryFile)}
              onClick={onOpenParchmentFileChooser}
            >
              {deviceLinkLabel}
            </button>
            <button
              type="button"
              className="app-parchment-panel__device-link"
              onClick={onPlayDefaultStory}
            >
              Or play the fweep intro game
            </button>
            {ifdbSearchError ? (
              <p className="app-parchment-panel__search-status" role="alert">{ifdbSearchError}</p>
            ) : null}
            {ifdbSearchResults.length > 0 ? (
              <div className="app-parchment-panel__results" aria-label="IFDB search results">
                {ifdbSearchResults.map((result) => (
                  <article
                    key={result.tuid}
                    className={`app-parchment-panel__result${result.isPlayable ? ' app-parchment-panel__result--playable' : ' app-parchment-panel__result--nonplayable'}`}
                  >
                    {result.coverArtUrl ? (
                      result.isPlayable ? (
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
                      ) : (
                        <div className="app-parchment-panel__result-cover-static">
                          <img
                            className="app-parchment-panel__result-cover"
                            src={result.coverArtUrl}
                            alt={`Cover art for ${result.title}`}
                          />
                        </div>
                      )
                    ) : null}
                    <h2 className="app-parchment-panel__result-title">
                      {result.isPlayable ? (
                        <button
                          type="button"
                          className="app-parchment-panel__result-button app-parchment-panel__result-button--playable"
                          aria-label={`Play ${result.title}`}
                          disabled={loadingIfdbGameTuid === result.tuid}
                          onClick={() => {
                            onIfdbGameSelected(result.tuid);
                          }}
                        >
                          {loadingIfdbGameTuid === result.tuid ? `Loading ${result.title}...` : result.title}
                        </button>
                      ) : (
                        <span className="app-parchment-panel__result-text">{result.title}</span>
                      )}
                    </h2>
                    <p className="app-parchment-panel__result-meta">
                      {result.author ? (() => {
                        const author = result.author;
                        return result.isPlayable
                          ? (
                            <button
                              type="button"
                              className="app-parchment-panel__result-link app-parchment-panel__result-link--playable"
                              aria-label={`Search IFDB for games by ${author}`}
                              disabled={isIfdbSearching}
                              onClick={() => {
                                onIfdbAuthorSearch(author);
                              }}
                            >
                              {author}
                            </button>
                          )
                          : <span className="app-parchment-panel__result-text">{author}</span>;
                      })() : 'Unknown author'}
                    </p>
                    {result.publishedDisplay ? (
                      <p className="app-parchment-panel__result-meta">{result.publishedDisplay}</p>
                    ) : null}
                    {result.ifdbLink ? (
                      <p className="app-parchment-panel__result-meta">
                        <a
                          className={`app-parchment-panel__result-link${result.isPlayable ? ' app-parchment-panel__result-link--playable' : ''}`}
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
