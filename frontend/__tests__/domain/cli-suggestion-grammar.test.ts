import { describe, expect, it } from '@jest/globals';
import {
  CLI_SUGGESTION_GRAMMAR_STATES,
  describeCliSuggestionGrammarSymbols,
  getCliSuggestionGrammarState,
  getCliSuggestionGrammarTransitionTargets,
} from '../../src/domain/cli-suggestion-grammar';

describe('cli suggestion grammar', () => {
  it('defines only valid transition targets', () => {
    const stateIds = new Set(CLI_SUGGESTION_GRAMMAR_STATES.map((grammarState) => grammarState.id));

    for (const grammarState of CLI_SUGGESTION_GRAMMAR_STATES) {
      for (const targetStateId of getCliSuggestionGrammarTransitionTargets(grammarState.id)) {
        expect(stateIds.has(targetStateId)).toBe(true);
      }
    }
  });

  it('describes the root command space declaratively', () => {
    expect(describeCliSuggestionGrammarSymbols('ROOT')).toEqual([
      'create',
      'connect',
      'go',
      'show',
      'edit',
      'delete',
      'notate',
      'annotate',
      'arrange',
      'help',
      'put',
      'take',
      'get',
      'undo',
      'redo',
      'above',
      'below',
      'the room',
      'the way',
      '<direction>',
      '<room_ref>',
    ]);
  });

  it('captures room-led followups', () => {
    expect(describeCliSuggestionGrammarSymbols('ROOM_LEAD')).toEqual(['is', 'to']);
    expect(describeCliSuggestionGrammarSymbols('ROOM_LEAD_IS')).toEqual(['dark', 'lit']);
    expect(describeCliSuggestionGrammarSymbols('ROOM_TO_ROOM_IS')).toEqual(['door', 'locked door', 'clear']);
  });

  it('captures connect command transitions', () => {
    expect(describeCliSuggestionGrammarSymbols('CONNECT')).toEqual(['<room_ref>']);
    expect(describeCliSuggestionGrammarSymbols('CONNECT_SOURCE')).toEqual(['<direction>']);
    expect(describeCliSuggestionGrammarSymbols('CONNECT_DIRECTION')).toEqual(['one-way', 'to']);
    expect(describeCliSuggestionGrammarSymbols('CONNECT_ONE_WAY')).toEqual(['to']);
    expect(describeCliSuggestionGrammarSymbols('CONNECT_TO')).toEqual(['<room_ref>']);
    expect(describeCliSuggestionGrammarSymbols('CONNECT_TARGET_DONE')).toEqual(['<end>']);
  });

  it('captures create command transitions', () => {
    expect(describeCliSuggestionGrammarSymbols('CREATE')).toEqual(['<new_room_name>', 'and connect']);
    expect(describeCliSuggestionGrammarSymbols('CREATE_NEW_ROOM')).toEqual([
      ', which is',
      'above',
      'below',
      '<direction>',
    ]);
    expect(describeCliSuggestionGrammarSymbols('CREATE_NEW_ROOM_WHICH_IS')).toEqual(['dark', 'lit']);
    expect(describeCliSuggestionGrammarSymbols('CREATE_ADJECTIVE')).toEqual([',']);
    expect(describeCliSuggestionGrammarSymbols('CREATE_DIRECTION')).toEqual(['of']);
  });

  it('captures create-and-connect transitions', () => {
    expect(describeCliSuggestionGrammarSymbols('CREATE_AND_CONNECT')).toEqual(['<new_room_name>']);
    expect(describeCliSuggestionGrammarSymbols('CREATE_AND_CONNECT_NEW_ROOM')).toEqual([
      ', which is',
      '<direction>',
    ]);
    expect(describeCliSuggestionGrammarSymbols('CREATE_AND_CONNECT_DIRECTION')).toEqual(['one-way', 'to']);
    expect(describeCliSuggestionGrammarSymbols('CREATE_AND_CONNECT_ONE_WAY')).toEqual(['to']);
  });

  it('captures pseudo-room families separately', () => {
    expect(describeCliSuggestionGrammarSymbols('DIRECTION_OF_ROOM')).toEqual([
      'is unknown',
      'goes on forever',
      'leads nowhere',
      'lies death',
    ]);
    expect(describeCliSuggestionGrammarSymbols('THE_ROOM_OF_ROOM')).toEqual(['is unknown']);
    expect(describeCliSuggestionGrammarSymbols('THE_WAY_OF_ROOM')).toEqual([
      'goes on forever',
      'leads nowhere',
      'lies death',
    ]);
  });

  it('marks terminal states explicitly', () => {
    expect(describeCliSuggestionGrammarSymbols('ARRANGE')).toEqual(['<end>']);
    expect(describeCliSuggestionGrammarSymbols('UNDO')).toEqual(['<end>']);
    expect(describeCliSuggestionGrammarSymbols('REDO')).toEqual(['<end>']);
    expect(describeCliSuggestionGrammarSymbols('ROOM_LIGHTING_DONE')).toEqual(['<end>']);
    expect(describeCliSuggestionGrammarSymbols('PSEUDO_DONE')).toEqual(['<end>']);
  });

  it('exposes state lookup for future parser work', () => {
    expect(getCliSuggestionGrammarState('CONNECT_DIRECTION')).toMatchObject({
      id: 'CONNECT_DIRECTION',
    });
    expect(getCliSuggestionGrammarState('missing-state')).toBeNull();
  });
});
