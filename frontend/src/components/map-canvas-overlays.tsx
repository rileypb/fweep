import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useEditorStore } from '../state/editor-store';
import {
  CONNECTION_ANNOTATION_KINDS,
  ROOM_SHAPES,
  ROOM_STROKE_STYLES,
  type Position,
  type RoomStrokeStyle,
} from '../domain/map-types';
import {
  ROOM_FILL_PALETTE,
  ROOM_STROKE_PALETTE,
  type RoomColorPaletteEntry,
  type ThemeMode,
} from '../domain/room-color-palette';
import { renderRoomShape } from './map-canvas-helpers';

interface ColorChipGroupProps {
  label: string;
  options: readonly RoomColorPaletteEntry[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  testIdPrefix: string;
}

function ColorChipGroup({
  label,
  options,
  selectedIndex,
  onSelect,
  testIdPrefix,
}: ColorChipGroupProps): React.JSX.Element {
  return (
    <div className="room-color-chip-group" role="radiogroup" aria-label={label}>
      {options.map((color, index) => {
        const isSelected = index === selectedIndex;
        return (
          <button
            key={`${label}-${color.label}`}
            type="button"
            role="radio"
            aria-label={`${label}: ${color.label}`}
            aria-checked={isSelected}
            className={`room-color-chip${isSelected ? ' room-color-chip--selected' : ''}`}
            data-testid={`${testIdPrefix}-${index}`}
            style={{
              '--room-chip-light': color.light,
              '--room-chip-dark': color.dark,
            } as React.CSSProperties}
            onClick={() => onSelect(index)}
          >
            <span className="room-color-chip-swatch" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

export interface ConnectionEditorOverlayProps {
  connectionId: string;
  visibleMapLeftInset?: number;
  onClose: () => void;
  onBackdropClose: () => void;
}

export function ConnectionEditorOverlay({
  connectionId,
  visibleMapLeftInset = 0,
  onClose,
  onBackdropClose,
}: ConnectionEditorOverlayProps): React.JSX.Element | null {
  const connection = useEditorStore((s) => s.doc?.connections[connectionId] ?? null);
  const applyConnectionEditorDraft = useEditorStore((s) => s.applyConnectionEditorDraft);
  const startLabelInputRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(() => (
    connection === null
      ? null
      : {
        strokeColorIndex: connection.strokeColorIndex,
        strokeStyle: connection.strokeStyle,
        annotation: connection.annotation,
        startLabel: connection.startLabel,
        endLabel: connection.endLabel,
      }
  ));

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onBackdropClose();
        return;
      }

      if (event.key === 'Enter') {
        const target = event.target;
        if (target instanceof HTMLButtonElement || target instanceof HTMLSelectElement) {
          return;
        }

        event.preventDefault();
        if (connection !== null && draft !== null) {
          applyConnectionEditorDraft(connection.id, draft);
        }
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [applyConnectionEditorDraft, connection, draft, onBackdropClose, onClose]);

  useLayoutEffect(() => {
    if (startLabelInputRef.current) {
      startLabelInputRef.current.focus();
      startLabelInputRef.current.select();
    }
  }, []);

  if (!connection || !draft) {
    return null;
  }

  const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth;
  const panelWidth = Math.min(42 * 16, Math.max(viewportWidth - 32, 0));
  const visiblePanelCenterX = viewportWidth === 0
    ? panelWidth / 2
    : visibleMapLeftInset + (Math.max(viewportWidth - visibleMapLeftInset, 0) / 2);
  const desiredPanelLeft = viewportWidth === 0
    ? 16
    : Math.min(Math.max(visiblePanelCenterX - (panelWidth / 2), 16), viewportWidth - 16 - panelWidth);
  const selectedAnnotationKind = draft.annotation?.kind ?? null;
  const annotationText = draft.annotation?.kind === 'text' ? draft.annotation.text ?? '' : '';
  const presetAnnotationKinds = CONNECTION_ANNOTATION_KINDS.filter((kind) => kind !== 'text');

  return (
    <div className="connection-editor-overlay" data-testid="connection-editor-overlay">
      <div className="connection-editor-backdrop" aria-hidden="true" onClick={onBackdropClose} />
      <div
        className="connection-editor-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Connection editor"
        data-testid="connection-editor-dialog"
        style={{
          justifySelf: 'start',
          marginLeft: `${desiredPanelLeft}px`,
        }}
      >
        <form
          className="connection-editor-content"
          onSubmit={(event) => {
            event.preventDefault();
            applyConnectionEditorDraft(connection.id, draft);
            onClose();
          }}
        >
          <aside className="connection-editor-sidebar" data-testid="connection-editor-sidebar">
            <div className="room-editor-field">
              <span className="room-editor-label">Stroke color</span>
              <ColorChipGroup
                label="Connection stroke color"
                options={ROOM_STROKE_PALETTE}
                selectedIndex={draft.strokeColorIndex}
                onSelect={(strokeColorIndex) => setDraft((current) => current === null ? current : { ...current, strokeColorIndex })}
                testIdPrefix="connection-stroke-color-chip"
              />
            </div>
            <div className="room-editor-field">
              <label className="room-editor-label" htmlFor="connection-editor-stroke-style-input">
                Stroke style
              </label>
              <select
                id="connection-editor-stroke-style-input"
                className="room-editor-input"
                aria-label="Connection stroke style"
                value={draft.strokeStyle}
                onChange={(e) => setDraft((current) => current === null ? current : {
                  ...current,
                  strokeStyle: e.target.value as RoomStrokeStyle,
                })}
              >
                {ROOM_STROKE_STYLES.map((strokeStyle) => (
                  <option key={strokeStyle} value={strokeStyle}>
                    {strokeStyle}
                  </option>
                ))}
              </select>
            </div>
          </aside>
          <div className="connection-editor-main" data-testid="connection-editor-main">
            <div className="room-editor-field">
              <label className="room-editor-label" htmlFor="connection-editor-start-label-input">
                Start label
              </label>
              <input
                ref={startLabelInputRef}
                id="connection-editor-start-label-input"
                className="room-editor-input"
                type="text"
                aria-label="Connection start label"
                value={draft.startLabel}
                onChange={(e) => setDraft((current) => current === null ? current : { ...current, startLabel: e.target.value })}
              />
            </div>
            <div className="room-editor-field">
              <label className="room-editor-label" htmlFor="connection-editor-end-label-input">
                End label
              </label>
              <input
                id="connection-editor-end-label-input"
                className="room-editor-input"
                type="text"
                aria-label="Connection end label"
                value={draft.endLabel}
                onChange={(e) => setDraft((current) => current === null ? current : { ...current, endLabel: e.target.value })}
              />
            </div>
            <fieldset className="connection-annotation-group">
              <legend className="room-editor-label">Annotation</legend>
              <label className="connection-annotation-option">
                <input
                  type="radio"
                  name={`connection-annotation-${connection.id}`}
                  checked={selectedAnnotationKind === null}
                  onChange={() => setDraft((current) => current === null ? current : { ...current, annotation: null })}
                />
                <span>none</span>
              </label>
              {presetAnnotationKinds.map((kind) => (
                <label key={kind} className="connection-annotation-option">
                  <input
                    type="radio"
                    name={`connection-annotation-${connection.id}`}
                    checked={selectedAnnotationKind === kind}
                    onChange={() => setDraft((current) => current === null ? current : { ...current, annotation: { kind } })}
                  />
                  <span>{kind}</span>
                </label>
              ))}
              <label className="connection-annotation-option connection-annotation-option--text">
                <input
                  type="radio"
                  name={`connection-annotation-${connection.id}`}
                  checked={selectedAnnotationKind === 'text'}
                  onChange={() => setDraft((current) => current === null ? current : {
                    ...current,
                    annotation: { kind: 'text', text: annotationText },
                  })}
                />
                <span>Text</span>
                <input
                  className="room-editor-input connection-annotation-text-input"
                  type="text"
                  aria-label="Connection annotation text"
                  value={annotationText}
                  onFocus={() => {
                    if (selectedAnnotationKind !== 'text') {
                      setDraft((current) => current === null ? current : {
                        ...current,
                        annotation: { kind: 'text', text: annotationText },
                      });
                    }
                  }}
                  onChange={(e) => setDraft((current) => current === null ? current : {
                    ...current,
                    annotation: { kind: 'text', text: e.target.value },
                  })}
                />
              </label>
            </fieldset>
            <div className="room-editor-actions">
              <button
                type="button"
                className="room-editor-secondary"
                aria-label="Cancel connection editor"
                onClick={onBackdropClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="room-editor-primary"
                aria-label="Save connection editor"
              >
                Save
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

export interface RoomEditorOverlayProps {
  roomId?: string;
  pseudoRoomId?: string;
  initialPosition?: Position;
  visibleMapLeftInset?: number;
  theme: ThemeMode;
  onClose: (savedRoomId?: string) => void;
  onBackdropClose: () => void;
}

export function RoomEditorOverlay({
  roomId,
  pseudoRoomId,
  initialPosition,
  visibleMapLeftInset = 0,
  theme,
  onClose,
  onBackdropClose,
}: RoomEditorOverlayProps): React.JSX.Element | null {
  const room = useEditorStore((s) => (roomId === undefined ? null : (s.doc?.rooms[roomId] ?? null)));
  const pseudoRoom = useEditorStore((s) => (pseudoRoomId === undefined ? null : (s.doc?.pseudoRooms[pseudoRoomId] ?? null)));
  const applyRoomEditorDraft = useEditorStore((s) => s.applyRoomEditorDraft);
  const createRoomFromEditorDraft = useEditorStore((s) => s.createRoomFromEditorDraft);
  const convertPseudoRoomToRoom = useEditorStore((s) => s.convertPseudoRoomToRoom);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const isNewRoomDraft = roomId === undefined && pseudoRoomId === undefined;
  const [draft, setDraft] = useState(() => (
    room === null
      ? {
        name: 'Room',
        shape: 'rectangle' as const,
        fillColorIndex: 0,
        strokeColorIndex: 0,
        strokeStyle: 'solid' as const,
      }
      : {
        name: room.name,
        shape: room.shape,
        fillColorIndex: room.fillColorIndex,
        strokeColorIndex: room.strokeColorIndex,
        strokeStyle: room.strokeStyle,
      }
  ));

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onBackdropClose();
        return;
      }

      if (event.key === 'Enter') {
        const target = event.target;
        if (target instanceof HTMLButtonElement || target instanceof HTMLSelectElement) {
          return;
        }

        event.preventDefault();
        if (draft !== null) {
          if (room !== null) {
            applyRoomEditorDraft(room.id, draft);
            onClose(room.id);
            return;
          }

          if (pseudoRoom !== null) {
            const createdRoomId = convertPseudoRoomToRoom(pseudoRoom.id, draft);
            onClose(createdRoomId);
            return;
          }

          if (initialPosition) {
            const createdRoomId = createRoomFromEditorDraft(initialPosition, draft);
            onClose(createdRoomId);
            return;
          }
        }
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [applyRoomEditorDraft, convertPseudoRoomToRoom, createRoomFromEditorDraft, draft, initialPosition, onBackdropClose, onClose, pseudoRoom, room]);

  useLayoutEffect(() => {
    if (nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, []);

  if ((!room && !pseudoRoom && !isNewRoomDraft) || !draft || (isNewRoomDraft && !initialPosition)) {
    return null;
  }

  const mapVisualStyle = useEditorStore((s) => s.mapVisualStyle);
  const draftRoom = {
    ...(room ?? {
      id: 'room-editor-draft',
      description: '',
      directions: {},
      isDark: false,
      locked: false,
      position: pseudoRoom?.position ?? initialPosition!,
    }),
    name: draft.name,
    shape: draft.shape,
    fillColorIndex: draft.fillColorIndex,
    strokeColorIndex: draft.strokeColorIndex,
    strokeStyle: draft.strokeStyle,
  };
  const viewportWidth = typeof window === 'undefined' ? 0 : window.innerWidth;
  const panelWidth = Math.min(42 * 16, Math.max(viewportWidth - 32, 0));
  const panelHalfWidth = panelWidth / 2;
  const visiblePanelCenterX = viewportWidth === 0
    ? panelHalfWidth + 16
    : visibleMapLeftInset + (Math.max(viewportWidth - visibleMapLeftInset, 0) / 2);
  const desiredPanelLeft = viewportWidth === 0
    ? visiblePanelCenterX
    : Math.min(Math.max(visiblePanelCenterX - panelHalfWidth, 16), viewportWidth - 16 - panelWidth);

  return (
    <div className="room-editor-overlay" data-testid="room-editor-overlay">
      <div className="room-editor-backdrop" aria-hidden="true" onClick={onBackdropClose} />
      <form
        className="room-editor-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Room editor"
        data-testid="room-editor-dialog"
        style={{
          justifySelf: 'start',
          marginLeft: `${desiredPanelLeft}px`,
        }}
        onSubmit={(event) => {
          event.preventDefault();
          if (room !== null) {
            applyRoomEditorDraft(room.id, draft);
            onClose(room.id);
            return;
          }

          if (pseudoRoom !== null) {
            const createdRoomId = convertPseudoRoomToRoom(pseudoRoom.id, draft);
            onClose(createdRoomId);
            return;
          }

          if (initialPosition) {
            const createdRoomId = createRoomFromEditorDraft(initialPosition, draft);
            onClose(createdRoomId);
            return;
          }

          onClose();
        }}
      >
        <div className="room-editor-content">
          <aside className="room-editor-sidebar">
            <div className="room-editor-field">
              <span className="room-editor-label">Fill color</span>
              <ColorChipGroup
                label="Fill color"
                options={ROOM_FILL_PALETTE}
                selectedIndex={draft.fillColorIndex}
                onSelect={(fillColorIndex) => setDraft((current) => current === null ? current : { ...current, fillColorIndex })}
                testIdPrefix="room-fill-color-chip"
              />
            </div>

            <div className="room-editor-field">
              <span className="room-editor-label">Stroke color</span>
              <ColorChipGroup
                label="Stroke color"
                options={ROOM_STROKE_PALETTE}
                selectedIndex={draft.strokeColorIndex}
                onSelect={(strokeColorIndex) => setDraft((current) => current === null ? current : { ...current, strokeColorIndex })}
                testIdPrefix="room-stroke-color-chip"
              />
            </div>

            <div className="room-editor-field">
              <label className="room-editor-label" htmlFor="room-editor-stroke-style-input">
                Stroke style
              </label>
              <select
                id="room-editor-stroke-style-input"
                className="room-editor-input"
                aria-label="Stroke style"
                value={draft.strokeStyle}
                onChange={(e) => setDraft((current) => current === null ? current : { ...current, strokeStyle: e.target.value as RoomStrokeStyle })}
              >
                {ROOM_STROKE_STYLES.map((strokeStyle) => (
                  <option key={strokeStyle} value={strokeStyle}>
                    {strokeStyle}
                  </option>
                ))}
              </select>
            </div>
          </aside>

          <div className="room-editor-main">
            <div className="room-editor-field">
              <label className="room-editor-label" htmlFor="room-editor-name-input">
                Room name
              </label>
              <input
                ref={nameInputRef}
                id="room-editor-name-input"
                className="room-editor-input room-editor-name-input"
                data-testid="room-editor-name-input"
                type="text"
                aria-label="Room name"
                maxLength={100}
                size={44}
                value={draft.name}
                onChange={(e) => setDraft((current) => current === null ? current : { ...current, name: e.target.value })}
              />
            </div>

            {mapVisualStyle === 'default' && (
              <div className="room-editor-field">
                <span className="room-editor-label">Shape</span>
                <div className="room-shape-picker" role="radiogroup" aria-label="Room shape">
                  {ROOM_SHAPES.map((shape) => (
                    <button
                      key={shape}
                      type="button"
                      role="radio"
                      aria-checked={draft.shape === shape}
                      className={`room-shape-option${draft.shape === shape ? ' room-shape-option--selected' : ''}`}
                      data-testid={`room-shape-option-${shape}`}
                      onClick={() => setDraft((current) => current === null ? current : { ...current, shape })}
                    >
                      <svg className="room-shape-option-preview" width="44" height="28" viewBox="0 0 44 28" aria-hidden="true">
                        {renderRoomShape(shape, 44, 28, draftRoom, theme, 'default')}
                      </svg>
                      <span>{shape}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="room-editor-actions">
              <button
                type="button"
                className="room-editor-secondary"
                aria-label="Cancel room editor"
                onClick={onBackdropClose}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="room-editor-primary"
                aria-label="Save room editor"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
