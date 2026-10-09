"use server";
import { serviceClient } from "@mms/db/server";
import { nudgeHostInput } from "@mms/db/schemas";
import { assertCartMember, AuthzError } from "./authz";
import { withinMutationRate } from "./rate";

/**
 * PD1 — "Let Aye know", the server action behind the guest's quiet nudge.
 *
 * Member-authorized (`assertCartMember`: a verified seat in this active session, the gate every
 * cart write passes), then ONE write through `mms_nudge_host`, whose WHERE restates every rule IN
 * the statement (cart open, a host named, the nudger a member and not the host, at most once a
 * minute) and answers by ROW COUNT — `.update()` alone reports success on zero rows (CLAUDE.md,
 * W17), so the function returns the verdict and, on a miss, a read-only diagnosis. The stamp is the
 * cart's; `mms_fire_cart` clears it in the same statement as the fire.
 *
 * Returned, never thrown (Next redacts thrown Server Action errors in prod): the Bill branches its
 * one sentence on the reason. A `recent` answer is a SUCCESS to the guest — the stamp stands and
 * their line keeps showing — so it carries the standing stamp. The pre-check on `role` is for an
 * honest sentence only; the SQL decides.
 */
export type NudgeHostResult =
  | { ok: true; nudgedAt: string }
  | {
      ok: false;
      reason: "is_host" | "no_host" | "not_member" | "closed" | "rate_limited" | "error";
      error: string;
    };

/** The shipped failure line (`useUndoGrace`'s raced-lock sentence): no claim about why. */
const FAILED = "That didn’t go through — please try again.";
const CLOSED = "This order’s already paid — there’s nothing to send.";

export async function nudgeHost(raw: unknown): Promise<NudgeHostResult> {
  const parsed = nudgeHostInput.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "error", error: FAILED };
  const { cartId } = parsed.data;
  let authz: Awaited<ReturnType<typeof assertCartMember>>;
  try {
    authz = await assertCartMember(cartId);
  } catch (e) {
    if (e instanceof AuthzError && (e.code === "cart_closed" || e.code === "no_cart"))
      return { ok: false, reason: "closed", error: CLOSED };
    return { ok: false, reason: "error", error: FAILED };
  }
  // The host waits on nobody: said here for the sentence, decided again in the SQL.
  if (authz.role === "host") return { ok: false, reason: "is_host", error: FAILED };
  // Per-seat flood guard, like every cart write; the SQL's own minute is the real cadence.
  if (!(await withinMutationRate(authz.uid)))
    return { ok: false, reason: "rate_limited", error: FAILED };
  const { data, error } = await serviceClient().rpc("mms_nudge_host", {
    p_cart_id: cartId,
    p_seat: authz.uid,
  });
  if (error) {
    console.error("[send-nudge] mms_nudge_host failed", {
      cartId,
      message: error.message,
    });
    return { ok: false, reason: "error", error: FAILED };
  }
  const row = data?.[0];
  if (!row) return { ok: false, reason: "error", error: FAILED };
  if (row.ok && row.nudged_at) return { ok: true, nudgedAt: row.nudged_at };
  // `recent`: the first stamp stands — the guest's line still shows, nothing to retry.
  if (row.reason === "recent" && row.nudged_at) return { ok: true, nudgedAt: row.nudged_at };
  if (row.reason === "is_host") return { ok: false, reason: "is_host", error: FAILED };
  if (row.reason === "no_host") return { ok: false, reason: "no_host", error: FAILED };
  if (row.reason === "not_member") return { ok: false, reason: "not_member", error: FAILED };
  if (row.reason === "closed" || row.reason === "no_cart")
    return { ok: false, reason: "closed", error: CLOSED };
  return { ok: false, reason: "error", error: FAILED };
}
