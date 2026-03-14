import type { BackgroundReferenceImage } from '../domain/map-types';

export interface MapCanvasReferenceImageProps {
  readonly image: BackgroundReferenceImage;
  readonly panOffset: { readonly x: number; readonly y: number };
  readonly zoom: number;
}

export function MapCanvasReferenceImage({
  image,
  panOffset,
  zoom,
}: MapCanvasReferenceImageProps): React.JSX.Element {
  const scaledWidth = image.width * image.zoom;
  const scaledHeight = image.height * image.zoom;

  return (
    <div
      className="map-canvas-reference-image-layer"
      aria-hidden="true"
      style={{
        transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
        transformOrigin: '0 0',
      }}
    >
      <img
        className="map-canvas-reference-image"
        data-testid="map-canvas-reference-image"
        src={image.dataUrl}
        alt=""
        draggable={false}
        style={{
          left: `${-(scaledWidth / 2)}px`,
          top: `${-(scaledHeight / 2)}px`,
          width: `${scaledWidth}px`,
          height: `${scaledHeight}px`,
        }}
      />
    </div>
  );
}
