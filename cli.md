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
- double quotes serve to group words together for disambiguation: 
  - `connect "living room east" east to dining room`
- double quotes may contain keywords and directions. Legal escape sequences inside double quotes are `\"` for a literal double quote and `\\` for a literal backslash.
- room creation may be combined with connections, like so: `create and connect bedroom east to living room`.
- `create and connect` also supports one-way connections, e.g. `create and connect bedroom east one-way to living room`.
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
- Attempting to delete an unknown room is an error. Abort the action and print the error "Unknown room <room name>".
- Attempting to edit an unknown room is an error. Abort the action and print the error "Unknown room <room name>".
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
  
