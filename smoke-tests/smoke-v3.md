# fweep smoke tests

This document defines the manual smoke-test pass for `fweep v3`.

## General instructions
- Run these checks against the current `v3` branch build before merging to `main`.
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
6. Confirm the PNG export still matches the live canvas closely enough for:
   - `paper`
   - `antique`
   - `contour`

## Parchment panel
1. Open a map and confirm the right-hand panel starts in chooser mode, not game mode.
2. Confirm chooser mode shows:
   - IFDB search input
   - `Search` button
   - local-file launch control
3. Resize the panel horizontally and confirm:
   - drag remains smooth
   - width updates correctly
   - the map, minimap, and overlays stay clear of the panel
4. Resize the panel vertically and confirm:
   - the panel remains anchored to the bottom-right
   - content remains usable
   - chooser mode scrolls when needed
5. Launch any supported game and confirm the panel switches to game mode.
6. In game mode, confirm:
   - the Parchment iframe is visible
   - `Parchment by Dannii Willis` appears above the iframe and links correctly
   - `reset` appears at the far right
7. Click `reset` and confirm the panel returns to chooser mode.

## IFDB search and launch
1. Search IFDB for a known game with downloadable story data.
2. Confirm the results list shows, for each result where available:
   - title
   - cover art
   - author
   - published date
   - IFDB page link
3. Click a game title and confirm it launches in the embedded Parchment panel.
4. Repeat by clicking the game cover art and confirm it launches the same way.
5. After launch, confirm the map header shows the associated game title beneath the map name.
6. Reload the page and confirm the IFDB-associated game still appears associated with the map.
7. Search for a game that does not provide a supported downloadable story file and confirm the app shows an alert rather than failing silently.

## Local story file launch
1. In chooser mode, use the local-file control to pick a supported story file from the device.
2. Confirm the game loads in the embedded Parchment panel.
3. Confirm the map header shows the local story title beneath the map name.
4. Click `reset` and confirm chooser mode returns.
5. Confirm the local-file control now presents a reconnect-style prompt using the remembered file name.
6. Confirm selecting the file again launches it successfully.

## Focus and leaving-map safeguards
1. While chooser mode is visible, leave the map via `Back to maps` and confirm no Parchment warning appears.
2. Launch a game so the iframe is visible.
3. Press `Ctrl+/` from the main app and confirm focus moves into the Parchment panel.
4. Press `Ctrl+/` from inside the game and confirm focus returns to fweep.
   - Failed: An error beep sounds and focus does not change.
5. With the game panel active, use `Back to maps` and confirm the app warns that the user should save the game before leaving.
6. With the game panel active, refresh the page or attempt to close/navigate away and confirm the browser-native unload warning appears.

## Compatibility and migration
1. Open at least one map saved from `v2` / schema `3`.
2. Confirm the map loads without validation or routing errors.
3. Confirm the map can be:
   - opened
   - edited
   - saved
   - reloaded
   - exported
4. Confirm the migrated map still behaves correctly when no associated game metadata existed previously.
5. If available, open a map already associated with an IFDB game and confirm the metadata still parses and loads correctly.

## Release-specific checks
- Verify the `main...v3` feature set:
  - embedded Parchment panel
  - IFDB search and launch
  - local-file launch
  - associated-game title display
  - panel resize behavior
  - leave-page warnings when a game is active
  - schema `3 -> 4` migration behavior

## Latest results

### v3
- Core app flow: passed
- Save and reload: passed
- Import and export: passed
- Parchment panel: passed
- IFDB search and launch: passed
- Local story file launch: passed
- Compatibility and migration: passed
- Release-specific checks: passed
- Focus switching via `Ctrl+/`: partial pass with one non-blocking discrepancy
  - `Ctrl+/` from the main app moves focus into the Parchment panel.
  - `Ctrl+/` from inside the game does not reliably return focus to fweep and currently causes an error beep instead.
  - This was judged non-blocking for the release.

## Minimum release gate
A `v3` smoke pass is complete only if all of the following succeed:
- app load and map selection
- create/open/save/reload
- import/export
- embedded Parchment panel flow
- IFDB search and launch
- local-file launch and reconnect prompt
- compatibility and schema-migration checks
