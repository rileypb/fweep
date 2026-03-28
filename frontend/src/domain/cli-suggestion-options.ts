import { CLI_COMMAND_SUGGESTION_SPECS, parseCliCommandDescription } from './cli-command';
import { CLI_DIRECTIONS } from './directions';
import { getCliHelpTopics } from './cli-help';
import { getCliSuggestionGrammarState } from './cli-suggestion-grammar';
import type { CliSuggestion } from './cli-suggestion-types';
import type { MapDocument } from './map-types';

function startsWithNormalized(value: string, prefix: string): boolean {
  return value.toLowerCase().startsWith(prefix.toLowerCase());
}

function createCommandSuggestion(commandId: string, insertText: string, descriptionInput: string): CliSuggestion {
  return {
    id: `cli-suggestion-command-${commandId}`,
    kind: 'command',
    label: insertText,
    insertText,
    detail: parseCliCommandDescription(descriptionInput),
  };
}

function getSuggestedCommandInsertText(spec: typeof CLI_COMMAND_SUGGESTION_SPECS[number], normalizedPrefix: string): string {
  const canonicalInsertText = spec.insertText;
  if (canonicalInsertText.startsWith(normalizedPrefix)) {
    return canonicalInsertText;
  }

  const matchingAlias = spec.matchTerms.find((term) => term.startsWith(normalizedPrefix));
  return matchingAlias ?? canonicalInsertText;
}

export function createKeywordSuggestions(prefix: string, values: readonly string[]): readonly CliSuggestion[] {
  const normalizedPrefix = prefix.toLowerCase();
  return values
    .filter((value) => normalizedPrefix.length === 0 || value.toLowerCase().startsWith(normalizedPrefix))
    .map((value) => ({
      id: `cli-suggestion-keyword-${value.replace(/\s+/g, '-')}`,
      kind: 'command' as const,
      label: value,
      insertText: value,
      detail: null,
    }));
}

export function createTerminalKeywordSuggestions(prefix: string, values: readonly string[]): readonly CliSuggestion[] {
  const normalizedPrefix = prefix.toLowerCase();
  if (values.some((value) => value.toLowerCase() === normalizedPrefix)) {
    return [];
  }

  return createKeywordSuggestions(prefix, values);
}

export function createPlaceholderSuggestion(label: string): readonly CliSuggestion[] {
  return [{
    id: `cli-suggestion-placeholder-${label.replace(/[^\w]+/g, '-').toLowerCase()}`,
    kind: 'placeholder',
    label,
    insertText: '',
    detail: null,
  }];
}

export function createCommandSuggestions(prefix: string): readonly CliSuggestion[] {
  const normalizedPrefix = prefix.toLowerCase();
  const prefixHasWhitespace = /\s/.test(normalizedPrefix);

  return CLI_COMMAND_SUGGESTION_SPECS
    .filter((spec) => {
      return spec.matchTerms.some((term) => {
        if (!prefixHasWhitespace && /\s/.test(term)) {
          return spec.insertText.startsWith(normalizedPrefix);
        }

        return term.startsWith(normalizedPrefix);
      });
    })
    .map((spec) => ({
      spec,
      suggestedInsertText: getSuggestedCommandInsertText(spec, normalizedPrefix),
    }))
    .sort((left, right) => {
      const leftExact = left.suggestedInsertText.startsWith(normalizedPrefix) ? 0 : 1;
      const rightExact = right.suggestedInsertText.startsWith(normalizedPrefix) ? 0 : 1;
      if (leftExact !== rightExact) {
        return leftExact - rightExact;
      }

      if (left.suggestedInsertText.length !== right.suggestedInsertText.length) {
        return left.suggestedInsertText.length - right.suggestedInsertText.length;
      }

      return left.suggestedInsertText.localeCompare(right.suggestedInsertText);
    })
    .map(({ spec, suggestedInsertText }) => createCommandSuggestion(spec.id, suggestedInsertText, spec.descriptionInput));
}

export function createDefaultSuggestions(doc: MapDocument | null): readonly CliSuggestion[] {
  const rootGrammarState = getCliSuggestionGrammarState('ROOT');
  const seenRootKeywords = new Set<string>();
  const hiddenRootKeywords = new Set(['get', 'notate']);
  const commandSuggestions = (rootGrammarState?.nextSymbols ?? [])
    .flatMap((symbol) => {
      if (symbol.kind !== 'keyword' && symbol.kind !== 'phrase') {
        return [];
      }

      const rootKeyword = symbol.text.split(/\s+/)[0] ?? '';
      if (rootKeyword.length === 0 || hiddenRootKeywords.has(rootKeyword) || seenRootKeywords.has(rootKeyword)) {
        return [];
      }
      seenRootKeywords.add(rootKeyword);

      const matchingSpec = CLI_COMMAND_SUGGESTION_SPECS.find((spec) => spec.insertText === rootKeyword) ?? null;
      if (matchingSpec !== null) {
        return [createCommandSuggestion(matchingSpec.id, matchingSpec.insertText, matchingSpec.descriptionInput)];
      }

      return [{
        id: `cli-suggestion-command-${rootKeyword.replace(/\s+/g, '-')}`,
        kind: 'command' as const,
        label: rootKeyword,
        insertText: rootKeyword,
        detail: null,
      }];
    });

  const missingCommandSuggestions = CLI_COMMAND_SUGGESTION_SPECS
    .filter((spec) => !hiddenRootKeywords.has(spec.insertText) && !seenRootKeywords.has(spec.insertText))
    .map((spec) => createCommandSuggestion(spec.id, spec.insertText, spec.descriptionInput));

  const directionSuggestions = createPlaceholderSuggestion('<direction>');

  const roomSuggestions = doc === null ? [] : createPlaceholderSuggestion('<room>');

  return [...commandSuggestions, ...missingCommandSuggestions, ...directionSuggestions, ...roomSuggestions];
}

export function createDirectionSuggestions(prefix: string): readonly CliSuggestion[] {
  const normalizedPrefix = prefix.toLowerCase();
  return CLI_DIRECTIONS
    .filter((direction) => startsWithNormalized(direction, normalizedPrefix) || startsWithNormalized(direction[0] ?? '', normalizedPrefix))
    .sort((left, right) => left.localeCompare(right))
    .map((direction) => ({
      id: `cli-suggestion-direction-${direction}`,
      kind: 'direction' as const,
      label: direction,
      insertText: direction,
      detail: 'Direction',
    }));
}

export function createConnectionAnnotationSuggestions(prefix: string): readonly CliSuggestion[] {
  return createTerminalKeywordSuggestions(prefix, ['door', 'locked door', 'clear']);
}

export function createHelpTopicSuggestions(prefix: string): readonly CliSuggestion[] {
  const normalizedPrefix = prefix.toLowerCase();
  return getCliHelpTopics()
    .filter((topic) => topic.startsWith(normalizedPrefix))
    .map((topic) => ({
      id: `cli-suggestion-help-${topic}`,
      kind: 'help-topic' as const,
      label: topic,
      insertText: topic,
      detail: 'Help topic',
    }));
}
