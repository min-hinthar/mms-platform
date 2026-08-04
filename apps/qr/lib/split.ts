"use server";
import { serviceClient } from "@mms/db/server";
import { cartViewInput, splitModeInput } from "@mms/db/schemas";
import { assertCartMember, AuthzError } from "./authz";
import { assertMutationRate } from "./rate";
import { getCartTotals } from "./totals";
import { deriveShareBreakdowns } from "./split-math";
import { acquireSettlement, releaseSettlement } from "./lock";
import { releaseHold } from "./split-hold";

export type SplitContext = {
  mode: string;
  mySeat: string;
  myRole: "host" | "guest";
  members: { seat: string; name: string; role: "host" | "guest" }[];
  /** K2: the registered table (1–10) this dine-in session is seated at, or null. */
  tableNumber: number | null;
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
    .select("mode,table_number")
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
    tableNumber: sess?.table_number ?? null,
  };
}

/**
 * W9b — the board's read is a THREE-state answer (OPEN-ITEMS **M24**).
 *
 * `settled` is the only reason a client may route the table to its receipt: Server Action errors are
 * REDACTED in production, so from the client a transient blip and a real 403 look identical — routing
 * on "it threw" would eject a mid-authorization payer to a receipt that doesn't exist yet. The server
 * knows the difference (`AuthzError.code`), so it says so here rather than making the client guess.
 */
export type SettlementResult =
  | { ok: true; shares: SettlementShare[] }
  | { ok: false; reason: "settled" | "cart_gone" | "not_member" | "error" };

/**
 * Member-gated read of the live settlement board (M3·P3.3b) — every payer's share + status. The client
 * also subscribes to qr_cart_shares via Realtime; this is the initial fetch + a re-sync after changes.
 */
export async function getSettlement(cartId: string): Promise<SettlementResult> {
  const { cartId: id } = cartViewInput.parse({ cartId });
  try {
    await assertCartMember(id); // authz only — any member may watch the board
  } catch (e) {
    // ⚠️ `cart_closed` is NOT "the split completed". `assertCartMember` raises it for ANY
    // `status !== 'open'`, and `qr_carts.status` is ('open','paid','cancelled') — a table whose stale
    // freeze let a server merge or clear it (`mms_merge_table_orders` / `clearTable`; both permitted
    // once `settle_at` ages out with no authorized share) lands on 'cancelled' having paid NOTHING.
    // Treating that as settled would announce "Everyone's paid" and send the whole table to a receipt
    // that will never exist. So ask the DB which ending it was, and only 'paid' may navigate.
    if (e instanceof AuthzError && e.code === "cart_closed") {
      const { data: closed, error: statusErr } = await serviceClient()
        .from("qr_carts")
        .select("status")
        .eq("id", id)
        .maybeSingle();
      // ⚠️ An UNREADABLE status is not evidence of anything. Dropping this error would repeat, 30 lines
      // above the comment that names it, exactly the M24 class it warns about: `cart_gone` is TERMINAL
      // on the client (poll stopped, no retry, host cancel hidden) and asserts "nobody was charged", so
      // a transient blip on a table that just PAID would tell them their money never moved — and leave
      // them no way back. Both unknown cases fall to the retryable `error`.
      if (statusErr || !closed) {
        console.error("[split] cart status re-read failed", statusErr);
        return { ok: false, reason: "error" };
      }
      if (closed.status === "paid") return { ok: false, reason: "settled" };
      if (closed.status === "cancelled") return { ok: false, reason: "cart_gone" };
      // Any other terminal status is one this code has never seen — refuse to narrate it.
      return { ok: false, reason: "error" };
    }
    if (e instanceof AuthzError) return { ok: false, reason: "not_member" };
    return { ok: false, reason: "error" };
  }
  const db = serviceClient();
  const { data, error } = await db
    .from("qr_cart_shares")
    .select("seat_id,amount_cents,tip_cents,status,created_at")
    .eq("cart_id", id)
    .order("created_at", { ascending: true });
  // ⚠️ M24 — this error used to be dropped on the floor, and `data ?? []` turned a failed read into
  // "this table has no shares": an authoritative-looking empty board, no pay form, on a cart the
  // freeze holds read-only. That is a permanently stuck table. A failed read is `error`, not empty.
  if (error) {
    console.error("[split] qr_cart_shares read failed", error);
    return { ok: false, reason: "error" };
  }
  return {
    ok: true,
    shares: (data ?? []).map((s) => ({
      seat: s.seat_id,
      amountCents: s.amount_cents,
      tipCents: s.tip_cents,
      status: s.status as SettlementShare["status"],
    })),
  };
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
  await assertMutationRate(uid); // per-device flood guard (P3.4) — bound settlement re-open churn

  // The freeze is the mutex — acquire FIRST so two opens can't race the derive/insert.
  const acq = await acquireSettlement(id, uid);
  if (acq === "locked") throw new Error("Someone’s checking out — try again in a moment");
  if (acq === "settling_other") throw new Error("Another host is already splitting this order");
  if (acq === "closed") throw new Error("This order is no longer open");

  const db = serviceClient();
  // Never re-derive once money is in flight — that would orphan an authorized PaymentIntent. (The
  // freeze was just refreshed by acquire, which is harmless; we simply don't touch the shares.)
  // ⚠️ W10c pre-merge review — this guard's error was dropped, three lines from the code this slice
  // added, and it is the same postgrest failure mode the whole slice is about: an unreadable read
  // yields `data: null`, the guard passes, and execution reaches the DELETE below — wiping a LIVE
  // authorized share and orphaning its PaymentIntent, so a later capture becomes money taken with no
  // order (`cartIdForPi` finds nothing) or a hold that sits ~7 days. Fail closed, releasing the
  // freeze the same way the derive-read block below already does.
  //
  // ⚠️ W10d pre-merge review — `.not(stripe_payment_intent_id, is, null)` for the same reason abort
  // now discriminates: a $0 by-person seat is auto-settled to `captured` with no PaymentIntent, and
  // counting it as in-flight money made a re-open throw "Payments are already in progress" forever on
  // any table where one diner ordered nothing. An `authorized` share always has a PI, so this narrows
  // nothing real — it only stops the sentinel row from impersonating a live charge.
  const { data: live, error: liveErr } = await db
    .from("qr_cart_shares")
    .select("id")
    .eq("cart_id", id)
    .in("status", ["authorized", "captured"])
    .not("stripe_payment_intent_id", "is", null)
    .limit(1);
  if (liveErr) {
    // ⚠️ Round 5 — do NOT release here. The refusal ten lines below (a share IS authorized) keeps the
    // freeze deliberately, because lifting it over live holds is unsafe; on THIS path we don't know
    // which case we're in, so releasing picks the unsafe one. Worse, `captureAllIfReady` will still
    // capture a STALE freeze once the table is fully covered but can never capture a NULL one, and
    // `extendSettlement` can't revive null either — so a released freeze here is the harder failure.
    // Keeping it costs nothing: `acquireSettlement`'s `settle_by.eq.<uid>` disjunct lets this same
    // host retry immediately, and the 10-minute TTL frees it for anyone else.
    console.error("[split] in-flight share check failed", liveErr);
    throw new Error("Couldn’t start the split — please try again");
  }
  if (live && live.length > 0) throw new Error("Payments are already in progress");

  // ⚠️ W10c pre-merge review — the freeze is ALREADY HELD (acquireSettlement wrote settle_at above),
  // and every failure path below deliberately releases it before throwing. `getCartTotals` became
  // throw-on-unreadable in this same slice (M30), so an uncaught call here would sail past all three
  // of those releases and strand the whole table frozen for the full 10-minute TTL — nobody able to
  // pay, edit or split — on a read failure. Same class as `settleCash`; same answer.
  const grand = await getCartTotals(id).catch(() => null); // grand breakdown, no tip
  if (!grand) {
    console.error("[split] openSettlement totals unreadable", { cartId: id });
    await releaseSettlement(id);
    throw new Error("Couldn’t start the split — please try again");
  }
  // A $0 cart can't be paid (mirrors create-intent's "Empty cart") and would auto-settle every share
  // to 'captured' with nothing to ever trigger fulfillment — refuse it (and lift the just-taken freeze).
  if (grand.subtotalCents - grand.discountCents + grand.serviceChargeCents + grand.taxCents <= 0) {
    await releaseSettlement(id);
    throw new Error("Nothing to pay");
  }
  // ⚠️ OPEN-ITEMS **M24** — these two reads used to drop their errors on the floor, and `data ?? []`
  // turned each failure into a plausible-looking empty set with REAL money behind it:
  //   • a failed `session_members` read → zero seats → `deriveShareBreakdowns` returns [] → zero share
  //     rows, while `acquireSettlement` has already frozen the cart and `split-settle.ts` bails on an
  //     empty ledger. That is a permanently stuck table.
  //   • a failed `qr_cart_items` read → every by-person weight 0 → `allocate`'s all-zero fallback
  //     silently serves an EVEN split to a host who chose by-person, and each seat is CHARGED it.
  // Neither is a state to recover from downstream — the derive simply has no input. Release the freeze
  // we just took (nothing is written yet, so this strands nothing) and fail loudly; SplitSection's
  // catch re-syncs and the host sees the board never opened.
  const { data: members, error: membersErr } = await db
    .from("session_members")
    .select("seat_id,created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  const { data: lineRows, error: linesErr } = await db
    .from("qr_cart_items")
    .select("by_seat,qty,unit_price_cents,tax_cents,state,comped")
    .eq("cart_id", id);
  if (membersErr || linesErr) {
    console.error("[split] settlement derive read failed", membersErr ?? linesErr);
    await releaseSettlement(id);
    throw new Error("Couldn’t start the split — please try again");
  }
  // A voided/comped line is charged at $0 (S2.3) — exclude it so no seat pays a share of a removed/comped
  // item. The grand total (getCartTotals) applies the same exclusion, so the shares still reconcile to it.
  const lines = (lineRows ?? []).filter((l) => l.state !== "voided" && !l.comped);

  const breakdowns = deriveShareBreakdowns(
    {
      subtotalCents: grand.subtotalCents,
      discountCents: grand.discountCents,
      serviceChargeCents: grand.serviceChargeCents,
      taxCents: grand.taxCents,
    },
    (members ?? []).map((mm) => ({ seat: mm.seat_id })),
    lines.map((l) => ({
      bySeat: l.by_seat ?? null,
      qty: l.qty,
      unitPriceCents: l.unit_price_cents,
      taxCents: l.tax_cents,
    })),
    m,
  );

  // Replace any prior PENDING set (a re-open before anyone paid), then write the fresh shares.
  //
  // ⚠️ W10d pre-merge review — release the holds FIRST, for the same reason `abortSettlement` does
  // (M40): the guard above only refuses on `authorized`/`captured`, and a share's ROW STATUS is not its
  // PaymentIntent's status. A `pending`/`failed` row can sit over a live authorization whenever the
  // webhook that would have advanced it is delayed or 5xxing — exactly the outage class this arc is
  // about — and past the 10-minute TTL a re-open is the table's only forward exit. This DELETE used to
  // remove those rows and cancel nothing, stranding the hold for the full ~7-day window with no record
  // left. The delete RETURNS what it removed (the serialization point), so a row claimed mid-re-open is
  // covered too.
  // ⚠️ W10d pre-merge RE-REVIEW — read and release BEFORE deleting, mirroring `abortSettlement`. The
  // first fix released the holds but did so AFTER the delete and bucketed a `captured` outcome in with
  // `unknown` — so a PaymentIntent that had actually SUCCEEDED was logged as a stranded "hold" and the
  // re-open carried on, inserting a fresh share set the table would pay a second time. That is the very
  // signal abort treats as fatal, discarded in the sibling path written in the same commit. Reading
  // first means a discovery can refuse while the rows still exist.
  const { data: prior, error: priorErr } = await db
    .from("qr_cart_shares")
    .select("stripe_payment_intent_id,status")
    .eq("cart_id", id);
  if (priorErr) {
    await releaseSettlement(id); // nothing written yet, so this strands nothing
    console.error("[split] open could not read the prior share set", priorErr);
    throw new Error("Could not start the split");
  }
  const strandedHolds: string[] = [];
  const attempted = new Set<string>();
  for (const row of prior ?? []) {
    if (!row.stripe_payment_intent_id) continue;
    attempted.add(row.stripe_payment_intent_id);
    const outcome = await releaseHold(row.stripe_payment_intent_id);
    if (outcome === "captured") {
      // Money moved on a row we were about to replace. Repair it so the succeeded webhook can fulfill,
      // and KEEP the freeze — unlike every other failure path here, lifting it would let the cart be
      // edited before the order is snapshotted. Same answer, same string, as abort.
      const { error: markErr } = await db
        .from("qr_cart_shares")
        .update({ status: "captured", updated_at: new Date().toISOString() })
        .eq("stripe_payment_intent_id", row.stripe_payment_intent_id)
        .neq("status", "captured");
      if (markErr)
        console.error("[split] open found a succeeded PI but could not mark the share captured", {
          cartId: id,
          paymentIntent: row.stripe_payment_intent_id,
          error: markErr.message,
        });
      throw new Error("Payment already completed — the order will finish");
    }
    if (outcome === "unknown") strandedHolds.push(row.stripe_payment_intent_id);
  }
  // Two statements rather than one `.or()`, for the reason spelled out in `abortSettlement`: an `.or()`
  // mutation asking for a representation is the PostgREST-14 42703 shape. The non-captured rows first
  // (they carry the holds), then the $0 sentinels, so a REAL captured row landing mid-window survives
  // both and is caught by the survivor check.
  const { data: replaced, error: replacedErr } = await db
    .from("qr_cart_shares")
    .delete()
    .eq("cart_id", id)
    .neq("status", "captured")
    .select("stripe_payment_intent_id");
  if (replacedErr) {
    await releaseSettlement(id); // don't strand a freeze over a ledger we could not clear
    console.error("[split] open could not clear the prior share set", replacedErr);
    throw new Error("Could not start the split");
  }
  const { error: zeroErr } = await db
    .from("qr_cart_shares")
    .delete()
    .eq("cart_id", id)
    .eq("status", "captured")
    .is("stripe_payment_intent_id", null);
  if (zeroErr) {
    await releaseSettlement(id);
    console.error("[split] open could not clear the prior $0 shares", zeroErr);
    throw new Error("Could not start the split");
  }
  for (const row of replaced ?? []) {
    const pi = row.stripe_payment_intent_id;
    if (!pi || attempted.has(pi)) continue;
    const outcome = await releaseHold(pi);
    if (outcome !== "released" && outcome !== "gone") strandedHolds.push(pi);
  }
  if (strandedHolds.length > 0)
    console.error("[split] re-open could not release these prior holds", {
      cartId: id,
      paymentIntents: strandedHolds,
    });
  // A survivor here is a share captured between the release loop and the deletes — real money on a row
  // that must reach fulfillment, not be replaced. Keep the freeze and refuse.
  const { data: stillThere, error: stillErr } = await db
    .from("qr_cart_shares")
    .select("id")
    .eq("cart_id", id)
    .limit(1);
  if (stillErr) {
    console.error("[split] open survivor check failed", stillErr);
    throw new Error("Couldn’t start the split — please try again");
  }
  if (stillThere && stillThere.length > 0)
    throw new Error("Payment already completed — the order will finish");
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
  const { uid, role } = await assertCartMember(id);
  if (role !== "host") throw new Error("Only the host can cancel the split");
  await assertMutationRate(uid); // W1·Q6 — abort churns Stripe cancels + ledger deletes; bound it
  const db = serviceClient();

  // CLAIM the abort FIRST by lifting the freeze: captureAllIfReady gates on a fresh settle_at, so any
  // capture path that hasn't started yet now bails. (A capture already past its gate finishes + fulfills;
  // we detect that below and defer to it — money taken must always become an order.)
  //
  // ⚠️ W10c pre-PR review — FAIL CLOSED. This write IS the claim; postgrest resolves a transport failure
  // into `{ data: null, error }`, so a silently-failed release left `settle_at` live while the code below
  // went on to cancel every hold and DELETE the share rows. A concurrent `captureAllIfReady` still sees a
  // fresh freeze, captures, and then `cartIdForPi` finds no row on the succeeded webhook: money taken,
  // no order. Nothing may be cancelled or deleted until the freeze is provably lifted.
  const releaseError = await releaseSettlement(id);
  if (releaseError) throw new Error("Couldn’t cancel the split just now — try again in a moment");

  // Same rule on the abort side: an unreadable share list is not "no captured shares". Dropping this
  // error skipped the cancel loop AND let the delete below remove rows whose holds are still live.
  const { data: shares, error: sharesErr } = await db
    .from("qr_cart_shares")
    .select("stripe_payment_intent_id,status")
    .eq("cart_id", id);
  if (sharesErr) {
    // Nothing has been cancelled or deleted yet, so putting the freeze back restores the exact
    // pre-abort state. If that write ALSO fails, say so — the table is now unfrozen over live holds.
    const refreezeErr = await refreeze(db, id, uid);
    console.error("[split] abort share read failed", {
      error: sharesErr,
      refreezeError: refreezeErr?.message,
    });
    throw new Error("Couldn’t cancel the split just now — try again in a moment");
  }
  // If a capture WON the race (any captured share), money is committing — re-freeze so the cart can't be
  // edited before the succeeded webhook snapshots the order, and let fulfillment finish (don't delete).
  //
  // ⚠️ W10d pre-merge review — a captured share only blocks the abort when it has a PaymentIntent.
  // `openSettlement` auto-settles a **$0 by-person seat** (a diner who ordered nothing) straight to
  // `captured` with a NULL PI so it can't block the all-covered gate. Reading status alone made that
  // seat indistinguishable from taken money, and it permanently bricked the table: abort threw
  // "Payment already completed — the order will finish" when nothing would ever finish, `openSettlement`
  // threw "Payments are already in progress", and `paymentInFlightReason` returned `split_in_progress`
  // with no TTL escape — so cash-settle, clear-table, voids and comps were refused forever, and any
  // OTHER seat's live hold could never be released, because the release sits behind this very check.
  if ((shares ?? []).some((s) => s.status === "captured" && s.stripe_payment_intent_id != null)) {
    const refreezeErr = await refreeze(db, id, uid);
    if (refreezeErr)
      console.error("[split] refreeze failed (abort lost the race to a capture)", refreezeErr);
    throw new Error("Payment already completed — the order will finish");
  }

  // Release each still-cancelable hold so a payer isn't left with a lingering authorization.
  //
  // ⚠️ W10d (M40) — `failed` MUST be in this list, and the reason is the same one that made W10c's
  // `onShareAuthorized` predicate wrong: a share's ROW STATUS is not the PaymentIntent's status. A
  // decline at CAPTURE marks the row `failed` while its PI can still hold a live authorization, and a
  // row marked `failed` by one attempt can have been re-authorized on a later one. The delete below
  // then removes the row, so this loop is the last moment anything knows the hold exists — after it,
  // the money sits on the diner's card for the full ~7-day authorization window with no record on our
  // side that could ever release it. Cancelling an already-dead PI is a documented no-op, so the cost
  // of including a status is zero and the cost of omitting one is a week of someone's credit limit.
  //
  // Only `captured`-with-a-PaymentIntent is excluded, and it can't reach here — the branch above throws.
  //
  // ⚠️ W10d pre-merge review — `releaseHold` replaces a bare `catch` that treated
  // `payment_intent_unexpected_state` as "already dead". That code ALSO means the PI **succeeded**
  // (`captureAllIfReady` retrieves on it for precisely that reason). The reachable sequence: a capture
  // takes the money, its post-capture mark write fails and throws, so the row still reads `authorized`;
  // the host taps Cancel; the captured-check above passes; `cancel` raises `unexpected_state`; we called
  // it benign and the DELETE below removed the row. Net was a real charge with no order, no share row,
  // no refunds record, and no log naming the PaymentIntent. Asking Stripe closes it — and closes the
  // wider abort-vs-capture race too, because this loop touches every share before anything is deleted.
  const abandonedHolds: string[] = [];
  const attempted = new Set<string>();
  for (const s of shares ?? []) {
    if (!s.stripe_payment_intent_id || s.status === "captured") continue;
    attempted.add(s.stripe_payment_intent_id);
    const outcome = await releaseHold(s.stripe_payment_intent_id);
    if (outcome === "captured") {
      // Money moved on a row we were about to delete. Repair the row first (so the succeeded webhook
      // finds it and fulfills), put the freeze back, and refuse the abort — same answer the
      // captured-check above gives, just discovered a beat later.
      const { error: markErr } = await db
        .from("qr_cart_shares")
        .update({ status: "captured", updated_at: new Date().toISOString() })
        .eq("stripe_payment_intent_id", s.stripe_payment_intent_id)
        .neq("status", "captured");
      if (markErr)
        console.error("[split] abort found a succeeded PI but could not mark the share captured", {
          cartId: id,
          paymentIntent: s.stripe_payment_intent_id,
          error: markErr.message,
        });
      const refreezeErr = await refreeze(db, id, uid);
      if (refreezeErr)
        console.error("[split] refreeze failed (abort found a succeeded hold)", refreezeErr);
      throw new Error("Payment already completed — the order will finish");
    }
    // Best-effort by design — never block the abort on Stripe. But NOT silent: the delete below removes
    // the only row that records this PaymentIntent, so a hold we could not prove dead has to be
    // recoverable from logs. `released`/`gone` are the benign majority; `unknown` is a hold we are
    // knowingly abandoning.
    if (outcome === "unknown") abandonedHolds.push(s.stripe_payment_intent_id);
  }

  // Sweep the $0 auto-settled seats first — they carry no money and no PaymentIntent, and leaving them
  // behind would make the survivor check below report a phantom "payment completed during cancel".
  // Kept as its own statement with only `.eq()`/`.is()` filters: a single DELETE expressing "not (captured
  // AND has a PI)" needs a top-level `.or()`, and an `.or()` mutation asking for a representation is the
  // PostgREST-14 42703 shape this repo has already been bitten by (see `lib/lock.ts`).
  const { error: zeroSweepErr } = await db
    .from("qr_cart_shares")
    .delete()
    .eq("cart_id", id)
    .eq("status", "captured")
    .is("stripe_payment_intent_id", null);
  if (zeroSweepErr) {
    console.error("[split] abort $0-share sweep failed", zeroSweepErr);
    throw new Error("Couldn’t cancel the split just now — try again in a moment");
  }
  // Conditional delete — NEVER remove a share captured in the race window (its money is taken and the
  // succeeded webhook must still fulfill it). If one survived, re-freeze + surface it rather than strand.
  // The same unchecked-write class the W10 arc exists to delete: a silently-failed DELETE leaves the
  // ledger intact while the code below reports a clean abort, so the host is told the split is cancelled
  // over rows that still exist (and whose holds were just cancelled).
  //
  // ⚠️ W10d pre-merge review — RETURN what was actually deleted. The cancel loop above ran off a snapshot
  // taken several Stripe round-trips earlier, and `create-share-intent` can claim a row in that window
  // (`SharePay` mints on mount, so a payer merely opening the sheet as the host cancels is enough): the
  // row gets repointed to a brand-new PaymentIntent, and the delete then destroyed it with that intent
  // never cancelled. The DELETE is the serialization point, so whatever it hands back is the truth —
  // anything we did not already try goes through a second release pass below.
  const { data: deleted, error: deleteErr } = await db
    .from("qr_cart_shares")
    .delete()
    .eq("cart_id", id)
    .neq("status", "captured")
    .select("stripe_payment_intent_id");
  if (deleteErr) {
    console.error("[split] abort ledger delete failed", deleteErr);
    throw new Error("Couldn’t cancel the split just now — try again in a moment");
  }
  for (const row of deleted ?? []) {
    const pi = row.stripe_payment_intent_id;
    if (!pi || attempted.has(pi)) continue;
    const outcome = await releaseHold(pi);
    // A PI claimed inside the abort window is seconds old and cannot have been captured, so `captured`
    // here is a genuine surprise — record it at the same weight as an abandoned hold rather than
    // pretending the sweep was clean. Either way the row is already gone; the log is the only artifact.
    if (outcome === "unknown" || outcome === "captured") abandonedHolds.push(pi);
  }
  if (abandonedHolds.length > 0)
    console.error("[split] abort could not cancel these holds — they will lapse on their own", {
      cartId: id,
      paymentIntents: abandonedHolds,
    });
  const { data: survivor, error: survivorErr } = await db
    .from("qr_cart_shares")
    .select("id")
    .eq("cart_id", id)
    .limit(1);
  // An unreadable survivor check is not "no survivors" — that would report a clean abort over a share
  // the delete didn't reach. Re-freeze and say so.
  if (survivorErr) {
    const refreezeErr = await refreeze(db, id, uid);
    console.error("[split] abort survivor check failed", {
      error: survivorErr,
      refreezeError: refreezeErr?.message,
    });
    throw new Error("Couldn’t cancel the split just now — try again in a moment");
  }
  if (survivor && survivor.length > 0) {
    const refreezeErr = await refreeze(db, id, uid);
    if (refreezeErr)
      console.error("[split] refreeze failed (survivor found after delete)", refreezeErr);
    throw new Error("Payment completed during cancel — the order will finish");
  }
}

/** Re-assert the settlement freeze on an open cart (used when an abort loses the race to a capture, so
 *  the cart stays read-only until the in-flight fulfillment snapshots the order). */
async function refreeze(
  db: ReturnType<typeof serviceClient>,
  cartId: string,
  settleBy?: string,
): Promise<{ message: string } | null> {
  // ⚠️ Round 5 — two fixes. (1) RETURN the write error: this is a compensating write, and its callers
  // now reach it precisely BECAUSE a read just failed, so it is the write most likely to fail too —
  // a silent one leaves the table unfrozen over live holds with nothing in the logs, the exact swallow
  // this slice exists to delete. (2) Restore `settle_by`: `releaseSettlement` nulls it, and
  // `acquireSettlement` matches on `settle_at.is.null | settle_by.eq.<uid> | settle_at.lte.<cutoff>`
  // — so a refreeze that left it null told the ABORTING HOST "Another host is already splitting this
  // order" for the full TTL, on his own table.
  const { error } = await db
    .from("qr_carts")
    .update({
      settle_at: new Date().toISOString(),
      ...(settleBy ? { settle_by: settleBy } : {}),
    })
    .eq("id", cartId)
    .eq("status", "open");
  return error;
}
