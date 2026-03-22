gh pr create \
  --base main \
  --head v3 \
  --title "Release v3" \
  --body "$(cat <<'EOF'
This PR releases `fweep v3` from `v3` to `main`.

`v3` brings interactive fiction play directly into fweep with an embedded Parchment panel, IFDB game search, local story-file launching, and persisted map-to-game associations.

## What’s included

- Added a resizable right-hand game panel with an embedded Parchment player.
- Added IFDB search and launch flow for supported downloadable games.
- Added local story-file loading into the embedded player.
- Added persisted associated-game metadata on maps.
- Added associated game title display beneath the map name.
- Added leave-page warnings when a game is active in the embedded player.
- Added horizontal and vertical resize controls for the game panel.
- Added `Ctrl+/` focus-switch support between fweep and the game panel.
- Added IFDB development proxy support and production proxy planning documentation.
- Added the first explicit schema migration for persisted map data.

## Compatibility / persistence

`v3` introduces persisted associated-game metadata on maps and begins the explicit migration policy documented for `v3+` releases.

- schema version is now `4`
- a `3 -> 4` migration upgrades older saved maps by adding `metadata.associatedGame`
- older schema-3 maps continue to load and save correctly after migration

Production note:

- local development supports IFDB search through the same-origin proxy path
- GitHub Pages production still requires a separately hosted proxy for live IFDB API access

## Validation

- `npm run build` passes
- automated test suite passes: `67` suites, `1367` tests
- manual smoke checks recorded in `smoke-tests/smoke-v3.md` passed overall

## Notes

- Long-form release notes are recorded in `release-notes.md`.
- Smoke-test results are recorded in `smoke-tests/smoke-v3.md`.
- One non-blocking smoke note remains: `Ctrl+/` reliably moves focus from fweep into Parchment, but does not reliably return focus from inside the game back to fweep.
EOF
)"
