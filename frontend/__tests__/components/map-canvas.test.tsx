import { describe, it, expect, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MapCanvas } from '../../src/components/map-canvas';

describe('MapCanvas', () => {
  it('renders a canvas container', () => {
    render(<MapCanvas mapName="Test Map" />);
    expect(screen.getByTestId('map-canvas')).toBeInTheDocument();
  });

  it('displays the map name', () => {
    render(<MapCanvas mapName="My Adventure" />);
    expect(screen.getByText('My Adventure')).toBeInTheDocument();
  });

  it('shows the background grid by default', () => {
    render(<MapCanvas mapName="Test" />);
    const canvas = screen.getByTestId('map-canvas');
    expect(canvas).toHaveClass('map-canvas--grid');
  });

  it('hides the background grid when showGrid is false', () => {
    render(<MapCanvas mapName="Test" showGrid={false} />);
    const canvas = screen.getByTestId('map-canvas');
    expect(canvas).not.toHaveClass('map-canvas--grid');
  });

  it('provides a button to toggle the grid on and off', async () => {
    const user = userEvent.setup();
    render(<MapCanvas mapName="Test" />);

    const canvas = screen.getByTestId('map-canvas');
    expect(canvas).toHaveClass('map-canvas--grid');

    const toggleBtn = screen.getByRole('button', { name: /toggle grid/i });
    await user.click(toggleBtn);

    expect(canvas).not.toHaveClass('map-canvas--grid');

    await user.click(toggleBtn);
    expect(canvas).toHaveClass('map-canvas--grid');
  });
});
