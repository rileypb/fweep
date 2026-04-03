import { describe, expect, it } from '@jest/globals';
import {
  clearHelpImageScriptState,
  createHelpImageScriptState,
  parseHelpImageScript,
  runHelpImageMapCommand,
} from '../../src/domain/help-image-script';

describe('parseHelpImageScript', () => {
  it('parses clear, map, export, and blank lines', () => {
    expect(parseHelpImageScript(`
clear

create Kitchen
export kitchen.png
    `)).toEqual([
      { kind: 'clear', lineNumber: 2 },
      { kind: 'map-command', lineNumber: 4, commandText: 'create Kitchen' },
      { kind: 'export', lineNumber: 5, fileName: 'kitchen.png' },
    ]);
  });
});

describe('runHelpImageMapCommand', () => {
  it('creates a room in an isolated script state', () => {
    const nextState = runHelpImageMapCommand(createHelpImageScriptState(), 'create Kitchen');

    expect(Object.values(nextState.doc.rooms).map((room) => room.name)).toEqual(['Kitchen']);
    expect(nextState.undoStack).toHaveLength(1);
  });

  it('supports create-and-connect commands from the CLI grammar', () => {
    let state = runHelpImageMapCommand(createHelpImageScriptState(), 'create Kitchen');
    state = runHelpImageMapCommand(state, 'create Pantry west of kitchen');

    const rooms = Object.values(state.doc.rooms);
    expect(rooms.map((room) => room.name).sort()).toEqual(['Kitchen', 'Pantry']);
    expect(Object.keys(state.doc.connections)).toHaveLength(1);

    const kitchen = rooms.find((room) => room.name === 'Kitchen');
    const pantry = rooms.find((room) => room.name === 'Pantry');
    expect(kitchen?.directions.west).toBeDefined();
    expect(pantry?.directions.east).toBeDefined();
  });

  it('undoes and redoes script changes', () => {
    let state = runHelpImageMapCommand(createHelpImageScriptState(), 'create Kitchen');
    state = runHelpImageMapCommand(state, 'create Pantry');
    state = runHelpImageMapCommand(state, 'undo');

    expect(Object.values(state.doc.rooms).map((room) => room.name)).toEqual(['Kitchen']);

    state = runHelpImageMapCommand(state, 'redo');
    expect(Object.values(state.doc.rooms).map((room) => room.name)).toEqual(['Kitchen', 'Pantry']);
  });

  it('clears state without leaving prior rooms behind', () => {
    let state = runHelpImageMapCommand(createHelpImageScriptState('Examples'), 'create Kitchen');
    state = clearHelpImageScriptState(state);

    expect(Object.keys(state.doc.rooms)).toHaveLength(0);
    expect(state.doc.metadata.name).toBe('Examples');
    expect(state.undoStack).toHaveLength(0);
  });
});
