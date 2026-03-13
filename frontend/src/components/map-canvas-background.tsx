import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { BACKGROUND_LAYER_CHUNK_SIZE, type BackgroundDocument } from '../domain/map-types';
import {
  listBackgroundChunksInBounds,
  type BackgroundChunkRecord,
} from '../storage/map-store';

interface VisibleChunk {
  readonly key: string;
  readonly chunkX: number;
  readonly chunkY: number;
  readonly left: number;
  readonly top: number;
  readonly blob?: Blob;
}

interface StoredVisibleChunk extends BackgroundChunkRecord {
  readonly left: number;
  readonly top: number;
}

export interface MapCanvasBackgroundHandle {
  redrawChunk: (
    chunkKey: string,
    chunkX: number,
    chunkY: number,
    sourceCanvas: HTMLCanvasElement,
  ) => void;
  clearLivePreviewChunks: () => void;
  reloadVisibleChunks: () => Promise<void>;
}

export interface MapCanvasBackgroundProps {
  readonly mapId: string;
  readonly background: BackgroundDocument;
  readonly panOffset: { x: number; y: number };
  readonly zoom?: number;
  readonly canvasRect: DOMRect | null;
  readonly backgroundRevision: number;
}

export const MapCanvasBackground = forwardRef<MapCanvasBackgroundHandle, MapCanvasBackgroundProps>(function MapCanvasBackground({
  mapId,
  background,
  panOffset,
  zoom = 1,
  canvasRect,
  backgroundRevision,
}, ref) {
  const [visibleChunks, setVisibleChunks] = useState<readonly VisibleChunk[]>([]);
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const livePreviewChunkKeysRef = useRef<Set<string>>(new Set());
  const activeLayer = background.activeLayerId ? background.layers[background.activeLayerId] : null;

  const visibleBounds = useMemo(() => {
    if (!canvasRect) {
      return null;
    }

    const minWorldX = -panOffset.x / zoom;
    const minWorldY = -panOffset.y / zoom;
    const maxWorldX = minWorldX + (canvasRect.width / zoom);
    const maxWorldY = minWorldY + (canvasRect.height / zoom);
    const margin = 1;

    return {
      minChunkX: Math.floor(minWorldX / BACKGROUND_LAYER_CHUNK_SIZE) - margin,
      maxChunkX: Math.floor(maxWorldX / BACKGROUND_LAYER_CHUNK_SIZE) + margin,
      minChunkY: Math.floor(minWorldY / BACKGROUND_LAYER_CHUNK_SIZE) - margin,
      maxChunkY: Math.floor(maxWorldY / BACKGROUND_LAYER_CHUNK_SIZE) + margin,
    };
  }, [canvasRect, panOffset.x, panOffset.y, zoom]);

  const paintChunkBlobIntoCanvas = useCallback(async (chunk: StoredVisibleChunk) => {
    if (livePreviewChunkKeysRef.current.has(chunk.key)) {
      return;
    }

    const canvas = canvasRefs.current[chunk.key];
    if (!canvas) {
      return;
    }

    const context = canvas.getContext('2d');
    if (!context) {
      return;
    }

    const bitmap = await createImageBitmap(chunk.blob);
    context.imageSmoothingEnabled = false;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0);
    bitmap.close();
  }, []);

  const reloadVisibleChunks = useCallback(async () => {
    if (!activeLayer || !visibleBounds) {
      setVisibleChunks((currentChunks) => (currentChunks.length === 0 ? currentChunks : []));
      return;
    }

    const chunks = await listBackgroundChunksInBounds(
      mapId,
      activeLayer.id,
      visibleBounds.minChunkX,
      visibleBounds.maxChunkX,
      visibleBounds.minChunkY,
      visibleBounds.maxChunkY,
    );
    setVisibleChunks((currentChunks) => {
      const loadedChunks = chunks.map((chunk) => ({
        ...chunk,
        left: chunk.chunkX * BACKGROUND_LAYER_CHUNK_SIZE,
        top: chunk.chunkY * BACKGROUND_LAYER_CHUNK_SIZE,
      }));
      const loadedChunkKeys = new Set(loadedChunks.map((chunk) => chunk.key));
      const previewOnlyChunks = currentChunks.filter((chunk) => !('blob' in chunk) && !loadedChunkKeys.has(chunk.key));

      if (loadedChunks.length === 0 && previewOnlyChunks.length === 0 && currentChunks.length === 0) {
        return currentChunks;
      }

      return [...loadedChunks, ...previewOnlyChunks];
    });
  }, [activeLayer, mapId, visibleBounds]);

  useImperativeHandle(ref, () => ({
    redrawChunk: (chunkKey, chunkX, chunkY, sourceCanvas) => {
      livePreviewChunkKeysRef.current.add(chunkKey);
      setVisibleChunks((currentChunks) => {
        if (currentChunks.some((chunk) => chunk.key === chunkKey)) {
          return currentChunks;
        }

        return [
          ...currentChunks,
          {
            key: chunkKey,
            chunkX,
            chunkY,
            left: chunkX * BACKGROUND_LAYER_CHUNK_SIZE,
            top: chunkY * BACKGROUND_LAYER_CHUNK_SIZE,
          },
        ];
      });

      requestAnimationFrame(() => {
        const targetCanvas = canvasRefs.current[chunkKey];
        if (!targetCanvas) {
          return;
        }

        const context = targetCanvas.getContext('2d');
        if (!context) {
          return;
        }

        context.imageSmoothingEnabled = false;
        context.clearRect(0, 0, targetCanvas.width, targetCanvas.height);
        context.drawImage(sourceCanvas, 0, 0);
      });
    },
    clearLivePreviewChunks: () => {
      livePreviewChunkKeysRef.current.clear();
    },
    reloadVisibleChunks,
  }), [reloadVisibleChunks]);

  useEffect(() => {
    void reloadVisibleChunks();
  }, [reloadVisibleChunks, backgroundRevision]);

  useEffect(() => {
    visibleChunks.forEach((chunk) => {
      if (chunk.blob) {
        void paintChunkBlobIntoCanvas(chunk as StoredVisibleChunk);
      }
    });
  }, [paintChunkBlobIntoCanvas, visibleChunks]);

  if (!activeLayer || !activeLayer.visible) {
    return null;
  }

  return (
    <div
      className="map-canvas-background-layer"
      data-testid="map-canvas-background"
      style={{
        transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
        transformOrigin: '0 0',
      }}
    >
      {visibleChunks.map((chunk) => (
        <canvas
          key={chunk.key}
          ref={(element) => {
            canvasRefs.current[chunk.key] = element;
          }}
          className="map-canvas-background-chunk"
          data-testid="map-canvas-background-chunk"
          data-chunk-key={chunk.key}
          width={BACKGROUND_LAYER_CHUNK_SIZE}
          height={BACKGROUND_LAYER_CHUNK_SIZE}
          style={{
            left: `${chunk.left}px`,
            top: `${chunk.top}px`,
            opacity: activeLayer.opacity,
          }}
        />
      ))}
    </div>
  );
});
