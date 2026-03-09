import { useEffect, useId, useRef, useState } from 'react';
import { normalizeHexColor } from './map-background-raster';
import { useEditorStore, type CanvasInteractionMode, type DrawingTool } from '../state/editor-store';

const TOOL_LABELS: readonly { readonly tool: DrawingTool; readonly label: string }[] = [
  { tool: 'pencil', label: 'Pencil' },
  { tool: 'brush', label: 'Brush' },
  { tool: 'eraser', label: 'Eraser' },
  { tool: 'bucket', label: 'Bucket fill' },
  { tool: 'line', label: 'Line' },
  { tool: 'rectangle', label: 'Rectangle' },
  { tool: 'ellipse', label: 'Ellipse' },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type RgbColor = {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
};

type HsvColor = {
  readonly hue: number;
  readonly saturation: number;
  readonly value: number;
};

function parseHexColor(hex: string): RgbColor {
  const normalized = normalizeHexColor(hex);
  return {
    red: Number.parseInt(normalized.slice(1, 3), 16),
    green: Number.parseInt(normalized.slice(3, 5), 16),
    blue: Number.parseInt(normalized.slice(5, 7), 16),
  };
}

function toHexChannel(channel: number): string {
  return clamp(Math.round(channel), 0, 255).toString(16).padStart(2, '0');
}

function rgbToHex({ red, green, blue }: RgbColor): string {
  return `#${toHexChannel(red)}${toHexChannel(green)}${toHexChannel(blue)}`;
}

function rgbToHsv({ red, green, blue }: RgbColor): HsvColor {
  const normalizedRed = red / 255;
  const normalizedGreen = green / 255;
  const normalizedBlue = blue / 255;
  const maxChannel = Math.max(normalizedRed, normalizedGreen, normalizedBlue);
  const minChannel = Math.min(normalizedRed, normalizedGreen, normalizedBlue);
  const delta = maxChannel - minChannel;

  let hue = 0;
  if (delta !== 0) {
    if (maxChannel === normalizedRed) {
      hue = 60 * (((normalizedGreen - normalizedBlue) / delta) % 6);
    } else if (maxChannel === normalizedGreen) {
      hue = 60 * (((normalizedBlue - normalizedRed) / delta) + 2);
    } else {
      hue = 60 * (((normalizedRed - normalizedGreen) / delta) + 4);
    }
  }

  return {
    hue: hue < 0 ? hue + 360 : hue,
    saturation: maxChannel === 0 ? 0 : delta / maxChannel,
    value: maxChannel,
  };
}

function hsvToRgb({ hue, saturation, value }: HsvColor): RgbColor {
  const safeHue = ((hue % 360) + 360) % 360;
  const chroma = value * saturation;
  const secondComponent = chroma * (1 - Math.abs(((safeHue / 60) % 2) - 1));
  const match = value - chroma;

  let red = 0;
  let green = 0;
  let blue = 0;

  if (safeHue < 60) {
    red = chroma;
    green = secondComponent;
  } else if (safeHue < 120) {
    red = secondComponent;
    green = chroma;
  } else if (safeHue < 180) {
    green = chroma;
    blue = secondComponent;
  } else if (safeHue < 240) {
    green = secondComponent;
    blue = chroma;
  } else if (safeHue < 300) {
    red = secondComponent;
    blue = chroma;
  } else {
    red = chroma;
    blue = secondComponent;
  }

  return {
    red: (red + match) * 255,
    green: (green + match) * 255,
    blue: (blue + match) * 255,
  };
}

function hexToHsv(hex: string): HsvColor {
  return rgbToHsv(parseHexColor(hex));
}

function hsvToHex(color: HsvColor): string {
  return rgbToHex(hsvToRgb(color));
}

type ColorPickerFieldProps = {
  label: string;
  value: string;
  onChange: (nextValue: string) => void;
  inputAriaLabel: string;
  buttonAriaLabel: string;
};

function ColorPickerField({
  label,
  value,
  onChange,
  inputAriaLabel,
  buttonAriaLabel,
}: ColorPickerFieldProps): React.JSX.Element {
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const colorPickerId = useId();
  const fieldRef = useRef<HTMLDivElement | null>(null);
  const currentColor = hexToHsv(value);
  const hueColor = `hsl(${currentColor.hue}deg 100% 50%)`;

  useEffect(() => {
    if (!isPickerOpen) {
      return undefined;
    }

    const handlePointerDown = (event: PointerEvent): void => {
      if (fieldRef.current?.contains(event.target as Node)) {
        return;
      }
      setIsPickerOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setIsPickerOpen(false);
      }
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isPickerOpen]);

  const updateSaturationValue = (event: React.PointerEvent<HTMLDivElement>): void => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || bounds.height <= 0) {
      return;
    }

    const saturation = clamp((event.clientX - bounds.left) / bounds.width, 0, 1);
    const nextValue = clamp(1 - ((event.clientY - bounds.top) / bounds.height), 0, 1);
    onChange(hsvToHex({ hue: currentColor.hue, saturation, value: nextValue }));
  };

  return (
    <div ref={fieldRef} className="map-drawing-toolbar-field map-drawing-toolbar-field--color">
      <span>{label}</span>
      <button
        type="button"
        className="map-drawing-color-swatch"
        aria-label={buttonAriaLabel}
        aria-controls={colorPickerId}
        aria-expanded={isPickerOpen}
        onClick={() => setIsPickerOpen((currentValue) => !currentValue)}
        style={{ '--swatch-color': normalizeHexColor(value) } as React.CSSProperties}
      />
      {isPickerOpen && (
        <div id={colorPickerId} className="map-drawing-color-picker-popover" aria-label={inputAriaLabel}>
          <div
            className="map-drawing-color-surface"
            aria-label={`${inputAriaLabel} surface`}
            onPointerDown={updateSaturationValue}
            onPointerMove={(event) => {
              if ((event.buttons & 1) === 0) {
                return;
              }
              updateSaturationValue(event);
            }}
            style={{ '--hue-color': hueColor } as React.CSSProperties}
          >
            <span
              className="map-drawing-color-surface-thumb"
              aria-hidden="true"
              style={{
                left: `${currentColor.saturation * 100}%`,
                top: `${(1 - currentColor.value) * 100}%`,
              }}
            />
          </div>
          <div className="map-drawing-color-picker-controls">
            <span
              className="map-drawing-color-picker-preview"
              aria-hidden="true"
              style={{ '--swatch-color': normalizeHexColor(value) } as React.CSSProperties}
            />
            <input
              className="map-drawing-color-hue-slider"
              type="range"
              min={0}
              max={360}
              value={Math.round(currentColor.hue)}
              onChange={(event) => {
                onChange(
                  hsvToHex({
                    hue: Number(event.target.value),
                    saturation: currentColor.saturation,
                    value: currentColor.value,
                  }),
                );
              }}
              aria-label={`${inputAriaLabel} hue`}
            />
          </div>
        </div>
      )}
    </div>
  );
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

function PencilGlyph(): React.JSX.Element {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M4 20l3.8-.9L18.9 8a1.7 1.7 0 0 0 0-2.4l-.5-.5a1.7 1.7 0 0 0-2.4 0L4.9 16.2 4 20Z" />
      <path d="m13.5 6.5 4 4" />
      <path d="M4 20l3.2-3.2" />
    </svg>
  );
}

function BrushGlyph(): React.JSX.Element {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m10.8 11.5 7.9-7.9c.8-.8 2.1-.8 2.9 0 .8.8.8 2.1 0 2.9l-7.9 7.9" />
      <path d="m8.8 13.5 2-2 4.1 4.1-2 2" />
      <path d="M3.2 20.8c1.5-1 1.8-2.1 1.8-3.1 0-2.2 1.5-4 3.6-4h.3l4 4v.3c0 2.1-1.8 3.6-4 3.6-1.1 0-2.1.4-3.1 1.2 0 0 .6-1.2-.3-2-.9-.9-2.3-.3-2.3-.3Z" />
      <path d="M18.8 5.2a.9.9 0 1 0 1.8 0 .9.9 0 0 0-1.8 0Z" />
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

function EraserGlyph(): React.JSX.Element {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <g transform="rotate(-45 12 12)">
        <rect x="6" y="4" width="12" height="16" rx="2.8" fill="#f8fafc" stroke="currentColor" strokeWidth="1.8" />
        <path d="M6 13h12v4.2A2.8 2.8 0 0 1 15.2 20H8.8A2.8 2.8 0 0 1 6 17.2V13Z" fill="#111827" />
        <path d="M6 13h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function BucketGlyph(): React.JSX.Element {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <g transform="translate(-1.8 1.2)">
        <g transform="translate(24 0) scale(-1 1)">
          <path d="M7.1 1 17.6 11.5a1.7 1.7 0 0 1 0 2.4l-5.8 5.8a1.7 1.7 0 0 1-2.4 0L.5 10.8a1.7 1.7 0 0 1 0-2.4L6.3 .7" />
        </g>
        <path d="M24 8.4v9.6" />
        <path d="M21.6 5.9 23.4 7.7" />
      </g>
    </svg>
  );
}

function LineGlyph(): React.JSX.Element {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="6" cy="18" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <path d="M7.8 16.2 16.2 7.8" />
    </svg>
  );
}

function RectangleGlyph(): React.JSX.Element {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="6" width="14" height="12" rx="1.5" />
    </svg>
  );
}

function EllipseGlyph(): React.JSX.Element {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <ellipse cx="12" cy="12" rx="7" ry="5.5" />
    </svg>
  );
}

function ToolGlyph({ tool }: { tool: DrawingTool }): React.JSX.Element {
  if (tool === 'pencil') {
    return <PencilGlyph />;
  }
  if (tool === 'brush') {
    return <BrushGlyph />;
  }
  if (tool === 'bucket') {
    return <BucketGlyph />;
  }
  if (tool === 'line') {
    return <LineGlyph />;
  }
  if (tool === 'rectangle') {
    return <RectangleGlyph />;
  }
  if (tool === 'ellipse') {
    return <EllipseGlyph />;
  }
  return <EraserGlyph />;
}

export function MapDrawingToolbar(): React.JSX.Element {
  const drawingToolState = useEditorStore((state) => state.drawingToolState);
  const canvasInteractionMode = useEditorStore((state) => state.canvasInteractionMode);
  const setDrawingTool = useEditorStore((state) => state.setDrawingTool);
  const setCanvasInteractionMode = useEditorStore((state) => state.setCanvasInteractionMode);
  const setDrawingColor = useEditorStore((state) => state.setDrawingColor);
  const setDrawingFillColor = useEditorStore((state) => state.setDrawingFillColor);
  const setDrawingOpacity = useEditorStore((state) => state.setDrawingOpacity);
  const setDrawingSize = useEditorStore((state) => state.setDrawingSize);
  const setDrawingSoftness = useEditorStore((state) => state.setDrawingSoftness);
  const setShapeFilled = useEditorStore((state) => state.setShapeFilled);
  const setBucketTolerance = useEditorStore((state) => state.setBucketTolerance);
  const setBucketObeyMap = useEditorStore((state) => state.setBucketObeyMap);
  const showsSize = drawingToolState.tool !== 'bucket';
  const maxSize = drawingToolState.tool === 'pencil' ? 6 : 64;
  const showsSoftness = drawingToolState.tool !== 'pencil' && drawingToolState.tool !== 'bucket';
  const showsShapeFill = drawingToolState.tool === 'rectangle' || drawingToolState.tool === 'ellipse';
  const showsBucketTolerance = drawingToolState.tool === 'bucket';
  const nextMode: CanvasInteractionMode = canvasInteractionMode === 'map' ? 'draw' : 'map';
  const modeButtonLabel = canvasInteractionMode === 'map' ? 'Switch to draw mode' : 'Switch to map mode';
  const activateDrawMode = (): void => {
    setCanvasInteractionMode('draw');
  };

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
            className={`map-drawing-tool-button map-drawing-tool-button--icon${drawingToolState.tool === tool ? ' map-drawing-tool-button--active' : ''}`}
            onClick={() => {
              setDrawingTool(tool);
              activateDrawMode();
            }}
            aria-pressed={drawingToolState.tool === tool}
            aria-label={label}
            title={label}
          >
            <ToolGlyph tool={tool} />
          </button>
        ))}
      </div>

      <ColorPickerField
        label="Stroke"
        value={drawingToolState.colorRgbHex}
        buttonAriaLabel="Stroke"
        inputAriaLabel="Stroke color picker"
        onChange={(nextValue) => {
          setDrawingColor(nextValue);
          activateDrawMode();
        }}
      />

      <label className="map-drawing-toolbar-field">
        <span>Stroke hex</span>
        <input
          type="text"
          value={drawingToolState.colorRgbHex}
          onChange={(event) => {
            setDrawingColor(event.target.value);
            activateDrawMode();
          }}
          onBlur={(event) => {
            setDrawingColor(normalizeHexColor(event.target.value));
            activateDrawMode();
          }}
          aria-label="Drawing color hex"
        />
      </label>

      {showsShapeFill && (
        <>
          <ColorPickerField
            label="Fill color"
            value={drawingToolState.fillColorRgbHex}
            buttonAriaLabel="Fill color swatch"
            inputAriaLabel="Fill color"
            onChange={(nextValue) => {
              setDrawingFillColor(nextValue);
              activateDrawMode();
            }}
          />

          <label className="map-drawing-toolbar-field">
            <span>Fill hex</span>
            <input
              type="text"
              value={drawingToolState.fillColorRgbHex}
              onChange={(event) => {
                setDrawingFillColor(event.target.value);
                activateDrawMode();
              }}
              onBlur={(event) => {
                setDrawingFillColor(normalizeHexColor(event.target.value));
                activateDrawMode();
              }}
              aria-label="Fill color hex"
            />
          </label>
        </>
      )}

      {showsSize && (
        <label className="map-drawing-toolbar-field">
          <span>Size</span>
          <input
            type="range"
            min={1}
            max={maxSize}
            value={clamp(drawingToolState.size, 1, maxSize)}
            onChange={(event) => {
              setDrawingSize(Number(event.target.value));
              activateDrawMode();
            }}
            aria-label="Drawing tool size"
          />
        </label>
      )}

      <label className="map-drawing-toolbar-field">
        <span>Opacity</span>
        <input
          type="range"
          min={0}
          max={100}
          value={Math.round(drawingToolState.opacity * 100)}
          onChange={(event) => {
            setDrawingOpacity(Number(event.target.value) / 100);
            activateDrawMode();
          }}
          aria-label="Drawing tool opacity"
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
            onChange={(event) => {
              setDrawingSoftness(Number(event.target.value) / 100);
              activateDrawMode();
            }}
            aria-label="Drawing tool softness"
          />
        </label>
      )}

      {showsBucketTolerance && (
        <>
          <label className="map-drawing-toolbar-field">
            <span>Tolerance</span>
            <input
              type="range"
              min={0}
              max={255}
              value={drawingToolState.bucketTolerance}
              onChange={(event) => {
                setBucketTolerance(Number(event.target.value));
                activateDrawMode();
              }}
              aria-label="Bucket fill tolerance"
            />
          </label>

          <label className="map-drawing-toolbar-field">
            <span>Obey Map</span>
            <input
              type="checkbox"
              checked={drawingToolState.bucketObeyMap}
              onChange={(event) => {
                setBucketObeyMap(event.target.checked);
                activateDrawMode();
              }}
              aria-label="Obey map"
            />
          </label>
        </>
      )}

      {showsShapeFill && (
        <label className="map-drawing-toolbar-field">
          <span>Fill</span>
          <input
            type="checkbox"
            checked={drawingToolState.shapeFilled}
            onChange={(event) => {
              setShapeFilled(event.target.checked);
              activateDrawMode();
            }}
            aria-label="Fill shape"
          />
        </label>
      )}
    </aside>
  );
}
