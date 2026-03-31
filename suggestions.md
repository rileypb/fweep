# CLI Suggestion Rules

This file describes the intended suggestion-menu behavior for the CLI.

It is not a literal dump of the current implementation. It is a menu-oriented grammar spec: it lists what the suggestion popover should offer after the text entered so far, using a few shorthand placeholders where that is clearer than enumerating every concrete value.

## Conventions

- `<room>` means the placeholder row shown at the start of a room-reference slot.
- `<new room name>` means the placeholder row shown at the start of a new-room-name slot.
- `<direction>` means any standard direction suggestion: `north`, `south`, `east`, `west`, `northeast`, `northwest`, `southeast`, `southwest`, `up`, `down`, `in`, `out`.
- `<adjective>` means `dark` | `lit`.
- `<item>` means the placeholder row shown at the start of a single-item slot.
- `<item list>` means the placeholder row shown at the start of an item-list slot.
- `matching room names` means saved room names whose normalized full name starts with the normalized room text typed so far.
- For room-reference slots, once the user starts typing, matching room names replace the `<room>` placeholder.
- For multi-word room names, suggestions stay open across spaces if the typed room text is still a prefix of a longer room name.
- A room-reference slot may suggest both matching room names and the next grammatical token if:
  - the user has entered at least one room word followed by a space, and
  - the current text could still be either a complete room reference or the start of a longer room name.
- The first-token suggestions treat `e` and `s` as `east` and `south`, not as `edit` and `show`.

## Rules

- `` => `create` | `connect` | `show` | `edit` | `arrange` | `help` | `north` | `south` | `east` | `west` | `<room>`
- `<direction>` => `of`
- `<direction> of` => `<room>`
- `<direction> of <room>` => `matching room names` while the room reference is still incomplete; otherwise `is` | `goes on forever` | `leads nowhere` | `lies death`
- `<direction> of <room> is` => `unknown` | `<room>`
- `<room>` => `is` | `to`
- `<room> is` => `dark` | `lit`
- `<room> to <room>` => `matching room names` while the target-room reference is still incomplete; otherwise `is`
- `<room> to <room> is` => `door` | `locked door` | `clear`
- `above` => `<room>`
- `above <room>` => `matching room names` while the room reference is still incomplete; otherwise `is` | `goes on forever` | `leads nowhere` | `lies death`
- `above/below <room> is` => `unknown` | `<room>`
- `annotate` => `<room>`
- `annotate <room>` => `matching room names` while the room reference is still incomplete; otherwise `with`
- `annotate <room> with` => no suggestions
- `arrange` => no suggestions
- `c` / `co` / any first-token command prefix => matching command names, matching directions, matching room names
- `connect` => `<room>`
- `connect <room>` => `matching room names` while the source-room reference is still incomplete; after at least one room word plus a space, also `<direction>`; otherwise `<direction>`
- `connect <room> <direction>` => `one-way` | `to`
- `connect <room> <direction> one-way` => `to`
- `connect <room> <direction> to` => `<room>`
- `connect <room> <direction> to <room>` => `matching room names` while the target-room reference is still incomplete; otherwise no suggestions
- `create` => `<new room name>` | `and connect`
- `create and` => `connect`
- `create and connect` => `<new room name>`
- `create and connect <new room name>` => `<direction>` | `, which is`
- `create and connect <new room name>, which` => `is`
- `create and connect <new room name>, which is` => `<adjective>`
- `create and connect <new room name>, which is <adjective>` => `,`
- `create and connect <new room name>, which is <adjective>,` => `<direction>`
- `create and connect <new room name>, which is <adjective>, <direction>` => `one-way` | `to`
- `create and connect <new room name>, which is <adjective>, <direction> one-way` => `to`
- `create and connect <new room name>, which is <adjective>, <direction> to` => `<room>`
- `create and connect <new room name>, which is <adjective>, <direction> one-way to` => `<room>`
- `create and connect <new room name>, which is <adjective>, <direction> to <room>` => `matching room names` while the target-room reference is still incomplete; after at least one room word plus a space, also `<direction>`; otherwise `<direction>`
- `create and connect <new room name> <direction>` => `one-way` | `to`
- `create and connect <new room name> <direction> one-way` => `to`
- `create and connect <new room name> <direction> to` => `<room>`
- `create and connect <new room name> <direction> one-way to` => `<room>`
- `create and connect <new room name> <direction> to <room>` => `matching room names` while the target-room reference is still incomplete; after at least one room word plus a space, also `<direction>`; otherwise `<direction>`
- `create <new room name>` => `, which is` | `above` | `below` | `<direction>`
- `create <new room name>, which` => `is`
- `create <new room name>, which is` => `<adjective>`
- `create <new room name>, which is <adjective>` => `,`
- `create <new room name>, which is <adjective>,` => `<direction>`
- `create <new room name>, which is <adjective>, above` => `<room>`
- `create <new room name>, which is <adjective>, below` => `<room>`
- `create <new room name>, which is <adjective>, <direction>` => `of`
- `create <new room name>, which is <adjective>, <direction> of` => `<room>`
- `create <new room name>, which is <adjective>, <direction> of <room>` => `matching room names` while the room reference is still incomplete; otherwise no suggestions
- `create <new room name> above` => `<room>`
- `create <new room name> above <room>` => `matching room names` while the room reference is still incomplete; otherwise no suggestions
- `create <new room name> below` => `<room>`
- `create <new room name> below <room>` => `matching room names` while the room reference is still incomplete; otherwise no suggestions
- `create <new room name> <direction>` => `of`
- `create <new room name> <direction> of` => `<room>`
- `create <new room name> <direction> of <room>` => `matching room names` while the room reference is still incomplete; otherwise no suggestions
- `d` / `de` / `del` / `delete` => `<room>`
- `delete <room>` => `matching room names` while the room reference is still incomplete; otherwise no suggestions
- `edit` => `<room>`
- `edit <room>` => `matching room names` while the room reference is still incomplete; otherwise no suggestions
- `get` => `all` | `<item>`
- `get all` => `from`
- `get all from` => `<room>`
- `get all from <room>` => `matching room names` while the room reference is still incomplete; otherwise no suggestions
- `get <item>` => `from`
- `get <item> from` => `<room>`
- `get <item> from <room>` => `matching room names` while the room reference is still incomplete; otherwise no suggestions
- `go` => `<direction>` | `to`
- `go to` => `<room>`
- `go to <room>` => `matching room names` while the room reference is still incomplete; otherwise no suggestions
- `h` / `help` => matching help topics
- `help <prefix>` => matching help topics
- `notate` => `<room>`
- `notate <room>` => `matching room names` while the room reference is still incomplete; otherwise `with`
- `notate <room> with` => no suggestions
- `put` => `<item list>`
- `put <item list>` => `in`
- `put <item list> in` => `<room>`
- `put <item list> in <room>` => `matching room names` while the room reference is still incomplete; otherwise no suggestions
- `show` => `<room>`
- `show <room>` => `matching room names` while the room reference is still incomplete; otherwise no suggestions
- `take` => `all` | `<item>`
- `take all` => `from`
- `take all from` => `<room>`
- `take all from <room>` => `matching room names` while the room reference is still incomplete; otherwise no suggestions
- `take <item>` => `from`
- `take <item> from` => `<room>`
- `take <item> from <room>` => `matching room names` while the room reference is still incomplete; otherwise no suggestions
- `the room` => `<direction>` | `above` | `below`
- `the room <direction>` => `of`
- `the room <direction> of` => `<room>`
- `the room <direction> of <room>` => `matching room names` while the room reference is still incomplete; otherwise `is unknown`
- `the room above` => `<room>`
- `the room above <room>` => `matching room names` while the room reference is still incomplete; otherwise `is unknown`
- `the room below` => `<room>`
- `the room below <room>` => `matching room names` while the room reference is still incomplete; otherwise `is unknown`
- `the way` => `<direction>` | `above` | `below`
- `the way <direction>` => `of`
- `the way <direction> of` => `<room>`
- `the way <direction> of <room>` => `matching room names` while the room reference is still incomplete; otherwise `goes on forever` | `leads nowhere` | `lies death`
- `the way above` => `<room>`
- `the way above <room>` => `matching room names` while the room reference is still incomplete; otherwise `goes on forever` | `leads nowhere` | `lies death`
- `the way below` => `<room>`
- `the way below <room>` => `matching room names` while the room reference is still incomplete; otherwise `goes on forever` | `leads nowhere` | `lies death`

## Notes

- The first-token suggestion menu also shows matching room names once the user starts typing the first word.
- Room-name matching for the first token is word-based: typing `c` can match `Cellar` or `Control Room`.
- Room-reference matching inside grammar slots is full-span prefix matching: typing `living ` can continue to suggest `Living Room`.
- `the room ...` and `the way ...` are pseudo-room phrase starters, not ordinary room commands.
- `<item>` and `<item list>` are intentionally generic placeholders for now. They do not require item-specific autocomplete to be useful in the menu.
- The suggestion menu intentionally closes after a complete phrase when grammar allows no further legal token at that point.
