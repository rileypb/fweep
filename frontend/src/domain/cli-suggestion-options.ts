import { CLI_COMMAND_SUGGESTION_SPECS, parseCliCommandDescription } from './cli-command';
import { STANDARD_DIRECTIONS } from './directions';
import { getCliHelpTopics } from './cli-help';
import type { CliSuggestion } from './cli-suggestion-types';
import type { MapDocument } from './map-types';

const DEFAULT_COMMAND_IDS = ['create', 'connect', 'show', 'edit', 'arrange', 'help'] as const;
const DEFAULT_DIRECTIONS = ['north', 'south', 'east', 'west'] as const;

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

  return CLI_COMMAND_SUGGESTION_SPECS
    .filter((spec) => {
      if (normalizedPrefix === 'e' && spec.id === 'edit') {
        return false;
      }
      if (normalizedPrefix === 's' && spec.id === 'show') {
        return false;
      }
      return spec.matchTerms.some((term) => term.startsWith(normalizedPrefix));
    })
    .sort((left, right) => {
      const leftExact = left.insertText.startsWith(normalizedPrefix) ? 0 : 1;
      const rightExact = right.insertText.startsWith(normalizedPrefix) ? 0 : 1;
      if (leftExact !== rightExact) {
        return leftExact - rightExact;
      }

      if (left.insertText.length !== right.insertText.length) {
        return left.insertText.length - right.insertText.length;
      }

      return left.insertText.localeCompare(right.insertText);
    })
    .map((spec) => createCommandSuggestion(spec.id, spec.insertText, spec.descriptionInput));
}

export function createDefaultSuggestions(doc: MapDocument | null): readonly CliSuggestion[] {
  const commandSuggestions = DEFAULT_COMMAND_IDS
    .map((commandId) => CLI_COMMAND_SUGGESTION_SPECS.find((spec) => spec.id === commandId) ?? null)
    .filter((spec): spec is NonNullable<typeof spec> => spec !== null)
    .map((spec) => createCommandSuggestion(spec.id, spec.insertText, spec.descriptionInput));

  const directionSuggestions = DEFAULT_DIRECTIONS.map((direction) => ({
    id: `cli-suggestion-direction-${direction}`,
    kind: 'direction' as const,
    label: direction,
    insertText: direction,
    detail: 'Direction',
  }));

  const roomSuggestions = doc === null ? [] : createPlaceholderSuggestion('<room>');

  return [...commandSuggestions, ...directionSuggestions, ...roomSuggestions];
}

export function createDirectionSuggestions(prefix: string): readonly CliSuggestion[] {
  const normalizedPrefix = prefix.toLowerCase();
  return STANDARD_DIRECTIONS
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
