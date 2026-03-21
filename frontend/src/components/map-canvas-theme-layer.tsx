import { useEffect, useRef } from 'react';
import { createSizedCanvas } from './map-background-raster';
import {
  drawPaperTexture,
  getPaperTextureBaseColor,
} from '../graph/perlin-paper-texture';
import {
  drawContourLandscapeTexture,
  getContourLandscapeBaseColor,
} from '../graph/contour-landscape-texture';

interface MapCanvasThemeLayerProps {
  readonly mapId: string | null;
  readonly textureSeed: number | null;
  readonly canvasTheme: 'default' | 'paper' | 'antique' | 'contour';
  readonly theme: 'light' | 'dark';
  readonly panOffset: { readonly x: number; readonly y: number };
  readonly zoom: number;
  readonly canvasRect: DOMRect | null;
}

function getBaseBackgroundColor(
  canvasTheme: MapCanvasThemeLayerProps['canvasTheme'],
  theme: MapCanvasThemeLayerProps['theme'],
): string {
  if (canvasTheme === 'paper') {
    return getPaperTextureBaseColor(theme);
  }

  if (canvasTheme === 'antique' || canvasTheme === 'contour') {
    return getContourLandscapeBaseColor(theme);
  }

  return theme === 'dark' ? '#282828' : '#ffffff';
}

function isJsdomEnvironment(): boolean {
  return typeof navigator !== 'undefined' && /\bjsdom\b/i.test(navigator.userAgent);
}

export function MapCanvasThemeLayer({
  mapId,
  textureSeed,
  canvasTheme,
  theme,
  panOffset,
  zoom,
  canvasRect,
}: MapCanvasThemeLayerProps): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderVersionRef = useRef(0);
  const backgroundColor = getBaseBackgroundColor(canvasTheme, theme);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !canvasRect) {
      return;
    }

    if (isJsdomEnvironment()) {
      return;
    }

    const cssWidth = Math.max(1, Math.round(canvasRect.width));
    const cssHeight = Math.max(1, Math.round(canvasRect.height));
    const devicePixelRatio = globalThis.devicePixelRatio ?? 1;
    const pixelWidth = Math.max(1, Math.round(cssWidth * devicePixelRatio));
    const pixelHeight = Math.max(1, Math.round(cssHeight * devicePixelRatio));

    canvas.width = pixelWidth;
    canvas.height = pixelHeight;

    const visibleContext = canvas.getContext('2d');
    if (!visibleContext) {
      return;
    }

    visibleContext.setTransform(1, 0, 0, 1, 0, 0);
    visibleContext.clearRect(0, 0, pixelWidth, pixelHeight);
    visibleContext.fillStyle = backgroundColor;
    visibleContext.fillRect(0, 0, pixelWidth, pixelHeight);

    if (canvasTheme === 'default' || mapId === null || textureSeed === null) {
      return;
    }

    const renderVersion = renderVersionRef.current + 1;
    renderVersionRef.current = renderVersion;

    void (async () => {
      const bufferCanvas = createSizedCanvas(pixelWidth, pixelHeight);
      const bufferContext = bufferCanvas.getContext('2d');
      if (!bufferContext) {
        return;
      }

      bufferContext.setTransform(1, 0, 0, 1, 0, 0);
      bufferContext.clearRect(0, 0, pixelWidth, pixelHeight);
      bufferContext.scale(devicePixelRatio, devicePixelRatio);

      if (canvasTheme === 'paper') {
        await drawPaperTexture(bufferContext, cssWidth, cssHeight, theme, {
          mapId,
          textureSeed,
          theme,
        }, {
          scaleMultiplier: zoom,
          originX: panOffset.x,
          originY: panOffset.y,
        });
      } else {
        await drawContourLandscapeTexture(bufferContext, cssWidth, cssHeight, theme, {
          canvasTheme,
          mapId,
          textureSeed,
          theme,
        }, {
          scaleMultiplier: zoom,
          originX: panOffset.x,
          originY: panOffset.y,
        });
      }

      if (renderVersionRef.current !== renderVersion || !canvasRef.current) {
        return;
      }

      visibleContext.setTransform(1, 0, 0, 1, 0, 0);
      visibleContext.clearRect(0, 0, pixelWidth, pixelHeight);
      visibleContext.drawImage(bufferCanvas, 0, 0);
    })().catch(() => {});
  }, [backgroundColor, canvasRect, canvasTheme, mapId, panOffset.x, panOffset.y, theme, textureSeed, zoom]);

  return (
    <canvas
      ref={canvasRef}
      className="map-canvas-theme-layer"
      data-testid="map-canvas-theme-layer"
      aria-hidden="true"
      style={{
        backgroundColor,
      }}
    />
  );
}
