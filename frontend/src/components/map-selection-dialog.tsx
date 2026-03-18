import { useEffect, useRef, useState } from 'react';
import type { MapMetadata } from '../domain/map-types';
import { createEmptyMap, type MapDocument } from '../domain/map-types';
import { importMapFromFile, listMaps, loadMap, saveMap, deleteMap } from '../storage/map-store';

const batImage = new URL('../../bat.png', import.meta.url).href;

export interface MapSelectionStorage {
  listMaps: typeof listMaps;
  loadMap: typeof loadMap;
  saveMap: typeof saveMap;
  deleteMap: typeof deleteMap;
  importMapFromFile: typeof importMapFromFile;
}

const defaultStorage: MapSelectionStorage = {
  listMaps,
  loadMap,
  saveMap,
  deleteMap,
  importMapFromFile,
};

export interface MapSelectionDialogProps {
  onMapSelected: (doc: MapDocument) => void;
  storage?: MapSelectionStorage;
  initialError?: string | null;
}

function sortMapsByUpdatedAt(maps: readonly MapMetadata[]): MapMetadata[] {
  return [...maps].sort((left, right) => (
    new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime()
  ));
}

export function MapSelectionDialog({
  onMapSelected,
  storage = defaultStorage,
  initialError = null,
}: MapSelectionDialogProps): React.JSX.Element {
  const [maps, setMaps] = useState<MapMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(initialError);
  const [newMapName, setNewMapName] = useState('');
  const [editingMapId, setEditingMapId] = useState<string | null>(null);
  const [editingMapName, setEditingMapName] = useState('');
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let cancelled = false;

    storage.listMaps()
      .then((nextMaps) => {
        if (!cancelled) {
          setMaps(sortMapsByUpdatedAt(nextMaps));
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(String(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [storage]);

  useEffect(() => {
    setError(initialError);
  }, [initialError]);

  const canCreate = newMapName.trim().length > 0;
  const canSaveRename = editingMapName.trim().length > 0;

  const handleCreate = async () => {
    const name = newMapName.trim();
    if (!name) return;
    const doc = createEmptyMap(name);
    await storage.saveMap(doc);
    onMapSelected(doc);
  };

  const handleSelect = async (id: string) => {
    try {
      const doc = await storage.loadMap(id);
      if (doc) {
        onMapSelected(doc);
      } else {
        setError(`Map not found: ${id}`);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRenameStart = (map: MapMetadata) => {
    setConfirmingDeleteId(null);
    setEditingMapId(map.id);
    setEditingMapName(map.name);
    setError(null);
  };

  const handleRenameCancel = () => {
    setEditingMapId(null);
    setEditingMapName('');
  };

  const handleRenameSave = async (id: string) => {
    const nextName = editingMapName.trim();
    if (!nextName) {
      return;
    }

    try {
      const doc = await storage.loadMap(id);
      if (!doc) {
        setError(`Map not found: ${id}`);
        return;
      }

      const renamedDoc: MapDocument = {
        ...doc,
        metadata: {
          ...doc.metadata,
          name: nextName,
          updatedAt: new Date().toISOString(),
        },
      };
      await storage.saveMap(renamedDoc);
      setMaps((prev) => sortMapsByUpdatedAt(prev.map((map) => (
        map.id === id ? renamedDoc.metadata : map
      ))));
      handleRenameCancel();
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const doc = await storage.importMapFromFile(file);
      onMapSelected(doc);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await storage.deleteMap(id);
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
      <div className="map-selection-shell">
        <div className="map-selection-dialog" role="dialog" aria-label="Choose a map">
          <h2 className="map-selection-heading">Open a Map</h2>

          {error && (
            <p className="map-selection-error" role="alert">
              {error}
            </p>
          )}

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
                    {editingMapId === m.id ? (
                      <>
                        <div className="map-selection-rename-row">
                          <input
                            className="map-selection-input map-selection-input--inline"
                            type="text"
                            aria-label={`Rename ${m.name}`}
                            value={editingMapName}
                            autoFocus
                            onChange={(e) => setEditingMapName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && canSaveRename) {
                                void handleRenameSave(m.id);
                              }
                              if (e.key === 'Escape') {
                                handleRenameCancel();
                              }
                            }}
                          />
                          <span className="map-selection-rename-actions">
                            <button
                              className="map-selection-rename-save-btn"
                              type="button"
                              aria-label="Confirm rename"
                              disabled={!canSaveRename}
                              onClick={() => void handleRenameSave(m.id)}
                            >
                              Save
                            </button>
                            <button
                              className="map-selection-rename-cancel-btn"
                              type="button"
                              aria-label="Cancel rename"
                              onClick={handleRenameCancel}
                            >
                              Cancel
                            </button>
                          </span>
                        </div>
                        <span className="map-selection-item-date map-selection-item-date--inline">{formatDate(m.updatedAt)}</span>
                      </>
                    ) : (
                      <button
                        className="map-selection-item"
                        type="button"
                        onClick={() => void handleSelect(m.id)}
                      >
                        <span className="map-selection-item-name">{m.name}</span>
                        <span className="map-selection-item-date">{formatDate(m.updatedAt)}</span>
                      </button>
                    )}
                    {editingMapId === m.id ? null : confirmingDeleteId === m.id ? (
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
                      <span className="map-selection-item-actions">
                        <button
                          className="map-selection-rename-btn"
                          type="button"
                          aria-label={`Rename ${m.name}`}
                          onClick={() => handleRenameStart(m)}
                        >
                          Rename
                        </button>
                        <button
                          className="map-selection-delete-btn"
                          type="button"
                          aria-label={`Delete ${m.name}`}
                          onClick={() => setConfirmingDeleteId(m.id)}
                        >
                          🗑
                        </button>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="map-selection-section">
            <h3 className="map-selection-subheading">Create New Map</h3>
            <div className="map-selection-create-row">
              <label className="sr-only" htmlFor="map-selection-create-name-input">Map name</label>
              <input
                id="map-selection-create-name-input"
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

          <section className="map-selection-section">
            <h3 className="map-selection-subheading">Import</h3>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="map-selection-file-input"
              aria-label="Import map file"
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
        <div className="map-selection-art" aria-hidden="true">
          <img className="map-selection-art-image" src={batImage} alt="" />
        </div>
      </div>
    </div>
  );
}
