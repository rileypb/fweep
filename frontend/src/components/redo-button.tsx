import { useEditorStore } from '../state/editor-store';

export function RedoButton(): React.JSX.Element {
  const canRedo = useEditorStore((state) => state.canRedo);
  const redo = useEditorStore((state) => state.redo);

  return (
    <button
      className="app-control-button"
      onClick={redo}
      aria-label="Redo"
      title="Redo"
      type="button"
      disabled={!canRedo}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <path d="M12 5L16.5 9.5L12 14" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M15.5 9.5H8.75C5.57 9.5 3 12.07 3 15.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
