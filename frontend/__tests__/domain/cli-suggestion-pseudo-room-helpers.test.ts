import { describe, expect, it } from '@jest/globals';
import { getPseudoRoomResolution } from '../../src/domain/cli-suggestion-pseudo-room-helpers';
import { addRoom } from '../../src/domain/map-operations';
import { createEmptyMap, createRoom } from '../../src/domain/map-types';
import type { RoomSlotSuggestionHelpers } from '../../src/domain/cli-suggestion-room-slots';

const helpers: RoomSlotSuggestionHelpers = {
  createPlaceholderSuggestion: (label) => [{
    id: `placeholder-${label}`,
    kind: 'placeholder',
    label,
    insertText: '',
    detail: null,
  }],
  mergeSuggestions: (primary, secondary) => [...primary, ...secondary.filter((candidate) => !primary.some((existing) => existing.id === candidate.id))],
};

describe('cli suggestion pseudo-room helpers', () => {
  it('suggests directions and vertical keywords after the room/way leads', () => {
    const roomFragment = {
      start: 'the room '.length,
      end: 'the room '.length,
      caret: 'the room '.length,
      prefix: '',
      tokenIndex: 2,
      precedingTokens: [
        { value: 'the', start: 0, end: 3 },
        { value: 'room', start: 4, end: 8 },
      ],
    };
    const wayFragment = {
      start: 'the way '.length,
      end: 'the way '.length,
      caret: 'the way '.length,
      prefix: '',
      tokenIndex: 2,
      precedingTokens: [
        { value: 'the', start: 0, end: 3 },
        { value: 'way', start: 4, end: 7 },
      ],
    };

    expect(getPseudoRoomResolution('the room ', roomFragment, createEmptyMap('Test'), ['the', 'room'], helpers)?.suggestions.map((suggestion) => suggestion.label))
      .toEqual(expect.arrayContaining(['north', 'above', 'below']));
    expect(getPseudoRoomResolution('the way ', wayFragment, createEmptyMap('Test'), ['the', 'way'], helpers)?.suggestions.map((suggestion) => suggestion.label))
      .toEqual(expect.arrayContaining(['north', 'above', 'below']));
  });

  it('suggests of after a completed pseudo-room direction token', () => {
    const fragment = {
      start: 'north '.length,
      end: 'north '.length,
      caret: 'north '.length,
      prefix: '',
      tokenIndex: 1,
      precedingTokens: [
        { value: 'north', start: 0, end: 5 },
      ],
    };

    expect(getPseudoRoomResolution('north ', fragment, createEmptyMap('Test'), ['north'], helpers)?.suggestions.map((suggestion) => suggestion.label))
      .toEqual(['of']);
  });

  it('stays in the room slot while typing a pseudo-room target', () => {
    let doc = createEmptyMap('Test');
    doc = addRoom(doc, { ...createRoom('Library'), position: { x: 0, y: 0 } });
    doc = addRoom(doc, { ...createRoom('Living Room'), position: { x: 1, y: 0 } });

    const fragment = {
      start: 'north of '.length,
      end: 'north of l'.length,
      caret: 'north of l'.length,
      prefix: 'l',
      tokenIndex: 2,
      precedingTokens: [
        { value: 'north', start: 0, end: 5 },
        { value: 'of', start: 6, end: 8 },
      ],
    };

    expect(getPseudoRoomResolution('north of l', fragment, doc, ['north', 'of'], helpers)?.suggestions.map((suggestion) => suggestion.label))
      .toEqual(expect.arrayContaining(['Library', 'Living Room']));
  });

  it('switches to terminal pseudo-room phrases after a completed generic room reference', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Bedroom'), position: { x: 0, y: 0 } });
    const fragment = {
      start: 'north of bedroom '.length,
      end: 'north of bedroom '.length,
      caret: 'north of bedroom '.length,
      prefix: '',
      tokenIndex: 3,
      precedingTokens: [
        { value: 'north', start: 0, end: 5 },
        { value: 'of', start: 6, end: 8 },
        { value: 'bedroom', start: 9, end: 16 },
      ],
    };

    expect(getPseudoRoomResolution('north of bedroom ', fragment, doc, ['north', 'of', 'bedroom'], helpers)?.suggestions.map((suggestion) => suggestion.label))
      .toEqual(['is unknown', 'goes on forever', 'leads nowhere', 'lies death']);
  });

  it('returns only unknown after the room room-reference completion', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Bedroom'), position: { x: 0, y: 0 } });
    const fragment = {
      start: 'the room north of bedroom '.length,
      end: 'the room north of bedroom '.length,
      caret: 'the room north of bedroom '.length,
      prefix: '',
      tokenIndex: 5,
      precedingTokens: [
        { value: 'the', start: 0, end: 3 },
        { value: 'room', start: 4, end: 8 },
        { value: 'north', start: 9, end: 14 },
        { value: 'of', start: 15, end: 17 },
        { value: 'bedroom', start: 18, end: 25 },
      ],
    };

    expect(getPseudoRoomResolution('the room north of bedroom ', fragment, doc, ['the', 'room', 'north', 'of', 'bedroom'], helpers)?.suggestions.map((suggestion) => suggestion.label))
      .toEqual(['is unknown']);
  });

  it('returns way-terminal phrases after the way room-reference completion', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Bedroom'), position: { x: 0, y: 0 } });
    const fragment = {
      start: 'the way north of bedroom '.length,
      end: 'the way north of bedroom '.length,
      caret: 'the way north of bedroom '.length,
      prefix: '',
      tokenIndex: 5,
      precedingTokens: [
        { value: 'the', start: 0, end: 3 },
        { value: 'way', start: 4, end: 7 },
        { value: 'north', start: 8, end: 13 },
        { value: 'of', start: 14, end: 16 },
        { value: 'bedroom', start: 17, end: 24 },
      ],
    };

    expect(getPseudoRoomResolution('the way north of bedroom ', fragment, doc, ['the', 'way', 'north', 'of', 'bedroom'], helpers)?.suggestions.map((suggestion) => suggestion.label))
      .toEqual(['goes on forever', 'leads nowhere', 'lies death']);
  });

  it('handles vertical pseudo-room room slots and terminal phrases', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Bedroom'), position: { x: 0, y: 0 } });
    const roomFragment = {
      start: 'above '.length,
      end: 'above '.length,
      caret: 'above '.length,
      prefix: '',
      tokenIndex: 1,
      precedingTokens: [
        { value: 'above', start: 0, end: 5 },
      ],
    };
    const terminalFragment = {
      start: 'above bedroom '.length,
      end: 'above bedroom '.length,
      caret: 'above bedroom '.length,
      prefix: '',
      tokenIndex: 2,
      precedingTokens: [
        { value: 'above', start: 0, end: 5 },
        { value: 'bedroom', start: 6, end: 13 },
      ],
    };

    expect(getPseudoRoomResolution('above ', roomFragment, doc, ['above'], helpers)?.suggestions.map((suggestion) => suggestion.label))
      .toEqual(['<room>']);
    expect(getPseudoRoomResolution('above bedroom ', terminalFragment, doc, ['above', 'bedroom'], helpers)?.suggestions.map((suggestion) => suggestion.label))
      .toEqual(['is unknown', 'goes on forever', 'leads nowhere', 'lies death']);
  });

  it('continues mid-phrase pseudo-room keywords', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Bedroom'), position: { x: 0, y: 0 } });

    const cases = [
      ['north of bedroom is ', ['unknown']],
      ['north of bedroom goes ', ['on']],
      ['north of bedroom goes on ', ['forever']],
      ['north of bedroom leads ', ['nowhere']],
      ['north of bedroom lies ', ['death']],
    ] as const;

    for (const [input, expected] of cases) {
      const tokens = input.trim().split(/\s+/);
      const fragment = {
        start: input.length,
        end: input.length,
        caret: input.length,
        prefix: '',
        tokenIndex: tokens.length,
        precedingTokens: tokens.map((value, index, all) => {
          const textBefore = all.slice(0, index).join(' ');
          const start = textBefore.length === 0 ? 0 : textBefore.length + 1;
          return { value, start, end: start + value.length };
        }),
      };

      expect(getPseudoRoomResolution(input, fragment, doc, tokens, helpers)?.suggestions.map((suggestion) => suggestion.label))
        .toEqual(expected);
    }
  });
});
