import { beforeEach, describe, expect, it } from '@jest/globals';
import {
  applyThemePreference,
  getInitialThemePreference,
  getStoredThemePreference,
  getSystemThemePreference,
  persistThemePreference,
} from '../../src/domain/theme-mode';

describe('theme-mode', () => {
  beforeEach(() => {
    localStorage.removeItem('fweep-theme');
    document.documentElement.removeAttribute('data-theme');
  });

  it('uses the stored preference when available', () => {
    localStorage.setItem('fweep-theme', 'dark');

    expect(getStoredThemePreference()).toBe('dark');
    expect(getInitialThemePreference()).toBe('dark');
  });

  it('falls back to the system preference when nothing is stored', () => {
    expect(getSystemThemePreference()).toBe('light');
    expect(getInitialThemePreference()).toBe('light');
  });

  it('applies and persists the chosen preference', () => {
    applyThemePreference('dark');
    persistThemePreference('dark');

    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('fweep-theme')).toBe('dark');
  });
});
