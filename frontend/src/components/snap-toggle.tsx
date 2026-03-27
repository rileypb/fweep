import { useEditorStore } from '../state/editor-store';
import { getShortcutTitle, UI_SHORTCUTS } from './ui-shortcuts';

export function SnapToggle(): React.JSX.Element {
  const snapToGridEnabled = useEditorStore((s) => s.snapToGridEnabled);
  const toggleSnapToGrid = useEditorStore((s) => s.toggleSnapToGrid);

  return (
    <button
      className="app-control-button"
      onClick={toggleSnapToGrid}
      aria-label={snapToGridEnabled ? 'Disable grid snapping' : 'Enable grid snapping'}
      aria-keyshortcuts={UI_SHORTCUTS.toggleSnapToGrid.ariaKeyShortcuts}
      data-shortcut={UI_SHORTCUTS.toggleSnapToGrid.display}
      title={getShortcutTitle(
        snapToGridEnabled ? 'Disable grid snapping' : 'Enable grid snapping',
        UI_SHORTCUTS.toggleSnapToGrid,
      )}
      type="button"
      aria-pressed={snapToGridEnabled}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M2 2h16v16H2z" />
        <path d="M2 7h16M2 12h16M7 2v16M12 2v16" opacity={snapToGridEnabled ? '1' : '0.45'} />
        {!snapToGridEnabled && <path d="M4 16 16 4" strokeWidth="2" />}
      </svg>
    </button>
  );
}
