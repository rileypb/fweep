# CLI Rules

## Parsing

- a name is a sequence of characters not including double quotes.
- `create` before a name creates a room if it doesn't exist yet, for example:
  - ` create bedroom`
  - ` create living room`
- `-` before a name deletes that room including all dependent connections:
  - `delete bedroom`
  - `delete living room`
- connections are defined by arrows:
  - a two-way connection is defined like so:
    - `connect bedroom east to living room west` creates a two-way connection from the bedroom to the living room, going east from the bedroom and west from the living room.
	- `connect bedroom east to living room south` creates a two-way connection from the bedroom to the living room, going east from the bedroom and south from the living room.
	- `connect bedroom east to living room` creates a two-way connection from the bedroom to the living room, going east from the bedroom and defaulting to west from the living room.
  - a one-way connection is defined like so:
	- `connect bedroom east one-way to living room` creates a one-way connection from the bedroom to the living room, going east from the bedroom.
- double quotes serve to group words together for disambiguation: 
  - `connect "living room east" east to dining room`
- room creation may be combined with connections, like so: `create and connect bedroom east to living room`.

## Behavior rules

- If the user asks to create a room which already exists, add an index to the end of the name and create the room. For instance:
  - User creates kitchen. User asks to create kitchen again; create kitchen 2 instead. If the user asks to create the kitchen yet again, create kitchen 3, etc.
- Place newly created rooms in a location close to another room, selected however is convenient.
- If the user creates a room and connects it in the same operation, for instance `create and connect bedroom east to living room`, temporarily lock all rooms except for the bedroom and prettify the map. Then unlock anything that wasn't locked before.
- If the user creates a new connection, temporarily lock all rooms except for the two involved in the connection and prettify the map. Then unlock anything that wasn't locked before.
- Do not do any locking or prettification when a connection is from a room to itself.
- `edit <room name>` opens the edit dialog for the indicated room.
