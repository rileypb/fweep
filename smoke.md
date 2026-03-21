# fweep smoke tests

This document defines the manual smoke-test pass to run before releasing `fweep`.

## General instructions
- Run these checks against the current release branch build before merging to `main`.
- For releases that change deployment behavior, repeat the key checks against the deployed site after merge.
- Record any failure with:
  - the step that failed
  - what was expected
  - what actually happened
  - whether the issue is a release blocker

## Core app flow
1. Open the app at the root route and confirm the map selection dialog appears.
2. Create a new map and confirm it opens in the editor.
3. Refresh the page and confirm the same map reopens from its routed URL.
4. Return to the selection dialog and confirm the new map appears in the saved maps list.
5. Open an existing saved map from the selection dialog and confirm it loads successfully.

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
5. Confirm the PNG export succeeds and visually matches the current map theme closely enough for release purposes.

## Theme and canvas checks
1. Open a map and cycle through the available canvas themes:
   - `default`
   - `paper`
   - `antique`
   - `contour`
2. For each theme, confirm:
   - the canvas background visibly changes
   - the editor remains responsive while the theme is displayed
   - panning and zooming still behave normally
3. Reload the map after selecting a non-default canvas theme and confirm the chosen theme persists.
4. Export a PNG while using:
   - `paper`
   - `antique`
   - `contour`
5. Confirm the exported image reflects the selected theme canvas.

## Compatibility checks

### v2
1. Open at least one map created before `v2`.
2. Confirm the map loads without validation or routing errors.
3. Confirm older saved maps still behave normally after:
   - open
   - edit
   - save
   - reload
4. Confirm older maps fall back sensibly for new view fields such as canvas theme and texture seed.

### v3 and later
1. Open at least one map from the immediately previous schema version.
2. Confirm migration occurs without user-visible corruption.
3. Confirm the migrated map can be:
   - opened
   - edited
   - saved
   - reloaded
   - exported

## Release-specific checks
- Verify the user-visible features changed in `main...vN`.
- Add any temporary smoke cases needed for the specific release before running the pass.

## Minimum release gate
A release smoke pass is considered complete only if all of the following succeed:
- app load and map selection
- create/open/save/reload
- import/export
- release-specific features
- compatibility checks for the current release policy
