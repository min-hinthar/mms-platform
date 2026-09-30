"use client";
import { createContext, useContext, type MouseEvent } from "react";
import type { TableHint } from "./TableNav";

/**
 * Phase 2d · split — the counter split's selection API, in its OWN module: the floor, the strip and
 * the mint lock read it without importing the pane (and with it the whole table drill-down and its
 * server actions) into every board's graph. `CounterSplit` provides it.
 */
export type PaneRow = { sessionId: string; label: string; hint: TableHint };

export type TablePaneApi = {
  selectedId: string | null;
  /** Phase 2d · Codex round 1 — which SELECTION `selectedId` belongs to: new on every move of the
   *  pane (a pick of a table not already shown, and a close), kept by a re-tap of the table shown,
   *  never repeated. An id alone cannot see a move that came back (A → B → A, a table then ✕). */
  selectionGen: number;
  /** A card or occupied tile tap: opens in the pane at split width, else falls through to its link. */
  openFromCard: (e: MouseEvent<HTMLElement>, sessionId: string, hint: TableHint) => void;
  /** Open a table without a click (a start that converged on a seated table). False below 48em —
   *  the caller then navigates as before. */
  openSession: (sessionId: string, hint: TableHint) => boolean;
  /** The floor's live rows, for a hash selection's heading and a closed table's live twin. */
  publishFloor: (rows: readonly PaneRow[]) => void;
  /** Phase 2d · Codex round 2 — is a START held right now: the pane's reader collecting on the
   *  table shown (`paneStartHeld`). A ref read at the instant of asking — the mint asks at a tap,
   *  and again as a start already out lands — never a render's. */
  startHeld: () => boolean;
  /** Say a start refused at its tap, in the pane's detail's ONE region ("Finish the card payment
   *  first." — the count a refused switch bumps), so the screen keeps one region for the hold. */
  sayStartHeld: () => void;
};

export const TablePaneContext = createContext<TablePaneApi | null>(null);

/** `null` outside the counter screen (the full table page, a phone route): every caller then keeps
 *  its plain link. */
export function useTablePane(): TablePaneApi | null {
  return useContext(TablePaneContext);
}

export type CloseReason = "user" | "cleared";
