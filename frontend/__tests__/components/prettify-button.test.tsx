import { describe, expect, it, beforeEach } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PrettifyButton } from '../../src/components/prettify-button';
import { addConnection, addRoom } from '../../src/domain/map-operations';
import { createConnection, createEmptyMap, createRoom } from '../../src/domain/map-types';
import { useEditorStore } from '../../src/state/editor-store';

function resetStore(): void {
  useEditorStore.setState(useEditorStore.getInitialState());
}

describe('PrettifyButton', () => {
  beforeEach(() => {
    resetStore();
  });

  it('is disabled when no map is loaded', () => {
    render(<PrettifyButton />);

    expect(screen.getByRole('button', { name: /prettify layout/i })).toBeDisabled();
  });

  it('prettifies the loaded map layout', async () => {
    const roomA = { ...createRoom('A'), position: { x: 320, y: 320 } };
    const roomB = { ...createRoom('B'), position: { x: 40, y: 40 } };
    let doc = createEmptyMap('Button Test');
    doc = addRoom(addRoom(doc, roomA), roomB);
    doc = addConnection(doc, createConnection(roomA.id, roomB.id, true), 'north', 'south');
    useEditorStore.getState().loadDocument(doc);

    const user = userEvent.setup();
    render(<PrettifyButton />);

    await user.click(screen.getByRole('button', { name: /prettify layout/i }));

    const updatedDoc = useEditorStore.getState().doc!;
    expect(updatedDoc.rooms[roomB.id].position.x).toBe(updatedDoc.rooms[roomA.id].position.x);
    expect(updatedDoc.rooms[roomB.id].position.y).toBeLessThan(updatedDoc.rooms[roomA.id].position.y);
  });
});
