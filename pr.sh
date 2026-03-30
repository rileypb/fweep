gh pr create \
  --base main \
  --head v6 \
  --title "Release v6" \
  --body "$(cat <<'EOF'
This PR releases `fweep v6` from `v6` to `main`.

`v6` reshapes the keyboard-driven mapping flow around the embedded game panel, adds richer command discovery, and improves map interaction polish across selection, zoom, layout, and accessibility.

## What’s included

- Moved the embedded game panel to the left side of the app and removed the old standalone CLI shell panel.
- Routed mapper commands through the game-side input flow, with command echo and mapper output mirrored into the game transcript.
- Added in-context command suggestions in the game window, including broader direction/item coverage and zoom help.
- Added a startup tips dialog plus expanded keyboard-shortcut and help coverage.
- Polished map interaction behavior around selection styling, low-zoom labels, item-list expansion, pseudo-room connection selection, and prettify/layout behavior.
- Added focused regression coverage for tips, shortcuts, suggestions, prettify stability, accessibility, and related shell behavior.
- Fixed branch-local TypeScript issues that were blocking the production build during release prep.

## Compatibility / persistence

`v6` does not change the persisted map schema.

- schema version remains unchanged from `v5`
- no migration or schema-version bump is required for this release
- existing saved maps continue to load and save under the existing schema-4 behavior

## Validation

- `npm run build` passes
- automated test suite passes: `74` suites, `1350` tests
- manual smoke checklist is recorded in `smoke-tests/smoke-v6.md`
- manual branch smoke pass recorded in `smoke-tests/smoke-v6.md` passed

## Notes

- Long-form release notes are recorded in `release-notes.md`.
- Smoke-test results are recorded in `smoke-tests/smoke-v6.md`.
EOF
)"
