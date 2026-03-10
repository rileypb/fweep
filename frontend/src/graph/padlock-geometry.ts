export const PADLOCK_WIDTH = 12;
export const PADLOCK_HEIGHT = 16;
export const PADLOCK_SHACKLE_PATH = 'M3 7 V5.5 C3 2.8 5 1 6 1 C7 1 9 2.8 9 5.5 V7';
export const PADLOCK_BODY = {
  x: 2,
  y: 7,
  width: 8,
  height: 8,
  rx: 1.5,
} as const;
export const PADLOCK_KEYHOLE = {
  cx: 6,
  cy: 10.5,
  r: 1,
} as const;
export const PADLOCK_KEY_STEM = {
  x1: 6,
  y1: 11.5,
  x2: 6,
  y2: 13,
} as const;
