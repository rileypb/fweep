# Fweep Help

## CLI, or how to type out a map

- `create <room name>` creates a new room.
- `delete <room name>` deletes a room with that name.
- `edit <room name>` opens the room editor for that room.
- `connect <room> <direction> to <room>` creates a two-way connection.
- `connect <room> <direction> to <room> <direction>` creates a two-way connection with an explicit direction on both ends.
- `connect <room> <direction> one-way to <room>` creates a one-way connection.
- `create and connect <room> <direction> to <room>` creates a new room and immediately connects it.
- `create <new room> <direction> of <existing room>` creates a new room and a two-way relative connection.
- `create <new room> above <existing room>` creates a new room above an existing one, with `down` from the new room and `up` from the existing room.
- `create <new room> below <existing room>` creates a new room below an existing one, with `up` from the new room and `down` from the existing room.
- `undo` undoes the previous command.
- `redo` redoes the previously undone command.
- Room names can be quoted, for example `create "Machine Room"`.
- In quoted names, `\"` inserts a literal quote.
- Short direction aliases also work in the CLI, such as `n`, `s`, `e`, `w`, `u`, and `d`.
- If a two-way `connect` command omits the target direction, fweep uses the opposite direction by default.

## Mouse and Trackpad

- `Double-click` empty canvas: create a room.
- `Shift-click` empty canvas: create a sticky note.
- `Click` empty canvas: clear selection.
- `Drag` empty canvas: marquee-select rooms, connections, sticky notes, and sticky-note links.
- `Shift-drag` empty canvas: pan the map.
- `Click` minimap: recenter the map.
- `Drag` minimap viewport: pan the map.

## Rooms

- `Click` room: select the room.
- `Shift-click` room: add the room to selection.
- `Drag` room: move all selected rooms and sticky notes.
- `Double-click` room: open the room editor.
- `Drag` from a directional handle: create a connection.
- Drop on a room body: create a one-way connection.
- Drop on a room handle: create a two-way connection.

## Connections

- `Click` connection: select the connection.
- `Shift-click` connection: add the connection to selection.
- `Double-click` connection: open the connection editor.

## Sticky Notes

- `Click` sticky note: select the note.
- `Shift-click` sticky note: add the note to selection.
- `Drag` sticky note: move all selected rooms and sticky notes.
- `Double-click` sticky note: edit note text.
- `Alt`/`Option-drag` from a sticky note to a room: create a sticky-note link.

## Sticky-Note Links

- `Click` sticky-note link: select the link.
- `Shift-click` sticky-note link: add the link to selection.

## Keyboard

- `Delete` / `Backspace`: delete the current mixed selection.
- `Enter`: open the room editor when exactly one room is selected.
- `Arrow keys`: move selection to the nearest room in that direction.
- `Ctrl/Cmd+Z`: undo.
- `Ctrl/Cmd+Y`: redo.
- `Ctrl/Cmd+Shift+Z`: redo.

## Editors and Dialogs

- `Escape`: close the room editor, connection editor, sticky-note text editor, color picker, or export dialog.
- In the room editor, `Enter` in the room name field moves focus to the shape controls.
- Clicking a room or connection editor backdrop closes it.

## Toolbar and Buttons

- The snap button toggles grid snapping.
- The grid button toggles grid visibility.
- The theme button toggles light and dark mode.
- The prettify button rearranges the room layout.
- Undo and redo buttons mirror the keyboard shortcuts.
