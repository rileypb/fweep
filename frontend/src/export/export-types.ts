import type { MapDocument, Position } from '../domain/map-types';
import type { ThemeMode } from '../domain/room-color-palette';

export type ExportScope = 'entire-map' | 'viewport' | 'selection' | 'region';

export type ExportBackground = 'theme-canvas' | 'white' | 'transparent';

export interface ExportRegion {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export interface ExportSettings {
  readonly scope: ExportScope;
  readonly padding: number;
  readonly scale: 1 | 2 | 4;
  readonly background: ExportBackground;
  readonly includeBackgroundDrawing: boolean;
  readonly includeGrid: boolean;
}

export interface ExportValidationError {
  readonly code:
    | 'empty'
    | 'selection-empty'
    | 'region-missing'
    | 'width-too-large'
    | 'height-too-large'
    | 'pixel-count-too-large';
  readonly message: string;
}

export interface ExportBoundsResult {
  readonly bounds: ExportRegion | null;
  readonly validationError: ExportValidationError | null;
}

export interface ExportRenderInput {
  readonly doc: MapDocument;
  readonly theme: ThemeMode;
  readonly settings: ExportSettings;
  readonly bounds: ExportRegion;
  readonly viewportSize?: { readonly width: number; readonly height: number };
  readonly mapPanOffset?: Position;
  readonly selectedRoomIds: readonly string[];
  readonly selectedConnectionIds: readonly string[];
}
