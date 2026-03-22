# Design for IFDB integration

## Overview

The Interactive Fiction Database (IFDB) is a comprehensive database of interactive fiction games, including metadata such as titles, authors, release dates, genres, user ratings, and download/play links. Integrating IFDB data into fweep will allow users to search for games and play them directly in the Parchment panel while mapping their progress.

This document describes the intended user experience and the technical approach for integrating IFDB search with the existing local Parchment panel.

## Primary user experience

1. User creates a new map in fweep.
2. User opens the IFDB/Parchment panel, which displays:
   - a search bar labeled `Search IFDB for a game`
   - a `Search` button
   - a link that says `Or, click here to play a story file from your device`
3. User types a game title into the search bar and clicks `Search`.
4. The panel displays a list of matching games from IFDB, showing:
   - title
   - author
   - publication year or date when available
   - user rating when available
5. User clicks a game from the search results.
6. fweep looks up the full IFDB game record, chooses an appropriate downloadable story file, and loads it in the local Parchment panel.

## Technical details of primary user experience

- Use the IFDB `search` API endpoint to fetch matches for the user's query.
- Search is manual-submit only. Do not search on every keystroke.
- Use the IFDB `viewgame` endpoint after selection to fetch detailed metadata and download/play information for the chosen game.
- Prefer downloadable story files over IFDB `playOnlineUrl` links when deciding what to load into local Parchment.
- If a game has multiple downloadable story files, choose according to the following policy:
  - prefer `glulx` when available
  - otherwise choose another Parchment-supported format
  - among candidates of the same preferred class, choose the newest one
- Once a story file URL is selected, load it into local Parchment using the local page and the `story` query parameter.
- Do not hardcode a localhost URL. Construct the Parchment URL relative to the current app origin/path.

## Secondary user experience

1. User creates a new map in fweep.
2. User opens the IFDB/Parchment panel.
3. User clicks the link to play a story file from their device.
4. A file picker opens.
5. User selects a story file from their device.
6. The selected story is loaded into the local Parchment panel.

## Technical details of secondary user experience

- Reuse Parchment's existing local-file support rather than inventing a custom fweep-only loading protocol.
- Do not add a custom `?file=` URL parameter to Parchment for this feature.
- Prefer to trigger or reuse the existing file-upload behavior already present in the local Parchment page.
- If direct reuse of the existing control is awkward from the parent page, expose a minimal wrapper in fweep that still hands the selected file off through Parchment's existing mechanisms rather than redesigning story loading.

## Persistence

- Store the currently associated game in the fweep map's metadata so the game is restored when the map is reopened.
- Do not store only the current story URL.
- Persist structured game identity metadata, including:
  - IFDB TUID when available
  - IFID when available
  - title
  - author
  - selected story file URL
  - selected format
  - source type such as `ifdb` or `local-file`
- Persist IFDB identity even if the selected story URL later changes.

## Search and result handling

- Search should tolerate partial title input and ambiguous matches.
- If IFDB returns multiple plausible matches, show them to the user rather than guessing silently.
- Result rows should make it easy to distinguish similar games with the same or similar titles.
- If rating, publication date, or author is missing, render the result gracefully rather than treating it as an error.
- Show clear user-facing errors for:
  - IFDB lookup failure
  - no matches found
  - selected game has no usable downloadable story file
  - story file could not be loaded into Parchment

## Parchment integration details

- The Parchment panel remains local and same-origin with fweep.
- fweep is responsible for selecting a story file URL or local file and then loading Parchment appropriately.
- Avoid modifying Parchment unless necessary.
- Prefer driving the current Parchment page through its existing query-string and file-loading behaviors.

## Implementation concerns and constraints

- The IFDB API is the intended source for search and game metadata.
- The design assumes the IFDB API can be queried from the browser by fweep. This must be verified in practice, since browser access may be constrained independently of the API contract.
- If browser-side IFDB access proves unreliable, add a thin proxy layer rather than redesigning the user experience.
- Be conservative about request volume. Even with manual-submit search, avoid unnecessary repeated lookups for the same selected game.

## Implementation outline

1. Define the first small behavior and its types.
   - Start with the smallest pure behavior needed, not the whole feature at once.
   - Add only the types needed for that behavior, such as IFDB search results, IFDB game details, downloadable story links, or persisted game metadata.

2. Verify IFDB browser access before building on it.
   - Make a minimal browser-side request to the IFDB `search` endpoint from the app.
   - If this fails due to browser access restrictions, stop and add a thin proxy plan before continuing.

3. For each pure behavior, follow a strict TDD loop.
   - Write the next most useful test before writing the functionality.
   - If the new test already passes, write another test until one fails for the missing behavior.
   - Implement only enough code to make that failing test pass.
   - Refactor while keeping the tests green.

4. Start with IFDB response normalization.
   - Write a failing test for transforming IFDB `search` or `viewgame` data into a fweep-friendly shape.
   - Implement the minimal normalization code to pass it.
   - Add the next failing test for another important case, such as missing author, missing rating, or missing publication date.
   - Continue incrementally until the normalization behavior is covered well enough for the next layer.

5. Build story-file selection the same way.
   - Write a failing test for choosing the best download from IFDB `viewgame` data.
   - First prove that `glulx` is preferred when available.
   - Then add a failing test for fallback to another Parchment-supported format.
   - Then add a failing test for choosing the newest candidate among equally preferred formats.
   - Add a failing test for the unsupported-download case and implement a structured error.

6. Add persistence behavior incrementally.
   - Write a failing test for storing structured game metadata in the map document.
   - Include TUID, IFID, title, author, selected story URL, selected format, and source type.
   - Add a failing test for restoration behavior when reopening a map.
   - Add a failing test that proves IFDB identity is preserved even if the selected story URL changes later.

7. Add a small IFDB client layer after its pure behavior is test-driven.
   - Create a focused module for calling IFDB `search` and `viewgame`.
   - Keep the transformation logic pure and separate from React components.
   - Cover request-building and response-handling behavior with tests before adding new branches or error cases.

8. Move to the panel UI with the same TDD loop.
   - Write the first failing component test for rendering the search input and `Search` button.
   - Implement only enough UI to pass it.
   - Then write the next failing test for manual-submit behavior.
   - Continue one behavior at a time rather than writing all UI tests up front.

9. Add search results incrementally.
   - Write a failing test for showing loading state.
   - Implement the smallest code to pass it.
   - Then write a failing test for rendering successful results with title, author, publication date or year, and rating when available.
   - Then add failure and empty-state tests as needed.

10. Add selection and Parchment loading incrementally.
   - Write a failing test for selecting a search result and requesting `viewgame`.
   - Implement only enough code to pass it.
   - Then write a failing test proving the chosen downloadable story file is loaded into local Parchment via the `story` URL.
   - Add failing tests for unsupported or missing downloadable files before implementing those error paths.

11. Reuse local-file loading with tests first.
   - Write a failing test for exposing the `play a story file from your device` entry point in the fweep panel.
   - Then write a failing test for handing off to Parchment’s existing local-file flow.
   - Implement the smallest integration necessary without inventing a new protocol.

12. Keep panel state and layout changes incremental.
   - Introduce panel state for search query, request status, search results, selected game, and current story source only as tests require it.
   - Keep the existing iframe panel and resize behavior intact while adding IFDB controls above it.

13. Add validation and user-facing errors through failing tests.
   - Add tests for IFDB lookup failure, no matches found, unsupported formats, and story-load failure only when each behavior becomes relevant.
   - Implement each error path just deeply enough to satisfy the failing test.

14. Finish with polish tests and refinements.
   - Add tests for restored associated-game behavior when reopening a map.
   - Add tests for keyboard navigation and focus flow between fweep controls and Parchment if needed.
   - Confirm the results list and iframe coexist cleanly at different panel widths.

## Out of scope for the first pass

- Live search while typing
- Deep synchronization between map state and in-game state
- Custom Parchment protocol extensions such as `?file=...`
- Replacing Parchment with another interpreter
