import { useEffect, useRef } from 'react';
import type { StickyNote } from '../domain/map-types';
import { useEditorStore } from '../state/editor-store';
import { STICKY_NOTE_MIN_HEIGHT, STICKY_NOTE_WIDTH, getStickyNoteHeight } from '../graph/sticky-note-geometry';
import type { PanOffset } from './use-map-viewport';

function autoResizeTextarea(textarea: HTMLTextAreaElement | null): void {
  if (!textarea) {
    return;
  }

  textarea.style.height = '0px';
  textarea.style.height = `${Math.max(STICKY_NOTE_MIN_HEIGHT - 24, textarea.scrollHeight)}px`;
}

export interface MapCanvasStickyNoteProps {
  readonly stickyNote: StickyNote;
  readonly isSelected: boolean;
  readonly isEditing: boolean;
  readonly toMapPoint: (clientX: number, clientY: number) => PanOffset;
  readonly onOpenEditor: (stickyNoteId: string) => void;
  readonly onCloseEditor: () => void;
}

export function MapCanvasStickyNote({
  stickyNote,
  isSelected,
  isEditing,
  toMapPoint,
  onOpenEditor,
  onCloseEditor,
}: MapCanvasStickyNoteProps): React.JSX.Element {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const setStickyNoteText = useEditorStore((s) => s.setStickyNoteText);
  const selectStickyNote = useEditorStore((s) => s.selectStickyNote);
  const addStickyNoteToSelection = useEditorStore((s) => s.addStickyNoteToSelection);
  const startStickyNoteDrag = useEditorStore((s) => s.startStickyNoteDrag);
  const updateStickyNoteDrag = useEditorStore((s) => s.updateStickyNoteDrag);
  const endStickyNoteDrag = useEditorStore((s) => s.endStickyNoteDrag);
  const moveStickyNotes = useEditorStore((s) => s.moveStickyNotes);
  const moveRooms = useEditorStore((s) => s.moveRooms);
  const selectionDrag = useEditorStore((s) => s.selectionDrag);
  const startStickyNoteLinkDrag = useEditorStore((s) => s.startStickyNoteLinkDrag);
  const updateStickyNoteLinkDrag = useEditorStore((s) => s.updateStickyNoteLinkDrag);
  const completeStickyNoteLinkDrag = useEditorStore((s) => s.completeStickyNoteLinkDrag);
  const cancelStickyNoteLinkDrag = useEditorStore((s) => s.cancelStickyNoteLinkDrag);

  const height = getStickyNoteHeight(stickyNote.text);
  const isDragging = selectionDrag !== null && selectionDrag.stickyNoteIds.includes(stickyNote.id);
  const visualX = stickyNote.position.x + (isDragging ? selectionDrag.dx : 0);
  const visualY = stickyNote.position.y + (isDragging ? selectionDrag.dy : 0);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      autoResizeTextarea(textareaRef.current);
    }
  }, [isEditing, stickyNote.text]);

  return (
    <div
      className={`sticky-note-wrapper${isDragging ? ' sticky-note-wrapper--dragging' : ''}`}
      style={{
        width: `${STICKY_NOTE_WIDTH}px`,
        minHeight: `${height}px`,
        transform: `translate(${visualX}px, ${visualY}px)`,
      }}
    >
      {isSelected && (
        <svg
          className="sticky-note-selection-outline"
          data-testid="sticky-note-selection-outline"
          width={STICKY_NOTE_WIDTH + 8}
          height={height + 8}
          style={{
            position: 'absolute',
            left: '-4px',
            top: '-4px',
            overflow: 'visible',
            pointerEvents: 'none',
            zIndex: 2,
          }}
        >
          <rect
            className="room-selection-outline"
            x={0}
            y={0}
            width={STICKY_NOTE_WIDTH + 8}
            height={height + 8}
            rx={12}
            ry={12}
          />
        </svg>
      )}
      <div
        className="sticky-note"
        data-testid="sticky-note"
        data-sticky-note-id={stickyNote.id}
        style={{
          width: `${STICKY_NOTE_WIDTH}px`,
          minHeight: `${height}px`,
          zIndex: 1,
        }}
        onMouseDown={(event) => {
          if (event.button !== 0) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();

          if (event.altKey) {
            const startPoint = toMapPoint(event.clientX, event.clientY);
            startStickyNoteLinkDrag(stickyNote.id, startPoint.x, startPoint.y);

            const handleMouseMove = (moveEvent: MouseEvent) => {
              const cursorPoint = toMapPoint(moveEvent.clientX, moveEvent.clientY);
              updateStickyNoteLinkDrag(cursorPoint.x, cursorPoint.y);
            };

            const handleMouseUp = (upEvent: MouseEvent) => {
              document.removeEventListener('mousemove', handleMouseMove);
              document.removeEventListener('mouseup', handleMouseUp);

              const roomEl = (upEvent.target as Element | null)?.closest?.('[data-room-id]') as HTMLElement | null;
              if (roomEl) {
                completeStickyNoteLinkDrag(roomEl.getAttribute('data-room-id')!);
              } else {
                cancelStickyNoteLinkDrag();
              }
            };

            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            return;
          }

          const startX = event.clientX;
          const startY = event.clientY;
          startStickyNoteDrag(stickyNote.id);

          const handleMouseMove = (moveEvent: MouseEvent) => {
            updateStickyNoteDrag(moveEvent.clientX - startX, moveEvent.clientY - startY);
          };

          const handleMouseUp = (upEvent: MouseEvent) => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);

            const dx = upEvent.clientX - startX;
            const dy = upEvent.clientY - startY;
            const dragSelection = useEditorStore.getState().selectionDrag;
            endStickyNoteDrag();

            if (dx !== 0 || dy !== 0) {
              const nextStickyNotePositions = Object.fromEntries(
                (dragSelection?.stickyNoteIds ?? []).flatMap((draggedStickyNoteId) => {
                  const draggedStickyNote = useEditorStore.getState().doc?.stickyNotes[draggedStickyNoteId];
                  if (!draggedStickyNote) {
                    return [];
                  }

                  return [[draggedStickyNoteId, {
                    x: draggedStickyNote.position.x + dx,
                    y: draggedStickyNote.position.y + dy,
                  }]];
                }),
              );
              const nextRoomPositions = Object.fromEntries(
                (dragSelection?.roomIds ?? []).flatMap((draggedRoomId) => {
                  const draggedRoom = useEditorStore.getState().doc?.rooms[draggedRoomId];
                  if (!draggedRoom) {
                    return [];
                  }

                  return [[draggedRoomId, {
                    x: draggedRoom.position.x + dx,
                    y: draggedRoom.position.y + dy,
                  }]];
                }),
              );
              moveStickyNotes(nextStickyNotePositions);
              moveRooms(nextRoomPositions);
            } else if (upEvent.shiftKey) {
              addStickyNoteToSelection(stickyNote.id);
            } else {
              selectStickyNote(stickyNote.id);
            }
          };

          document.addEventListener('mousemove', handleMouseMove);
          document.addEventListener('mouseup', handleMouseUp);
        }}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          selectStickyNote(stickyNote.id);
          onOpenEditor(stickyNote.id);
        }}
      >
        <div className="sticky-note-corner" aria-hidden="true" />
        {isEditing ? (
          <textarea
            ref={textareaRef}
            className="sticky-note-textarea"
            data-testid="sticky-note-textarea"
            aria-label="Sticky note text"
            value={stickyNote.text}
            onChange={(event) => {
              setStickyNoteText(stickyNote.id, event.target.value, { historyMergeKey: `sticky-note:${stickyNote.id}:text` });
              autoResizeTextarea(event.currentTarget);
            }}
            onMouseDown={(event) => {
              event.stopPropagation();
            }}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                onCloseEditor();
              }
            }}
            onBlur={() => {
              onCloseEditor();
            }}
          />
        ) : (
          <div className="sticky-note-text" data-testid="sticky-note-text">
            {stickyNote.text || 'Note'}
          </div>
        )}
      </div>
    </div>
  );
}
