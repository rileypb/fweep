gh pr create \
  --base main \
  --head v5 \
  --title "Release v5" \
  --body "$(cat <<'EOF'
This PR releases `fweep v5` from `v5` to `main`.

`v5` adds a few small but practical quality improvements around IFDB usage visibility, chooser navigation, and installable site metadata.

## What’s included

- Added clickable IFDB author links in chooser search results.
- Added favicon, touch-icon, and web manifest metadata for a more complete installed/browser presence.
- Added a silent production heartbeat to `/api/ifdb/ping` so hosted IFDB proxy usage can be observed without affecting the user experience.
- Added focused automated coverage for the IFDB heartbeat client, scheduler, and proxy endpoint behavior.

## Compatibility / persistence

`v5` does not change the persisted map schema.

- schema version remains unchanged from `v4`
- no migration or schema-version bump is required for this release
- existing saved maps continue to load and save under the existing schema-4 behavior

## Validation

- `npm run build` passes
- automated test suite passes: `73` suites, `1435` tests
- manual smoke checks recorded in `smoke-tests/smoke-v5.md` passed

## Notes

- Long-form release notes are recorded in `release-notes.md`.
- Smoke-test results are recorded in `smoke-tests/smoke-v5.md`.
EOF
)"
