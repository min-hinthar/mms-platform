"use server";
import { serviceClient } from "@mms/db/server";
import { nudgeHostInput } from "@mms/db/schemas";
import { assertCartMember, AuthzError } from "./authz";
import { withinMutationRate } from "./rate";
import type { SendNudge } from "./send-nudge-state";

/**
 * PD1 — "Let Aye know", the server action behind the guest's quiet nudge.
 *
 * Member-authorized (`assertCartMember`: a verified seat in this active session, the gate every
 * cart write passes), then ONE write through `mms_nudge_host`, whose WHERE restates every rule IN
 * the statement (cart open, an active dine-in table with a host, the nudger a member and not the
 * host, no fresh pay lock or split freeze, a dine-in draft to send, at most once a minute) and
 * answers by ROW COUNT — `.update()` alone reports success on zero rows (CLAUDE.md, W17), so the
 * function returns the verdict and, on a miss, a read-only diagnosis. The stamp is the cart's;
 * `mms_fire_cart` clears it in the same transaction as the fire.
 *
 * ⚠️ THE STAMP'S SEAT COMES FROM THE SERVER (the blind pass on #335). Every answer that carries a
 * stamp carries its seat too, and the Bill records THAT — never the asking phone's own seat. Mya
 * tapping inside the minute after Thiri's nudge is answered `taken` with Thiri's seat: the host
 * already knows the table is waiting, Mya is told whose nudge it was, and no confirmation is ever
 * drawn on her phone for a stamp that is not hers. `recent` (THIS seat's stamp standing) is the
 * only miss that reads as a success.
 *
 * Returned, never thrown (Next redacts thrown Server Action errors in prod): the Bill branches its
 * one sentence on the reason. The pre-checks on `role` and the freeze are for an honest sentence
 * before a database round trip; the SQL decides.
 */
export type NudgeHostResult =
  | { ok: true; nudge: SendNudge }
  | {
      ok: false;
      /** Another seat's stamp stands (inside its minute): the host already knows. */
      reason: "taken";
      nudge: SendNudge;
      error: string;
    }
  | {
      ok: false;
      reason:
        | "is_host"
        | "no_host"
        | "not_member"
        | "closed"
        | "locked"
        | "nothing_to_send"
        | "rate_limited"
        | "error";
      error: string;
    };

/** The shipped failure line (`useUndoGrace`'s raced-lock sentence): no claim about why. */
const FAILED = "That didn’t go through — please try again.";
/** A closed cart is not necessarily a PAID one — a merge cancels it, a sweep closes its table. */
const CLOSED = "This order has moved or closed — there’s nothing to send.";
/** No dine-in draft is left: the dishes went with a Send, or were taken off. */
const NOTHING = "There’s nothing waiting to send right now.";
/** Fallback for `taken` when the Bill cannot name the seat (it names it when it can). */
const TAKEN = "Someone at your table already let them know — they can see the table’s waiting.";

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
  // Nobody can send while a payment holds the cart — the host, the staff Send and the fire all
  // refuse it — so a stamp saying someone waits on that send names a wait nobody can end. The Bill
  // hides the button under the same freeze (`nudgeOffered`'s `frozen`, m1 decision 18); this is the
  // server half `cartFreeze` mirrors (scripts/check-freeze-parity.mjs), and `mms_nudge_host`
  // restates it IN its WHERE (the lock and settle legs), so a lock committing after this read is
  // refused there too. A tap that raced the lock gets the shipped raced-lock sentence.
  if (authz.locked || authz.settling) return { ok: false, reason: "locked", error: FAILED };
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
  // A stamp, as the SERVER holds it — both halves, its own seat. Never the caller's seat.
  const stamp: SendNudge | null =
    row.nudge_seat && row.nudged_at ? { seat: row.nudge_seat, at: row.nudged_at } : null;
  if (row.ok && stamp) return { ok: true, nudge: stamp };
  // `recent`: THIS seat's stamp stands — the guest's line still shows, nothing to retry. A stamp
  // that names another seat under this reason is not one this function writes; it is refused.
  if (row.reason === "recent" && stamp && stamp.seat === authz.uid)
    return { ok: true, nudge: stamp };
  if (row.reason === "taken" && stamp)
    return { ok: false, reason: "taken", nudge: stamp, error: TAKEN };
  if (row.reason === "is_host") return { ok: false, reason: "is_host", error: FAILED };
  if (row.reason === "no_host") return { ok: false, reason: "no_host", error: FAILED };
  if (row.reason === "not_member") return { ok: false, reason: "not_member", error: FAILED };
  if (row.reason === "paying") return { ok: false, reason: "locked", error: FAILED };
  if (row.reason === "nothing_to_send")
    return { ok: false, reason: "nothing_to_send", error: NOTHING };
  if (row.reason === "closed" || row.reason === "no_cart")
    return { ok: false, reason: "closed", error: CLOSED };
  return { ok: false, reason: "error", error: FAILED };
}
