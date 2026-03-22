import { describe, expect, it } from '@jest/globals';
import { createEmptyMap } from '../../src/domain/map-types';
import { migrateMapDocumentToCurrentSchema } from '../../src/domain/map-migrations';

describe('migrateMapDocumentToCurrentSchema', () => {
  it('migrates schema-3 maps by adding null associated game metadata and bumping to schema 4', () => {
    const doc = createEmptyMap('Legacy');
    const schema3Doc = {
      ...doc,
      schemaVersion: 3,
      metadata: {
        id: doc.metadata.id,
        name: doc.metadata.name,
        createdAt: doc.metadata.createdAt,
        updatedAt: doc.metadata.updatedAt,
      },
    };

    const migrated = migrateMapDocumentToCurrentSchema(schema3Doc) as typeof schema3Doc & {
      metadata: typeof schema3Doc.metadata & { associatedGame: null };
    };

    expect(migrated.schemaVersion).toBe(4);
    expect(migrated.metadata.associatedGame).toBeNull();
  });

  it('leaves current-schema maps unchanged', () => {
    const doc = createEmptyMap('Current');

    expect(migrateMapDocumentToCurrentSchema(doc)).toEqual(doc);
  });
});
