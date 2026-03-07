import { useEffect, useRef } from 'react';
import { MapCanvas } from './components/map-canvas';
import { PrettifyButton } from './components/prettify-button';
import { RedoButton } from './components/redo-button';
import { MapSelectionDialog } from './components/map-selection-dialog';
import { SnapToggle } from './components/snap-toggle';
import { ThemeToggle } from './components/theme-toggle';
import { UndoButton } from './components/undo-button';
import { useMapRouter } from './hooks/use-map-router';
import { useEditorStore } from './state/editor-store';
import { saveMap } from './storage/map-store';

export function App(): React.JSX.Element {
  const { activeMap, loading, openMap } = useMapRouter();
  const loadDocument = useEditorStore((s) => s.loadDocument);
  const unloadDocument = useEditorStore((s) => s.unloadDocument);
  const storeDoc = useEditorStore((s) => s.doc);
  const pendingInitialSaveSkipKeyRef = useRef<string | null>(null);

  // Sync the router's active map into the editor store.
  useEffect(() => {
    if (activeMap) {
      pendingInitialSaveSkipKeyRef.current = `${activeMap.metadata.id}:${activeMap.metadata.updatedAt}`;
      loadDocument(activeMap);
    } else {
      pendingInitialSaveSkipKeyRef.current = null;
      unloadDocument();
    }
  }, [activeMap, loadDocument, unloadDocument]);

  // Auto-save when the store document changes.
  useEffect(() => {
    if (!storeDoc) return;
    const currentDocKey = `${storeDoc.metadata.id}:${storeDoc.metadata.updatedAt}`;
    if (pendingInitialSaveSkipKeyRef.current === currentDocKey) {
      pendingInitialSaveSkipKeyRef.current = null;
      return;
    }

    pendingInitialSaveSkipKeyRef.current = null;
    void saveMap(storeDoc);
  }, [storeDoc]);

  return (
    <main className="app-shell">
      <h1 className="app-title">fweep</h1>
      <div className="app-controls">
        <UndoButton />
        <RedoButton />
        <PrettifyButton />
        <SnapToggle />
        <ThemeToggle />
      </div>
      {loading ? null : activeMap === null ? (
        <MapSelectionDialog onMapSelected={openMap} />
      ) : (
        <MapCanvas mapName={activeMap.metadata.name} />
      )}
    </main>
  );
}
