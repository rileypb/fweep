gh pr create \
  --base main \
  --head v2 \
  --title "Release v2" \
  --body "$(cat <<'EOF'
This PR releases `fweep v2` from `v2` to `main`.

`v2` adds new canvas texture themes and related rendering improvements, updates persisted map view settings to support the new theme behavior, and includes release, migration, and smoke-test process documentation.

## What’s included

- Added new canvas themes:
  - paper
  - antique
  - contour
- Added procedural texture rendering and texture-tile caching for themed backgrounds.
- Improved contour rendering and related export behavior.
- Persisted additional map view settings:
  - `canvasTheme`
  - `textureSeed`
- Added migration, release, and smoke-test process documentation.
- Fixed texture-wrapper test typing so the branch builds cleanly.
- Corrected theme-canvas PNG export alignment so paper, antique, and contour exports match the interactive map.

## Compatibility / persistence

`v2` includes persisted-data changes for map view settings, but it continues to rely on the existing implicit compatibility behavior in the loader and storage path for older saved maps.

This release does not introduce the formal explicit map-document migration framework. Per the current policy, explicit schema migrations begin with `v3`.

## Validation

- `npm run build` passes
- automated test suite passes
- manual smoke checks passed for theme-canvas PNG export alignment in `paper`, `antique`, and `contour`

## Notes

Long-form release notes are recorded in `release-notes.md`.
Smoke-test results are recorded in `smoke-tests/smoke-v2.md`.
EOF
)"
