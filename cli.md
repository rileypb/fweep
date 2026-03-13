# CLI Rules

## Parsing

- an unquoted name is a sequence of characters not including double quotes.
- `create` before a name creates a room if it doesn't exist yet, for example:
  - ` create bedroom`
  - ` create living room`
- `delete` before a name deletes that room including all dependent connections:
  - `delete bedroom`
  - `delete living room`
- connections are defined with `connect`:
  - a two-way connection is defined like so:
    - `connect bedroom east to living room west` creates a two-way connection from the bedroom to the living room, going east from the bedroom and west from the living room.
	- `connect bedroom east to living room south` creates a two-way connection from the bedroom to the living room, going east from the bedroom and south from the living room.
	- `connect bedroom east to living room` creates a two-way connection from the bedroom to the living room, going east from the bedroom and defaulting to west from the living room.
  - a one-way connection is defined like so:
	- `connect bedroom east one-way to living room` creates a one-way connection from the bedroom to the living room, going east from the bedroom.
- `n`, `s`, `e`, `w`, `u`, and `d` are accepted as synonyms for `north`, `south`, `east`, `west`, `up`, and `down` respectively.
- `oneway` and `one way` are accepted as synonyms for `one-way`.
- double quotes serve to group words together for disambiguation: 
  - `connect "living room east" east to dining room`
- double quotes may contain keywords and directions. Legal escape sequences inside double quotes are `\"` for a literal double quote and `\\` for a literal backslash.
- room references are matched by whole-word token containment, ignoring word order. For example:
  - `delete living` matches `living room`
  - `edit room living` matches `living room`
  - `delete "living second room"` matches `second living room`
  - repeated query words are ignored when matching
  - partial word fragments do not match: `liv` does not match `living room`
- room creation may be combined with connections, like so: `create and connect bedroom east to living room`.
- `create and connect` also supports one-way connections, e.g. `create and connect bedroom east one-way to living room`.
- `create <room name 1> <direction> of <room name 2>` is accepted as a synonym for `create and connect <room name 1> <opposite direction> to <room name 2>`. In this form, the direction describes where room 1 is relative to room 2. For example, `create kitchen east of hallway` means `create and connect kitchen west to hallway`.
- `notate <room name> with <note text>` creates a sticky note linked to the indicated room.
- `annotate <room name> with <note text>` is accepted as an exact synonym for `notate <room name> with <note text>`. For example:
  - `notate kitchen with this room has nice wallpaper`
  - `annotate kitchen with this room has nice wallpaper`
  - `notate "machine room" with "check the humming noise here"`
- `it` may be used in place of a room name after a command has established a direct-object room target. For example:
  - `create kitchen`
  - `connect it east to living room` means `connect kitchen east to living room`
  - `edit it` means `edit kitchen`
- parsing precedence: a word in a command that matches a keyword or a direction is considered a keyword or direction unless it is surrounded by double quotes. For instance `connect living room east to dining room west` parses the same as `connect "living room" east to "dining room" west`

## Behavior rules

- If the user asks to create a room which already exists, add an index to the end of the name and create the room. For instance:
  - User creates kitchen. User asks to create kitchen again; create kitchen 2 instead. If the user asks to create the kitchen yet again, create kitchen 3, etc.
- Place newly created rooms in a location two grid cells to the east of the most recently-created room.
- If there is no previously created room, place the new room at the center of the current viewport.
- For the following: "locking" is defined only for prettification. This CLI-specific locking is transient and is distinct from the room's persistent `locked` property. A room that is locked for prettification is treated as immovable by the prettification algorithm, as though it had infinite inertia. Prettification is the algorithm we defined in the graphical UI for laying out rooms.
  - If the user creates a room and connects it in the same operation, for instance `create and connect bedroom east to living room`, temporarily lock all rooms except for the bedroom and prettify the map. Then unlock anything that wasn't locked before.
  - If the user creates a new connection, temporarily lock all rooms except for the two involved in the connection and prettify the map. Then unlock anything that wasn't locked before.
  - Do not do any locking or prettification when a connection is from a room to itself. In other words, the connection's target room is the same as its source room.
- `edit <room name>` opens the room editor overlay for the indicated room.
- `show <room name>` scrolls the indicated room into view and selects it.
- `notate <room name> with <note text>` creates a sticky note, links it to the indicated room, and selects the new note.
- `annotate <room name> with <note text>` behaves identically.
- After a command with a room direct object succeeds, bind that room as the target for `it`.
  - `create <room name>` binds the newly created room, including its de-duplicated final name.
  - `delete <room name>` resolves `it` before deletion, but then clears the binding if it referred to the deleted room.
  - `edit <room name>`, `show <room name>`, and `notate <room name> with <note text>` bind the referenced room.
  - `connect <room name> ...` binds the source room, unless the target room was referred to as `it`; in that case the existing `it` binding is preserved.
  - `create and connect <room name> ...` and `create <room name> <direction> of/above/below <room name>` bind the newly created room, unless the target room was referred to as `it`; in that case the existing `it` binding is preserved.
- direction inverses follow the compass, with down and up serving as inverses, as do in and out. Custom directions are not supported by the CLI.
- A single CLI command is one undo/redo entry.
- `Undo` and `Redo` undo and redo the previous command respectively.
- After creating a room, the focus should be on that room, and it should be selected. The UI should scroll it into view.
- After connecting two pre-existing rooms, the focus and selection should be that connection. The UI should scroll it into view.
- After creating a room and connecting it in the same command, focus the connection, and select the connection and both rooms. Scroll the connection into view.
- We will postpone autocomplete, history, and quick reference for now. 

## Errors and Special Cases

- Errors should be shown in red text below the CLI input. Typing a new command clears the previous error.
- `create and connect bedroom east to living room` results in an error if living room doesn't exist.
- `create and connect bedroom east to living room` creates bedroom 2 (or higher) if bedroom exists.
- Attempting to connect to an unknown room is an error. Abort the action and print the error "Unknown room <room name>".
- If multiple rooms match a requested room name for `connect`, abort the action and print an ambiguity error listing the unique matching room names.
- Attempting to delete an unknown room is an error. Abort the action and print the error "Unknown room <room name>".
- If multiple rooms match the requested name for `delete`, abort the action and print an ambiguity error listing the unique matching room names.
- Attempting to edit an unknown room is an error. Abort the action and print the error "Unknown room <room name>".
- If multiple rooms match the requested name for `edit`, abort the action and print an ambiguity error listing the unique matching room names.
- Attempting to show an unknown room is an error. Abort the action and print the error "Unknown room <room name>".
- If multiple rooms match the requested name for `show`, abort the action and print an ambiguity error listing the unique matching room names.
- Attempting to notate or annotate an unknown room is an error. Abort the action and print the error "Unknown room <room name>".
- If multiple rooms match the requested name for `notate` or `annotate`, abort the action and print an ambiguity error listing the unique matching room names.
- Attempting to use `it` when no room is currently bound to it is an error. Abort the action and print the error `Nothing is currently bound to "it".`
- If the user attempts to attach a connection in a direction that already possesses a connection, delete the old connection and create the new one. 
  - For instance, if bedroom is connected to living room to the east, and the user attempts to connect bedroom to kitchen to the east, delete the connection to living room and create the connection to the kitchen.
  - Correspondingly, if the user types `connect bedroom east to living room west` and `connect kitchen east to living room west`, the first connection will be deleted and only the connection between kitchen and living room will remain.
- Report the error `I didn't understand you.` only for syntax errors. A syntax error is any input that, after whitespace normalization and tokenization, does not match exactly one command form. This includes malformed quotes, missing required words, missing required arguments, and unexpected extra input after an otherwise valid command.
- If a command parses successfully but cannot be executed, report a specific error instead of `I didn't understand you.`.
- For failures in combined commands, report the first error encountered.
- If a combined command fails, roll back all actions.

## Direction table

table of directions and their inverses:
| Direction | Inverse |
|-----------|---------|
| north     | south   |
| south     | north   |
| east      | west    |
| west      | east    |
| up        | down    |
| down      | up      |
| in        | out     |
| out       | in      |
| southwest | northeast |
| southeast | northwest |
| northwest | southeast |
| northeast | southwest |

## Miscellaneous

- names are not case sensitive
- punctuation and Unicode characters in names are preserved as-is, except for the whitespace normalization rules below
- whitespace will be normalized to:
  - no trailing or leading spaces
  - tabs will be replaced with spaces
  - runs of two or more spaces will be reduced to single spaces
  
