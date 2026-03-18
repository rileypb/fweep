import { describe, expect, it, beforeEach, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { MapCanvasPseudoRoomNode } from '../../src/components/map-canvas-pseudo-room-node';
import { createEmptyMap, createPseudoRoom, createRoom, createStickyNote } from '../../src/domain/map-types';
import { addPseudoRoom, addRoom, addStickyNote } from '../../src/domain/map-operations';
import { useEditorStore } from '../../src/state/editor-store';

function resetStore(): void {
  useEditorStore.setState(useEditorStore.getInitialState());
}

describe('MapCanvasPseudoRoomNode', () => {
  beforeEach(() => {
    resetStore();
  });

  it('renders selection state and filled svg paths for pseudo-room symbols', () => {
    const pseudoRoom = { ...createPseudoRoom('nowhere'), id: 'pseudo-1', position: { x: 40, y: 80 } };

    render(
      <MapCanvasPseudoRoomNode
        pseudoRoom={pseudoRoom}
        theme="light"
        isSelected
        onOpenPseudoRoomEditor={() => undefined}
        toMapPoint={(x, y) => ({ x, y })}
      />,
    );

    expect(screen.getByTestId('pseudo-room-node').querySelector('.room-node-shape')).not.toBeNull();
    expect(screen.getByTestId('pseudo-room-selection-outline')).toBeInTheDocument();
    expect(document.querySelectorAll('[data-testid="pseudo-room-node"] path')).not.toHaveLength(0);
    expect(screen.getByTestId('pseudo-room-node')).toHaveStyle({ transform: 'translate(40px, 80px)' });
  });

  it('opens the pseudo-room editor on double-click', () => {
    const pseudoRoom = { ...createPseudoRoom('death'), id: 'pseudo-1', position: { x: 0, y: 0 } };
    const onOpenPseudoRoomEditor = jest.fn<(pseudoRoomId: string) => void>();

    render(
      <MapCanvasPseudoRoomNode
        pseudoRoom={pseudoRoom}
        theme="light"
        isSelected={false}
        onOpenPseudoRoomEditor={onOpenPseudoRoomEditor}
        toMapPoint={(x, y) => ({ x, y })}
      />,
    );

    fireEvent.doubleClick(screen.getByTestId('pseudo-room-node'));
    expect(onOpenPseudoRoomEditor).toHaveBeenCalledWith('pseudo-1');
  });

  it('supports keyboard selection and opening', () => {
    const pseudoRoom = { ...createPseudoRoom('death'), id: 'pseudo-1', position: { x: 0, y: 0 } };
    let doc = createEmptyMap('Test');
    doc = addPseudoRoom(doc, pseudoRoom);
    useEditorStore.getState().loadDocument(doc);
    const onOpenPseudoRoomEditor = jest.fn<(pseudoRoomId: string) => void>();

    render(
      <MapCanvasPseudoRoomNode
        pseudoRoom={pseudoRoom}
        theme="light"
        isSelected={false}
        onOpenPseudoRoomEditor={onOpenPseudoRoomEditor}
        toMapPoint={(x, y) => ({ x, y })}
      />,
    );

    const node = screen.getByRole('button', { name: /death/i });
    expect(node).toHaveAttribute('tabindex', '-1');
    node.focus();
    expect(node).toHaveFocus();

    fireEvent.keyDown(node, { key: ' ' });
    expect(useEditorStore.getState().selectedPseudoRoomIds).toEqual(['pseudo-1']);

    fireEvent.keyDown(node, { key: 'Enter' });
    expect(onOpenPseudoRoomEditor).toHaveBeenCalledWith('pseudo-1');
  });

  it('selects on click release and adds to selection with shift-click', () => {
    const pseudoRoom = { ...createPseudoRoom('unknown'), id: 'pseudo-1', position: { x: 0, y: 0 } };
    let doc = createEmptyMap('Test');
    doc = addPseudoRoom(doc, pseudoRoom);
    useEditorStore.getState().loadDocument(doc);

    render(
      <MapCanvasPseudoRoomNode
        pseudoRoom={pseudoRoom}
        theme="light"
        isSelected={false}
        onOpenPseudoRoomEditor={() => undefined}
        toMapPoint={(x, y) => ({ x, y })}
      />,
    );

    const node = screen.getByTestId('pseudo-room-node');
    fireEvent.mouseDown(node, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.mouseUp(document, { clientX: 10, clientY: 10 });
    expect(useEditorStore.getState().selectedPseudoRoomIds).toEqual(['pseudo-1']);

    useEditorStore.getState().clearSelection();
    fireEvent.mouseDown(node, { clientX: 10, clientY: 10, button: 0 });
    fireEvent.mouseUp(document, { clientX: 10, clientY: 10, shiftKey: true });
    expect(useEditorStore.getState().selectedPseudoRoomIds).toEqual(['pseudo-1']);
  });

  it('ignores right-click drags', () => {
    const pseudoRoom = { ...createPseudoRoom('unknown'), id: 'pseudo-1', position: { x: 0, y: 0 } };
    let doc = createEmptyMap('Test');
    doc = addPseudoRoom(doc, pseudoRoom);
    useEditorStore.getState().loadDocument(doc);

    render(
      <MapCanvasPseudoRoomNode
        pseudoRoom={pseudoRoom}
        theme="light"
        isSelected={false}
        onOpenPseudoRoomEditor={() => undefined}
        toMapPoint={(x, y) => ({ x, y })}
      />,
    );

    const node = screen.getByTestId('pseudo-room-node');
    fireEvent.mouseDown(node, { clientX: 10, clientY: 10, button: 2 });
    fireEvent.mouseMove(document, { clientX: 50, clientY: 60 });
    fireEvent.mouseUp(document, { clientX: 50, clientY: 60 });

    expect(useEditorStore.getState().doc?.pseudoRooms['pseudo-1']?.position).toEqual({ x: 0, y: 0 });
  });

  it('moves selected pseudo-rooms and mixed selections using map-space drag deltas', () => {
    const pseudoRoom = { ...createPseudoRoom('unknown'), id: 'pseudo-1', position: { x: 0, y: 0 } };
    const room = { ...createRoom('Kitchen'), id: 'room-1', position: { x: 100, y: 100 } };
    const stickyNote = { ...createStickyNote('note'), id: 'note-1', position: { x: 200, y: 200 } };
    let doc = createEmptyMap('Test');
    doc = addPseudoRoom(doc, pseudoRoom);
    doc = addRoom(doc, room);
    doc = addStickyNote(doc, stickyNote);
    useEditorStore.getState().loadDocument(doc);
    useEditorStore.getState().toggleSnapToGrid();
    useEditorStore.getState().selectPseudoRoom(pseudoRoom.id);
    useEditorStore.getState().addRoomToSelection(room.id);
    useEditorStore.getState().addStickyNoteToSelection(stickyNote.id);

    render(
      <MapCanvasPseudoRoomNode
        pseudoRoom={pseudoRoom}
        theme="light"
        isSelected
        onOpenPseudoRoomEditor={() => undefined}
        toMapPoint={(x, y) => ({ x: x / 2, y: y / 2 })}
      />,
    );

    const node = screen.getByTestId('pseudo-room-node');
    fireEvent.mouseDown(node, { clientX: 20, clientY: 20, button: 0 });
    fireEvent.mouseMove(document, { clientX: 100, clientY: 60 });

    expect(node).toHaveStyle({ transform: 'translate(40px, 20px)' });

    fireEvent.mouseUp(document, { clientX: 100, clientY: 60 });

    expect(useEditorStore.getState().doc?.pseudoRooms['pseudo-1']?.position).toEqual({ x: 40, y: 20 });
    expect(useEditorStore.getState().doc?.rooms['room-1']?.position).toEqual({ x: 140, y: 120 });
    expect(useEditorStore.getState().doc?.stickyNotes['note-1']?.position).toEqual({ x: 240, y: 220 });
  });
});
