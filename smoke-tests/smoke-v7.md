# fweep smoke tests

This document defines the manual smoke-test pass for `fweep v7`.

## General instructions
- Run these checks against the current `v7` branch build before merging to `main`.
- Repeat the key checks against the deployed site after merge.
- Record any failure with:
  - the step that failed
  - what was expected
  - what actually happened
  - whether the issue is a release blocker

## Core app flow
1. Open the app at the root route and confirm the map selection dialog appears.
2. Open an existing map and confirm it loads successfully.
3. Create a new map and confirm it opens in the editor.
4. Refresh the page and confirm the same map reopens from its routed URL.
5. Return to the selection dialog and confirm the map appears in the saved maps list.

## Save and reload
1. In a new or existing map, make a visible edit:
   - create at least one room
   - create at least one connection
   - move a room or adjust the viewport
2. Refresh the page and confirm the edit persists.
3. Close the map, reopen it from the selection dialog, and confirm the same state persists.

## Import and export
1. Export the current map as JSON and confirm the download succeeds.
2. Import a valid map JSON file and confirm it opens successfully.
3. Confirm the imported map appears in the saved maps list afterward.
4. Open the PNG export dialog and export with `Theme canvas` background enabled.
5. Confirm the PNG export succeeds.

## Embedded game history and command flow
1. Open a map with a linked game or launch a game in the embedded Parchment panel.
2. Enter at least two normal interactive-fiction commands and confirm the game responds normally.
3. Enter at least two `\`-prefixed mapper commands and confirm:
   - they execute successfully
   - their output appears inline in the transcript
4. While the input is focused, press `ArrowUp` repeatedly and confirm history recall includes both:
   - normal game commands
   - `\`-prefixed mapper commands
5. Press `ArrowDown` and confirm history walks forward and eventually restores the in-progress draft input.
6. Confirm `ArrowUp` / `ArrowDown` do not scroll the transcript while the line input itself is focused.

## Command suggestions and parser polish
1. In the command input, type `select ` and confirm room suggestions appear as expected.
2. Select a room in the map and enter a pseudo-room command such as:
   - `north is unknown`
   - `north goes on forever`
3. Confirm the command applies to the selected room and reveals the intended exit result.
4. Start a notate command that already names a room and confirm `with` appears as a suggestion at the right point.

## View restoration and focus
1. Pan and zoom to a non-default viewport on one map.
2. Leave that map, open a different map, then reopen the first map.
3. Confirm the prior pan/zoom state is restored during the same browser session.
4. Reload the page and confirm the map still opens cleanly with no focus or routing regressions.

## Compatibility and migration
1. Open at least one map saved from `v6` / schema `4`.
2. Confirm the map loads without validation or routing errors.
3. Confirm the map can be:
   - opened
   - edited
   - saved
   - reloaded
   - exported
4. Confirm there is no user-visible migration issue introduced by the `v7` command-history or viewport-session changes.

## Release-specific checks
- Verify the `main...v7` feature set:
  - restored embedded command history
  - shared recall across game and mapper commands
  - `select` alias behavior
  - selected-room pseudo-room commands
  - improved viewport/session restoration

## Latest results

### v7
- Automated validation: passed
  - `npm run build`
  - `npm test`
- Production build output: passed
  - Vite build succeeded
  - One chunk-size warning remains for the main JS bundle; this is non-blocking unless performance review disagrees
- Persisted-data / migration review: passed
  - No schema changes detected in `main...v7`
  - No schema-version bump or migration required
- Manual smoke pass: pending

## Minimum release gate
A `v7` smoke pass is complete only if all of the following succeed:
- app load and map selection
- create/open/save/reload
- import/export
- embedded game history and transcript routing flow
- command-suggestion and parser-polish checks
- compatibility checks for existing schema-4 maps
