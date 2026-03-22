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
