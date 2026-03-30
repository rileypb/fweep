gh pr create \
  --base main \
  --head v7 \
  --title "Release v7" \
  --body "$(cat <<'EOF'
This PR releases `fweep v7` from `v7` to `main`.

`v7` tightens the embedded-command workflow with restored shared history in Parchment, better parser-command suggestions, and more reliable viewport/session restoration when moving between maps.

## What’s included

- Restored `ArrowUp` / `ArrowDown` history navigation inside the embedded Parchment command input.
- Unified command recall so interactive-fiction commands and `\`-prefixed mapper commands share one interleaved history.
- Added parser and suggestion improvements for `select`, selected-room pseudo-room exits, and notate follow-up keywords.
- Improved map-view session restoration so pan and zoom state are reapplied more reliably while moving between maps.
- Added focused regression coverage for Parchment shell/history behavior, CLI hooks, viewport persistence, room focus, and suggestion-helper flows.
- Fixed branch-local TypeScript drift in tests so the production build passes again during release prep.

## Compatibility / persistence

`v7` does not change the persisted map schema.

- schema version remains unchanged from `v6`
- no migration or schema-version bump is required for this release
- existing saved maps continue to load and save under the existing schema-4 behavior
- pan/zoom session restoration is cached per map within the active browser session only; it does not rewrite saved documents

## Validation

- `npm run build` passes
- automated test suite passes: `83` suites, `1447` tests
- manual smoke checklist is recorded in `smoke-tests/smoke-v7.md`
- manual branch smoke checklist for `v7` is recorded in `smoke-tests/smoke-v7.md`
- manual branch smoke pass is still pending before merge

## Notes

- Long-form release notes are recorded in `release-notes.md`.
- Smoke-test results are recorded in `smoke-tests/smoke-v7.md`.
EOF
)"
