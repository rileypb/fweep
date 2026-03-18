import {
  getCliSuggestionGrammarState,
  type CliSuggestionGrammarState,
  type CliSuggestionGrammarSymbol,
} from './cli-suggestion-grammar';
import { isDirectionLikePrefix } from './cli-suggestion-grammar-helpers';

export interface CliSuggestionParseToken {
  readonly text: string;
  readonly normalizedText: string;
}

export interface CliSuggestionParseState {
  readonly stateId: string;
  readonly consumedSymbols: readonly string[];
  readonly nextSymbols: readonly CliSuggestionGrammarSymbol[];
}

export interface CliSuggestionParseResult {
  readonly input: string;
  readonly tokens: readonly CliSuggestionParseToken[];
  readonly states: readonly CliSuggestionParseState[];
}

export interface CliSuggestionNextSymbol {
  readonly key: string;
  readonly symbol: CliSuggestionGrammarSymbol;
  readonly sourceStateIds: readonly string[];
}

interface ParseCandidate {
  readonly stateId: string;
  readonly consumedSymbols: readonly string[];
  readonly pendingSymbol: Extract<CliSuggestionGrammarSymbol, { kind: 'keyword' | 'phrase' }> | null;
  readonly remainingSymbolWords: readonly string[];
}

function tokenizeSuggestionInput(input: string): readonly CliSuggestionParseToken[] {
  return Array.from(input.matchAll(/,|[^\s,"]+/g))
    .map((match) => match[0] ?? '')
    .filter((text) => text.length > 0)
    .map((text) => ({
      text,
      normalizedText: text.toLowerCase(),
    }));
}

function createParseState(candidate: ParseCandidate): CliSuggestionParseState | null {
  const grammarState = getCliSuggestionGrammarState(candidate.stateId);
  if (grammarState === null) {
    return null;
  }

  return {
    stateId: candidate.stateId,
    consumedSymbols: candidate.consumedSymbols,
    nextSymbols: grammarState.nextSymbols,
  };
}

function isPrefixMatch(token: CliSuggestionParseToken, text: string): boolean {
  return text.toLowerCase().startsWith(token.normalizedText);
}

function matchKeywordLikeSymbol(
  token: CliSuggestionParseToken,
  symbol: Extract<CliSuggestionGrammarSymbol, { kind: 'keyword' | 'phrase' }>,
): boolean {
  return isPrefixMatch(token, symbol.text);
}

function matchSlotSymbol(
  token: CliSuggestionParseToken,
  grammarState: CliSuggestionGrammarState,
  symbol: Extract<CliSuggestionGrammarSymbol, { kind: 'slot' }>,
): boolean {
  if (token.normalizedText.length === 0) {
    return false;
  }

  if (grammarState.id === 'ROOT') {
    if (symbol.slotType === 'DIRECTION') {
      return isDirectionLikePrefix(token.normalizedText);
    }

    if (symbol.slotType === 'ROOM_REF') {
      const rootState = getCliSuggestionGrammarState('ROOT');
      const rootKeywords = new Set(
        (rootState?.nextSymbols ?? [])
          .filter((nextSymbol): nextSymbol is Extract<CliSuggestionGrammarSymbol, { kind: 'keyword' }> => nextSymbol.kind === 'keyword')
          .map((nextSymbol) => nextSymbol.text),
      );
      return !rootKeywords.has(token.normalizedText) && !isDirectionLikePrefix(token.normalizedText);
    }

    return false;
  }

  if (symbol.slotType === 'DIRECTION') {
    return isDirectionLikePrefix(token.normalizedText);
  }

  if (symbol.slotType === 'HELP_TOPIC') {
    return true;
  }

  if (symbol.slotType === 'ITEM' || symbol.slotType === 'ITEM_LIST') {
    return true;
  }

  return true;
}

function consumeToken(
  candidate: ParseCandidate,
  token: CliSuggestionParseToken,
): readonly ParseCandidate[] {
  if (candidate.pendingSymbol !== null) {
    const [nextWord, ...remainingWords] = candidate.remainingSymbolWords;
    if (nextWord === undefined || !isPrefixMatch(token, nextWord)) {
      return [];
    }

    if (remainingWords.length === 0) {
      return [{
        stateId: candidate.pendingSymbol.nextStateId,
        consumedSymbols: [...candidate.consumedSymbols, candidate.pendingSymbol.text],
        pendingSymbol: null,
        remainingSymbolWords: [],
      }];
    }

    return [{
      stateId: candidate.stateId,
      consumedSymbols: candidate.consumedSymbols,
      pendingSymbol: candidate.pendingSymbol,
      remainingSymbolWords: remainingWords,
    }];
  }

  const grammarState = getCliSuggestionGrammarState(candidate.stateId);
  if (grammarState === null) {
    return [];
  }

  const nextCandidates: ParseCandidate[] = [];

  for (const symbol of grammarState.nextSymbols) {
    if (symbol.kind === 'end') {
      continue;
    }

    if (symbol.kind === 'keyword' || symbol.kind === 'phrase') {
      const symbolWords = symbol.text.toLowerCase().split(/\s+/);
      const [firstWord, ...remainingWords] = symbolWords;
      if (firstWord === undefined || !isPrefixMatch(token, firstWord)) {
        continue;
      }

      if (remainingWords.length > 0) {
        nextCandidates.push({
          stateId: candidate.stateId,
          consumedSymbols: candidate.consumedSymbols,
          pendingSymbol: symbol,
          remainingSymbolWords: remainingWords,
        });
        continue;
      }

      nextCandidates.push({
        stateId: symbol.nextStateId,
        consumedSymbols: [...candidate.consumedSymbols, symbol.text],
        pendingSymbol: null,
        remainingSymbolWords: [],
      });
      continue;
    }

    if (symbol.kind === 'slot' && matchSlotSymbol(token, grammarState, symbol)) {
      nextCandidates.push({
        stateId: symbol.nextStateId,
        consumedSymbols: [...candidate.consumedSymbols, `<${symbol.slotType}>`],
        pendingSymbol: null,
        remainingSymbolWords: [],
      });
    }
  }

  return nextCandidates;
}

function dedupeCandidates(candidates: readonly ParseCandidate[]): readonly ParseCandidate[] {
  const seen = new Set<string>();
  const unique: ParseCandidate[] = [];

  for (const candidate of candidates) {
    const key = [
      candidate.stateId,
      candidate.consumedSymbols.join('|'),
      candidate.pendingSymbol?.text ?? '',
      candidate.remainingSymbolWords.join('|'),
    ].join('::');
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(candidate);
  }

  return unique;
}

export function parseCliSuggestionInput(input: string): CliSuggestionParseResult {
  const tokens = tokenizeSuggestionInput(input);

  let candidates: readonly ParseCandidate[] = [{
    stateId: 'ROOT',
    consumedSymbols: [],
    pendingSymbol: null,
    remainingSymbolWords: [],
  }];
  for (const token of tokens) {
    candidates = dedupeCandidates(candidates.flatMap((candidate) => consumeToken(candidate, token)));
    if (candidates.length === 0) {
      break;
    }
  }

  const states = candidates
    .map(createParseState)
    .filter((state): state is CliSuggestionParseState => state !== null);

  return {
    input,
    tokens,
    states,
  };
}

export function describeCliSuggestionParseStates(input: string): readonly string[] {
  return parseCliSuggestionInput(input).states.map((state) => {
    const nextDescriptions = state.nextSymbols.map((symbol) => {
      switch (symbol.kind) {
        case 'keyword':
        case 'phrase':
          return symbol.text;
        case 'slot':
          return `<${symbol.slotType}>`;
        case 'end':
          return '<end>';
      }
    });

    return `${state.stateId}: ${nextDescriptions.join(', ')}`;
  });
}

function getSymbolKey(symbol: CliSuggestionGrammarSymbol): string {
  switch (symbol.kind) {
    case 'keyword':
      return `keyword:${symbol.text}`;
    case 'phrase':
      return `phrase:${symbol.text}`;
    case 'slot':
      return `slot:${symbol.slotType}`;
    case 'end':
      return 'end';
  }
}

export function listCliSuggestionNextSymbols(input: string): readonly CliSuggestionNextSymbol[] {
  const parseResult = parseCliSuggestionInput(input);
  const nextSymbols = new Map<string, CliSuggestionNextSymbol>();

  for (const parseState of parseResult.states) {
    for (const symbol of parseState.nextSymbols) {
      const key = getSymbolKey(symbol);
      const existing = nextSymbols.get(key);
      if (existing) {
        nextSymbols.set(key, {
          ...existing,
          sourceStateIds: [...existing.sourceStateIds, parseState.stateId],
        });
        continue;
      }

      nextSymbols.set(key, {
        key,
        symbol,
        sourceStateIds: [parseState.stateId],
      });
    }
  }

  return [...nextSymbols.values()];
}

export function describeCliSuggestionNextSymbols(input: string): readonly string[] {
  return listCliSuggestionNextSymbols(input).map(({ symbol, sourceStateIds }) => {
    let description: string;
    switch (symbol.kind) {
      case 'keyword':
      case 'phrase':
        description = symbol.text;
        break;
      case 'slot':
        description = `<${symbol.slotType}>`;
        break;
      case 'end':
        description = '<end>';
        break;
    }

    return `${description} <- ${sourceStateIds.join(',')}`;
  });
}
