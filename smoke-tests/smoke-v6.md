# fweep smoke tests

This document defines the manual smoke-test pass for `fweep v6`.

## General instructions
- Run these checks against the current `v6` branch build before merging to `main`.
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

## Embedded game and transcript flow
1. Open a map with no associated game and confirm the embedded game/search panel appears on the left side of the app.
2. Search IFDB or load a local story file and confirm the game panel still launches normally.
3. With a game running, use `Ctrl+/` or `Cmd+/` to switch focus between the game and the mapper.
4. Enter a mapper command through the game-side input flow and confirm:
   - the command is routed to the mapper
   - the command echo appears in the game transcript
   - the resulting mapper output also appears in the game transcript
5. Enter a normal game command and confirm it still goes to the interactive fiction game rather than the mapper.

## Suggestions, tips, and keyboard help
1. Open the tips dialog and confirm it shows a startup tip with next/back navigation.
2. Dismiss the tips dialog and confirm the next startup tip index advances.
3. Disable startup tips from the dialog, reload the app, and confirm the dialog does not reopen automatically.
4. Focus the command input, open suggestions, and confirm suggestions appear for:
   - room and item-related commands
   - diagonal direction shorthands such as `nw`
   - zoom commands
5. Open the help dialog and confirm the updated keyboard and CLI shortcut documentation appears.

## Map interaction polish
1. Zoom the map using:
   - `zoom in`
   - `zoom out`
   - `zoom reset`
   - a direct numeric command such as `zoom 25` or `zoom 200%`
2. Confirm the map zoom updates correctly and clamps to the expected visible range.
3. Create or open a room with enough items to trigger `+N more`, expand it, and confirm the item list can be expanded and collapsed.
4. Confirm room and connection selection styling is visible and updates correctly while selecting and dragging.
5. Drag a connection to a pseudo-room target and confirm the connection remains selectable.

## Compatibility and migration
1. Open at least one map saved from `v5` / schema `4`.
2. Confirm the map loads without validation or routing errors.
3. Confirm the map can be:
   - opened
   - edited
   - saved
   - reloaded
   - exported
4. Confirm there is no user-visible migration issue introduced by the `v6` CLI, layout, or shell changes.

## Release-specific checks
- Verify the `main...v6` feature set:
  - left-side embedded game panel
  - mapper command echo/routing inside the game transcript
  - in-game suggestions and startup tips
  - keyboard help and zoom command improvements

## Latest results

### v6
- Automated validation: passed
  - `npm run build`
  - `npm test -- --runInBand`
- Production build output: passed
  - Vite build succeeded
  - One chunk-size warning remains for the main JS bundle; this is non-blocking unless performance review disagrees
- Persisted-data / migration review: passed
  - No schema changes detected in `main...v6`
  - No schema-version bump or migration required
- Manual smoke pass: pending
  - Not completed in this terminal-only environment
  - Run the checklist above on the branch build before merging to `main`

## Minimum release gate
A `v6` smoke pass is complete only if all of the following succeed:
- app load and map selection
- create/open/save/reload
- import/export
- embedded game and transcript routing flow
- tips/help/suggestions coverage
- compatibility checks for existing schema-4 maps
