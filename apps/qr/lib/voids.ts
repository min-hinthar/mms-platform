"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { serviceClient } from "@mms/db/server";
import { voidLineInput } from "@mms/db/schemas";
import { requireStaff } from "./staff";
import { approverStepUpAllowed, verifyStaffPin } from "./staff-pin";
import { paymentInFlightReason } from "./pay-guard";
import { touchCart } from "./order-lines";
import { getPostHogClient } from "./posthog-server";

/**
 * Loss-gated voids/comps (S2.3) — the ORDER-MODEL "server-initiated + manager step-up, gated by loss".
 * Server Actions are public POSTs (IDOR by default), so every export re-checks requireStaff() and acts via
 * the service-role client. The loss gate (cooked? over-ceiling? comp?) is derived SERVER-side in
 * mms_void_line from the line's state + value — the client never asserts it. The manager step-up reuses
 * mms_staff_verify_pin (lockout-counted); a `server`-role approver is rejected even with a correct PIN.
 */

export type Approver = { staffId: string; displayName: string; role: "manager" | "owner" };

/**
 * The active managers/owners a server can tap to authorize a loss action (the step-up's name picker).
 * Any active staff may READ this (it's colleague display names, already visible on the floor) — the
 * authority is the PIN + role check at void time, not who can see the list.
 */
export async function listApprovers(): Promise<Approver[]> {
  await requireStaff();
  const { data } = await serviceClient()
    .from("staff")
    .select("user_id,display_name,role,active")
    .in("role", ["manager", "owner"])
    .eq("active", true)
    .limit(100);
  return (data ?? [])
    .map((r) => ({
      staffId: r.user_id,
      displayName: r.display_name,
      role: r.role as "manager" | "owner",
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export type VoidLineResult =
  | { ok: true; action: "void" | "comp" }
  // `needs_pin` is the SERVER deciding this line needs a manager (cooked / over-ceiling / comp) when the
  // first attempt came in solo — the UI then shows the step-up. The PIN sub-states mirror unlockConsole.
  | { ok: false; reason: "needs_pin" }
  | { ok: false; reason: "pin_wrong"; attemptsRemaining: number }
  | { ok: false; reason: "pin_locked"; lockedUntil: string }
  | {
      ok: false;
      reason:
        | "pin_no_pin"
        | "bad_approver"
        | "step_up_rate_limited"
        | "not_open"
        | "not_found"
        | "in_flight"
        | "already"
        | "error";
    };

/**
 * Void (cancel + remove) or comp (free, kitchen still makes it) a line on a table's open order. Two-pass
 * by design: the UI first calls SOLO (no approver); if the server says this line needs authority it
 * returns `needs_pin` and the UI collects a manager + PIN and re-submits. The PIN is verified here
 * (lockout-counted) BEFORE the RPC; mms_void_line re-checks the approver's role + self-approval in SQL and
 * writes the audit row in the same transaction as the state flip.
 */
export async function voidLine(raw: unknown): Promise<VoidLineResult> {
  const caller = await requireStaff().catch(() => null);
  if (!caller) return { ok: false, reason: "error" };
  const parsed = voidLineInput.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "error" };
  const { sessionId, cartItemId, action, reason, approverStaffId, pin } = parsed.data;

  const db = serviceClient();
  // Resolve THIS table's open cart and refuse mid-payment (shared mutex with cash settle / split / clear)
  // — a void mustn't change a total a diner or cashier is settling.
  const { data: cart } = await db
    .from("qr_carts")
    .select("id,locked,locked_at,settle_at")
    .eq("session_id", sessionId)
    .eq("status", "open")
    .maybeSingle();
  if (!cart) return { ok: false, reason: "not_open" };
  if (await paymentInFlightReason(cart)) return { ok: false, reason: "in_flight" };
  // The line must belong to this table's open cart (an id from another table is a not-found, not an edit).
  const { data: line } = await db
    .from("qr_cart_items")
    .select("id")
    .eq("id", cartItemId)
    .eq("cart_id", cart.id)
    .maybeSingle();
  if (!line) return { ok: false, reason: "not_found" };

  // When the server picked a manager, verify their PIN server-side FIRST (lockout-counted). A bad/locked
  // PIN never reaches the RPC. The approver id then goes to mms_void_line, which re-checks role + self.
  // undefined (not null) so an omitted approver falls through to the RPC's `p_approver default null`.
  let approver: string | undefined;
  if (approverStaffId && pin) {
    // W1·Q7: refuse to spend the target's lockout budget until the approver id resolves to an active
    // manager/owner ≠ the caller AND the CALLER is within the step-up rate bucket — otherwise any
    // staff account can serially wrong-PIN every manager and lock approvals floor-wide.
    const pre = await approverStepUpAllowed(approverStaffId, caller.staffId);
    if (pre !== "ok") return { ok: false, reason: pre };
    const v = await verifyStaffPin(approverStaffId, pin);
    if (v.status === "wrong")
      return { ok: false, reason: "pin_wrong", attemptsRemaining: v.attemptsRemaining };
    if (v.status === "locked")
      return { ok: false, reason: "pin_locked", lockedUntil: v.lockedUntil };
    if (v.status === "no_pin") return { ok: false, reason: "pin_no_pin" };
    if (v.status !== "ok") return { ok: false, reason: "error" };
    approver = approverStaffId;
  }

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
  if (status === "needs_approval") return { ok: false, reason: "needs_pin" };
  if (status === "self_approve" || status === "bad_approver")
    return { ok: false, reason: "bad_approver" };
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
