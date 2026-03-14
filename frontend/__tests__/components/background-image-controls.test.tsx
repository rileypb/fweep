import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BackgroundImageControls } from '../../src/components/background-image-controls';
import { createEmptyMap } from '../../src/domain/map-types';
import { useEditorStore } from '../../src/state/editor-store';

function resetStore(): void {
  useEditorStore.setState(useEditorStore.getInitialState());
}

class MockImage {
  static nextWidth = 640;
  static nextHeight = 480;
  static failNextLoad = false;

  naturalWidth = MockImage.nextWidth;
  naturalHeight = MockImage.nextHeight;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;

  set src(_value: string) {
    this.naturalWidth = MockImage.nextWidth;
    this.naturalHeight = MockImage.nextHeight;
    if (MockImage.failNextLoad) {
      MockImage.failNextLoad = false;
      this.onerror?.();
      return;
    }
    this.onload?.();
  }
}

describe('BackgroundImageControls', () => {
  const OriginalImage = globalThis.Image;

  beforeEach(() => {
    resetStore();
    useEditorStore.getState().loadDocument(createEmptyMap('Test'));
    MockImage.nextWidth = 640;
    MockImage.nextHeight = 480;
    MockImage.failNextLoad = false;
    globalThis.Image = MockImage as unknown as typeof Image;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    globalThis.Image = OriginalImage;
  });

  it('opens the panel and imports an uploaded image', async () => {
    const user = userEvent.setup();
    render(<BackgroundImageControls />);

    await user.click(screen.getByRole('button', { name: 'Background image' }));
    expect(screen.getByTestId('background-image-panel')).toBeInTheDocument();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['png-data'], 'overlay.png', { type: 'image/png' });

    await user.upload(fileInput, file);

    await waitFor(() => {
      expect(useEditorStore.getState().doc?.background.referenceImage).toMatchObject({
        name: 'overlay.png',
        mimeType: 'image/png',
        width: 640,
        height: 480,
        zoom: 1,
      });
    });

    expect(screen.getByText('overlay.png')).toBeInTheDocument();
    expect(screen.getByText('Centered on map origin. Native size: 640 x 480px.')).toBeInTheDocument();
    expect(screen.getByLabelText('Background image zoom')).toHaveValue('100');
  });

  it('removes the stored background image', async () => {
    const user = userEvent.setup();
    useEditorStore.getState().setBackgroundReferenceImage({
      id: 'background-image-1',
      name: 'overlay.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,AAAA',
      sourceUrl: null,
      width: 640,
      height: 480,
      zoom: 1,
    });

    render(<BackgroundImageControls />);

    await user.click(screen.getByRole('button', { name: 'Background image' }));
    await user.click(screen.getByRole('button', { name: 'Remove' }));

    expect(useEditorStore.getState().doc?.background.referenceImage).toBeNull();
    expect(screen.queryByLabelText('Background image zoom')).not.toBeInTheDocument();
  });

  it('allows free typing in the zoom field and commits on Enter', async () => {
    const user = userEvent.setup();
    useEditorStore.getState().setBackgroundReferenceImage({
      id: 'background-image-1',
      name: 'overlay.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,AAAA',
      sourceUrl: null,
      width: 640,
      height: 480,
      zoom: 1,
    });

    render(<BackgroundImageControls />);

    await user.click(screen.getByRole('button', { name: 'Background image' }));
    const zoomInput = screen.getByLabelText('Background image zoom');

    await user.clear(zoomInput);
    await user.type(zoomInput, '1');
    expect(zoomInput).toHaveValue('1');
    expect(useEditorStore.getState().doc?.background.referenceImage?.zoom).toBe(1);

    await user.type(zoomInput, '00{enter}');

    expect(zoomInput).toHaveValue('100');
    expect(useEditorStore.getState().doc?.background.referenceImage?.zoom).toBe(1);
  });

  it('ignores non-numeric typing in the zoom field', async () => {
    const user = userEvent.setup();
    useEditorStore.getState().setBackgroundReferenceImage({
      id: 'background-image-1',
      name: 'overlay.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,AAAA',
      sourceUrl: null,
      width: 640,
      height: 480,
      zoom: 1.75,
    });

    render(<BackgroundImageControls />);

    await user.click(screen.getByRole('button', { name: 'Background image' }));
    const zoomInput = screen.getByLabelText('Background image zoom');

    await user.clear(zoomInput);
    await user.type(zoomInput, 'abc');
    expect(zoomInput).toHaveValue('');

    await user.type(zoomInput, '250');
    expect(zoomInput).toHaveValue('250');
    expect(useEditorStore.getState().doc?.background.referenceImage?.zoom).toBe(1.75);
  });

  it('shows an error when the uploaded image cannot be decoded', async () => {
    const user = userEvent.setup();
    MockImage.failNextLoad = true;

    render(<BackgroundImageControls />);

    await user.click(screen.getByRole('button', { name: 'Background image' }));
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['not-a-real-image'], 'broken.png', { type: 'image/png' });

    await user.upload(fileInput, file);

    expect(await screen.findByRole('alert')).toHaveTextContent('Failed to decode image.');
    expect(useEditorStore.getState().doc?.background.referenceImage).toBeNull();
  });

  it('resets invalid zoom input to the saved value on blur', async () => {
    const user = userEvent.setup();
    useEditorStore.getState().setBackgroundReferenceImage({
      id: 'background-image-1',
      name: 'overlay.png',
      mimeType: 'image/png',
      dataUrl: 'data:image/png;base64,AAAA',
      sourceUrl: null,
      width: 640,
      height: 480,
      zoom: 1.25,
    });

    render(<BackgroundImageControls />);

    await user.click(screen.getByRole('button', { name: 'Background image' }));
    const zoomInput = screen.getByLabelText('Background image zoom');

    await user.clear(zoomInput);
    act(() => {
      fireEvent.blur(zoomInput);
    });

    expect(zoomInput).toHaveValue('125');
    expect(useEditorStore.getState().doc?.background.referenceImage?.zoom).toBe(1.25);
  });
});
