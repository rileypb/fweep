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
      'disconnect',
      'describe',
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
    expect(describeCliSuggestionGrammarSymbols('CONNECT_ONE_WAY_TO')).toEqual(['<room_ref>']);
    expect(describeCliSuggestionGrammarSymbols('CONNECT_TARGET_DONE')).toEqual(['<direction>', '<end>']);
    expect(describeCliSuggestionGrammarSymbols('CONNECT_ONE_WAY_TARGET_DONE')).toEqual(['<end>']);
  });

  it('captures disconnect command transitions', () => {
    expect(describeCliSuggestionGrammarSymbols('DISCONNECT')).toEqual(['<room_ref>']);
    expect(describeCliSuggestionGrammarSymbols('DISCONNECT_SOURCE')).toEqual(['<direction>', 'from']);
    expect(describeCliSuggestionGrammarSymbols('DISCONNECT_SOURCE_DIRECTION')).toEqual(['from']);
    expect(describeCliSuggestionGrammarSymbols('DISCONNECT_FROM')).toEqual(['<room_ref>']);
    expect(describeCliSuggestionGrammarSymbols('DISCONNECT_FROM_AFTER_DIRECTION')).toEqual(['<room_ref>']);
    expect(describeCliSuggestionGrammarSymbols('DISCONNECT_TARGET_DONE')).toEqual(['<end>']);
  });

  it('captures describe command transitions', () => {
    expect(describeCliSuggestionGrammarSymbols('DESCRIBE')).toEqual(['<room_ref>', '<end>']);
    expect(describeCliSuggestionGrammarSymbols('DESCRIBE_ROOM_DONE')).toEqual(['<end>']);
  });

  it('captures create command transitions', () => {
    expect(describeCliSuggestionGrammarSymbols('CREATE')).toEqual(['<new_room_name>', 'and']);
    expect(describeCliSuggestionGrammarSymbols('CREATE_AND')).toEqual(['connect']);
    expect(describeCliSuggestionGrammarSymbols('CREATE_NEW_ROOM')).toEqual([
      ',',
      'above',
      'below',
      '<direction>',
    ]);
    expect(describeCliSuggestionGrammarSymbols('CREATE_NEW_ROOM_COMMA')).toEqual(['which']);
    expect(describeCliSuggestionGrammarSymbols('CREATE_NEW_ROOM_WHICH')).toEqual(['is']);
    expect(describeCliSuggestionGrammarSymbols('CREATE_NEW_ROOM_WHICH_IS')).toEqual(['dark', 'lit']);
    expect(describeCliSuggestionGrammarSymbols('CREATE_ADJECTIVE')).toEqual([',']);
    expect(describeCliSuggestionGrammarSymbols('CREATE_DIRECTION')).toEqual(['of']);
  });

  it('captures create-and-connect transitions', () => {
    expect(describeCliSuggestionGrammarSymbols('CREATE_AND_CONNECT')).toEqual(['<new_room_name>']);
    expect(describeCliSuggestionGrammarSymbols('CREATE_AND_CONNECT_NEW_ROOM')).toEqual([
      ',',
      '<direction>',
    ]);
    expect(describeCliSuggestionGrammarSymbols('CREATE_AND_CONNECT_COMMA')).toEqual(['which']);
    expect(describeCliSuggestionGrammarSymbols('CREATE_AND_CONNECT_WHICH')).toEqual(['is']);
    expect(describeCliSuggestionGrammarSymbols('CREATE_AND_CONNECT_DIRECTION')).toEqual(['one-way', 'to']);
    expect(describeCliSuggestionGrammarSymbols('CREATE_AND_CONNECT_ONE_WAY')).toEqual(['to']);
    expect(describeCliSuggestionGrammarSymbols('CREATE_AND_CONNECT_TO')).toEqual(['<room_ref>']);
    expect(describeCliSuggestionGrammarSymbols('CREATE_AND_CONNECT_ONE_WAY_TO')).toEqual(['<room_ref>']);
    expect(describeCliSuggestionGrammarSymbols('CREATE_AND_CONNECT_TARGET_DONE')).toEqual(['<direction>', '<end>']);
    expect(describeCliSuggestionGrammarSymbols('CREATE_AND_CONNECT_ONE_WAY_TARGET_DONE')).toEqual(['<end>']);
  });

  it('captures pseudo-room families separately', () => {
    expect(describeCliSuggestionGrammarSymbols('DIRECTION_OF_ROOM')).toEqual([
      'is',
      'goes',
      'leads',
      'lies',
    ]);
    expect(describeCliSuggestionGrammarSymbols('THE_ROOM_OF_ROOM')).toEqual(['is']);
    expect(describeCliSuggestionGrammarSymbols('THE_WAY_OF_ROOM')).toEqual([
      'goes',
      'leads',
      'lies',
    ]);
    expect(describeCliSuggestionGrammarSymbols('PSEUDO_IS')).toEqual(['unknown']);
    expect(describeCliSuggestionGrammarSymbols('PSEUDO_GOES')).toEqual(['on']);
    expect(describeCliSuggestionGrammarSymbols('PSEUDO_GOES_ON')).toEqual(['forever']);
    expect(describeCliSuggestionGrammarSymbols('PSEUDO_LEADS')).toEqual(['nowhere']);
    expect(describeCliSuggestionGrammarSymbols('PSEUDO_LIES')).toEqual(['death']);
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
