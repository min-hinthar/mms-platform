"use server";
import { revalidatePath } from "next/cache";
import { serviceClient } from "@mms/db/server";
import { openRegisterInput } from "@mms/db/schemas";
import { staffGate, STAFF_WRITE_OUTAGE } from "./staff";
import { generateJoinCode } from "./session-code";

/**
 * The FOH register mint (W6a — closes K6's "an order cannot exist without a diner's phone").
 *
 * Three arms, one action:
 *   • walk-up / phone — a per-order `mode='pickup'` session keyed `reg-<code>` with NO member row:
 *     to-go tax basis, KDS name+#CODE ticket, expo-eligible, invisible to every diner surface (no
 *     is_member path can see it). One session per order — the pickup/scango solo model — so the 4h
 *     TTL, the one-open-cart index, and the party trigger never bind a long-lived counter session.
 *   • table — find-or-create the ACTIVE dine-in session on a REGISTERED table's sticker code, so a
 *     diner who scans the sticker later lands in the SAME session the staff started, and eat-in tax
 *     basis + floor/KDS routing hold by construction.
 *
 * Deliberately NOT /api/session: that route's join/mutation rate limits key on one anon seat (a
 * register would burn 30 mints/min across the whole counter), and its party/membership machinery is
 * for diners. Staff mint via the service client behind staffGate, like every staff write.
 */

export type OpenRegisterResult =
  | { ok: true; sessionId: string; created: boolean }
  | { ok: false; error: string };

const REG_PREFIX = "reg-";

export async function openRegisterOrder(raw: unknown): Promise<OpenRegisterResult> {
  const gate = await staffGate();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = openRegisterInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { kind, tableNumber, customerName } = parsed.data;
  const db = serviceClient();

  if (kind === "table") {
    if (tableNumber == null) return { ok: false, error: "Pick a table number." };
    return startTable(db, tableNumber);
  }

  // Counter arms (walk-up / phone). A generated code that collides with a live session regenerates —
  // same loop shape as /api/session's host-mint (route.ts), minus membership.
  for (let attempt = 0; attempt < 6; attempt++) {
    const code = `${REG_PREFIX}${generateJoinCode()}`;
    const { data: sess, error } = await db
      .from("table_sessions")
      .insert({ qr_code: code, mode: "pickup", host_seat: null, table_number: null })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") continue; // active-code collision → fresh code
      return { ok: false, error: STAFF_WRITE_OUTAGE };
    }
    // The order's cart. `customer_name` lands at mint for a phone order (the caller told us who's
    // calling); the walk-up captures it on the order screen. The cash RPC snapshots it to the order,
    // which is the expo/KDS call-out for a no-table ticket.
    const { error: cartErr } = await db
      .from("qr_carts")
      .insert({ session_id: sess.id, customer_name: customerName?.trim() || null });
    if (cartErr) {
      // The session just minted with a unique code — a cart-insert failure here is transport, not a
      // race. Close the orphan session best-effort so it never squats on the floor cap, and refuse.
      await db.from("table_sessions").update({ status: "closed" }).eq("id", sess.id);
      return { ok: false, error: STAFF_WRITE_OUTAGE };
    }
    revalidatePath("/staff/register");
    return { ok: true, sessionId: sess.id, created: true };
  }
  return { ok: false, error: "Couldn’t start the order — try again." };
}

/** Find-or-create the active session for a registered table (the staff mirror of a diner's sticker
 *  scan). Converges on an existing active session — staff "starting" an occupied table just opens it. */
async function startTable(
  db: ReturnType<typeof serviceClient>,
  tableNumber: number,
): Promise<OpenRegisterResult> {
  const { data: reg, error: regErr } = await db
    .from("qr_tables")
    .select("table_number,qr_code")
    .eq("table_number", tableNumber)
    .maybeSingle();
  if (regErr) return { ok: false, error: STAFF_WRITE_OUTAGE };
  if (!reg) return { ok: false, error: `Table ${tableNumber} isn’t registered.` };

  // Sweep an expired-but-still-'active' squatter off the sticker code (mirrors /api/session:169) so
  // the fresh insert below can't 23505 against a dead session.
  await db
    .from("table_sessions")
    .update({ status: "closed" })
    .eq("qr_code", reg.qr_code)
    .eq("status", "active")
    .lte("expires_at", new Date().toISOString());

  const nowIso = new Date().toISOString();
  const { data: existing, error: findErr } = await db
    .from("table_sessions")
    .select("id")
    .eq("qr_code", reg.qr_code)
    .eq("status", "active")
    .gt("expires_at", nowIso)
    .maybeSingle();
  if (findErr) return { ok: false, error: STAFF_WRITE_OUTAGE };
  if (existing) {
    await ensureOpenCart(db, existing.id);
    return { ok: true, sessionId: existing.id, created: false };
  }

  const { data: sess, error } = await db
    .from("table_sessions")
    // host_seat null: the session has no diner host yet — the first diner who scans the sticker
    // becomes a member via /api/session join (their join converges on this session by code).
    .insert({ qr_code: reg.qr_code, mode: "dinein", host_seat: null, table_number: tableNumber })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      // Lost the insert race to a concurrent scan/mint — converge on the winner.
      const { data: winner } = await db
        .from("table_sessions")
        .select("id")
        .eq("qr_code", reg.qr_code)
        .eq("status", "active")
        .maybeSingle();
      if (winner) {
        await ensureOpenCart(db, winner.id);
        return { ok: true, sessionId: winner.id, created: false };
      }
    }
    return { ok: false, error: STAFF_WRITE_OUTAGE };
  }
  await ensureOpenCart(db, sess.id);
  revalidatePath("/staff");
  return { ok: true, sessionId: sess.id, created: true };
}

/** Find-or-create the session's open cart (the /api/session cart shape, service-role). Best-effort:
 *  the staff drill-down mints one on demand too, so a miss here degrades to that, not a dead end. */
async function ensureOpenCart(db: ReturnType<typeof serviceClient>, sessionId: string) {
  const { data: cart } = await db
    .from("qr_carts")
    .select("id")
    .eq("session_id", sessionId)
    .eq("status", "open")
    .maybeSingle();
  if (cart) return;
  const { error } = await db.from("qr_carts").insert({ session_id: sessionId });
  if (error && error.code !== "23505") {
    // Deliberate swallow: qr_carts_one_open_per_session means a 23505 is a concurrent winner (fine);
    // any other failure surfaces the moment staff open the drill-down, which reads the cart honestly.
  }
}

/** One open counter order (the register queue row). */
export type RegisterQueueRow = {
  sessionId: string;
  customerName: string | null;
  itemCount: number;
  subtotalCents: number;
  startedAt: string;
};

export type RegisterQueue =
  | { ok: true; rows: RegisterQueueRow[] }
  | { ok: false; reason: "outage" };

/** The open counter orders (`reg-` sessions with an open cart). Register-page read; the floor board
 *  deliberately EXCLUDES these sessions (lib/floor.ts) so the counter queue lives here alone. */
export async function getRegisterQueue(): Promise<RegisterQueue> {
  const gate = await staffGate();
  if (!gate.ok) return { ok: false, reason: "outage" };
  const db = serviceClient();
  const nowIso = new Date().toISOString();
  const { data: sessions, error: sessErr } = await db
    .from("table_sessions")
    .select("id,created_at")
    .eq("status", "active")
    .eq("mode", "pickup")
    .like("qr_code", `${REG_PREFIX}%`)
    .gt("expires_at", nowIso)
    .order("created_at", { ascending: true })
    .limit(40);
  if (sessErr) return { ok: false, reason: "outage" };
  const ids = (sessions ?? []).map((s) => s.id);
  if (ids.length === 0) return { ok: true, rows: [] };

  const { data: carts, error: cartErr } = await db
    .from("qr_carts")
    .select("id,session_id,customer_name,created_at,qr_cart_items(qty,unit_price_cents,state,comped)")
    .in("session_id", ids)
    .eq("status", "open");
  if (cartErr) return { ok: false, reason: "outage" };

  const rows: RegisterQueueRow[] = [];
  for (const s of sessions ?? []) {
    const cart = (carts ?? []).find((c) => c.session_id === s.id);
    if (!cart) continue; // settled or cancelled — off the queue
    const lines = (cart.qr_cart_items ?? []).filter((l) => l.state !== "voided" && !l.comped);
    rows.push({
      sessionId: s.id,
      customerName: cart.customer_name ?? null,
      itemCount: lines.reduce((n, l) => n + l.qty, 0),
      // Display-only running subtotal for the queue card — the charge is always getCartTotals at settle.
      subtotalCents: lines.reduce((n, l) => n + l.qty * l.unit_price_cents, 0),
      startedAt: cart.created_at,
    });
  }
  return { ok: true, rows };
}
