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
      .toEqual(['of', 'is', 'goes', 'leads', 'lies']);
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
      .toEqual(['is', 'goes on forever', 'leads nowhere', 'leads to somewhere else', 'lies death']);
  });

  it('switches to bare is after a completed multi-word generic room reference', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Control Room'), position: { x: 0, y: 0 } });
    const fragment = {
      start: 'north of Control Room '.length,
      end: 'north of Control Room '.length,
      caret: 'north of Control Room '.length,
      prefix: '',
      tokenIndex: 4,
      precedingTokens: [
        { value: 'north', start: 0, end: 5 },
        { value: 'of', start: 6, end: 8 },
        { value: 'Control', start: 9, end: 16 },
        { value: 'Room', start: 17, end: 21 },
      ],
    };

    expect(getPseudoRoomResolution('north of Control Room ', fragment, doc, ['north', 'of', 'control', 'room'], helpers)?.suggestions.map((suggestion) => suggestion.label))
      .toEqual(['is', 'goes on forever', 'leads nowhere', 'leads to somewhere else', 'lies death']);
  });

  it('offers unknown and room targets after multi-word generic pseudo-room is', () => {
    let doc = createEmptyMap('Test');
    doc = addRoom(doc, { ...createRoom('Control Room'), position: { x: 0, y: 0 } });
    doc = addRoom(doc, { ...createRoom('Kitchen'), position: { x: 1, y: 0 } });
    doc = addRoom(doc, { ...createRoom('Kitchen Annex'), position: { x: 2, y: 0 } });

    const emptyFragment = {
      start: 'north of Control Room is '.length,
      end: 'north of Control Room is '.length,
      caret: 'north of Control Room is '.length,
      prefix: '',
      tokenIndex: 5,
      precedingTokens: [
        { value: 'north', start: 0, end: 5 },
        { value: 'of', start: 6, end: 8 },
        { value: 'Control', start: 9, end: 16 },
        { value: 'Room', start: 17, end: 21 },
        { value: 'is', start: 22, end: 24 },
      ],
    };
    const typingFragment = {
      ...emptyFragment,
      end: 'north of Control Room is Ki'.length,
      caret: 'north of Control Room is Ki'.length,
      prefix: 'Ki',
    };

    expect(getPseudoRoomResolution('north of Control Room is ', emptyFragment, doc, ['north', 'of', 'control', 'room', 'is'], helpers)?.suggestions.map((suggestion) => suggestion.label))
      .toEqual(expect.arrayContaining(['<room>', 'unknown']));
    expect(getPseudoRoomResolution('north of Control Room is Ki', typingFragment, doc, ['north', 'of', 'control', 'room', 'is'], helpers)?.suggestions.map((suggestion) => suggestion.label))
      .toEqual(expect.arrayContaining(['<room>', 'Kitchen', 'Kitchen Annex']));
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

  it('offers room targets as well as unknown after generic pseudo-room is phrases', () => {
    let doc = createEmptyMap('Test');
    doc = addRoom(doc, { ...createRoom('Bedroom'), position: { x: 0, y: 0 } });
    doc = addRoom(doc, { ...createRoom('Kitchen'), position: { x: 1, y: 0 } });
    doc = addRoom(doc, { ...createRoom('Kitchen Annex'), position: { x: 2, y: 0 } });

    const emptyFragment = {
      start: 'north of bedroom is '.length,
      end: 'north of bedroom is '.length,
      caret: 'north of bedroom is '.length,
      prefix: '',
      tokenIndex: 4,
      precedingTokens: [
        { value: 'north', start: 0, end: 5 },
        { value: 'of', start: 6, end: 8 },
        { value: 'bedroom', start: 9, end: 16 },
        { value: 'is', start: 17, end: 19 },
      ],
    };
    const typingFragment = {
      ...emptyFragment,
      end: 'north of bedroom is Ki'.length,
      caret: 'north of bedroom is Ki'.length,
      prefix: 'Ki',
    };

    expect(getPseudoRoomResolution('north of bedroom is ', emptyFragment, doc, ['north', 'of', 'bedroom', 'is'], helpers)?.suggestions.map((suggestion) => suggestion.label))
      .toEqual(expect.arrayContaining(['<room>', 'unknown']));
    expect(getPseudoRoomResolution('north of bedroom is Ki', typingFragment, doc, ['north', 'of', 'bedroom', 'is'], helpers)?.suggestions.map((suggestion) => suggestion.label))
      .toEqual(expect.arrayContaining(['<room>', 'Kitchen', 'Kitchen Annex']));
  });

  it('suggests room targets and of within the room-prefixed forms', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Bedroom'), position: { x: 0, y: 0 } });
    const ofFragment = {
      start: 'the room north '.length,
      end: 'the room north '.length,
      caret: 'the room north '.length,
      prefix: '',
      tokenIndex: 3,
      precedingTokens: [
        { value: 'the', start: 0, end: 3 },
        { value: 'room', start: 4, end: 8 },
        { value: 'north', start: 9, end: 14 },
      ],
    };
    const targetFragment = {
      start: 'the room north of '.length,
      end: 'the room north of b'.length,
      caret: 'the room north of b'.length,
      prefix: 'b',
      tokenIndex: 4,
      precedingTokens: [
        { value: 'the', start: 0, end: 3 },
        { value: 'room', start: 4, end: 8 },
        { value: 'north', start: 9, end: 14 },
        { value: 'of', start: 15, end: 17 },
      ],
    };

    expect(getPseudoRoomResolution('the room north ', ofFragment, doc, ['the', 'room', 'north'], helpers)?.suggestions.map((suggestion) => suggestion.label))
      .toEqual(['of']);
    expect(getPseudoRoomResolution('the room north of b', targetFragment, doc, ['the', 'room', 'north', 'of'], helpers)?.suggestions.map((suggestion) => suggestion.label))
      .toEqual(expect.arrayContaining(['Bedroom']));
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
      .toEqual(['goes on forever', 'leads nowhere', 'leads to somewhere else', 'lies death']);
  });

  it('suggests room targets and of within the way-prefixed forms', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Bedroom'), position: { x: 0, y: 0 } });
    const ofFragment = {
      start: 'the way north '.length,
      end: 'the way north '.length,
      caret: 'the way north '.length,
      prefix: '',
      tokenIndex: 3,
      precedingTokens: [
        { value: 'the', start: 0, end: 3 },
        { value: 'way', start: 4, end: 7 },
        { value: 'north', start: 8, end: 13 },
      ],
    };
    const targetFragment = {
      start: 'the way north of '.length,
      end: 'the way north of b'.length,
      caret: 'the way north of b'.length,
      prefix: 'b',
      tokenIndex: 4,
      precedingTokens: [
        { value: 'the', start: 0, end: 3 },
        { value: 'way', start: 4, end: 7 },
        { value: 'north', start: 8, end: 13 },
        { value: 'of', start: 14, end: 16 },
      ],
    };

    expect(getPseudoRoomResolution('the way north ', ofFragment, doc, ['the', 'way', 'north'], helpers)?.suggestions.map((suggestion) => suggestion.label))
      .toEqual(['of']);
    expect(getPseudoRoomResolution('the way north of b', targetFragment, doc, ['the', 'way', 'north', 'of'], helpers)?.suggestions.map((suggestion) => suggestion.label))
      .toEqual(expect.arrayContaining(['Bedroom']));
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
      .toEqual(['<room>', 'is', 'goes', 'leads', 'lies']);
    expect(getPseudoRoomResolution('above bedroom ', terminalFragment, doc, ['above', 'bedroom'], helpers)?.suggestions.map((suggestion) => suggestion.label))
      .toEqual(['is', 'goes on forever', 'leads nowhere', 'leads to somewhere else', 'lies death']);
  });

  it('continues mid-phrase pseudo-room keywords', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Bedroom'), position: { x: 0, y: 0 } });

    const cases = [
      ['north of bedroom is ', ['<room>', 'unknown']],
      ['north of bedroom goes ', ['on']],
      ['north of bedroom goes on ', ['forever']],
      ['north of bedroom leads ', ['nowhere', 'to somewhere else']],
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

  it('offers fallback pseudo-room phrases while typing generic references', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Bedroom'), position: { x: 0, y: 0 } });

    const genericDirectionFragment = {
      start: 'north of '.length,
      end: 'north of '.length,
      caret: 'north of '.length,
      prefix: '',
      tokenIndex: 2,
      precedingTokens: [
        { value: 'north', start: 0, end: 5 },
        { value: 'of', start: 6, end: 8 },
      ],
    };
    const genericVerticalFragment = {
      start: 'below '.length,
      end: 'below '.length,
      caret: 'below '.length,
      prefix: '',
      tokenIndex: 1,
      precedingTokens: [
        { value: 'below', start: 0, end: 5 },
      ],
    };

    expect(getPseudoRoomResolution('north of nowhere ', {
      ...genericDirectionFragment,
      start: 'north of nowhere '.length,
      end: 'north of nowhere '.length,
      caret: 'north of nowhere '.length,
      tokenIndex: 3,
      precedingTokens: [
        { value: 'north', start: 0, end: 5 },
        { value: 'of', start: 6, end: 8 },
        { value: 'nowhere', start: 9, end: 16 },
      ],
    }, doc, ['north', 'of', 'nowhere'], helpers)?.suggestions.map((suggestion) => suggestion.label))
      .toEqual(expect.arrayContaining(['is', 'goes on forever', 'leads nowhere', 'leads to somewhere else', 'lies death']));
    expect(getPseudoRoomResolution('below ', genericVerticalFragment, doc, ['below'], helpers)?.suggestions.map((suggestion) => suggestion.label))
      .toEqual(expect.arrayContaining(['<room>']));
  });
});
