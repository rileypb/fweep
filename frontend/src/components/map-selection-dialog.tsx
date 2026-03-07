import { useEffect, useRef, useState } from 'react';
import type { MapMetadata } from '../domain/map-types';
import { createEmptyMap, type MapDocument } from '../domain/map-types';
import { importMapFromFile, listMaps, loadMap, saveMap, deleteMap } from '../storage/map-store';

export interface MapSelectionDialogProps {
  onMapSelected: (doc: MapDocument) => void;
}

export function MapSelectionDialog({ onMapSelected }: MapSelectionDialogProps): React.JSX.Element {
  const [maps, setMaps] = useState<MapMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newMapName, setNewMapName] = useState('');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    listMaps()
      .then(setMaps)
      .catch((err: unknown) => setError(String(err)))
      .finally(() => setLoading(false));
  }, []);

  const canCreate = newMapName.trim().length > 0;

  const handleCreate = async () => {
    const name = newMapName.trim();
    if (!name) return;
    const doc = createEmptyMap(name);
    await saveMap(doc);
    onMapSelected(doc);
  };

  const handleSelect = async (id: string) => {
    const doc = await loadMap(id);
    if (doc) {
      onMapSelected(doc);
    } else {
      setError(`Map not found: ${id}`);
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const doc = await importMapFromFile(file);
      onMapSelected(doc);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteMap(id);
      setMaps((prev) => prev.filter((m) => m.id !== id));
      setConfirmingDeleteId(null);
    } catch (err: unknown) {
      setError(String(err));
    }
  };

  const formatDate = (iso: string): string => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="map-selection-backdrop">
      <div className="map-selection-dialog" role="dialog" aria-label="Choose a map">
        <h2 className="map-selection-heading">Open a Map</h2>

        {error && (
          <p className="map-selection-error" role="alert">
            {error}
          </p>
        )}

        {/* --- Existing maps --- */}
        <section className="map-selection-section">
          <h3 className="map-selection-subheading">Recent Maps</h3>
          {loading && <p className="map-selection-empty">Loading…</p>}
          {!loading && maps.length === 0 && (
            <p className="map-selection-empty">No saved maps yet.</p>
          )}
          {!loading && maps.length > 0 && (
            <ul className="map-selection-list">
              {maps.map((m) => (
                <li key={m.id} className="map-selection-list-item">
                  <button
                    className="map-selection-item"
                    type="button"
                    onClick={() => void handleSelect(m.id)}
                  >
                    <span className="map-selection-item-name">{m.name}</span>
                    <span className="map-selection-item-date">{formatDate(m.updatedAt)}</span>
                  </button>
                  {confirmingDeleteId === m.id ? (
                    <span className="map-selection-delete-confirm">
                      <button
                        className="map-selection-delete-confirm-btn"
                        type="button"
                        aria-label="Confirm delete"
                        onClick={() => void handleDelete(m.id)}
                      >
                        ✓
                      </button>
                      <button
                        className="map-selection-delete-cancel-btn"
                        type="button"
                        aria-label="Cancel delete"
                        onClick={() => setConfirmingDeleteId(null)}
                      >
                        ✕
                      </button>
                    </span>
                  ) : (
                    <button
                      className="map-selection-delete-btn"
                      type="button"
                      aria-label={`Delete ${m.name}`}
                      onClick={() => setConfirmingDeleteId(m.id)}
                    >
                      🗑
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* --- Create new map --- */}
        <section className="map-selection-section">
          <h3 className="map-selection-subheading">Create New Map</h3>
          <div className="map-selection-create-row">
            <input
              className="map-selection-input"
              type="text"
              placeholder="Map name"
              value={newMapName}
              onChange={(e) => setNewMapName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canCreate) void handleCreate();
              }}
            />
            <button className="map-selection-btn" type="button" disabled={!canCreate} onClick={() => void handleCreate()}>
              Create
            </button>
          </div>
        </section>

        {/* --- Import --- */}
        <section className="map-selection-section">
          <h3 className="map-selection-subheading">Import</h3>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="map-selection-file-input"
            onChange={(e) => void handleImport(e)}
          />
          <button
            className="map-selection-btn"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            Import from file…
          </button>
        </section>
      </div>
    </div>
  );
}
