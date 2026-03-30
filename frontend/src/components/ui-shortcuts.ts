import { isEditableTarget } from './map-canvas-helpers';

export interface UiShortcutSpec {
  readonly key: string;
  readonly code: string;
  readonly display: string;
  readonly ariaKeyShortcuts: string;
}

function createAltShiftShortcut(key: string): UiShortcutSpec {
  const upperKey = key.toUpperCase();
  return {
    key,
    code: `Key${upperKey}`,
    display: `Alt+Shift+${upperKey}`,
    ariaKeyShortcuts: `Alt+Shift+${upperKey}`,
  };
}

export const UI_SHORTCUTS = {
  backToMaps: createAltShiftShortcut('m'),
  toggleGrid: createAltShiftShortcut('g'),
  toggleConnectionStyle: createAltShiftShortcut('c'),
  toggleSnapToGrid: createAltShiftShortcut('s'),
  toggleMapVisualStyle: createAltShiftShortcut('v'),
  cycleCanvasTheme: createAltShiftShortcut('y'),
  toggleThemeMode: createAltShiftShortcut('d'),
  openHelp: createAltShiftShortcut('h'),
  prettifyLayout: createAltShiftShortcut('p'),
  toggleBackgroundImage: createAltShiftShortcut('o'),
  exportJson: createAltShiftShortcut('j'),
  exportPng: createAltShiftShortcut('e'),
  resetGamePanel: createAltShiftShortcut('r'),
  openStoryFile: createAltShiftShortcut('f'),
} as const satisfies Record<string, UiShortcutSpec>;

export function getShortcutTitle(label: string, shortcut: UiShortcutSpec): string {
  return label;
}

export function isUiShortcutPressed(
  event: Pick<KeyboardEvent, 'altKey' | 'code' | 'ctrlKey' | 'key' | 'metaKey' | 'repeat' | 'shiftKey'>,
  shortcut: UiShortcutSpec,
): boolean {
  return !event.repeat
    && event.altKey
    && event.shiftKey
    && !event.ctrlKey
    && !event.metaKey
    && (event.code === shortcut.code || event.key.toLowerCase() === shortcut.key);
}

export function shouldIgnoreUiShortcut(event: KeyboardEvent): boolean {
  if (event.defaultPrevented) {
    return true;
  }

  if (isEditableTarget(event.target) || isEditableTarget(document.activeElement)) {
    return true;
  }

  return document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}

export const HELP_SHORTCUT_ITEMS = [
  `Back to maps: \`${UI_SHORTCUTS.backToMaps.display}\``,
  `Toggle grid: \`${UI_SHORTCUTS.toggleGrid.display}\``,
  `Toggle connection style: \`${UI_SHORTCUTS.toggleConnectionStyle.display}\``,
  `Toggle grid snapping: \`${UI_SHORTCUTS.toggleSnapToGrid.display}\``,
  `Toggle map visual style: \`${UI_SHORTCUTS.toggleMapVisualStyle.display}\``,
  `Cycle canvas theme: \`${UI_SHORTCUTS.cycleCanvasTheme.display}\``,
  `Toggle light/dark theme: \`${UI_SHORTCUTS.toggleThemeMode.display}\``,
  `Help: \`${UI_SHORTCUTS.openHelp.display}\``,
  `Prettify layout: \`${UI_SHORTCUTS.prettifyLayout.display}\``,
  `Background image: \`${UI_SHORTCUTS.toggleBackgroundImage.display}\``,
  `Export JSON: \`${UI_SHORTCUTS.exportJson.display}\``,
  `Export PNG: \`${UI_SHORTCUTS.exportPng.display}\``,
  `Reset game panel: \`${UI_SHORTCUTS.resetGamePanel.display}\``,
  `Open story file: \`${UI_SHORTCUTS.openStoryFile.display}\``,
] as const;
