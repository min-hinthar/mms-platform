"use client";
import { createContext, useContext } from "react";
import type { StaffKey } from "@/lib/i18n/staff";

/**
 * The ONE mint lock's CONTEXT and types (`CounterMint.tsx` holds the provider and its machinery).
 * Split out so a control that only READS the lock (PD7's "Seat next party", in the pane) never
 * imports the provider's server action — and with it the server client — into its own graph.
 */
export type MintId = "walkup" | "phone" | `table-${number}`;

export type MintInput =
  | { kind: "walkup" }
  | { kind: "phone"; customerName?: string }
  | { kind: "table"; tableNumber: number };

/** What a refused or unanswered mint says, and who authored it: a dictionary key (<Chrome>), or a
 *  server sentence (<OutageText>, which swaps the one twin that exists). Structurally `StaffMsg`. */
export type MintNotice = { k: StaffKey } | string;

export type CounterMint = {
  /** Which control is minting (or has landed and is waiting on the route swap), or null. */
  minting: MintId | null;
  /** Every mint control on the screen says `aria-disabled` while this is true — a start in flight
   *  or landed — and navigation off the screen (an occupied tile) is held with it. */
  held: boolean;
  /** Phase 2h — `held`, or a start still unanswered past the bound (`waiting`): every START control
   *  says `aria-disabled` (a tap is refused at the tap and said with the waiting line). Navigation
   *  is NOT held by a wait — a late landing never pushes over a screen that left (`mounted`). */
  startHeld: boolean;
  /** Phase 2h — the start still unanswered past STAFF_HANG_MS (its late answer not in yet), or null.
   *  The zone that started it offers the reload beside its region while this names one of its own. */
  waiting: MintId | null;
  /** The tap-time guard. Read it in a handler, never in render. */
  isBusy: () => boolean;
  /** Start one order — the ONE place a start is admitted: a no-op while another start is in flight
   *  or has landed. `onStart` runs only for a start that goes, BEFORE the server is asked, so a
   *  caller's "a new tap" work (clearing its notice) can never erase that start's own answer. */
  run: (id: MintId, input: MintInput, to: MintCallbacks) => void;
  /** PD7 (Codex corrections 5 · 9) — take the lock NOW for a start that must wait on another write
   *  (the pane's "Seat next party" waits on its table's clear): null when it is held (a start in
   *  flight, landed, or unanswered past the bound) — the caller refuses at the tap with the waiting
   *  line and changes nothing. While reserved, every start on the screen is held exactly as for a
   *  start in flight. `go` starts the reserved order (it lands in the PANE at split width — the bell
   *  stays live, correction 6); `release` hands the lock back unspent (the clear was refused). Each
   *  is one-shot, and only the first of the two counts. */
  reserve: (id: MintId) => MintReservation | null;
};

export type MintReservation = {
  go: (input: MintInput, to: MintCallbacks) => void;
  release: () => void;
};

export type MintCallbacks = {
  /** The start was admitted (and nothing has been said about it yet). */
  onStart: () => void;
  /** The start was refused, or its answer never came — say this in the caller's region. */
  onRefusal: (n: MintNotice) => void;
  /** Phase 2h — the start's LATE answer landed as a start: the waiting line is no longer true, so
   *  the caller clears it (a late refusal or a lost answer arrives through `onRefusal` instead).
   *  Both zones pass it; optional only for a caller with no region of its own. */
  onResolved?: () => void;
};

export const CounterMintCtx = createContext<CounterMint | null>(null);

/** PD7 — the screen's mint lock where one exists (the counter's split), else null: the pane's
 *  "Seat next party" is offered only under the one lock, never with a second one of its own. */
export function useOptionalCounterMint(): CounterMint | null {
  return useContext(CounterMintCtx);
}

export function useCounterMint(): CounterMint {
  const v = useContext(CounterMintCtx);
  if (v === null)
    throw new Error(
      "useCounterMint outside <CounterMintProvider> — every mint control on a screen must share one lock",
    );
  return v;
}
