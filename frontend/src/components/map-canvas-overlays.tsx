import { useCallback, useEffect, useRef } from 'react';
import { useEditorStore } from '../state/editor-store';
import {
  CONNECTION_ANNOTATION_KINDS,
  ROOM_SHAPES,
  ROOM_STROKE_STYLES,
  type RoomStrokeStyle,
} from '../domain/map-types';
import {
  ROOM_FILL_PALETTE,
  ROOM_STROKE_PALETTE,
  type RoomColorPaletteEntry,
  type ThemeMode,
} from '../domain/room-color-palette';
import { getRoomScreenGeometry, renderRoomShape } from './map-canvas-helpers';
import type { PanOffset } from './use-map-viewport';

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
  onClose: () => void;
  onBackdropClose: () => void;
}

export function ConnectionEditorOverlay({
  connectionId,
  onClose,
  onBackdropClose,
}: ConnectionEditorOverlayProps): React.JSX.Element | null {
  const connection = useEditorStore((s) => s.doc?.connections[connectionId] ?? null);
  const setConnectionAnnotation = useEditorStore((s) => s.setConnectionAnnotation);
  const setConnectionLabels = useEditorStore((s) => s.setConnectionLabels);
  const setConnectionStyle = useEditorStore((s) => s.setConnectionStyle);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  if (!connection) {
    return null;
  }

  const selectedAnnotationKind = connection.annotation?.kind ?? null;
  const annotationText = connection.annotation?.kind === 'text' ? connection.annotation.text ?? '' : '';
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
      >
        <button
          className="connection-editor-close"
          type="button"
          aria-label="Close connection editor"
          onClick={onClose}
        >
          ×
        </button>
        <div className="connection-editor-content">
          <aside className="connection-editor-sidebar" data-testid="connection-editor-sidebar">
            <div className="room-editor-field">
              <span className="room-editor-label">Stroke color</span>
              <ColorChipGroup
                label="Connection stroke color"
                options={ROOM_STROKE_PALETTE}
                selectedIndex={connection.strokeColorIndex}
                onSelect={(strokeColorIndex) => setConnectionStyle(connection.id, { strokeColorIndex })}
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
                value={connection.strokeStyle}
                onChange={(e) => setConnectionStyle(connection.id, { strokeStyle: e.target.value as RoomStrokeStyle })}
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
                id="connection-editor-start-label-input"
                className="room-editor-input"
                type="text"
                aria-label="Connection start label"
                value={connection.startLabel}
                onChange={(e) => setConnectionLabels(connection.id, { startLabel: e.target.value })}
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
                value={connection.endLabel}
                onChange={(e) => setConnectionLabels(connection.id, { endLabel: e.target.value })}
              />
            </div>
            <fieldset className="connection-annotation-group">
              <legend className="room-editor-label">Annotation</legend>
              <label className="connection-annotation-option">
                <input
                  type="radio"
                  name={`connection-annotation-${connection.id}`}
                  checked={selectedAnnotationKind === null}
                  onChange={() => setConnectionAnnotation(connection.id, null)}
                />
                <span>none</span>
              </label>
              {presetAnnotationKinds.map((kind) => (
                <label key={kind} className="connection-annotation-option">
                  <input
                    type="radio"
                    name={`connection-annotation-${connection.id}`}
                    checked={selectedAnnotationKind === kind}
                    onChange={() => setConnectionAnnotation(connection.id, { kind })}
                  />
                  <span>{kind}</span>
                </label>
              ))}
              <label className="connection-annotation-option connection-annotation-option--text">
                <input
                  type="radio"
                  name={`connection-annotation-${connection.id}`}
                  checked={selectedAnnotationKind === 'text'}
                  onChange={() => setConnectionAnnotation(connection.id, { kind: 'text', text: annotationText })}
                />
                <span>Text</span>
                <input
                  className="room-editor-input connection-annotation-text-input"
                  type="text"
                  aria-label="Connection annotation text"
                  value={annotationText}
                  onFocus={() => {
                    if (selectedAnnotationKind !== 'text') {
                      setConnectionAnnotation(connection.id, { kind: 'text', text: annotationText });
                    }
                  }}
                  onChange={(e) => setConnectionAnnotation(connection.id, { kind: 'text', text: e.target.value })}
                />
              </label>
            </fieldset>
          </div>
        </div>
      </div>
    </div>
  );
}

export interface RoomEditorOverlayProps {
  roomId: string;
  panOffset: PanOffset;
  canvasRect: DOMRect | null;
  theme: ThemeMode;
  onClose: () => void;
  onBackdropClose: () => void;
}

export function RoomEditorOverlay({
  roomId,
  panOffset,
  canvasRect,
  theme,
  onClose,
  onBackdropClose,
}: RoomEditorOverlayProps): React.JSX.Element | null {
  const room = useEditorStore((s) => s.doc?.rooms[roomId] ?? null);
  const renameRoom = useEditorStore((s) => s.renameRoom);
  const setRoomShape = useEditorStore((s) => s.setRoomShape);
  const setRoomStyle = useEditorStore((s) => s.setRoomStyle);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const firstShapeOptionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  useEffect(() => {
    if (nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, []);

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      firstShapeOptionRef.current?.focus();
    }
  }, []);

  if (!room) {
    return null;
  }

  const roomGeometry = getRoomScreenGeometry(room, panOffset, canvasRect);

  return (
    <div className="room-editor-overlay" data-testid="room-editor-overlay">
      <div className="room-editor-backdrop" aria-hidden="true" onClick={onBackdropClose} />
      <div
        className="room-node room-editor-room-node"
        data-testid="room-editor-room-node"
        data-room-shape={room.shape}
        style={{
          transform: `translate(${roomGeometry.centerX}px, ${roomGeometry.top}px) translateX(-50%)`,
          width: `${roomGeometry.width}px`,
          height: `${roomGeometry.height}px`,
        }}
      >
        <svg
          className="room-editor-room-svg"
          aria-hidden="true"
          width={roomGeometry.width}
          height={roomGeometry.height}
        >
          {renderRoomShape(room.shape, roomGeometry.width, roomGeometry.height, room, theme)}
        </svg>
        <input
          ref={nameInputRef}
          className="room-name-input room-editor-room-name-input"
          data-testid="room-editor-name-input"
          type="text"
          aria-label="Room name"
          value={room.name}
          onChange={(e) => renameRoom(room.id, e.target.value, { historyMergeKey: `room:${room.id}:name` })}
          onKeyDown={handleNameKeyDown}
        />
      </div>
      <div
        className="room-editor-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Room editor"
        data-testid="room-editor-dialog"
      >
        <button
          className="room-editor-close"
          type="button"
          aria-label="Close room editor"
          onClick={onClose}
        >
          ×
        </button>

        <div className="room-editor-content">
          <aside className="room-editor-sidebar">
            <div className="room-editor-field">
              <span className="room-editor-label">Fill color</span>
              <ColorChipGroup
                label="Fill color"
                options={ROOM_FILL_PALETTE}
                selectedIndex={room.fillColorIndex}
                onSelect={(fillColorIndex) => setRoomStyle(room.id, { fillColorIndex })}
                testIdPrefix="room-fill-color-chip"
              />
            </div>

            <div className="room-editor-field">
              <span className="room-editor-label">Stroke color</span>
              <ColorChipGroup
                label="Stroke color"
                options={ROOM_STROKE_PALETTE}
                selectedIndex={room.strokeColorIndex}
                onSelect={(strokeColorIndex) => setRoomStyle(room.id, { strokeColorIndex })}
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
                value={room.strokeStyle}
                onChange={(e) => setRoomStyle(room.id, { strokeStyle: e.target.value as RoomStrokeStyle })}
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
              <span className="room-editor-label">Shape</span>
              <div className="room-shape-picker" role="radiogroup" aria-label="Room shape">
                {ROOM_SHAPES.map((shape, index) => (
                  <button
                    key={shape}
                    ref={index === 0 ? firstShapeOptionRef : undefined}
                    type="button"
                    role="radio"
                    aria-checked={room.shape === shape}
                    className={`room-shape-option${room.shape === shape ? ' room-shape-option--selected' : ''}`}
                    data-testid={`room-shape-option-${shape}`}
                    onClick={() => setRoomShape(room.id, shape)}
                  >
                    <svg className="room-shape-option-preview" width="44" height="28" viewBox="0 0 44 28" aria-hidden="true">
                      {renderRoomShape(shape, 44, 28, room, theme)}
                    </svg>
                    <span>{shape}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
