# CLI Suggestions Refactor Plan

## Summary

Refactor the CLI suggestion engine from a large hand-written decision tree into a grammar-driven system that models the command language explicitly. The immediate goal is not to invent new CLI syntax. The goal is to make autocomplete easier to reason about, easier to extend, and less prone to regressions where one special case accidentally leaks into another.

This is still a good idea.

Why it is worth doing:
- The current implementation in `frontend/src/domain/cli-suggestions.ts` has grown into a large imperative branch tree.
- We now have an intended spec in `suggestions.md`, which gives us a stable target.
- Recent fixes have shown that the current structure makes it too easy for one grammar branch to fall through into another.
- A grammar-oriented design should make "only legal sentences, as much as possible" much easier to guarantee.

Why not do it as a big rewrite:
- The current engine is passing and user-visible.
- The current file contains lots of hard-won edge-case behavior.
- We should preserve behavior by migrating incrementally behind tests instead of replacing everything at once.

## Desired End State

The suggestion engine should:
- treat autocomplete as "what terminals or typed slots are legal next from this parse state?"
- separate fixed grammar words from dynamic slots such as `ROOM_REF`, `NEW_ROOM_NAME`, and later `ITEM_LIST`
- support multi-word room references and partial room references naturally
- allow placeholders like `<room>` and `<new room name>` to be first-class slot behaviors
- make it obvious why a given suggestion appears
- make it hard for pseudo-room grammar, room-lighting grammar, connection-annotation grammar, and connect/create grammar to leak into each other

The long-term shape should be:
- a small grammar representation
- a parser or parser-like state machine for partial input
- slot resolvers for dynamic entities
- a renderer-friendly suggestion result layer

## Non-Goals

- Do not rewrite the CLI command parser in the same pass unless we discover a very strong reason.
- Do not change persisted data or command execution behavior as part of this refactor.
- Do not attempt fuzzy matching yet.
- Do not try to solve item autocomplete in full in the same pass.
- Do not remove the current UI behaviors around `/`, placeholder suggestions, or disabled placeholder rows unless required by the grammar model.

## Current Problems To Solve

The present decision-tree approach makes these things harder than they should be:
- room slots are implemented by ad hoc token-index logic instead of explicit typed spans
- phrase suggestions like `is unknown` and `goes on forever` are mixed with single-token branches
- different grammars depend on fragile ordering of `if` blocks
- fallback behavior is encoded as branch order instead of explicit parse-state transitions
- replacement-range logic is coupled too closely to local branch behavior
- "current room reference still incomplete" vs "room reference complete, next grammar word legal" is handled repeatedly in slightly different ways

## Guiding Design

### 1. Separate grammar from dynamic resolution

The refactor should distinguish:
- fixed grammar terminals like `create`, `to`, `of`, `is`, `one-way`
- phrase terminals like `is unknown`, `goes on forever`, `locked door`
- typed slots like `ROOM_REF`, `NEW_ROOM_NAME`, `ITEM_LIST`

The grammar should decide what category comes next.
Slot resolvers should decide what concrete suggestions to show for that category.

### 2. Model partial input as parse progress

Autocomplete should not ask "which branch of the if/else tree did we happen to hit?"
It should ask:
- where are we in the grammar?
- what next symbols are legal?
- if the next symbol is a slot, what concrete suggestions match the current slot text?

### 3. Preserve parser-like ambiguity where intended

For room references especially:
- if the typed text can already resolve as a room reference, next grammar words may be shown
- if the typed text could also extend to a longer room name, longer room-name suggestions may also be shown
- both can appear when both are legal

This behavior is important and should be made explicit in the slot resolver API.

### 4. Keep phrase-level user experience where it helps

The internal grammar may use single-word steps.
The suggestion menu can still present phrase completions like:
- `is unknown`
- `goes on forever`
- `locked door`
- `, which is`

We do not have to expose the raw grammar shape directly if a phrase suggestion is clearer and still produces only legal continuations.

## Proposed Architecture

### Layer 1: Suggestion grammar spec

Add a new module, likely something like:
- `frontend/src/domain/cli-suggestion-grammar.ts`

This module should define:
- grammar symbols
- productions or state transitions
- named nonterminals / slot types
- a compact, readable representation of intended syntax

Suggested symbol categories:
- `keyword`
- `phrase`
- `slot`
- `end`

Suggested slot types for v1:
- `ROOM_REF`
- `NEW_ROOM_NAME`
- `HELP_TOPIC`
- `DIRECTION`
- `CONNECTED_ROOM_REF`
- `ITEM_LIST` placeholder-only at first

The grammar file should be declarative, not executable branch soup.

### Layer 2: Partial parse engine

Add a new module, likely:
- `frontend/src/domain/cli-suggestion-parser.ts`

Responsibilities:
- tokenize the current input for suggestion purposes
- track caret position and active fragment/span
- walk the suggestion grammar against the partial input
- return one or more viable parse states
- expose the legal next symbols from those parse states

Important behavior:
- support multi-word slot spans
- support ambiguous-but-legal states
- support phrase terminals
- know when a command is complete and no further suggestions are legal

This does not need to be a full general parser generator. A hand-built partial parser over a declarative grammar is fine.

### Layer 3: Slot resolvers

Add a new module, likely:
- `frontend/src/domain/cli-suggestion-slots.ts`

Responsibilities:
- turn `ROOM_REF` into `<room>` or matching room suggestions
- turn `CONNECTED_ROOM_REF` into only connected-room suggestions or a no-connections placeholder
- turn `NEW_ROOM_NAME` into `<new room name>`
- turn `HELP_TOPIC` into matching help topics
- turn `DIRECTION` into direction suggestions
- later, turn `ITEM_LIST` into `<item list>` or richer item completions

This is where multi-word room-span logic should live.

The resolver API should be able to answer:
- what text range should be replaced?
- what suggestions are available?
- is the slot text complete enough that the parse may also continue?
- does the slot have a placeholder-only state?

### Layer 4: Suggestion assembly

Refactor `frontend/src/domain/cli-suggestions.ts` into a thin orchestration layer that:
- gets the active fragment/span
- asks the parser for viable next symbols
- asks slot resolvers for concrete suggestions where needed
- merges and ranks the results
- returns the existing `CliSuggestionResult` shape so the UI does not have to change much

The current `CliSuggestion`, `CliSuggestionKind`, and `CliSuggestionResult` types can likely stay, or only need small additions.

## Recommended Refactor Phases

### Phase 0: Lock in the target behavior

Before structural changes:
- keep `suggestions.md` as the intended grammar spec
- keep improving the current engine only for obvious correctness bugs
- add focused domain tests for any intended rule that is still not captured

Deliverable:
- a test matrix that expresses intended next suggestions for key partial inputs

### Phase 1: Extract shared primitives without changing behavior

Refactor current code into smaller units first:
- extract active-fragment and tokenization utilities
- extract room-reference span handling
- extract connected-room resolution
- extract phrase suggestion creation
- extract fallback merge logic

Goal:
- reduce the size of `cli-suggestions.ts`
- make later replacement easier

This is a safe "prepare the ground" pass.

### Phase 2: Formalize the grammar in code

Introduce the declarative grammar module:
- express the intended rules from `suggestions.md`
- define slot types and phrase terminals
- do not wire it into the UI yet

At this stage, the grammar file is a spec artifact plus test target.

Deliverable:
- grammar-level tests that say, for a given parse state, which next symbols are legal

### Phase 3: Build the partial parse engine alongside the current engine

Implement the parser against the declarative grammar:
- parse partial input into one or more viable states
- surface next legal symbols
- write parser-only tests

Do not switch production suggestions to this engine yet.

Deliverable:
- parser snapshots / structured tests for representative commands

### Phase 4: Migrate slot types one by one

Wire new engine output into the production suggestion function gradually.

Suggested order:
1. `HELP_TOPIC`
2. `DIRECTION`
3. `ROOM_REF`
4. `CONNECTED_ROOM_REF`
5. `NEW_ROOM_NAME`
6. pseudo-room clauses
7. room-led `<room> is` / `<room> to`
8. item placeholder slots

Each migration step should:
- route one grammar family through the new engine
- keep legacy behavior elsewhere
- preserve the existing public result shape

### Phase 5: Remove legacy decision-tree branches

Once coverage is good and behavior matches:
- delete old branch families from `cli-suggestions.ts`
- keep only the orchestration layer

### Phase 6: Optional parser alignment work

After autocomplete is stable, consider whether the main CLI parser should share definitions with the suggestion grammar.

Possible outcomes:
- shared direction/help/keyword registries only
- shared named productions
- or no further unification if the risk outweighs the value

This phase is optional and should not block the refactor.

## Suggested Grammar Shape

This is not final syntax, but a likely useful internal structure:

```text
COMMAND
  -> HELP_COMMAND
  | GO_COMMAND
  | SHOW_COMMAND
  | EDIT_COMMAND
  | DELETE_COMMAND
  | NOTATE_COMMAND
  | PUT_COMMAND
  | TAKE_COMMAND
  | CONNECT_COMMAND
  | CREATE_COMMAND
  | ROOM_LED_COMMAND
  | PSEUDO_ROOM_COMMAND

CONNECT_COMMAND
  -> "connect" ROOM_REF DIRECTION CONNECT_TAIL
  | "con" ROOM_REF DIRECTION CONNECT_TAIL

CONNECT_TAIL
  -> "to" ROOM_REF
  | "one-way" "to" ROOM_REF

ROOM_LED_COMMAND
  -> ROOM_REF "is" ROOM_LIGHTING
  | ROOM_REF "to" CONNECTED_ROOM_REF "is" CONNECTION_ANNOTATION

CREATE_COMMAND
  -> "create" NEW_ROOM_NAME CREATE_TAIL
  | "create" "and" "connect" NEW_ROOM_NAME CREATE_CONNECT_TAIL

CREATE_TAIL
  -> END
  | ", which is" ROOM_LIGHTING CREATE_MODIFIER_TAIL
  | DIRECTION "of" ROOM_REF
  | "above" ROOM_REF
  | "below" ROOM_REF

PSEUDO_ROOM_COMMAND
  -> DIRECTION "of" ROOM_REF PSEUDO_TAIL
  | "above" ROOM_REF PSEUDO_TAIL
  | "below" ROOM_REF PSEUDO_TAIL
  | "the room" DIRECTION "of" ROOM_REF "is unknown"
  | "the room" "above" ROOM_REF "is unknown"
  | "the room" "below" ROOM_REF "is unknown"
  | "the way" DIRECTION "of" ROOM_REF WAY_TAIL
  | "the way" "above" ROOM_REF WAY_TAIL
  | "the way" "below" ROOM_REF WAY_TAIL
```

The key point is not the exact notation. The key point is that slot types and grammar branches are explicit and named.

## Test Strategy

### 1. Keep existing UI integration tests

Retain the current tests in:
- `frontend/__tests__/components/app-routing.test.tsx`

These prove the feature still works end to end.

### 2. Expand domain behavior tests

Keep and expand:
- `frontend/__tests__/domain/cli-suggestions.test.ts`

This file should remain the primary behavior-level safety net.

### 3. Add grammar-level tests

Add a new test file such as:
- `frontend/__tests__/domain/cli-suggestion-grammar.test.ts`

Test things like:
- first-token legal categories
- `create <new room name>` next symbols
- `connect ROOM_REF DIRECTION` next symbols
- pseudo-room phrase next symbols
- when the grammar is complete and no suggestions are legal

These tests should not depend on actual room names.

### 4. Add slot-resolution tests

Add a new test file such as:
- `frontend/__tests__/domain/cli-suggestion-slots.test.ts`

Test:
- `<room>` placeholder behavior
- multi-word room continuation
- ambiguous complete-plus-longer room behavior
- connected-room filtering
- no-connected-room placeholder
- replacement span correctness

### 5. Add parser-state tests

Add a new test file such as:
- `frontend/__tests__/domain/cli-suggestion-parser.test.ts`

Test:
- partial parse states
- phrase terminal handling
- command completion detection
- ambiguous parse states

## Ranking and Rendering Policy

The refactor should preserve a clear ranking policy.

Suggested order:
1. placeholder-only slot row when no concrete entity should be shown yet
2. phrase completions that are the only legal next choice
3. exact or high-confidence slot matches
4. longer room-name continuations
5. legal next grammar words when the current slot may already be complete

Important:
- ranking should be explicit, not branch-order accidental
- the parser should say what is legal
- a separate ranking layer should say what is most helpful to show first

## Risks

### Risk: behavior drift during migration

Mitigation:
- migrate one grammar family at a time
- preserve current UI tests
- keep old engine in place until new path is proven

### Risk: overengineering the parser

Mitigation:
- do not build a generalized parser framework
- use a compact domain-specific partial parser
- stop once the grammar and slots are explicit enough

### Risk: phrase suggestions do not map cleanly to grammar steps

Mitigation:
- treat phrase suggestions as render-layer groupings over one or more grammar terminals
- do not force UI wording to mirror raw productions exactly

### Risk: divergence from the real command parser

Mitigation:
- treat `suggestions.md` as the intended spec during this refactor
- keep a short list of known parser vs suggestion mismatches if any remain
- only attempt full unification later if it is clearly worth it

## Recommended First PR

The safest first PR for the next thread would be:

1. extract the room-slot logic from `cli-suggestions.ts` into a dedicated helper module
2. add a grammar test file that encodes a small subset of intended rules
3. introduce a declarative representation for just one narrow family, probably:
   - room-led grammar
   - or pseudo-room grammar

Why this first:
- it gives immediate structure
- it does not require a full parser on day one
- it starts proving the new shape without destabilizing the whole feature

## Suggested Work Breakdown For The Next Thread

1. Review `suggestions.md` and decide the first grammar family to migrate.
2. Extract slot-resolution helpers into their own module.
3. Create `cli-suggestion-grammar.ts` with a minimal initial grammar subset.
4. Add grammar tests for that subset.
5. Add parser scaffolding that can expose next legal symbols for the subset.
6. Route one subset of production suggestions through the new path.
7. Run the full frontend suite after each slice.

## Definition Of Done

This refactor is done when:
- `cli-suggestions.ts` is a small orchestration layer, not a giant branch tree
- the intended grammar is represented explicitly in code
- room and connected-room slot behavior is encapsulated in slot resolvers
- grammar-level tests and slot-level tests exist alongside the current behavior tests
- recent bug classes are naturally prevented by structure rather than by branch ordering
- the full frontend test suite still passes
