"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { serviceClient } from "@mms/db/server";
import { setQtyInput, settleCashInput, staffAddItemInput } from "@mms/db/schemas";
import { requireStaff } from "./staff";
import { lineTax } from "./tax";
import { getCartTotals } from "./totals";
import { insertOrIncLine, priceItem, touchCart } from "./order-lines";
import { paymentInFlightReason } from "./pay-guard";
import { acquireSettlement, releaseSettlement } from "./lock";
import { getPostHogClient } from "./posthog-server";
import { getStripe } from "./stripe";
import { logTabEvent } from "./tab-events";

/**
 * Staff write to a table order (S1.3) — "order for a guest" + cash settle ("pay a human"). The cart
 * belongs to the TABLE, not the phone (ORDER-MODEL): staff write the SAME ledger a diner does, through
 * the SAME server-authoritative pricing (lib/order-lines.ts) and the SAME status-atomic RPCs — the only
 * difference is the authorization (requireStaff, not assertCartMember) and provenance (by_seat = null,
 * "added by server"). Server Actions are public POSTs (IDOR by default), so every export re-checks
 * requireStaff() and acts via the service-role client. Money is integer CENTS end-to-end; the client
 * never sends a price or a total.
 */

export type StaffWriteResult = { ok: true } | { ok: false; error: string };
export type SettleCashResult =
  | { ok: true; orderId: string; totalCents: number }
  | { ok: false; error: string };

/** Resolve the open cart for a session (the table's live order). Returns null when the session is
 *  closed or has no open cart (already settled/cancelled). */
async function openCartFor(sessionId: string) {
  const db = serviceClient();
  const { data: session } = await db
    .from("table_sessions")
    .select("id,status,mode")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session || session.status === "closed") return { session: null, cart: null };
  const { data: cart } = await db
    .from("qr_carts")
    .select("id,locked,locked_at,settle_at,tab_type")
    .eq("session_id", sessionId)
    .eq("status", "open")
    .maybeSingle();
  return { session, cart };
}

/**
 * Add an item to a table's open cart FOR a guest. Re-derives price/tax server-side (priceItem), merges
 * identical lines, and attributes the line to no seat (by_seat = null). Refused while a payment is in
 * flight (shared mutex with cash settle / clear-table) — staff mustn't change a total a diner is paying.
 */
export async function staffAddItem(raw: unknown): Promise<StaffWriteResult> {
  const caller = await requireStaff().catch(() => null);
  if (!caller) return { ok: false, error: "Staff sign-in required." };
  const parsed = staffAddItemInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { sessionId, menuItemId, modifierIds } = parsed.data;

  const { session, cart } = await openCartFor(sessionId);
  if (!session) return { ok: false, error: "That table is closed." };
  if (!cart) return { ok: false, error: "This table has no open order." };
  if (await paymentInFlightReason(cart))
    return { ok: false, error: "This table is mid-payment — wait until they’ve finished." };

  try {
    const dineIn = session.mode === "dinein";
    const { name, unitPriceCents, category, opts } = await priceItem(menuItemId, modifierIds);
    const taxCents = lineTax(unitPriceCents, category, dineIn);
    // by_seat = null: a staff-added line isn't pre-attributed to a guest's split (the host can assign it
    // later via the existing by-person flow). The status-atomic insert throws if the cart isn't open.
    // S4: fulfillment defaults from the session mode. Re-routing today is the DINER's per-line toggle
    // (setLineFulfillment, member-gated); a staff re-route action is S4.2+ (not built here).
    await insertOrIncLine(
      cart.id,
      { menuItemId, name, opts, unitPriceCents, taxCents, fulfillment: dineIn ? "dinein" : "togo" },
      null,
    );
    await touchCart(cart.id, "staffAddItem");
  } catch {
    // priceItem (unknown item) or a closed-cart race — honest, non-leaking copy.
    return { ok: false, error: "Couldn’t add that item." };
  }

  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    after(async () => {
      try {
        const ph = getPostHogClient();
        ph.capture({
          distinctId: `staff:${caller.staffId}`,
          event: "staff_added_item",
          properties: { role: caller.role, sessionId, menuItemId },
        });
        await ph.flush();
      } catch {
        /* analytics best-effort */
      }
    });
  }
  revalidatePath(`/staff/table/${sessionId}`);
  return { ok: true };
}

/**
 * Set the qty of a line on a table order (0 removes it) — the staff edit on the drill-down. No
 * canMutateLine restriction: staff have authority over any line (unlike a diner, who's guest-own-only).
 * Status-atomic + refused mid-payment. `sessionId` scopes the refresh/revalidate and verifies the line
 * really belongs to this table (defense against a mismatched id).
 */
export async function staffSetQty(sessionId: string, raw: unknown): Promise<StaffWriteResult> {
  const caller = await requireStaff().catch(() => null);
  if (!caller) return { ok: false, error: "Staff sign-in required." };
  const parsed = setQtyInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { cartItemId, qty } = parsed.data;

  const { session, cart } = await openCartFor(sessionId);
  if (!session) return { ok: false, error: "That table is closed." };
  if (!cart) return { ok: false, error: "This table has no open order." };
  if (await paymentInFlightReason(cart))
    return { ok: false, error: "This table is mid-payment — wait until they’ve finished." };

  const db = serviceClient();
  // The line must belong to THIS table's open cart (an id from another table is a not-found, not an edit).
  const { data: line } = await db
    .from("qr_cart_items")
    .select("id")
    .eq("id", cartItemId)
    .eq("cart_id", cart.id)
    .maybeSingle();
  if (!line) return { ok: false, error: "That item isn’t on this table." };

  // Status-atomic set/delete (qty<=0 removes) — applies only while the cart is 'open' (same RPC the
  // diner path uses). 0 rows ⇒ the cart flipped paid/closed under us.
  const { data: affected } = await db.rpc("mms_cart_item_set_qty_if_open", {
    p_id: cartItemId,
    p_qty: qty,
  });
  if (!affected) return { ok: false, error: "This table’s order is no longer open." };
  await touchCart(cart.id, "staffSetQty");
  revalidatePath(`/staff/table/${sessionId}`);
  return { ok: true };
}

/**
 * Settle the table order in CASH ("pay a human"). Re-derives the authoritative total server-side
 * (getCartTotals — the single tax engine), then records an idempotent cash order via
 * mms_fulfill_cash_order (atomic open→paid flip, subtotal reconcile, cart-id idempotency). tip_cents=0:
 * a cash tip is in-hand / off-system (Min's call); the SB-1524 service charge is still applied + shown.
 * Refused while a card payment / split is in flight (shared mutex) so cash can't double-charge a table.
 */
export async function settleCash(raw: unknown): Promise<SettleCashResult> {
  const caller = await requireStaff().catch(() => null);
  if (!caller) return { ok: false, error: "Staff sign-in required." };
  const parsed = settleCashInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { sessionId } = parsed.data;

  const { session, cart } = await openCartFor(sessionId);
  if (!session) return { ok: false, error: "That table is closed." };
  if (!cart) return { ok: false, error: "This table has no open order to settle." };
  if (await paymentInFlightReason(cart))
    return {
      ok: false,
      error: "Someone’s already paying on their phone — wait for that to finish.",
    };

  const db = serviceClient();
  const { count } = await db
    .from("qr_cart_items")
    .select("id", { count: "exact", head: true })
    .eq("cart_id", cart.id);
  if ((count ?? 0) === 0) return { ok: false, error: "There’s nothing on this table to settle." };

  // ATOMICALLY freeze the table before deriving totals (S1-audit B2). The early paymentInFlightReason
  // check above is a fast read; this is the race-closing claim. acquireSettlement flips settle_at only
  // when the cart is open AND `locked=false` — so a card pay already holding the single-pay lock makes
  // this fail (refuse), and once WE hold the freeze a concurrent create-intent's acquireCartLock (which
  // requires settle_at null/stale) can't start. Without this, a diner could begin + capture a card
  // payment during the getCartTotals→RPC window and the late webhook would orphan that charge.
  // Keyed by the staff session uid (provenance; re-acquire by the same staff is idempotent).
  const freeze = await acquireSettlement(cart.id, caller.uid);
  if (freeze !== "acquired") {
    return {
      ok: false,
      error:
        freeze === "closed"
          ? "That table is no longer open."
          : "Someone’s already paying on their phone — wait for that to finish.",
    };
  }

  // Hold the freeze across totals + settle, and ALWAYS release it in `finally` — a throw from
  // getCartTotals (or anywhere below) must never strand the table frozen for the 10-min TTL. Releasing
  // on the success path too is harmless (the cart is already 'paid', which blocks pays regardless).
  try {
    // Authoritative breakdown (cents), tip=0 for cash. The RPC re-derives the subtotal from the live
    // lines and reconciles it against this — a diner racing the settle raises instead of recording stale.
    const totals = await getCartTotals(cart.id, 0);
    const { data: orderId, error } = await db.rpc("mms_fulfill_cash_order", {
      p_cart_id: cart.id,
      p_settled_by: caller.staffId,
      p_subtotal_cents: totals.subtotalCents,
      p_discount_cents: totals.discountCents,
      p_service_charge_cents: totals.serviceChargeCents,
      p_tax_cents: totals.taxCents,
      p_tip_cents: 0,
    });
    if (error || !orderId) {
      console.error("[staff-cart] mms_fulfill_cash_order failed", {
        sessionId,
        cartId: cart.id,
        message: error?.message,
      });
      // A subtotal-mismatch raise means the cart changed under the settle — steer staff to retry fresh.
      return { ok: false, error: "Couldn’t settle — the order changed. Check it and try again." };
    }

    // Redeem any applied reward coupon (M4 P4.2) — flip it to redeemed now the cash order is snapshotted
    // (the cash subtotal-reconcile already counted its discount). Idempotent; best-effort.
    const { error: redErr } = await db.rpc("mms_redeem_cart_reward", {
      p_cart: cart.id,
      p_order: orderId,
    });
    if (redErr)
      console.error("[staff-cart] reward redeem failed", {
        cartId: cart.id,
        message: redErr.message,
      });

    // Fire-at-checkout (S4.2): the table paid in cash → fire any still-draft FOOD (mms_fire_pending_food
    // gates to dine-in + food, never grocery) so the kitchen makes everything they paid for ("no charge-
    // with-no-fire"). Drained out of band: a kitchen-fire hiccup must NEVER fail a settled cash order.
    // Idempotent (no draft food left ⇒ fires 0); the KDS picks up the now-fired lines via realtime.
    // S4-audit P1-2: each side-effect is independent — a thrown await on one must not starve the next two;
    // the pg_cron reconciler (mms_reconcile_settled_fulfillment) is the durable backstop if after() never runs.
    after(async () => {
      try {
        const { error: fireErr } = await db.rpc("mms_fire_pending_food", { p_cart_id: cart.id });
        if (fireErr)
          console.error("[staff-cart] fire-at-checkout failed", {
            cartId: cart.id,
            message: fireErr.message,
          });
      } catch (e) {
        console.error("[staff-cart] fire-at-checkout threw", { cartId: cart.id, error: e });
      }
      // To-go fulfillment loop (S4.3a): flag 'preparing' if the order has a takeaway (togo/grocery) line,
      // so the expo station + /track reflect it. Idempotent; null for a pure dine-in order.
      try {
        const { error: togoErr } = await db.rpc("mms_init_togo_status", {
          p_order: orderId,
          p_cart: cart.id,
        });
        if (togoErr)
          console.error("[staff-cart] init togo_status failed", {
            cartId: cart.id,
            message: togoErr.message,
          });
      } catch (e) {
        console.error("[staff-cart] init togo_status threw", { cartId: cart.id, error: e });
      }
      // Split-tender SEAM (S4.3c): record eligibility-at-sale on the order's grocery lines (2027 EBT key).
      try {
        const { error: ebtErr } = await db.rpc("mms_snapshot_ebt_eligibility", {
          p_order: orderId,
        });
        if (ebtErr)
          console.error("[staff-cart] snapshot ebt eligibility failed", {
            cartId: cart.id,
            message: ebtErr.message,
          });
      } catch (e) {
        console.error("[staff-cart] snapshot ebt eligibility threw", { cartId: cart.id, error: e });
      }
    });

    if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      after(async () => {
        try {
          const ph = getPostHogClient();
          ph.capture({
            distinctId: `staff:${caller.staffId}`,
            event: "staff_settle_cash",
            properties: {
              role: caller.role,
              mode: session.mode,
              sessionId,
              total_cents: totals.totalCents,
              item_count: count ?? 0,
            },
          });
          await ph.flush();
        } catch {
          /* analytics best-effort — never fail a settled order on a capture error */
        }
      });
    }
    // Tab-close audit (S3.3 / T13): a cash settle that closed a tab. Card closes are logged in the
    // webhook fulfill; cash never touches it, so log here. Best-effort, drained out of band.
    if (cart.tab_type && cart.tab_type !== "none") {
      const tabType = cart.tab_type as "trust" | "secure";
      after(() =>
        logTabEvent({
          cartId: cart.id,
          sessionId,
          event: "closed",
          actorKind: "staff",
          actorStaffId: caller.staffId,
          tabType,
          amountCents: totals.totalCents,
        }),
      );
    }
    revalidatePath("/staff");
    revalidatePath(`/staff/table/${sessionId}`);
    return { ok: true, orderId, totalCents: totals.totalCents };
  } finally {
    await releaseSettlement(cart.id);
  }
}

export type CloseSecureTabResult = { ok: true } | { ok: false; error: string };

/**
 * Close a SECURE tab off-session (S3.2): charge the saved card-on-file for the final total. Staff-
 * initiated (the guest may have left). Mirrors settleCash's mutex (acquireSettlement) so a concurrent
 * cash settle / diner card-pay can't double-collect; the PI is minted off_session+confirm and FULFILLED
 * by the EXISTING payment_intent.succeeded webhook (reconcile → mms_fulfill_order) — no fourth fulfill
 * path. Charges the final total with NO added tip: an off-session charge must not invent a tip the guest
 * didn't authorize (ORDER-MODEL's "never walk a customer into a charge") — a tip stays cash/interactive.
 * A decline / authentication_required is surfaced and the freeze released — the cart stays open, never
 * stranded as paid (the fulfill only flips the cart on a succeeded webhook).
 */
export async function closeSecureTab(raw: unknown): Promise<CloseSecureTabResult> {
  const caller = await requireStaff().catch(() => null);
  if (!caller) return { ok: false, error: "Staff sign-in required." };
  const parsed = settleCashInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { sessionId } = parsed.data;

  const { session, cart } = await openCartFor(sessionId);
  if (!session) return { ok: false, error: "That table is closed." };
  if (!cart) return { ok: false, error: "This table has no open order to settle." };

  // Re-derive the tab state server-side (not just the sidecar PM): only a still-secure tab is closed on
  // file. Guards the cancelled/merged-source edge where a stale sidecar PM could otherwise be charged.
  // tab_type comes from openCartFor (the live open cart), not the client.
  if (cart.tab_type !== "secure")
    return { ok: false, error: "This tab has no card on file — settle by cash or card instead." };

  const db = serviceClient();
  // The saved card lives in the service-role-only sidecar (never the realtime-fanned cart row).
  const { data: secure } = await db
    .from("mms_tab_secure")
    .select("stripe_customer_id,stripe_payment_method_id")
    .eq("cart_id", cart.id)
    .maybeSingle();
  if (!secure?.stripe_payment_method_id)
    return { ok: false, error: "No card on file for this tab — settle by cash or card instead." };

  if (await paymentInFlightReason(cart))
    return {
      ok: false,
      error: "Someone’s already paying on their phone — wait for that to finish.",
    };

  // Atomically freeze the table before charging (parity with settleCash's B2 race-closer): blocks a
  // concurrent cash settle / a diner's create-intent for the mint window.
  const freeze = await acquireSettlement(cart.id, caller.uid);
  if (freeze !== "acquired")
    return {
      ok: false,
      error:
        freeze === "closed"
          ? "That table is no longer open."
          : "Someone’s already paying on their phone — wait for that to finish.",
    };

  const totals = await getCartTotals(cart.id, 0); // final total, NO added tip (see the doc-comment)
  const amount = totals.totalCents;
  if (amount <= 0) {
    await releaseSettlement(cart.id);
    return { ok: false, error: "There’s nothing on this table to settle." };
  }

  try {
    const intent = await getStripe().paymentIntents.create(
      {
        amount,
        currency: "usd",
        customer: secure.stripe_customer_id,
        payment_method: secure.stripe_payment_method_id,
        off_session: true,
        confirm: true,
        // Same metadata shape the webhook fulfill path expects (cartId + tipRate) — it reconciles against
        // getCartTotals(cart, 0) and snapshots the order idempotently on the PI id. closedBy/closedByStaffId
        // attribute the close in the T13 audit log (the webhook logs 'closed' from this metadata).
        metadata: {
          cartId: cart.id,
          tipRate: "0",
          closedBy: "staff",
          closedByStaffId: caller.staffId,
        },
      },
      // Per-ATTEMPT idempotency key (covers the SDK's network retries WITHIN this one create call). It is
      // deliberately NOT stable across attempts: a STABLE key caches a Stripe decline for 24h, so a soft
      // decline (insufficient_funds → the guest funds the card) could never be re-charged. The concurrent
      // double-charge guard here is the FREEZE (paymentInFlightReason + acquireSettlement serialize
      // attempts), not this key; the rare freeze-TTL-expiry orphan is caught by the qr_refunds_needed ledger.
      { idempotencyKey: `pi_${cart.id}_close_${crypto.randomUUID()}` },
    );
    if (intent.status === "succeeded" || intent.status === "processing") {
      // Leave the freeze HELD — unlike cash (paid in-RPC), the off-session charge is fulfilled
      // asynchronously by the webhook; releasing now would reopen a double-collect window. The fulfill
      // flips the cart to paid; the SETTLE_TTL is the backstop if the webhook is delayed.
      if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
        after(async () => {
          try {
            const ph = getPostHogClient();
            ph.capture({
              distinctId: `staff:${caller.staffId}`,
              event: "staff_close_secure_tab",
              properties: { role: caller.role, sessionId, total_cents: amount },
            });
            await ph.flush();
          } catch {
            /* analytics best-effort — never fail a settled tab on a capture error */
          }
        });
      }
      revalidatePath("/staff");
      revalidatePath(`/staff/table/${sessionId}`);
      return { ok: true };
    }
    // requires_action / requires_payment_method / etc. — not captured. Free the table; surface honestly.
    await releaseSettlement(cart.id);
    return {
      ok: false,
      error: "That card needs the guest to confirm — settle by cash or a fresh card.",
    };
  } catch (e) {
    // An off_session decline throws a StripeCardError (code card_declined / authentication_required / …).
    // Release the freeze so the table isn't stranded frozen, and surface a tender-fallback message — the
    // tab is never marked paid (the fulfill only flips on a succeeded webhook).
    await releaseSettlement(cart.id);
    const code = (e as { code?: string }).code;
    console.error("[staff-cart] closeSecureTab off-session charge failed", {
      sessionId,
      cartId: cart.id,
      code,
    });
    return {
      ok: false,
      error:
        code === "authentication_required"
          ? "That card needs the guest to confirm — settle by cash or a fresh card."
          : "The card on file was declined — settle by cash or a fresh card.",
    };
  }
}
