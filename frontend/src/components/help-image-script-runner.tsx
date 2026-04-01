import { useMemo, useState } from 'react';
import fromToScriptText from '../content/create/from-to.txt?raw';
import { getExportBounds, validateExportBounds } from '../export/export-bounds';
import { renderExportCanvas } from '../export/export-render';
import { canvasToBlob } from './map-background-raster';
import type { ExportSettings } from '../export/export-types';
import {
  clearHelpImageScriptState,
  createHelpImageScriptState,
  parseHelpImageScript,
  runHelpImageMapCommand,
  type HelpImageScriptState,
} from '../domain/help-image-script';

declare global {
  interface Window {
    showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
  }
}

const HELP_IMAGE_EXPORT_SETTINGS: ExportSettings = {
  scope: 'entire-map',
  padding: 80,
  scale: 2,
  background: 'theme-canvas',
  includeBackgroundImage: true,
  includeBackgroundDrawing: true,
  includeGrid: true,
};

function isHelpImageScriptRunnerEnabled(): boolean {
  return import.meta.env?.DEV === true
    || (globalThis as { __FWEEP_TEST_DEV__?: boolean }).__FWEEP_TEST_DEV__ === true;
}

async function writeBlobToDirectory(
  directoryHandle: FileSystemDirectoryHandle,
  fileName: string,
  blob: Blob,
): Promise<void> {
  const fileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(blob);
  } finally {
    await writable.close();
  }
}

export function HelpImageScriptRunner(): React.JSX.Element | null {
  const scriptSteps = useMemo(() => parseHelpImageScript(fromToScriptText), []);
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  if (!isHelpImageScriptRunnerEnabled()) {
    return null;
  }

  const handleChooseDirectory = async (): Promise<void> => {
    if (typeof window.showDirectoryPicker !== 'function') {
      setErrorMessage('This browser does not support choosing an output folder for direct writes.');
      return;
    }

    try {
      const selectedDirectoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
      setDirectoryHandle(selectedDirectoryHandle);
      setErrorMessage(null);
      setStatusMessage(`Output folder: ${selectedDirectoryHandle.name}`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }

      setErrorMessage(error instanceof Error ? error.message : 'Could not open the output folder picker.');
    }
  };

  const handleRunScript = async (): Promise<void> => {
    if (directoryHandle === null) {
      setErrorMessage('Choose an output folder first.');
      return;
    }

    setIsRunning(true);
    setErrorMessage(null);
    setStatusMessage('Generating help images...');

    try {
      let state: HelpImageScriptState = createHelpImageScriptState('Help Images');
      let exportCount = 0;

      for (const step of scriptSteps) {
        if (step.kind === 'clear') {
          state = clearHelpImageScriptState(state);
          continue;
        }

        if (step.kind === 'map-command') {
          state = runHelpImageMapCommand(state, step.commandText);
          continue;
        }

        const boundsResult = getExportBounds({
          doc: state.doc,
          settings: HELP_IMAGE_EXPORT_SETTINGS,
          selectedRoomIds: [],
          selectedStickyNoteIds: [],
          selectedConnectionIds: [],
          selectedStickyNoteLinkIds: [],
          viewportSize: { width: 800, height: 600 },
          mapPanOffset: { x: 0, y: 0 },
          viewportZoom: 1,
          region: null,
        });
        const validationError = validateExportBounds(boundsResult.bounds, HELP_IMAGE_EXPORT_SETTINGS.scale)
          ?? boundsResult.validationError;
        if (!boundsResult.bounds || validationError) {
          throw new Error(`Line ${step.lineNumber}: ${validationError?.message ?? 'Nothing to export.'}`);
        }

        const canvas = await renderExportCanvas({
          doc: state.doc,
          theme: 'light',
          settings: HELP_IMAGE_EXPORT_SETTINGS,
          bounds: boundsResult.bounds,
          viewportSize: { width: 800, height: 600 },
          mapPanOffset: { x: 0, y: 0 },
          viewportZoom: 1,
          selectedRoomIds: [],
          selectedStickyNoteIds: [],
          selectedConnectionIds: [],
          selectedStickyNoteLinkIds: [],
        });
        const blob = await canvasToBlob(canvas);
        await writeBlobToDirectory(directoryHandle, step.fileName, blob);
        exportCount += 1;
      }

      setStatusMessage(`Generated ${exportCount} help image${exportCount === 1 ? '' : 's'} in ${directoryHandle.name}.`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Help image generation failed.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="cli-help-panel__script-runner" data-testid="help-image-script-runner">
      <div className="cli-help-panel__script-runner-header">dev image generator</div>
      <p className="cli-help-panel__script-runner-copy">
        Runs <code className="cli-help-panel__inline-code">from-to.txt</code> and writes PNGs directly into a chosen folder.
      </p>
      <div className="cli-help-panel__script-runner-actions">
        <button
          type="button"
          className="cli-help-panel__script-button"
          onClick={() => {
            void handleChooseDirectory();
          }}
          disabled={isRunning}
        >
          Choose output folder
        </button>
        <button
          type="button"
          className="cli-help-panel__script-button cli-help-panel__script-button--primary"
          onClick={() => {
            void handleRunScript();
          }}
          disabled={isRunning || directoryHandle === null}
        >
          {isRunning ? 'Generating...' : 'Generate images'}
        </button>
      </div>
      {statusMessage ? <p className="cli-help-panel__script-status">{statusMessage}</p> : null}
      {errorMessage ? <p className="cli-help-panel__script-error">{errorMessage}</p> : null}
    </div>
  );
}
