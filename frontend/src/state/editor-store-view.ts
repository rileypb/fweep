import { createDefaultMapView } from '../domain/map-defaults';
import type { MapDocument } from '../domain/map-types';
import type { EditorState } from './editor-store';

type EditorViewState = Pick<
  EditorState,
  'snapToGridEnabled'
  | 'showGridEnabled'
  | 'useBezierConnectionsEnabled'
  | 'cliOutputCollapsedEnabled'
  | 'mapPanOffset'
  | 'mapZoom'
  | 'mapVisualStyle'
  | 'mapCanvasTheme'
>;

type ResettableEditorState = Pick<
  EditorState,
  'pastEntries'
  | 'futureEntries'
  | 'canUndo'
  | 'canRedo'
  | 'lastHistoryMergeKey'
  | 'selectedRoomIds'
  | 'selectedPseudoRoomIds'
  | 'selectedStickyNoteIds'
  | 'selectedConnectionIds'
  | 'selectedStickyNoteLinkIds'
  | 'connectionDrag'
  | 'stickyNoteLinkDrag'
  | 'connectionEndpointDrag'
  | 'selectionDrag'
  | 'exportRegionDraft'
  | 'exportRegion'
  | 'canvasInteractionMode'
  | 'activeStroke'
  | 'backgroundRevision'
> & EditorViewState;

export function patchDocumentView(
  doc: MapDocument,
  state: Pick<EditorState, 'mapPanOffset' | 'mapZoom' | 'mapVisualStyle' | 'mapCanvasTheme' | 'showGridEnabled' | 'snapToGridEnabled' | 'useBezierConnectionsEnabled' | 'cliOutputCollapsedEnabled'>,
): MapDocument {
  return {
    ...doc,
    view: {
      pan: state.mapPanOffset,
      zoom: state.mapZoom,
      visualStyle: state.mapVisualStyle,
      canvasTheme: state.mapCanvasTheme,
      textureSeed: doc.view.textureSeed,
      showGrid: state.showGridEnabled,
      snapToGrid: state.snapToGridEnabled,
      useBezierConnections: state.useBezierConnectionsEnabled,
      cliOutputCollapsed: state.cliOutputCollapsedEnabled,
    },
  };
}

export function getDefaultEditorViewState(): EditorViewState {
  const defaultMapView = createDefaultMapView();
  return {
    snapToGridEnabled: defaultMapView.snapToGrid,
    showGridEnabled: defaultMapView.showGrid,
    useBezierConnectionsEnabled: defaultMapView.useBezierConnections,
    cliOutputCollapsedEnabled: defaultMapView.cliOutputCollapsed,
    mapPanOffset: defaultMapView.pan,
    mapZoom: defaultMapView.zoom,
    mapVisualStyle: defaultMapView.visualStyle,
    mapCanvasTheme: defaultMapView.canvasTheme,
  };
}

export function getResettableEditorState(): ResettableEditorState {
  return {
    pastEntries: [],
    futureEntries: [],
    canUndo: false,
    canRedo: false,
    lastHistoryMergeKey: null,
    selectedRoomIds: [],
    selectedPseudoRoomIds: [],
    selectedStickyNoteIds: [],
    selectedConnectionIds: [],
    selectedStickyNoteLinkIds: [],
    ...getDefaultEditorViewState(),
    connectionDrag: null,
    stickyNoteLinkDrag: null,
    connectionEndpointDrag: null,
    selectionDrag: null,
    exportRegionDraft: null,
    exportRegion: null,
    canvasInteractionMode: 'map',
    activeStroke: null,
    backgroundRevision: 0,
  };
}

export function getLoadedDocumentState(doc: MapDocument): Pick<EditorState, 'doc'> & ResettableEditorState {
  return {
    doc: patchDocumentView(doc, {
      mapPanOffset: doc.view.pan,
      mapZoom: doc.view.zoom,
      mapVisualStyle: doc.view.visualStyle,
      mapCanvasTheme: doc.view.canvasTheme,
      showGridEnabled: doc.view.showGrid,
      snapToGridEnabled: doc.view.snapToGrid,
      useBezierConnectionsEnabled: doc.view.useBezierConnections,
      cliOutputCollapsedEnabled: doc.view.cliOutputCollapsed,
    }),
    ...getResettableEditorState(),
    snapToGridEnabled: doc.view.snapToGrid,
    showGridEnabled: doc.view.showGrid,
    useBezierConnectionsEnabled: doc.view.useBezierConnections,
    cliOutputCollapsedEnabled: doc.view.cliOutputCollapsed,
    mapPanOffset: doc.view.pan,
    mapZoom: doc.view.zoom,
    mapVisualStyle: doc.view.visualStyle,
    mapCanvasTheme: doc.view.canvasTheme,
  };
}

export function getUnloadedDocumentState(): Pick<EditorState, 'doc'> & ResettableEditorState {
  return {
    doc: null,
    ...getResettableEditorState(),
  };
}
