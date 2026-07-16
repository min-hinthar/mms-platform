"use server";
import { revalidatePath } from "next/cache";
import { serviceClient } from "@mms/db/server";
import { openTabInput } from "@mms/db/schemas";
import { getStaffAuth } from "./staff";
import { assertCartMember, AuthzError } from "./authz";
import { withinMutationRate } from "./rate";
import { paymentInFlightReason } from "./pay-guard";
import { logTabEvent } from "./tab-events";

/**
 * Tab actions (S3.1 — trust tab / deferred settlement; docs/S3_DESIGN.md). A tab is the table-owned
 * cart with settlement deferred — NOT a new ledger. Opening one marks the cart so the floor reads
 * "Tab open · $X" and the S3.3 ceiling/nudge have something to gate; the cart already accumulates and
 * fires in rounds (S2). CLOSE reuses the existing settle paths (cash → settleCash; card → the M1
 * Payment Element, which already carries the tip-on-final-total selector), so there's no fourth fulfill
 * path here.
 *
 * Authority is DUAL (T3, confirmed): a staff member (real account) OR a diner member of the cart may
 * open — both write the one table-owned cart. Server Actions are public POSTs (IDOR by default), so we
 * resolve authority here and never trust the client: staff via getStaffAuth(), a diner via
 * assertCartMember() (which also enforces the cart is open + the session active). We gate WHO may open
 * but no longer persist the opener's uid (A3: it would fan out to anon diners over the qr_carts realtime
 * row — a staff uid for staff opens; attribution returns in S3.3's service-role-only audit log).
 */

export type OpenTabResult = { ok: true } | { ok: false; error: string };

export async function openTab(raw: unknown): Promise<OpenTabResult> {
  const parsed = openTabInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { cartId } = parsed.data;

  // Resolve authority. Staff first: a real (non-anon) account isn't a session_member, so assertCartMember
  // would wrongly reject them — branch before it. A diner (anon) falls through to the membership IDOR
  // guard, which also rejects a non-member or a closed cart. We also capture the actor (kind + staff uid)
  // for the audit log — the attribution A3 pulled off the cart row now lives only in mms_tab_events (T13).
  const staff = await getStaffAuth();
  const actorKind: "staff" | "diner" = staff.kind === "staff" ? "staff" : "diner";
  const actorStaffId = staff.kind === "staff" ? staff.caller.staffId : null;
  if (staff.kind !== "staff") {
    try {
      const { uid } = await assertCartMember(cartId);
      // W1·Q6 flood guard (diner branch only — staff is a provisioned, audited account): a verified
      // member could otherwise churn tab opens with zero throttle.
      if (!(await withinMutationRate(uid)))
        return { ok: false, error: "Too many attempts — wait a moment and try again." };
    } catch (e) {
      if (e instanceof AuthzError)
        return { ok: false, error: "You can’t open a tab on this table." };
      throw e;
    }
  }

  const db = serviceClient();
  // Refuse while money's in flight on this cart — a single-pay lock, a split-settle freeze, or an
  // authorized share (paymentInFlightReason, the canonical mutex settleCash/clearTable use). Opening a
  // tab is a cart mutation, so it waits like every other one: the staff floor already hides Open-tab
  // mid-payment (canWrite), and this is the server backstop that also covers the diner /cart path
  // (whose review screen stays mounted under a single-pay lock).
  const { data: payCart } = await db
    .from("qr_carts")
    .select("id,session_id,locked,locked_at,settle_at")
    .eq("id", cartId)
    .maybeSingle();
  if (await paymentInFlightReason(payCart)) {
    return { ok: false, error: "Someone’s paying right now — try the tab again in a moment." };
  }

  const { data, error } = await db.rpc("mms_open_tab", { p_cart: cartId });
  if (error) {
    console.error("[tabs] mms_open_tab failed", error.message);
    return { ok: false, error: "Couldn’t open the tab — try again." };
  }
  switch (data) {
    case "opened": // a fresh none→trust open
    case "exists": {
      // Record a FRESH open in the durable audit trail (T13; best-effort, never blocks); a benign re-open
      // ('exists') isn't a new event. Either way the cart row change fans out over postgres_changes
      // (qr_carts is on the publication) to the floor + other diners — revalidate the server shells.
      if (data === "opened")
        await logTabEvent({
          cartId,
          sessionId: payCart?.session_id ?? null,
          event: "opened",
          actorKind,
          actorStaffId,
          tabType: "trust",
        });
      revalidatePath("/staff");
      revalidatePath("/cart");
      return { ok: true };
    }
    case "not_open":
      return { ok: false, error: "This order is no longer open." };
    case "not_dinein":
      return { ok: false, error: "Tabs are for dine-in tables." };
    case "not_found":
      return { ok: false, error: "That table isn’t here anymore." };
    default:
      return { ok: false, error: "Couldn’t open the tab — try again." };
  }
}
