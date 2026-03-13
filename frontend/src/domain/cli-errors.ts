export type CliErrorCode =
  | 'parse'
  | 'unknown-room'
  | 'ambiguous-room'
  | 'unbound-pronoun';

export type CliErrorCommandKind = 'delete' | 'edit' | 'show' | 'notate' | 'connect' | 'create-and-connect' | null;

export interface CliError {
  readonly code: CliErrorCode;
  readonly commandKind: CliErrorCommandKind;
  readonly message: string;
  readonly detail: string | null;
  readonly suggestion: string | null;
}

function quoteCliValue(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

export function createParseCliError(): CliError {
  return {
    code: 'parse',
    commandKind: null,
    message: "I didn't understand you.",
    detail: 'The command does not match any supported CLI syntax.',
    suggestion: 'Check the wording and try again. For example: `create kitchen`.',
  };
}

export function createUnknownRoomCliError(roomName: string): CliError {
  return {
    code: 'unknown-room',
    commandKind: null,
    message: `Unknown room ${quoteCliValue(roomName)}.`,
    detail: 'No room with that name exists in the current map.',
    suggestion: 'Create it first, or use the exact room name from the map.',
  };
}

export function createAmbiguousRoomCliError(
  commandKind: Exclude<CliErrorCommandKind, null>,
  roomName: string,
  matchingRoomNames: readonly string[],
): CliError {
  const action = commandKind === 'delete'
    ? 'delete'
    : commandKind === 'edit'
      ? 'edit'
      : commandKind === 'show'
        ? 'show'
        : commandKind === 'notate'
          ? 'notate'
      : 'connect';
  const suggestion = commandKind === 'delete'
    ? 'Rename one of them first, or delete them directly in the map.'
    : commandKind === 'edit'
      ? 'Rename one of them first, or open the desired room from the map.'
      : commandKind === 'show'
        ? 'Rename one of them first, or select the desired room directly in the map.'
      : commandKind === 'notate'
        ? 'Rename one of them first, or add the note directly in the map.'
      : 'Rename one of them first, or make the connection directly in the map.';

  const uniqueMatchingRoomNames = matchingRoomNames.filter((name, index, names) =>
    names.findIndex((candidate) => candidate.trim().toLowerCase() === name.trim().toLowerCase()) === index,
  );
  const matchingRoomsDetail = uniqueMatchingRoomNames.length === 0
    ? null
    : ` Matching rooms: ${uniqueMatchingRoomNames.map(quoteCliValue).join(', ')}.`;

  return {
    code: 'ambiguous-room',
    commandKind,
    message: `Multiple rooms are named ${quoteCliValue(roomName)}.`,
    detail: `The CLI cannot tell which one you want to ${action}.${matchingRoomsDetail ?? ''}`,
    suggestion,
  };
}

export function createUnboundPronounCliError(): CliError {
  return {
    code: 'unbound-pronoun',
    commandKind: null,
    message: 'Nothing is currently bound to "it".',
    detail: 'Use a command that refers to a room first, such as `show kitchen` or `edit kitchen`.',
    suggestion: 'Then you can refer to that room as `it` in a later command.',
  };
}
