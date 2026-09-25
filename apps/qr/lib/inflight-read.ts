import "server-only";
import { serviceClient } from "@mms/db/server";
import type { PaymentInFlight } from "./pay-guard";
import { inFlightHolder, inFlightRefusalOf, type InFlightRefusal } from "./inflight-refusal";

/**
 * Phase 2c · register (OPEN-ITEMS P2w) — the staff settle paths' refusal while money is moving on the
 * cart, TRUE about who holds it (lib/inflight-refusal.ts has the rule and the sentences).
 *
 * The one read: is the fresh freeze's owner (`qr_carts.settle_by`) a SEAT of this session? A diner's
 * split owns its freeze under the host's seat id; every staff settle owns it under a per-request
 * `crypto.randomUUID()` (A3 · M201), which is never a seat. It runs ONLY on the refusal path (the
 * settle is already refused), so it adds nothing to a settle that proceeds. A failed read is
 * `null` — UNSURE — and the sentence then names both places rather than guessing either.
 */
export async function inFlightRefusalFor(
  cart: {
    locked: boolean;
    locked_at: string | null;
    settle_at: string | null;
    settle_by?: string | null;
  },
  reason: PaymentInFlight,
  sessionId: string,
): Promise<InFlightRefusal> {
  return inFlightRefusalOf(
    inFlightHolder({
      reason,
      locked: cart.locked,
      lockedAt: cart.locked_at,
      settleAt: cart.settle_at,
      settleByIsSeat: await settleOwnerIsSeat(sessionId, cart.settle_by ?? null),
      nowMs: Date.now(),
    }),
  );
}

/** `true` / `false` when the owner could be read against the session's seats; `null` when there is
 *  no owner to read or the read failed (never a verdict). */
export async function settleOwnerIsSeat(
  sessionId: string,
  settleBy: string | null,
): Promise<boolean | null> {
  if (!settleBy) return null;
  try {
    const { data, error } = await serviceClient()
      .from("session_members")
      .select("seat_id")
      .eq("session_id", sessionId)
      .eq("seat_id", settleBy)
      .maybeSingle();
    if (error) return null;
    return data != null;
  } catch {
    // Deliberate: a transport failure is UNSURE, and the refusal still refuses — only its wording
    // depends on this read.
    return null;
  }
}
