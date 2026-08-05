"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { serviceClient } from "@mms/db/server";
import { requestApprovalInput, resolveApprovalInput } from "@mms/db/schemas";
import { AuthzError } from "./authz";
import { getStaffAuth, requireStaff } from "./staff";
import { approverStepUpAllowed, verifyStaffPin } from "./staff-pin";
import { paymentInFlightReason } from "./pay-guard";
import { touchCart } from "./order-lines";
import { getPostHogClient } from "./posthog-server";

/**
 * The approvals primitive (S2.4) — request → approve/deny → audit, the deferred (no-manager-present)
 * sibling of S2.3's inline manager-PIN void/comp. A server REQUESTS a gated loss action; the line stays
 * default-safe (still charged, food not un-fired) until a manager RESOLVES it from the queue. Every export
 * is a public POST (IDOR by default), so each re-checks requireStaff and acts via the service-role client.
 * The loss gate + the approver role/self/once checks are SERVER-side (mms_request_approval /
 * mms_resolve_approval); the client never asserts whether approval is needed or who may grant it.
 */

export type RequestApprovalResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "no_approval_needed"
        | "already_pending"
        | "not_open"
        | "not_found"
        | "in_flight"
        | "error"
        // W10b: platform unreachable — the request wasn't recorded; not a verdict about the line.
        | "outage";
    };

/**
 * A server asks a manager to approve a gated void/comp (no manager at hand to PIN). Creates a pending
 * request; the line is untouched. `no_approval_needed` means the action is server-solo — the caller should
 * just run voidLine instead. `already_pending` means a request for this line is already open.
 */
export async function requestApproval(raw: unknown): Promise<RequestApprovalResult> {
  const auth = await getStaffAuth();
  // W10b — unknowable ≠ unauthorized; and an unread cart/line is not "not open"/"not found" (false
  // verdicts that end with the loss request silently dropped).
  if (auth.kind === "unavailable") return { ok: false, reason: "outage" };
  if (auth.kind !== "staff") return { ok: false, reason: "error" };
  const caller = auth.caller;
  const parsed = requestApprovalInput.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "error" };
  const { sessionId, cartItemId, action, reason } = parsed.data;

  const db = serviceClient();
  const { data: cart, error: cartError } = await db
    .from("qr_carts")
    .select("id,locked,locked_at,settle_at")
    .eq("session_id", sessionId)
    .eq("status", "open")
    .maybeSingle();
  if (cartError) return { ok: false, reason: "outage" };
  if (!cart) return { ok: false, reason: "not_open" };
  if (await paymentInFlightReason(cart)) return { ok: false, reason: "in_flight" };
  const { data: line, error: lineError } = await db
    .from("qr_cart_items")
    .select("id")
    .eq("id", cartItemId)
    .eq("cart_id", cart.id)
    .maybeSingle();
  if (lineError) return { ok: false, reason: "outage" };
  if (!line) return { ok: false, reason: "not_found" };

  const { data: status, error } = await db.rpc("mms_request_approval", {
    p_line: cartItemId,
    p_action: action,
    p_reason: reason,
    p_initiator: caller.staffId,
  });
  if (error) {
    console.error("[approvals] request failed", { sessionId, cartItemId, message: error.message });
    return { ok: false, reason: "error" };
  }
  if (status === "no_approval_needed") return { ok: false, reason: "no_approval_needed" };
  if (status === "already_pending") return { ok: false, reason: "already_pending" };
  if (status === "not_open") return { ok: false, reason: "not_open" };
  if (status === "not_found" || status === "already_done")
    return { ok: false, reason: "not_found" };
  if (status !== "ok") return { ok: false, reason: "error" };

  await touchCart(cart.id, "requestApproval"); // surfaces the "approval requested" badge to peers/floor
  revalidatePath(`/staff/table/${sessionId}`);
  revalidatePath("/staff/approvals");
  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    after(async () => {
      try {
        const ph = getPostHogClient();
        ph.capture({
          distinctId: `staff:${caller.staffId}`,
          event: "approval_requested",
          properties: { role: caller.role, sessionId, action, reason },
        });
        await ph.flush();
      } catch {
        /* analytics best-effort */
      }
    });
  }
  return { ok: true };
}

export type ResolveApprovalResult =
  | { ok: true; decision: "approve" | "deny" }
  | { ok: false; reason: "pin_wrong"; attemptsRemaining: number }
  | { ok: false; reason: "pin_locked"; lockedUntil: string }
  | {
      ok: false;
      reason:
        | "pin_no_pin"
        | "bad_approver"
        | "step_up_rate_limited"
        | "already"
        | "stale"
        | "not_open"
        | "in_flight"
        | "not_found"
        | "error"
        // W10b: platform unreachable — the resolution wasn't recorded; the request is still pending.
        | "outage";
    };

/**
 * A manager resolves a pending request (approve → apply the recorded action; deny → close it, line stays
 * live). Proven by the manager-PIN step-up so it works on a shared tablet; mms_resolve_approval re-checks
 * the approver is an active manager/owner ≠ the requester and that the row is still pending.
 */
export async function resolveApproval(raw: unknown): Promise<ResolveApprovalResult> {
  const auth = await getStaffAuth();
  // W10b — unknowable ≠ unauthorized; an unread request is not "not found" (the manager would read
  // the queue as already-handled and walk away from a still-pending loss).
  if (auth.kind === "unavailable") return { ok: false, reason: "outage" };
  if (auth.kind !== "staff") return { ok: false, reason: "error" };
  const caller = auth.caller;
  const parsed = resolveApprovalInput.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "error" };
  const { approvalId, decision, approverStaffId, pin } = parsed.data;

  const db = serviceClient();
  // Read the request first (for the revalidate/touch targets + a fast not-found).
  const { data: appr, error: apprError } = await db
    .from("mms_approvals")
    .select("id,cart_id,session_id,status,initiator_staff_id")
    .eq("id", approvalId)
    .maybeSingle();
  if (apprError) return { ok: false, reason: "outage" };
  if (!appr) return { ok: false, reason: "not_found" };
  if (appr.status !== "pending") return { ok: false, reason: "already" };

  // S2-audit B2: refuse an APPROVE while the table's card pay / split settle is in flight — applying the
  // void/comp would drop a line from the base a PaymentIntent is capturing against → stranded charge. The
  // RPC re-checks this atomically too; this is the app-layer parity with voidLine (and covers the
  // captured-share edge paymentInFlightReason adds beyond the SQL freshness check). Deny is always safe.
  if (decision === "approve" && appr.cart_id) {
    const { data: cart, error: cartError } = await db
      .from("qr_carts")
      .select("id,locked,locked_at,settle_at")
      .eq("id", appr.cart_id)
      .maybeSingle();
    // An unread cart can't prove the pay-mutex is clear — refuse with the outage truth rather than
    // approve a void against a base a PaymentIntent may be capturing.
    if (cartError) return { ok: false, reason: "outage" };
    if (cart && (await paymentInFlightReason(cart))) return { ok: false, reason: "in_flight" };
  }

  // Verify the manager's PIN server-side (lockout-counted) BEFORE the RPC. mms_resolve_approval re-checks
  // the approver's role + self + that the row is still pending.
  // W1·Q7: pre-flight first — never spend the target's lockout budget on an invalid approver or a
  // caller who's burning the step-up rate bucket (the manager-lockout DoS vector). The self-check
  // compares the approver to the REQUEST's INITIATOR (mirrors mms_resolve_approval's
  // `p_approver = v_initiator` rule) — NOT the caller: a manager resolving a server's request with
  // their own PIN is the normal case and must pass.
  const pre = await approverStepUpAllowed(approverStaffId, caller.staffId, appr.initiator_staff_id);
  if (pre !== "ok") return { ok: false, reason: pre };
  const v = await verifyStaffPin(approverStaffId, pin);
  if (v.status === "wrong")
    return { ok: false, reason: "pin_wrong", attemptsRemaining: v.attemptsRemaining };
  if (v.status === "locked") return { ok: false, reason: "pin_locked", lockedUntil: v.lockedUntil };
  if (v.status === "no_pin") return { ok: false, reason: "pin_no_pin" };
  if (v.status !== "ok") return { ok: false, reason: "error" };

  const { data: status, error } = await db.rpc("mms_resolve_approval", {
    p_id: approvalId,
    p_approver: approverStaffId,
    p_decision: decision,
  });
  if (error) {
    console.error("[approvals] resolve failed", { approvalId, message: error.message });
    return { ok: false, reason: "error" };
  }
  if (status === "self_approve" || status === "bad_approver")
    return { ok: false, reason: "bad_approver" };
  if (status === "already_resolved") return { ok: false, reason: "already" };
  if (status === "stale") return { ok: false, reason: "stale" };
  if (status === "not_open") return { ok: false, reason: "not_open" };
  if (status === "in_flight") return { ok: false, reason: "in_flight" };
  if (status === "not_found") return { ok: false, reason: "not_found" };
  if (status !== "ok") return { ok: false, reason: "error" };

  if (appr.cart_id) await touchCart(appr.cart_id, "resolveApproval"); // re-sync the diner cart / floor
  revalidatePath("/staff/approvals");
  if (appr.session_id) revalidatePath(`/staff/table/${appr.session_id}`);
  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    after(async () => {
      try {
        const ph = getPostHogClient();
        ph.capture({
          distinctId: `staff:${caller.staffId}`,
          event: "approval_resolved",
          properties: { role: caller.role, decision, approver: approverStaffId },
        });
        await ph.flush();
      } catch {
        /* analytics best-effort */
      }
    });
  }
  return { ok: true, decision };
}

/** A cheap head-count of open requests for the floor-nav badge (manager+ only). 0 on any error —
 *  a DELIBERATE degrade (W10b): the badge is an ornament on a nav link, and the approvals page
 *  itself (listPendingApprovals) refuses to render a false-empty queue. */
export async function countPendingApprovals(): Promise<number> {
  const caller = await requireStaff("manager").catch(() => null);
  if (!caller) return 0;
  const { count } = await serviceClient()
    .from("mms_approvals")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
}

export type PendingApproval = {
  id: string;
  kind: "void" | "comp";
  lineName: string;
  qty: number;
  amountCents: number;
  reasonCode: string;
  cooked: boolean;
  sessionId: string | null;
  tableLabel: string | null;
  initiatorName: string;
  createdAt: string;
};

/**
 * The open request queue (manager-gated). Bounded; oldest first so a manager works it top-down. Joins the
 * initiator's display name and the table label for legibility. Read via service-role (the audit table is
 * owner-read RLS); the requireStaff('manager') gate is the authority for who may see/resolve it.
 */
/** One unresolved row of the durable refunds ledger (W11/M43) — money taken with no order behind it. */
export type RefundNeeded = {
  id: string;
  paymentIntent: string;
  cartId: string | null;
  amountCents: number | null;
  reason: string;
  createdAt: string;
};

/**
 * W11 (M43) — the operator surface for the `qr_refunds_needed` ledger. Every row is a charge (or a
 * hold we knowingly abandoned) that no order accounts for: a split reconcile mismatch, a hold an
 * abort could not release, a capture discovered after its row was destroyed. Before this, each of
 * those existed only as a `console.error` in a serverless log plus 72h of identical Stripe retries —
 * nobody in the building could see them. Manager-gated like the approvals queue it renders beside;
 * a failed read throws `unavailable` for the same reason (an empty list must MEAN empty).
 */
// verify:slice-exempt — read-only, manager-gated list surfaces; the money rules it renders (the
// qr_refunds_needed WRITES) are mutated where they live: split.ts and the migration's SQL.
export async function listRefundsNeeded(): Promise<RefundNeeded[]> {
  await requireStaff("manager");
  const db = serviceClient();
  const { data, error } = await db
    .from("qr_refunds_needed")
    .select("id,payment_intent,cart_id,amount_cents,reason,created_at")
    .eq("resolved", false)
    .order("created_at", { ascending: true })
    .limit(50);
  if (error)
    throw new AuthzError("We can’t reach the ordering system right now", 503, "unavailable");
  return (data ?? []).map((r) => ({
    id: r.id,
    paymentIntent: r.payment_intent,
    cartId: r.cart_id,
    amountCents: r.amount_cents,
    reason: r.reason,
    createdAt: r.created_at,
  }));
}

export async function listPendingApprovals(): Promise<PendingApproval[]> {
  await requireStaff("manager");
  const db = serviceClient();
  // W10b — a failed read must not render as "queue clear" (a manager would walk away from pending
  // losses). Throwing lands in the ApprovalsBoard catch (frozen-board banner) / the staff boundary.
  const unavailable = () =>
    new AuthzError("We can’t reach the ordering system right now", 503, "unavailable");
  const { data: rows, error: rowsError } = await db
    .from("mms_approvals")
    .select(
      "id,kind,line_name,qty,amount_cents,reason_code,cooked,session_id,initiator_staff_id,created_at",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(200);
  if (rowsError) throw unavailable();
  if (!rows || rows.length === 0) return [];

  const initiatorIds = [...new Set(rows.map((r) => r.initiator_staff_id))];
  const sessionIds = [...new Set(rows.map((r) => r.session_id).filter((x): x is string => !!x))];
  const [staffRes, sessionsRes] = await Promise.all([
    db.from("staff").select("user_id,display_name").in("user_id", initiatorIds),
    sessionIds.length
      ? db.from("table_sessions").select("id,qr_code").in("id", sessionIds)
      : Promise.resolve({ data: [] as { id: string; qr_code: string }[], error: null }),
  ]);
  // Names/labels are the queue's attribution — "A server · no table" on every row is misinformation
  // on an audit surface, not a degrade.
  if (staffRes.error || sessionsRes.error) throw unavailable();
  const nameById = new Map((staffRes.data ?? []).map((s) => [s.user_id, s.display_name]));
  const labelById = new Map((sessionsRes.data ?? []).map((s) => [s.id, s.qr_code]));

  return rows.map((r) => ({
    id: r.id,
    kind: r.kind as "void" | "comp",
    lineName: r.line_name ?? "Item",
    qty: r.qty ?? 1,
    amountCents: r.amount_cents,
    reasonCode: r.reason_code,
    cooked: r.cooked,
    sessionId: r.session_id,
    tableLabel: r.session_id ? (labelById.get(r.session_id) ?? null) : null,
    initiatorName: nameById.get(r.initiator_staff_id) ?? "A server",
    createdAt: r.created_at,
  }));
}
