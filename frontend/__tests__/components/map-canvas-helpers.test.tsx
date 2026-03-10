import { describe, expect, it } from '@jest/globals';
import { act, render, screen, waitFor } from '@testing-library/react';
import {
  findNearestRoomInDirection,
  getConnectionsWithinSelectionBox,
  getPanDeltaToRevealRoom,
  getRoomScreenGeometry,
  getStickyNoteLinksWithinSelectionBox,
  getStickyNotesWithinSelectionBox,
  getRoomsWithinSelectionBox,
  getRoomStrokeDasharray,
  getSelectionBounds,
  isEditableTarget,
  renderRoomShape,
  useDocumentTheme,
} from '../../src/components/map-canvas-helpers';
import { createConnection, createRoom, createStickyNote } from '../../src/domain/map-types';

function makeRect(width: number, height: number): DOMRect {
  return {
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('map-canvas-helpers', () => {
  it('computes room screen geometry and selection bounds', () => {
    const room = { ...createRoom('Kitchen'), position: { x: 40, y: 60 } };
    expect(getRoomScreenGeometry(room, { x: 10, y: -20 }, makeRect(300, 200))).toMatchObject({
      left: 50,
      top: 40,
      height: 36,
    });

    expect(getSelectionBounds({
      startX: 100,
      startY: 90,
      currentX: 40,
      currentY: 20,
    })).toEqual({
      left: 40,
      top: 20,
      width: 60,
      height: 70,
    });
  });

  it('finds rooms and connections within the marquee selection box', () => {
    const kitchen = { ...createRoom('Kitchen'), position: { x: 40, y: 40 } };
    const hallway = { ...createRoom('Hallway'), position: { x: 220, y: 40 } };
    const cellar = { ...createRoom('Cellar'), position: { x: 420, y: 40 } };
    const connection = createConnection(kitchen.id, hallway.id, true);

    expect(getRoomsWithinSelectionBox(
      [kitchen, hallway, cellar],
      { x: 0, y: 0 },
      makeRect(600, 400),
      { startX: 20, startY: 20, currentX: 260, currentY: 120 },
    )).toEqual([kitchen.id, hallway.id]);

    expect(getConnectionsWithinSelectionBox(
      { [kitchen.id]: kitchen, [hallway.id]: hallway, [cellar.id]: cellar },
      { [connection.id]: connection },
      { x: 0, y: 0 },
      { startX: 20, startY: 20, currentX: 260, currentY: 120 },
    )).toEqual([connection.id]);

    expect(getConnectionsWithinSelectionBox(
      { [kitchen.id]: kitchen },
      { [connection.id]: connection },
      { x: 0, y: 0 },
      { startX: 20, startY: 20, currentX: 260, currentY: 120 },
    )).toEqual([]);
  });

  it('finds sticky notes and sticky-note links within the marquee selection box', () => {
    const room = { ...createRoom('Kitchen'), position: { x: 220, y: 40 } };
    const nearNote = { ...createStickyNote('Check desk'), position: { x: 40, y: 40 } };
    const farNote = { ...createStickyNote('Remember cellar'), position: { x: 320, y: 40 } };
    const stickyNoteLink = { id: 'sl-1', stickyNoteId: nearNote.id, roomId: room.id };

    expect(getStickyNotesWithinSelectionBox(
      [nearNote, farNote],
      { x: 0, y: 0 },
      makeRect(600, 400),
      { startX: 20, startY: 20, currentX: 260, currentY: 120 },
    )).toEqual([nearNote.id]);

    expect(getStickyNoteLinksWithinSelectionBox(
      { [room.id]: room },
      { [nearNote.id]: nearNote, [farNote.id]: farNote },
      { [stickyNoteLink.id]: stickyNoteLink },
      { x: 0, y: 0 },
      { startX: 120, startY: 60, currentX: 180, currentY: 110 },
    )).toEqual([stickyNoteLink.id]);
  });

  it('finds the nearest room in an arrow-key direction', () => {
    const origin = { ...createRoom('Origin'), position: { x: 100, y: 100 } };
    const west = { ...createRoom('West'), position: { x: -40, y: 105 } };
    const east = { ...createRoom('East'), position: { x: 260, y: 110 } };
    const southeast = { ...createRoom('SouthEast'), position: { x: 250, y: 220 } };
    const north = { ...createRoom('North'), position: { x: 120, y: -60 } };
    const south = { ...createRoom('South'), position: { x: 130, y: 280 } };

    expect(findNearestRoomInDirection([origin, west, east, southeast, north, south], origin.id, 'ArrowRight')?.id).toBe(east.id);
    expect(findNearestRoomInDirection([origin, west, east, southeast, north, south], origin.id, 'ArrowUp')?.id).toBe(north.id);
    expect(findNearestRoomInDirection([origin, west, east, southeast, north, south], origin.id, 'ArrowDown')?.id).toBe(south.id);
    expect(findNearestRoomInDirection([origin, west, east, southeast, north, south], origin.id, 'ArrowLeft')?.id).toBe(west.id);
    expect(findNearestRoomInDirection([east, southeast, north, south], origin.id, 'ArrowLeft')).toBeNull();
  });

  it('finds connections when the selection box only intersects the connection path edges', () => {
    const west = {
      ...createRoom('West'),
      position: { x: 20, y: 80 },
      directions: {},
    };
    const east = {
      ...createRoom('East'),
      position: { x: 260, y: 80 },
      directions: {},
    };
    const connection = createConnection(west.id, east.id, true);
    const westWithDirection = {
      ...west,
      directions: { east: connection.id },
    };
    const eastWithDirection = {
      ...east,
      directions: { west: connection.id },
    };

    expect(getConnectionsWithinSelectionBox(
      { [west.id]: westWithDirection, [east.id]: eastWithDirection },
      { [connection.id]: connection },
      { x: 0, y: 0 },
      { startX: 140, startY: 85, currentX: 170, currentY: 105 },
    )).toEqual([connection.id]);
  });

  it('treats collinear overlap with a selection edge as an intersection', () => {
    const west = {
      ...createRoom('West'),
      position: { x: 20, y: 80 },
      directions: {},
    };
    const east = {
      ...createRoom('East'),
      position: { x: 260, y: 80 },
      directions: {},
    };
    const connection = createConnection(west.id, east.id, true);
    const westWithDirection = {
      ...west,
      directions: { east: connection.id },
    };
    const eastWithDirection = {
      ...east,
      directions: { west: connection.id },
    };

    expect(getConnectionsWithinSelectionBox(
      { [west.id]: westWithDirection, [east.id]: eastWithDirection },
      { [connection.id]: connection },
      { x: 0, y: 0 },
      { startX: 140, startY: 98, currentX: 170, currentY: 120 },
    )).toEqual([connection.id]);
  });

  it('ignores connections whose path never intersects the selection box', () => {
    const north = {
      ...createRoom('North'),
      position: { x: 80, y: 20 },
      directions: {},
    };
    const south = {
      ...createRoom('South'),
      position: { x: 80, y: 240 },
      directions: {},
    };
    const connection = createConnection(north.id, south.id, true);
    const northWithDirection = {
      ...north,
      directions: { south: connection.id },
    };
    const southWithDirection = {
      ...south,
      directions: { north: connection.id },
    };

    expect(getConnectionsWithinSelectionBox(
      { [north.id]: northWithDirection, [south.id]: southWithDirection },
      { [connection.id]: connection },
      { x: 0, y: 0 },
      { startX: 220, startY: 80, currentX: 280, currentY: 140 },
    )).toEqual([]);
  });

  it('computes pan deltas to reveal clipped rooms', () => {
    const room = { ...createRoom('Kitchen'), position: { x: -20, y: -30 } };
    expect(getPanDeltaToRevealRoom(room, { x: 0, y: 0 }, makeRect(300, 200))).toEqual({ x: 44, y: 54 });

    const farRoom = { ...createRoom('Far Room'), position: { x: 260, y: 170 } };
    expect(getPanDeltaToRevealRoom(farRoom, { x: 0, y: 0 }, makeRect(300, 200))).toEqual({ x: -64, y: -30 });

    const visibleRoom = { ...createRoom('Visible'), position: { x: 80, y: 60 } };
    expect(getPanDeltaToRevealRoom(visibleRoom, { x: 0, y: 0 }, makeRect(300, 200))).toEqual({ x: 0, y: 0 });
  });

  it('detects editable targets and dash arrays', () => {
    const input = document.createElement('input');
    const textarea = document.createElement('textarea');
    const select = document.createElement('select');
    const div = document.createElement('div');
    Object.defineProperty(div, 'isContentEditable', { configurable: true, value: true });

    expect(isEditableTarget(input)).toBe(true);
    expect(isEditableTarget(textarea)).toBe(true);
    expect(isEditableTarget(select)).toBe(true);
    expect(isEditableTarget(div)).toBe(true);
    expect(isEditableTarget(null)).toBe(false);

    expect(getRoomStrokeDasharray('dashed')).toBe('8 5');
    expect(getRoomStrokeDasharray('dotted')).toBe('2 4');
    expect(getRoomStrokeDasharray('solid')).toBeUndefined();
  });

  it('renders room shapes with themed stroke styling', () => {
    const roomStyle = {
      fillColorIndex: 2,
      strokeColorIndex: 4,
      strokeStyle: 'dashed' as const,
    };

    const { rerender, container } = render(
      <svg>
        {renderRoomShape('diamond', 100, 60, roomStyle, 'dark')}
      </svg>,
    );
    expect(container.querySelector('polygon')).toBeInTheDocument();

    rerender(<svg>{renderRoomShape('oval', 100, 60, roomStyle, 'light')}</svg>);
    expect(container.querySelector('ellipse')).toBeInTheDocument();

    rerender(<svg>{renderRoomShape('octagon', 100, 60, roomStyle, 'light')}</svg>);
    expect(container.querySelector('polygon')).toBeInTheDocument();

    rerender(<svg>{renderRoomShape('pentagon', 100, 60, roomStyle, 'light')}</svg>);
    expect(container.querySelector('polygon')).toBeInTheDocument();

    rerender(<svg>{renderRoomShape('hexagon', 100, 60, roomStyle, 'light')}</svg>);
    expect(container.querySelector('polygon')).toBeInTheDocument();

    rerender(<svg>{renderRoomShape('house', 100, 60, roomStyle, 'light')}</svg>);
    expect(container.querySelector('polygon')).toBeInTheDocument();

    rerender(<svg>{renderRoomShape('box', 100, 60, roomStyle, 'light')}</svg>);
    expect(container.querySelector('path')).toBeInTheDocument();
    expect(container.querySelectorAll('line')).toHaveLength(0);

    rerender(<svg>{renderRoomShape('rectangle', 100, 60, roomStyle, 'light')}</svg>);
    const rect = container.querySelector('rect');
    expect(rect).toBeInTheDocument();
    expect(rect).toHaveAttribute('rx');
  });

  it('tracks document theme changes through the hook', async () => {
    function ThemeProbe(): React.JSX.Element {
      const theme = useDocumentTheme();
      return <div data-testid="theme-probe">{theme}</div>;
    }

    document.documentElement.setAttribute('data-theme', 'light');
    render(<ThemeProbe />);
    expect(screen.getByTestId('theme-probe')).toHaveTextContent('light');

    act(() => {
      document.documentElement.setAttribute('data-theme', 'dark');
    });

    await waitFor(() => {
      expect(screen.getByTestId('theme-probe')).toHaveTextContent('dark');
    });
  });
});
