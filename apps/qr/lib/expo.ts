"use server";
import { revalidatePath } from "next/cache";
import { queueEmptiness, queueFloorIso } from "./queue-window";
import { after } from "next/server";
import { serviceClient } from "@mms/db/server";
import { setTogoStatusInput } from "@mms/db/schemas";
import { getStaffAuth, STAFF_SIGNIN_REQUIRED, staffGate } from "./staff";
import { isConsoleLocked } from "./staff-lock";
import { getPostHogClient } from "./posthog-server";
import type { ExpoErrCode, ExpoLine, ExpoPoll, ExpoTicket, ExpoUnpaidBag } from "./expo-types";
import {
  compareExpoTickets,
  kitchenDoneAt,
  kitchenStateOf,
  paidBagCompLine,
  type KitchenLineRow,
} from "./expo-rules";
import { catalogNameMy, pairModifiersMy } from "./ticket-names";
import { loadLineNames } from "./line-names";
import { readUnpaidCounterCarts } from "./register-queue";
import { counterUncollected, unpaidBag } from "./counter-order";

/**
 * Expo / bagging station (S4.3a, reshaped by W3a) — the takeaway counterpart to the KDS. Read-only
 * queue of PAID orders with a takeaway portion (togo food + grocery), grouped per order, plus the staff
 * bump (preparing → ready → picked_up). Server Actions are public POSTs (IDOR by default), so EVERY
 * export re-checks requireStaff() and acts via the service-role client — the client UI is the
 * affordance, never the gate (parity with lib/kitchen.ts). The queue is intentionally cross-table
 * (one bagging counter for the room).
 */

const QUEUE_CAP = 200; // a teahouse has a handful of live takeaway bags; bound the read regardless.
/**
 * M181 — the same shape as the kitchen's M180, with a tighter cap and a slower leak.
 *
 * `picked_up` is written ONLY by the manual bump (`mms_set_togo_status`, whose sole caller is
 * `setTogoStatus` below), so every bag handed to a guest without that tap stays `ready` forever. The
 * cap is applied by SQL on an oldest-first order, so once ~200 un-bumped orders accrue the read
 * returns only ancient ones and today's paid bags never reach the counter screen at all.
 *
 * The floor bounds that population to one day's worth, which cannot approach the cap at teahouse
 * volume. A bag `ready` for more than 24 hours is not waiting at the counter; the alternative is the
 * board never showing the one that is.
 */

/** M250 — one row of the comp read (`qr_cart_items`): a line ready for `toExpoLine`, plus the
 *  three columns `paidBagCompLine` decides on and the cart it rides. */
type CompRow = {
  id: string;
  cart_id: string;
  name: string;
  qty: number;
  modifiers: unknown;
  modifier_option_ids: unknown;
  fulfillment: string;
  notes: string | null;
  menu_item_id: string;
  state: string;
  comped: boolean;
  created_at: string;
};

/**
 * Live takeaway queue: paid orders whose togo_status is preparing/ready (picked_up drops off), with
 * their takeaway order-items and a per-order call-out identity. Three bounded reads assembled in TS.
 *
 * W3a sort — EFFECTIVE DUE TIME, not bag age: `(arrived? 0 : 1, pickup_slot ?? created_at)`. A human
 * standing at the counter ("Here now") outranks everything; then bags order by when they're actually
 * due — a 6pm slot paid at noon no longer heads the queue all afternoon while a walk-up scango bag
 * waits at the bottom. K10: gate failures return a discriminant (signin/locked), never a throw the
 * client can't tell from a dropped socket.
 *
 * Phase 2f · P2v — beside the paid bags, the OPEN counter (`reg-`) orders whose food the kitchen has
 * (`readUnpaidCounterCarts`, shaped by `unpaidBag`): "Unpaid — collect at pickup", whose one action is
 * Take payment. That read is NOT advisory — an unreadable one is an outage of the lane, because an
 * empty unpaid list over cooked food is the lie the W10b posture refuses. A SATURATED one keeps the
 * paid bags and the newest unpaid ones, and says so (`unpaidTruncated`, review M1).
 *
 * M250 — a paid bag is its snapshot PLUS its cart's comped takeaway lines (`paidBagCompLine`), each
 * marked `noCharge`: the comp the kitchen cooks is handed over too, and it never reaches an amount.
 */
export async function getExpoQueue(): Promise<ExpoPoll> {
  const auth = await getStaffAuth();
  // W10b — an unknowable gate is not "signed out": `outage` keeps the board's last-known queue
  // instead of redirecting the bagging counter to login mid-service (M32).
  if (auth.kind === "unavailable") return { ok: false, reason: "outage" };
  if (auth.kind !== "staff") return { ok: false, reason: "signin" };
  if (await isConsoleLocked()) return { ok: false, reason: "locked" };

  const db = serviceClient();
  const { data: dbNow } = await db.rpc("mms_now");
  const nowIso = dbNow ?? new Date().toISOString();

  // W10b — every read that feeds ticket assembly checks its error → `outage`: a failed orders read
  // rendered "No bags waiting" over a counter of paid bags; a failed items/sessions read silently
  // dropped or mislabeled them. The freeze-on-outage client keeps the last-known queue regardless.
  //
  // ⚠️ THE UNPAID READ FINISHES BEFORE THE PAID READ STARTS (Codex round 1 on #308, P2). Settlement
  // moves a counter order from one list to the other; issued concurrently, the two statements take
  // their snapshots in either order, and with the paid snapshot FIRST a bag settled between them is
  // in neither list. Awaited in sequence (each PostgREST statement snapshots at its start), a cart
  // the unpaid read saw leave `open` already has its settled order row for the paid read — so the
  // only interleaving left is the harmless one, the same bag in BOTH lists, and the dedupe below
  // (the paid bag wins) takes it out. One round trip of latency buys the ordering.
  //
  // RESIDUAL, NOT FIXED HERE: a settled order joins the paid read only once `mms_init_togo_status`
  // stamps `togo_status`, which runs in the settle's `after()` drain (backstop: the pg_cron
  // reconciler), not in the settling transaction. For that window — normally milliseconds — the bag
  // is in neither list for one poll, and the next poll shows it paid. Closing it needs the stamp in
  // the settle itself, a migration on the money path.
  const paidRead = () =>
    db
      .from("qr_orders")
      .select(
        "id,togo_status,session_id,table_number,pickup_slot,arrived_at,created_at,customer_name,cart_id",
      )
      .in("togo_status", ["preparing", "ready"])
      // ⚠️ THE WINDOW IS ON THE DUE TIME, NOT THE ORDER TIME (Codex round 2 on #275, P1). A scheduled
      // pickup is charged and its `qr_orders` row written the moment the guest pays, while the
      // scheduling horizon allows slots more than a day out — so a `created_at` floor swept a paid,
      // still-future bag off the counter before staff should even start it. The kitchen's floor never
      // had this problem because `fire_at` IS the due time; expo's `created_at` is not. A slotted
      // order is judged by its slot, and only a slotless (ASAP) one falls back to when it was placed.
      .or(
        `pickup_slot.gte.${queueFloorIso(nowIso)},and(pickup_slot.is.null,created_at.gte.${queueFloorIso(nowIso)})`,
      )
      .order("created_at", { ascending: true })
      .limit(QUEUE_CAP);
  const unpaidRead = await readUnpaidCounterCarts(db, nowIso);
  if (!unpaidRead.ok) return { ok: false, reason: "outage" };
  const { data: orders, error: ordersError } = await paidRead();
  if (ordersError) return { ok: false, reason: "outage" };
  // ⚠️ SATURATION IS AN OUTAGE, NOT A FOOTNOTE (Codex round 2, P2). Logging and continuing returned
  // `ok: true` with a partial list — the oldest-first cap silently omits every newer order, so a
  // just-paid bag simply never appears at the counter, which is the M181 lie in a quieter form.
  // `outage` freezes the client on its last-known queue, so it never blanks a board; a board that
  // cannot see the whole window must not present part of it as the whole.
  //
  // Checked BEFORE the empty return: a saturated read cannot claim emptiness either.
  if (orders && queueEmptiness(orders.length, QUEUE_CAP) === "cannot-say") {
    console.error("[expo] takeaway queue read saturated — refusing to render a partial counter", {
      cap: QUEUE_CAP,
    });
    return { ok: false, reason: "outage" };
  }
  // The paid bags' carts — the comp read (M250), the phone read and the kitchen-state read all key
  // by them. W21: the pickup contact phone lives on the CART; the order row joins back via cart_id.
  const cartIds = [
    ...new Set((orders ?? []).map((o) => o.cart_id).filter((c): c is string => !!c)),
  ];
  // Phase 2f review M1 — a SATURATED unpaid read degrades the unpaid section only. A sent-unpaid
  // counter order is exempt from the sweep, so uncollected ones accrue; turning the whole lane into
  // an outage at the cap hid every PAID bag over orders nobody came for. The read keeps the NEWEST
  // carts (`readUnpaidCounterCarts`), and `unpaidTruncated` tells the lane its unpaid list is not the
  // whole list — never passed off as complete.
  const unpaidTruncated = unpaidRead.truncated;
  if (unpaidTruncated)
    console.error("[expo] unpaid counter read saturated — the oldest unpaid bags are not shown", {
      rows: unpaidRead.carts.length,
    });
  const nowMs = Date.parse(nowIso);
  // A cart the paid read already holds settled between the two reads: it is a PAID bag now, drawn
  // once, as paid (Codex round 1 on #308 — never twice, once each way).
  const paidCarts = new Set((orders ?? []).map((o) => o.cart_id).filter((c) => !!c));
  const bags = unpaidRead.carts.flatMap((c) => {
    if (paidCarts.has(c.id)) return [];
    const b = unpaidBag({
      cartId: c.id,
      sessionId: c.session_id,
      customerName: c.customer_name ?? null,
      lines: c.items ?? [],
      nowMs,
    });
    // Phase 2g · P2fk — uncollected on the DB clock (`nowMs`, `mms_now`), over the SAME lines
    // `sentAt` was derived from (`counterSentMs` inside both): the flag and the age cannot part.
    return b ? [{ ...b, uncollected: counterUncollected(c.items ?? [], nowMs) }] : [];
  });

  const orderIds = (orders ?? []).map((o) => o.id);
  // Only the TAKEAWAY lines (the bag) — a dine-in line on a mixed order stays on the table, not the counter.
  const { data: items, error: itemsError } = orderIds.length
    ? await db
        .from("qr_order_items")
        .select("id,order_id,name,qty,modifiers,modifier_option_ids,fulfillment,notes,menu_item_id")
        .in("order_id", orderIds)
        .in("fulfillment", ["togo", "grocery"])
    : { data: [], error: null };
  if (itemsError) return { ok: false, reason: "outage" };

  // M250 — a comped dish rides its PAID bag. The snapshot above never holds one (every
  // `mms_fulfill_*` writes it `not ci.comped`), yet the kitchen cooks it and the guest is owed it —
  // so a comp the unpaid bag showed vanished at settle, and a bagger handed the bag over without it.
  // The cart keeps its lines past payment (no fulfil deletes them), so the paid bag reads its own
  // cart's comped takeaway lines here and draws them "No charge". An OUTAGE read, like every read
  // that decides what is IN a bag — never the advisory kitchen-state read below, whose failure must
  // leave the bags standing: a bag silently missing its comp is the lie this read exists to end.
  // The SQL filters only narrow the rows; `paidBagCompLine` decides. Before the name read, so the
  // comps' Burmese names load in the one call.
  const {
    data: compRows,
    error: compError,
    count: compCount,
  } = cartIds.length
    ? await db
        .from("qr_cart_items")
        .select(
          "id,cart_id,name,qty,modifiers,modifier_option_ids,fulfillment,notes,menu_item_id,state,comped,created_at",
          { count: "exact" },
        )
        .in("cart_id", cartIds)
        .eq("comped", true)
        .neq("state", "voided")
        .in("fulfillment", ["togo", "grocery"])
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
    : { data: [] as CompRow[], error: null, count: 0 };
  if (compError) return { ok: false, reason: "outage" };
  // Short of its own count is PostgREST's silent max-rows cap: a bag drawn without a comp that fell
  // past it is the same lie as a failed read, so it takes the same posture.
  const compTruncated = typeof compCount === "number" && compCount > (compRows?.length ?? 0);
  if (compTruncated) {
    console.error("[expo] comp read truncated — refusing to draw a bag without its comps", {
      count: compCount,
      rows: compRows?.length ?? 0,
    });
    return { ok: false, reason: "outage" };
  }
  const comps = (compRows ?? []).filter(paidBagCompLine);

  // P1 — the Burmese half of every bag line, from the LIVE catalog, through the ONE loader (F18,
  // A4·1): dishes by uuid, grocery by barcode, options by their stored ids — partitioned before the
  // IN-lists and ADVISORY by table, so a failed name read logs and that half renders English (what
  // the counter showed before P1), never `outage`. A name read cannot misidentify a bag; freezing
  // the counter over a label is the over-blocking direction.
  const { nameMyByRef, optionNameMy } = await loadLineNames(
    db,
    [...(items ?? []), ...comps, ...bags.flatMap((b) => b.lines)],
    { tag: "expo" },
  );
  const toExpoLine = (it: {
    id: string;
    name: string;
    qty: number;
    modifiers: unknown;
    modifier_option_ids: unknown;
    fulfillment: string;
    notes: string | null;
    menu_item_id: string;
    /** A cart line's own flag (the comp read, an unpaid bag's lines); absent on a snapshot line,
     *  which is chargeable by construction. */
    comped?: boolean;
  }): ExpoLine => {
    const modifiers = Array.isArray(it.modifiers) ? (it.modifiers as string[]) : [];
    return {
      id: it.id,
      name: it.name,
      nameMy: catalogNameMy(nameMyByRef.get(it.menu_item_id), it.name),
      qty: it.qty,
      modifiers,
      modifiersMy: pairModifiersMy(it.modifier_option_ids, modifiers, optionNameMy),
      fulfillment: it.fulfillment === "grocery" ? "grocery" : "togo",
      notes: it.notes ?? null,
      // M250 — absent unless comped: an absent field reads as chargeable.
      ...(it.comped === true ? { noCharge: true as const } : {}),
    };
  };
  const unpaid: ExpoUnpaidBag[] = bags.map((b) => ({ ...b, lines: b.lines.map(toExpoLine) }));
  if (!orders || orders.length === 0)
    return { ok: true, queue: { tickets: [], unpaid, unpaidTruncated, serverNow: nowIso } };

  const linesByOrder = new Map<string, ExpoLine[]>();
  for (const it of items ?? []) {
    const line = toExpoLine(it);
    const arr = linesByOrder.get(it.order_id);
    if (arr) arr.push(line);
    else linesByOrder.set(it.order_id, [line]);
  }
  // M250 — each paid bag's comps, by its CART (the snapshot keys by order; a comp has no order row).
  const compsByCart = new Map<string, ExpoLine[]>();
  for (const c of comps) {
    const line = toExpoLine(c);
    const arr = compsByCart.get(c.cart_id);
    if (arr) arr.push(line);
    else compsByCart.set(c.cart_id, [line]);
  }

  const sessionIds = [...new Set(orders.map((o) => o.session_id).filter((s): s is string => !!s))];
  const { data: sessions, error: sessionsError } = sessionIds.length
    ? await db.from("table_sessions").select("id,qr_code,mode").in("id", sessionIds)
    : { data: [] as { id: string; qr_code: string; mode: string }[], error: null };
  if (sessionsError) return { ok: false, reason: "outage" };
  const sessById = new Map((sessions ?? []).map((s) => [s.id, s]));

  // W21 — the pickup contact phone lives on the CART (qr_carts.customer_phone, required at a
  // pickup checkout precisely so this counter can reach the diner); the order row joins back via
  // cart_id (`cartIds`, above). Staff-gated surface only — the phone never rides a diner-facing or
  // public read.
  const { data: carts, error: cartsError } = cartIds.length
    ? await db.from("qr_carts").select("id,customer_phone").in("id", cartIds)
    : { data: [] as { id: string; customer_phone: string | null }[], error: null };
  if (cartsError) return { ok: false, reason: "outage" };
  const phoneByCart = new Map((carts ?? []).map((c) => [c.id, c.customer_phone]));

  // A4·2 · K30 (B) — the kitchen's own progress, off the cart's lines (`kitchenStateOf`). ADVISORY:
  // a failed read logs and leaves the map empty, so every bag reads `unknown` — the counter keeps
  // its queue and its due-time order. A badge cannot misidentify a bag; refusing the whole counter
  // over one is the over-blocking direction.
  const {
    data: cartLines,
    error: cartLinesError,
    count: cartLinesCount,
  } = cartIds.length
    ? await db
        .from("qr_cart_items")
        .select("cart_id,state,fulfillment,bumped_at", { count: "exact" })
        .in("cart_id", cartIds)
    : {
        data: [] as {
          cart_id: string;
          state: string;
          fulfillment: string;
          bumped_at: string | null;
        }[],
        error: null,
        count: 0,
      };
  const linesByCart = new Map<string, (KitchenLineRow & { bumped_at: string | null })[]>();
  // A response SHORT of its own count is PostgREST's max-rows cap, and it is silent (Codex round 1
  // on A4·2): a cart whose cooking row fell past the cap would read `done` off its surviving served
  // rows and be lifted as finished. `count: "exact"` rides the same statement; a count above the
  // rows is the truncation, and it takes the failed read's posture — every bag `unknown`, logged.
  const cartLinesTruncated =
    typeof cartLinesCount === "number" && cartLinesCount > (cartLines?.length ?? 0);
  if (cartLinesError) {
    console.error(
      "[expo] kitchen-state read failed — bags will not say whether the kitchen is done",
      {
        message: cartLinesError.message,
      },
    );
  } else if (cartLinesTruncated) {
    console.error(
      "[expo] kitchen-state read truncated — bags will not say whether the kitchen is done",
      { count: cartLinesCount, rows: cartLines?.length ?? 0 },
    );
  } else {
    for (const l of cartLines ?? []) {
      const arr = linesByCart.get(l.cart_id);
      if (arr) arr.push(l);
      else linesByCart.set(l.cart_id, [l]);
    }
  }

  const tickets: ExpoTicket[] = [];
  for (const o of orders) {
    // The snapshot's lines, then (M250) the cart's comps, oldest first — disjoint by construction
    // (a comp is never snapshotted). An order with no cart keeps its snapshot only.
    const lines = [
      ...(linesByOrder.get(o.id) ?? []),
      ...((o.cart_id ? compsByCart.get(o.cart_id) : undefined) ?? []),
    ];
    if (lines.length === 0) continue; // no takeaway line at all — not a bag (defensive)
    const sess = o.session_id ? sessById.get(o.session_id) : undefined;
    const cartLinesOf = o.cart_id ? linesByCart.get(o.cart_id) : undefined;
    const kitchen = kitchenStateOf(cartLinesOf);
    tickets.push({
      orderId: o.id,
      cartId: o.cart_id ?? null,
      label: sess?.qr_code ?? "Order",
      // K2: the denormalized table snapshot (stamped at fulfillment) — durable past session expiry,
      // and null for a pickup/scango bag (no table). Read off the ORDER, not the (maybe-gone) session.
      tableNumber: o.table_number ?? null,
      mode: sess?.mode ?? "scango",
      customerName: o.customer_name ?? null,
      customerPhone: (o.cart_id ? phoneByCart.get(o.cart_id) : null) ?? null,
      shortCode: o.id.slice(-6).toUpperCase(),
      status: o.togo_status === "ready" ? "ready" : "preparing",
      kitchen,
      // Phase 2f review PT3 — the finish, off the SAME cart lines an unpaid bag reads its own from.
      doneAt: kitchen === "done" && cartLinesOf ? kitchenDoneAt(cartLinesOf) : null,
      pickupSlot: o.pickup_slot ?? null,
      arrivedAt: o.arrived_at ?? null,
      lines,
      createdAt: o.created_at,
    });
  }

  // W3a + K30 (B): "Here now" pins (a waiting HUMAN outranks everything), then a bag the kitchen has
  // finished, then the effective due time (the pickup slot when one exists, else payment time), then
  // the short code — the ONE comparator, in `lib/expo-rules.ts` where a value can falsify it.
  tickets.sort(compareExpoTickets);
  return { ok: true, queue: { tickets, unpaid, unpaidTruncated, serverNow: nowIso } };
}

export type ExpoActionResult = { ok: true } | { ok: false; error: string; code: ExpoErrCode };

/**
 * Advance an order's takeaway status (S4.3a): preparing → ready (bagged, tell the diner) → picked_up
 * (handed off, drops off the board). Staff-gated; mms_set_togo_status re-asserts the legal edge IN the
 * write ('stale' on a raced/illegal transition) and stamps togo_ready_at/togo_picked_up_at (W3e — the
 * order-ready board's flash + auto-clear read the real transition times). The order's UPDATE is the
 * realtime trigger that lights the diner's /track. revalidate the expo so the initiating staff device
 * reflects it immediately too.
 */
export async function setTogoStatus(raw: unknown): Promise<ExpoActionResult> {
  const gate = await staffGate();
  if (!gate.ok)
    return {
      ok: false,
      error: gate.error,
      code: gate.error === STAFF_SIGNIN_REQUIRED ? "signin" : "sentence",
    };
  const caller = gate.caller;
  const parsed = setTogoStatusInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request.", code: "invalid" };
  const { orderId, to } = parsed.data;

  const { data, error } = await serviceClient().rpc("mms_set_togo_status", {
    p_order: orderId,
    p_to: to,
  });
  if (error) {
    console.error("[expo] mms_set_togo_status failed", { orderId, to, message: error.message });
    return { ok: false, error: "Couldn’t update that bag. Try again.", code: "failed" };
  }
  if (data !== "ok")
    return { ok: false, error: "That bag was already updated — refreshing.", code: "stale" }; // 'stale'/'bad_status'

  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    after(async () => {
      try {
        const ph = getPostHogClient();
        ph.capture({
          distinctId: `staff:${caller.staffId}`,
          event: "expo_set_togo_status",
          properties: { role: caller.role, to },
        });
        await ph.flush();
      } catch {
        /* analytics best-effort — never fail a bump on a capture error */
      }
    });
  }
  revalidatePath("/staff"); // A4·2 — the takeaway lane lives on the counter's screen
  return { ok: true };
}
