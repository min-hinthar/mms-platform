import "server-only";
import { serviceClient } from "@mms/db/server";

/**
 * Durable tab-action audit trail (S3.3 / T13) — the walk-out post-mortem + the discretion-pattern review.
 * Append-only, non-PII: we record the STAFF uid (an employee — the point of the audit) but NEVER the
 * anonymous diner's uid (a diner action is actor_kind='diner' with a null staff id). Owner-read RLS, off
 * realtime (the table is service-role-write only).
 *
 * Best-effort by contract: an audit-write failure must NEVER fail the money/tab action that triggered it.
 * The action is the source of truth; a missing log row is a gap in the trail, not a broken settle. Callers
 * fire-and-forget (or `after()`), and we swallow + log here rather than throw.
 */
export type TabEvent = {
  cartId: string;
  sessionId?: string | null;
  event: "opened" | "secured" | "closed";
  actorKind: "staff" | "diner";
  /** staff.user_id when actorKind='staff'; omit/null for a diner (non-PII). */
  actorStaffId?: string | null;
  tabType: "none" | "trust" | "secure";
  /** the settled total, on a 'closed' event only. */
  amountCents?: number | null;
};

export async function logTabEvent(e: TabEvent): Promise<void> {
  try {
    const { error } = await serviceClient()
      .from("mms_tab_events")
      .insert({
        cart_id: e.cartId,
        session_id: e.sessionId ?? null,
        event: e.event,
        actor_kind: e.actorKind,
        actor_staff_id: e.actorKind === "staff" ? (e.actorStaffId ?? null) : null,
        tab_type: e.tabType,
        amount_cents: e.amountCents ?? null,
      });
    if (error)
      console.error("[tab-events] log failed", {
        event: e.event,
        cartId: e.cartId,
        message: error.message,
      });
  } catch (err) {
    // Never let an audit-write fault surface into the caller's money path.
    console.error("[tab-events] log threw", { event: e.event, cartId: e.cartId, err });
  }
}
