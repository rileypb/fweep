export type CliErrorCode =
  | 'parse'
  | 'unknown-room'
  | 'ambiguous-room'
  | 'unbound-pronoun';

export type CliErrorCommandKind =
  | 'delete'
  | 'edit'
  | 'show'
  | 'notate'
  | 'connect'
  | 'create-and-connect'
  | 'set-room-adjective'
  | 'put-items'
  | 'take-items'
  | null;

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
    detail: null,
    suggestion: null,
  };
}

export function createUnknownRoomCliError(roomName: string): CliError {
  return {
    code: 'unknown-room',
    commandKind: null,
    message: `Unknown room ${quoteCliValue(roomName)}.`,
    detail: null,
    suggestion: null,
  };
}

export function createAmbiguousRoomCliError(
  commandKind: Exclude<CliErrorCommandKind, null>,
  roomName: string,
  matchingRoomNames: readonly string[],
): CliError {
  const uniqueMatchingRoomNames = matchingRoomNames.filter((name, index, names) =>
    names.findIndex((candidate) => candidate.trim().toLowerCase() === name.trim().toLowerCase()) === index,
  );
  const matchingRoomsText = uniqueMatchingRoomNames
    .map(quoteCliValue)
    .map((name, index, names) => {
      if (names.length === 1) {
        return name;
      }

      if (index === names.length - 1) {
        return `or ${name}`;
      }

      return name;
    })
    .join(uniqueMatchingRoomNames.length <= 2 ? ' ' : ', ')
    .replace(', or ', ', or ');

  return {
    code: 'ambiguous-room',
    commandKind,
    message: `The name ${quoteCliValue(roomName)} is ambiguous. It could match ${matchingRoomsText}.`,
    detail: null,
    suggestion: null,
  };
}

export function createUnboundPronounCliError(): CliError {
  return {
    code: 'unbound-pronoun',
    commandKind: null,
    message: 'Nothing is currently bound to "it".',
    detail: null,
    suggestion: null,
  };
}
