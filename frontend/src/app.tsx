import { useState } from 'react';
import { MapSelectionDialog } from './components/map-selection-dialog';
import { ThemeToggle } from './components/theme-toggle';
import type { MapDocument } from './domain/map-types';

export function App(): React.JSX.Element {
  const [activeMap, setActiveMap] = useState<MapDocument | null>(null);

  return (
    <main className="app-shell">
      <h1 className="app-title">fweep</h1>
      <ThemeToggle />
      {activeMap === null ? (
        <MapSelectionDialog onMapSelected={setActiveMap} />
      ) : (
        <p style={{ padding: '2rem' }}>
          Editing: <strong>{activeMap.metadata.name}</strong>
        </p>
      )}
    </main>
  );
}
