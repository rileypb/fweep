export type CliSuggestionSlotType =
  | 'ROOM_REF'
  | 'CONNECTED_ROOM_REF'
  | 'NEW_ROOM_NAME'
  | 'HELP_TOPIC'
  | 'DIRECTION'
  | 'ITEM'
  | 'ITEM_LIST';

export type CliSuggestionGrammarSymbol =
  | {
    readonly kind: 'keyword';
    readonly text: string;
    readonly nextStateId: string;
  }
  | {
    readonly kind: 'phrase';
    readonly text: string;
    readonly nextStateId: string;
  }
  | {
    readonly kind: 'slot';
    readonly slotType: CliSuggestionSlotType;
    readonly nextStateId: string;
  }
  | {
    readonly kind: 'end';
  };

export interface CliSuggestionGrammarState {
  readonly id: string;
  readonly nextSymbols: readonly CliSuggestionGrammarSymbol[];
}

function keyword(text: string, nextStateId: string): CliSuggestionGrammarSymbol {
  return { kind: 'keyword', text, nextStateId };
}

function phrase(text: string, nextStateId: string): CliSuggestionGrammarSymbol {
  return { kind: 'phrase', text, nextStateId };
}

function slot(slotType: CliSuggestionSlotType, nextStateId: string): CliSuggestionGrammarSymbol {
  return { kind: 'slot', slotType, nextStateId };
}

function end(): CliSuggestionGrammarSymbol {
  return { kind: 'end' };
}

function state(id: string, nextSymbols: readonly CliSuggestionGrammarSymbol[]): CliSuggestionGrammarState {
  return { id, nextSymbols };
}

const cliSuggestionGrammarStates = [
  state('ROOT', [
    keyword('create', 'CREATE'),
    keyword('connect', 'CONNECT'),
    keyword('go', 'GO'),
    keyword('show', 'SHOW'),
    keyword('edit', 'EDIT'),
    keyword('delete', 'DELETE'),
    keyword('notate', 'NOTATE'),
    keyword('annotate', 'ANNOTATE'),
    keyword('arrange', 'ARRANGE'),
    keyword('help', 'HELP'),
    keyword('put', 'PUT'),
    keyword('take', 'TAKE'),
    keyword('get', 'GET'),
    keyword('undo', 'UNDO'),
    keyword('redo', 'REDO'),
    keyword('above', 'ABOVE_LEAD'),
    keyword('below', 'BELOW_LEAD'),
    phrase('the room', 'THE_ROOM'),
    phrase('the way', 'THE_WAY'),
    slot('DIRECTION', 'DIRECTION_LEAD'),
    slot('ROOM_REF', 'ROOM_LEAD'),
  ]),
  state('HELP', [
    slot('HELP_TOPIC', 'HELP_TOPIC_DONE'),
  ]),
  state('HELP_TOPIC_DONE', [
    end(),
  ]),
  state('ARRANGE', [
    end(),
  ]),
  state('UNDO', [
    end(),
  ]),
  state('REDO', [
    end(),
  ]),
  state('GO', [
    slot('DIRECTION', 'GO_DIRECTION_DONE'),
    keyword('to', 'GO_TO'),
  ]),
  state('GO_DIRECTION_DONE', [
    end(),
  ]),
  state('GO_TO', [
    slot('ROOM_REF', 'GO_TO_ROOM_DONE'),
  ]),
  state('GO_TO_ROOM_DONE', [
    end(),
  ]),
  state('SHOW', [
    slot('ROOM_REF', 'SHOW_ROOM_DONE'),
  ]),
  state('SHOW_ROOM_DONE', [
    end(),
  ]),
  state('EDIT', [
    slot('ROOM_REF', 'EDIT_ROOM_DONE'),
  ]),
  state('EDIT_ROOM_DONE', [
    end(),
  ]),
  state('DELETE', [
    slot('ROOM_REF', 'DELETE_ROOM_DONE'),
  ]),
  state('DELETE_ROOM_DONE', [
    end(),
  ]),
  state('NOTATE', [
    slot('ROOM_REF', 'NOTATE_ROOM'),
  ]),
  state('NOTATE_ROOM', [
    keyword('with', 'NOTATE_WITH'),
  ]),
  state('NOTATE_WITH', [
    end(),
  ]),
  state('ANNOTATE', [
    slot('ROOM_REF', 'ANNOTATE_ROOM'),
  ]),
  state('ANNOTATE_ROOM', [
    keyword('with', 'ANNOTATE_WITH'),
  ]),
  state('ANNOTATE_WITH', [
    end(),
  ]),
  state('PUT', [
    slot('ITEM_LIST', 'PUT_ITEMS'),
  ]),
  state('PUT_ITEMS', [
    keyword('in', 'PUT_IN'),
  ]),
  state('PUT_IN', [
    slot('ROOM_REF', 'PUT_ROOM_DONE'),
  ]),
  state('PUT_ROOM_DONE', [
    end(),
  ]),
  state('TAKE', [
    keyword('all', 'TAKE_ALL'),
    slot('ITEM', 'TAKE_ITEM'),
  ]),
  state('TAKE_ALL', [
    keyword('from', 'TAKE_ALL_FROM'),
  ]),
  state('TAKE_ALL_FROM', [
    slot('ROOM_REF', 'TAKE_ROOM_DONE'),
  ]),
  state('TAKE_ITEM', [
    keyword('from', 'TAKE_FROM'),
  ]),
  state('TAKE_FROM', [
    slot('ROOM_REF', 'TAKE_ROOM_DONE'),
  ]),
  state('TAKE_ROOM_DONE', [
    end(),
  ]),
  state('GET', [
    keyword('all', 'GET_ALL'),
    slot('ITEM', 'GET_ITEM'),
  ]),
  state('GET_ALL', [
    keyword('from', 'GET_ALL_FROM'),
  ]),
  state('GET_ALL_FROM', [
    slot('ROOM_REF', 'GET_ROOM_DONE'),
  ]),
  state('GET_ITEM', [
    keyword('from', 'GET_FROM'),
  ]),
  state('GET_FROM', [
    slot('ROOM_REF', 'GET_ROOM_DONE'),
  ]),
  state('GET_ROOM_DONE', [
    end(),
  ]),
  state('ROOM_LEAD', [
    keyword('is', 'ROOM_LEAD_IS'),
    keyword('to', 'ROOM_LEAD_TO'),
  ]),
  state('ROOM_LEAD_IS', [
    keyword('dark', 'ROOM_LIGHTING_DONE'),
    keyword('lit', 'ROOM_LIGHTING_DONE'),
  ]),
  state('ROOM_LIGHTING_DONE', [
    end(),
  ]),
  state('ROOM_LEAD_TO', [
    slot('CONNECTED_ROOM_REF', 'ROOM_TO_ROOM'),
  ]),
  state('ROOM_TO_ROOM', [
    keyword('is', 'ROOM_TO_ROOM_IS'),
  ]),
  state('ROOM_TO_ROOM_IS', [
    keyword('door', 'ROOM_TO_ROOM_ANNOTATION_DONE'),
    phrase('locked door', 'ROOM_TO_ROOM_ANNOTATION_DONE'),
    keyword('clear', 'ROOM_TO_ROOM_ANNOTATION_DONE'),
  ]),
  state('ROOM_TO_ROOM_ANNOTATION_DONE', [
    end(),
  ]),
  state('CONNECT', [
    slot('ROOM_REF', 'CONNECT_SOURCE'),
  ]),
  state('CONNECT_SOURCE', [
    slot('DIRECTION', 'CONNECT_DIRECTION'),
  ]),
  state('CONNECT_DIRECTION', [
    phrase('one-way', 'CONNECT_ONE_WAY'),
    keyword('to', 'CONNECT_TO'),
  ]),
  state('CONNECT_ONE_WAY', [
    keyword('to', 'CONNECT_TO'),
  ]),
  state('CONNECT_TO', [
    slot('ROOM_REF', 'CONNECT_TARGET_DONE'),
  ]),
  state('CONNECT_TARGET_DONE', [
    end(),
  ]),
  state('CREATE', [
    slot('NEW_ROOM_NAME', 'CREATE_NEW_ROOM'),
    keyword('and', 'CREATE_AND'),
  ]),
  state('CREATE_AND', [
    keyword('connect', 'CREATE_AND_CONNECT'),
  ]),
  state('CREATE_NEW_ROOM', [
    keyword(',', 'CREATE_NEW_ROOM_COMMA'),
    keyword('above', 'CREATE_VERTICAL'),
    keyword('below', 'CREATE_VERTICAL'),
    slot('DIRECTION', 'CREATE_DIRECTION'),
  ]),
  state('CREATE_NEW_ROOM_COMMA', [
    keyword('which', 'CREATE_NEW_ROOM_WHICH'),
  ]),
  state('CREATE_NEW_ROOM_WHICH', [
    keyword('is', 'CREATE_NEW_ROOM_WHICH_IS'),
  ]),
  state('CREATE_NEW_ROOM_WHICH_IS', [
    keyword('dark', 'CREATE_ADJECTIVE'),
    keyword('lit', 'CREATE_ADJECTIVE'),
  ]),
  state('CREATE_ADJECTIVE', [
    keyword(',', 'CREATE_AFTER_ADJECTIVE_COMMA'),
  ]),
  state('CREATE_AFTER_ADJECTIVE_COMMA', [
    slot('DIRECTION', 'CREATE_DIRECTION'),
  ]),
  state('CREATE_VERTICAL', [
    slot('ROOM_REF', 'CREATE_DONE'),
  ]),
  state('CREATE_DIRECTION', [
    keyword('of', 'CREATE_DIRECTION_OF'),
  ]),
  state('CREATE_DIRECTION_OF', [
    slot('ROOM_REF', 'CREATE_DONE'),
  ]),
  state('CREATE_DONE', [
    end(),
  ]),
  state('CREATE_AND_CONNECT', [
    slot('NEW_ROOM_NAME', 'CREATE_AND_CONNECT_NEW_ROOM'),
  ]),
  state('CREATE_AND_CONNECT_NEW_ROOM', [
    keyword(',', 'CREATE_AND_CONNECT_COMMA'),
    slot('DIRECTION', 'CREATE_AND_CONNECT_DIRECTION'),
  ]),
  state('CREATE_AND_CONNECT_COMMA', [
    keyword('which', 'CREATE_AND_CONNECT_WHICH'),
  ]),
  state('CREATE_AND_CONNECT_WHICH', [
    keyword('is', 'CREATE_AND_CONNECT_WHICH_IS'),
  ]),
  state('CREATE_AND_CONNECT_WHICH_IS', [
    keyword('dark', 'CREATE_AND_CONNECT_ADJECTIVE'),
    keyword('lit', 'CREATE_AND_CONNECT_ADJECTIVE'),
  ]),
  state('CREATE_AND_CONNECT_ADJECTIVE', [
    keyword(',', 'CREATE_AND_CONNECT_AFTER_ADJECTIVE_COMMA'),
  ]),
  state('CREATE_AND_CONNECT_AFTER_ADJECTIVE_COMMA', [
    slot('DIRECTION', 'CREATE_AND_CONNECT_DIRECTION'),
  ]),
  state('CREATE_AND_CONNECT_DIRECTION', [
    phrase('one-way', 'CREATE_AND_CONNECT_ONE_WAY'),
    keyword('to', 'CREATE_AND_CONNECT_TO'),
  ]),
  state('CREATE_AND_CONNECT_ONE_WAY', [
    keyword('to', 'CREATE_AND_CONNECT_TO'),
  ]),
  state('CREATE_AND_CONNECT_TO', [
    slot('ROOM_REF', 'CREATE_AND_CONNECT_TARGET_DONE'),
  ]),
  state('CREATE_AND_CONNECT_TARGET_DONE', [
    end(),
  ]),
  state('DIRECTION_LEAD', [
    keyword('of', 'DIRECTION_OF'),
  ]),
  state('DIRECTION_OF', [
    slot('ROOM_REF', 'DIRECTION_OF_ROOM'),
  ]),
  state('DIRECTION_OF_ROOM', [
    keyword('is', 'PSEUDO_IS'),
    keyword('goes', 'PSEUDO_GOES'),
    keyword('leads', 'PSEUDO_LEADS'),
    keyword('lies', 'PSEUDO_LIES'),
  ]),
  state('ABOVE_LEAD', [
    slot('ROOM_REF', 'ABOVE_ROOM'),
  ]),
  state('ABOVE_ROOM', [
    keyword('is', 'PSEUDO_IS'),
    keyword('goes', 'PSEUDO_GOES'),
    keyword('leads', 'PSEUDO_LEADS'),
    keyword('lies', 'PSEUDO_LIES'),
  ]),
  state('BELOW_LEAD', [
    slot('ROOM_REF', 'BELOW_ROOM'),
  ]),
  state('BELOW_ROOM', [
    keyword('is', 'PSEUDO_IS'),
    keyword('goes', 'PSEUDO_GOES'),
    keyword('leads', 'PSEUDO_LEADS'),
    keyword('lies', 'PSEUDO_LIES'),
  ]),
  state('THE_ROOM', [
    slot('DIRECTION', 'THE_ROOM_DIRECTION'),
    keyword('above', 'THE_ROOM_VERTICAL'),
    keyword('below', 'THE_ROOM_VERTICAL'),
  ]),
  state('THE_ROOM_DIRECTION', [
    keyword('of', 'THE_ROOM_OF'),
  ]),
  state('THE_ROOM_OF', [
    slot('ROOM_REF', 'THE_ROOM_OF_ROOM'),
  ]),
  state('THE_ROOM_OF_ROOM', [
    keyword('is', 'PSEUDO_IS'),
  ]),
  state('THE_ROOM_VERTICAL', [
    slot('ROOM_REF', 'THE_ROOM_VERTICAL_ROOM'),
  ]),
  state('THE_ROOM_VERTICAL_ROOM', [
    keyword('is', 'PSEUDO_IS'),
  ]),
  state('THE_WAY', [
    slot('DIRECTION', 'THE_WAY_DIRECTION'),
    keyword('above', 'THE_WAY_VERTICAL'),
    keyword('below', 'THE_WAY_VERTICAL'),
  ]),
  state('THE_WAY_DIRECTION', [
    keyword('of', 'THE_WAY_OF'),
  ]),
  state('THE_WAY_OF', [
    slot('ROOM_REF', 'THE_WAY_OF_ROOM'),
  ]),
  state('THE_WAY_OF_ROOM', [
    keyword('goes', 'PSEUDO_GOES'),
    keyword('leads', 'PSEUDO_LEADS'),
    keyword('lies', 'PSEUDO_LIES'),
  ]),
  state('THE_WAY_VERTICAL', [
    slot('ROOM_REF', 'THE_WAY_VERTICAL_ROOM'),
  ]),
  state('THE_WAY_VERTICAL_ROOM', [
    keyword('goes', 'PSEUDO_GOES'),
    keyword('leads', 'PSEUDO_LEADS'),
    keyword('lies', 'PSEUDO_LIES'),
  ]),
  state('PSEUDO_IS', [
    keyword('unknown', 'PSEUDO_DONE'),
  ]),
  state('PSEUDO_GOES', [
    keyword('on', 'PSEUDO_GOES_ON'),
  ]),
  state('PSEUDO_GOES_ON', [
    keyword('forever', 'PSEUDO_DONE'),
  ]),
  state('PSEUDO_LEADS', [
    keyword('nowhere', 'PSEUDO_DONE'),
  ]),
  state('PSEUDO_LIES', [
    keyword('death', 'PSEUDO_DONE'),
  ]),
  state('PSEUDO_DONE', [
    end(),
  ]),
] as const satisfies readonly CliSuggestionGrammarState[];

export const CLI_SUGGESTION_GRAMMAR_STATES = cliSuggestionGrammarStates;

export const CLI_SUGGESTION_GRAMMAR = new Map(
  cliSuggestionGrammarStates.map((grammarState) => [grammarState.id, grammarState] as const),
);

export function getCliSuggestionGrammarState(stateId: string): CliSuggestionGrammarState | null {
  return CLI_SUGGESTION_GRAMMAR.get(stateId) ?? null;
}

export function listCliSuggestionGrammarStateIds(): readonly string[] {
  return cliSuggestionGrammarStates.map((grammarState) => grammarState.id);
}

export function getCliSuggestionGrammarTransitionTargets(stateId: string): readonly string[] {
  const grammarState = getCliSuggestionGrammarState(stateId);
  if (grammarState === null) {
    return [];
  }

  return grammarState.nextSymbols
    .flatMap((symbol) => ('nextStateId' in symbol ? [symbol.nextStateId] : []));
}

export function describeCliSuggestionGrammarSymbols(stateId: string): readonly string[] {
  const grammarState = getCliSuggestionGrammarState(stateId);
  if (grammarState === null) {
    return [];
  }

  return grammarState.nextSymbols.map((symbol) => {
    switch (symbol.kind) {
      case 'keyword':
      case 'phrase':
        return symbol.text;
      case 'slot':
        return `<${symbol.slotType.toLowerCase()}>`;
      case 'end':
        return '<end>';
    }
  });
}
