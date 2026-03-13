import { describe, expect, it } from '@jest/globals';
import {
  createAmbiguousRoomCliError,
  createParseCliError,
  createUnknownRoomCliError,
} from '../../src/domain/cli-errors';

describe('cli-errors', () => {
  it('formats parse errors', () => {
    expect(createParseCliError()).toEqual({
      code: 'parse',
      commandKind: null,
      message: "I didn't understand you.",
      detail: 'The command does not match any supported CLI syntax.',
      suggestion: 'Check the wording and try again. For example: `create kitchen`.',
    });
  });

  it('formats unknown-room errors', () => {
    expect(createUnknownRoomCliError('Kitchen')).toEqual({
      code: 'unknown-room',
      commandKind: null,
      message: 'Unknown room "Kitchen".',
      detail: 'No room with that name exists in the current map.',
      suggestion: 'Create it first, or use the exact room name from the map.',
    });
  });

  it('formats ambiguous-room errors by command kind', () => {
    expect(createAmbiguousRoomCliError('delete', 'Kitchen', ['Kitchen', 'Pantry'])).toEqual({
      code: 'ambiguous-room',
      commandKind: 'delete',
      message: 'Multiple rooms are named "Kitchen".',
      detail: 'The CLI cannot tell which one you want to delete. Matching rooms: "Kitchen", "Pantry".',
      suggestion: 'Rename one of them first, or delete them directly in the map.',
    });
    expect(createAmbiguousRoomCliError('edit', 'Kitchen', ['Kitchen', 'Pantry'])).toEqual({
      code: 'ambiguous-room',
      commandKind: 'edit',
      message: 'Multiple rooms are named "Kitchen".',
      detail: 'The CLI cannot tell which one you want to edit. Matching rooms: "Kitchen", "Pantry".',
      suggestion: 'Rename one of them first, or open the desired room from the map.',
    });
    expect(createAmbiguousRoomCliError('connect', 'Kitchen', ['Kitchen', 'Pantry'])).toEqual({
      code: 'ambiguous-room',
      commandKind: 'connect',
      message: 'Multiple rooms are named "Kitchen".',
      detail: 'The CLI cannot tell which one you want to connect. Matching rooms: "Kitchen", "Pantry".',
      suggestion: 'Rename one of them first, or make the connection directly in the map.',
    });
    expect(createAmbiguousRoomCliError('create-and-connect', 'Kitchen', ['Kitchen', 'Pantry'])).toEqual({
      code: 'ambiguous-room',
      commandKind: 'create-and-connect',
      message: 'Multiple rooms are named "Kitchen".',
      detail: 'The CLI cannot tell which one you want to connect. Matching rooms: "Kitchen", "Pantry".',
      suggestion: 'Rename one of them first, or make the connection directly in the map.',
    });
  });

  it('deduplicates repeated matching names in ambiguous-room errors', () => {
    expect(createAmbiguousRoomCliError('delete', 'bedroom', ['Bedroom', 'Bedroom', 'Guest Room'])).toEqual({
      code: 'ambiguous-room',
      commandKind: 'delete',
      message: 'Multiple rooms are named "bedroom".',
      detail: 'The CLI cannot tell which one you want to delete. Matching rooms: "Bedroom", "Guest Room".',
      suggestion: 'Rename one of them first, or delete them directly in the map.',
    });
  });
});
