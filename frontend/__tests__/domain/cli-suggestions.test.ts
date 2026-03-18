import { describe, expect, it } from '@jest/globals';
import { addConnection, addRoom } from '../../src/domain/map-operations';
import { createConnection, createEmptyMap, createRoom } from '../../src/domain/map-types';
import { getCliSuggestions } from '../../src/domain/cli-suggestions';

describe('cli suggestions', () => {
  it('shows all valid first-token starters for an empty focused input', () => {
    let doc = createEmptyMap('Test');
    doc = addRoom(doc, { ...createRoom('Cellar'), position: { x: 0, y: 0 } });

    const result = getCliSuggestions('', 0, doc);

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(
      expect.arrayContaining([
        'create',
        'connect',
        'go',
        'show',
        'edit',
        'delete',
        'notate',
        'annotate',
        'arrange',
        'help',
        'put',
        'take',
        'get',
        'undo',
        'redo',
        'above',
        'below',
        'the',
        'north',
        'south',
        'east',
        'west',
        '<room>',
      ]),
    );
  });

  it('suggests commands and directions for the first token', () => {
    const result = getCliSuggestions('c', 1, createEmptyMap('Test'));

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(
      expect.arrayContaining(['create', 'connect']),
    );
  });

  it('suggests the as a first-token starter when typing t', () => {
    const result = getCliSuggestions('t', 1, createEmptyMap('Test'));

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toContain('the');
  });

  it('suggests room and way after typing the plus a space', () => {
    const result = getCliSuggestions('the ', 'the '.length, createEmptyMap('Test'));

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(['room', 'way']);
  });

  it('suggests legal next words immediately after create plus a space', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Cellar'), position: { x: 0, y: 0 } });

    const result = getCliSuggestions('create ', 'create '.length, doc);

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(['<new room name>', 'and']);
  });

  it('suggests create and connect from the first token prefix', () => {
    const result = getCliSuggestions('create', 'create'.length, createEmptyMap('Test'));

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(
      expect.arrayContaining(['create', 'create and connect']),
    );
  });

  it('suggests directions and "to" immediately after go plus a space', () => {
    const result = getCliSuggestions('go ', 'go '.length, createEmptyMap('Test'));

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(
      expect.arrayContaining(['north', 'to']),
    );
  });

  it('does not suggest show when typing go as the first token', () => {
    const result = getCliSuggestions('go', 2, createEmptyMap('Test'));

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toContain('go');
    expect(result?.suggestions.map((suggestion) => suggestion.label)).not.toContain('show');
  });

  it('shows get instead of take when matching the get synonym at the first token', () => {
    const result = getCliSuggestions('g', 1, createEmptyMap('Test'));

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toContain('get');
    expect(result?.suggestions.map((suggestion) => suggestion.label)).not.toContain('take');
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

  it('keeps parser-backed connect tail suggestions on direction and one-way states', () => {
    expect(
      getCliSuggestions('connect Kitchen north ', 'connect Kitchen north '.length, createEmptyMap('Test'))
        ?.suggestions.map((suggestion) => suggestion.label),
    ).toEqual(expect.arrayContaining(['one-way', 'to']));

    expect(
      getCliSuggestions('connect store room west ', 'connect store room west '.length, createEmptyMap('Test'))
        ?.suggestions.map((suggestion) => suggestion.label),
    ).toEqual(expect.arrayContaining(['one-way', 'to']));

    expect(
      getCliSuggestions('connect store room west one-way ', 'connect store room west one-way '.length, createEmptyMap('Test'))
        ?.suggestions.map((suggestion) => suggestion.label),
    ).toEqual(['to']);

    expect(
      getCliSuggestions('create and connect Pantry north ', 'create and connect Pantry north '.length, createEmptyMap('Test'))
        ?.suggestions.map((suggestion) => suggestion.label),
    ).toEqual(expect.arrayContaining(['one-way', 'to']));

    expect(
      getCliSuggestions('create and connect Pantry north one-way ', 'create and connect Pantry north one-way '.length, createEmptyMap('Test'))
        ?.suggestions.map((suggestion) => suggestion.label),
    ).toEqual(['to']);
  });

  it('suggests a trailing target direction only for two-way connect commands', () => {
    const doc = addRoom(addRoom(createEmptyMap('Test'), { ...createRoom('Kitchen'), position: { x: 0, y: 0 } }), {
      ...createRoom('Bedroom'),
      position: { x: 1, y: 0 },
    });

    expect(
      getCliSuggestions('connect Kitchen north to Bedroom ', 'connect Kitchen north to Bedroom '.length, doc)
        ?.suggestions.map((suggestion) => suggestion.label),
    ).toContain('south');

    expect(getCliSuggestions('connect Kitchen north one-way to Bedroom ', 'connect Kitchen north one-way to Bedroom '.length, doc)).toBeNull();
  });

  it('suggests a trailing target direction only for two-way create-and-connect commands', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Bedroom'), position: { x: 1, y: 0 } });

    expect(
      getCliSuggestions(
        'create and connect Kitchen north to Bedroom ',
        'create and connect Kitchen north to Bedroom '.length,
        doc,
      )?.suggestions.map((suggestion) => suggestion.label),
    ).toContain('south');

    expect(
      getCliSuggestions(
        'create and connect Kitchen north one-way to Bedroom ',
        'create and connect Kitchen north one-way to Bedroom '.length,
        doc,
      ),
    ).toBeNull();
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

  it('closes suggestions after a completed room adjective with a trailing space', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Kitchen'), position: { x: 0, y: 0 } });

    expect(getCliSuggestions('Kitchen is lit ', 'Kitchen is lit '.length, doc)).toBeNull();
    expect(getCliSuggestions('Kitchen is dark ', 'Kitchen is dark '.length, doc)).toBeNull();
  });

  it('suggests adjective and relative-create phrases after create plus a room name', () => {
    const result = getCliSuggestions('create Kitchen ', 'create Kitchen '.length, createEmptyMap('Test'));
    const multiWordResult = getCliSuggestions('create city park ', 'create city park '.length, createEmptyMap('Test'));
    const continuedNameResult = getCliSuggestions('create city ', 'create city '.length, createEmptyMap('Test'));
    const continuedNextWordResult = getCliSuggestions('create city p', 'create city p'.length, createEmptyMap('Test'));
    const afterCommaResult = getCliSuggestions('create ice cream stand, ', 'create ice cream stand, '.length, createEmptyMap('Test'));
    const afterCommaPartialResult = getCliSuggestions('create den, w', 'create den, w'.length, createEmptyMap('Test'));
    const afterCommaWhichResult = getCliSuggestions('create den, which ', 'create den, which '.length, createEmptyMap('Test'));

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(
      expect.arrayContaining(['<new room name>', ', which is', 'above', 'below', 'north']),
    );
    expect(multiWordResult?.suggestions.map((suggestion) => suggestion.label)).toEqual(
      expect.arrayContaining(['<new room name>', ', which is', 'above', 'below', 'north']),
    );
    expect(continuedNameResult?.suggestions.map((suggestion) => suggestion.label)).toEqual(
      expect.arrayContaining(['<new room name>', ', which is', 'above', 'below', 'north']),
    );
    expect(continuedNextWordResult?.suggestions.map((suggestion) => suggestion.label)).toEqual(
      expect.arrayContaining(['<new room name>']),
    );
    expect(afterCommaResult?.suggestions.map((suggestion) => suggestion.label)).toEqual(
      expect.arrayContaining([', which is', 'above', 'below', 'north']),
    );
    expect(afterCommaResult?.suggestions.map((suggestion) => suggestion.label)).not.toContain('<new room name>');
    expect(afterCommaPartialResult?.suggestions.map((suggestion) => suggestion.label)).toContain(', which is');
    expect(afterCommaWhichResult?.suggestions.map((suggestion) => suggestion.label)).toEqual(['is']);
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
    const afterDirection = getCliSuggestions(
      'create monkey, which is dark , west ',
      'create monkey, which is dark , west '.length,
      createEmptyMap('Test'),
    );
    const afterDirectionComma = getCliSuggestions(
      'create monkey, which is dark , west, ',
      'create monkey, which is dark , west, '.length,
      createEmptyMap('Test'),
    );
    const afterSpacedComma = getCliSuggestions(
      'create ice cream stand, which is dark , which is ',
      'create ice cream stand, which is dark , which is '.length,
      createEmptyMap('Test'),
    );

    expect(beforeComma?.suggestions.map((suggestion) => suggestion.label)).toEqual([',']);
    expect(afterComma?.suggestions.map((suggestion) => suggestion.label)).toContain('north');
    expect(afterDirection?.suggestions.map((suggestion) => suggestion.label)).toEqual(['of']);
    expect(afterDirectionComma).toBeNull();
    expect(afterSpacedComma).toBeNull();
    expect(
      getCliSuggestions(
        'create monkey, which is dark , north, which is ',
        'create monkey, which is dark , north, which is '.length,
        createEmptyMap('Test'),
      ),
    ).toBeNull();
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

  it('keeps the new-room placeholder visible while typing a create-and-connect room name', () => {
    expect(
      getCliSuggestions('create and connect city ', 'create and connect city '.length, createEmptyMap('Test'))
        ?.suggestions.map((suggestion) => suggestion.label),
    ).toEqual(expect.arrayContaining(['<new room name>', ', which is', 'north']));

    expect(
      getCliSuggestions('create and connect city p', 'create and connect city p'.length, createEmptyMap('Test'))
        ?.suggestions.map((suggestion) => suggestion.label),
    ).toEqual(expect.arrayContaining(['<new room name>']));

    expect(
      getCliSuggestions('create and connect city park ', 'create and connect city park '.length, createEmptyMap('Test'))
        ?.suggestions.map((suggestion) => suggestion.label),
    ).toEqual(expect.arrayContaining(['<new room name>', ', which is', 'north']));
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

  it('allows edit alongside east and show alongside south at the first token', () => {
    const eastResult = getCliSuggestions('e', 1, createEmptyMap('Test'));
    const southResult = getCliSuggestions('s', 1, createEmptyMap('Test'));

    expect(eastResult?.suggestions.map((suggestion) => suggestion.label)).toContain('east');
    expect(eastResult?.suggestions.map((suggestion) => suggestion.label)).toContain('edit');
    expect(southResult?.suggestions.map((suggestion) => suggestion.label)).toContain('south');
    expect(southResult?.suggestions.map((suggestion) => suggestion.label)).toContain('show');
  });

  it('suggests matching help topics after help', () => {
    const result = getCliSuggestions('help r', 6, createEmptyMap('Test'));

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(['rooms']);
  });

  it('closes suggestions after a completed help topic', () => {
    expect(getCliSuggestions('help rooms ', 'help rooms '.length, createEmptyMap('Test'))).toBeNull();
    expect(getCliSuggestions('help rooms i', 'help rooms i'.length, createEmptyMap('Test'))).toBeNull();
    expect(getCliSuggestions('h rooms ', 'h rooms '.length, createEmptyMap('Test'))).toBeNull();
  });

  it('closes suggestions after completed terminal commands', () => {
    const doc = createEmptyMap('Test');

    expect(getCliSuggestions('arrange ', 'arrange '.length, doc)).toBeNull();
    expect(getCliSuggestions('arrange x', 'arrange x'.length, doc)).toBeNull();
    expect(getCliSuggestions('arr ', 'arr '.length, doc)).toBeNull();
    expect(getCliSuggestions('arr x', 'arr x'.length, doc)).toBeNull();
    expect(getCliSuggestions('prettify ', 'prettify '.length, doc)).toBeNull();
    expect(getCliSuggestions('prettify x', 'prettify x'.length, doc)).toBeNull();
    expect(getCliSuggestions('undo ', 'undo '.length, doc)).toBeNull();
    expect(getCliSuggestions('undo x', 'undo x'.length, doc)).toBeNull();
    expect(getCliSuggestions('redo ', 'redo '.length, doc)).toBeNull();
    expect(getCliSuggestions('redo x', 'redo x'.length, doc)).toBeNull();
  });

  it('uses parser-backed room and with suggestions for notate, annotate, and ann', () => {
    let doc = createEmptyMap('Test');
    doc = addRoom(doc, { ...createRoom('Cellar'), position: { x: 0, y: 0 } });
    doc = addRoom(doc, { ...createRoom('Living Room'), position: { x: 40, y: 0 } });

    expect(getCliSuggestions('notate c', 'notate c'.length, doc)?.suggestions.map((suggestion) => suggestion.label)).toEqual(['Cellar']);
    expect(getCliSuggestions('annotate c', 'annotate c'.length, doc)?.suggestions.map((suggestion) => suggestion.label)).toEqual(['Cellar']);
    expect(getCliSuggestions('ann c', 'ann c'.length, doc)?.suggestions.map((suggestion) => suggestion.label)).toEqual(['Cellar']);
    expect(getCliSuggestions('notate cellar ', 'notate cellar '.length, doc)?.suggestions.map((suggestion) => suggestion.label)).toEqual(['with']);
    expect(getCliSuggestions('annotate cellar ', 'annotate cellar '.length, doc)?.suggestions.map((suggestion) => suggestion.label)).toEqual(['with']);
    expect(getCliSuggestions('ann cellar ', 'ann cellar '.length, doc)?.suggestions.map((suggestion) => suggestion.label)).toEqual(['with']);
    expect(getCliSuggestions('notate living room ', 'notate living room '.length, doc)?.suggestions.map((suggestion) => suggestion.label)).toEqual(['with']);
  });

  it('closes suggestions after notate and annotate enter free-text note mode', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Cellar'), position: { x: 0, y: 0 } });

    expect(getCliSuggestions('notate cellar with ', 'notate cellar with '.length, doc)).toBeNull();
    expect(getCliSuggestions('annotate cellar with ', 'annotate cellar with '.length, doc)).toBeNull();
    expect(getCliSuggestions('ann cellar with ', 'ann cellar with '.length, doc)).toBeNull();
  });

  it('uses parser-backed room suggestions after put in and take/get from', () => {
    let doc = createEmptyMap('Test');
    doc = addRoom(doc, { ...createRoom('Cellar'), position: { x: 0, y: 0 } });
    doc = addRoom(doc, { ...createRoom('Living Room'), position: { x: 40, y: 0 } });

    expect(getCliSuggestions('put lantern in c', 'put lantern in c'.length, doc)?.suggestions.map((suggestion) => suggestion.label)).toEqual(['Cellar']);
    expect(getCliSuggestions('take lantern from c', 'take lantern from c'.length, doc)?.suggestions.map((suggestion) => suggestion.label)).toEqual(['Cellar']);
    expect(getCliSuggestions('get lantern from c', 'get lantern from c'.length, doc)?.suggestions.map((suggestion) => suggestion.label)).toEqual(['Cellar']);
    expect(getCliSuggestions('take all from l', 'take all from l'.length, doc)?.suggestions.map((suggestion) => suggestion.label)).toEqual(['Living Room']);
    expect(getCliSuggestions('get all from l', 'get all from l'.length, doc)?.suggestions.map((suggestion) => suggestion.label)).toEqual(['Living Room']);
  });

  it('closes suggestions after a completed put/take/get room reference', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Cellar'), position: { x: 0, y: 0 } });

    expect(getCliSuggestions('put lantern in cellar ', 'put lantern in cellar '.length, doc)).toBeNull();
    expect(getCliSuggestions('take lantern from cellar ', 'take lantern from cellar '.length, doc)).toBeNull();
    expect(getCliSuggestions('get all from cellar ', 'get all from cellar '.length, doc)).toBeNull();
  });

  it('suggests matching rooms for show commands', () => {
    let doc = createEmptyMap('Test');
    doc = addRoom(doc, { ...createRoom('Cellar'), position: { x: 0, y: 0 } });
    doc = addRoom(doc, { ...createRoom('Control Room'), position: { x: 40, y: 0 } });

    const result = getCliSuggestions('show c', 6, doc);

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(['Cellar', 'Control Room']);
  });

  it('supports parser-backed room suggestions for show, edit, and delete aliases', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Cellar'), position: { x: 0, y: 0 } });

    expect(getCliSuggestions('s c', 's c'.length, doc)?.suggestions.map((suggestion) => suggestion.label)).toEqual(['Cellar']);
    expect(getCliSuggestions('ed c', 'ed c'.length, doc)?.suggestions.map((suggestion) => suggestion.label)).toEqual(['Cellar']);
    expect(getCliSuggestions('del c', 'del c'.length, doc)?.suggestions.map((suggestion) => suggestion.label)).toEqual(['Cellar']);
  });

  it('closes suggestions after a completed show, edit, or delete room reference', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Cellar'), position: { x: 0, y: 0 } });

    expect(getCliSuggestions('show cellar ', 'show cellar '.length, doc)).toBeNull();
    expect(getCliSuggestions('edit cellar ', 'edit cellar '.length, doc)).toBeNull();
    expect(getCliSuggestions('delete cellar ', 'delete cellar '.length, doc)).toBeNull();
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

  it('does not suggest to before a direction has been chosen in connect commands', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Ice Cream Stand'), position: { x: 0, y: 0 } });

    const result = getCliSuggestions('connect ice cream stand t', 'connect ice cream stand t'.length, doc);

    expect(result).toBeNull();
  });

  it('suggests connection annotations after a room-to-room is phrase', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Bedroom'), position: { x: 0, y: 0 } });

    const result = getCliSuggestions('bedroom to bathroom is ', 'bedroom to bathroom is '.length, doc);

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(['door', 'locked door', 'clear']);
  });

  it('inserts room-to-room fallback keywords at the caret instead of replacing the target room', () => {
    const bedroom = { ...createRoom('Bedroom'), id: 'bedroom', position: { x: 0, y: 0 } };
    const bathroom = { ...createRoom('Bathroom'), id: 'bathroom', position: { x: 40, y: 0 } };
    let doc = createEmptyMap('Test');
    doc = addRoom(doc, bedroom);
    doc = addRoom(doc, bathroom);
    doc = addConnection(doc, createConnection(bedroom.id, bathroom.id, true), 'east', 'west');

    const result = getCliSuggestions('bedroom to bathroom ', 'bedroom to bathroom '.length, doc);

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(['is']);
    expect(result).toMatchObject({
      replaceStart: 'bedroom to bathroom '.length,
      replaceEnd: 'bedroom to bathroom '.length,
      prefix: '',
    });
  });

  it('limits room-to-room second-room suggestions to rooms connected to the first room', () => {
    const kitchen = { ...createRoom('Kitchen'), id: 'kitchen', position: { x: 0, y: 0 } };
    const hallway = { ...createRoom('Hallway'), id: 'hallway', position: { x: 40, y: 0 } };
    const cellar = { ...createRoom('Cellar'), id: 'cellar', position: { x: 80, y: 0 } };
    let doc = createEmptyMap('Test');
    doc = addRoom(doc, kitchen);
    doc = addRoom(doc, hallway);
    doc = addRoom(doc, cellar);
    doc = addConnection(doc, createConnection(kitchen.id, hallway.id, true), 'east', 'west');

    const result = getCliSuggestions('kitchen to ', 'kitchen to '.length, doc);

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(['Hallway']);
  });

  it('shows a no-connected-rooms placeholder when a room-to-room source has no connected rooms', () => {
    const kitchen = { ...createRoom('Kitchen'), id: 'kitchen', position: { x: 0, y: 0 } };
    let doc = createEmptyMap('Test');
    doc = addRoom(doc, kitchen);

    const result = getCliSuggestions('kitchen to ', 'kitchen to '.length, doc);

    expect(result?.suggestions.map((suggestion) => suggestion.label)).toEqual(['<no rooms connected to Kitchen>']);
  });

  it('suggests pseudo-room continuations after directional pseudo-room phrases', () => {
    let doc = addRoom(createEmptyMap('Test'), { ...createRoom('Bedroom'), position: { x: 0, y: 0 } });
    doc = addRoom(doc, { ...createRoom('Library'), position: { x: 1, y: 0 } });
    const partialOfResult = getCliSuggestions('north o', 'north o'.length, doc);
    const partialRoomResult = getCliSuggestions('n of l', 'n of l'.length, doc);
    const shorthandResult = getCliSuggestions('west of bedroom ', 'west of bedroom '.length, doc);
    const roomResult = getCliSuggestions('the room north of bedroom ', 'the room north of bedroom '.length, doc);
    const wayResult = getCliSuggestions('the way north of bedroom ', 'the way north of bedroom '.length, doc);

    expect(partialOfResult?.suggestions.map((suggestion) => suggestion.label)).toEqual(['of']);
    expect(partialRoomResult?.suggestions.map((suggestion) => suggestion.label)).toEqual(['Library']);
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

  it('does not regress pseudo-room terminal phrase suggestions back to of mid-phrase', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Living Room'), position: { x: 0, y: 0 } });

    expect(
      getCliSuggestions(
        'the way east of living room goes on forever',
        'the way east of living room goes on forever'.length,
        doc,
      )?.suggestions.map((suggestion) => suggestion.label),
    ).toEqual(['forever']);
  });

  it('switches from the room slot to pseudo-room phrase suggestions after a completed room reference', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Living Room'), position: { x: 0, y: 0 } });

    expect(
      getCliSuggestions(
        'the way east of living room g',
        'the way east of living room g'.length,
        doc,
      )?.suggestions.map((suggestion) => suggestion.label),
    ).toEqual(['goes on forever']);

    expect(
      getCliSuggestions(
        'the way east of living room l',
        'the way east of living room l'.length,
        doc,
      )?.suggestions.map((suggestion) => suggestion.label),
    ).toEqual(['leads nowhere', 'lies death']);
  });

  it('does not allow room-to-room connection annotation grammar inside pseudo-room phrases', () => {
    const doc = addRoom(createEmptyMap('Test'), { ...createRoom('Bedroom'), position: { x: 0, y: 0 } });

    expect(getCliSuggestions('west of bedroom to ', 'west of bedroom to '.length, doc)).toBeNull();
    expect(getCliSuggestions('west of bedroom to bathroom ', 'west of bedroom to bathroom '.length, doc)).toBeNull();
    expect(getCliSuggestions('west of bedroom to bathroom is ', 'west of bedroom to bathroom is '.length, doc)).toBeNull();
  });
});
