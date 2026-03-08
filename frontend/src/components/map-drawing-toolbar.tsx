import { normalizeHexColor } from './map-background-raster';
import { useEditorStore, type CanvasInteractionMode, type DrawingTool } from '../state/editor-store';

const TOOL_LABELS: readonly { readonly tool: DrawingTool; readonly label: string }[] = [
  { tool: 'pencil', label: 'Pencil' },
  { tool: 'brush', label: 'Brush' },
  { tool: 'eraser', label: 'Eraser' },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function GraphGlyph(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <circle cx="3" cy="3" r="1.7" />
      <circle cx="13" cy="4" r="1.7" />
      <circle cx="6" cy="12" r="1.7" />
      <circle cx="13" cy="12" r="1.7" />
      <path d="M4.4 4.1 11.3 4" />
      <path d="M4.1 4.4 5.1 10.4" />
      <path d="M7.7 12H11.3" />
      <path d="M11.8 5.5 12.5 10.2" />
    </svg>
  );
}

function PaletteGlyph(): React.JSX.Element {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden="true">
      <path d="M8 2.2c-3.2 0-5.8 2.3-5.8 5.2 0 2 1.4 3.7 3.3 4.6.8.4 1.3 1 .9 1.8-.3.7 0 1.4.9 1.4 4.2 0 6.5-2.6 6.5-5.8 0-4-2.8-7.2-5.8-7.2Z" />
      <circle cx="5.1" cy="6" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="7.6" cy="4.7" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="10.2" cy="5.5" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="10.6" cy="8.4" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function MapDrawingToolbar(): React.JSX.Element {
  const drawingToolState = useEditorStore((state) => state.drawingToolState);
  const canvasInteractionMode = useEditorStore((state) => state.canvasInteractionMode);
  const setDrawingTool = useEditorStore((state) => state.setDrawingTool);
  const setCanvasInteractionMode = useEditorStore((state) => state.setCanvasInteractionMode);
  const setDrawingColor = useEditorStore((state) => state.setDrawingColor);
  const setDrawingOpacity = useEditorStore((state) => state.setDrawingOpacity);
  const setDrawingSize = useEditorStore((state) => state.setDrawingSize);
  const setDrawingSoftness = useEditorStore((state) => state.setDrawingSoftness);
  const maxSize = drawingToolState.tool === 'pencil' ? 6 : 64;
  const showsSoftness = drawingToolState.tool !== 'pencil';
  const drawingControlsDisabled = canvasInteractionMode !== 'draw';
  const nextMode: CanvasInteractionMode = canvasInteractionMode === 'map' ? 'draw' : 'map';
  const modeButtonLabel = canvasInteractionMode === 'map' ? 'Switch to draw mode' : 'Switch to map mode';

  return (
    <aside className="map-drawing-toolbar" data-testid="map-drawing-toolbar">
      <div className="map-drawing-toolbar-tools" role="toolbar" aria-label="Canvas interaction mode">
        <button
          type="button"
          className={`map-drawing-tool-button map-drawing-tool-button--icon${canvasInteractionMode === 'draw' ? ' map-drawing-tool-button--active' : ''}`}
          onClick={() => setCanvasInteractionMode(nextMode)}
          aria-label={modeButtonLabel}
          title={modeButtonLabel}
          aria-pressed={canvasInteractionMode === 'draw'}
          data-testid="canvas-interaction-mode-toggle"
        >
          {canvasInteractionMode === 'map' ? <GraphGlyph /> : <PaletteGlyph />}
        </button>
      </div>

      <div className="map-drawing-toolbar-tools" role="toolbar" aria-label="Drawing tools">
        {TOOL_LABELS.map(({ tool, label }) => (
          <button
            key={tool}
            type="button"
            className={`map-drawing-tool-button${drawingToolState.tool === tool ? ' map-drawing-tool-button--active' : ''}`}
            onClick={() => setDrawingTool(tool)}
            aria-pressed={drawingToolState.tool === tool}
            disabled={drawingControlsDisabled}
          >
            {label}
          </button>
        ))}
      </div>

      <label className="map-drawing-toolbar-field">
        <span>Color</span>
        <input
          type="color"
          value={normalizeHexColor(drawingToolState.colorRgbHex)}
          onChange={(event) => setDrawingColor(event.target.value)}
          disabled={drawingControlsDisabled}
        />
      </label>

      <label className="map-drawing-toolbar-field">
        <span>Hex</span>
        <input
          type="text"
          value={drawingToolState.colorRgbHex}
          onChange={(event) => setDrawingColor(event.target.value)}
          onBlur={(event) => setDrawingColor(normalizeHexColor(event.target.value))}
          aria-label="Drawing color hex"
          disabled={drawingControlsDisabled}
        />
      </label>

      <label className="map-drawing-toolbar-field">
        <span>Size</span>
        <input
          type="range"
          min={1}
          max={maxSize}
          value={clamp(drawingToolState.size, 1, maxSize)}
          onChange={(event) => setDrawingSize(Number(event.target.value))}
          aria-label="Drawing tool size"
          disabled={drawingControlsDisabled}
        />
      </label>

      <label className="map-drawing-toolbar-field">
        <span>Opacity</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(drawingToolState.opacity * 100)}
          onChange={(event) => setDrawingOpacity(Number(event.target.value) / 100)}
          aria-label="Drawing tool opacity"
          disabled={drawingControlsDisabled}
        />
      </label>

      {showsSoftness && (
        <label className="map-drawing-toolbar-field">
          <span>Softness</span>
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(drawingToolState.softness * 100)}
            onChange={(event) => setDrawingSoftness(Number(event.target.value) / 100)}
            aria-label="Drawing tool softness"
            disabled={drawingControlsDisabled}
          />
        </label>
      )}
    </aside>
  );
}
