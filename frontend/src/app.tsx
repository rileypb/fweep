import { MapSelectionDialog } from './components/map-selection-dialog';
import { ThemeToggle } from './components/theme-toggle';
import { useMapRouter } from './hooks/use-map-router';

export function App(): React.JSX.Element {
  const { activeMap, loading, openMap } = useMapRouter();

  return (
    <main className="app-shell">
      <h1 className="app-title">fweep</h1>
      <ThemeToggle />
      {loading ? null : activeMap === null ? (
        <MapSelectionDialog onMapSelected={openMap} />
      ) : (
        <p style={{ padding: '2rem' }}>
          Editing: <strong>{activeMap.metadata.name}</strong>
        </p>
      )}
    </main>
  );
}
