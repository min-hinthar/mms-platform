"use server";

/**
 * Phase 3c-ii (D24) — `bindTable(cartId, n)`: the host seats an UNBOUND dine-in session at a registered
 * table, once, under the lock model, with refusals that name the recovery and never a merge.
 *
 * SLICE A IMPLEMENTS THIS MODULE (docs/PHASE3C_II_DESIGN.md D21–D24). The order of refusals is
 * `sendToKitchen`'s (lib/cart.ts): assertCartMember → withinMutationRate → locked → settling →
 * role !== host → mode !== dinein → the registry (`qr_tables`, `active = true`) → `sweepExpiredOnTable`
 * → the row-count CAS (`table_number` ONLY; `qr_code` is never rewritten). Outcomes: 1 row → ok (then
 * `touchCart` so every peer's watch re-reads the view); 23505 → `seated`; 23503 → `unavailable`;
 * 0 rows → re-read the own row and answer by the pure `bindVerdict` (the same number → ok/already;
 * another number → `already_bound`; closed/expired → `session_expired`).
 *
 * This file is the CONTRACT both slices build on: Slice B imports the type and mocks `bindTable`
 * by module; Slice A replaces the body. The lead's integration gate refuses the stub.
 */
export type BindTableReason =
  | "not_host"
  | "locked"
  | "settling"
  | "not_dinein"
  | "unavailable"
  | "seated"
  | "already_bound"
  | "session_expired"
  | "rate_limited"
  | "error";

export type BindTableResult =
  | { ok: true; tableNumber: number; already: boolean }
  | { ok: false; reason: Exclude<BindTableReason, "already_bound"> }
  | { ok: false; reason: "already_bound"; tableNumber: number };

export async function bindTable(cartId: string, tableNumber: number): Promise<BindTableResult> {
  // STUB — SLICE A IMPLEMENTS (the integration gate greps for this marker).
  void cartId;
  void tableNumber;
  return { ok: false, reason: "error" };
}
