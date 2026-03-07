/** Minimal metadata for a persisted map, used by the selection dialog and storage layer. */
export interface MapMetadata {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;   // ISO-8601
  readonly updatedAt: string;   // ISO-8601
}

/** Top-level persisted map document (stub – will grow as domain is fleshed out). */
export interface MapDocument {
  readonly schemaVersion: number;
  readonly metadata: MapMetadata;
  readonly rooms: Record<string, unknown>;
  readonly connections: Record<string, unknown>;
  readonly items: Record<string, unknown>;
}

/** Current schema version for new maps. */
export const CURRENT_SCHEMA_VERSION = 1;

/** Create a fresh, empty MapDocument with the given name. */
export function createEmptyMap(name: string): MapDocument {
  const now = new Date().toISOString();
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    metadata: {
      id: crypto.randomUUID(),
      name,
      createdAt: now,
      updatedAt: now,
    },
    rooms: {},
    connections: {},
    items: {},
  };
}
