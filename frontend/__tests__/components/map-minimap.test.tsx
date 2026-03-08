import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { MapMinimap } from '../../src/components/map-minimap';
import { createConnection, createRoom } from '../../src/domain/map-types';

describe('MapMinimap', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-theme', 'light');
  });

  it('does not render when there are no rooms', () => {
    const onPanToMapPoint = jest.fn<(point: { x: number; y: number }) => void>();
    const onPanBy = jest.fn<(delta: { x: number; y: number }) => void>();

    const { container } = render(
      <MapMinimap
        rooms={{}}
        connections={{}}
        selectedRoomIds={[]}
        selectedConnectionIds={[]}
        panOffset={{ x: 0, y: 0 }}
        canvasRect={{ width: 300, height: 200 }}
        theme="light"
        onPanToMapPoint={onPanToMapPoint}
        onPanBy={onPanBy}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('renders shapes, connections, and viewport', () => {
    const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
    const hallway = { ...createRoom('Hallway'), position: { x: 240, y: 120 } };
    const connection = createConnection(kitchen.id, hallway.id, true);

    render(
      <MapMinimap
        rooms={{ [kitchen.id]: kitchen, [hallway.id]: hallway }}
        connections={{ [connection.id]: connection }}
        selectedRoomIds={[kitchen.id]}
        selectedConnectionIds={[connection.id]}
        panOffset={{ x: 0, y: 0 }}
        canvasRect={{ width: 300, height: 200 }}
        theme="light"
        onPanToMapPoint={jest.fn<(point: { x: number; y: number }) => void>()}
        onPanBy={jest.fn<(delta: { x: number; y: number }) => void>()}
      />,
    );

    expect(screen.getByTestId('map-minimap')).toBeInTheDocument();
    expect(screen.getByTestId('map-minimap-viewport')).toBeInTheDocument();
    expect(document.querySelectorAll('.map-minimap__room')).toHaveLength(2);
    expect(document.querySelectorAll('.map-minimap__connection')).toHaveLength(1);
  });

  it('clicking the minimap recenters the main canvas', () => {
    const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
    const onPanToMapPoint = jest.fn<(point: { x: number; y: number }) => void>();

    render(
      <MapMinimap
        rooms={{ [kitchen.id]: kitchen }}
        connections={{}}
        selectedRoomIds={[]}
        selectedConnectionIds={[]}
        panOffset={{ x: 0, y: 0 }}
        canvasRect={{ width: 300, height: 200 }}
        theme="light"
        onPanToMapPoint={onPanToMapPoint}
        onPanBy={jest.fn<(delta: { x: number; y: number }) => void>()}
      />,
    );

    const svg = screen.getByTestId('map-minimap-svg');
    jest.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 180,
      bottom: 140,
      width: 180,
      height: 140,
      toJSON: () => ({}),
    });

    fireEvent.click(svg, { clientX: 90, clientY: 70 });

    expect(onPanToMapPoint).toHaveBeenCalledTimes(1);
  });

  it('dragging the viewport pans the main canvas', () => {
    const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
    const onPanBy = jest.fn<(delta: { x: number; y: number }) => void>();

    render(
      <MapMinimap
        rooms={{ [kitchen.id]: kitchen }}
        connections={{}}
        selectedRoomIds={[]}
        selectedConnectionIds={[]}
        panOffset={{ x: 0, y: 0 }}
        canvasRect={{ width: 300, height: 200 }}
        theme="light"
        onPanToMapPoint={jest.fn<(point: { x: number; y: number }) => void>()}
        onPanBy={onPanBy}
      />,
    );

    const svg = screen.getByTestId('map-minimap-svg');
    const viewport = screen.getByTestId('map-minimap-viewport');
    jest.spyOn(svg, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 180,
      bottom: 140,
      width: 180,
      height: 140,
      toJSON: () => ({}),
    });

    fireEvent.mouseDown(viewport, { clientX: 60, clientY: 60 });
    fireEvent.mouseMove(document, { clientX: 90, clientY: 60 });
    fireEvent.mouseUp(document, { clientX: 90, clientY: 60 });

    expect(onPanBy).toHaveBeenCalled();
  });
});
