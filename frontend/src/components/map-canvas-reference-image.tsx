import type { BackgroundReferenceImage } from '../domain/map-types';

export interface MapCanvasReferenceImageProps {
  readonly image: BackgroundReferenceImage;
  readonly panOffset: { readonly x: number; readonly y: number };
  readonly zoom: number;
  readonly isDragging?: boolean;
  readonly onMouseDown?: (event: React.MouseEvent<HTMLImageElement>) => void;
}

export function MapCanvasReferenceImage({
  image,
  panOffset: _panOffset,
  zoom: _zoom,
  isDragging = false,
  onMouseDown,
}: MapCanvasReferenceImageProps): React.JSX.Element {
  const imageWidth = image.width * image.zoom;
  const imageHeight = image.height * image.zoom;

  return (
    <div
      className="map-canvas-reference-image-layer"
      aria-hidden="true"
    >
      <img
        className="map-canvas-reference-image"
        data-testid="map-canvas-reference-image"
        src={image.dataUrl}
        alt=""
        draggable={false}
        onMouseDown={onMouseDown}
        style={{
          left: `${image.position.x - (imageWidth / 2)}px`,
          top: `${image.position.y - (imageHeight / 2)}px`,
          width: `${imageWidth}px`,
          height: `${imageHeight}px`,
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
      />
    </div>
  );
}
