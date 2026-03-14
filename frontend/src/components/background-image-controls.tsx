import { useEffect, useRef, useState } from 'react';
import type { BackgroundReferenceImage } from '../domain/map-types';
import { useEditorStore } from '../state/editor-store';

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

function getImageNameFromUrl(url: string): string {
  try {
    const parsedUrl = new URL(url);
    const pathname = parsedUrl.pathname.split('/').filter(Boolean);
    return pathname[pathname.length - 1] || parsedUrl.hostname || 'background-image';
  } catch {
    return 'background-image';
  }
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
  };
}

export function BackgroundImageControls(): React.JSX.Element {
  const referenceImage = useEditorStore((state) => state.doc?.background.referenceImage ?? null);
  const setBackgroundReferenceImage = useEditorStore((state) => state.setBackgroundReferenceImage);
  const clearBackgroundReferenceImage = useEditorStore((state) => state.clearBackgroundReferenceImage);
  const setBackgroundReferenceImageZoom = useEditorStore((state) => state.setBackgroundReferenceImageZoom);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [urlValue, setUrlValue] = useState('');
  const [zoomPercent, setZoomPercent] = useState('100');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    setZoomPercent(referenceImage ? String(Math.round(referenceImage.zoom * 100)) : '100');
  }, [referenceImage]);

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
    <div className={`background-image-controls${isOpen ? ' background-image-controls--open' : ''}`}>
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
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <rect x="2.25" y="3" width="11.5" height="10" rx="1.5" />
          <circle cx="5.25" cy="6" r="1" fill="currentColor" stroke="none" />
          <path d="M4 11 7 8l1.75 1.75L10.5 8l1.5 3" strokeLinecap="round" strokeLinejoin="round" />
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

          <label className="background-image-panel__field">
            <span>Import from URL</span>
            <div className="background-image-panel__url-row">
              <input
                type="url"
                value={urlValue}
                placeholder="https://example.com/map.png"
                onChange={(event) => setUrlValue(event.target.value)}
              />
              <button
                type="button"
                className="export-png-secondary"
                disabled={isBusy || urlValue.trim().length === 0}
                onClick={() => {
                  void (async () => {
                    setIsBusy(true);
                    setErrorMessage(null);
                    try {
                      const trimmedUrl = urlValue.trim();
                      const response = await fetch(trimmedUrl);
                      if (!response.ok) {
                        throw new Error(`Image request failed (${response.status}).`);
                      }

                      const blob = await response.blob();
                      if (!blob.type.startsWith('image/')) {
                        throw new Error('URL did not return an image.');
                      }

                      const name = getImageNameFromUrl(trimmedUrl);
                      const image = await createBackgroundReferenceImage(blob, name, trimmedUrl);
                      setBackgroundReferenceImage(image);
                      setIsOpen(true);
                    } catch (error) {
                      setErrorMessage(error instanceof Error ? error.message : 'Failed to import image URL.');
                    } finally {
                      setIsBusy(false);
                    }
                  })();
                }}
              >
                Import
              </button>
            </div>
          </label>

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
                Centered on map origin. Native size: {referenceImage.width} x {referenceImage.height}px.
              </p>
              {referenceImage.sourceUrl && (
                <p className="background-image-panel__meta">Stored from URL: {referenceImage.sourceUrl}</p>
              )}
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
