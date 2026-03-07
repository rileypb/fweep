import { useEffect } from 'react';
import { MapCanvas } from './components/map-canvas';
import { MapSelectionDialog } from './components/map-selection-dialog';
import { ThemeToggle } from './components/theme-toggle';
import { useMapRouter } from './hooks/use-map-router';
import { useEditorStore } from './state/editor-store';
import { saveMap } from './storage/map-store';

export function App(): React.JSX.Element {
  const { activeMap, loading, openMap } = useMapRouter();
  const loadDocument = useEditorStore((s) => s.loadDocument);
  const unloadDocument = useEditorStore((s) => s.unloadDocument);
  const storeDoc = useEditorStore((s) => s.doc);

  // Sync the router's active map into the editor store.
  useEffect(() => {
    if (activeMap) {
      loadDocument(activeMap);
    } else {
      unloadDocument();
    }
  }, [activeMap, loadDocument, unloadDocument]);

  // Auto-save when the store document changes.
  useEffect(() => {
    if (!storeDoc) return;
    // Skip save if this is the initial load (same updatedAt as router doc).
    if (activeMap && storeDoc.metadata.updatedAt === activeMap.metadata.updatedAt) return;
    void saveMap(storeDoc);
  }, [storeDoc, activeMap]);

  return (
    <main className="app-shell">
      <h1 className="app-title">fweep</h1>
      <ThemeToggle />
      {loading ? null : activeMap === null ? (
        <MapSelectionDialog onMapSelected={openMap} />
      ) : (
        <MapCanvas mapName={activeMap.metadata.name} />
      )}
    </main>
  );
}
