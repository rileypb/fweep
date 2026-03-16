const markdown = `# CLI Help

## rooms

Room creation, lookup, editing, and map-level housekeeping.

- \`create/c <room name>\`
- \`delete/d/del <room name>\`
- \`edit/e/ed <room name>\`
- \`show/s <room name>\`
- \`arrange/arr/prettify\`
- \`undo/redo\`

## connect

Connections, relative room creation, and exceptional exits.

- \`connect/con <room name> <direction> [one-way] to <room name> [<direction>]\`

## notes

Sticky notes and room annotations.

- \`notate/annotate/ann <room name> with <note text>\`

## items

Placing and removing items from rooms.

- \`put <item> in <room name>\`
- \`take/get all from <room name>\`
`;

export default markdown;
