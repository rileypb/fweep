# fweep release notes

## v2

`v2` adds new canvas texture themes and related rendering improvements, along with compatibility updates for saved map view settings.

### Highlights
- Added paper, antique, and contour canvas themes.
- Added procedural texture rendering and texture-tile caching for themed map backgrounds.
- Improved contour rendering and related export behavior.
- Added process documentation for migrations, releases, and smoke testing.

### User-visible changes
- New visual themes are available for the map canvas:
  - `paper`
  - `antique`
  - `contour`
- Theme rendering now includes generated texture backgrounds for a richer canvas appearance.
- Map export rendering was updated to reflect the new theme and texture behavior.
- The map canvas and related view state now persist additional theme-related settings.

### Compatibility and persistence
- Saved map view data now includes `canvasTheme` and `textureSeed`.
- `v2` continues to rely on the existing implicit compatibility behavior in the loader for older saved maps.
- No formal explicit map-document migration framework is introduced in `v2`.

### Quality and internal improvements
- Added and updated tests for:
  - texture rendering
  - texture wrapper behavior
  - map persistence behavior
  - map canvas behavior
  - export rendering
- Fixed texture-wrapper test typing so the release branch builds cleanly.
- Corrected theme-canvas PNG export alignment so paper, antique, and contour exports match the interactive map.
- Added release, migration, and smoke-test process documentation.

### Validation summary
- Production build passes.
- Automated test suite passes.
- Manual smoke checks passed for theme-canvas PNG export alignment in `paper`, `antique`, and `contour`.

## v3

`v3` brings interactive fiction play directly into fweep with an embedded Parchment panel, IFDB game search, and map-to-game association metadata.

### Highlights
- Added a resizable right-hand game panel with an embedded Parchment player.
- Added IFDB search and launch flow for supported downloadable games.
- Added local story-file loading into the embedded player.
- Added persisted associated-game metadata on maps.
- Introduced the first explicit schema migration, upgrading saved maps from schema `3` to schema `4`.

### User-visible changes
- Maps can now be paired with a game shown in a right-hand panel.
- The game panel supports:
  - IFDB search
  - cover art in search results
  - links to IFDB game pages
  - loading supported games directly into local Parchment
  - loading a story file from the local device
- Once a game is chosen, the panel switches into a dedicated game view with:
  - the embedded Parchment player
  - a `reset` control to return to game selection
- The game panel can now be resized:
  - horizontally
  - vertically
- A keyboard shortcut is available to move focus between fweep and the embedded game panel:
  - `Ctrl+/`
- The app warns the user before leaving the map if the game panel is active, to reduce the chance of losing IF progress.
- The map header now shows the associated game title beneath the map name when available.

### Compatibility and persistence
- Saved map metadata now includes an optional associated game record for:
  - IFDB-linked games
  - local-file-linked games
- `v3` begins explicit schema migrations:
  - schema `3 -> 4` adds `metadata.associatedGame`
- Older schema-3 maps are migrated on load and remain compatible.
- IFDB search in local development now works through a same-origin proxy path.
- GitHub Pages still requires a separately hosted production proxy for live IFDB API access.

### Quality and internal improvements
- Added domain modules and tests for:
  - IFDB search-result normalization
  - IFDB viewgame parsing
  - download selection
  - proxy behavior
  - associated-game metadata
  - schema migration
- Tightened test coverage around:
  - Parchment panel behavior
  - local-file loading
  - routing and leave-page warnings
  - panel resize controls
- Refined the CLI/output area layout and removed the old `Less` and `Import` buttons.

### Validation summary
- Production build passes.
- Automated test suite passes.
- Manual smoke-test confirmation is still pending before release.

## v4

`v4` polishes the embedded game workflow with smoother panel behavior, better keyboard focus switching, and clearer chooser guidance.

### Highlights
- Improved `Ctrl+/` focus switching between fweep and the game/search panel.
- Refined panel-aware layout so top overlays and the minimap reclaim space when the side panels no longer overlap them.
- Added chooser tips and reset behavior to keep the game-search panel more understandable across maps.

### User-visible changes
- `Ctrl+/` now works more reliably as a two-way focus shortcut:
  - from fweep into the chooser search field or embedded game
  - back from search or Parchment to the CLI input
- The minimap now slides back to the right wall instead of hanging in empty space when the Parchment panel becomes short enough.
- The map/game name chip now shifts left when the output log is short enough instead of reserving unnecessary space.
- The chooser panel now shows usage tips when it has no search results yet.
- The first chooser tip explains the keyboard-focus shortcut:
  - `Use Ctrl+/ to switch the keyboard focus between the game and the mapper.`
- IFDB chooser state is now cleared when leaving one map and opening another, so stale searches do not bleed across maps.
- The leave-map confirmation copy is clearer when a game may have unsaved progress.

### Compatibility and persistence
- `v4` does not change the persisted map schema.
- No schema-version bump or migration is required for this release.
- Existing saved maps continue to use the `v3` persistence and migration behavior unchanged.

### Quality and internal improvements
- Raised cumulative automated coverage back above 90%.
- Added focused regression coverage for:
  - Parchment panel layout behavior
  - focus switching across fweep, chooser search, and embedded Parchment
  - chooser empty-state tips and per-map reset behavior
  - panel sizing helpers and related app-shell helpers
- Refactored Parchment app-shell logic into dedicated helpers, hooks, and sidebar components to make the release easier to maintain without changing behavior.

### Validation summary
- Production build passes.
- Automated test suite passes: `72` suites, `1427` tests.
- Manual smoke-test confirmation passed.

## v5

`v5` adds a few small but practical quality improvements around IFDB usage visibility, chooser navigation, and installable site metadata.

### Highlights
- Added silent production heartbeats to the hosted IFDB proxy so live usage can be observed without interrupting users.
- Added clickable author links in IFDB search results to let users pivot into author-based browsing faster.
- Added favicon, touch-icon, and web manifest metadata for a more complete installed/browser presence.

### User-visible changes
- IFDB search results now render the author name as a button when author metadata is available.
  - Clicking the author launches a new IFDB search for that author.
- The app now publishes favicon and PWA-style metadata:
  - SVG favicon
  - PNG favicon
  - ICO shortcut icon
  - Apple touch icon
  - web manifest and theme color
- Production builds now emit a background heartbeat to `/api/ifdb/ping`:
  - one ping when the app starts
  - one additional ping every 15 minutes while the app remains open
  - heartbeat failures are discarded silently
  - local development skips sending the heartbeat

### Compatibility and persistence
- `v5` does not change the persisted map schema.
- No schema-version bump or migration is required for this release.
- Existing saved maps continue to use the `v4` persistence and migration behavior unchanged.

### Quality and internal improvements
- Added dedicated client, proxy, and scheduler coverage for the IFDB heartbeat behavior.
- Kept the heartbeat endpoint local to the proxy layer so it does not contact IFDB upstream.
- Tightened IFDB chooser typing around author-link rendering so the branch stays build-clean.

### Validation summary
- Production build passes.
- Automated test suite passes: `73` suites, `1435` tests.
- Manual smoke-test confirmation passed.

## v6

`v6` reshapes the keyboard-driven mapping flow around the embedded game panel, adds richer command discovery, and improves map interaction polish across selection, zoom, layout, and accessibility.

### Highlights
- Moved the embedded game panel to the left and folded mapper command flow more directly into the game transcript.
- Added in-context command suggestions and command echoing inside the game window.
- Added a startup tips dialog plus broader keyboard-shortcut help and discoverability.
- Expanded keyboard control coverage for focus switching, zoom, layout, and map interaction polish.

### User-visible changes
- The embedded Parchment panel now sits on the left side of the app, and the old standalone CLI panel is removed.
- Mapper commands can now be driven from the game-side input flow:
  - map commands can be invoked from game input
  - mapper output is echoed into the game transcript
  - command suggestions can appear inside the game window
- CLI/game command discovery is broader and more forgiving:
  - added suggestions for items
  - added suggestions for diagonal directions such as `nw`, `ne`, `sw`, and `se`
  - help and tips now document zoom commands and other keyboard workflows more clearly
- Added a startup tips dialog with rotating keyboard-and-workflow tips.
- Added or refined keyboard shortcuts for:
  - zoom commands, including direct numeric zoom targets such as `zoom 25` and `zoom 200%`
  - broader app shortcuts surfaced through help and tips
- Map interaction polish includes:
  - better selection styling for rooms and connections
  - improved low-zoom room-name rendering
  - support for expanding long room item lists with `+N more`
  - selectable pseudo-room connections by dragging
  - updated centering and layout behavior for notes and connection results

### Compatibility and persistence
- `v6` does not change the persisted map schema.
- No schema-version bump or migration is required for this release.
- The explicit schema-`4` migration path introduced in `v3` remains unchanged.
- Saved maps continue to load, save, and export under the existing schema and validation rules.

### Quality and internal improvements
- Added and updated regression coverage for:
  - startup tips and keyboard-shortcut UI
  - command suggestions and command parsing behavior
  - prettify/layout stability
  - map canvas interaction and export behavior
  - accessibility smoke coverage for the updated UI shell
- Release prep also fixed branch-local TypeScript issues that were blocking the production build:
  - aligned test typings with the current tips-dialog callback contract
  - updated prettify-layout test fixtures for sticky-note positions
  - corrected heartbeat timer test typing under DOM+Node overloads
  - removed an invalid HTML attribute from the room item panel markup

### Validation summary
- Production build passes.
- Automated test suite passes: `74` suites, `1350` tests.
- Manual smoke-test confirmation is still pending before release.

## v7

`v7` tightens the embedded-command workflow with restored shared history in Parchment, better parser-command suggestions, and more reliable viewport/session restoration when moving between maps.

### Highlights
- Restored `ArrowUp`/`ArrowDown` command history in the embedded Parchment input.
- Unified history so game commands and `\` mapper commands can be recalled in one interleaved sequence.
- Improved command parsing and suggestions for room selection, pseudo-room exits, and annotation flows.
- Fixed map-view session restoration so pan and zoom state survive more transitions reliably.

### User-visible changes
- In the embedded game input, `ArrowUp` and `ArrowDown` once again navigate command history instead of scrolling the transcript when the line input is focused.
- Command history now interleaves:
  - normal interactive-fiction commands
  - `\`-prefixed mapper commands
- The command parser and suggestions are more forgiving and discoverable:
  - `select <room>` now works as an alias for `show <room>`
  - pseudo-room exit commands can target the currently selected room directly, such as `north is unknown`
  - room-lead and pseudo-room suggestion flows offer more helpful follow-up keywords like `unknown`, `is`, `goes`, `leads`, and `lies`
  - notate suggestions better prompt for `with` after a completed room reference
- Room reveal, room focus, and map reopening behavior are more reliable when switching maps or restoring prior view state.

### Compatibility and persistence
- `v7` does not change the persisted map schema.
- No schema-version bump or migration is required for this release.
- The existing explicit schema-`4` migration path remains unchanged.
- `v7` does add session-scoped cached map view restoration for pan/zoom behavior:
  - this affects in-session viewport restoration
  - it does not require rewriting saved maps

### Notable fixes
- Fixed a regression where the embedded transcript stole `ArrowUp` and `ArrowDown` from Parchment’s command history.
- Fixed shared-history behavior so typed game commands and bridged mapper commands both appear in the same recall list.
- Fixed release-branch TypeScript test drift that had been blocking the production build even while Jest still passed.
- Added broader regression coverage for:
  - Parchment shell and history behavior
  - CLI hook behavior
  - viewport persistence
  - room-focus behavior
  - command-helper suggestion resolution

### Validation summary
- Production build passes.
- Automated test suite passes: `83` suites, `1447` tests.
- Persisted-data / migration review passed:
  - no schema changes detected in `main...v7`
  - no schema-version bump or migration required
- Manual smoke-test confirmation passed.

## v8

`v8` expands in-app command guidance, improves embedded mapper/game help flows, and polishes canvas-side interactions around background images, overlays, and layout behavior.

### Highlights
- Added a collapsible CLI help panel with structured command guidance and visual examples.
- Added richer embedded help content, including generated image sequences for command examples.
- Improved background-image positioning and related canvas layout behavior.
- Tightened parser/suggestion behavior for pseudo-room, note, and room-selection flows.

### User-visible changes
- A new collapsible CLI help panel now sits beside the map and provides:
  - a tree view of CLI topics
  - linked visual examples for selected command flows
  - richer command-discovery content for map-editing actions
- The in-map help content is clearer and more visual:
  - CLI help outline content is expanded
  - command examples now include image-backed transitions
  - startup tips were refreshed to better match the current keyboard-first workflow
- Background-image controls and placement behavior are more polished:
  - new background images center more reliably on the current map view
  - the background-image popup is positioned more consistently
  - recentering and related interactions are easier to understand
- Canvas/layout polish includes:
  - better protection of the map-name chip from the Parchment panel
  - improved edge-scroll and marquee-pan behavior while interacting with the canvas
  - removal of the old `?` help button in favor of keyboard help flows and the dedicated help surfaces
- Removed auto-suggestions

### Compatibility and persistence
- `v8` does not change the persisted map schema.
- No schema-version bump or migration is required for this release.
- `CURRENT_SCHEMA_VERSION` remains `4`.
- Persisted-data review of `main...v8` found no new map-document migration requirements.

### Notable fixes
- Removed dead layout helper code that was no longer part of the live app layout path.
- Updated release-branch tests to match current tips and IFDB normalization behavior.
- Kept the help dialog and help command paths intact while removing only the obsolete help button.
- Removed the old `Alt+Shift+H` shortcut so the legacy help dialog is no longer reachable through the keyboard while that surface stays hidden.
- Fixed the background-image popup stacking order so it renders above the embedded game panel instead of behind it.
- Added regression coverage for:
  - CLI help panel rendering
  - help-image script behavior
  - parser/suggestion flows
  - background-image controls
  - app-shell and routing layout behavior

### Validation summary
- Production build passes.
- Automated test suite passes: `84` suites, `1478` tests.
- Persisted-data / migration review passed:
  - no schema changes detected in `main...v8`
  - no schema-version bump or migration required
- Production build emits a Vite chunk-size warning for the main JS bundle; this is non-blocking for the release unless performance review decides otherwise.
- Manual smoke-test confirmation is still pending before release.

## v9

`v9` improves the mapper CLI around pseudo-room exit commands, fixes an explicit-direction connection bug, and makes IFDB proxy failures report more clearly in production.

### Highlights
- Added multi-direction pseudo-room CLI forms such as `north and south are unknown`.
- Fixed explicit-source relative connections so target rooms bind the opposite direction correctly.
- Improved the hosted IFDB proxy so upstream failures surface as normal `502` responses instead of confusing browser-level CORS errors.

### User-visible changes
- The CLI now supports batching pseudo-room terminal commands across multiple directions in a single line for:
  - `is/are unknown`
  - `go/goes on forever`
  - `lie/lies death`
  - `lead/leads nowhere`
  - `lead/leads to somewhere else`
- Supported multi-direction forms include:
  - `north, south is unknown`
  - `north and south are unknown`
  - `north, south, and east go on forever`
  - explicit-source forms such as `north and south of Kitchen are unknown`
  - vertical combinations such as `above and below are unknown`
- Explicit-source relative-connect commands such as `west of Carnival is Foobar` now bind the created or connected target room on the opposite side as intended:
  - source room uses `west`
  - target room uses `east`
- Production IFDB proxy failures now return clearer API errors while preserving CORS headers, so real upstream failures are easier to diagnose from the browser and app logs.

### Compatibility and persistence
- `v9` does not change the persisted map schema.
- No schema-version bump or migration is required for this release.
- `CURRENT_SCHEMA_VERSION` remains `4`.
- Persisted-data review of `main...v9` found no new map-document migration requirements.

### Notable fixes
- Added regression coverage for:
  - multi-direction pseudo-room parsing and descriptions
  - batched pseudo-room execution through the CLI hook
  - explicit-source relative-connect target-direction behavior
  - IFDB proxy CORS-safe upstream failure handling
- Fixed the explicit-source relative-connect execution path so it no longer reuses the source direction on the target room.
- Tightened both shared proxy and Vercel proxy error paths so exceptions still emit expected CORS headers.

### Validation summary
- Production build passes.
- Automated test suite passes: `84` suites, `1483` tests.
- Persisted-data / migration review passed:
  - no schema changes detected in `main...v9`
  - no schema-version bump or migration required
- Production build emits a Vite chunk-size warning for the main JS bundle; this remains non-blocking for the release unless performance review decides otherwise.
- Manual smoke-test confirmation passed.
