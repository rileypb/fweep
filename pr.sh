body=$(printf '%s\n' \
  "This PR releases fweep v8 from v8 to main." \
  "" \
  "v8 expands in-app command guidance, improves embedded mapper/game help flows, and polishes canvas-side interactions around background images, overlays, and layout behavior." \
  "" \
  "## What's included" \
  "" \
  "- Added a collapsible CLI help panel with structured command guidance and linked visual examples." \
  "- Added richer help assets and image-backed command examples for the embedded mapper/game workflow." \
  "- Improved background-image placement and popup behavior, including a fix for the popup appearing behind the game panel." \
  "- Polished canvas and layout behavior around edge scrolling, marquee pan, and map-name / panel overlap." \
  "- Removed dead layout helper code and cleaned up obsolete help affordances, including the old `?` button and `Alt+Shift+H` shortcut path." \
  "- Added broad regression coverage for CLI help rendering, help-image scripting, parser/suggestion behavior, background-image controls, and app-shell layout flows." \
  "" \
  "## Compatibility / persistence" \
  "" \
  "- v8 does not change the persisted map schema." \
  "- schema version remains unchanged from v7." \
  "- no migration or schema-version bump is required for this release" \
  "- existing saved maps continue to load and save under the existing schema-4 behavior" \
  "- persisted-data review for main...v8 found no new migration requirements" \
  "" \
  "## Validation" \
  "" \
  "- npm run build passes" \
  "- automated test suite passes: 84 suites, 1478 tests" \
  "- release notes are updated in release-notes.md" \
  "- manual smoke checklist is recorded in smoke-tests/smoke-v8.md" \
  "- release-blocker follow-ups addressed on branch:" \
  "  - removed the old Alt+Shift+H shortcut to the hidden legacy help dialog" \
  "  - fixed background-image popup stacking above the game panel" \
  "- note: the production build still emits a non-blocking Vite chunk-size warning for the main JS bundle" \
  "" \
  "## Notes" \
  "" \
  "- Long-form release notes are recorded in release-notes.md." \
  "- Smoke-test results are recorded in smoke-tests/smoke-v8.md." \
)

gh pr create \
  --base main \
  --head v8 \
  --title "Release v8" \
  --body "$body"
