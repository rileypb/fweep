import { describe, expect, it } from '@jest/globals';
import { createLocalFileAssociatedGameMetadata, inferLocalFileGameFormat } from '../../src/domain/associated-game';

describe('inferLocalFileGameFormat', () => {
  it('infers known playable formats from local file names', () => {
    expect(inferLocalFileGameFormat('story.ulx')).toBe('glulx');
    expect(inferLocalFileGameFormat('story.gblorb')).toBe('glulx');
    expect(inferLocalFileGameFormat('story.z8')).toBe('zcode');
    expect(inferLocalFileGameFormat('story.t3')).toBe('tads');
  });

  it('returns null for unknown or extensionless files', () => {
    expect(inferLocalFileGameFormat('story.zip')).toBeNull();
    expect(inferLocalFileGameFormat('story')).toBeNull();
  });
});

describe('createLocalFileAssociatedGameMetadata', () => {
  it('creates local-file metadata from the selected file', () => {
    const file = new File(['story data'], 'Galaxy Jones.gblorb', { type: 'application/octet-stream' });

    expect(createLocalFileAssociatedGameMetadata(file)).toEqual({
      sourceType: 'local-file',
      tuid: null,
      ifid: null,
      title: 'Galaxy Jones.gblorb',
      author: null,
      storyUrl: null,
      format: 'glulx',
    });
  });
});
