"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { serviceClient } from "@mms/db/server";
import { requestApprovalInput, resolveApprovalInput } from "@mms/db/schemas";
import { AuthzError } from "./authz";
import { approvalsPollVerdict, type ApprovalsPollRefusal } from "./approvals-poll";
import { pendingCountVerdict, type PendingCount } from "./approvals-count";
import type { CartStatus, RequestLineNow } from "./approval-state";
import { getStaffAuth, requireStaff } from "./staff";
import { approverStepUpAllowed, verifyStaffPin } from "./staff-pin";
import { paymentInFlightReason } from "./pay-guard";
import { touchCart } from "./order-lines";
import { loadLineNames } from "./line-names";
import { catalogNameMy } from "./ticket-names";
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
  revalidatePath("/staff");
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

export type ApprovalDecision = "approve" | "deny" | "close";

export type ResolveApprovalResult =
  | { ok: true; decision: ApprovalDecision }
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
        // PD8 · M184: the line is no longer the one asked about — nothing was taken off.
        | "changed"
        // PD8 · D2: a `close` on a live, unchanged request — it still has a real decision to make.
        | "still_open"
        | "error"
        // W10b: platform unreachable — the resolution wasn't recorded; the request is still pending.
        | "outage";
    };

/**
 * A manager resolves a pending request (approve → apply the recorded action; deny → close it, line stays
 * live; PD8 · D2 close → `superseded`, admitted only once the table paid, was cleared, or the line
 * changed — the request's OWN asker may close it). Proven by the manager-PIN step-up so it works on a
 * shared tablet; mms_resolve_approval re-checks the approver is an active manager/owner (≠ the requester
 * on approve/deny) and that the row is still pending. M184: approve refuses `changed` when the line's
 * qty or amount moved since the ask.
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
  // PD8 · D2 — a CLOSE has no self rule (the asker may close their own stale request; nothing about
  // food is decided), so the pre-flight gets `null` there and the request's initiator otherwise.
  const pre = await approverStepUpAllowed(
    approverStaffId,
    caller.staffId,
    decision === "close" ? null : appr.initiator_staff_id,
  );
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
  if (status === "changed") return { ok: false, reason: "changed" };
  if (status === "still_open") return { ok: false, reason: "still_open" };
  if (status !== "ok") return { ok: false, reason: "error" };

  if (appr.cart_id) await touchCart(appr.cart_id, "resolveApproval"); // re-sync the diner cart / floor
  revalidatePath("/staff");
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

/** A cheap head-count of open requests for the bar's approvals circle (manager+ only). PD8 (m8
 *  decision 4): NEVER a false 0 — the verdict is `lib/approvals-count.ts`'s, so an error or an
 *  unreadable count is `{ ok: false }` (the circle draws a dashed ring and "couldn't check"). The
 *  old `0` degrade dated from when the badge was an ornament; A4·5 made this circle the counter's
 *  one pending-approvals signal. An unauthorized caller is unknown too (the circle renders only for
 *  a manager, so that arm is never drawn). */
export async function countPendingApprovals(): Promise<PendingCount> {
  const caller = await requireStaff("manager").catch(() => null);
  if (!caller) return { ok: false };
  const { count, error } = await serviceClient()
    .from("mms_approvals")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return pendingCountVerdict({ count, error });
}

export type PendingApproval = {
  id: string;
  kind: "void" | "comp";
  lineName: string;
  /** PD8 — the dish's Burmese (advisory: null draws the English snapshot alone). */
  nameMy: string | null;
  qty: number;
  amountCents: number;
  reasonCode: string;
  cooked: boolean;
  sessionId: string | null;
  tableLabel: string | null;
  /** PD8 — the registered table NUMBER (the card's link to its pane); null off a registered table. */
  tableNumber: number | null;
  initiatorName: string;
  /** PD8 — who asked, so the picker can leave them out (`eligibleApprovers`). */
  initiatorStaffId: string;
  /** PD8 — the cart's status: `paid` and `cancelled` draw the close-only card (`requestCardState`);
   *  null when the request carries no cart. */
  cartStatus: CartStatus | null;
  /** PD8 · M184 — the line as it stands NOW (qty · unit price), or null when it is gone: the card
   *  draws "Changed after {x} asked" from this against its own `qty` / `amountCents` snapshot. */
  lineNow: RequestLineNow;
  lineId: string | null;
  createdAt: string;
};

/**
 * The open request queue (manager-gated). Bounded; oldest first so a manager works it top-down. Joins the
 * initiator's display name and the table label for legibility. Read via service-role (the audit table is
 * owner-read RLS); the requireStaff('manager') gate is the authority for who may see/resolve it.
 */
/**
 * W11 review — the strip's copy told the manager to "mark it resolved", and no resolve control
 * existed anywhere: rows would accumulate forever and new ones eventually fall off the 50-row read.
 * Manager-gated like every loss decision; the UPDATE is scoped to one id and flips only `resolved`.
 */
export async function resolveRefundNeeded(id: string): Promise<void> {
  await requireStaff("manager");
  const db = serviceClient();
  const { error } = await db.from("qr_refunds_needed").update({ resolved: true }).eq("id", id);
  if (error)
    throw new AuthzError("We can’t reach the ordering system right now", 503, "unavailable");
  revalidatePath("/staff");
}

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

/**
 * M34 — the board's poll. NEVER throws: an expired session is `signin` (the board leaves for the
 * login, as every other board does on its own poll's verdict), an unreadable queue is `outage` (a
 * KNOWN side — the board freezes as such instead of "not updating"), and the rows otherwise.
 * `listPendingApprovals` below keeps its throw for the page's `allSettled` render; the verdict is
 * `lib/approvals-poll.ts`'s, so it is falsifiable by a value. A hung transport rejects on the
 * client, in `raceTimeout`, and stays the board's `unknown` there.
 */
export type ApprovalsPoll =
  | { ok: true; rows: PendingApproval[] }
  | { ok: false; reason: ApprovalsPollRefusal };

export async function pollPendingApprovals(): Promise<ApprovalsPoll> {
  try {
    return { ok: true, rows: await listPendingApprovals() };
  } catch (e) {
    return { ok: false, reason: approvalsPollVerdict(e) };
  }
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
      "id,kind,line_name,qty,amount_cents,reason_code,cooked,session_id,cart_id,line_id,initiator_staff_id,created_at",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(200);
  if (rowsError) throw unavailable();
  if (!rows || rows.length === 0) return [];

  const initiatorIds = [...new Set(rows.map((r) => r.initiator_staff_id))];
  const sessionIds = [...new Set(rows.map((r) => r.session_id).filter((x): x is string => !!x))];
  const cartIds = [...new Set(rows.map((r) => r.cart_id).filter((x): x is string => !!x))];
  const lineIds = [...new Set(rows.map((r) => r.line_id).filter((x): x is string => !!x))];
  type SessionRow = { id: string; qr_code: string; table_number: number | null };
  type CartRow = { id: string; status: string };
  type LineRow = { id: string; qty: number; unit_price_cents: number; menu_item_id: string | null };
  const [staffRes, sessionsRes, cartsRes, linesRes] = await Promise.all([
    db.from("staff").select("user_id,display_name").in("user_id", initiatorIds),
    sessionIds.length
      ? db.from("table_sessions").select("id,qr_code,table_number").in("id", sessionIds)
      : Promise.resolve({ data: [] as SessionRow[], error: null }),
    // PD8 — the cart's status decides the card (open · paid · cleared): a paid table gets the
    // close-only card, never an Approve that fails "no longer open".
    cartIds.length
      ? db.from("qr_carts").select("id,status").in("id", cartIds)
      : Promise.resolve({ data: [] as CartRow[], error: null }),
    // PD8 · M184 — the line as it stands NOW, so the card can say "Changed after {x} asked" before
    // any PIN is typed (the SQL refuses `changed` at the write regardless).
    lineIds.length
      ? db.from("qr_cart_items").select("id,qty,unit_price_cents,menu_item_id").in("id", lineIds)
      : Promise.resolve({ data: [] as LineRow[], error: null }),
  ]);
  // Names/labels are the queue's attribution — "A server · no table" on every row is misinformation
  // on an audit surface, not a degrade. The cart status and the live line decide which KEYS a card
  // offers, so an unread one is an outage too, never "open".
  if (staffRes.error || sessionsRes.error || cartsRes.error || linesRes.error) throw unavailable();
  const nameById = new Map((staffRes.data ?? []).map((s) => [s.user_id, s.display_name]));
  const sessionById = new Map((sessionsRes.data ?? []).map((s) => [s.id, s]));
  const cartStatusById = new Map((cartsRes.data ?? []).map((c) => [c.id, c.status]));
  const lineById = new Map((linesRes.data ?? []).map((l) => [l.id, l]));
  // The dish's Burmese, through the ONE line-name loader (advisory, like the detail's).
  const names = await loadLineNames(
    db,
    (linesRes.data ?? [])
      .filter((l) => l.menu_item_id)
      .map((l) => ({ menu_item_id: l.menu_item_id! })),
    { tag: "approvals" },
  );
  const cartStatusOf = (cartId: string | null): CartStatus | null => {
    const s = cartId ? cartStatusById.get(cartId) : undefined;
    return s === "open" || s === "paid" || s === "cancelled" ? s : null;
  };

  return rows.map((r) => {
    const line = r.line_id ? lineById.get(r.line_id) : undefined;
    const session = r.session_id ? sessionById.get(r.session_id) : undefined;
    return {
      id: r.id,
      kind: r.kind as "void" | "comp",
      lineName: r.line_name ?? "Item",
      nameMy: line?.menu_item_id
        ? catalogNameMy(names.nameMyByRef.get(line.menu_item_id), r.line_name ?? "Item")
        : null,
      qty: r.qty ?? 1,
      amountCents: r.amount_cents,
      reasonCode: r.reason_code,
      cooked: r.cooked,
      sessionId: r.session_id,
      tableLabel: session?.qr_code ?? null,
      tableNumber: session?.table_number ?? null,
      initiatorName: nameById.get(r.initiator_staff_id) ?? "A server",
      initiatorStaffId: r.initiator_staff_id,
      cartStatus: cartStatusOf(r.cart_id),
      lineNow: line ? { qty: line.qty, unitPriceCents: line.unit_price_cents } : null,
      lineId: r.line_id,
      createdAt: r.created_at,
    };
  });
}
