/**
 * KDS shared types (S2.1b). Plain module (no "use server" / "server-only") so BOTH the server read
 * (lib/kitchen.ts) and the client board (KdsBoard) import them. The KDS is a STAFF surface: it shows the
 * live fire queue — every dine-in line that's been sent to the kitchen and isn't yet served — grouped
 * into per-table tickets. Money never appears here; the kitchen cares about items, not amounts.
 */

/** A single fired line on a ticket. `state` drives the bump control (fired ⇒ "Start", in_progress ⇒
 *  "Ready"). Modifiers are the kitchen-relevant choices (e.g. "No peanuts"), rendered as plain text. */
export type KitchenLine = {
  id: string;
  name: string;
  qty: number;
  /** Human-readable modifier labels (e.g. ["Spicy", "No egg"]) — empty when the line has none. */
  modifiers: string[];
  state: "fired" | "in_progress";
  /** When the line fired (ISO) — the board shows its age so the expo can spot a stalled ticket. */
  firedAt: string;
};

/** One table's worth of live kitchen lines — a ticket. Ordered oldest-fire-first so the kitchen works
 *  the queue head-down; `firedAt` is the earliest fire on the ticket (its age for the stalled-ticket cue). */
export type KitchenTicket = {
  sessionId: string;
  /** The table sticker id / dine-in label the expo calls out. */
  label: string;
  lines: KitchenLine[];
  firedAt: string;
};

export type KitchenQueue = {
  tickets: KitchenTicket[];
  /** Server clock at snapshot (ISO) — the client seeds relative-time ticks from this (clock-skew safe). */
  serverNow: string;
};
