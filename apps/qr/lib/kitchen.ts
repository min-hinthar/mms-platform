"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { serviceClient } from "@mms/db/server";
import {
  bumpLineInput,
  bumpTicketInput,
  fireTicketNowInput,
  recallTicketInput,
  staffFireInput,
} from "@mms/db/schemas";
import { getStaffAuth, staffGate, STAFF_WRITE_OUTAGE } from "./staff";
import { isConsoleLocked } from "./staff-lock";
import { getPostHogClient } from "./posthog-server";
import type {
  KdsStats,
  KdsThresholds,
  KitchenChannel,
  KitchenLine,
  KitchenPoll,
  KitchenStation,
  KitchenTicket,
} from "./kitchen-types";

/**
 * The KDS — kitchen display (S2.1b, reshaped by W3). Read of the live fire queue across EVERY channel
 * + the cook's bumps (line, ticket, recall, fire-early), plus the staff-side "send to kitchen". Server
 * Actions are public POSTs (IDOR by default), so EVERY export re-checks requireStaff() and acts via the
 * service-role client — the client UI is the affordance, never the gate (parity with lib/floor.ts). The
 * queue is intentionally cross-table (the kitchen sees the whole room), which is exactly why the staff
 * gate lives here and not on RLS rows.
 *
 * ONE unified fire timer (S2_DESIGN spine #3): the queue is the single read
 * `state IN ('fired','in_progress')`. W3a closed the K4 blocker: mms_fire_pending_food now fires paid
 * pickup/scango food too — at the cart's stored fire_at (slot − prep), so a scheduled order shows as a
 * dimmed HELD card and turns live when the clock passes it. Dine-in still fires on the batch send;
 * grocery never fires. Bumps reuse mms_line_transition / mms_bump_ticket (legal-edge graphs, atomic,
 * cart-status guarded IN the SQL).
 */

const QUEUE_LINE_CAP = 500; // a teahouse kitchen has tens of live lines; bound the read regardless.

/** W3d station tags: menu category slug → coarse station chip. A missing/unknown category cooks on the
 *  wok (the default line). Client-side filter only — a second physical screen is config, not schema. */
const STATION_BY_CATEGORY: Record<string, KitchenStation> = {
  drinks: "drinks",
  "appetizers-salads": "cold",
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEFAULT_THRESHOLDS: KdsThresholds = {
  dineinAmberMin: 8,
  dineinRedMin: 12,
  pickupAmberMin: 8,
  pickupRedMin: 12,
  rechimeSec: 75,
};

/**
 * The live fire queue, grouped into per-CART tickets (the ticket bump needs one unambiguous parent).
 * Bounded reads assembled in TS — a fixed round-trip count regardless of volume:
 *   1) config + stats + DB clock (parallel)   2) fired/in_progress lines
 *   3) their open/paid carts                  4) sessions + orders + menu stations (parallel)
 *
 * Channel rules (W3a): dine-in tickets require an ACTIVE session (a cleared table drops off) and hide
 * lines still inside the 10s undo grace (fire_at > now — the diner may still pull the send back).
 * Pickup/scango tickets require a PAID cart (their food only legitimately fires at settlement) and
 * survive session expiry — the paid cart + order anchor them, so a 6pm pickup can't vanish when the
 * mint's 4h TTL lapses at 4. A future fire_at on a paid ticket = HELD (dimmed, due at slot − prep).
 *
 * K10: gate failures return a discriminant instead of throwing — an expired staff cookie redirects to
 * sign-in and a locked console to /staff/lock, never an eternal "Reconnecting…".
 */
export async function getKitchenQueue(): Promise<KitchenPoll> {
  const auth = await getStaffAuth();
  // W10b — an unknowable gate is not "signed out": `outage` keeps the board's last-known queue (the
  // client freezes honestly) instead of redirecting a working kitchen to login mid-service (M32).
  if (auth.kind === "unavailable") return { ok: false, reason: "outage" };
  if (auth.kind !== "staff") return { ok: false, reason: "signin" };
  // The lock is an attribution affordance, not a hard boundary — but a locked shared tablet must not
  // keep polling a live board past the lock screen (K10: polled actions previously ignored it).
  if (await isConsoleLocked()) return { ok: false, reason: "locked" };

  const db = serviceClient();
  // S2-audit S3: the grace cutoff is the DB clock (mms_now), not the Next process clock — a skew between
  // the app instance and Postgres must not let the KDS surface a line the DB still considers undoable.
  const [nowRes, cfgRes, statsRes] = await Promise.all([
    db.rpc("mms_now"),
    db
      .from("mms_kds_config")
      .select("dinein_amber_min,dinein_red_min,pickup_amber_min,pickup_red_min,rechime_sec")
      .maybeSingle(),
    db.rpc("mms_kds_stats"),
  ]);
  const nowIso = nowRes.data ?? new Date().toISOString(); // app-clock fallback only if the rpc fails
  const nowMs = new Date(nowIso).getTime();
  const cfg = cfgRes.data;
  const thresholds: KdsThresholds = cfg
    ? {
        dineinAmberMin: cfg.dinein_amber_min,
        dineinRedMin: cfg.dinein_red_min,
        pickupAmberMin: cfg.pickup_amber_min,
        pickupRedMin: cfg.pickup_red_min,
        rechimeSec: cfg.rechime_sec,
      }
    : DEFAULT_THRESHOLDS;
  const statsRow = statsRes.data?.[0];
  const stats: KdsStats = {
    avgSecs: statsRow?.avg_secs ?? 0,
    servedToday: statsRow?.served_count ?? 0,
  };
  const empty = { tickets: [], serverNow: nowIso, thresholds, stats };

  // Live kitchen lines — HELD (future fire_at) included; the grace/held split happens per channel below.
  // W10b — every read that FEEDS ticket assembly (lines/carts/sessions/orders/menu) checks its error
  // and returns `outage` instead of degrading: a failed read used to render as an EMPTY board ("all
  // clear" over a room full of cooking food — the worst possible lie to a kitchen). The freeze-on-
  // outage client keeps the last-known queue, so erring toward `outage` never blanks anything.
  const { data: lines, error: linesError } = await db
    .from("qr_cart_items")
    .select("id,name,qty,modifiers,state,fire_at,cart_id,fulfillment,notes,menu_item_id")
    .in("state", ["fired", "in_progress"])
    .not("fire_at", "is", null)
    .order("fire_at", { ascending: true })
    .limit(QUEUE_LINE_CAP);
  if (linesError) return { ok: false, reason: "outage" };
  if (!lines || lines.length === 0) return { ok: true, queue: empty };

  // Resolve each line's cart. W3a: carts in ('open','paid') — dine-in cooks while open (and its
  // fired-at-checkout to-go food lives on the just-paid cart); pickup/scango only ever fire paid.
  const cartIds = [...new Set(lines.map((l) => l.cart_id))];
  const { data: carts, error: cartsError } = await db
    .from("qr_carts")
    .select("id,session_id,status,customer_name,pickup_slot")
    .in("id", cartIds)
    .in("status", ["open", "paid"]);
  if (cartsError) return { ok: false, reason: "outage" };
  const cartById = new Map((carts ?? []).map((c) => [c.id, c]));
  const sessionIds = [...new Set([...cartById.values()].map((c) => c.session_id))];
  if (sessionIds.length === 0) return { ok: true, queue: empty };

  // Menu-station lookup: kitchen lines are always restaurant items (grocery never fires), but filter to
  // uuid-shaped ids defensively — menu_item_id is a soft ref that also carries grocery barcodes.
  const menuIds = [...new Set(lines.map((l) => l.menu_item_id).filter((id) => UUID_RE.test(id)))];

  const [sessRes, orderRes, menuRes] = await Promise.all([
    // No mode/status filter (W3a): dine-in enforces active below; pickup/scango outlive their session.
    db.from("table_sessions").select("id,qr_code,table_number,mode,status").in("id", sessionIds),
    // The order anchors the pickup/scango identity: its uuid tail IS the short code the diner's
    // /track + exit pass show, so the kitchen and the customer's phone always agree.
    db.from("qr_orders").select("id,cart_id").in("cart_id", cartIds).eq("status", "paid"),
    menuIds.length
      ? db.from("menu_items").select("id,menu_categories(slug)").in("id", menuIds)
      : Promise.resolve({
          data: [] as { id: string; menu_categories: { slug: string } | null }[],
          error: null,
        }),
  ]);
  // Same rule as the anchor reads: a failed session read skips every ticket (false-empty); a failed
  // order/menu read strips pickup call-out codes / station routing — misidentity, not degradation.
  if (sessRes.error || orderRes.error || menuRes.error) return { ok: false, reason: "outage" };
  const sessById = new Map((sessRes.data ?? []).map((s) => [s.id, s]));
  const orderByCart = new Map<string, string>();
  for (const o of orderRes.data ?? []) {
    if (o.cart_id && !orderByCart.has(o.cart_id)) orderByCart.set(o.cart_id, o.id);
  }
  const stationByItem = new Map<string, KitchenStation>();
  for (const m of menuRes.data ?? []) {
    const slug = m.menu_categories?.slug;
    stationByItem.set(m.id, (slug && STATION_BY_CATEGORY[slug]) || "wok");
  }

  // Assemble tickets, preserving the oldest-first line order (lines is already sorted by fire_at).
  const ticketByCart = new Map<string, KitchenTicket>();
  for (const l of lines) {
    const cart = cartById.get(l.cart_id);
    if (!cart) continue; // cart cancelled/cleared — not a live kitchen line
    const sess = sessById.get(cart.session_id);
    if (!sess) continue; // defensive: orphaned cart
    const channel: KitchenChannel =
      sess.mode === "dinein" ? "dinein" : sess.mode === "pickup" ? "pickup" : "scango";
    const fireMs = new Date(l.fire_at ?? nowIso).getTime();
    if (channel === "dinein") {
      if (sess.status !== "active") continue; // cleared/closed table — nothing left to cook
      if (fireMs > nowMs) continue; // inside the 10s undo grace — the kitchen must not see it yet
    } else if (cart.status !== "paid") {
      // Non-dine-in food only legitimately fires at settlement; a pre-payment fired line on an open
      // pickup cart is an edge no diner surface produces — skip rather than cook unpaid food.
      continue;
    }
    const line: KitchenLine = {
      id: l.id,
      name: l.name,
      qty: l.qty,
      modifiers: Array.isArray(l.modifiers) ? (l.modifiers as string[]) : [],
      notes: l.notes ?? null,
      state: l.state === "in_progress" ? "in_progress" : "fired",
      firedAt: l.fire_at ?? nowIso,
      fulfillment: (l.fulfillment ?? "dinein") as KitchenLine["fulfillment"],
      station: stationByItem.get(l.menu_item_id) ?? "wok",
    };
    const existing = ticketByCart.get(l.cart_id);
    if (existing) {
      existing.lines.push(line);
      // A ticket is HELD only while EVERY line is future-fired (mms_fire_pending_food stamps one
      // uniform fire_at per settlement, so a mixed ticket only arises from a manual fire-early race).
      if (fireMs <= nowMs) existing.held = false;
    } else {
      const orderId = orderByCart.get(l.cart_id);
      ticketByCart.set(l.cart_id, {
        cartId: l.cart_id,
        sessionId: cart.session_id,
        channel,
        label: sess.qr_code,
        tableNumber: channel === "dinein" ? (sess.table_number ?? null) : null,
        customerName: channel === "dinein" ? null : (cart.customer_name ?? null),
        shortCode: channel === "dinein" || !orderId ? null : orderId.slice(-6).toUpperCase(),
        pickupSlot: cart.pickup_slot ?? null,
        held: channel !== "dinein" && fireMs > nowMs,
        lines: [line],
        firedAt: line.firedAt, // first (oldest) line's fire time = the ticket's age / due time
      });
    }
  }

  // Live tickets oldest-first (work head-down); HELD tickets after, soonest-due first.
  const all = [...ticketByCart.values()];
  const byFire = (a: KitchenTicket, b: KitchenTicket) =>
    new Date(a.firedAt).getTime() - new Date(b.firedAt).getTime();
  const tickets = [
    ...all.filter((t) => !t.held).sort(byFire),
    ...all.filter((t) => t.held).sort(byFire),
  ];
  return { ok: true, queue: { tickets, serverNow: nowIso, thresholds, stats } };
}

export type KitchenActionResult = { ok: true } | { ok: false; error: string };

/**
 * Bump a fired line along its kitchen life: 'in_progress' (Start) or 'served' (Ready). The legal-edge
 * graph + atomicity + parent-cart guard all live in mms_line_transition (S2.1a, W3-widened to paid
 * carts for the kitchen edges) — a 0-row return means the line already moved, the cart closed, or the
 * edge is illegal (e.g. a stale tap on a line a teammate already served), which we surface as a benign
 * "already updated" rather than an error.
 */
export async function bumpLine(raw: unknown): Promise<KitchenActionResult> {
  const gate = await staffGate();
  if (!gate.ok) return { ok: false, error: gate.error };
  const caller = gate.caller;
  const parsed = bumpLineInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { lineId, to } = parsed.data;

  const { data: affected, error } = await serviceClient().rpc("mms_line_transition", {
    p_line: lineId,
    p_to: to,
  });
  if (error) {
    console.error("[kitchen] mms_line_transition failed", { lineId, to, message: error.message });
    return { ok: false, error: "Couldn’t update that ticket. Try again." };
  }
  if (!affected) return { ok: false, error: "That item was already updated." };

  captureKitchenEvent(caller.staffId, "kds_bump_line", { role: caller.role, to });
  revalidatePath("/staff/kitchen");
  return { ok: true };
}

/**
 * W3d: bump a WHOLE ticket served in one tap (the ~60px zone). The client sends the line ids it
 * DISPLAYED — a line that fired between snapshot and tap stays un-served and re-renders as its own
 * fresh ticket, so a rush can never silently serve food the cook hasn't seen. One atomic UPDATE
 * (mms_bump_ticket) with every guard in the statement; the 6s undo toast + recall rail call
 * recallTicket with the same ids.
 */
export async function bumpTicket(raw: unknown): Promise<KitchenActionResult> {
  const gate = await staffGate();
  if (!gate.ok) return { ok: false, error: gate.error };
  const caller = gate.caller;
  const parsed = bumpTicketInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { cartId, lineIds } = parsed.data;

  const { data: bumped, error } = await serviceClient().rpc("mms_bump_ticket", {
    p_cart: cartId,
    p_lines: lineIds,
  });
  if (error) {
    console.error("[kitchen] mms_bump_ticket failed", { cartId, message: error.message });
    return { ok: false, error: "Couldn’t bump that ticket. Try again." };
  }
  if (!bumped) return { ok: false, error: "That ticket was already updated." };

  captureKitchenEvent(caller.staffId, "kds_bump_ticket", { role: caller.role, lines: bumped });
  revalidatePath("/staff/kitchen");
  return { ok: true };
}

/**
 * W3d: restore a mis-bumped ticket (the recall rail / the 6s undo). The 2-minute window + served-state
 * guard live in mms_recall_ticket — a stale recall 0-rows into an honest "window passed" message.
 */
export async function recallTicket(raw: unknown): Promise<KitchenActionResult> {
  const gate = await staffGate();
  if (!gate.ok) return { ok: false, error: gate.error };
  const caller = gate.caller;
  const parsed = recallTicketInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { cartId, lineIds } = parsed.data;

  const { data: restored, error } = await serviceClient().rpc("mms_recall_ticket", {
    p_cart: cartId,
    p_lines: lineIds,
  });
  if (error) {
    console.error("[kitchen] mms_recall_ticket failed", { cartId, message: error.message });
    return { ok: false, error: "Couldn’t recall that ticket. Try again." };
  }
  if (!restored) return { ok: false, error: "The recall window has passed for that ticket." };

  captureKitchenEvent(caller.staffId, "kds_recall_ticket", { role: caller.role, lines: restored });
  revalidatePath("/staff/kitchen");
  return { ok: true };
}

/**
 * W3a: pull a HELD (scheduled) ticket onto the live board early — the manual "Fire now" on a held
 * card. mms_fire_ticket_now moves only future-fire_at lines on a PAID cart, so it can never eat a
 * dine-in send's undo grace (those live on OPEN carts and belong to the diner).
 */
export async function fireTicketNow(raw: unknown): Promise<KitchenActionResult> {
  const gate = await staffGate();
  if (!gate.ok) return { ok: false, error: gate.error };
  const caller = gate.caller;
  const parsed = fireTicketNowInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { cartId } = parsed.data;

  const { data: fired, error } = await serviceClient().rpc("mms_fire_ticket_now", {
    p_cart: cartId,
  });
  if (error) {
    console.error("[kitchen] mms_fire_ticket_now failed", { cartId, message: error.message });
    return { ok: false, error: "Couldn’t fire that ticket. Try again." };
  }
  if (!fired) return { ok: false, error: "That ticket is already live." };

  captureKitchenEvent(caller.staffId, "kds_fire_held_early", { role: caller.role, lines: fired });
  revalidatePath("/staff/kitchen");
  return { ok: true };
}

/**
 * Staff fire a table's draft batch to the kitchen from the console (S1.3 "order for a guest" → now also
 * "send it"). The fire itself is the atomic, dine-in-only mms_fire_cart (draft→fired + fire_at=now(),
 * cart-open guarded, grocery/pickup excluded). Refused with an honest message when there's nothing to
 * fire / the table isn't an open dine-in cart.
 */
export async function staffFireCart(raw: unknown): Promise<KitchenActionResult> {
  const gate = await staffGate();
  if (!gate.ok) return { ok: false, error: gate.error };
  const caller = gate.caller;
  const parsed = staffFireInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { sessionId } = parsed.data;

  const db = serviceClient();
  const { data: cart, error: cartError } = await db
    .from("qr_carts")
    .select("id")
    .eq("session_id", sessionId)
    .eq("status", "open")
    .maybeSingle();
  // W10b — an unread cart is not "no open order": that verdict sends staff hunting a phantom problem
  // at the table while the real one is the platform.
  if (cartError) return { ok: false, error: STAFF_WRITE_OUTAGE };
  if (!cart) return { ok: false, error: "This table has no open order." };

  const { data: fireRows, error } = await db.rpc("mms_fire_cart", { p_cart_id: cart.id });
  if (error) {
    console.error("[kitchen] mms_fire_cart failed", { sessionId, message: error.message });
    return { ok: false, error: "Couldn’t send that order. Try again." };
  }
  const fired = fireRows?.[0]?.fired ?? 0; // mms_fire_cart returns (fired, batch, fire_deadline) (S4-audit P1-3)
  if (!fired) return { ok: false, error: "Nothing new to send — it’s all in the kitchen already." };

  captureKitchenEvent(caller.staffId, "staff_fire_cart", {
    role: caller.role,
    sessionId,
    lines: fired,
  });
  revalidatePath("/staff/kitchen");
  revalidatePath(`/staff/table/${sessionId}`);
  return { ok: true };
}

/** Best-effort, non-PII analytics drain (never fails a bump on a capture error). */
function captureKitchenEvent(
  staffId: string,
  event: string,
  properties: Record<string, string | number>,
): void {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  after(async () => {
    try {
      const ph = getPostHogClient();
      ph.capture({ distinctId: `staff:${staffId}`, event, properties });
      await ph.flush();
    } catch {
      /* analytics best-effort */
    }
  });
}
