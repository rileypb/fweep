# fweep smoke tests

This document defines the manual smoke-test pass for `fweep v4`.

## General instructions
- Run these checks against the current `v4` branch build before merging to `main`.
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

## Parchment panel and chooser
1. Open a map with no associated game and confirm the right-hand panel starts in chooser mode.
2. Confirm chooser mode shows:
   - IFDB search input
   - `Search` button
   - local-file launch control
   - the centered usage tip in the empty state
3. Type into the chooser search field without submitting and confirm the tip remains visible.
4. Submit a search that returns results and confirm the tip disappears once results are shown.
5. Leave the map, open a different map with no associated game, and confirm the chooser search input and results are reset.

## Game panel layout and focus
1. Open a map with an associated game or launch one in the chooser.
2. Resize the Parchment panel vertically until it is short and confirm:
   - the minimap returns to the right edge when the panel no longer overlaps it
   - the map/game title chip can slide left when the output log no longer overlaps it
3. With chooser mode visible, press `Ctrl+/` and confirm focus moves between fweep and the chooser search field.
4. Launch a game and confirm `Ctrl+/` moves focus between fweep and the embedded Parchment panel.
5. Confirm returning from chooser or Parchment lands on the CLI input.

## Leaving-map safeguards
1. While chooser mode is visible, leave the map via `Back to maps` and confirm no Parchment warning appears.
2. Launch a game so the iframe is visible.
3. Use `Back to maps` and confirm the leave warning appears with the updated wording.
4. Refresh the page or attempt to close/navigate away and confirm the browser-native unload warning appears while the game is active.

## Compatibility and migration
1. Open at least one map saved from `v3` / schema `4`.
2. Confirm the map loads without validation or routing errors.
3. Confirm the map can be:
   - opened
   - edited
   - saved
   - reloaded
   - exported
4. Confirm there is no user-visible migration issue introduced by the `v4` panel and chooser changes.

## Release-specific checks
- Verify the `main...v4` feature set:
  - two-way `Ctrl+/` focus switching
  - minimap and map-title chip reclaiming space when panels are short
  - chooser empty-state tip
  - chooser search reset between maps
  - updated leave-map warning copy

## Latest results

### v4
- Automated validation: passed
  - `npm run build`
  - `npm test`
- Production build output: passed
  - Vite build succeeded
  - One chunk-size warning remains for the main JS bundle; this is non-blocking unless performance review disagrees
- Manual smoke pass: pending
  - This still needs to be completed before merge according to the release process

## Minimum release gate
A `v4` smoke pass is complete only if all of the following succeed:
- app load and map selection
- create/open/save/reload
- import/export
- chooser-panel flow
- game-panel layout and focus checks
- compatibility checks for existing schema-4 maps
