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
