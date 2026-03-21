import type { MapView, RoomShape } from './map-types';

export const DEFAULT_MAP_VISUAL_STYLE: MapView['visualStyle'] = 'square-classic';
export const DEFAULT_MAP_CANVAS_THEME: MapView['canvasTheme'] = 'default';
export const DEFAULT_ROOM_SHAPE: RoomShape = 'rectangle';

export function createTextureSeed(): number {
  if (typeof crypto !== 'undefined' && 'getRandomValues' in crypto) {
    return crypto.getRandomValues(new Uint32Array(1))[0] & 0x7fffffff;
  }

  return Math.floor(Math.random() * 0x7fffffff);
}

export function createDefaultMapView(): MapView {
  return {
    pan: { x: 0, y: 0 },
    zoom: 1,
    visualStyle: DEFAULT_MAP_VISUAL_STYLE,
    canvasTheme: DEFAULT_MAP_CANVAS_THEME,
    textureSeed: createTextureSeed(),
    showGrid: true,
    snapToGrid: true,
    useBezierConnections: false,
    cliOutputCollapsed: false,
  };
}
