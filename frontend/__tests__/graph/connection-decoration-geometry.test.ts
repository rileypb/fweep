import { describe, expect, it } from '@jest/globals';
import {
  getDirectionalAnnotationRenderIntent,
  getDirectionalAnnotationReverseDirection,
  getRoomPassThroughBounds,
} from '../../src/graph/connection-decoration-geometry';
import type { Room } from '../../src/domain/map-types';
import type { ConnectionRenderGeometry } from '../../src/graph/connection-geometry';

const verticalBezierGeometry: ConnectionRenderGeometry = {
  kind: 'cubic',
  start: { x: 0, y: 0 },
  control1: { x: 0, y: 40 },
  control2: { x: 0, y: 80 },
  end: { x: 0, y: 120 },
};

const baseRoom: Room = {
  id: 'room-1',
  name: 'Room',
  description: '',
  position: { x: 100, y: 200 },
  directions: {},
  isDark: false,
  locked: false,
  shape: 'rectangle',
  fillColorIndex: 0,
  strokeColorIndex: 0,
  strokeStyle: 'solid',
};

describe('connection decoration geometry', () => {
  it('expands room pass-through bounds by the requested padding', () => {
    const unpaddedBounds = getRoomPassThroughBounds(baseRoom, 'default', 0);
    const paddedBounds = getRoomPassThroughBounds(baseRoom, 'default', 3);

    expect(paddedBounds.left).toBe(unpaddedBounds.left - 3);
    expect(paddedBounds.top).toBe(unpaddedBounds.top - 3);
    expect(paddedBounds.right).toBe(unpaddedBounds.right + 3);
    expect(paddedBounds.bottom).toBe(unpaddedBounds.bottom + 3);
  });

  it('prefers semantic reverse direction for vertical annotations when only the target is up', () => {
    expect(getDirectionalAnnotationReverseDirection('up', null, 'up')).toBe(true);
  });

  it('falls back to geometric direction for vertical annotations when semantics are unavailable', () => {
    const intent = getDirectionalAnnotationRenderIntent('up', verticalBezierGeometry, null, null, null);

    expect(intent.label).toBe('up');
    expect(intent.compactLength).toBe(true);
    expect(intent.reverseDirection).toBe(true);
    expect(intent.preferPositiveNormalX).toBe(true);
    expect(intent.positionSample?.kind).toBe('curve');
  });

  it('treats out annotations as reversed in-annotations', () => {
    const intent = getDirectionalAnnotationRenderIntent('out', verticalBezierGeometry, null, null, null);

    expect(intent.label).toBe('in');
    expect(intent.compactLength).toBe(false);
    expect(intent.reverseDirection).toBe(true);
    expect(intent.preferPositiveNormalX).toBe(false);
  });
});
