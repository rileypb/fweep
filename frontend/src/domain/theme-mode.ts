export type ThemeModePreference = 'light' | 'dark';

const THEME_STORAGE_KEY = 'fweep-theme';

export function getStoredThemePreference(): ThemeModePreference | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === 'light' || stored === 'dark' ? stored : null;
}

export function getSystemThemePreference(): ThemeModePreference {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function getInitialThemePreference(): ThemeModePreference {
  return getStoredThemePreference() ?? getSystemThemePreference();
}

export function applyThemePreference(theme: ThemeModePreference): void {
  if (typeof document === 'undefined') {
    return;
  }

  document.documentElement.setAttribute('data-theme', theme);
}

export function persistThemePreference(theme: ThemeModePreference): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}
