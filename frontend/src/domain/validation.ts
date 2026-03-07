import type { MapDocument } from './map-types';

/* ------------------------------------------------------------------ */
/*  Result types                                                       */
/* ------------------------------------------------------------------ */

export type ValidationSeverity = 'error' | 'warning';
export type EntityType = 'room' | 'connection' | 'item';

export interface ValidationIssue {
  readonly severity: ValidationSeverity;
  readonly entityType: EntityType;
  readonly entityId: string;
  readonly message: string;
}

export interface ValidationResult {
  readonly errors: readonly ValidationIssue[];
  readonly warnings: readonly ValidationIssue[];
}

/* ------------------------------------------------------------------ */
/*  validateMap                                                        */
/* ------------------------------------------------------------------ */

/**
 * Validate the internal consistency of a MapDocument.
 *
 * Returns structured errors (blocking) and warnings (non-blocking).
 * This is a pure function — it never mutates the input.
 */
export function validateMap(doc: MapDocument): ValidationResult {
  const issues: ValidationIssue[] = [];

  // --- Connection reference checks ---
  for (const [cid, conn] of Object.entries(doc.connections)) {
    if (!doc.rooms[conn.sourceRoomId]) {
      issues.push({
        severity: 'error',
        entityType: 'connection',
        entityId: cid,
        message: `Connection "${cid}" references a missing source room "${conn.sourceRoomId}".`,
      });
    }
    if (!doc.rooms[conn.targetRoomId]) {
      issues.push({
        severity: 'error',
        entityType: 'connection',
        entityId: cid,
        message: `Connection "${cid}" references a missing target room "${conn.targetRoomId}".`,
      });
    }
  }

  // --- Room direction binding checks ---
  for (const [rid, room] of Object.entries(doc.rooms)) {
    for (const [dir, connId] of Object.entries(room.directions)) {
      if (!doc.connections[connId]) {
        issues.push({
          severity: 'error',
          entityType: 'room',
          entityId: rid,
          message: `Direction binding "${dir}" in room "${room.name}" references a missing connection "${connId}".`,
        });
      }
    }
  }

  // --- Item room reference checks ---
  for (const [iid, item] of Object.entries(doc.items)) {
    if (!doc.rooms[item.roomId]) {
      issues.push({
        severity: 'error',
        entityType: 'item',
        entityId: iid,
        message: `Item "${item.name}" references a missing room "${item.roomId}".`,
      });
    }
  }

  // --- Warnings: unreachable rooms ---
  const roomIds = Object.keys(doc.rooms);
  if (roomIds.length > 1) {
    const connectedRoomIds = new Set<string>();
    for (const conn of Object.values(doc.connections)) {
      connectedRoomIds.add(conn.sourceRoomId);
      connectedRoomIds.add(conn.targetRoomId);
    }
    for (const [rid, room] of Object.entries(doc.rooms)) {
      if (!connectedRoomIds.has(rid)) {
        issues.push({
          severity: 'warning',
          entityType: 'room',
          entityId: rid,
          message: `Room "${room.name}" has no connections and may be unreachable.`,
        });
      }
    }
  }

  return {
    errors: issues.filter((i) => i.severity === 'error'),
    warnings: issues.filter((i) => i.severity === 'warning'),
  };
}
