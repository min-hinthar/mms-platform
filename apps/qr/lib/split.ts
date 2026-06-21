"use server";
import { serviceClient } from "@mms/db/server";
import { cartViewInput, splitModeInput } from "@mms/db/schemas";
import { assertCartMember } from "./authz";
import { getCartTotals } from "./totals";
import { deriveShareBreakdowns } from "./split-math";
import { acquireSettlement, releaseSettlement } from "./lock";
import { getStripe } from "./stripe";

export type SplitContext = {
  mode: string;
  mySeat: string;
  myRole: "host" | "guest";
  members: { seat: string; name: string; role: "host" | "guest" }[];
};

/** One payer's row on the live settlement board (M3·P3.3b). `amountCents` is the PI target (base, then
 *  base + tip once they pick a tip). Status drives the board: pending → authorized → captured. */
export type SettlementShare = {
  seat: string;
  amountCents: number;
  tipCents: number;
  status: "pending" | "authorized" | "captured" | "canceled" | "failed";
};

/**
 * Group context the /cart split UI needs (M3·P3.3a): the session mode (the split shows for dine-in
 * groups only), the viewer's seat + role (drives canMutateLine in the UI), and the table's members
 * (the people a line can be assigned to + whose shares to show). Member-gated.
 *
 * The per-seat SHARES are computed client-side from the server-authoritative total + lines via the
 * isomorphic `split-math` (instant, cent-reconciled — see SplitSection). The SERVER share derivation
 * lands with P3.3b, where each share backs a real PaymentIntent and must be server-issued + stored.
 */
export async function getSplitContext(cartId: string): Promise<SplitContext> {
  const { cartId: id } = cartViewInput.parse({ cartId });
  const { sessionId, uid, role } = await assertCartMember(id);
  const db = serviceClient();
  const { data: sess } = await db
    .from("table_sessions")
    .select("mode")
    .eq("id", sessionId)
    .maybeSingle();
  const { data: members } = await db
    .from("session_members")
    .select("seat_id,display_name,role,created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  return {
    // Default to "" (not "dinein") on a missing session row, so a transient read miss can't switch
    // on the group UI; a real dine-in session reports "dinein".
    mode: sess?.mode ?? "",
    mySeat: uid,
    myRole: role,
    members: (members ?? []).map((m) => ({
      seat: m.seat_id,
      name: m.display_name,
      role: m.role === "host" ? "host" : "guest",
    })),
  };
}

/**
 * Member-gated read of the live settlement board (M3·P3.3b) — every payer's share + status. The client
 * also subscribes to qr_cart_shares via Realtime; this is the initial fetch + a re-sync after changes.
 */
export async function getSettlement(cartId: string): Promise<SettlementShare[]> {
  const { cartId: id } = cartViewInput.parse({ cartId });
  await assertCartMember(id); // authz only — any member may watch the board
  const db = serviceClient();
  const { data } = await db
    .from("qr_cart_shares")
    .select("seat_id,amount_cents,tip_cents,status,created_at")
    .eq("cart_id", id)
    .order("created_at", { ascending: true });
  return (data ?? []).map((s) => ({
    seat: s.seat_id,
    amountCents: s.amount_cents,
    tipCents: s.tip_cents,
    status: s.status as SettlementShare["status"],
  }));
}

/**
 * Open a split-tender settlement (M3·P3.3b). HOST-gated. Freezes the cart table-wide (acquireSettlement —
 * atomic, mutually exclusive with the single-pay lock), derives the SERVER-authoritative per-seat BASE
 * breakdown (deriveShareBreakdowns: tax on each seat's own taxable base, every component largest-
 * remainder so Σ == the cart total), and writes the share ledger. Tip is per-payer, added when each
 * payer creates their PaymentIntent — so the stored `amount_cents` is the base (no tip) here.
 *
 * Re-openable BEFORE anyone authorizes (a host changing even ↔ by-person): the freeze is the mutex, so
 * we acquire first; if any share is already authorized/captured we refuse (re-deriving would orphan a
 * live PaymentIntent) WITHOUT clearing; otherwise we replace the pending set.
 */
export async function openSettlement(cartId: string, mode: "even" | "by_person"): Promise<void> {
  const { cartId: id } = cartViewInput.parse({ cartId });
  const { mode: m } = splitModeInput.parse({ mode });
  const { uid, sessionId, role } = await assertCartMember(id);
  if (role !== "host") throw new Error("Only the host can start the split");

  // The freeze is the mutex — acquire FIRST so two opens can't race the derive/insert.
  const acq = await acquireSettlement(id, uid);
  if (acq === "locked") throw new Error("Someone’s checking out — try again in a moment");
  if (acq === "settling_other") throw new Error("Another host is already splitting this order");
  if (acq === "closed") throw new Error("This order is no longer open");

  const db = serviceClient();
  // Never re-derive once money is in flight — that would orphan an authorized PaymentIntent. (The
  // freeze was just refreshed by acquire, which is harmless; we simply don't touch the shares.)
  const { data: live } = await db
    .from("qr_cart_shares")
    .select("id")
    .eq("cart_id", id)
    .in("status", ["authorized", "captured"])
    .limit(1);
  if (live && live.length > 0) throw new Error("Payments are already in progress");

  const grand = await getCartTotals(id); // grand breakdown, no tip
  // A $0 cart can't be paid (mirrors create-intent's "Empty cart") and would auto-settle every share
  // to 'captured' with nothing to ever trigger fulfillment — refuse it (and lift the just-taken freeze).
  if (grand.subtotalCents - grand.discountCents + grand.serviceChargeCents + grand.taxCents <= 0) {
    await releaseSettlement(id);
    throw new Error("Nothing to pay");
  }
  const { data: members } = await db
    .from("session_members")
    .select("seat_id,created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  const { data: lines } = await db
    .from("qr_cart_items")
    .select("by_seat,qty,unit_price_cents,tax_cents")
    .eq("cart_id", id);

  const breakdowns = deriveShareBreakdowns(
    {
      subtotalCents: grand.subtotalCents,
      discountCents: grand.discountCents,
      serviceChargeCents: grand.serviceChargeCents,
      taxCents: grand.taxCents,
    },
    (members ?? []).map((mm) => ({ seat: mm.seat_id })),
    (lines ?? []).map((l) => ({
      bySeat: l.by_seat ?? null,
      qty: l.qty,
      unitPriceCents: l.unit_price_cents,
      taxCents: l.tax_cents,
    })),
    m,
  );

  // Replace any prior PENDING set (a re-open before anyone paid), then write the fresh shares.
  await db.from("qr_cart_shares").delete().eq("cart_id", id);
  const { error } = await db.from("qr_cart_shares").insert(
    breakdowns.map((b) => ({
      cart_id: id,
      seat_id: b.seat,
      subtotal_cents: b.subtotalCents,
      discount_cents: b.discountCents,
      service_charge_cents: b.serviceChargeCents,
      tax_cents: b.taxCents,
      amount_cents: b.baseCents, // base only; the payer's tip is added at their pay step
      status: "pending" as const,
    })),
  );
  if (error) {
    await releaseSettlement(id); // don't strand a freeze with no shares behind it
    throw new Error("Could not start the split");
  }
  // A $0-base share (a seat owning nothing in by-person) has nothing to pay — auto-settle it to
  // 'captured' so it never blocks the all-captured fulfillment gate and that payer is never shown a $0
  // Payment Element. It contributes $0 to the summed order. (A non-zero grand total is guaranteed above,
  // so not every share can be $0.)
  await db
    .from("qr_cart_shares")
    .update({ status: "captured" })
    .eq("cart_id", id)
    .eq("amount_cents", 0);
}

/**
 * Abort a split settlement (M3·P3.3b). HOST-gated. Cancels every payer's still-cancelable PaymentIntent
 * so no authorization hold lingers on a card, clears the ledger, and lifts the freeze. Refuses once any
 * share is captured (money has moved → the order is being fulfilled, not abortable).
 */
export async function abortSettlement(cartId: string): Promise<void> {
  const { cartId: id } = cartViewInput.parse({ cartId });
  const { role } = await assertCartMember(id);
  if (role !== "host") throw new Error("Only the host can cancel the split");
  const db = serviceClient();

  // CLAIM the abort FIRST by lifting the freeze: captureAllIfReady gates on a fresh settle_at, so any
  // capture path that hasn't started yet now bails. (A capture already past its gate finishes + fulfills;
  // we detect that below and defer to it — money taken must always become an order.)
  await releaseSettlement(id);

  const { data: shares } = await db
    .from("qr_cart_shares")
    .select("stripe_payment_intent_id,status")
    .eq("cart_id", id);
  // If a capture WON the race (any captured share), money is committing — re-freeze so the cart can't be
  // edited before the succeeded webhook snapshots the order, and let fulfillment finish (don't delete).
  if ((shares ?? []).some((s) => s.status === "captured")) {
    await refreeze(db, id);
    throw new Error("Payment already completed — the order will finish");
  }

  // Release each authorized/pending hold so a payer isn't left with a lingering authorization.
  for (const s of shares ?? []) {
    if (s.stripe_payment_intent_id && (s.status === "authorized" || s.status === "pending")) {
      try {
        await getStripe().paymentIntents.cancel(s.stripe_payment_intent_id);
      } catch {
        // Already canceled / captured / gone — best-effort; never block the abort on Stripe.
      }
    }
  }
  // Conditional delete — NEVER remove a share captured in the race window (its money is taken and the
  // succeeded webhook must still fulfill it). If one survived, re-freeze + surface it rather than strand.
  await db.from("qr_cart_shares").delete().eq("cart_id", id).neq("status", "captured");
  const { data: survivor } = await db
    .from("qr_cart_shares")
    .select("id")
    .eq("cart_id", id)
    .limit(1);
  if (survivor && survivor.length > 0) {
    await refreeze(db, id);
    throw new Error("Payment completed during cancel — the order will finish");
  }
}

/** Re-assert the settlement freeze on an open cart (used when an abort loses the race to a capture, so
 *  the cart stays read-only until the in-flight fulfillment snapshots the order). */
async function refreeze(db: ReturnType<typeof serviceClient>, cartId: string): Promise<void> {
  await db
    .from("qr_carts")
    .update({ settle_at: new Date().toISOString() })
    .eq("id", cartId)
    .eq("status", "open");
}
