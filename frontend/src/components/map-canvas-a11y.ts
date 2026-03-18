type FocusableElement = Element & {
  focus: (options?: FocusOptions) => void;
};

export function focusElementWithoutScroll(element: FocusableElement | null): void {
  if (!element) {
    return;
  }

  try {
    element.focus({ preventScroll: true });
  } catch {
    element.focus();
  }
}

export function getMapCanvasRoomNodeId(roomId: string): string {
  return `map-canvas-room-node-${roomId}`;
}

export function getMapCanvasPseudoRoomNodeId(pseudoRoomId: string): string {
  return `map-canvas-pseudo-room-node-${pseudoRoomId}`;
}
