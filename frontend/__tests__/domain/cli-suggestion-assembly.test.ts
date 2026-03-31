import { describe, expect, it } from '@jest/globals';
import { addRoom } from '../../src/domain/map-operations';
import { getActiveFragment } from '../../src/domain/cli-suggestion-fragments';
import { getCliSuggestionResolution } from '../../src/domain/cli-suggestion-assembly';
import { createEmptyMap, createRoom } from '../../src/domain/map-types';

describe('cli suggestion assembly', () => {
  it('produces room suggestions for select through the shared assembly path', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Cellar'), position: { x: 0, y: 0 } });
    const fragment = getActiveFragment('select c', 'select c'.length);

    expect(fragment).not.toBeNull();
    expect(getCliSuggestionResolution('select c', fragment!, doc).suggestions.map((suggestion) => suggestion.label)).toEqual(['Cellar']);
  });

  it('produces create continuations through the shared assembly path', () => {
    const fragment = getActiveFragment('create Kitchen ', 'create Kitchen '.length);

    expect(fragment).not.toBeNull();
    expect(getCliSuggestionResolution('create Kitchen ', fragment!, createEmptyMap('Test')).suggestions.map((suggestion) => suggestion.label)).toEqual(
      expect.arrayContaining(['<new room name>', ', which is', 'above', 'below', 'north']),
    );
  });
});
