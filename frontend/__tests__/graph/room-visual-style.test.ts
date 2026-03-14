import { describe, expect, it } from '@jest/globals';
import { createRoom } from '../../src/domain/map-types';
import {
  getEffectiveRoomShape,
  getRoomLabelLines,
  getRoomNodeDimensions,
  SQUARE_CLASSIC_ROOM_SIZE,
} from '../../src/graph/room-visual-style';

describe('room visual style helpers', () => {
  it('keeps square-classic rooms at a fixed size', () => {
    const room = createRoom('A room with a much longer title than usual');

    expect(getRoomNodeDimensions(room, 'square-classic')).toEqual({
      width: SQUARE_CLASSIC_ROOM_SIZE,
      height: SQUARE_CLASSIC_ROOM_SIZE,
    });
  });

  it('wraps and clips labels inside square-classic rooms', () => {
    const room = createRoom('An exceptionally long room name that should wrap and eventually be clipped');

    expect(getRoomLabelLines(room, SQUARE_CLASSIC_ROOM_SIZE, SQUARE_CLASSIC_ROOM_SIZE, 'square-classic')).toEqual([
      'An',
      'exception',
      'ally long',
      'room name',
    ]);
  });

  it('uses rectangular room shapes for square-classic rendering', () => {
    expect(getEffectiveRoomShape('diamond', 'square-classic')).toBe('rectangle');
    expect(getEffectiveRoomShape('diamond', 'default')).toBe('diamond');
  });
});
