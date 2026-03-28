# Fweep Help

## Mouse and Trackpad

- `R`, then click empty canvas: create a room.
- `N`, then click empty canvas: create a sticky note.
- `Click` empty canvas: clear selection.
- `Drag` empty canvas: marquee-select rooms, connections, sticky notes, and sticky-note links.
- `Shift-drag` empty canvas: pan the map.
- Two-finger trackpad scroll over the canvas: pan the map.
- Hold `Ctrl` or `Cmd` and scroll over the canvas: zoom the map.
- `+` or `=`: zoom in.
- `-`: zoom out.
- `0`: reset zoom.
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
- `Drag` the small `+` handle on a sticky note to a room: create a sticky-note link.
- `Double-click` sticky note: edit note text.

## Sticky-Note Links

- `Click` sticky-note link: select the link.
- `Shift-click` sticky-note link: add the link to selection.

## Keyboard

- `/`: focus the CLI input.
- `Ctrl+/`: switch keyboard focus between the interactive fiction game and the mapper.
- `Delete` / `Backspace`: delete the current mixed selection.
- `Enter`: open the room editor when exactly one room is selected.
- `Enter`: open the connection editor when exactly one connection is selected.
- `L`: lock or unlock the selected room's position.
- `Arrow keys`: move selection to the nearest room in that direction.
- `Ctrl/Cmd+Z`: undo.
- `Ctrl/Cmd+Y`: redo.
- `Ctrl/Cmd+Shift+Z`: redo.

## CLI

- `/`: focus the CLI input from most places in the app.
- `Tab`: accept the highlighted autocomplete suggestion.
- `ArrowUp` / `ArrowDown` in the CLI input: move through command history.
- `help`: show the command reference in the CLI.
- `zoom in` / `zoom out` / `zoom reset`: step the map zoom in, out, or back to `100%`.
- `zoom <number>` or `zoom <number>%`: set the map zoom directly from `25%` to `300%`.

## Editors and Dialogs

- `Escape`: cancel the room editor or connection editor, or close the sticky-note text editor, color picker, export dialog, or help dialog.
- In the room editor, `Enter` saves the current draft.
- In the connection editor, `Enter` saves the current draft.
- In the room editor, `Tab` and `Shift+Tab` move focus between controls.
- In the connection editor, `Tab` and `Shift+Tab` move focus between controls.
- The room editor has `Cancel` and `Save` buttons for discarding or applying changes.
- The connection editor has `Cancel` and `Save` buttons for discarding or applying changes.
- Clicking a room or connection editor backdrop closes it.

## Toolbar and Buttons

- The snap button toggles grid snapping.
- The grid button toggles grid visibility.
- The theme button toggles light and dark mode.
- The prettify button rearranges the room layout.
- Undo and redo buttons mirror the keyboard shortcuts.
- Focus a splitter and use the arrow keys to resize the game panel, game output, or linked game width.
