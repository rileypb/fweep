import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { BACKGROUND_LAYER_CHUNK_SIZE, type BackgroundDocument } from '../domain/map-types';
import {
  listBackgroundChunksInBounds,
  type BackgroundChunkRecord,
} from '../storage/map-store';

interface VisibleChunk extends BackgroundChunkRecord {
  readonly left: number;
  readonly top: number;
}

export interface MapCanvasBackgroundHandle {
  redrawChunk: (chunkKey: string, sourceCanvas: HTMLCanvasElement) => void;
  reloadVisibleChunks: () => Promise<void>;
}

export interface MapCanvasBackgroundProps {
  readonly mapId: string;
  readonly background: BackgroundDocument;
  readonly panOffset: { x: number; y: number };
  readonly canvasRect: DOMRect | null;
  readonly backgroundRevision: number;
}

export const MapCanvasBackground = forwardRef<MapCanvasBackgroundHandle, MapCanvasBackgroundProps>(function MapCanvasBackground({
  mapId,
  background,
  panOffset,
  canvasRect,
  backgroundRevision,
}, ref) {
  const [visibleChunks, setVisibleChunks] = useState<readonly VisibleChunk[]>([]);
  const canvasRefs = useRef<Record<string, HTMLCanvasElement | null>>({});
  const activeLayer = background.activeLayerId ? background.layers[background.activeLayerId] : null;

  const visibleBounds = useMemo(() => {
    if (!canvasRect) {
      return null;
    }

    const minWorldX = -panOffset.x;
    const minWorldY = -panOffset.y;
    const maxWorldX = minWorldX + canvasRect.width;
    const maxWorldY = minWorldY + canvasRect.height;
    const margin = 1;

    return {
      minChunkX: Math.floor(minWorldX / BACKGROUND_LAYER_CHUNK_SIZE) - margin,
      maxChunkX: Math.floor(maxWorldX / BACKGROUND_LAYER_CHUNK_SIZE) + margin,
      minChunkY: Math.floor(minWorldY / BACKGROUND_LAYER_CHUNK_SIZE) - margin,
      maxChunkY: Math.floor(maxWorldY / BACKGROUND_LAYER_CHUNK_SIZE) + margin,
    };
  }, [canvasRect, panOffset.x, panOffset.y]);

  const paintChunkBlobIntoCanvas = useCallback(async (chunk: VisibleChunk) => {
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
      setVisibleChunks([]);
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
    setVisibleChunks(chunks.map((chunk) => ({
      ...chunk,
      left: chunk.chunkX * BACKGROUND_LAYER_CHUNK_SIZE,
      top: chunk.chunkY * BACKGROUND_LAYER_CHUNK_SIZE,
    })));
  }, [activeLayer, mapId, visibleBounds]);

  useImperativeHandle(ref, () => ({
    redrawChunk: (chunkKey, sourceCanvas) => {
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
    },
    reloadVisibleChunks,
  }), [reloadVisibleChunks]);

  useEffect(() => {
    void reloadVisibleChunks();
  }, [reloadVisibleChunks, backgroundRevision]);

  useEffect(() => {
    visibleChunks.forEach((chunk) => {
      void paintChunkBlobIntoCanvas(chunk);
    });
  }, [paintChunkBlobIntoCanvas, visibleChunks]);

  if (!activeLayer || !activeLayer.visible) {
    return null;
  }

  return (
    <div className="map-canvas-background-layer" data-testid="map-canvas-background">
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
