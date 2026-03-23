gh pr create \
  --base main \
  --head v4 \
  --title "Release v4" \
  --body "$(cat <<'EOF'
This PR releases `fweep v4` from `v4` to `main`.

`v4` focuses on usability polish for the embedded game workflow: smoother panel-aware layout, stronger keyboard focus switching, and clearer chooser behavior.

## What’s included

- Improved `Ctrl+/` focus switching between fweep, the chooser search field, and embedded Parchment.
- Made the minimap and map-title chip reclaim space when the right-hand panels no longer overlap them.
- Added chooser empty-state tips, starting with the `Ctrl+/` usage hint.
- Cleared chooser search state when leaving one map and opening another.
- Updated the leave-map warning copy for active games.
- Added focused regression coverage across the app shell, chooser, and Parchment flows.
- Refactored Parchment app-shell logic into dedicated helpers, hooks, and sidebar components.

## Compatibility / persistence

`v4` does not change the persisted map schema.

- schema version remains unchanged from `v3`
- no migration or schema-version bump is required for this release
- existing saved maps continue to load and save under the existing schema-4 behavior

## Validation

- `npm run build` passes
- automated test suite passes: `72` suites, `1427` tests
- manual smoke checks recorded in `smoke-tests/smoke-v4.md` passed

## Notes

- Long-form release notes are recorded in `release-notes.md`.
- Smoke-test results are recorded in `smoke-tests/smoke-v4.md`.
EOF
)"
