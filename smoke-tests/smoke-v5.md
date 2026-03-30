# fweep smoke tests

This document defines the manual smoke-test pass for `fweep v5`.

## General instructions
- Run these checks against the current `v5` branch build before merging to `main`.
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

## IFDB chooser
1. Open a map with no associated game and confirm the right-hand panel starts in chooser mode.
2. Search IFDB for a known title and confirm at least one result renders an author name as a clickable button when author metadata is available.
3. Click an author button and confirm:
   - the search box updates to that author name
   - the chooser reruns the search automatically
   - the results update without errors
4. Launch a game from search results and confirm the chooser still behaves normally after returning with `reset`.

## Site metadata and icons
1. Load the app in a browser tab and confirm the page shows the new favicon.
2. Inspect the page metadata and confirm:
   - `/favicon.svg` is referenced
   - `/favicon-96x96.png` is referenced
   - `/favicon.ico` is referenced
   - `/apple-touch-icon.png` is referenced
   - `/site.webmanifest` is referenced
3. Open the manifest file and confirm it loads successfully.

## IFDB proxy heartbeat
1. Run the production build or deployed site with the hosted IFDB proxy configured.
2. Open the app and confirm a request is sent to `/api/ifdb/ping` shortly after load.
3. Leave the app open for at least 15 minutes and confirm one additional request is sent to `/api/ifdb/ping`.
4. Confirm the heartbeat request:
   - returns `200`
   - does not show any user-facing loading state or error UI
5. In local development, confirm no heartbeat request is sent.

## Compatibility and migration
1. Open at least one map saved from `v4` / schema `4`.
2. Confirm the map loads without validation or routing errors.
3. Confirm the map can be:
   - opened
   - edited
   - saved
   - reloaded
   - exported
4. Confirm there is no user-visible migration issue introduced by the `v5` chooser and proxy changes.

## Release-specific checks
- Verify the `main...v5` feature set:
  - IFDB author search links
  - favicon and web-manifest metadata
  - silent production IFDB heartbeat

## Latest results

### v5
- Automated validation: passed
  - `npm run build`
  - `npm test`
- Production build output: passed
  - Vite build succeeded
  - One chunk-size warning remains for the main JS bundle; this is non-blocking unless performance review disagrees
- Persisted-data / migration review: passed
  - No schema changes detected in `main...v5`
  - No schema-version bump or migration required
- Manual smoke pass: passed
  - Core app flow: passed
  - Save and reload: passed
  - Import and export: passed
  - IFDB chooser author-link flow: passed
  - Site metadata and icon checks: passed
  - IFDB proxy heartbeat: passed
  - Compatibility and migration: passed

## Minimum release gate
A `v5` smoke pass is complete only if all of the following succeed:
- app load and map selection
- create/open/save/reload
- import/export
- IFDB chooser author-link flow
- site metadata and icon checks
- compatibility checks for existing schema-4 maps
