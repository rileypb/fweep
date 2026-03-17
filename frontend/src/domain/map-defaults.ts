import type { MapView, RoomShape } from './map-types';

export const DEFAULT_MAP_VISUAL_STYLE: MapView['visualStyle'] = 'square-classic';
export const DEFAULT_ROOM_SHAPE: RoomShape = 'rectangle';

export function createDefaultMapView(): MapView {
  return {
    pan: { x: 0, y: 0 },
    zoom: 1,
    visualStyle: DEFAULT_MAP_VISUAL_STYLE,
    showGrid: true,
    snapToGrid: true,
    useBezierConnections: false,
    cliOutputCollapsed: false,
  };
}
