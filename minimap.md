# Add an Interactive Minimap to the Map Editor

## Summary

Add a persistent minimap card to the upper-right area of the map editor that gives users a live overview of the whole map and the current viewport. The minimap is interactive: users can click anywhere in it to recenter the main canvas, and drag the viewport rectangle to pan the main canvas directly.

This is implemented without changing the persisted map schema. The work is primarily a UI/component refactor around `MapCanvas`, plus a pure geometry module and focused tests.

## Goals

- Show a live overview of all rooms and connections.
- Make navigation faster on large maps without replacing the existing middle-mouse pan workflow.
- Keep the minimap visually lightweight and readable.
- Preserve current map document persistence and domain semantics.
- Keep rendering and interaction logic testable through pure helpers where possible.

## Non-goals

- No zoom system in this iteration.
- No persisted minimap preferences in storage.
- No room labels inside the minimap.
- No changes to map schema, import/export, or storage format.
- No replacement of the existing header/title/grid toggle behavior.

## UX

### Placement and layout

- The minimap sits as an overlay card in the upper-right corner of the canvas.
- The existing map title and grid toggle remain in the upper-left.
- The minimap aligns to the same top inset rhythm as the header (`0.75rem` from the edges).
- Desktop target size is `180px x 140px`.
- On smaller screens, the minimap shrinks to roughly `144px x 112px`.

### Visual design

- The minimap renders inside a translucent card.
- It adapts to the current light/dark theme.
- It uses simplified room silhouettes and connection lines.
- It omits room labels to preserve readability.
- It draws the current viewport as a high-contrast rectangle.
- It highlights selected rooms and selected connections.
- When a room or connection editor overlay is open, the minimap remains visible but is visually deemphasized and non-interactive.

### Interaction

- Clicking the minimap recenters the main canvas on the clicked world position.
- Dragging the viewport rectangle pans the main canvas continuously.
- Minimap interactions suppress background-canvas click, marquee, and room-creation side effects.
- The minimap is keyboard focusable.
- While focused:
  - Arrow keys pan the main canvas in fixed increments.
  - `Home` centers the viewport on the graph midpoint.
- The minimap is hidden when the map contains no rooms.

## Significant Code Changes

1. Added a viewport hook at `frontend/src/components/use-map-viewport.ts` to centralize `panOffset`, canvas bounds, and map/screen coordinate transforms.
2. Added `frontend/src/graph/minimap-geometry.ts` for pure world-bounds, minimap transform, room rect, connection point, and viewport-rect calculations.
3. Added `frontend/src/components/map-minimap.tsx` as the dedicated minimap overlay component.
4. Updated `frontend/src/components/map-canvas.tsx` to:
   - use the viewport hook
   - render the minimap as an overlay sibling to the transformed scene content
   - pass document, selection, theme, and viewport state into the minimap
5. Updated `frontend/src/styles.css` with minimap overlay, theme, focus, selection, and disabled-state styling.
6. Added tests for geometry, component behavior, and integrated canvas behavior.

## Files Added

- `frontend/src/components/use-map-viewport.ts`
- `frontend/src/components/map-minimap.tsx`
- `frontend/src/graph/minimap-geometry.ts`
- `frontend/__tests__/components/map-minimap.test.tsx`
- `frontend/__tests__/graph/minimap-geometry.test.ts`

## Files Changed

- `frontend/src/components/map-canvas.tsx`
- `frontend/src/styles.css`
- `frontend/__tests__/components/map-canvas.test.tsx`

## Testing

- Added unit tests for minimap geometry.
- Added component tests for minimap rendering and interaction.
- Extended `MapCanvas` tests to cover minimap visibility and viewport interaction.
- Verified with:
  - `npm test -- --runInBand minimap-geometry.test.ts map-minimap.test.tsx map-canvas.test.tsx`
  - `npm run build`
