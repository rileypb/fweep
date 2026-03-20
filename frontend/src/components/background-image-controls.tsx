import { useEffect, useRef, useState } from 'react';
import type { BackgroundReferenceImage } from '../domain/map-types';
import { useEditorStore } from '../state/editor-store';

const IMAGE_REGULAR_FULL_PATH = 'M160 144C151.2 144 144 151.2 144 160L144 480C144 488.8 151.2 496 160 496L480 496C488.8 496 496 488.8 496 480L496 160C496 151.2 488.8 144 480 144L160 144zM96 160C96 124.7 124.7 96 160 96L480 96C515.3 96 544 124.7 544 160L544 480C544 515.3 515.3 544 480 544L160 544C124.7 544 96 515.3 96 480L96 160zM224 192C241.7 192 256 206.3 256 224C256 241.7 241.7 256 224 256C206.3 256 192 241.7 192 224C192 206.3 206.3 192 224 192zM360 264C368.5 264 376.4 268.5 380.7 275.8L460.7 411.8C465.1 419.2 465.1 428.4 460.8 435.9C456.5 443.4 448.6 448 440 448L200 448C191.1 448 182.8 443 178.7 435.1C174.6 427.2 175.2 417.6 180.3 410.3L236.3 330.3C240.8 323.9 248.1 320.1 256 320.1C263.9 320.1 271.2 323.9 275.7 330.3L292.9 354.9L339.4 275.9C343.7 268.6 351.6 264.1 360.1 264.1z';

function readFileAsDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image.'));
    reader.readAsDataURL(file);
  });
}

function loadImageDimensions(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error('Failed to decode image.'));
    image.src = src;
  });
}

async function createBackgroundReferenceImage(
  blob: Blob,
  name: string,
  sourceUrl: string | null,
): Promise<BackgroundReferenceImage> {
  const dataUrl = await readFileAsDataUrl(blob);
  const dimensions = await loadImageDimensions(dataUrl);

  return {
    id: crypto.randomUUID(),
    name,
    mimeType: blob.type || 'application/octet-stream',
    dataUrl,
    sourceUrl,
    width: dimensions.width,
    height: dimensions.height,
    zoom: 1,
    position: { x: 0, y: 0 },
  };
}

export function BackgroundImageControls(): React.JSX.Element {
  const referenceImage = useEditorStore((state) => state.doc?.background.referenceImage ?? null);
  const setBackgroundReferenceImage = useEditorStore((state) => state.setBackgroundReferenceImage);
  const clearBackgroundReferenceImage = useEditorStore((state) => state.clearBackgroundReferenceImage);
  const setBackgroundReferenceImageZoom = useEditorStore((state) => state.setBackgroundReferenceImageZoom);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [zoomPercent, setZoomPercent] = useState('100');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    setZoomPercent(referenceImage ? String(Math.round(referenceImage.zoom * 100)) : '100');
  }, [referenceImage]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const handlePointerDown = (event: MouseEvent): void => {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      if (event.target instanceof Node && container.contains(event.target)) {
        return;
      }

      setIsOpen(false);
      setErrorMessage(null);
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [isOpen]);

  const commitZoomPercent = (value: string): void => {
    if (!referenceImage) {
      return;
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue) || numericValue <= 0) {
      setZoomPercent(String(Math.round(referenceImage.zoom * 100)));
      return;
    }

    setBackgroundReferenceImageZoom(numericValue / 100);
    setZoomPercent(String(numericValue));
  };

  const importBlob = async (blob: Blob, name: string, sourceUrl: string | null): Promise<void> => {
    setIsBusy(true);
    setErrorMessage(null);

    try {
      const image = await createBackgroundReferenceImage(blob, name, sourceUrl);
      setBackgroundReferenceImage(image);
      setIsOpen(true);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Failed to import image.');
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`background-image-controls${isOpen ? ' background-image-controls--open' : ''}`}
    >
      <button
        className="app-control-button"
        type="button"
        aria-label="Background image"
        title="Background image"
        aria-pressed={isOpen}
        onClick={() => {
          setIsOpen((currentValue) => !currentValue);
          setErrorMessage(null);
        }}
      >
        <svg width="24" height="24" viewBox="0 0 640 640" fill="currentColor" aria-hidden="true">
          <path d={IMAGE_REGULAR_FULL_PATH} />
        </svg>
      </button>

      {isOpen && (
        <div className="background-image-panel" data-testid="background-image-panel">
          <div className="background-image-panel__header">
            <strong>Background image</strong>
            {referenceImage && <span>{referenceImage.name}</span>}
          </div>

          <input
            ref={fileInputRef}
            className="background-image-panel__file-input"
            type="file"
            accept="image/*"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) {
                return;
              }

              void importBlob(file, file.name, null);
              event.target.value = '';
            }}
          />

          <div className="background-image-panel__actions">
            <button
              type="button"
              className="export-png-secondary"
              disabled={isBusy}
              onClick={() => fileInputRef.current?.click()}
            >
              Upload image
            </button>
            {referenceImage && (
              <button
                type="button"
                className="export-png-secondary"
                disabled={isBusy}
                onClick={() => {
                  clearBackgroundReferenceImage();
                  setErrorMessage(null);
                }}
              >
                Remove
              </button>
            )}
          </div>

          {referenceImage && (
            <>
              <label className="background-image-panel__field">
                <span>Zoom (%)</span>
                <input
                  aria-label="Background image zoom"
                  type="text"
                  inputMode="decimal"
                  pattern="[0-9]*[.]?[0-9]*"
                  value={zoomPercent}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    if (nextValue === '' || /^\d*\.?\d*$/.test(nextValue)) {
                      setZoomPercent(nextValue);
                    }
                  }}
                  onBlur={(event) => {
                    commitZoomPercent(event.target.value);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitZoomPercent((event.target as HTMLInputElement).value);
                      (event.target as HTMLInputElement).blur();
                    }
                    if (event.key === 'Escape' && referenceImage) {
                      event.preventDefault();
                      setZoomPercent(String(Math.round(referenceImage.zoom * 100)));
                      (event.target as HTMLInputElement).blur();
                    }
                  }}
                />
              </label>
              <p className="background-image-panel__meta">
                Option-drag or Command-drag on the canvas to recenter. Native size: {referenceImage.width} x {referenceImage.height}px.
              </p>
            </>
          )}

          {errorMessage && (
            <p className="background-image-panel__error" role="alert">{errorMessage}</p>
          )}
        </div>
      )}
    </div>
  );
}
