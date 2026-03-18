import { describe, expect, it } from '@jest/globals';
import {
  describeCliSuggestionNextSymbols,
  describeCliSuggestionParseStates,
  listCliSuggestionNextSymbols,
  parseCliSuggestionInput,
} from '../../src/domain/cli-suggestion-parser';

describe('cli suggestion parser', () => {
  it('starts from the root grammar state', () => {
    const result = parseCliSuggestionInput('');

    expect(result.tokens).toEqual([]);
    expect(result.states.map((state) => state.stateId)).toEqual(['ROOT']);
  });

  it('parses basic command prefixes into grammar states', () => {
    expect(parseCliSuggestionInput('create').states.map((state) => state.stateId)).toContain('CREATE');
    expect(parseCliSuggestionInput('connect').states.map((state) => state.stateId)).toContain('CONNECT');
    expect(parseCliSuggestionInput('help').states.map((state) => state.stateId)).toContain('HELP');
  });

  it('walks through connect command structure', () => {
    expect(parseCliSuggestionInput('connect kitchen').states.map((state) => state.stateId)).toEqual(['CONNECT_SOURCE']);
    expect(parseCliSuggestionInput('connect kitchen north').states.map((state) => state.stateId)).toEqual(['CONNECT_DIRECTION']);
    expect(parseCliSuggestionInput('connect kitchen north one-way').states.map((state) => state.stateId)).toEqual(['CONNECT_ONE_WAY']);
    expect(parseCliSuggestionInput('connect kitchen north to').states.map((state) => state.stateId)).toEqual(['CONNECT_TO']);
  });

  it('walks through room-led grammar structure', () => {
    expect(parseCliSuggestionInput('kitchen').states.map((state) => state.stateId)).toContain('ROOM_LEAD');
    expect(parseCliSuggestionInput('kitchen is').states.map((state) => state.stateId)).toContain('ROOM_LEAD_IS');
    expect(parseCliSuggestionInput('kitchen to').states.map((state) => state.stateId)).toContain('ROOM_LEAD_TO');
    expect(parseCliSuggestionInput('kitchen to hallway').states.map((state) => state.stateId)).toContain('ROOM_TO_ROOM');
  });

  it('walks through create command structure', () => {
    expect(parseCliSuggestionInput('create pantry').states.map((state) => state.stateId)).toContain('CREATE_NEW_ROOM');
    expect(parseCliSuggestionInput('create pantry above').states.map((state) => state.stateId)).toContain('CREATE_VERTICAL');
    expect(parseCliSuggestionInput('create pantry north').states.map((state) => state.stateId)).toContain('CREATE_DIRECTION');
  });

  it('walks through create-and-connect structure', () => {
    expect(parseCliSuggestionInput('create and connect').states.map((state) => state.stateId)).toContain('CREATE_AND_CONNECT');
    expect(parseCliSuggestionInput('create and connect pantry').states.map((state) => state.stateId)).toContain(
      'CREATE_AND_CONNECT_NEW_ROOM',
    );
    expect(parseCliSuggestionInput('create and connect pantry east').states.map((state) => state.stateId)).toContain(
      'CREATE_AND_CONNECT_DIRECTION',
    );
  });

  it('keeps pseudo-room families separate', () => {
    expect(parseCliSuggestionInput('north').states.map((state) => state.stateId)).toContain('DIRECTION_LEAD');
    expect(parseCliSuggestionInput('north of').states.map((state) => state.stateId)).toContain('DIRECTION_OF');
  });

  it('shows where the parser is still permissive about generic slot text', () => {
    expect(parseCliSuggestionInput('xyzzy').states.map((state) => state.stateId)).toContain('ROOM_LEAD');
    expect(parseCliSuggestionInput('connect north').states.map((state) => state.stateId)).toContain('CONNECT_SOURCE');
  });

  it('exposes parser descriptions for debugging', () => {
    expect(describeCliSuggestionParseStates('connect kitchen north')).toEqual([
      'CONNECT_DIRECTION: one-way, to',
    ]);
  });

  it('lists legal next symbols across viable parse states', () => {
    expect(listCliSuggestionNextSymbols('connect kitchen north').map((entry) => entry.key)).toEqual([
      'phrase:one-way',
      'keyword:to',
    ]);
  });

  it('dedupes shared next symbols across ambiguous states', () => {
    expect(describeCliSuggestionNextSymbols('north')).toEqual([
      'of <- DIRECTION_LEAD',
    ]);
  });

  it('shows room-led next symbols for generic slot text', () => {
    expect(describeCliSuggestionNextSymbols('kitchen')).toContain('is <- ROOM_LEAD');
    expect(describeCliSuggestionNextSymbols('kitchen')).toContain('to <- ROOM_LEAD');
  });
});
