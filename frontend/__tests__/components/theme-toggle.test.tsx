import { describe, it, expect, beforeEach } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeToggle } from '../../src/components/theme-toggle';

describe('ThemeToggle', () => {
  beforeEach(() => {
    // Reset theme state between tests
    localStorage.removeItem('fweep-theme');
    document.documentElement.removeAttribute('data-theme');
  });

  it('renders a button with an accessible label', () => {
    render(<ThemeToggle />);
    const btn = screen.getByRole('button', { name: /switch to .+ mode/i });
    expect(btn).toBeInTheDocument();
  });

  it('toggles data-theme on the root element when clicked', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const btn = screen.getByRole('button');

    // The initial theme depends on matchMedia; just click to toggle.
    const initialTheme = document.documentElement.getAttribute('data-theme');
    await user.click(btn);
    const newTheme = document.documentElement.getAttribute('data-theme');
    expect(newTheme).not.toBe(initialTheme);
  });

  it('persists the selected theme to localStorage', async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);
    const btn = screen.getByRole('button');

    await user.click(btn);
    const stored = localStorage.getItem('fweep-theme');
    expect(['light', 'dark']).toContain(stored);
  });

  it('toggles data-theme from the keyboard shortcut', () => {
    render(<ThemeToggle />);

    const initialTheme = document.documentElement.getAttribute('data-theme');
    fireEvent.keyDown(window, { key: 'D', altKey: true, shiftKey: true });

    expect(document.documentElement.getAttribute('data-theme')).not.toBe(initialTheme);
  });
});
