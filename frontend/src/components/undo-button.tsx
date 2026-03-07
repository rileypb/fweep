import { useEditorStore } from '../state/editor-store';

export function UndoButton(): React.JSX.Element {
  const canUndo = useEditorStore((state) => state.canUndo);
  const undo = useEditorStore((state) => state.undo);

  return (
    <button
      className="app-control-button"
      onClick={undo}
      aria-label="Undo"
      title="Undo"
      type="button"
      disabled={!canUndo}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
        <path d="M8 5L3.5 9.5L8 14" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4.5 9.5H11.25C14.43 9.5 17 12.07 17 15.25" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
