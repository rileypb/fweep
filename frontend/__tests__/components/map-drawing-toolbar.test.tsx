import { describe, expect, it, beforeEach } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MapDrawingToolbar } from '../../src/components/map-drawing-toolbar';
import { useEditorStore } from '../../src/state/editor-store';

function resetStore(): void {
  useEditorStore.setState(useEditorStore.getInitialState());
}

describe('MapDrawingToolbar', () => {
  beforeEach(() => {
    resetStore();
  });

  it('shows softness only for non-pencil tools', async () => {
    const user = userEvent.setup();
    render(<MapDrawingToolbar />);

    expect(screen.queryByLabelText('Drawing tool softness')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Brush' }));
    expect(screen.getByLabelText('Drawing tool softness')).toBeInTheDocument();
  });

  it('hides size and softness controls for the bucket fill tool', async () => {
    const user = userEvent.setup();
    render(<MapDrawingToolbar />);

    await user.click(screen.getByRole('button', { name: 'Bucket fill' }));

    expect(screen.queryByLabelText('Drawing tool size')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Drawing tool softness')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Bucket fill tolerance')).toBeInTheDocument();
    expect(screen.getByLabelText('Obey map')).toBeInTheDocument();
    expect(useEditorStore.getState().drawingToolState.tool).toBe('bucket');
    expect(useEditorStore.getState().canvasInteractionMode).toBe('draw');
  });

  it('shows and updates the fill toggle for rectangle and ellipse tools', async () => {
    const user = userEvent.setup();
    useEditorStore.getState().setDrawingFillColor('#ff0000');
    render(<MapDrawingToolbar />);

    expect(screen.queryByLabelText('Fill shape')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Rectangle' }));
    const fillToggle = screen.getByLabelText('Fill shape') as HTMLInputElement;
    expect(fillToggle.checked).toBe(false);
    expect(screen.getByRole('button', { name: 'Fill color swatch' })).toBeInTheDocument();
    expect(screen.getByLabelText('Fill color hex')).toBeInTheDocument();

    await user.click(fillToggle);
    expect(useEditorStore.getState().drawingToolState.shapeFilled).toBe(true);
    expect(useEditorStore.getState().canvasInteractionMode).toBe('draw');

    await user.click(screen.getByRole('button', { name: 'Fill color swatch' }));
    const fillHueSlider = screen.getByLabelText('Fill color hue') as HTMLInputElement;
    fireEvent.change(fillHueSlider, { target: { value: '30' } });
    expect(useEditorStore.getState().drawingToolState.fillColorRgbHex).toBe('#ff8000');

    const fillHexInput = screen.getByLabelText('Fill color hex');
    await user.clear(fillHexInput);
    await user.type(fillHexInput, 'def');
    fireEvent.blur(fillHexInput);
    expect(useEditorStore.getState().drawingToolState.fillColorRgbHex).toBe('#ddeeff');

    await user.click(screen.getByRole('button', { name: 'Ellipse' }));
    expect(screen.getByLabelText('Fill shape')).toBeChecked();
  });

  it('updates color inputs and activates draw mode', async () => {
    const user = userEvent.setup();
    useEditorStore.getState().setDrawingColor('#ff0000');
    render(<MapDrawingToolbar />);

    await user.click(screen.getByRole('button', { name: 'Stroke' }));
    const colorHueSlider = screen.getByLabelText('Stroke color picker hue') as HTMLInputElement;
    fireEvent.change(colorHueSlider, { target: { value: '210' } });
    expect(useEditorStore.getState().drawingToolState.colorRgbHex).toBe('#0080ff');
    expect(useEditorStore.getState().canvasInteractionMode).toBe('draw');

    const hexInput = screen.getByLabelText('Drawing color hex');
    await user.clear(hexInput);
    await user.type(hexInput, 'abc');
    fireEvent.blur(hexInput);

    expect(useEditorStore.getState().drawingToolState.colorRgbHex).toBe('#aabbcc');
  });

  it('toggles the stroke color picker when the swatch is clicked repeatedly', async () => {
    const user = userEvent.setup();
    render(<MapDrawingToolbar />);

    const swatchButton = screen.getByRole('button', { name: 'Stroke' });
    expect(swatchButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Stroke color picker')).not.toBeInTheDocument();

    await user.click(swatchButton);
    expect(swatchButton).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Stroke color picker')).toBeInTheDocument();

    await user.click(swatchButton);
    expect(swatchButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText('Stroke color picker')).not.toBeInTheDocument();
  });

  it('closes the stroke color picker on outside click and Escape', async () => {
    const user = userEvent.setup();
    render(<MapDrawingToolbar />);

    const swatchButton = screen.getByRole('button', { name: 'Stroke' });
    await user.click(swatchButton);
    expect(screen.getByLabelText('Stroke color picker')).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByLabelText('Stroke color picker')).not.toBeInTheDocument();

    await user.click(swatchButton);
    expect(screen.getByLabelText('Stroke color picker')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByLabelText('Stroke color picker')).not.toBeInTheDocument();
  });

  it('updates stroke hue across multiple color-wheel segments', async () => {
    const user = userEvent.setup();
    useEditorStore.getState().setDrawingColor('#ff0000');
    render(<MapDrawingToolbar />);

    await user.click(screen.getByRole('button', { name: 'Stroke' }));
    const hueSlider = screen.getByLabelText('Stroke color picker hue');

    fireEvent.change(hueSlider, { target: { value: '90' } });
    expect(useEditorStore.getState().drawingToolState.colorRgbHex).toBe('#80ff00');

    fireEvent.change(hueSlider, { target: { value: '150' } });
    expect(useEditorStore.getState().drawingToolState.colorRgbHex).toBe('#00ff80');

    fireEvent.change(hueSlider, { target: { value: '270' } });
    expect(useEditorStore.getState().drawingToolState.colorRgbHex).toBe('#8000ff');

    fireEvent.change(hueSlider, { target: { value: '330' } });
    expect(useEditorStore.getState().drawingToolState.colorRgbHex).toBe('#ff0080');
  });

  it('ignores color-surface interactions without drag buttons or drawable bounds', async () => {
    const user = userEvent.setup();
    useEditorStore.getState().setDrawingColor('#ff0000');
    render(<MapDrawingToolbar />);

    await user.click(screen.getByRole('button', { name: 'Stroke' }));
    const surface = screen.getByLabelText('Stroke color picker surface');
    const initialColor = useEditorStore.getState().drawingToolState.colorRgbHex;

    Object.defineProperty(surface, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        x: 0,
        y: 0,
        left: 0,
        top: 0,
        right: 0,
        bottom: 0,
        width: 0,
        height: 0,
        toJSON: () => ({}),
      }),
    });

    fireEvent.pointerMove(surface, { clientX: 80, clientY: 20, buttons: 0 });
    expect(useEditorStore.getState().drawingToolState.colorRgbHex).toBe(initialColor);

    fireEvent.pointerDown(surface, { clientX: 80, clientY: 20, buttons: 1 });
    expect(useEditorStore.getState().drawingToolState.colorRgbHex).toBe(initialColor);
  });

  it('updates opacity and softness sliders', async () => {
    const user = userEvent.setup();
    render(<MapDrawingToolbar />);

    await user.click(screen.getByRole('button', { name: 'Ellipse' }));

    fireEvent.change(screen.getByLabelText('Drawing tool opacity'), { target: { value: '25' } });
    fireEvent.change(screen.getByLabelText('Drawing tool softness'), { target: { value: '80' } });

    expect(useEditorStore.getState().drawingToolState.opacity).toBe(0.25);
    expect(useEditorStore.getState().drawingToolState.softness).toBe(0.8);
    expect(useEditorStore.getState().canvasInteractionMode).toBe('draw');
  });

  it('updates the bucket fill tolerance slider', async () => {
    const user = userEvent.setup();
    render(<MapDrawingToolbar />);

    await user.click(screen.getByRole('button', { name: 'Bucket fill' }));
    fireEvent.change(screen.getByLabelText('Bucket fill tolerance'), { target: { value: '48' } });

    expect(useEditorStore.getState().drawingToolState.bucketTolerance).toBe(48);
    expect(useEditorStore.getState().canvasInteractionMode).toBe('draw');
  });

  it('updates the obey map checkbox for bucket fill', async () => {
    const user = userEvent.setup();
    render(<MapDrawingToolbar />);

    await user.click(screen.getByRole('button', { name: 'Bucket fill' }));
    await user.click(screen.getByLabelText('Obey map'));

    expect(useEditorStore.getState().drawingToolState.bucketObeyMap).toBe(true);
    expect(useEditorStore.getState().canvasInteractionMode).toBe('draw');
  });

  it('toggles between map and draw modes from the single mode button', async () => {
    const user = userEvent.setup();
    render(<MapDrawingToolbar />);

    const toggle = screen.getByTestId('canvas-interaction-mode-toggle');
    expect(toggle).toHaveAccessibleName('Switch to draw mode');
    expect(useEditorStore.getState().canvasInteractionMode).toBe('map');

    await user.click(toggle);
    expect(useEditorStore.getState().canvasInteractionMode).toBe('draw');
    expect(toggle).toHaveAccessibleName('Switch to map mode');

    await user.click(toggle);
    expect(useEditorStore.getState().canvasInteractionMode).toBe('map');
    expect(toggle).toHaveAccessibleName('Switch to draw mode');
  });

  it('clamps the size slider display based on the active tool', async () => {
    const user = userEvent.setup();
    useEditorStore.getState().setDrawingSize(40);
    render(<MapDrawingToolbar />);

    const sizeSlider = screen.getByLabelText('Drawing tool size') as HTMLInputElement;
    expect(sizeSlider.value).toBe('6');
    expect(sizeSlider.max).toBe('6');

    await user.click(screen.getByRole('button', { name: 'Brush' }));
    expect(sizeSlider.max).toBe('64');
    expect(sizeSlider.value).toBe('40');
  });

  it('updates the size slider and switches to draw mode', async () => {
    const user = userEvent.setup();
    render(<MapDrawingToolbar />);

    await user.click(screen.getByRole('button', { name: 'Brush' }));
    fireEvent.change(screen.getByLabelText('Drawing tool size'), { target: { value: '28' } });

    expect(useEditorStore.getState().drawingToolState.size).toBe(28);
    expect(useEditorStore.getState().canvasInteractionMode).toBe('draw');
  });
});
