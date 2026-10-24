"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { serviceClient } from "@mms/db/server";
import { counterNoShowInput, voidLineInput } from "@mms/db/schemas";
import { AuthzError } from "./authz";
import { getStaffAuth, requireStaff } from "./staff";
import { approverFor } from "./approvers";
import { paymentInFlightReason } from "./pay-guard";
import { touchCart } from "./order-lines";
import { getPostHogClient } from "./posthog-server";
import { openCartFor } from "./staff-open-cart";
import { isCounterOrder, noShowOutcome } from "./counter-order";

/**
 * Loss-gated voids/comps (S2.3) — the ORDER-MODEL "server-initiated + manager step-up, gated by loss".
 * Server Actions are public POSTs (IDOR by default), so every export re-checks requireStaff() and acts via
 * the service-role client. The loss gate (cooked? over-ceiling? comp?) is derived SERVER-side in
 * mms_void_line from the line's state + value — the client never asserts it. No-PIN (owner, 2026-10-24):
 * the approver is the SIGNED-IN caller when they are a manager or owner (`approverFor`); a server's
 * gated ask goes to the approvals queue. The SQL re-checks the approver's role and that they are active.
 */

/**
 * One roster row. No-PIN (owner, 2026-10-24): the decision reads the caller's OWN row (`self`) to
 * name the decider or say why they cannot (`decideAs`, `lib/approvers.ts`).
 */
export type Approver = {
  staffId: string;
  displayName: string;
  /** `server` only on the caller's OWN row (`self`), which rides along for the slip's asker token;
   *  every other row is an active manager or owner. */
  role: "server" | "manager" | "owner";
  active: boolean;
  /** PD8 — this row is the signed-in caller: the asker of a loss request they open (D4: the asker is
   *  always the signed-in account), left out of the signers by `eligibleApprovers`. */
  self: boolean;
};

/**
 * The active managers/owners, plus the CALLER's own row marked `self` (a server's too). Any active
 * staff may READ this (colleague display names, already visible on the floor) — the authority is the
 * role check at decision time, not who can see the list. No-PIN: the decision reads `self` to say who
 * is deciding ("Deciding as Aye") without a second identity read on the client.
 */
export async function listApprovers(): Promise<Approver[]> {
  const caller = await requireStaff();
  const db = serviceClient();
  const { data, error } = await db
    .from("staff")
    .select("user_id,display_name,role,active")
    .in("role", ["manager", "owner"])
    .eq("active", true)
    .limit(100);
  // W10b — a failed read must not render as "no managers to pick" (a false-empty step-up picker).
  // Throwing lands in the caller's catch (LossActionSheet's load-failure copy).
  if (error)
    throw new AuthzError("We can’t reach the ordering system right now", 503, "unavailable");
  const rows = data ?? [];
  const roster: Approver[] = rows
    .map((r) => ({
      staffId: r.user_id,
      displayName: r.display_name,
      role: r.role as "manager" | "owner",
      active: r.active === true,
      self: r.user_id === caller.staffId,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
  // A server-role caller is not a signer, so the roster read never lists them — the asker token
  // still needs their name: one `self` row, filtered out of the signers by the role rule.
  if (!roster.some((r) => r.self))
    roster.push({
      staffId: caller.staffId,
      displayName: caller.displayName,
      role: caller.role === "manager" || caller.role === "owner" ? caller.role : "server",
      active: true,
      self: true,
    });
  return roster;
}

export type VoidLineResult =
  | { ok: true; action: "void" | "comp" }
  // `needs_manager` is the SERVER deciding this line needs a manager (cooked / over-ceiling / comp)
  // and the caller is not one — the sheet then offers the approvals-queue request.
  | { ok: false; reason: "needs_manager" }
  | {
      ok: false;
      reason:
        | "bad_approver"
        | "not_open"
        | "not_found"
        | "in_flight"
        | "already"
        | "error"
        // W10b: the platform is unreachable — nothing was voided, and it's not a verdict about the
        // line or the caller. The sheet renders the wasn't-saved outage copy.
        | "outage";
    };

/**
 * Void (cancel + remove) or comp (free, kitchen still makes it) a line on a table's open order. One
 * pass (No-PIN, owner 2026-10-24): a manager or owner caller is sent as the approver of their own
 * write (`approverFor`); a server is sent with none, and a gated line answers `needs_manager` — the
 * sheet then files the request. mms_void_line re-checks the approver's role in SQL and writes the
 * audit row in the same transaction as the state flip.
 */
export async function voidLine(raw: unknown): Promise<VoidLineResult> {
  const auth = await getStaffAuth();
  // W10b — unknowable ≠ unauthorized: `outage` says "nothing was voided, track it on paper", never a
  // generic error that reads as a verdict about the line.
  if (auth.kind === "unavailable") return { ok: false, reason: "outage" };
  if (auth.kind !== "staff") return { ok: false, reason: "error" };
  const caller = auth.caller;
  const parsed = voidLineInput.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "error" };
  const { sessionId, cartItemId, action, reason } = parsed.data;

  const db = serviceClient();
  // Resolve THIS table's open cart and refuse mid-payment (shared mutex with cash settle / split / clear)
  // — a void mustn't change a total a diner or cashier is settling. W10b: an unread cart/line is not
  // "not open"/"not found" — those false verdicts end with the loss going untracked.
  const { data: cart, error: cartError } = await db
    .from("qr_carts")
    .select("id,locked,locked_at,settle_at")
    .eq("session_id", sessionId)
    .eq("status", "open")
    .maybeSingle();
  if (cartError) return { ok: false, reason: "outage" };
  if (!cart) return { ok: false, reason: "not_open" };
  if (await paymentInFlightReason(cart)) return { ok: false, reason: "in_flight" };
  // The line must belong to this table's open cart (an id from another table is a not-found, not an edit).
  const { data: line, error: lineError } = await db
    .from("qr_cart_items")
    .select("id")
    .eq("id", cartItemId)
    .eq("cart_id", cart.id)
    .maybeSingle();
  if (lineError) return { ok: false, reason: "outage" };
  if (!line) return { ok: false, reason: "not_found" };

  // No-PIN — the caller approves their own gated write when their role may sign; a server sends none.
  const approver = approverFor(caller);

  const { data: status, error } = await db.rpc("mms_void_line", {
    p_line: cartItemId,
    p_action: action,
    p_reason: reason,
    p_initiator: caller.staffId,
    p_approver: approver,
  });
  if (error) {
    console.error("[voids] mms_void_line failed", {
      sessionId,
      cartItemId,
      message: error.message,
    });
    return { ok: false, reason: "error" };
  }
  // `self_approve` is the PRE-No-PIN function's answer to a manager approving their own write
  // (20261024120000 drops it): until that migration applies, the manager is offered the request —
  // another manager decides it — never a dead refusal.
  if (status === "needs_approval" || status === "self_approve")
    return { ok: false, reason: "needs_manager" };
  if (status === "bad_approver") return { ok: false, reason: "bad_approver" };
  if (status === "not_open") return { ok: false, reason: "not_open" };
  if (status === "in_flight") return { ok: false, reason: "in_flight" }; // RPC's atomic pay-lock guard (B2)
  if (status === "not_found") return { ok: false, reason: "not_found" };
  if (status === "already_done") return { ok: false, reason: "already" };
  if (status !== "ok") return { ok: false, reason: "error" };

  await touchCart(cart.id, "voidLine"); // peers re-sync (the diner cart shows Removed/Comped, totals drop)
  revalidatePath(`/staff/table/${sessionId}`);

  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    after(async () => {
      try {
        const ph = getPostHogClient();
        // Non-PII: staff ids + the action/reason, never the diner. The durable record is mms_approvals;
        // this is just operational analytics (void-rate dashboards, anomaly review).
        ph.capture({
          distinctId: `staff:${caller.staffId}`,
          event: action === "comp" ? "line_comped" : "line_voided",
          properties: {
            role: caller.role,
            sessionId,
            reason,
            manager_approved: approver !== undefined,
          },
        });
        await ph.flush();
      } catch {
        /* analytics best-effort — never fail an audited void on a capture error */
      }
    });
  }
  return { ok: true, action };
}

// ── Phase 2f · P2v — a counter order's no-show (owner decision 7b) ──────────────────────────────

/** Every answer the no-show can give — CODES; the sheet maps each one to words (never a sentence). */
export type RecordCounterNoShowResult =
  | { ok: true }
  | { ok: false; reason: "needs_manager" }
  | {
      ok: false;
      reason:
        | "bad_approver"
        | "not_open"
        | "not_counter"
        | "in_flight"
        | "nothing_sent"
        | "changed"
        | "outage"
        | "error";
    };

/**
 * "They didn't come — void the order": a COUNTER order whose food went to the kitchen before it was
 * paid, and whose guest never collected it. `mms_counter_no_show` writes off ONLY the SENT food (past
 * its grace, not grocery, not comped) through the loss gate `mms_void_line` applies to one line — a
 * manager when anything sent was started or served, or its value is over the loss ceiling — records
 * one approved `no_show` row per sent line, returns in-grace lines to draft, cancels the cart and
 * closes the session. It never charges and never refunds; drafts and grocery are dropped with no row.
 *
 * One pass like `voidLine` (No-PIN, owner 2026-10-24): a manager or owner caller is sent as the
 * approver of their own write-off; a server is sent with none, and a gated no-show answers
 * `needs_manager` — a manager does it on their own sign-in (a no-show has no request queue). The SQL
 * re-checks the approver's role. The client never asserts a line, an amount or whether a manager is
 * needed. Server Actions are public POSTs: gated on the staff session first, written through the
 * service-role RPC only.
 */
export async function recordCounterNoShow(raw: unknown): Promise<RecordCounterNoShowResult> {
  const auth = await getStaffAuth();
  if (auth.kind === "unavailable") return { ok: false, reason: "outage" };
  if (auth.kind !== "staff") return { ok: false, reason: "error" };
  const initiator = auth.caller;
  const parsed = counterNoShowInput.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "error" };
  // The cross-area decision (Phase 2f review): the SENT line ids the sheet showed the approver ride
  // the write, and `mms_counter_no_show` refuses with `changed` (writing nothing) when the sent set it
  // derives under the cart lock is any other — so an approval lands on exactly the food it was shown.
  // `expectedLineIds` is the db area's REQUIRED schema field (uuid[], max 200 — a missing one fails
  // the parse above); the widened type is a no-op once it lands (resolves at integration).
  const { sessionId, expectedLineIds } = parsed.data as typeof parsed.data & {
    expectedLineIds: string[];
  };

  const found = await openCartFor(sessionId);
  if (found.unavailable) return { ok: false, reason: "outage" };
  if (!found.session || !found.cart) return { ok: false, reason: "not_open" };
  if (!isCounterOrder({ mode: found.session.mode, qrCode: found.session.qr_code }))
    return { ok: false, reason: "not_counter" };
  // The SQL refuses a fresh freeze too; this answers the honest reason first.
  if (await paymentInFlightReason(found.cart)) return { ok: false, reason: "in_flight" };

  // No-PIN — the caller approves their own gated write-off when their role may sign.
  const verifiedApprover = approverFor(initiator);

  const noShowArgs = {
    p_cart_id: found.cart.id,
    p_initiator: initiator.staffId,
    p_approver: verifiedApprover,
    p_expected_line_ids: expectedLineIds,
  };
  const { data: status, error } = await serviceClient().rpc("mms_counter_no_show", noShowArgs);
  if (error) {
    console.error("[voids] mms_counter_no_show failed", { sessionId, message: error.message });
    return { ok: false, reason: "error" };
  }
  const reason = noShowOutcome(status);
  if (reason !== "ok") return { ok: false, reason };

  await touchCart(found.cart.id, "recordCounterNoShow");
  revalidatePath("/staff");
  revalidatePath(`/staff/table/${sessionId}`);
  revalidatePath("/staff/kitchen");

  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    after(async () => {
      try {
        const ph = getPostHogClient();
        // Non-PII: the role and whether a manager approved. The durable record is mms_approvals.
        ph.capture({
          distinctId: `staff:${initiator.staffId}`,
          event: "counter_no_show",
          properties: {
            role: initiator.role,
            sessionId,
            manager_approved: verifiedApprover !== undefined,
          },
        });
        await ph.flush();
      } catch {
        /* analytics best-effort — never fail an audited write-off on a capture error */
      }
    });
  }
  return { ok: true };
}
