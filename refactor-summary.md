# Refactor Summary

## Completed

### PR1: Centralize defaults
- Added [frontend/src/domain/map-defaults.ts](/Users/rileypb/dev/Inform/fweep/frontend/src/domain/map-defaults.ts) as the shared source of truth for default map view and room shape.
- Updated [frontend/src/domain/map-types.ts](/Users/rileypb/dev/Inform/fweep/frontend/src/domain/map-types.ts) to build new maps and rooms from those defaults.
- Updated [frontend/src/state/editor-store.ts](/Users/rileypb/dev/Inform/fweep/frontend/src/state/editor-store.ts) to derive initial and reset view state from the same defaults.

### PR2: MapCanvas test harness
- Added `loadDocumentAct`, `renderMapCanvas`, and `renderLoadedMap` helpers to [frontend/__tests__/components/map-canvas.test.tsx](/Users/rileypb/dev/Inform/fweep/frontend/__tests__/components/map-canvas.test.tsx).
- Removed direct non-`act` document loads from that suite.
- Eliminated the persistent React `act(...)` warnings from the `MapCanvas` tests.

### PR3: MapCanvas controller extraction
- Extracted window shortcut handling into [frontend/src/components/use-map-canvas-window-controls.ts](/Users/rileypb/dev/Inform/fweep/frontend/src/components/use-map-canvas-window-controls.ts).
- Extracted room-editor focus and viewport request handling into [frontend/src/components/use-map-canvas-room-focus.ts](/Users/rileypb/dev/Inform/fweep/frontend/src/components/use-map-canvas-room-focus.ts).
- Extracted debounced pan/zoom persistence into [frontend/src/components/use-map-canvas-viewport-persistence.ts](/Users/rileypb/dev/Inform/fweep/frontend/src/components/use-map-canvas-viewport-persistence.ts).
- Moved shortcut helpers into [frontend/src/components/map-canvas-shortcuts.ts](/Users/rileypb/dev/Inform/fweep/frontend/src/components/map-canvas-shortcuts.ts).

### PR4: Editor store infrastructure split
- Extracted history bookkeeping into [frontend/src/state/editor-store-history.ts](/Users/rileypb/dev/Inform/fweep/frontend/src/state/editor-store-history.ts).
- Extracted selection filtering into [frontend/src/state/editor-store-selection.ts](/Users/rileypb/dev/Inform/fweep/frontend/src/state/editor-store-selection.ts).
- Extracted view/bootstrap/reset helpers into [frontend/src/state/editor-store-view.ts](/Users/rileypb/dev/Inform/fweep/frontend/src/state/editor-store-view.ts).
- Simplified `loadDocument` and `unloadDocument` in [frontend/src/state/editor-store.ts](/Users/rileypb/dev/Inform/fweep/frontend/src/state/editor-store.ts).

### PR5: Connection annotation semantics
- Moved directional annotation intent computation into [frontend/src/graph/connection-decoration-geometry.ts](/Users/rileypb/dev/Inform/fweep/frontend/src/graph/connection-decoration-geometry.ts).
- Simplified [frontend/src/components/map-canvas-connections.tsx](/Users/rileypb/dev/Inform/fweep/frontend/src/components/map-canvas-connections.tsx) so it consumes geometry-layer semantic decisions instead of recomputing them.
- Added focused coverage in [frontend/__tests__/graph/connection-decoration-geometry.test.ts](/Users/rileypb/dev/Inform/fweep/frontend/__tests__/graph/connection-decoration-geometry.test.ts).

### PR6: App routing test harness
- Added `renderApp`, `openSavedMap`, and `renderAppWithSavedMap` helpers to [frontend/__tests__/components/app-routing.test.tsx](/Users/rileypb/dev/Inform/fweep/frontend/__tests__/components/app-routing.test.tsx).
- Replaced repeated route-open bootstrap code with those helpers across much of the routing suite.

## Verification
- Full frontend suite passes after each phase.
- Current result: `42/42` suites passed, `1011/1011` tests passed.

## Highest ROI Next

### 1. Split `MapCanvasConnections`
- File: [frontend/src/components/map-canvas-connections.tsx](/Users/rileypb/dev/Inform/fweep/frontend/src/components/map-canvas-connections.tsx)
- Why: it still owns connection lines, annotations, sticky-note links, reroute handles, previews, and endpoint labels in one component.
- Best split: extract a pure annotation renderer and a reroute/preview controller first.

### 2. Continue slicing `editor-store` actions
- File: [frontend/src/state/editor-store.ts](/Users/rileypb/dev/Inform/fweep/frontend/src/state/editor-store.ts)
- Why: the infrastructure is cleaner now, but the action surface is still very large.
- Best split: isolate document mutation actions, drag actions, and drawing/background actions into separate modules while keeping the public store API stable.

### 3. Add shared test builders for map fixtures
- Files: [frontend/__tests__/components/app-routing.test.tsx](/Users/rileypb/dev/Inform/fweep/frontend/__tests__/components/app-routing.test.tsx), [frontend/__tests__/components/map-canvas.test.tsx](/Users/rileypb/dev/Inform/fweep/frontend/__tests__/components/map-canvas.test.tsx)
- Why: both suites still build rooms, connections, and maps inline a lot.
- Best next step: a small `make-test-map` helper for common room/connection fixture patterns.

### 4. Consider a dedicated CLI integration test helper
- File: [frontend/__tests__/components/app-routing.test.tsx](/Users/rileypb/dev/Inform/fweep/frontend/__tests__/components/app-routing.test.tsx)
- Why: many tests still repeat command submission and document assertions.
- Best next step: helpers like `openMapAndSubmit`, `expectRoomNames`, `expectConnectionCount`, and `expectSelectedRoom`.
