import { describe, expect, it, jest } from '@jest/globals';
import { addRoom } from '../../src/domain/map-operations';
import { createEmptyMap, createRoom } from '../../src/domain/map-types';
import {
  getParserBackedDisconnectResolution,
  getParserBackedGoResolution,
  getParserBackedHelpTopicResolution,
  getParserBackedNotateResolution,
  getParserBackedSingleRoomCommandResolution,
} from '../../src/domain/cli-suggestion-command-helpers';
import {
  createCreateWhichIsSuggestions,
  getCreateAndConnectIntroResolution,
  getCreateCommandResolution,
  hasCompletedCreateAdjectivePhrase,
} from '../../src/domain/cli-suggestion-create-helpers';
import { getActiveFragment } from '../../src/domain/cli-suggestion-fragments';
import { mergeSuggestions } from '../../src/domain/cli-suggestion-grammar-helpers';
import { createPlaceholderSuggestion } from '../../src/domain/cli-suggestion-options';
import { getRoomLeadResolution } from '../../src/domain/cli-suggestion-room-lead-helpers';
import type { ActiveFragment, CliSuggestion, SuggestionResolution, Token } from '../../src/domain/cli-suggestion-types';

const roomSlotSuggestionHelpers = {
  createPlaceholderSuggestion,
  mergeSuggestions,
};

function createToken(value: string): Token {
  return {
    value,
    start: 0,
    end: value.length,
    quoted: false,
  };
}

function createFragment(options: Partial<ActiveFragment> & Pick<ActiveFragment, 'prefix' | 'tokenIndex' | 'precedingTokens'>): ActiveFragment {
  return {
    ...options,
    start: 0,
    end: options.prefix.length,
    caret: options.prefix.length,
    prefix: options.prefix,
    normalizedPrefix: options.prefix.toLowerCase(),
    tokenIndex: options.tokenIndex,
    precedingTokens: options.precedingTokens,
    quoted: false,
    quoteClosed: true,
  };
}

describe('CLI suggestion helper resolutions', () => {
  describe('command helpers', () => {
    it('returns null or empty suggestions for non-matching parser-backed command contexts', () => {
      const helpFragment = createFragment({
        prefix: '',
        tokenIndex: 1,
        precedingTokens: [createToken('zoom')],
      });
      const goFragment = createFragment({
        prefix: '',
        tokenIndex: 2,
        precedingTokens: [createToken('go'), createToken('north')],
      });
      const singleRoomFragment = createFragment({
        prefix: '',
        tokenIndex: 2,
        precedingTokens: [createToken('zoom'), createToken('cellar')],
      });
      const notateFragment = createFragment({
        prefix: '',
        tokenIndex: 2,
        precedingTokens: [createToken('zoom'), createToken('cellar')],
      });

      expect(getParserBackedHelpTopicResolution(helpFragment)).toBeNull();
      expect(getParserBackedGoResolution('', goFragment, null, roomSlotSuggestionHelpers)).toBeNull();
      expect(getParserBackedSingleRoomCommandResolution('', singleRoomFragment, null, 1, roomSlotSuggestionHelpers))
        .toEqual({ suggestions: [] });
      expect(getParserBackedNotateResolution('', notateFragment, null, roomSlotSuggestionHelpers))
        .toEqual({ suggestions: [] });
    });

    it('suggests from or closes suggestions in disconnect edge cases', () => {
      const partialFromFragment = createFragment({
        prefix: 'f',
        tokenIndex: 2,
        precedingTokens: [createToken('disconnect'), createToken('north')],
      });

      expect(getParserBackedDisconnectResolution('', partialFromFragment, null, roomSlotSuggestionHelpers).suggestions.map((suggestion) => suggestion.label))
        .toEqual(['from']);
    });
  });

  describe('room-lead helpers', () => {
    it('covers parser-backed and fallback room-lead edge cases', () => {
      let doc = createEmptyMap('Test');
      doc = addRoom(doc, { ...createRoom('Cellar'), position: { x: 0, y: 0 } });
      doc = addRoom(doc, { ...createRoom('Kitchen'), position: { x: 40, y: 0 } });

      const connectAnnotationFragment = getActiveFragment('kitchen to cellar is ', 'kitchen to cellar is '.length)!;
      const malformedPseudoFragment = createFragment({
        prefix: '',
        tokenIndex: 6,
        precedingTokens: [createToken('the'), createToken('room'), createToken('north'), createToken('to'), createToken('cellar'), createToken('is')],
      });
      const darkFragment = createFragment({
        prefix: '',
        tokenIndex: 3,
        precedingTokens: [createToken('kitchen'), createToken('is'), createToken('dark')],
      });
      const pseudoToFragment = createFragment({
        prefix: '',
        tokenIndex: 2,
        precedingTokens: [createToken('north'), createToken('to')],
      });
      const blockedSelectedRoomFragment = createFragment({
        prefix: 'x',
        tokenIndex: 1,
        precedingTokens: [createToken('north')],
      });

      expect(
        getRoomLeadResolution(
          'kitchen to cellar is ',
          connectAnnotationFragment,
          doc,
          ['kitchen', 'to', 'cellar', 'is'],
          'is',
          roomSlotSuggestionHelpers,
        )?.suggestions.map((suggestion) => suggestion.label),
      ).toEqual(expect.arrayContaining(['clear', 'door', 'locked door']));
      expect(getRoomLeadResolution('', malformedPseudoFragment, doc, ['the', 'room', 'north', 'to', 'cellar', 'is'], 'is', roomSlotSuggestionHelpers))
        .toEqual({ suggestions: [] });
      expect(getRoomLeadResolution('', darkFragment, doc, ['kitchen', 'is', 'dark'], 'dark', roomSlotSuggestionHelpers))
        .toEqual({ suggestions: [] });
      expect(getRoomLeadResolution('', pseudoToFragment, doc, ['north', 'to'], 'to', roomSlotSuggestionHelpers))
        .toEqual({ suggestions: [] });
      expect(getRoomLeadResolution('', blockedSelectedRoomFragment, doc, ['north'], 'north', roomSlotSuggestionHelpers)).toBeNull();
    });
  });

  describe('create helpers', () => {
    it('covers small exported create helper branches', () => {
      expect(createCreateWhichIsSuggestions('z')).toEqual([]);
      expect(hasCompletedCreateAdjectivePhrase(['create', 'kitchen', 'which', 'is', 'dark'])).toBe(true);
      expect(hasCompletedCreateAdjectivePhrase(['create', 'kitchen', 'which', 'is'])).toBe(false);
    });

    it('covers create command routing branches and completed adjective guards', () => {
      const delegateResolution = { suggestions: [{ id: 'delegated', kind: 'command', label: 'delegated', insertText: 'delegated', detail: null }] satisfies CliSuggestion[] } as unknown as SuggestionResolution;
      const getSuggestionsForCommandContext = jest.fn<(input: string, fragment: ActiveFragment, doc: ReturnType<typeof createEmptyMap> | null) => SuggestionResolution>()
        .mockReturnValue({ suggestions: [{ id: 'connect-tail', kind: 'command', label: 'connect-tail', insertText: 'connect-tail', detail: null }] });
      const dependencies = {
        roomSlotSuggestionHelpers,
        getParserBackedCreateContinuationSuggestions: jest.fn<(input: string, fragment: ActiveFragment, options?: { readonly disallowNewRoomContinuation?: boolean }) => readonly CliSuggestion[] | null>()
          .mockReturnValue(null),
        getParserBackedConnectTailResolution: jest.fn<(fragment: ActiveFragment, canonicalLastDirection: string | null) => SuggestionResolution | null>()
          .mockReturnValue(null),
        getSuggestionsForCommandContext,
      };
      const completedWhichFragment = createFragment({
        prefix: '',
        tokenIndex: 5,
        precedingTokens: [createToken('create'), createToken('kitchen'), createToken('which'), createToken('is'), createToken('dark'), createToken('which')],
      });
      const completedWhichIsFragment = createFragment({
        prefix: '',
        tokenIndex: 6,
        precedingTokens: [createToken('create'), createToken('kitchen'), createToken('which'), createToken('is'), createToken('dark'), createToken('which'), createToken('is')],
      });

      expect(
        getCreateCommandResolution(
          'create and ',
          createFragment({ prefix: '', tokenIndex: 2, precedingTokens: [createToken('create'), createToken('and')] }),
          null,
          ['create', 'and'],
          'and',
          null,
          dependencies,
        ).suggestions.map((suggestion) => suggestion.label),
      ).toEqual(['connect']);

      getCreateCommandResolution(
        'create and connect ',
        createFragment({
          prefix: '',
          tokenIndex: 3,
          precedingTokens: [createToken('create'), createToken('and'), createToken('connect')],
        }),
        null,
        ['create', 'and', 'connect'],
        'connect',
        null,
        dependencies,
      );
      expect(getSuggestionsForCommandContext).toHaveBeenCalled();

      expect(
        getCreateCommandResolution(
          'create kitchen which ',
          completedWhichFragment,
          null,
          ['create', 'kitchen', 'which', 'is', 'dark', 'which'],
          'which',
          null,
          dependencies,
        ),
      ).toEqual({ suggestions: [] });
      expect(
        getCreateCommandResolution(
          'create kitchen which is ',
          completedWhichIsFragment,
          null,
          ['create', 'kitchen', 'which', 'is', 'dark', 'which', 'is'],
          'is',
          null,
          dependencies,
        ),
      ).toEqual({ suggestions: [] });

      const continuationDependencies = {
        ...dependencies,
        getParserBackedCreateContinuationSuggestions: jest.fn<(input: string, fragment: ActiveFragment, options?: { readonly disallowNewRoomContinuation?: boolean }) => readonly CliSuggestion[] | null>()
          .mockReturnValue([{ id: 'parser-create', kind: 'command', label: 'parser-create', insertText: 'parser-create', detail: null }]),
      };
      expect(
        getCreateCommandResolution(
          'create kitchen ',
          createFragment({ prefix: '', tokenIndex: 2, precedingTokens: [createToken('create'), createToken('kitchen')] }),
          null,
          ['create', 'kitchen'],
          'kitchen',
          null,
          continuationDependencies,
        ).suggestions.map((suggestion) => suggestion.label),
      ).toEqual(['<new room name>', 'parser-create']);
    });

    it('covers create-and-connect edge branches', () => {
      let doc = createEmptyMap('Test');
      doc = addRoom(doc, { ...createRoom('Cellar'), position: { x: 0, y: 0 } });

      const baseDependencies = {
        roomSlotSuggestionHelpers,
        getParserBackedCreateContinuationSuggestions: jest.fn<(input: string, fragment: ActiveFragment, options?: { readonly disallowNewRoomContinuation?: boolean }) => readonly CliSuggestion[] | null>()
          .mockReturnValue(null),
        getParserBackedConnectTailResolution: jest.fn<(fragment: ActiveFragment, canonicalLastDirection: string | null) => SuggestionResolution | null>()
          .mockReturnValue(null),
        getSuggestionsForCommandContext: jest.fn<(input: string, fragment: ActiveFragment, doc: ReturnType<typeof createEmptyMap> | null) => SuggestionResolution>()
          .mockReturnValue({ suggestions: [] }),
      };

      expect(
        getCreateAndConnectIntroResolution(
          'create and connect kitchen which ',
          createFragment({
            prefix: '',
            tokenIndex: 7,
            precedingTokens: [createToken('create'), createToken('and'), createToken('connect'), createToken('kitchen'), createToken('which'), createToken('is'), createToken('dark'), createToken('which')],
          }),
          doc,
          ['create', 'and', 'connect', 'kitchen', 'which', 'is', 'dark', 'which'],
          'which',
          null,
          baseDependencies,
        ),
      ).toEqual({ suggestions: [] });

      expect(
        getCreateAndConnectIntroResolution(
          'create and connect kitchen which is ',
          createFragment({
            prefix: '',
            tokenIndex: 8,
            precedingTokens: [createToken('create'), createToken('and'), createToken('connect'), createToken('kitchen'), createToken('which'), createToken('is'), createToken('dark'), createToken('which'), createToken('is')],
          }),
          doc,
          ['create', 'and', 'connect', 'kitchen', 'which', 'is', 'dark', 'which', 'is'],
          'is',
          null,
          baseDependencies,
        ),
      ).toEqual({ suggestions: [] });

      expect(
        getCreateAndConnectIntroResolution(
          'create and connect kitchen to c',
          createFragment({
            prefix: 'c',
            tokenIndex: 5,
            precedingTokens: [createToken('create'), createToken('and'), createToken('connect'), createToken('kitchen'), createToken('to')],
          }),
          doc,
          ['create', 'and', 'connect', 'kitchen', 'to'],
          'to',
          null,
          baseDependencies,
        ).suggestions.map((suggestion) => suggestion.label),
      ).toEqual(['Cellar']);

      expect(
        getCreateAndConnectIntroResolution(
          'create and connect kitchen to cellar north one-way',
          createFragment({
            prefix: '',
            tokenIndex: 8,
            precedingTokens: [
              createToken('create'),
              createToken('and'),
              createToken('connect'),
              createToken('kitchen'),
              createToken('to'),
              createToken('cellar'),
              createToken('north'),
              createToken('one-way'),
            ],
          }),
          doc,
          ['create', 'and', 'connect', 'kitchen', 'to', 'cellar', 'north', 'one-way'],
          'one-way',
          null,
          baseDependencies,
        ),
      ).toEqual({ suggestions: [] });

      const parserContinuationDependencies = {
        ...baseDependencies,
        getParserBackedCreateContinuationSuggestions: jest.fn<(input: string, fragment: ActiveFragment, options?: { readonly disallowNewRoomContinuation?: boolean }) => readonly CliSuggestion[] | null>()
          .mockReturnValue([{ id: 'parser-connect', kind: 'command', label: 'parser-connect', insertText: 'parser-connect', detail: null }]),
      };
      expect(
        getCreateAndConnectIntroResolution(
          'create and connect kitchen ',
          createFragment({
            prefix: '',
            tokenIndex: 4,
            precedingTokens: [createToken('create'), createToken('and'), createToken('connect'), createToken('kitchen')],
          }),
          doc,
          ['create', 'and', 'connect', 'kitchen'],
          'kitchen',
          null,
          parserContinuationDependencies,
        ).suggestions.map((suggestion) => suggestion.label),
      ).toEqual(expect.arrayContaining(['<new room name>', 'parser-connect']));

      const defaultDependencies = {
        ...baseDependencies,
        getParserBackedCreateContinuationSuggestions: jest.fn<(input: string, fragment: ActiveFragment, options?: { readonly disallowNewRoomContinuation?: boolean }) => readonly CliSuggestion[] | null>()
          .mockReturnValue(null),
      };
      expect(
        getCreateAndConnectIntroResolution(
          'create and connect ',
          createFragment({
            prefix: 'n',
            tokenIndex: 2,
            precedingTokens: [createToken('create'), createToken('and')],
          }),
          doc,
          ['create', 'and'],
          'and',
          null,
          defaultDependencies,
        ).suggestions.map((suggestion) => suggestion.label),
      ).toEqual(expect.arrayContaining(['north']));
    });
  });
});
