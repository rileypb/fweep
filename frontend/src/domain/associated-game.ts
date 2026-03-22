import type { AssociatedGameMetadata } from './map-types';

const LOCAL_FILE_EXTENSION_TO_FORMAT: Readonly<Record<string, string>> = {
  blb: 'blorb',
  blorb: 'blorb',
  gblorb: 'glulx',
  glb: 'glulx',
  ulx: 'glulx',
  taf: 'adrift4',
  hex: 'hugo',
  gam: 'tads',
  t3: 'tads',
  zblorb: 'zcode',
  zlb: 'zcode',
  z3: 'zcode',
  z4: 'zcode',
  z5: 'zcode',
  z8: 'zcode',
};

function getFileExtension(fileName: string): string | null {
  const trimmedFileName = fileName.trim();
  const extensionIndex = trimmedFileName.lastIndexOf('.');
  if (extensionIndex <= 0 || extensionIndex === trimmedFileName.length - 1) {
    return null;
  }

  return trimmedFileName.slice(extensionIndex + 1).toLowerCase();
}

export function inferLocalFileGameFormat(fileName: string): string | null {
  const extension = getFileExtension(fileName);
  return extension === null
    ? null
    : LOCAL_FILE_EXTENSION_TO_FORMAT[extension] ?? null;
}

export function createLocalFileAssociatedGameMetadata(file: File): AssociatedGameMetadata {
  return {
    sourceType: 'local-file',
    tuid: null,
    ifid: null,
    title: file.name,
    author: null,
    storyUrl: null,
    format: inferLocalFileGameFormat(file.name),
  };
}
