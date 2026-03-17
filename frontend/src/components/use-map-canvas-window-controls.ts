import { useEffect } from 'react';
import { isEditableTarget } from './map-canvas-helpers';
import { isRedoShortcut, isUndoShortcut } from './map-canvas-shortcuts';
import { useEditorStore } from '../state/editor-store';

interface UseMapCanvasWindowControlsParams {
  readonly drawingInterfaceEnabled: boolean;
  readonly canvasInteractionMode: 'map' | 'draw';
  readonly setCanvasInteractionMode: (mode: 'map' | 'draw') => void;
  readonly isRoomEditorOpen: boolean;
  readonly connectionEditorId: string | null;
  readonly connectionDrag: ReturnType<typeof useEditorStore.getState>['connectionDrag'];
  readonly connectionEndpointDrag: ReturnType<typeof useEditorStore.getState>['connectionEndpointDrag'];
  readonly cancelConnectionEndpointDrag: () => void;
  readonly removeSelectedEntities: () => void;
  readonly undo: () => void | Promise<void>;
  readonly redo: () => void | Promise<void>;
  readonly setIsRoomPlacementArmed: React.Dispatch<React.SetStateAction<boolean>>;
  readonly setIsNotePlacementArmed: React.Dispatch<React.SetStateAction<boolean>>;
  readonly setIsShiftKeyDown: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useMapCanvasWindowControls({
  drawingInterfaceEnabled,
  canvasInteractionMode,
  setCanvasInteractionMode,
  isRoomEditorOpen,
  connectionEditorId,
  connectionDrag,
  connectionEndpointDrag,
  cancelConnectionEndpointDrag,
  removeSelectedEntities,
  undo,
  redo,
  setIsRoomPlacementArmed,
  setIsNotePlacementArmed,
  setIsShiftKeyDown,
}: UseMapCanvasWindowControlsParams): void {
  useEffect(() => {
    const handleKeyChange = (event: KeyboardEvent) => {
      setIsShiftKeyDown(event.shiftKey);
    };

    const handleWindowBlur = () => {
      setIsShiftKeyDown(false);
    };

    window.addEventListener('keydown', handleKeyChange);
    window.addEventListener('keyup', handleKeyChange);
    window.addEventListener('blur', handleWindowBlur);
    return () => {
      window.removeEventListener('keydown', handleKeyChange);
      window.removeEventListener('keyup', handleKeyChange);
      window.removeEventListener('blur', handleWindowBlur);
    };
  }, [setIsShiftKeyDown]);

  useEffect(() => {
    const handleWindowKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) {
        return;
      }

      if (event.key === 'Escape' && connectionEndpointDrag !== null) {
        cancelConnectionEndpointDrag();
        return;
      }

      if (isRoomEditorOpen || connectionEditorId !== null || connectionDrag !== null || connectionEndpointDrag !== null) {
        return;
      }

      if (isEditableTarget(event.target) || isEditableTarget(document.activeElement)) {
        return;
      }

      if (isRedoShortcut(event)) {
        event.preventDefault();
        void redo();
        return;
      }

      if (isUndoShortcut(event)) {
        event.preventDefault();
        void undo();
        return;
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        const {
          selectedRoomIds,
          selectedPseudoRoomIds,
          selectedStickyNoteIds,
          selectedConnectionIds,
          selectedStickyNoteLinkIds,
        } = useEditorStore.getState();

        if (
          selectedRoomIds.length === 0
          && selectedPseudoRoomIds.length === 0
          && selectedStickyNoteIds.length === 0
          && selectedConnectionIds.length === 0
          && selectedStickyNoteLinkIds.length === 0
        ) {
          return;
        }

        event.preventDefault();
        removeSelectedEntities();
        return;
      }

      if (drawingInterfaceEnabled && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'd') {
        event.preventDefault();
        setCanvasInteractionMode(canvasInteractionMode === 'draw' ? 'map' : 'draw');
        return;
      }

      if (!event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setIsRoomPlacementArmed(false);
        setIsNotePlacementArmed(true);
        return;
      }

      if (!event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'r') {
        event.preventDefault();
        setIsNotePlacementArmed(false);
        setIsRoomPlacementArmed(true);
        return;
      }

      if (event.key === 'Escape') {
        setIsRoomPlacementArmed(false);
        setIsNotePlacementArmed(false);
      }
    };

    window.addEventListener('keydown', handleWindowKeyDown);
    return () => {
      window.removeEventListener('keydown', handleWindowKeyDown);
    };
  }, [
    cancelConnectionEndpointDrag,
    canvasInteractionMode,
    connectionDrag,
    connectionEditorId,
    connectionEndpointDrag,
    drawingInterfaceEnabled,
    isRoomEditorOpen,
    redo,
    removeSelectedEntities,
    setCanvasInteractionMode,
    setIsNotePlacementArmed,
    setIsRoomPlacementArmed,
    undo,
  ]);
}
