# fweep smoke tests

This document defines the manual smoke-test pass for `fweep v8`.

## General instructions
- Run these checks against the current `v8` branch build before merging to `main`.
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
   - move a room, adjust the viewport, or reposition a background image
2. Refresh the page and confirm the edit persists.
3. Close the map, reopen it from the selection dialog, and confirm the same state persists.

## Import and export
1. Export the current map as JSON and confirm the download succeeds.
2. Import a valid map JSON file and confirm it opens successfully.
3. Confirm the imported map appears in the saved maps list afterward.
4. Open the PNG export dialog and export with `Theme canvas` background enabled.
5. Confirm the PNG export succeeds.

## CLI help panel and help surfaces
1. Open a map and confirm the CLI help panel is visible in its collapsed state.
2. Expand the CLI help panel and confirm:
   - the outline tree renders
   - selecting a linked example shows the paired images
   - the panel can be collapsed again
3. Use the keyboard help path to open the regular help dialog and confirm it still works without the old `?` button.
   a. This is obsolete. I should have removed the shortcut so that the old help dialog was no longer available.
4. If applicable, invoke the CLI help command flow and confirm it still opens the CLI help panel correctly.

## Embedded game and command flow
1. Open a map with a linked game or launch a game in the embedded Parchment panel.
2. Enter normal interactive-fiction commands and confirm the game responds normally.
3. Enter `\`-prefixed mapper commands and confirm:
   - they execute successfully
   - their output appears inline in the transcript
4. Confirm command suggestions still appear as expected in the embedded flow.
   a. command suggestions have been removed.

## Background image and canvas interaction polish
1. Open the background image controls and import a reference image.
   a. popup appears behind game panel
2. Confirm a newly imported background image appears centered in a sensible position relative to the current map view.
3. Recenter the background image with `Option`-drag or `Command`-drag and confirm the result is stable and intuitive.
4. Confirm the background-image popup is positioned correctly and does not jump to an obviously incorrect location.
5. Exercise edge scrolling / marquee selection near canvas boundaries and confirm the interaction remains usable.

## Layout and overlays
1. Open a map with the left-hand Parchment panel visible.
2. Confirm the map-name chip is not obscured by the Parchment panel.
3. Resize the Parchment panel and confirm the top-bar / canvas layout still behaves correctly.
4. Open the CLI help panel and confirm it coexists cleanly with the map and side-panel layout.

## Compatibility and migration
1. Open at least one map saved from `v7` / schema `4`.
2. Confirm the map loads without validation or routing errors.
3. Confirm the map can be:
   - opened
   - edited
   - saved
   - reloaded
   - exported
4. Confirm there is no user-visible migration issue introduced by the `v8` help, layout, or background-image changes.

## Release-specific checks
- Verify the `main...v8` feature set:
  - collapsible CLI help panel
  - visual help examples
  - background-image positioning fixes
  - map-name / panel layout polish
  - refreshed startup tips and help-surface cleanup
  - removal of the old `Alt+Shift+H` legacy-help shortcut
  - background-image popup appearing above the game panel

## Latest results

### v8
- Automated validation: passed
  - `npm run build`
  - `npm test`
- Production build output: passed
  - Vite build succeeded
  - One chunk-size warning remains for the main JS bundle; this is non-blocking unless performance review disagrees
- Persisted-data / migration review: passed
  - No schema changes detected in `main...v8`
  - No schema-version bump or migration required
- Manual smoke pass: pending
  - Core app flow: pending
  - Save and reload: pending
  - Import and export: pending
  - CLI help panel and help surfaces: pending
  - Embedded game and command flow: pending
  - Background image and canvas interaction polish: pending
  - Layout and overlays: pending
  - Compatibility and migration: pending
  - Release-blocker follow-ups addressed in branch before release:
    - removed the old `Alt+Shift+H` shortcut to the hidden legacy help dialog
    - fixed the background-image popup stacking so it no longer appears behind the game panel

## Minimum release gate
A `v8` smoke pass is complete only if all of the following succeed:
- app load and map selection
- create/open/save/reload
- import/export
- CLI help panel and help-surface verification
- embedded game and command flow
- background-image and layout-polish checks
- compatibility checks for existing schema-4 maps
