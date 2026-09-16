"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { serviceClient } from "@mms/db/server";
import { refundLineInput } from "@mms/db/schemas";
import { getStaffAuth, roleAtLeast, staffGate } from "./staff";
import { verifyStaffPin } from "./staff-pin";
import { getStripe } from "./stripe";
import { getPostHogClient } from "./posthog-server";
import { STAFF_WRITE_OUTAGE } from "./staff-outage";
import { readServiceDay } from "./service-day";
import { queueEmptiness } from "./queue-window";
import { loadLineNames } from "./line-names";
import { catalogNameMy, pairModifiersMy } from "./ticket-names";
import { summarizeRefund, type RefundSummary } from "./refund-view";
import type { ReceiptBreakdownish } from "./receipt-view";
import { SETTLED_CAP, settledClock, settledDate } from "./settled-view";
import { latestRefundByOrder, readLedgerSince } from "./refund-ledger";
import {
  lineRefundableCents,
  offeredRefund,
  refundPathFor,
  remainingPoolCents,
  type RefundPath,
} from "./refund-console";

/**
 * Line-level refunds (S4.3b) — money-OUT, the captured-line counterpart to S2.3's open-cart void. The
 * manager's settled list (A4·3, a zone of the counter's one screen) shows today's paid orders AS THE
 * GUEST'S RECEIPT SHOWS THEM; a manager refunds a specific line. The amount + PaymentIntent are
 * SERVER-derived (mms_refund_authorize) — the client never sends a figure. The Stripe refund is
 * idempotency-keyed on the line (a double-submit returns the SAME refund — no double money out),
 * recorded in the mms_refunds ledger + mms_approvals audit, and charge.refunded reconciles the order
 * status. The refund re-checks manager + a self-PIN step-up (the money-out re-auth at action time).
 */

export type SettledLine = {
  id: string;
  name: string;
  /** The live catalog's Burmese (F18 (b)), or null when it adds nothing to the English snapshot. */
  nameMy: string | null;
  qty: number;
  unitPriceCents: number;
  taxCents: number;
  modifiers: string[];
  modifiersMy: (string | null)[];
  notes: string | null;
  fulfillment: string;
  /** What has already come back on THIS line (`qr_order_items.refunded_cents`) — the receipt's mark. */
  refundedCents: number;
  /** A ledger row exists for this line — the server would answer `already_refunded`. */
  refunded: boolean;
  /** What the console OFFERS: the line's discounted goods + its tax share, clamped to what the order
   *  can still give back — the display echo of `mms_refund_authorize`, clamp included, so the sheet
   *  shows the figure the server will actually refund. */
  offeredCents: number;
  /** The clamp bit — the sheet says so before the tap (M204). */
  offerClamped: boolean;
};

export type SettledOrder = {
  id: string;
  /** The receipt's own short code — what the guest reads off their artifact. */
  code: string;
  createdAt: string;
  /** "12:41 PM" in the service zone — formatted here, where the zone is known. */
  settledAt: string;
  /** "Sep 12" — the calendar day it was PAID, only for an order from an earlier day the ledger
   *  admitted (refunded here today); null for an order paid today. Codex round 1 on #283: a bare
   *  clock under "Settled today" read as today's. */
  settledOn: string | null;
  /** "12:10 PM" — the LATEST refund on this order today, when the ledger admitted it; else null. */
  refundedTodayAt: string | null;
  status: string; // 'paid' | 'refunded'
  tender: string;
  tableNumber: number | null;
  customerName: string | null;
  /** "12:30 PM" in the service zone, formatted on the server like the clock (Codex round 2 on #283:
   *  the tablet's own zone re-formatted it, and a UTC server hydrated a different text); null when
   *  the order has no slot. */
  pickupSlotAt: string | null;
  breakdown: ReceiptBreakdownish;
  totalCents: number;
  /** ONE verdict for the whole row (W23b): a partial refund leaves `status = 'paid'`. */
  refund: RefundSummary;
  /** How money goes back for this order (M183): cash from the drawer, the in-app line refund, or
   *  the processor's dashboard for a split card order. */
  refundPath: RefundPath;
  /** What the order can still give back, after every ledger row — the pool the SQL clamps against. */
  remainingCents: number;
  lines: SettledLine[];
};

export type SettledToday =
  | {
      ok: true;
      orders: SettledOrder[];
      truncated: boolean;
      sinceIso: string;
      serverNow: string;
      /** `serverNow` as a clock in the SERVICE zone ("12:00 PM") — the "as of" a failed refresh
       *  dates the list by, formatted where the zone is known (Codex round 4 on #283). */
      serverClock: string;
    }
  | { ok: false; reason: "outage" | "forbidden" };

// ONE literal: PostgREST's type-level select parser needs a literal type, and a `+` of two literals
// widens to `string` — every row then types as `GenericStringError`.
const SETTLED_SELECT =
  "id,created_at,status,tender,table_number,customer_name,pickup_slot,subtotal_cents,discount_cents,service_charge_cents,tax_cents,tip_cents,total_cents,refunded_cents,stripe_payment_intent_id,qr_order_items(id,name,qty,unit_price_cents,tax_cents,fulfillment,modifiers,modifier_option_ids,notes,refunded_cents,menu_item_id)";

/**
 * Today's settled orders (paid or refunded), newest first, for the manager's zone of the counter
 * screen. Manager-gated; service-role read (the cross-table order list is a manager tool, like the
 * KDS). "Today" is the ONE service-day read (`readServiceDay` — `dayStartIso` from
 * `pickup_config.tz`, the same floor the takings and the served rail use), so the three "today"
 * zones on this screen agree about when it began.
 *
 * Every figure is the fulfillment-time snapshot the receipt renders (`breakdown`, `totalCents`, the
 * lines' unit prices), never recomputed. The refund state is `summarizeRefund`, derived ONCE. The
 * per-line offer mirrors `mms_refund_authorize` clamp included: the ledger (`mms_refunds`, every
 * row against the order — line-level and dashboard alike, the sum the SQL clamps against) sets the
 * remaining pool, and each line's figure is clamped to it.
 *
 * W10b — a failed read must not render as "nothing settled today" (false-empty), and a failed
 * LEDGER read must not clear the `refunded` flags (re-offering a refund on an already-refunded
 * line; the idempotency key is the backstop, not the UI). Both answer `outage`; the zone says so.
 * The Burmese names are ADVISORY (`loadLineNames` logs by table and that half renders English).
 */
export async function getSettledToday(): Promise<SettledToday> {
  const gate = await staffGate("manager");
  if (!gate.ok) {
    // staffGate collapses "not signed in / not manager" and outage into copy — for a read surface
    // we only need the two-way split: an outage renders the zone's outage line, anything else
    // simply hides the manager zone.
    return { ok: false, reason: gate.error === STAFF_WRITE_OUTAGE ? "outage" : "forbidden" };
  }
  const db = serviceClient();
  const { nowIso, tz, sinceIso } = await readServiceDay(db, "refunds");

  // "Settled today" is paid TODAY *or refunded here today* (blind pass on A4·3, CRITICAL 1): the
  // takings send a manager here for an earlier day's order refunded today, and a `created_at`
  // floor alone would hold it on neither surface. The ledger's rows since the floor name the
  // orders whose money moved today, whatever day they were paid — the in-app line refunds this
  // console makes and the webhook-recorded ones; a refund issued from the processor's dashboard
  // writes no ledger row (W23b) and is the one shape this list cannot date. And WHEN it moved: the
  // latest row per order is the instant such a row is ranked and dated by below.
  // M219 — read the ledger COMPLETELY. PostgREST's max-rows cap is silent (`error` stays null), so
  // the old single unpaged select could answer a SUBSET, and a ranking over a subset misses the
  // day's newest refunds while the list still calls itself the day. `readLedgerSince` pages
  // deterministically (created_at AND id, W21d) and answers null rather than a partial read, which
  // is the one thing a money surface can act on honestly.
  const todayLedger = await readLedgerSince(db, sinceIso);
  if (todayLedger === null) return { ok: false, reason: "outage" };
  const refundedTodayAt = latestRefundByOrder(todayLedger);
  // Ranked by the LATEST refund and capped BEFORE the read (Codex round 2 on #283, P1): the union
  // arm's own `.order("created_at")` under its `.limit` chose the fifty newest-CREATED of the
  // ledger's orders, so with more than fifty refunded today the oldest order carrying today's
  // latest refund was gone before the merge below could rank it. The ids the read is given are
  // already the fifty that rank highest by the instant they settled today.
  const refundedTodayIds = [...refundedTodayAt.entries()]
    .sort((a, b) => Date.parse(b[1]) - Date.parse(a[1]) || (a[0] < b[0] ? 1 : -1))
    .slice(0, SETTLED_CAP)
    .map(([id]) => id);
  const unionOverflow = refundedTodayAt.size > SETTLED_CAP;

  // TWO reads, never one `.or()` (Codex round 1 on #283, P1): a single read ranked by `created_at`
  // and capped put an earlier day's order refunded today behind every order paid today, and on a
  // day with fifty of those the cap dropped it — the takings had just sent the manager here to
  // find it. Each arm is capped on its own; the merge ranks by the instant each row settled TODAY,
  // so the two compete for the page fairly.
  const settled = () =>
    db.from("qr_orders").select(SETTLED_SELECT).in("status", ["paid", "refunded"]);
  const paidQ = settled()
    .gte("created_at", sinceIso)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false }) // a stable tiebreak under the cap
    // The lines in the receipt's own order (`receipt-entry.ts` reads `.order("id")`), so this
    // list and the guest's slip list the same order identically.
    .order("id", { referencedTable: "qr_order_items", ascending: true })
    .limit(SETTLED_CAP);
  const unionQ = refundedTodayIds.length
    ? settled()
        .in("id", refundedTodayIds)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .order("id", { referencedTable: "qr_order_items", ascending: true })
        .limit(SETTLED_CAP)
    : null;
  const [paidRes, unionRes] = await Promise.all([paidQ, unionQ]);
  if (paidRes.error || unionRes?.error) return { ok: false, reason: "outage" };
  const paidRows = paidRes.data ?? [];
  const unionRows = unionRes?.data ?? [];
  // The instant a row settled TODAY: its own time for an order paid today, the latest refund for
  // one the ledger admitted. Newest first; the id a stable tiebreak.
  const movedMs = (o: { id: string; created_at: string }) =>
    Math.max(Date.parse(o.created_at), Date.parse(refundedTodayAt.get(o.id) ?? "") || 0);
  const byId = new Map<string, (typeof paidRows)[number]>();
  for (const o of [...paidRows, ...unionRows]) byId.set(o.id, o);
  const rows = [...byId.values()]
    .sort((a, b) => movedMs(b) - movedMs(a) || (a.id < b.id ? 1 : -1))
    .slice(0, SETTLED_CAP);
  // A FULL arm, or a merge past the cap, is a list that cannot say it is the whole day.
  const truncated =
    queueEmptiness(paidRows.length, SETTLED_CAP) === "cannot-say" ||
    queueEmptiness(unionRows.length, SETTLED_CAP) === "cannot-say" ||
    unionOverflow ||
    byId.size > SETTLED_CAP;
  const serverClock = settledClock(nowIso, tz);
  if (rows.length === 0)
    return { ok: true, orders: [], truncated, sinceIso, serverNow: nowIso, serverClock };

  const orderIds = rows.map((o) => o.id);
  const { data: ledger, error: ledgerError } = await db
    .from("mms_refunds")
    .select("order_id,order_item_id,amount_cents")
    .in("order_id", orderIds);
  if (ledgerError) return { ok: false, reason: "outage" };
  const refundedLines = new Set<string>();
  const ledgerByOrder = new Map<string, number>();
  for (const r of ledger ?? []) {
    if (r.order_item_id) refundedLines.add(r.order_item_id);
    ledgerByOrder.set(r.order_id, (ledgerByOrder.get(r.order_id) ?? 0) + r.amount_cents);
  }

  const items = rows.flatMap((o) => o.qr_order_items ?? []);
  const { nameMyByRef, optionNameMy } = await loadLineNames(db, items, { tag: "settled" });

  return {
    ok: true,
    truncated,
    sinceIso,
    serverNow: nowIso,
    serverClock,
    orders: rows.map((o) => {
      const lines = o.qr_order_items ?? [];
      // The taxable subtotal base for this order (taxable lines have a stored per-unit tax > 0) —
      // the denominator for each line's pro-rata share of the order tax, matching the SQL.
      const taxableBaseCents = lines.reduce(
        (a, li) => a + (li.tax_cents > 0 ? li.unit_price_cents * li.qty : 0),
        0,
      );
      const remainingCents = remainingPoolCents({
        totalCents: o.total_cents,
        serviceChargeCents: o.service_charge_cents,
        tipCents: o.tip_cents,
        ledgerRefundedCents: ledgerByOrder.get(o.id) ?? 0,
      });
      const movedAt = refundedTodayAt.get(o.id);
      return {
        id: o.id,
        code: o.id.slice(-6).toUpperCase(),
        createdAt: o.created_at,
        settledAt: settledClock(o.created_at, tz),
        settledOn:
          Date.parse(o.created_at) < Date.parse(sinceIso) ? settledDate(o.created_at, tz) : null,
        refundedTodayAt: movedAt === undefined ? null : settledClock(movedAt, tz),
        status: o.status,
        tender: o.tender,
        tableNumber: o.table_number ?? null,
        customerName: o.customer_name ?? null,
        pickupSlotAt: o.pickup_slot ? settledClock(o.pickup_slot, tz) : null,
        breakdown: {
          subtotalCents: o.subtotal_cents,
          discountCents: o.discount_cents,
          serviceChargeCents: o.service_charge_cents,
          taxCents: o.tax_cents,
          tipCents: o.tip_cents,
        },
        totalCents: o.total_cents,
        refund: summarizeRefund(o.total_cents, o.refunded_cents, o.status),
        refundPath: refundPathFor({
          tender: o.tender,
          stripePaymentIntentId: o.stripe_payment_intent_id,
        }),
        remainingCents,
        lines: lines.map((li) => {
          const modifiers = Array.isArray(li.modifiers)
            ? li.modifiers.filter((m): m is string => typeof m === "string")
            : [];
          const offer = offeredRefund(
            lineRefundableCents(
              { unitPriceCents: li.unit_price_cents, qty: li.qty, taxCents: li.tax_cents },
              {
                subtotalCents: o.subtotal_cents,
                discountCents: o.discount_cents,
                taxCents: o.tax_cents,
              },
              taxableBaseCents,
            ),
            remainingCents,
          );
          return {
            id: li.id,
            name: li.name,
            nameMy: catalogNameMy(nameMyByRef.get(li.menu_item_id), li.name),
            qty: li.qty,
            unitPriceCents: li.unit_price_cents,
            taxCents: li.tax_cents,
            modifiers,
            modifiersMy: pairModifiersMy(li.modifier_option_ids, modifiers, optionNameMy),
            notes: typeof li.notes === "string" && li.notes.trim() !== "" ? li.notes : null,
            fulfillment: li.fulfillment,
            refundedCents: li.refunded_cents,
            refunded: refundedLines.has(li.id),
            offeredCents: offer.cents,
            offerClamped: offer.clamped,
          };
        }),
      };
    }),
  };
}

export type RefundResult =
  | { ok: true; amountCents: number }
  | { ok: false; reason: "pin_wrong"; attemptsRemaining: number }
  | { ok: false; reason: "pin_locked"; lockedUntil: string }
  | {
      ok: false;
      reason:
        | "not_manager"
        | "pin_no_pin"
        | "not_found"
        | "not_paid"
        | "split_unsupported"
        | "already_refunded"
        | "fully_refunded"
        | "stripe_error"
        | "error"
        // W10b: platform unreachable — no money moved; not a verdict about the line or the manager.
        | "outage";
    };

/**
 * Refund ONE paid line. Manager-gated + self-PIN step-up (money-out re-auth).
 *
 * TWO paths, chosen from the order's own stored facts by `refundPathFor` — the same pure rule the
 * console used to decide what to SHOW, so the sheet and the server can never disagree about which
 * instrument gives the money back:
 *
 *   `app`  — a card order with a PaymentIntent. `mms_refund_authorize` server-derives the amount and
 *            the PI (it writes nothing); the Stripe refund is idempotency-keyed on the line (no
 *            double money out); `mms_record_refund` then writes the ledger + audit. A record failure
 *            AFTER a successful Stripe refund is logged, not surfaced — the money moved correctly and
 *            the charge.refunded webhook re-records it.
 *   `cash`  — M218. No processor sits in the middle, so `mms_refund_cash_line` authorizes AND records
 *            in ONE transaction: there is no window where the drawer has paid out and nothing says
 *            so, and nothing to reconcile it later if there were. Before M218 this path did not
 *            exist: the card authorizer answered `split_unsupported` for every cash order, and a
 *            hand-back from the drawer left the receipt reading "Paid in full".
 *   `dashboard` — a split-tender card order; the authorizer still answers `split_unsupported` and the
 *            sheet sends the manager to the processor. Unchanged, and deliberately NOT short-circuited
 *            here: the SQL is the authority, and it answers `not_paid` / `not_found` first when those
 *            are true.
 */
export async function refundLine(raw: unknown): Promise<RefundResult> {
  const staffAuth = await getStaffAuth();
  // W10b — unknowable ≠ "not a manager": that verdict on a money-out surface reads as a demotion.
  if (staffAuth.kind === "unavailable") return { ok: false, reason: "outage" };
  const caller =
    staffAuth.kind === "staff" && roleAtLeast(staffAuth.caller.role, "manager")
      ? staffAuth.caller
      : null;
  if (!caller) return { ok: false, reason: "not_manager" };
  const parsed = refundLineInput.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "error" };
  const { orderItemId, reason, pin } = parsed.data;

  // Money-out step-up: re-confirm the manager's identity at action time (the surface is manager-gated, so
  // this is a re-auth, not a second person). Lockout-counted; a bad/locked PIN never reaches Stripe.
  const v = await verifyStaffPin(caller.staffId, pin);
  if (v.status === "wrong")
    return { ok: false, reason: "pin_wrong", attemptsRemaining: v.attemptsRemaining };
  if (v.status === "locked") return { ok: false, reason: "pin_locked", lockedUntil: v.lockedUntil };
  if (v.status === "no_pin") return { ok: false, reason: "pin_no_pin" };
  if (v.status !== "ok") return { ok: false, reason: "error" };

  const db = serviceClient();

  // WHICH INSTRUMENT. Read the order's own facts — never a path the client sent — and decide with
  // `refundPathFor`, the rule the console already renders from. A failed read is an `error`, not a
  // fall-through to the card path: falling through would tell a manager holding cash that the order
  // is "split-tender", which is the exact false verdict M183 closed.
  const { data: pathRow, error: pathErr } = await db
    .from("qr_order_items")
    .select("qr_orders(tender,stripe_payment_intent_id)")
    .eq("id", orderItemId)
    .maybeSingle<{
      qr_orders: { tender: string; stripe_payment_intent_id: string | null } | null;
    }>();
  if (pathErr) {
    console.error("[refunds] refund-path read failed", { orderItemId, message: pathErr.message });
    return { ok: false, reason: "error" };
  }
  // No row is `not_found` — the same verdict the SQL would give, without paying for the rpc.
  if (!pathRow?.qr_orders) return { ok: false, reason: "not_found" };
  const path = refundPathFor({
    tender: pathRow.qr_orders.tender,
    stripePaymentIntentId: pathRow.qr_orders.stripe_payment_intent_id,
  });

  if (path === "cash") {
    // M218 — one call authorizes and records. It re-checks the manager floor, the paid status, the
    // tender AND that no PaymentIntent exists, so a stale read above cannot make it pay out.
    const { data: cashRows, error: cashErr } = await db.rpc("mms_refund_cash_line", {
      p_line_item: orderItemId,
      p_initiator: caller.staffId,
      p_reason: reason,
    });
    if (cashErr) {
      console.error("[refunds] mms_refund_cash_line failed", {
        orderItemId,
        message: cashErr.message,
      });
      return { ok: false, reason: "error" };
    }
    const cash = cashRows?.[0];
    if (!cash) return { ok: false, reason: "error" };
    if (cash.reason !== "ok") {
      // `not_cash` means this read and the database disagree about the order — it cannot happen from
      // the branch above, so it is a defect rather than a verdict about the line, and the manager is
      // told so plainly instead of being handed a reason the sheet has no sentence for.
      if (cash.reason === "not_cash") {
        console.error("[refunds] cash path refused a line the read called cash", { orderItemId });
        return { ok: false, reason: "error" };
      }
      return {
        ok: false,
        reason: cash.reason as
          | "not_manager"
          | "not_found"
          | "not_paid"
          | "already_refunded"
          | "fully_refunded",
      };
    }
    revalidatePath("/staff");
    if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
      after(async () => {
        try {
          const ph = getPostHogClient();
          ph.capture({
            distinctId: `staff:${caller.staffId}`,
            event: "line_refunded",
            properties: {
              role: caller.role,
              reason,
              amount_cents: cash.amount_cents,
              tender: "cash",
            },
          });
          await ph.flush();
        } catch {
          /* analytics best-effort — never fail an issued refund on a capture error */
        }
      });
    }
    return { ok: true, amountCents: cash.amount_cents };
  }

  const { data: authRows, error: authErr } = await db.rpc("mms_refund_authorize", {
    p_line_item: orderItemId,
    p_initiator: caller.staffId,
  });
  if (authErr) {
    console.error("[refunds] mms_refund_authorize failed", {
      orderItemId,
      message: authErr.message,
    });
    return { ok: false, reason: "error" };
  }
  const auth = authRows?.[0];
  if (!auth) return { ok: false, reason: "error" };
  if (auth.reason !== "ok")
    return {
      ok: false,
      reason: auth.reason as
        | "not_manager"
        | "not_found"
        | "not_paid"
        | "split_unsupported"
        | "already_refunded"
        | "fully_refunded",
    };

  // Execute the Stripe refund — server-derived amount + PI, idempotency-keyed on the line so a double
  // submit / retry returns the SAME refund (Stripe idempotency = the primary no-double-refund guard).
  let refundId: string;
  try {
    const refund = await getStripe().refunds.create(
      {
        payment_intent: auth.payment_intent,
        amount: auth.amount_cents,
        reason: "requested_by_customer",
        metadata: { orderItemId, reasonCode: reason, initiator: caller.staffId },
      },
      { idempotencyKey: `refundline_${orderItemId}` },
    );
    refundId = refund.id;
  } catch (e) {
    console.error("[refunds] stripe refund failed", { orderItemId, error: e });
    return { ok: false, reason: "stripe_error" };
  }

  const { error: recErr } = await db.rpc("mms_record_refund", {
    p_order_item: orderItemId,
    p_amount: auth.amount_cents,
    p_stripe_refund_id: refundId,
    p_reason: reason,
    p_initiator: caller.staffId,
  });
  if (recErr)
    // The refund SUCCEEDED at Stripe; only our ledger write failed. Don't surface an error (the money moved
    // correctly). The charge.refunded webhook BACKSTOPS this: it re-records the mms_refunds ledger row +
    // mms_approvals audit from the refund's metadata (orderItemId/reasonCode/initiator we set above),
    // idempotent on the refund id — so the audit trail + the already-refunded guard are restored.
    console.error(
      "[refunds] mms_record_refund failed (refund issued; charge.refunded will re-record)",
      {
        orderItemId,
        refundId,
        message: recErr.message,
      },
    );

  revalidatePath("/staff");

  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    after(async () => {
      try {
        const ph = getPostHogClient();
        ph.capture({
          distinctId: `staff:${caller.staffId}`,
          event: "line_refunded",
          properties: { role: caller.role, reason, amount_cents: auth.amount_cents },
        });
        await ph.flush();
      } catch {
        /* analytics best-effort — never fail an issued refund on a capture error */
      }
    });
  }
  return { ok: true, amountCents: auth.amount_cents };
}
