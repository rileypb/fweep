export type ThemeMode = 'light' | 'dark';

export interface RoomColorPaletteEntry {
  readonly light: string;
  readonly dark: string;
  readonly label: string;
}

export const ROOM_FILL_PALETTE = [
  { light: '#ffffff', dark: '#111827', label: 'Paper' },
  { light: '#fef3c7', dark: '#422006', label: 'Parchment' },
  { light: '#ffcc00', dark: '#854d0e', label: 'Gold' },
  { light: '#fde68a', dark: '#713f12', label: 'Amber' },
  { light: '#fecaca', dark: '#7f1d1d', label: 'Rose' },
  { light: '#fecdd3', dark: '#831843', label: 'Blush' },
  { light: '#ddd6fe', dark: '#4c1d95', label: 'Lilac' },
  { light: '#bfdbfe', dark: '#1e3a8a', label: 'Sky' },
  { light: '#bae6fd', dark: '#164e63', label: 'Cyan' },
  { light: '#bbf7d0', dark: '#14532d', label: 'Mint' },
  { light: '#d1fae5', dark: '#065f46', label: 'Seafoam' },
  { light: '#e5e7eb', dark: '#374151', label: 'Mist' },
  { light: '#d6d3d1', dark: '#44403c', label: 'Stone' },
] as const satisfies readonly RoomColorPaletteEntry[];

export const ROOM_STROKE_PALETTE = [
  { light: '#6366f1', dark: '#a5b4fc', label: 'Indigo' },
  { light: '#111827', dark: '#f3f4f6', label: 'Ink' },
  { light: '#1d4ed8', dark: '#93c5fd', label: 'Blue' },
  { light: '#0f766e', dark: '#5eead4', label: 'Teal' },
  { light: '#166534', dark: '#86efac', label: 'Green' },
  { light: '#854d0e', dark: '#facc15', label: 'Olive' },
  { light: '#c2410c', dark: '#fdba74', label: 'Orange' },
  { light: '#be123c', dark: '#fda4af', label: 'Crimson' },
  { light: '#9d174d', dark: '#f9a8d4', label: 'Magenta' },
  { light: '#7c3aed', dark: '#c4b5fd', label: 'Violet' },
  { light: '#475569', dark: '#cbd5e1', label: 'Slate' },
  { light: '#000000', dark: '#ffffff', label: 'Contrast' },
] as const satisfies readonly RoomColorPaletteEntry[];

export const DEFAULT_ROOM_FILL_COLOR_INDEX = 0;
export const DEFAULT_ROOM_STROKE_COLOR_INDEX = 0;

function findPaletteIndexByColor(
  palette: readonly RoomColorPaletteEntry[],
  color: string,
): number | null {
  const normalizedColor = color.toLowerCase();
  const index = palette.findIndex(
    (entry) => entry.light.toLowerCase() === normalizedColor || entry.dark.toLowerCase() === normalizedColor,
  );

  return index >= 0 ? index : null;
}

function isValidPaletteIndex(
  palette: readonly RoomColorPaletteEntry[],
  index: number,
): boolean {
  return Number.isInteger(index) && index >= 0 && index < palette.length;
}

export function isValidRoomFillColorIndex(index: unknown): index is number {
  return typeof index === 'number' && isValidPaletteIndex(ROOM_FILL_PALETTE, index);
}

export function isValidRoomStrokeColorIndex(index: unknown): index is number {
  return typeof index === 'number' && isValidPaletteIndex(ROOM_STROKE_PALETTE, index);
}

export function findRoomFillColorIndexByLegacyColor(color: string): number | null {
  return findPaletteIndexByColor(ROOM_FILL_PALETTE, color);
}

export function findRoomStrokeColorIndexByLegacyColor(color: string): number | null {
  return findPaletteIndexByColor(ROOM_STROKE_PALETTE, color);
}

export function getRoomFillColor(index: number, theme: ThemeMode): string {
  const entry = ROOM_FILL_PALETTE[index] ?? ROOM_FILL_PALETTE[DEFAULT_ROOM_FILL_COLOR_INDEX];
  return theme === 'dark' ? entry.dark : entry.light;
}

export function getRoomStrokeColor(index: number, theme: ThemeMode): string {
  const entry = ROOM_STROKE_PALETTE[index] ?? ROOM_STROKE_PALETTE[DEFAULT_ROOM_STROKE_COLOR_INDEX];
  return theme === 'dark' ? entry.dark : entry.light;
}

export function getRoomLabelColor(theme: ThemeMode): string {
  return theme === 'dark' ? '#f3f4f6' : '#111827';
}
