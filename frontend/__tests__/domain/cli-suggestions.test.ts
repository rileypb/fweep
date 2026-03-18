import { describe, expect, it } from '@jest/globals';
import { addRoom } from '../../src/domain/map-operations';
import { createEmptyMap, createRoom } from '../../src/domain/map-types';
import { getCliSuggestions } from '../../src/domain/cli-suggestions';

describe('cli suggestions', () => {
  it('shows curated default suggestions for an empty focused input', () => {
    let doc = createEmptyMap('Test');
    doc = addRoom(doc, { ...createRoom('Cellar'), position: { x: 0, y: 0 } });

    const result = getCliSuggestions('', 0, doc);

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(
      expect.arrayContaining(['create', 'connect', 'arrange', 'north', '<room>']),
    );
  });

  it('suggests commands and directions for the first token', () => {
    const result = getCliSuggestions('c', 1, createEmptyMap('Test'));

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(
      expect.arrayContaining(['create', 'connect']),
    );
  });

  it('suggests legal next words immediately after create plus a space', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Cellar'), position: { x: 0, y: 0 } });

    const result = getCliSuggestions('create ', 'create '.length, doc);

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(['<new room name>']);
  });

  it('suggests directions and "to" immediately after go plus a space', () => {
    const result = getCliSuggestions('go ', 'go '.length, createEmptyMap('Test'));

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(
      expect.arrayContaining(['north', 'to']),
    );
  });

  it('shows a room placeholder at the start of a room-reference slot', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Cellar'), position: { x: 0, y: 0 } });

    const result = getCliSuggestions('show ', 'show '.length, doc);

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(['<room>']);
  });

  it('suggests connect tail keywords immediately after a source direction and space', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Hallway'), position: { x: 0, y: 0 } });

    const result = getCliSuggestions('connect Kitchen north ', 'connect Kitchen north '.length, doc);

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(
      expect.arrayContaining(['one-way', 'to']),
    );
  });

  it('suggests only "to" after one-way in connect commands', () => {
    const result = getCliSuggestions('connect Kitchen north one-way ', 'connect Kitchen north one-way '.length, createEmptyMap('Test'));

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(['to']);
  });

  it('suggests room-led grammar words after a room name and space', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Kitchen'), position: { x: 0, y: 0 } });

    const result = getCliSuggestions('Kitchen ', 'Kitchen '.length, doc);

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(
      expect.arrayContaining(['is', 'to']),
    );
  });

  it('suggests only dark and lit after a room-led is phrase', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Kitchen'), position: { x: 0, y: 0 } });

    const result = getCliSuggestions('Kitchen is ', 'Kitchen is '.length, doc);

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(['dark', 'lit']);
  });

  it('suggests adjective and relative-create phrases after create plus a room name', () => {
    const result = getCliSuggestions('create Kitchen ', 'create Kitchen '.length, createEmptyMap('Test'));

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(
      expect.arrayContaining([', which is', 'above', 'below', 'north']),
    );
  });

  it('suggests only "of" after a create direction and space', () => {
    const result = getCliSuggestions('create foobar north ', 'create foobar north '.length, createEmptyMap('Test'));

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(['of']);
  });

  it('shows a room placeholder after create above/below plus a space', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Hallway'), position: { x: 0, y: 0 } });

    const aboveResult = getCliSuggestions('create foobar above ', 'create foobar above '.length, doc);
    const belowResult = getCliSuggestions('create foobar below ', 'create foobar below '.length, doc);

    expect(aboveResult?.suggestions.map((suggestion) => suggestion.label)).toEqual(['<room>']);
    expect(belowResult?.suggestions.map((suggestion) => suggestion.label)).toEqual(['<room>']);
  });

  it('shows no suggestions after a complete create above/below room reference', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Hallway'), position: { x: 0, y: 0 } });

    expect(getCliSuggestions('create foobar above hallway ', 'create foobar above hallway '.length, doc)).toBeNull();
    expect(getCliSuggestions('create foobar below hallway ', 'create foobar below hallway '.length, doc)).toBeNull();
  });

  it('requires a comma after create adjective phrases before showing directions', () => {
    const beforeComma = getCliSuggestions('create foobar, which is lit ', 'create foobar, which is lit '.length, createEmptyMap('Test'));
    const afterComma = getCliSuggestions('create foobar, which is lit, ', 'create foobar, which is lit, '.length, createEmptyMap('Test'));

    expect(beforeComma?.suggestions.map((suggestion) => suggestion.label)).toEqual([',']);
    expect(afterComma?.suggestions.map((suggestion) => suggestion.label)).toContain('north');
  });

  it('shows no suggestions after a complete relative create phrase', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Pool'), position: { x: 0, y: 0 } });

    const result = getCliSuggestions('create foobar north of pool ', 'create foobar north of pool '.length, doc);

    expect(result).toBeNull();
  });

  it('suggests a new-room placeholder after create and connect plus a space', () => {
    const result = getCliSuggestions('create and connect ', 'create and connect '.length, createEmptyMap('Test'));

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(['<new room name>']);
  });

  it('suggests only "to" after one-way in create-and-connect commands', () => {
    const result = getCliSuggestions(
      'create and connect Kitchen north one-way ',
      'create and connect Kitchen north one-way '.length,
      createEmptyMap('Test'),
    );

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(['to']);
  });

  it('requires a comma after create-and-connect adjective phrases before showing directions', () => {
    const beforeComma = getCliSuggestions(
      'create and connect foobar, which is lit ',
      'create and connect foobar, which is lit '.length,
      createEmptyMap('Test'),
    );
    const afterComma = getCliSuggestions(
      'create and connect foobar, which is lit, ',
      'create and connect foobar, which is lit, '.length,
      createEmptyMap('Test'),
    );

    expect(beforeComma?.suggestions.map((suggestion) => suggestion.label)).toEqual([',']);
    expect(afterComma?.suggestions.map((suggestion) => suggestion.label)).toContain('north');
  });

  it('suggests normalized directions for the first token', () => {
    const result = getCliSuggestions('n', 1, createEmptyMap('Test'));

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(
      expect.arrayContaining(['north']),
    );
  });

  it('treats e and s as east and south rather than edit and show in the first token', () => {
    const eastResult = getCliSuggestions('e', 1, createEmptyMap('Test'));
    const southResult = getCliSuggestions('s', 1, createEmptyMap('Test'));

    expect(eastResult?.suggestions.map((suggestion) => suggestion.label)).toContain('east');
    expect(eastResult?.suggestions.map((suggestion) => suggestion.label)).not.toContain('edit');
    expect(southResult?.suggestions.map((suggestion) => suggestion.label)).toContain('south');
    expect(southResult?.suggestions.map((suggestion) => suggestion.label)).not.toContain('show');
  });

  it('suggests matching help topics after help', () => {
    const result = getCliSuggestions('help r', 6, createEmptyMap('Test'));

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(['rooms']);
  });

  it('suggests matching rooms for show commands', () => {
    let doc = createEmptyMap('Test');
    doc = addRoom(doc, { ...createRoom('Cellar'), position: { x: 0, y: 0 } });
    doc = addRoom(doc, { ...createRoom('Control Room'), position: { x: 40, y: 0 } });

    const result = getCliSuggestions('show c', 6, doc);

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(['Cellar', 'Control Room']);
  });

  it('shows a room placeholder at the start of a connect target slot', () => {
    const result = getCliSuggestions('connect kitchen north to ', 'connect kitchen north to '.length, createEmptyMap('Test'));

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(['<room>']);
  });

  it('keeps suggesting a longer multi-word room after a space inside the room reference', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Living Room'), position: { x: 0, y: 0 } });

    const result = getCliSuggestions('connect living ', 'connect living '.length, doc);

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(
      expect.arrayContaining(['Living Room', 'north']),
    );
  });

  it('shows both longer room continuations and room-led grammar in the first room-led slot after a space', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Store Room'), position: { x: 0, y: 0 } });

    const result = getCliSuggestions('store ', 'store '.length, doc);

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(
      expect.arrayContaining(['Store Room', 'is', 'to']),
    );
  });

  it('suggests matching target rooms in connect commands', () => {
    let doc = createEmptyMap('Test');
    doc = addRoom(doc, { ...createRoom('Kitchen'), position: { x: 0, y: 0 } });
    doc = addRoom(doc, { ...createRoom('Hallway'), position: { x: 40, y: 0 } });
    doc = addRoom(doc, { ...createRoom('Hall of Mirrors'), position: { x: 80, y: 0 } });

    const result = getCliSuggestions('connect kitchen n to h', 'connect kitchen n to h'.length, doc);

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(['Hall of Mirrors', 'Hallway']);
  });

  it('matches room-reference suggestions by word prefix inside grammar slots', () => {
    let doc = createEmptyMap('Test');
    doc = addRoom(doc, { ...createRoom('Store Room'), position: { x: 0, y: 0 } });
    doc = addRoom(doc, { ...createRoom('Ice Cream Stand'), position: { x: 40, y: 0 } });

    const result = getCliSuggestions('connect store room down to c', 'connect store room down to c'.length, doc);

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(['Ice Cream Stand']);
  });

  it('replaces only the active token range for multi-word room completions', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Control Room'), position: { x: 0, y: 0 } });

    const result = getCliSuggestions('show control r', 'show control r'.length, doc);

    expect(result).toMatchObject({
      replaceStart: 5,
      replaceEnd: 14,
      prefix: 'control r',
    });
    expect(result?.suggestions[0]).toMatchObject({
      label: 'Control Room',
      insertText: 'Control Room',
    });
  });

  it('suggests directions in connect commands when the current fragment looks like a direction', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Kitchen'), position: { x: 0, y: 0 } });

    const result = getCliSuggestions('connect kitchen n', 'connect kitchen n'.length, doc);

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toContain('north');
  });

  it('suggests connection annotations after a room-to-room is phrase', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Bedroom'), position: { x: 0, y: 0 } });

    const result = getCliSuggestions('bedroom to bathroom is ', 'bedroom to bathroom is '.length, doc);

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(['door', 'locked door', 'clear']);
  });

  it('inserts room-to-room fallback keywords at the caret instead of replacing the target room', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Bedroom'), position: { x: 0, y: 0 } });

    const result = getCliSuggestions('bedroom to bathroom ', 'bedroom to bathroom '.length, doc);

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(['is']);
    expect(result).toMatchObject({
      replaceStart: 'bedroom to bathroom '.length,
      replaceEnd: 'bedroom to bathroom '.length,
      prefix: '',
    });
  });

  it('suggests pseudo-room continuations after directional pseudo-room phrases', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Bedroom'), position: { x: 0, y: 0 } });
    const shorthandResult = getCliSuggestions('west of bedroom ', 'west of bedroom '.length, doc);
    const roomResult = getCliSuggestions('the room north of bedroom ', 'the room north of bedroom '.length, doc);
    const wayResult = getCliSuggestions('the way north of bedroom ', 'the way north of bedroom '.length, doc);

    expect(shorthandResult?.suggestions.map((suggestion) => suggestion.label)).toEqual([
      'is unknown',
      'goes on forever',
      'leads nowhere',
      'lies death',
    ]);
    expect(roomResult?.suggestions.map((suggestion) => suggestion.label)).toEqual(['is unknown']);
    expect(wayResult?.suggestions.map((suggestion) => suggestion.label)).toEqual(['goes on forever', 'leads nowhere', 'lies death']);
  });

  it('suggests only unknown after pseudo-room is phrases', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Bedroom'), position: { x: 0, y: 0 } });

    const result = getCliSuggestions('north of bedroom is ', 'north of bedroom is '.length, doc);

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(['unknown']);
  });

  it('closes suggestions after a completed pseudo-room terminal phrase', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Bedroom'), position: { x: 0, y: 0 } });

    expect(getCliSuggestions('north of bedroom is unknown ', 'north of bedroom is unknown '.length, doc)).toBeNull();
    expect(getCliSuggestions('west of bedroom goes on forever ', 'west of bedroom goes on forever '.length, doc)).toBeNull();
    expect(getCliSuggestions('west of bedroom leads nowhere ', 'west of bedroom leads nowhere '.length, doc)).toBeNull();
    expect(getCliSuggestions('west of bedroom lies death ', 'west of bedroom lies death '.length, doc)).toBeNull();
  });

  it('does not allow room-to-room connection annotation grammar inside pseudo-room phrases', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Bedroom'), position: { x: 0, y: 0 } });

    expect(getCliSuggestions('west of bedroom to ', 'west of bedroom to '.length, doc)).toBeNull();
    expect(getCliSuggestions('west of bedroom to bathroom ', 'west of bedroom to bathroom '.length, doc)).toBeNull();
    expect(getCliSuggestions('west of bedroom to bathroom is ', 'west of bedroom to bathroom is '.length, doc)).toBeNull();
  });
});
