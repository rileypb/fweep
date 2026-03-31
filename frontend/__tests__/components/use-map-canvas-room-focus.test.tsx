import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, renderHook } from '@testing-library/react';
import type { Position, Room } from '../../src/domain/map-types';
import { createEmptyMap, createRoom } from '../../src/domain/map-types';
import { useEditorStore } from '../../src/state/editor-store';

const mockGetRoomScreenGeometry = jest.fn<typeof import('../../src/components/map-canvas-helpers').getRoomScreenGeometry>();

await jest.unstable_mockModule('../../src/components/map-canvas-helpers', () => ({
  getRoomScreenGeometry: mockGetRoomScreenGeometry,
}));

const { useMapCanvasRoomFocus } = await import('../../src/components/use-map-canvas-room-focus');

function createCanvasElement(rect: Partial<DOMRect> = {}): HTMLDivElement {
  const element = document.createElement('div');
  Object.defineProperty(element, 'clientWidth', {
    configurable: true,
    value: rect.width ?? 600,
  });
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: rect.height ?? 400,
  });
  element.getBoundingClientRect = () => ({
    x: rect.left ?? 0,
    y: rect.top ?? 0,
    left: rect.left ?? 0,
    top: rect.top ?? 0,
    right: (rect.left ?? 0) + (rect.width ?? 600),
    bottom: (rect.top ?? 0) + (rect.height ?? 400),
    width: rect.width ?? 600,
    height: rect.height ?? 400,
    toJSON: () => '',
  } as DOMRect);
  return element;
}

function createHookOptions(overrides?: Partial<{
  canvasRef: { current: HTMLDivElement | null };
  canvasRect: DOMRect | null;
  requestedRoomEditorRequest: { roomId: string; requestId: number } | null;
  requestedRoomRevealRequest: { roomId: string; requestId: number } | null;
  requestedViewportFocusRequest: { roomIds: readonly string[]; requestId: number } | null;
  visibleMapLeftInset: number;
  visibleMapRightInset: number;
  selectionFocusRightInset: number;
}>) {
  const canvasElement = createCanvasElement();
  const panOffsetRef = { current: { x: 10, y: 20 } };
  const zoomRef = { current: 1 };

  return {
    canvasRef: { current: canvasElement },
    canvasRect: canvasElement.getBoundingClientRect(),
    panOffsetRef,
    zoomRef,
    setPanOffset: jest.fn<(value: { x: number; y: number } | ((prev: { x: number; y: number }) => { x: number; y: number })) => void>(),
    setMapPanOffset: jest.fn<(position: Position) => void>(),
    mapVisualStyle: 'square-classic' as const,
    visibleMapLeftInset: 40,
    visibleMapRightInset: 20,
    selectionFocusRightInset: 100,
    startAutoPanAnimation: jest.fn<() => void>(),
    setStickyNoteEditorId: jest.fn<(value: string | null | ((prev: string | null) => string | null)) => void>(),
    setConnectionEditorId: jest.fn<(value: string | null | ((prev: string | null) => string | null)) => void>(),
    setRoomEditorState: jest.fn<(value: unknown) => void>(),
    requestedRoomEditorRequest: null,
    requestedRoomRevealRequest: null,
    requestedViewportFocusRequest: null,
    onRequestedRoomEditorHandled: jest.fn<(requestId: number) => void>(),
    onRequestedRoomRevealHandled: jest.fn<(requestId: number) => void>(),
    onRequestedViewportFocusHandled: jest.fn<(requestId: number) => void>(),
    ...overrides,
  };
}

beforeEach(() => {
  jest.restoreAllMocks();
  mockGetRoomScreenGeometry.mockReset();
  useEditorStore.setState(useEditorStore.getInitialState());
  document.body.innerHTML = '';
});

describe('useMapCanvasRoomFocus', () => {
  it('opens room, pseudo-room, and new-room editors while clearing competing editors', () => {
    const doc = createEmptyMap('Focus Map');
    const room = { ...createRoom('Kitchen'), id: 'kitchen', position: { x: 100, y: 80 } };
    useEditorStore.setState((state) => ({
      ...state,
      doc: {
        ...doc,
        rooms: { [room.id]: room },
      },
    }));

    mockGetRoomScreenGeometry.mockReturnValue({
      left: 120,
      top: 90,
      width: 80,
      height: 40,
      centerX: 160,
    });

    const options = createHookOptions();
    const { result } = renderHook(() => useMapCanvasRoomFocus(options));

    act(() => {
      result.current.openRoomEditor(room.id);
    });

    expect(options.setStickyNoteEditorId).toHaveBeenCalledWith(null);
    expect(options.setConnectionEditorId).toHaveBeenCalledWith(null);
    expect(options.startAutoPanAnimation).toHaveBeenCalled();
    expect(options.setPanOffset).toHaveBeenCalledWith(expect.any(Function));
    expect(options.setRoomEditorState).toHaveBeenCalledWith({ roomId: room.id });

    act(() => {
      result.current.openPseudoRoomEditor('pseudo-1');
    });
    expect(options.setRoomEditorState).toHaveBeenCalledWith({ pseudoRoomId: 'pseudo-1' });

    act(() => {
      result.current.openNewRoomEditor({ x: 240, y: 300 });
    });
    expect(options.setRoomEditorState).toHaveBeenCalledWith({ initialPosition: { x: 240, y: 300 } });
  });

  it('does not pan room editors when the canvas or room is unavailable', () => {
    const options = createHookOptions({
      canvasRef: { current: null },
    });
    const { result } = renderHook(() => useMapCanvasRoomFocus(options));

    act(() => {
      result.current.openRoomEditor('missing-room');
    });

    expect(options.startAutoPanAnimation).not.toHaveBeenCalled();
    expect(options.setPanOffset).not.toHaveBeenCalled();
    expect(options.setRoomEditorState).toHaveBeenCalledWith({ roomId: 'missing-room' });
  });

  it('centers a single room on screen and syncs both pan setters', () => {
    const room: Room = { ...createRoom('Kitchen'), id: 'kitchen', position: { x: 100, y: 80 } };
    mockGetRoomScreenGeometry.mockReturnValue({
      left: 120,
      top: 90,
      width: 80,
      height: 40,
      centerX: 160,
    });

    const options = createHookOptions();
    const { result } = renderHook(() => useMapCanvasRoomFocus(options));

    act(() => {
      result.current.centerRoomOnScreen(room);
    });

    expect(options.startAutoPanAnimation).toHaveBeenCalled();
    expect(options.setPanOffset).toHaveBeenCalledWith({ x: 120, y: 110 });
    expect(options.setMapPanOffset).toHaveBeenCalledWith({ x: 120, y: 110 });
    expect(options.panOffsetRef.current).toEqual({ x: 120, y: 110 });
  });

  it('skips centering when the canvas dimensions are zero', () => {
    const room: Room = { ...createRoom('Kitchen'), id: 'kitchen', position: { x: 100, y: 80 } };
    mockGetRoomScreenGeometry.mockReturnValue({
      left: 0,
      top: 0,
      width: 80,
      height: 40,
      centerX: 40,
    });

    const zeroRect = {
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      right: 0,
      bottom: 0,
      x: 0,
      y: 0,
      toJSON: () => '',
    } as DOMRect;
    const options = createHookOptions({
      canvasRef: { current: null },
      canvasRect: zeroRect,
    });
    const { result } = renderHook(() => useMapCanvasRoomFocus(options));

    act(() => {
      result.current.centerRoomOnScreen(room);
    });

    expect(options.startAutoPanAnimation).not.toHaveBeenCalled();
    expect(options.setPanOffset).not.toHaveBeenCalled();
    expect(options.setMapPanOffset).not.toHaveBeenCalled();
  });

  it('handles room-editor and reveal requests and always acknowledges them', () => {
    const doc = createEmptyMap('Request Map');
    const room = { ...createRoom('Kitchen'), id: 'kitchen', position: { x: 100, y: 80 } };
    useEditorStore.setState((state) => ({
      ...state,
      doc: {
        ...doc,
        rooms: { [room.id]: room },
      },
    }));

    mockGetRoomScreenGeometry.mockReturnValue({
      left: 120,
      top: 90,
      width: 80,
      height: 40,
      centerX: 160,
    });

    const { rerender } = renderHook(
      (options: ReturnType<typeof createHookOptions>) => useMapCanvasRoomFocus(options),
      {
        initialProps: createHookOptions({
          requestedRoomEditorRequest: { roomId: room.id, requestId: 11 },
        }),
      },
    );

    const revealOptions = createHookOptions({
      requestedRoomRevealRequest: { roomId: room.id, requestId: 12 },
    });
    rerender(revealOptions);

    expect(revealOptions.onRequestedRoomRevealHandled).toHaveBeenCalledWith(12);
    expect(revealOptions.setMapPanOffset).toHaveBeenCalledWith({ x: 120, y: 110 });

    const missingRevealOptions = createHookOptions({
      requestedRoomRevealRequest: { roomId: 'missing', requestId: 13 },
    });
    rerender(missingRevealOptions);

    expect(missingRevealOptions.onRequestedRoomRevealHandled).toHaveBeenCalledWith(13);
    expect(missingRevealOptions.setMapPanOffset).not.toHaveBeenCalled();
  });

  it('focuses one or many requested rooms and ignores missing ones', () => {
    const doc = createEmptyMap('Viewport Focus Map');
    const roomA = { ...createRoom('Kitchen'), id: 'kitchen', position: { x: 100, y: 80 } };
    const roomB = { ...createRoom('Hallway'), id: 'hallway', position: { x: 260, y: 180 } };
    useEditorStore.setState((state) => ({
      ...state,
      doc: {
        ...doc,
        rooms: {
          [roomA.id]: roomA,
          [roomB.id]: roomB,
        },
      },
    }));

    mockGetRoomScreenGeometry
      .mockReturnValueOnce({
        left: 120,
        top: 90,
        width: 80,
        height: 40,
        centerX: 160,
      })
      .mockReturnValueOnce({
        left: 120,
        top: 90,
        width: 80,
        height: 40,
        centerX: 160,
      })
      .mockReturnValueOnce({
        left: 280,
        top: 190,
        width: 80,
        height: 40,
        centerX: 320,
      });

    const { rerender } = renderHook(
      (options: ReturnType<typeof createHookOptions>) => useMapCanvasRoomFocus(options),
      {
        initialProps: createHookOptions({
          requestedViewportFocusRequest: { roomIds: [roomA.id], requestId: 21 },
        }),
      },
    );

    const multiOptions = createHookOptions({
      requestedViewportFocusRequest: { roomIds: [roomA.id, roomB.id, 'missing'], requestId: 22 },
    });
    rerender(multiOptions);

    expect(multiOptions.onRequestedViewportFocusHandled).toHaveBeenCalledWith(22);
    expect(multiOptions.setPanOffset).toHaveBeenCalledWith({ x: 40, y: 60 });
    expect(multiOptions.setMapPanOffset).toHaveBeenCalledWith({ x: 40, y: 60 });

    const emptyOptions = createHookOptions({
      requestedViewportFocusRequest: { roomIds: ['missing-a', 'missing-b'], requestId: 23 },
    });
    rerender(emptyOptions);

    expect(emptyOptions.onRequestedViewportFocusHandled).toHaveBeenCalledWith(23);
    expect(emptyOptions.setPanOffset).not.toHaveBeenCalled();
  });
});
