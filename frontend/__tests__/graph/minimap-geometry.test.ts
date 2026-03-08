import { describe, expect, it } from '@jest/globals';
import { createConnection, createRoom } from '../../src/domain/map-types';
import {
  computeWorldBounds,
  createMinimapTransform,
  fromMinimapPoint,
  getMinimapConnectionPoints,
  getMinimapViewportRect,
  getRoomNodeWidth,
  toMinimapPoint,
} from '../../src/graph/minimap-geometry';

describe('minimap geometry', () => {
  it('computes padded world bounds for multiple rooms', () => {
    const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
    const hallway = { ...createRoom('Hallway'), position: { x: 280, y: 60 } };

    const bounds = computeWorldBounds([kitchen, hallway]);

    expect(bounds).not.toBeNull();
    expect(bounds!.left).toBe(48);
    expect(bounds!.top).toBe(28);
    expect(bounds!.right).toBe(392);
    expect(bounds!.bottom).toBe(188);
  });

  it('accounts for variable room widths', () => {
    const room = createRoom('the room of requirement');

    expect(getRoomNodeWidth(room.name)).toBeGreaterThan(80);
  });

  it('creates non-zero bounds for a single room', () => {
    const room = { ...createRoom('Kitchen'), position: { x: 0, y: 0 } };

    const bounds = computeWorldBounds([room]);

    expect(bounds).not.toBeNull();
    expect(bounds!.width).toBeGreaterThan(80);
    expect(bounds!.height).toBeGreaterThan(36);
  });

  it('maps between world and minimap coordinates', () => {
    const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
    const bounds = computeWorldBounds([room])!;
    const transform = createMinimapTransform(bounds, { width: 180, height: 140 });
    const point = { x: 120, y: 140 };

    const minimapPoint = toMinimapPoint(point, transform);
    const restored = fromMinimapPoint(minimapPoint, transform);

    expect(restored.x).toBeCloseTo(point.x, 5);
    expect(restored.y).toBeCloseTo(point.y, 5);
  });

  it('derives viewport rectangle from pan offset and canvas size', () => {
    const room = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
    const bounds = computeWorldBounds([room])!;
    const transform = createMinimapTransform(bounds, { width: 180, height: 140 });

    const rect = getMinimapViewportRect({ x: -40, y: -60 }, { width: 300, height: 200 }, transform);

    expect(rect.width).toBeGreaterThan(0);
    expect(rect.height).toBeGreaterThan(0);
    expect(Number.isFinite(rect.x)).toBe(true);
    expect(Number.isFinite(rect.y)).toBe(true);
  });

  it('converts connection geometry into minimap points', () => {
    const kitchen = { ...createRoom('Kitchen'), position: { x: 80, y: 120 } };
    const hallway = { ...createRoom('Hallway'), position: { x: 240, y: 120 } };
    const connection = createConnection(kitchen.id, hallway.id, true);
    const bounds = computeWorldBounds([kitchen, hallway])!;
    const transform = createMinimapTransform(bounds, { width: 180, height: 140 });

    const points = getMinimapConnectionPoints(
      { [kitchen.id]: kitchen, [hallway.id]: hallway },
      connection,
      transform,
    );

    expect(points).not.toHaveLength(0);
  });
});
