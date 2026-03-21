# fweep migration process

## Scope
This document defines how `fweep` handles persisted map migrations and how migration work is verified during release.

## Current Transition Policy
- `v2` ships using the existing implicit compatibility behavior in the loader and load-time normalization.
- `v2` does not retrofit a formal explicit map-document migration framework.
- Formal explicit map-document migrations begin with `v3`.
- For `v2`, release review verifies that existing compatibility shims correctly handle prior saved maps.
- For `v3` onward, schema-affecting changes require explicit stepwise migrations.

## Core Rules
- Migrations are defined by map `schemaVersion`, not by release branch name.
- Bump `CURRENT_SCHEMA_VERSION` only when persisted map data or its required semantics change.
- Do not create a migration for every release. Create one only when the persisted schema or storage contract requires it.
- Keep migrations stepwise as `n -> n+1`.
- Add migrations when the schema-changing feature is introduced, not at release time whenever possible.

## When To Add A Migration
Add a migration if any of the following is true:

- a persisted `MapDocument` field is added, removed, renamed, retyped, or reshaped
- the meaning of a persisted field changes and old data must be rewritten
- a previously optional persisted field becomes required
- validation becomes stricter in a way that older saved maps may fail without transformation
- existing stored map records must be permanently rewritten before normal app logic can use them

Do not add a migration for:

- purely visual changes
- recomputable derived state with safe defaults
- test-only changes
- storage additions that do not require rewriting existing map documents

## Authoring Process
When a feature changes persisted schema:

1. Bump `CURRENT_SCHEMA_VERSION`.
2. Add an explicit migration for the previous schema version to the new one.
3. Keep the migration focused on one schema step only.
4. Update the load path so documents migrate to the current schema before current-schema validation runs.
5. Add tests for the migration in the same branch as the feature.

## Load-Time Process
Loading a persisted map should conceptually happen in this order:

1. Parse enough raw input to read `schemaVersion`.
2. Apply ordered migrations until the current schema version is reached.
3. Validate the migrated document against the current schema.
4. Apply only safe, non-semantic normalization defaults after migration.

## Testing Requirements
Each migration should have tests for:

- happy-path migration from the immediately previous schema
- preservation of user content and stable IDs
- filling new required defaults
- renaming or reshaping fields without data loss
- rejection of malformed legacy input when migration cannot safely recover it
- end-to-end old fixture -> migrate -> validate -> save -> reload

When relevant, also test export/import round trips after migration.

Keep representative fixtures for older schemas under a stable test location such as:

- `frontend/__tests__/fixtures/maps/schema-1/`
- `frontend/__tests__/fixtures/maps/schema-2/`
- `frontend/__tests__/fixtures/maps/schema-3/`

## Release Process
When preparing `release vN`:

1. Diff `main...vN`.
2. Review the diff for persisted map schema, validation, import/export, and storage changes.
3. If preparing `v2`:
   - confirm that the existing implicit compatibility behavior is sufficient for the persisted-data changes in `main...v2`
   - verify manually that prior saved maps still load correctly
   - do not retrofit a formal explicit migration framework solely for `v2`
4. If preparing `v3` or later, confirm that every schema-affecting change already has:
   - the correct schema-version bump
   - the required `n -> n+1` migration
   - migration tests
5. If preparing `v3` or later and migration work was missed, add the missing schema-version bump, migration, and tests before release.
6. Verify manually that older maps upgrade correctly.
7. Commit the migration work on `vN`.
8. Open a pull request from `vN` to `main` if tooling permits.

## Late-Discovered Migration Policy
If a missed migration is found during release:

- do not add a large catch-up migration unless it is intentionally designed and thoroughly tested
- reconstruct the intended stepwise migration chain explicitly
- test the full path from old fixture to migrated, validated, saved, and reloaded document

The main risk is semantic corruption: data may serialize successfully but still be wrong after load, edit, save, or export if intermediate schema assumptions were skipped.
