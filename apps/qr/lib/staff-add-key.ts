import type { StaffWriteCode } from "./staff-add-outcome";

/**
 * Phase 2a (Codex round 1, P1) — the ADD KEY's lifetime on the staff add surfaces
 * (`StaffAddButton`, `StaffMenuBrowser`).
 *
 * `staffAddItem` takes an `addKey` that rides the existing scan-event ledger (`p_scan_id`, claimed in
 * the same transaction as the write), so resending the SAME key can never add a dish twice. The
 * shipped callers sent none — a re-tap after a lost response added the dish again (a second plate
 * cooked and charged). The rule, as values:
 *
 *  - an attempt whose outcome is UNKNOWN (the action threw, or answered `unconfirmed`) keeps its key,
 *    and a retry of the SAME intent resends it: if the first landed, the retry is a no-op;
 *  - a DEFINITE outcome (ok, or a refusal that wrote nothing) retires it: the next tap is a new add;
 *  - a DIFFERENT intent (another dish, another choice, another qty) never reuses a held key — the
 *    ledger would swallow the new add as a duplicate of the old one.
 *
 * Pure (no "use client") so each rule is falsified by a value, not a render.
 */

/** What a staff add answered, as the key's lifetime reads it. */
export type AddAttemptOutcome = "ok" | "definite" | "unknown";

/** A key held for a retry: the intent it was minted for, and the key. */
export type HeldAddKey = { intent: string; key: string } | null;

export function addAttemptOutcome(
  res: { ok: true } | { ok: false; error: string; code?: StaffWriteCode } | "threw",
): AddAttemptOutcome {
  if (res === "threw") return "unknown";
  if (res.ok) return "ok";
  return res.code === "unconfirmed" ? "unknown" : "definite";
}

/** The key for an attempt at `intent`: the held one when it is a retry of the same intent, else new. */
export function keyForAttempt(held: HeldAddKey, intent: string, mint: () => string): string {
  return held !== null && held.intent === intent ? held.key : mint();
}

/** What to hold after an attempt: the key survives ONLY an unknown outcome. */
export function heldAfter(intent: string, key: string, outcome: AddAttemptOutcome): HeldAddKey {
  return outcome === "unknown" ? { intent, key } : null;
}
