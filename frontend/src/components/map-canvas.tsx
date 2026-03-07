import { useState } from 'react';

export interface MapCanvasProps {
  mapName: string;
  /** Whether the background grid is visible. Defaults to true. */
  showGrid?: boolean;
}

export function MapCanvas({ mapName, showGrid: initialShowGrid = true }: MapCanvasProps): React.JSX.Element {
  const [showGrid, setShowGrid] = useState(initialShowGrid);

  const classes = ['map-canvas', showGrid ? 'map-canvas--grid' : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} data-testid="map-canvas">
      <header className="map-canvas-header">
        <span className="map-canvas-title">{mapName}</span>
        <button
          className="map-canvas-grid-toggle"
          type="button"
          aria-label="Toggle grid"
          title="Toggle grid"
          onClick={() => setShowGrid((prev) => !prev)}
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
      </header>
    </div>
  );
}
