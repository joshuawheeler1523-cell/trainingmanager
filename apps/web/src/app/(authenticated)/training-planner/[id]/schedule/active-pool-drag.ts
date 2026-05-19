// Module-level signal for the currently in-flight pool drag.
//
// HTML5 drag-and-drop hides dataTransfer payload bytes during dragOver — only
// the type list ("application/json") is readable until drop. To paint a
// red/green cell preview while the user is still hovering, the grid needs
// to know WHICH class is being dragged BEFORE drop. We publish it here on
// dragStart from the pool chip and clear it on dragEnd. The grid reads it
// from dragOver. Cross-component state, no React context needed.

import type { PoolDragPayload } from "./session-pool";

let active: PoolDragPayload | null = null;

export function setActivePoolDrag(payload: PoolDragPayload | null): void {
  active = payload;
}

export function getActivePoolDrag(): PoolDragPayload | null {
  return active;
}
