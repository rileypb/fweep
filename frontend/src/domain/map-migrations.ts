import { CURRENT_SCHEMA_VERSION } from './map-types';

export const FIRST_SUPPORTED_SCHEMA_VERSION = 1;

export function isSupportedSchemaVersion(schemaVersion: number): boolean {
  return schemaVersion >= FIRST_SUPPORTED_SCHEMA_VERSION && schemaVersion <= CURRENT_SCHEMA_VERSION;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function migrateSchema3To4(input: Record<string, unknown>): Record<string, unknown> {
  const metadata = isPlainObject(input.metadata) ? input.metadata : null;
  const migratedMetadata = metadata
    ? {
      ...metadata,
      associatedGame: metadata.associatedGame ?? null,
    }
    : input.metadata;

  return {
    ...input,
    schemaVersion: CURRENT_SCHEMA_VERSION,
    metadata: migratedMetadata,
  };
}

export function migrateMapDocumentToCurrentSchema(input: unknown): unknown {
  if (!isPlainObject(input)) {
    return input;
  }

  const schemaVersion = input.schemaVersion;
  if (typeof schemaVersion !== 'number') {
    return input;
  }

  if (schemaVersion === 3) {
    return migrateSchema3To4(input);
  }

  return input;
}
