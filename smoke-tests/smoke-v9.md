# fweep smoke tests

This document defines the manual smoke-test pass for `fweep v9`.

## General instructions
- Run these checks against the current `v9` branch build before merging to `main`.
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
   - create at least one pseudo-room exit
2. Refresh the page and confirm the edit persists.
3. Close the map, reopen it from the selection dialog, and confirm the same state persists.

## Import and export
1. Export the current map as JSON and confirm the download succeeds.
2. Import a valid map JSON file and confirm it opens successfully.
3. Confirm the imported map appears in the saved maps list afterward.
4. Open the PNG export dialog and confirm export still succeeds for a map that includes ordinary rooms, ordinary connections, and pseudo-room exits.

## CLI pseudo-room grammar
1. Select a room and enter `north and south are unknown`.
2. Confirm both exits are created on the selected room.
3. Enter `north, south and east go on forever` on a selected room and confirm all listed exits are created.
4. Enter `north and south of Kitchen are unknown` and confirm the command works when naming the source room explicitly.
5. Enter `above and below are unknown` on a selected room and confirm vertical multi-direction forms work too.
6. Confirm the CLI output reports pluralized outcomes for batched pseudo-room commands.

## Explicit-source relative connect
1. Create or open a room named `Carnival`.
2. Enter `west of Carnival is Foobar`.
3. Confirm:
   - `Carnival` gets a `west` exit
   - `Foobar` gets the opposite `east` binding
   - `Foobar` does not incorrectly get a `west` binding from that command
4. Repeat with a missing target room and confirm the newly created room still gets the opposite binding.

## IFDB proxy failure behavior
1. Exercise the IFDB production flow from a deployed build.
2. If the upstream IFDB request fails, confirm the app receives a normal HTTP error rather than a browser-reported CORS failure.
3. Confirm the failure is diagnosable from the network response body and status code.

## Compatibility and migration
1. Open at least one map saved from `v8` / schema `4`.
2. Confirm the map loads without validation or routing errors.
3. Confirm the map can be:
   - opened
   - edited
   - saved
   - reloaded
   - exported
4. Confirm there is no user-visible migration issue introduced by the `v9` CLI or proxy changes.

## Release-specific checks
- Verify the `main...v9` feature set:
  - multi-direction pseudo-room CLI forms
  - corrected opposite-direction binding for `west/north/etc. of <room> is <room>`
  - clearer IFDB proxy failure reporting without misleading CORS errors

## Latest results

### v9
- Automated validation: passed
  - `npm run build`
  - `npm test`
- Production build output: passed
  - Vite build succeeded
  - One chunk-size warning remains for the main JS bundle; this is non-blocking unless performance review disagrees
- Persisted-data / migration review: passed
  - No schema changes detected in `main...v9`
  - No schema-version bump or migration required
- Manual smoke pass: passed
  - Core app flow: passed
  - Save and reload: passed
  - Import and export: passed
  - CLI pseudo-room grammar: passed
  - Explicit-source relative connect: passed
  - IFDB proxy failure behavior: passed
  - Compatibility and migration: passed

## Minimum release gate
A `v9` smoke pass is complete only if all of the following succeed:
- app load and map selection
- create/open/save/reload
- import/export
- multi-direction pseudo-room command checks
- explicit-source opposite-direction connection checks
- compatibility checks for existing schema-4 maps
