import { describe, expect, it } from '@jest/globals';
import {
  getDirectionalAnnotationRenderIntent,
  getDirectionalAnnotationReverseDirection,
} from '../../src/graph/connection-decoration-geometry';
import type { ConnectionRenderGeometry } from '../../src/graph/connection-geometry';

const verticalBezierGeometry: ConnectionRenderGeometry = {
  kind: 'bezier',
  start: { x: 0, y: 0 },
  control1: { x: 0, y: 40 },
  control2: { x: 0, y: 80 },
  end: { x: 0, y: 120 },
};

describe('connection decoration geometry', () => {
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
