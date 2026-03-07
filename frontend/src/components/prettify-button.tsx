import { useEditorStore } from '../state/editor-store';

export function PrettifyButton(): React.JSX.Element {
  const doc = useEditorStore((state) => state.doc);
  const prettifyLayout = useEditorStore((state) => state.prettifyLayout);

  return (
    <button
      className="app-control-button"
      onClick={prettifyLayout}
      aria-label="Prettify layout"
      title="Prettify layout"
      type="button"
      disabled={doc === null}
    >
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <ellipse cx="10" cy="6.2" rx="1.8" ry="3" />
        <ellipse cx="13.1" cy="7.7" rx="1.8" ry="3" transform="rotate(55 13.1 7.7)" />
        <ellipse cx="13" cy="11.1" rx="1.8" ry="3" transform="rotate(110 13 11.1)" />
        <ellipse cx="10" cy="12.5" rx="1.8" ry="3" />
        <ellipse cx="7" cy="11.1" rx="1.8" ry="3" transform="rotate(70 7 11.1)" />
        <ellipse cx="6.9" cy="7.7" rx="1.8" ry="3" transform="rotate(125 6.9 7.7)" />
        <circle cx="10" cy="9.3" r="2.2" />
        <path d="M10 11.7C10.1 13.2 9.7 14.3 9.2 15.4C8.9 16.1 8.7 16.9 8.8 17.8" strokeLinecap="round" />
        <path d="M9.3 15.1C10.1 14.9 10.8 15.2 11.4 15.9" strokeLinecap="round" />
      </svg>
    </button>
  );
}
