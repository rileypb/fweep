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

  it('shows and updates the fill toggle for rectangle and ellipse tools', async () => {
    const user = userEvent.setup();
    render(<MapDrawingToolbar />);

    expect(screen.queryByLabelText('Fill shape')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Rectangle' }));
    const fillToggle = screen.getByLabelText('Fill shape') as HTMLInputElement;
    expect(fillToggle.checked).toBe(false);

    await user.click(fillToggle);
    expect(useEditorStore.getState().drawingToolState.shapeFilled).toBe(true);
    expect(useEditorStore.getState().canvasInteractionMode).toBe('draw');

    await user.click(screen.getByRole('button', { name: 'Ellipse' }));
    expect(screen.getByLabelText('Fill shape')).toBeChecked();
  });

  it('updates color inputs and activates draw mode', async () => {
    const user = userEvent.setup();
    const { container } = render(<MapDrawingToolbar />);

    const colorInput = container.querySelector('input[type="color"]') as HTMLInputElement;
    fireEvent.change(colorInput, { target: { value: '#336699' } });
    expect(useEditorStore.getState().drawingToolState.colorRgbHex).toBe('#336699');
    expect(useEditorStore.getState().canvasInteractionMode).toBe('draw');

    const hexInput = screen.getByLabelText('Drawing color hex');
    await user.clear(hexInput);
    await user.type(hexInput, 'abc');
    fireEvent.blur(hexInput);

    expect(useEditorStore.getState().drawingToolState.colorRgbHex).toBe('#aabbcc');
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
});
