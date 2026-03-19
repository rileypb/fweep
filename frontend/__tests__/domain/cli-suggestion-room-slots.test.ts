import { describe, expect, it } from '@jest/globals';
import { addConnection, addRoom } from '../../src/domain/map-operations';
import { createConnection, createEmptyMap, createRoom } from '../../src/domain/map-types';
import {
  createRoomSuggestions,
  getConnectedRoomReferenceResolution,
  getLeadingRoomReferenceResolution,
  getRoomReferenceResolution,
  getRoomReferenceResolutionWithFallback,
  normalizeRoomReferenceText,
  type RoomSlotSuggestionHelpers,
} from '../../src/domain/cli-suggestion-room-slots';

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

describe('cli suggestion room slots', () => {
  it('normalizes room reference text', () => {
    expect(normalizeRoomReferenceText('  Living   Room  ')).toBe('living room');
  });

  it('creates room suggestions by prefix', () => {
    let doc = createEmptyMap('Test');
    doc = addRoom(doc, { ...createRoom('Living Room'), position: { x: 0, y: 0 } });
    doc = addRoom(doc, { ...createRoom('Library'), position: { x: 1, y: 0 } });

    expect(createRoomSuggestions(doc, 'li').map((suggestion) => suggestion.label)).toEqual(['Library', 'Living Room']);
    expect(createRoomSuggestions(null, 'li')).toEqual([]);
  });

  it('returns a placeholder for an empty room slot and real matches while typing', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Living Room'), position: { x: 0, y: 0 } });
    const emptyFragment = {
      start: 5,
      end: 5,
      caret: 5,
      prefix: '',
      normalizedPrefix: '',
      tokenIndex: 1,
      precedingTokens: [{ value: 'show', start: 0, end: 4, quoted: false }],
      quoted: false,
      quoteClosed: true,
    };
    const typingFragment = {
      start: 5,
      end: 7,
      caret: 7,
      prefix: 'li',
      normalizedPrefix: 'li',
      tokenIndex: 1,
      precedingTokens: [{ value: 'show', start: 0, end: 4, quoted: false }],
      quoted: false,
      quoteClosed: true,
    };

    expect(getRoomReferenceResolution('show ', emptyFragment, doc, 1, helpers).suggestions.map((suggestion) => suggestion.label)).toEqual(['<room>']);
    expect(getRoomReferenceResolution('show li', typingFragment, doc, 1, helpers).suggestions.map((suggestion) => suggestion.label)).toEqual(['Living Room']);
  });

  it('hands off to fallback suggestions after a completed room reference', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Kitchen'), position: { x: 0, y: 0 } });
    const fragment = {
      start: 13,
      end: 13,
      caret: 13,
      prefix: '',
      normalizedPrefix: '',
      tokenIndex: 2,
      precedingTokens: [
        { value: 'show', start: 0, end: 4, quoted: false },
        { value: 'Kitchen', start: 5, end: 12, quoted: false },
      ],
      quoted: false,
      quoteClosed: true,
    };
    const fallback = [{ id: 'fallback-is', kind: 'command' as const, label: 'is', insertText: 'is', detail: null }];

    expect(getRoomReferenceResolutionWithFallback('show Kitchen ', fragment, doc, 1, fallback, helpers).suggestions).toEqual(fallback);
  });

  it('merges room matches with fallback suggestions while still typing multi-word references', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Living Room'), position: { x: 0, y: 0 } });
    const fragment = {
      start: 5,
      end: 12,
      caret: 12,
      prefix: '',
      normalizedPrefix: '',
      tokenIndex: 1,
      precedingTokens: [{ value: 'show', start: 0, end: 4, quoted: false }],
      quoted: false,
      quoteClosed: true,
    };
    const fallback = [{ id: 'fallback-to', kind: 'command' as const, label: 'to', insertText: 'to', detail: null }];

    expect(
      getRoomReferenceResolutionWithFallback('show living ', fragment, doc, 1, fallback, helpers).suggestions.map((suggestion) => suggestion.label),
    ).toEqual(['Living Room', 'to']);
  });

  it('offers leading-room matches and fallback together when appropriate', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Kitchen'), position: { x: 0, y: 0 } });
    const fragment = {
      start: 0,
      end: 3,
      caret: 3,
      prefix: 'Kit',
      normalizedPrefix: 'kit',
      tokenIndex: 0,
      precedingTokens: [],
      quoted: false,
      quoteClosed: true,
    };
    const fallback = [{ id: 'fallback-is', kind: 'command' as const, label: 'is', insertText: 'is', detail: null }];

    expect(getLeadingRoomReferenceResolution('Kit', fragment, doc, fallback, helpers).suggestions.map((suggestion) => suggestion.label)).toEqual(['Kitchen']);
  });

  it('filters connected-room suggestions to the source room neighborhood', () => {
    const kitchen = { ...createRoom('Kitchen'), id: 'kitchen', position: { x: 0, y: 0 } };
    const hall = { ...createRoom('Hallway'), id: 'hall', position: { x: 1, y: 0 } };
    const cellar = { ...createRoom('Cellar'), id: 'cellar', position: { x: 2, y: 0 } };
    let doc = createEmptyMap('Test');
    doc = addRoom(doc, kitchen);
    doc = addRoom(doc, hall);
    doc = addRoom(doc, cellar);
    doc = addConnection(doc, createConnection(kitchen.id, hall.id, true), 'north', 'south');

    const fragment = {
      start: 11,
      end: 11,
      caret: 11,
      prefix: '',
      normalizedPrefix: '',
      tokenIndex: 2,
      precedingTokens: [
        { value: 'Kitchen', start: 0, end: 7, quoted: false },
        { value: 'to', start: 8, end: 10, quoted: false },
      ],
      quoted: false,
      quoteClosed: true,
    };
    const fallback = [{ id: 'fallback-is', kind: 'command' as const, label: 'is', insertText: 'is', detail: null }];

    expect(
      getConnectedRoomReferenceResolution('Kitchen to ', fragment, doc, 2, 'Kitchen', fallback, helpers).suggestions.map((suggestion) => suggestion.label),
    ).toEqual(['Hallway']);
  });

  it('keeps open quoted room references in slot mode and hands off after the quote closes', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Key West'), position: { x: 0, y: 0 } });
    const openQuotedFragment = {
      start: 5,
      end: 15,
      caret: 15,
      prefix: '"Key West ',
      normalizedPrefix: 'key west',
      tokenIndex: 1,
      precedingTokens: [{ value: 'show', start: 0, end: 4, quoted: false }],
      quoted: true,
      quoteClosed: false,
    };
    const closedQuotedFragment = {
      start: 16,
      end: 16,
      caret: 16,
      prefix: '',
      normalizedPrefix: '',
      tokenIndex: 2,
      precedingTokens: [
        { value: 'show', start: 0, end: 4, quoted: false },
        { value: 'Key West', start: 5, end: 15, quoted: true },
      ],
      quoted: false,
      quoteClosed: true,
    };
    const fallback = [{ id: 'fallback-is', kind: 'command' as const, label: 'is', insertText: 'is', detail: null }];

    expect(
      getRoomReferenceResolutionWithFallback('show "Key West ', openQuotedFragment, doc, 1, fallback, helpers)
        .suggestions.map((suggestion) => suggestion.label),
    ).toEqual(['Key West']);

    expect(
      getRoomReferenceResolutionWithFallback('show "Key West" ', closedQuotedFragment, doc, 1, fallback, helpers)
        .suggestions.map((suggestion) => suggestion.label),
    ).toEqual(['is']);
  });
});
