# CLI Suggestions Manual Test Checklist

This document is a human-run test plan for the CLI suggestions UI.

It is meant to exercise suggestion behavior thoroughly, including:
- first-token suggestions
- aliases and ambiguities
- room-reference slots
- quoted names
- create/connect flows
- pseudo-room phrases
- item-related suggestions
- caret replacement behavior
- suggestion-closing behavior after complete phrases

## Test Setup

Create or load a map with at least these rooms:
- `Cellar`
- `Control Room`
- `Hallway`
- `Storage Room`
- `Store Room`
- `Kitchen`
- `Kitchen Annex`
- `Bedroom`
- `Bathroom`
- `Library`
- `Attic`
- `Living Room`
- `Hall of Mirrors`
- `Ice Cream Stand`
- `Pool`
- `Key West`
- `north`

Add these connections:
- `Kitchen` east to `Bedroom` west
- `Bedroom` east to `Bathroom` west
- `Kitchen` north to `Hallway` south
- `Living Room` east to `Library` west
- `Store Room` down to `Ice Cream Stand` up

Add these items:
- `Lantern` in `Cellar`
- `Lamp` in `Living Room`
- `Brass` in `Cellar`
- `Brass Key` in `Cellar`
- `Brass Lantern` in `Cellar`
- `Foobar` in `Cellar`

For each step below:
- Put the caret at the end of the text unless the step says otherwise.
- Confirm both the visible suggestion labels and that selecting a suggestion replaces only the intended text.
- Confirm the menu closes when the checklist says there should be no suggestions.

## Root And First Token

1. With an empty CLI input, confirm the menu includes:
   `create`, `connect`, `disconnect`, `describe`, `go`, `show`, `edit`, `delete`, `annotate`, `arrange`, `help`, `put`, `take`, `zoom`, `undo`, `redo`, `above`, `below`, `the`, `<direction>`, `<room>`.
   result: "zoom" is moved to after "the", "create and connect" is added before `<direction>`
2. Type `c` and confirm command suggestions include `create` and `connect`.
3. Type `dr` and confirm `drop` is suggested.
4. Type `t` and confirm `the` is suggested.
5. Type `n` and confirm `north` is suggested.
6. Type `a` and confirm `above` is suggested.
7. Type `b` and confirm `below` is suggested.
8. Type `e` and confirm both `east` and `edit` are suggested.
9. Type `s` and confirm both `south` and `show` are suggested.
10. Type `g` and confirm `get` is suggested but `take` is not.
11. Type `go` and confirm `go` is suggested but `show` is not.
12. Type `nw`, `ne`, `sw`, and `se` and confirm diagonal direction abbreviations stay available before a space.
13. Type a room-name prefix like `c` and confirm saved rooms such as `Cellar` and `Control Room` are suggested from the first token.

## `the ...` Lead-In

1. Type `the ` and confirm suggestions are exactly `room` and `way`.

## Help, Terminal Commands, And Zoom

1. Type `help r` and confirm `rooms` is suggested.
2. Type `help rooms ` and confirm the menu closes.
3. Type `h rooms ` and confirm the menu closes.
4. Type `arrange `, `arr `, `prettify `, `undo `, and `redo ` and confirm the menu closes.
5. Type `arrange x`, `arr x`, `prettify x`, `undo x`, and `redo x` and confirm the menu stays closed.
6. Type `zoom ` and confirm suggestions are exactly `<number>`, `in`, `out`, `reset`.
7. Type `zoom i` and confirm only `in` is suggested.
8. Type `zoom r` and confirm only `reset` is suggested.
9. Type `zoom 2` and confirm only `<number>` is suggested.
10. Type `zoom in `, `zoom out `, and `zoom reset ` and confirm the menu closes.

## Show, Select, Edit, Delete, Describe, And Go-To

1. Type `show ` and confirm the suggestion is `<room>`.
2. Type `show c` and confirm `Cellar` and `Control Room` are suggested.
3. Type `select ` and confirm the suggestion is `<room>`.
4. Type `select c` and confirm `Cellar` and `Control Room` are suggested.
5. Type `s c` and confirm `Cellar` is suggested.
6. Type `edit c`, `ed c`, `delete c`, and `del c` and confirm `Cellar` is suggested.
7. Type `describe ` and confirm the suggestion is `<room>`.
8. Type `describe c` and confirm `Cellar` and `Control Room` are suggested.
9. Type `go ` and confirm directions plus `to` are suggested.
10. Type `go to ` and confirm the suggestion is `<room>`.
11. Type `go to c` and confirm `Cellar` is suggested.
12. Type `show cellar `, `go to cellar `, `edit cellar `, `delete cellar `, and `describe cellar ` and confirm the menu closes.
13. Type `show control r` and confirm:
    the suggestion is `Control Room`
    choosing it replaces only `control r`, not the whole command

## Room-Led Grammar

1. Type `Kitchen ` and confirm `is` and `to` are suggested.
2. Type `Kitchen is ` and confirm suggestions are exactly `dark` and `lit`.
3. Type `Kitchen is dark ` and `Kitchen is lit ` and confirm the menu closes.
4. Type `store ` and confirm `Store Room` plus the grammar continuations `is` and `to` are suggested.
5. Type `bedroom to ` and confirm only rooms connected to `Bedroom` are suggested.
6. Type `kitchen to ` and confirm only rooms connected to `Kitchen` are suggested.
7. In a room with no connections, type `<that room> to ` and confirm the placeholder `<no rooms connected to <room>>` is shown.
8. Type `bedroom to bathroom ` and confirm `is` is suggested.
9. Choose `is` after `bedroom to bathroom ` and confirm it is inserted at the caret, not by replacing `bathroom`.
10. Type `bedroom to bathroom is ` and confirm suggestions are exactly `door`, `locked door`, `clear`.

## Connect

1. Type `connect ` and confirm the suggestion is `<room>`.
2. Type `connect living ` and confirm both `Living Room` and directions such as `north` are suggested.
3. Type `connect kitchen n` and confirm `north` is suggested.
4. Type `connect ice cream stand t` and confirm there are no suggestions yet.
5. Type `connect Kitchen north ` and confirm `one-way` and `to` are suggested.
6. Type `connect Kitchen north one-way ` and confirm only `to` is suggested.
7. Type `connect kitchen north to ` and confirm the suggestion is `<room>`.
8. Type `connect kitchen n to h` and confirm `Hallway` and `Hall of Mirrors` are suggested.
9. Type `connect Store Room down to c` and confirm `Ice Cream Stand` is suggested.
10. Type `connect Kitchen north to Bedroom ` and confirm the reverse direction, such as `south`, is suggested.
11. Type `connect Kitchen north one-way to Bedroom ` and confirm the menu closes.

## Disconnect

1. Type `dis` and confirm `disconnect` is suggested.
2. Type `disconnect ` and confirm the suggestion is `<room>`.
3. Type `disconnect hallway ` and confirm `from` and directions such as `north` and `south` are suggested.
4. Type `disconnect storag ` and confirm `Storage Room` is suggested.
5. Type `disconnect Store Room ` and confirm `from` and directions are suggested.
6. Type `disconnect bedroom south f` and confirm only `from` is suggested.
7. Type `disconnect Store Room from ` and confirm the suggestion is `<room>`.

## Create

1. Type `create ` and confirm suggestions are exactly `<new room name>` and `and`.
2. Type `create Kitchen ` and confirm suggestions include `<new room name>`, `, which is`, `above`, `below`, and directions such as `north`.
3. Type `create city park ` and confirm the same continuation suggestions appear.
4. Type `create city ` and confirm the same continuation suggestions appear while the room name could still continue.
5. Type `create city p` and confirm only `<new room name>` remains.
6. Type `create den, which ` and confirm only `is` is suggested.
7. Type `create foobar, which is ` and confirm only `dark` and `lit` are suggested.
8. Type `create foobar, which is lit ` and confirm only `,` is suggested.
9. Type `create foobar, which is lit, ` and confirm directions are suggested.
10. Type `create foobar north ` and confirm only `of` is suggested.
11. Repeat with multi-word names like `create foo bar north ` and confirm only `of` is suggested.
12. Type `create foobar above ` and `create foobar below ` and confirm the suggestion is `<room>`.
13. Type `create foobar above hallway ` and `create foobar below hallway ` and confirm the menu closes.
14. Type `create foobar north of pool ` and confirm the menu closes.
15. Type `create monkey, which is dark , west ` and confirm only `of` is suggested.
16. Type `create monkey, which is dark , west, ` and confirm the menu closes.
17. Type `create ice cream stand, which is dark , which is ` and confirm the menu closes.
18. Type `create monkey, which is dark , north, which is ` and confirm the menu closes.

## Create And Connect

1. Type `create and ` and confirm only `connect` is suggested.
2. Type `create and connect ` and confirm the suggestion is `<new room name>`.
3. Type `create and connect city ` and confirm suggestions include `<new room name>`, `, which is`, and directions such as `north`.
4. Type `create and connect city p` and confirm only `<new room name>` remains.
5. Type `create and connect city park ` and confirm the same continuation suggestions appear.
6. Type `create and connect foobar, which ` and confirm only `is` is suggested.
7. Type `create and connect foobar, which is ` and confirm only `dark` and `lit` are suggested.
8. Type `create and connect foobar, which is lit ` and confirm only `,` is suggested.
9. Type `create and connect foobar, which is lit, ` and confirm directions are suggested.
10. Type `create and connect Pantry north ` and confirm `one-way` and `to` are suggested.
11. Type `create and connect Pantry north one-way ` and confirm only `to` is suggested.
12. Type `create and connect Kitchen north to Bedroom ` and confirm the reverse direction is suggested.
13. Type `create and connect Kitchen north one-way to Bedroom ` and confirm the menu closes.
14. Type `create and connect "blah", which is dark, south to Store Room west ` and confirm the menu closes.
15. Type `create and connect "blah", which is dark, south to Store Room west e` and confirm the menu stays closed.

## Notate And Annotate

1. Type `notate `, `annotate `, and `ann ` and confirm suggestions are `<room>` and `with`.
2. Type `notate c`, `annotate c`, and `ann c` and confirm `Cellar` is suggested.
3. Type `notate cellar `, `annotate cellar `, and `ann cellar ` and confirm only `with` is suggested.
4. Type `notate living room ` and confirm only `with` is suggested.
5. Type `notate foo ` and `notate foo foobar ` and confirm only `with` is suggested when those rooms exist.
6. Type `notate cellar with `, `annotate cellar with `, and `ann cellar with ` and confirm the menu closes.
7. Type `annotate with ` and confirm the menu closes.

## Put / Drop

1. Type `put ` and confirm the suggestion is `<item name>`.
2. Type `put brass` and confirm the suggestion remains `<item name>`.
3. Type `put brass ` and confirm suggestions are `<item name>` and `in`.
4. Type `put brass i` and confirm suggestions are `<item name>` and `in`.
5. Type `drop brass lantern ` and confirm suggestions are `<item name>` and `in`.
6. Choose `in` after `put foobar ` and confirm it inserts at the caret without replacing `foobar`.
7. Type `put lantern in c` and confirm `Cellar` is suggested.
8. Type `drop lantern in c` and confirm `Cellar` is suggested.
9. Type `put lantern in cellar ` and `drop lantern in cellar ` and confirm the menu closes.

## Take / Get

1. Type `take ` and confirm item suggestions appear along with `all`.
2. Type `take b` and confirm `Brass`, `Brass Key`, and `Brass Lantern` are suggested.
3. Type `get a` and confirm only `all` is suggested.
4. Type `take brass ` and confirm item continuations plus `from` are suggested together.
5. Type `get brass f` and confirm only `from` is suggested.
6. Type `take z` and confirm there are no suggestions.
7. Choose `from` after `take foobar ` and confirm it inserts at the caret without replacing `foobar`.
8. Type `take lantern from ` and confirm only `Cellar` is suggested.
9. Type `get lamp from ` and confirm only `Living Room` is suggested.
10. Type `take l from ` and confirm both `Cellar` and `Living Room` are suggested.
11. Type `take lantern from c` and confirm `Cellar` is suggested.
12. Type `take lantern from l` and confirm there are no suggestions.
13. Type `take all from l` and `get all from l` and confirm `Living Room` is suggested.
14. Type `take lantern from cellar ` and `get all from cellar ` and confirm the menu closes.

## Quoted Room Names And Open Quotes

1. Type `connect "Key West ` and confirm suggestions stay inside the quoted slot and show `Key West`.
2. Type `connect "Key West" ` and confirm directions are suggested, and `to` is not suggested yet.
3. Type `connect Kitchen north to "Bed ` and confirm `Bedroom` is suggested.
4. Type `create "Key West ` and confirm `<new room name>` remains visible, but `, which is` and directions are not shown yet.
5. Type `create "Key West" ` and confirm `<new room name>`, `, which is`, and directions are suggested.
6. Type `the way east of "Living ` and confirm `Living Room` is suggested.
7. Create a room literally named `north`, then type `connect "north" ` and confirm it is treated as a room name, not as grammar.

## Pseudo-Room Shorthand

1. Type `north ` and confirm suggestions are exactly `is`, `of`, `goes`, `leads`, `lies`.
2. Type `north o` and confirm only `of` is suggested.
3. Type `north l` and confirm `leads` and `lies` are suggested.
4. Type `above ` and confirm `is`, `<room>`, `goes`, `leads`, `lies` are suggested.
5. Type `above g` and confirm only `goes` is suggested.
6. Type `n of l` and confirm `Library` is suggested.
7. Type `north is ` and confirm `<room>` and `unknown` are suggested together.
8. Type `north is Ki` and confirm matching rooms are suggested while staying in that slot.
9. Type `north of bedroom ` and confirm `is unknown`, `goes on forever`, `leads nowhere`, `leads to somewhere else`, and `lies death` are suggested.
10. Type `north of bedroom is ` and confirm only `unknown` is suggested.
11. Type `west of bedroom leads ` and confirm `nowhere` and `to somewhere else` are suggested.
12. Type `west of bedroom leads to ` and confirm only `somewhere else` is suggested.
13. Type `west of bedroom lies ` and confirm `death` is suggested.
14. Type each completed terminal phrase below and confirm the menu closes:
    `north of bedroom is unknown `
    `west of bedroom goes on forever `
    `west of bedroom leads nowhere `
    `west of bedroom leads to somewhere else `
    `west of bedroom lies death `

## `the room ...` And `the way ...`

1. Type `the room north of bedroom ` and confirm only `is unknown` is suggested.
2. Type `the way north of bedroom ` and confirm `goes on forever`, `leads nowhere`, `leads to somewhere else`, and `lies death` are suggested.
3. Type `the way east of living room g` and confirm `goes on forever` is suggested.
4. Type `the way east of living room l` and confirm `leads nowhere`, `leads to somewhere else`, and `lies death` are suggested.
5. Type `the way east of living room goes on forever` with the caret at the end and confirm the only suggestion is `forever`, not `of`.

## Replacement-Range Checks

1. Confirm choosing `Control Room` in `show control r` replaces only `control r`.
2. Confirm choosing `is` in `bedroom to bathroom ` inserts at the caret after the room name.
3. Confirm choosing `in` in `put foobar ` inserts at the caret after the item text.
4. Confirm choosing `from` in `take foobar ` inserts at the caret after the item text.
5. Confirm choosing a multi-word room completion after partial text like `connect kitchen n to h` replaces only the active target-room fragment.

## General Sanity Checks

1. For every command family above, confirm the popover updates immediately as each character is typed and removed.
2. Confirm pressing space can either:
   keep the slot open for a longer multi-word completion
   or advance to the next grammar step when the reference is complete
3. Confirm there are no duplicate suggestion rows in mixed cases where a room continuation and a grammar continuation are both valid.
4. Confirm aliases behave like their canonical commands:
   `s` with `show`
   `select` with room selection
   `ed` with `edit`
   `del` with `delete`
   `ann` with `annotate`
   `drop` with `put`
   `arr` and `prettify` with `arrange`
5. Confirm the menu reliably closes after a complete phrase when no further grammar continuation is legal.
