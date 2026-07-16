import "server-only";
import { serviceClient } from "@mms/db/server";
import { JOIN_RATE, MUTATE_RATE, STEPUP_RATE } from "./limits";

/**
 * Per-device rate limiting (M3·P3.4). The join/mutation/pay paths are public POSTs (IDOR-by-default —
 * RED-TEAM #2); membership authz stops a *non*-member, but a verified member can still FLOOD. This gates
 * each action through the SQL `mms_rate_limit` window (count-first / self-GC / reject-without-record,
 * the pattern proven by mms_promo_attempt) keyed by the verified seat (auth.uid()) so the unit is one
 * device — see lib/limits.ts for why per-seat over per-session.
 *
 * FAIL-OPEN: a limiter glitch (RPC error) must never strand a legit diner mid-order, so a failed CHECK
 * returns "allowed". The cost of a rare missed limit is far lower than blocking a paying table; the DB
 * caps (party trigger, status guards, server-authoritative money) remain the hard invariants regardless.
 */
async function withinRate(
  bucket: string,
  key: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await serviceClient().rpc("mms_rate_limit", {
    p_bucket: bucket,
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("[rate] check failed (fail-open)", bucket, error.message);
    return true; // fail-open: never block a legit diner on a limiter error
  }
  return data === true;
}

/** Gate POST /api/session per device. Returns false once the join window is exhausted → the route 429s. */
export function withinJoinRate(seat: string): Promise<boolean> {
  return withinRate("join", seat, JOIN_RATE.max, JOIN_RATE.windowSeconds);
}

/** Gate a cart mutation per device. Returns false once the mutate window is exhausted (route callers map
 *  it to a 429; Server Action callers use assertMutationRate, which throws). */
export function withinMutationRate(seat: string): Promise<boolean> {
  return withinRate("mutate", seat, MUTATE_RATE.max, MUTATE_RATE.windowSeconds);
}

/** Gate a manager-PIN step-up attempt per CALLING staff account (W1·Q7) — bounds the lockout-griefing
 *  vector where one staff account serially wrong-PINs every manager. Keyed by the resolved staff row
 *  id of the INITIATOR, not the target. */
export function withinStepUpRate(callerStaffId: string): Promise<boolean> {
  return withinRate("stepup", callerStaffId, STEPUP_RATE.max, STEPUP_RATE.windowSeconds);
}

/**
 * Server-Action form: throw when the per-device mutate window is exhausted. The thrown message is
 * redacted across the Server Action boundary in prod (LEARNINGS #45), so the client shows its generic
 * recovery copy — fine for an abuse case a legit diner won't hit. Call right AFTER assertCartMember
 * (so an unauthorized caller 403s first) and BEFORE the write.
 */
export async function assertMutationRate(seat: string): Promise<void> {
  if (!(await withinMutationRate(seat)))
    throw new Error("Too many changes too fast — give it a moment.");
}
