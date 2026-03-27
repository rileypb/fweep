import { describe, expect, it } from '@jest/globals';
import { isUiShortcutPressed, UI_SHORTCUTS } from '../../src/components/ui-shortcuts';

describe('ui shortcuts', () => {
  it('matches Alt+Shift shortcuts by physical key code when Option modifies the typed character', () => {
    expect(isUiShortcutPressed({
      altKey: true,
      code: 'KeyD',
      ctrlKey: false,
      key: 'Î',
      metaKey: false,
      repeat: false,
      shiftKey: true,
    }, UI_SHORTCUTS.toggleThemeMode)).toBe(true);
  });

  it('still matches Alt+Shift shortcuts by key when code is unavailable', () => {
    expect(isUiShortcutPressed({
      altKey: true,
      code: '',
      ctrlKey: false,
      key: 'D',
      metaKey: false,
      repeat: false,
      shiftKey: true,
    }, UI_SHORTCUTS.toggleThemeMode)).toBe(true);
  });
});
