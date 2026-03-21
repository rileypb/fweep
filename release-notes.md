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
