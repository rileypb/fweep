import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import type { Position } from '../domain/map-types';
import { useDocumentTheme } from './map-canvas-helpers';
import { useEditorStore, type ExportRegionDraft } from '../state/editor-store';
import { getExportBounds, validateExportBounds } from '../export/export-bounds';
import { exportPngToDownload } from '../export/export-png';
import { renderExportCanvas } from '../export/export-render';
import type { ExportRegion, ExportScope, ExportSettings } from '../export/export-types';

export interface ExportPngDialogProps {
  readonly isOpen: boolean;
  readonly mapName: string;
  readonly onClose: () => void;
  readonly canvasViewportSize: { readonly width: number; readonly height: number };
  readonly panOffset: Position;
  readonly onScopeChange: (scope: ExportScope) => void;
  readonly onRequestRegionSelection: () => void;
  readonly preferredInitialScope?: ExportScope | null;
}

const DEFAULT_SETTINGS_BY_SCOPE: Readonly<Record<ExportScope, ExportSettings>> = {
  'entire-map': {
    scope: 'entire-map',
    padding: 80,
    scale: 2,
    background: 'theme-canvas',
    includeBackgroundDrawing: true,
    includeGrid: false,
  },
  viewport: {
    scope: 'viewport',
    padding: 0,
    scale: 2,
    background: 'theme-canvas',
    includeBackgroundDrawing: true,
    includeGrid: false,
  },
  selection: {
    scope: 'selection',
    padding: 80,
    scale: 2,
    background: 'theme-canvas',
    includeBackgroundDrawing: true,
    includeGrid: false,
  },
  region: {
    scope: 'region',
    padding: 0,
    scale: 2,
    background: 'theme-canvas',
    includeBackgroundDrawing: true,
    includeGrid: false,
  },
};

function getDefaultScope(hasSelection: boolean): ExportScope {
  return hasSelection ? 'selection' : 'entire-map';
}

function getDraftRegion(draft: ExportRegionDraft | null): ExportRegion | null {
  if (!draft) {
    return null;
  }

  return {
    left: Math.min(draft.start.x, draft.current.x),
    top: Math.min(draft.start.y, draft.current.y),
    right: Math.max(draft.start.x, draft.current.x),
    bottom: Math.max(draft.start.y, draft.current.y),
  };
}

export function ExportPngDialog({
  isOpen,
  mapName,
  onClose,
  canvasViewportSize,
  panOffset,
  onScopeChange,
  onRequestRegionSelection,
  preferredInitialScope = null,
}: ExportPngDialogProps): React.JSX.Element | null {
  const doc = useEditorStore((state) => state.doc);
  const selectedRoomIds = useEditorStore((state) => state.selectedRoomIds);
  const selectedStickyNoteIds = useEditorStore((state) => state.selectedStickyNoteIds);
  const selectedConnectionIds = useEditorStore((state) => state.selectedConnectionIds);
  const selectedStickyNoteLinkIds = useEditorStore((state) => state.selectedStickyNoteLinkIds);
  const exportRegion = useEditorStore((state) => state.exportRegion);
  const exportRegionDraft = useEditorStore((state) => state.exportRegionDraft);
  const clearExportRegion = useEditorStore((state) => state.clearExportRegion);
  const theme = useDocumentTheme();
  const hasSelection = selectedRoomIds.length > 0
    || selectedStickyNoteIds.length > 0
    || selectedConnectionIds.length > 0
    || selectedStickyNoteLinkIds.length > 0;
  const [settings, setSettings] = useState<ExportSettings>(DEFAULT_SETTINGS_BY_SCOPE['entire-map']);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  useLayoutEffect(() => {
    if (!isOpen) {
      return;
    }

    const nextScope = preferredInitialScope ?? getDefaultScope(hasSelection);
    setSettings(DEFAULT_SETTINGS_BY_SCOPE[nextScope]);
    setRuntimeError(null);
    onScopeChange(nextScope);
  }, [hasSelection, isOpen, onScopeChange, preferredInitialScope]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return;
      }

      const hasRegion = exportRegion !== null || exportRegionDraft !== null;
      if (settings.scope === 'region' && hasRegion) {
        clearExportRegion();
        return;
      }

      clearExportRegion();
      onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [clearExportRegion, exportRegion, exportRegionDraft, isOpen, onClose, settings.scope]);

  const effectiveRegion = exportRegion ?? getDraftRegion(exportRegionDraft);
  const boundsResult = useMemo(() => {
    if (!doc) {
      return {
        bounds: null,
        validationError: {
          code: 'empty' as const,
          message: 'Nothing to export.',
        },
      };
    }

    return getExportBounds({
      doc,
      settings,
      selectedRoomIds,
      selectedStickyNoteIds,
      selectedConnectionIds,
      selectedStickyNoteLinkIds,
      viewportSize: canvasViewportSize,
      mapPanOffset: panOffset,
      region: effectiveRegion,
    });
  }, [canvasViewportSize, doc, effectiveRegion, panOffset, selectedConnectionIds, selectedRoomIds, selectedStickyNoteIds, selectedStickyNoteLinkIds, settings]);

  const sizeValidationError = useMemo(
    () => validateExportBounds(boundsResult.bounds, settings.scale),
    [boundsResult.bounds, settings.scale],
  );

  const activeValidationError = sizeValidationError ?? boundsResult.validationError;
  const displayedValidationError = settings.scope === 'region' && !effectiveRegion
    ? sizeValidationError
    : activeValidationError;
  const bounds = boundsResult.bounds;
  const mapWidth = bounds ? Math.max(0, Math.round(bounds.right - bounds.left)) : 0;
  const mapHeight = bounds ? Math.max(0, Math.round(bounds.bottom - bounds.top)) : 0;
  const outputWidth = Math.ceil(mapWidth * settings.scale);
  const outputHeight = Math.ceil(mapHeight * settings.scale);

  if (!isOpen) {
    return null;
  }

  const closeDialog = (): void => {
    clearExportRegion();
    onClose();
  };

  const handleScopeChange = (scope: ExportScope): void => {
    setSettings((currentValue) => ({
      ...DEFAULT_SETTINGS_BY_SCOPE[scope],
      scale: currentValue.scale,
      background: currentValue.background,
      includeBackgroundDrawing: currentValue.includeBackgroundDrawing,
      includeGrid: currentValue.includeGrid,
    }));
    setRuntimeError(null);
    onScopeChange(scope);
  };

  const handleExport = async (): Promise<void> => {
    if (!doc || !bounds || activeValidationError) {
      return;
    }

    setIsExporting(true);
    setRuntimeError(null);

    try {
      const canvas = await renderExportCanvas({
        doc,
        theme,
        settings,
        bounds,
        viewportSize: canvasViewportSize,
        mapPanOffset: panOffset,
        selectedRoomIds,
        selectedStickyNoteIds,
        selectedConnectionIds,
        selectedStickyNoteLinkIds,
      });
      await exportPngToDownload({
        mapName,
        scope: settings.scope,
        canvas,
      });
      closeDialog();
    } catch (error) {
      setRuntimeError(error instanceof Error ? error.message : 'Export failed.');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="export-png-overlay" data-testid="export-png-overlay">
      <div className="export-png-backdrop" aria-hidden="true" onClick={closeDialog} />
      <div
        className="export-png-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Export PNG"
        data-testid="export-png-dialog"
      >
        <button className="export-png-close" type="button" aria-label="Close export dialog" onClick={closeDialog}>
          ×
        </button>
        <div className="export-png-content">
          <h2 className="export-png-heading">Export PNG</h2>

          <label className="export-png-field">
            <span>Scope</span>
            <select
              aria-label="Scope"
              value={settings.scope}
              onChange={(event) => handleScopeChange(event.target.value as ExportScope)}
            >
              <option value="entire-map">Entire map</option>
              <option value="viewport">Visible viewport</option>
              <option value="selection" disabled={!hasSelection}>Selection</option>
              <option value="region">Region</option>
            </select>
          </label>

          {!hasSelection && settings.scope === 'selection' && (
            <p className="export-png-help">Select rooms, sticky notes, connections, or sticky-note links first.</p>
          )}
          {settings.scope === 'region' && (
            <div className="export-png-region-row">
              <button
                type="button"
                className="export-png-secondary"
                onClick={onRequestRegionSelection}
              >
                Select Region
              </button>
              <p className="export-png-help">
                {effectiveRegion ? 'Drag again to replace the current export region.' : 'Select Region, then drag on the canvas.'}
              </p>
            </div>
          )}

          <label className="export-png-field">
            <span>Padding</span>
            <input
              type="number"
              aria-label="Padding"
              min={0}
              value={settings.padding}
              onChange={(event) => setSettings((currentValue) => ({
                ...currentValue,
                padding: Math.max(0, Number(event.target.value)),
              }))}
            />
          </label>

          <label className="export-png-field">
            <span>Scale</span>
            <select
              aria-label="Scale"
              value={String(settings.scale)}
              onChange={(event) => setSettings((currentValue) => ({
                ...currentValue,
                scale: Number(event.target.value) as ExportSettings['scale'],
              }))}
            >
              <option value="1">1x</option>
              <option value="2">2x</option>
              <option value="4">4x</option>
            </select>
          </label>

          <label className="export-png-field">
            <span>Background</span>
            <select
              aria-label="Background"
              value={settings.background}
              onChange={(event) => setSettings((currentValue) => ({
                ...currentValue,
                background: event.target.value as ExportSettings['background'],
              }))}
            >
              <option value="theme-canvas">Theme canvas</option>
              <option value="white">White</option>
              <option value="transparent">Transparent</option>
            </select>
          </label>

          <label className="export-png-checkbox">
            <input
              type="checkbox"
              aria-label="Include background drawing"
              checked={settings.includeBackgroundDrawing}
              onChange={(event) => setSettings((currentValue) => ({
                ...currentValue,
                includeBackgroundDrawing: event.target.checked,
              }))}
            />
            <span>Include background drawing</span>
          </label>

          <label className="export-png-checkbox">
            <input
              type="checkbox"
              aria-label="Include grid"
              checked={settings.includeGrid}
              onChange={(event) => setSettings((currentValue) => ({
                ...currentValue,
                includeGrid: event.target.checked,
              }))}
            />
            <span>Include grid</span>
          </label>

          <div className="export-png-summary">
            <div>Exported area: {mapWidth} x {mapHeight} map px</div>
            <div>Output image: {outputWidth} x {outputHeight} image px</div>
          </div>

          {(displayedValidationError || runtimeError) && (
            <p className="export-png-error">{runtimeError ?? displayedValidationError?.message}</p>
          )}

          <div className="export-png-actions">
            <button type="button" className="export-png-secondary" onClick={closeDialog}>Cancel</button>
            <button
              type="button"
              className="export-png-primary"
              onClick={() => {
                void handleExport();
              }}
              disabled={Boolean(activeValidationError) || isExporting}
            >
              {isExporting ? 'Exporting…' : 'Export PNG'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
