import { describe, expect, it } from '@jest/globals';
import {
  createCommandSuggestions,
  createConnectionAnnotationSuggestions,
  createDefaultSuggestions,
  createDirectionSuggestions,
  createHelpTopicSuggestions,
  createKeywordSuggestions,
  createPlaceholderSuggestion,
  createTerminalKeywordSuggestions,
} from '../../src/domain/cli-suggestion-options';
import { addRoom } from '../../src/domain/map-operations';
import { createEmptyMap, createRoom } from '../../src/domain/map-types';

describe('cli suggestion options', () => {
  it('creates keyword, terminal-keyword, and placeholder suggestions', () => {
    expect(createKeywordSuggestions('d', ['dark', 'lit']).map((suggestion) => suggestion.label)).toEqual(['dark']);
    expect(createTerminalKeywordSuggestions('dark', ['dark', 'lit'])).toEqual([]);
    expect(createPlaceholderSuggestion('<room>')).toEqual([
      {
        id: 'cli-suggestion-placeholder--room-',
        kind: 'placeholder',
        label: '<room>',
        insertText: '',
        detail: null,
      },
    ]);
  });

  it('prefers canonical or matching alias command insert text appropriately', () => {
    expect(createCommandSuggestions('go').map((suggestion) => suggestion.label)).toContain('go');
    expect(createCommandSuggestions('g').map((suggestion) => suggestion.label)).toContain('get');
    expect(createCommandSuggestions('go').map((suggestion) => suggestion.label)).not.toContain('show');
    expect(createCommandSuggestions('go t').map((suggestion) => suggestion.label)).toContain('go to');
  });

  it('creates direction and connection annotation suggestions', () => {
    expect(createDirectionSuggestions('n').map((suggestion) => suggestion.label)).toEqual(
      expect.arrayContaining(['north', 'northeast', 'northwest']),
    );
    expect(createDirectionSuggestions('').map((suggestion) => suggestion.label)).not.toEqual(
      expect.arrayContaining(['in', 'out']),
    );
    expect(createConnectionAnnotationSuggestions('l').map((suggestion) => suggestion.label)).toEqual(['locked door']);
  });

  it('creates default suggestions from the root grammar plus room placeholder', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Cellar'), position: { x: 0, y: 0 } });

    const labels = createDefaultSuggestions(doc).map((suggestion) => suggestion.label);
    expect(labels).toEqual(expect.arrayContaining(['create', 'connect', 'the', 'above', 'below', '<direction>', '<room>']));
    expect(labels).not.toContain('get');
    expect(labels).not.toContain('notate');
    expect(labels).not.toContain('north');
  });

  it('filters help-topic suggestions by prefix', () => {
    expect(createHelpTopicSuggestions('ro').map((suggestion) => suggestion.label)).toContain('rooms');
    expect(createHelpTopicSuggestions('zzz')).toEqual([]);
  });
});
