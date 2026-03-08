import { describe, expect, it, jest, beforeEach } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import { MapMinimap } from '../../src/components/map-minimap';
import { createConnection, createRoom } from '../../src/domain/map-types';

describe('MapMinimap', () => {
  beforeEach(() => {
    document.documentElement.setAttribute('data-theme', 'light');
  });

  function mockSvgRect(element: Element): void {
    jest.spyOn(element, 'getBoundingClientRect').mockReturnValue({
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
  }

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

  it('renders different room-shape silhouettes', () => {
    const rectangle = { ...createRoom('Rectangle'), position: { x: 0, y: 0 }, shape: 'rectangle' as const };
    const diamond = { ...createRoom('Diamond'), position: { x: 140, y: 0 }, shape: 'diamond' as const };
    const oval = { ...createRoom('Oval'), position: { x: 280, y: 0 }, shape: 'oval' as const };
    const octagon = { ...createRoom('Octagon'), position: { x: 420, y: 0 }, shape: 'octagon' as const };

    render(
      <MapMinimap
        rooms={{
          [rectangle.id]: rectangle,
          [diamond.id]: diamond,
          [oval.id]: oval,
          [octagon.id]: octagon,
        }}
        connections={{}}
        selectedRoomIds={[]}
        selectedConnectionIds={[]}
        panOffset={{ x: 0, y: 0 }}
        canvasRect={{ width: 300, height: 200 }}
        theme="light"
        onPanToMapPoint={jest.fn<(point: { x: number; y: number }) => void>()}
        onPanBy={jest.fn<(delta: { x: number; y: number }) => void>()}
      />,
    );

    const paths = Array.from(document.querySelectorAll('.map-minimap__room path')).map((path) => path.getAttribute('d'));
    expect(paths.some((d) => d?.includes('Q'))).toBe(true);
    expect(paths.some((d) => d?.includes('A'))).toBe(true);
    expect(paths.some((d) => d?.includes(`L ${0}`))).toBe(true);
  });

  it('skips connections whose rooms are missing', () => {
    const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
    const invalidConnection = createConnection(kitchen.id, 'missing-room', true);

    render(
      <MapMinimap
        rooms={{ [kitchen.id]: kitchen }}
        connections={{ [invalidConnection.id]: invalidConnection }}
        selectedRoomIds={[]}
        selectedConnectionIds={[]}
        panOffset={{ x: 0, y: 0 }}
        canvasRect={{ width: 300, height: 200 }}
        theme="light"
        onPanToMapPoint={jest.fn<(point: { x: number; y: number }) => void>()}
        onPanBy={jest.fn<(delta: { x: number; y: number }) => void>()}
      />,
    );

    expect(document.querySelectorAll('.map-minimap__connection')).toHaveLength(0);
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
    mockSvgRect(svg);

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
    mockSvgRect(svg);

    fireEvent.mouseDown(viewport, { clientX: 60, clientY: 60 });
    fireEvent.mouseMove(document, { clientX: 90, clientY: 60 });
    fireEvent.mouseUp(document, { clientX: 90, clientY: 60 });

    expect(onPanBy).toHaveBeenCalled();
  });

  it('supports keyboard panning and home recentering', () => {
    const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
    const onPanToMapPoint = jest.fn<(point: { x: number; y: number }) => void>();
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
        onPanToMapPoint={onPanToMapPoint}
        onPanBy={onPanBy}
      />,
    );

    const minimap = screen.getByTestId('map-minimap');
    fireEvent.keyDown(minimap, { key: 'ArrowLeft' });
    fireEvent.keyDown(minimap, { key: 'ArrowRight' });
    fireEvent.keyDown(minimap, { key: 'ArrowUp' });
    fireEvent.keyDown(minimap, { key: 'ArrowDown' });
    fireEvent.keyDown(minimap, { key: 'Home' });

    expect(onPanBy).toHaveBeenCalledWith({ x: 48, y: 0 });
    expect(onPanBy).toHaveBeenCalledWith({ x: -48, y: 0 });
    expect(onPanBy).toHaveBeenCalledWith({ x: 0, y: 48 });
    expect(onPanBy).toHaveBeenCalledWith({ x: 0, y: -48 });
    expect(onPanToMapPoint).toHaveBeenCalledTimes(1);
  });

  it('disables click, drag, and keyboard behavior when disabled', () => {
    const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
    const onPanToMapPoint = jest.fn<(point: { x: number; y: number }) => void>();
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
        disabled
        onPanToMapPoint={onPanToMapPoint}
        onPanBy={onPanBy}
      />,
    );

    const minimap = screen.getByTestId('map-minimap');
    const svg = screen.getByTestId('map-minimap-svg');
    const viewport = screen.getByTestId('map-minimap-viewport');
    mockSvgRect(svg);

    fireEvent.click(svg, { clientX: 90, clientY: 70 });
    fireEvent.mouseDown(viewport, { clientX: 60, clientY: 60 });
    fireEvent.mouseMove(document, { clientX: 90, clientY: 60 });
    fireEvent.mouseUp(document, { clientX: 90, clientY: 60 });
    fireEvent.keyDown(minimap, { key: 'ArrowLeft' });
    fireEvent.keyDown(minimap, { key: 'Home' });

    expect(minimap).toHaveClass('map-minimap--disabled');
    expect(onPanToMapPoint).not.toHaveBeenCalled();
    expect(onPanBy).not.toHaveBeenCalled();
  });

  it('does not recenter on click while a viewport drag is active', () => {
    const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
    const onPanToMapPoint = jest.fn<(point: { x: number; y: number }) => void>();
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
        onPanToMapPoint={onPanToMapPoint}
        onPanBy={onPanBy}
      />,
    );

    const svg = screen.getByTestId('map-minimap-svg');
    const viewport = screen.getByTestId('map-minimap-viewport');
    mockSvgRect(svg);

    fireEvent.mouseDown(viewport, { clientX: 60, clientY: 60 });
    fireEvent.click(svg, { clientX: 90, clientY: 70 });
    fireEvent.mouseUp(document, { clientX: 60, clientY: 60 });

    expect(onPanToMapPoint).not.toHaveBeenCalled();
  });

  it('stops dragging gracefully if minimap bounds cannot be resolved mid-drag', () => {
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
    mockSvgRect(svg);

    fireEvent.mouseDown(viewport, { clientX: 60, clientY: 60 });
    jest.spyOn(svg, 'getBoundingClientRect').mockImplementation(() => null as never);
    fireEvent.mouseMove(document, { clientX: 90, clientY: 60 });
    fireEvent.mouseUp(document, { clientX: 90, clientY: 60 });

    expect(onPanBy).not.toHaveBeenCalled();
  });
});
