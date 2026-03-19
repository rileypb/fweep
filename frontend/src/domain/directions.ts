/** The twelve standard interactive-fiction directions. */
export const STANDARD_DIRECTIONS = [
  'north', 'south', 'east', 'west',
  'northeast', 'northwest', 'southeast', 'southwest',
  'up', 'down', 'in', 'out',
] as const;

export type StandardDirection = (typeof STANDARD_DIRECTIONS)[number];

/** CLI-supported directions omit in/out, which are reserved for other command grammar. */
export const CLI_DIRECTIONS = [
  'north', 'south', 'east', 'west',
  'northeast', 'northwest', 'southeast', 'southwest',
  'up', 'down',
] as const;

export type CliDirection = (typeof CLI_DIRECTIONS)[number];

/** Map of common abbreviations to their full direction name. */
const ABBREVIATIONS: Record<string, string> = {
  n: 'north',
  s: 'south',
  e: 'east',
  w: 'west',
  ne: 'northeast',
  nw: 'northwest',
  se: 'southeast',
  sw: 'southwest',
  u: 'up',
  d: 'down',
};

/**
 * Normalize a direction label: trim, lowercase, and expand abbreviations.
 * Custom (non-standard) directions are preserved as lowercased strings.
 */
export function normalizeDirection(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  return ABBREVIATIONS[trimmed] ?? trimmed;
}

/** Check whether a normalized direction is one of the twelve standard directions. */
export function isStandardDirection(dir: string): dir is StandardDirection {
  return (STANDARD_DIRECTIONS as readonly string[]).includes(dir);
}

/** Map from a standard direction to its opposite. */
const OPPOSITES: Readonly<Record<string, string>> = {
  north: 'south',
  south: 'north',
  east: 'west',
  west: 'east',
  northeast: 'southwest',
  southwest: 'northeast',
  northwest: 'southeast',
  southeast: 'northwest',
  up: 'down',
  down: 'up',
  in: 'out',
  out: 'in',
};

/**
 * Return the opposite of a normalized standard direction.
 * Returns `undefined` for custom (non-standard) directions.
 */
export function oppositeDirection(dir: string): string | undefined {
  return OPPOSITES[dir];
}
