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
      detail: null,
      suggestion: null,
    });
  });

  it('formats unknown-room errors', () => {
    expect(createUnknownRoomCliError('Kitchen')).toEqual({
      code: 'unknown-room',
      commandKind: null,
      message: 'Unknown room "Kitchen".',
      detail: null,
      suggestion: null,
    });
  });

  it('formats ambiguous-room errors by command kind', () => {
    expect(createAmbiguousRoomCliError('delete', 'Kitchen', ['Kitchen', 'Pantry'])).toEqual({
      code: 'ambiguous-room',
      commandKind: 'delete',
      message: 'The name "Kitchen" is ambiguous. It could match "Kitchen" or "Pantry".',
      detail: null,
      suggestion: null,
    });
    expect(createAmbiguousRoomCliError('edit', 'Kitchen', ['Kitchen', 'Pantry'])).toEqual({
      code: 'ambiguous-room',
      commandKind: 'edit',
      message: 'The name "Kitchen" is ambiguous. It could match "Kitchen" or "Pantry".',
      detail: null,
      suggestion: null,
    });
    expect(createAmbiguousRoomCliError('connect', 'Kitchen', ['Kitchen', 'Pantry'])).toEqual({
      code: 'ambiguous-room',
      commandKind: 'connect',
      message: 'The name "Kitchen" is ambiguous. It could match "Kitchen" or "Pantry".',
      detail: null,
      suggestion: null,
    });
    expect(createAmbiguousRoomCliError('create-and-connect', 'Kitchen', ['Kitchen', 'Pantry'])).toEqual({
      code: 'ambiguous-room',
      commandKind: 'create-and-connect',
      message: 'The name "Kitchen" is ambiguous. It could match "Kitchen" or "Pantry".',
      detail: null,
      suggestion: null,
    });
  });

  it('deduplicates repeated matching names in ambiguous-room errors', () => {
    expect(createAmbiguousRoomCliError('delete', 'bedroom', ['Bedroom', 'Bedroom', 'Guest Room'])).toEqual({
      code: 'ambiguous-room',
      commandKind: 'delete',
      message: 'The name "bedroom" is ambiguous. It could match "Bedroom" or "Guest Room".',
      detail: null,
      suggestion: null,
    });
  });
});
