import { beforeEach, describe, expect, it, jest } from '@jest/globals';

const mockCanvasToBlob = jest.fn<typeof import('../../src/components/map-background-raster').canvasToBlob>();

await jest.unstable_mockModule('../../src/components/map-background-raster', () => ({
  canvasToBlob: mockCanvasToBlob,
}));

const { buildExportPngFilename, exportPngToDownload } = await import('../../src/export/export-png');

describe('export-png', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds a sanitized filename with scope and timestamp', () => {
    const filename = buildExportPngFilename('  Castle Map!  ', 'selection', new Date('2026-03-08T14:25:30'));

    expect(filename).toBe('castle-map-selection-2026-03-08-142530.png');
  });

  it('exports a canvas blob to a download link', async () => {
    const blob = new Blob(['png']);
    const click = jest.fn<() => void>();
    const remove = jest.fn<() => void>();
    const originalCreateElement = document.createElement.bind(document);
    const append = jest.spyOn(document.body, 'append').mockImplementation(() => undefined);
    const createElement = jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'a') {
        return {
          href: '',
          download: '',
          click,
          remove,
        } as unknown as HTMLAnchorElement;
      }

      return originalCreateElement(tagName);
    });

    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: jest.fn(() => 'blob:export'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: jest.fn(),
    });

    mockCanvasToBlob.mockResolvedValue(blob);

    await exportPngToDownload({
      mapName: 'Castle Map',
      scope: 'entire-map',
      canvas: {} as HTMLCanvasElement,
    });

    expect(mockCanvasToBlob).toHaveBeenCalled();
    expect(createElement).toHaveBeenCalledWith('a');
    expect(append).toHaveBeenCalled();
    expect(click).toHaveBeenCalled();
    expect(remove).toHaveBeenCalled();
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:export');
  });
});
