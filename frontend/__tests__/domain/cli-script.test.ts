import { describe, expect, it } from '@jest/globals';
import { parseCliScript } from '../../src/domain/cli-script';

describe('cli-script', () => {
  it('returns commands with their original line numbers', () => {
    expect(parseCliScript('create Kitchen\nconnect Kitchen east to Hallway')).toEqual([
      { lineNumber: 1, commandText: 'create Kitchen' },
      { lineNumber: 2, commandText: 'connect Kitchen east to Hallway' },
    ]);
  });

  it('ignores blank lines and trims whitespace', () => {
    expect(parseCliScript('  create Kitchen  \n\n   \n  create Hallway\t')).toEqual([
      { lineNumber: 1, commandText: 'create Kitchen' },
      { lineNumber: 4, commandText: 'create Hallway' },
    ]);
  });
});
