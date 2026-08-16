"use server";
import { revalidatePath } from "next/cache";
import { serviceClient } from "@mms/db/server";
import { openRegisterInput, setCartNameInput } from "@mms/db/schemas";
import { roleAtLeast, staffGate, STAFF_WRITE_OUTAGE } from "./staff";
import { generateJoinCode } from "./session-code";
import { laDayStartIso, summarizeDay, type DaySummary } from "./register-math";
import { summarizeTips, type TipReport } from "./tip-report";

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
/** Counter-order session window — long enough for any same-day phone order; the settle closes the
 *  session anyway, so this is the ABANDONED-order horizon, not a working TTL. */
const REG_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

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
      .insert({
        qr_code: code,
        mode: "pickup",
        host_seat: null,
        table_number: null,
        // The review's confirmed HIGH: the 4h default TTL strands an unsettled counter order (an
        // 11am phone order for a 4pm pickup expires at 3pm — the sweeper closes the session and the
        // settle refuses). A counter order's liveness is its OPEN CART, not a diner session window;
        // 12h covers any service day and the settle below closes the session the moment it's paid.
        expires_at: new Date(Date.now() + REG_SESSION_TTL_MS).toISOString(),
      })
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
 *  on a failure the drill-down honestly shows "no open order" (nothing mints one later — a diner
 *  join via /api/session would); the console.error below is the only trace, so keep it. */
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
    // Deliberate degrade: a 23505 is a concurrent winner (fine). Anything else leaves the session
    // cartless — the drill-down shows "no open order" honestly, and this log is the only trace.
    console.error("[register] ensureOpenCart failed", { sessionId, code: error.code });
  }
}

export type SetCartNameResult = { ok: true } | { ok: false; error: string };

/** The register's name capture (W6a) — the call-out identity for a cash order. The card path writes
 *  this in create-intent; a cash walk-up had NO write path, so its expo ticket was a bare #CODE.
 *  Open-cart-guarded in the statement; `.select` verifies a row actually changed (a 0-row UPDATE
 *  returns `{ error: null }` — indistinguishable from success without the read-back). */
export async function setCartCustomerName(raw: unknown): Promise<SetCartNameResult> {
  const gate = await staffGate();
  if (!gate.ok) return { ok: false, error: gate.error };
  const parsed = setCartNameInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { sessionId, name } = parsed.data;
  const db = serviceClient();
  const { data, error } = await db
    .from("qr_carts")
    .update({ customer_name: name || null })
    .eq("session_id", sessionId)
    .eq("status", "open")
    .select("id");
  if (error) return { ok: false, error: STAFF_WRITE_OUTAGE };
  if (!data || data.length === 0)
    return { ok: false, error: "This order is already settled — the name didn’t change." };
  revalidatePath(`/staff/table/${sessionId}`);
  return { ok: true };
}

/** One open counter order (the register queue row). */
export type RegisterQueueRow = {
  sessionId: string;
  customerName: string | null;
  itemCount: number;
  subtotalCents: number;
  startedAt: string;
  /** W6b: where the order was entered — the queue card badges kiosk orders. */
  source: "register" | "kiosk";
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
  // OPEN CARTS first (the review's confirmed HIGH): a limit applied to ACTIVE SESSIONS is consumed
  // by settled-but-not-yet-expired ones, hiding genuinely open orders in a rush. The inner join
  // scopes to counter sessions; no expires_at filter — an open cart IS the liveness signal (the
  // 11am-phone-order-for-4pm case must stay visible its whole day).
  const { data: carts, error: cartErr } = await db
    .from("qr_carts")
    .select(
      "id,session_id,customer_name,created_at,qr_cart_items(qty,unit_price_cents,state,comped),table_sessions!inner(qr_code,mode,status)",
    )
    .eq("status", "open")
    .eq("table_sessions.mode", "pickup")
    .eq("table_sessions.status", "active")
    // Counter-style orders: staff-minted (`reg-`, W6a) and kiosk-minted (`kiosk-`, W6b) both pay
    // at this counter — one queue.
    .or(`qr_code.like.${REG_PREFIX}%,qr_code.like.kiosk-%`, { referencedTable: "table_sessions" })
    .order("created_at", { ascending: true })
    .limit(40);
  if (cartErr) return { ok: false, reason: "outage" };

  const rows: RegisterQueueRow[] = (carts ?? []).map((cart) => {
    const lines = (cart.qr_cart_items ?? []).filter((l) => l.state !== "voided" && !l.comped);
    return {
      sessionId: cart.session_id,
      source: cart.table_sessions.qr_code.startsWith("kiosk-")
        ? ("kiosk" as const)
        : ("register" as const),
      customerName: cart.customer_name ?? null,
      itemCount: lines.reduce((n, l) => n + l.qty, 0),
      // Display-only running subtotal for the queue card — the charge is always getCartTotals at settle.
      subtotalCents: lines.reduce((n, l) => n + l.qty * l.unit_price_cents, 0),
      startedAt: cart.created_at,
    };
  });
  return { ok: true, rows };
}

export type DayCashResult =
  | { ok: true; summary: DaySummary; sinceIso: string }
  | { ok: false; reason: "outage" | "forbidden" };

/** The Z-report-lite (W6a): today's orders bucketed by tender, LA-day window. MANAGER-gated — a
 *  drawer figure is money truth, same floor as the refunds surface. Read-only; the pure bucketing
 *  lives in register-math (mutation-tested). */
export async function getDayCashSummary(): Promise<DayCashResult> {
  const gate = await staffGate("manager");
  if (!gate.ok) {
    // staffGate collapses "not signed in / not manager" and outage into copy — for a read surface
    // we only need the two-way split: an outage renders the register's outage note, anything else
    // simply hides the manager zone.
    return { ok: false, reason: gate.error === STAFF_WRITE_OUTAGE ? "outage" : "forbidden" };
  }
  const db = serviceClient();
  const sinceIso = laDayStartIso(new Date());
  // Page explicitly: PostgREST truncates at its max-rows (default 1000) with error still null, and a
  // silently-truncated drawer figure is exactly the lie this surface exists to prevent. Ordered pages
  // until a short page; statuses the buckets ignore are filtered server-side so they don't burn rows.
  const rows: {
    tender: string;
    total_cents: number;
    status: string;
    tip_cents: number | null;
  }[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("qr_orders")
      .select("tender,total_cents,status,tip_cents")
      .gte("created_at", sinceIso)
      .in("status", ["paid", "refunded"])
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) return { ok: false, reason: "outage" };
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) break;
  }
  return { ok: true, summary: summarizeDay(rows), sinceIso };
}

/**
 * W17c-4 — the day's tips, for the team (owner's selected set: "tip transparency for the team").
 *
 * Role rule: a SERVER sees only their own line; a manager or owner sees everyone's. Enforced here,
 * not in the page — this is a read of what colleagues earned, and the console's UI gating is
 * cosmetic. The shared (unattributed) bucket is visible to everyone, because it belongs to everyone.
 *
 * Scoped to the current LA calendar day, the same window the Z-report uses, so "today" means the
 * same thing on both screens.
 */
export type TipReportResult =
  | {
      ok: true;
      report: TipReport;
      /** staff.user_id → display name, for the ids in THIS report only. Resolved here because
       *  `listStaff` is owner-only and this screen is for everyone; a server's report contains only
       *  their own id anyway, so no one learns a name from a row they can't see. */
      names: Record<string, string>;
      sinceIso: string;
      scope: "self" | "all";
    }
  | { ok: false; error: string };

export async function getDayTips(): Promise<TipReportResult> {
  const gate = await staffGate();
  if (!gate.ok) return { ok: false, error: gate.error };
  const caller = gate.caller;
  const seesEveryone = roleAtLeast(caller.role, "manager");

  const sinceIso = laDayStartIso(new Date());
  const db = serviceClient();
  let q = db
    .from("qr_orders")
    .select("settled_by,tip_cents,status,tender")
    .gte("created_at", sinceIso);
  // The scope is a PREDICATE, not a filter applied after reading: a server's request never pulls a
  // colleague's row into this process at all.
  if (!seesEveryone) q = q.eq("settled_by", caller.staffId);
  const { data, error } = await q;
  // A failed read is unknowable, never "you were tipped nothing" — the worst false verdict on a
  // screen whose whole job is telling someone what they earned.
  if (error) {
    console.error("[register] getDayTips failed", error.message);
    return { ok: false, error: STAFF_WRITE_OUTAGE };
  }
  const report = summarizeTips(data ?? []);

  // Names for exactly the ids that survived the summary — never the whole roster.
  const names: Record<string, string> = {};
  const ids = report.attributed.map((a) => a.staffId);
  if (ids.length > 0) {
    const { data: staff, error: staffError } = await db
      .from("staff")
      .select("user_id,display_name")
      .in("user_id", ids);
    // A failed name lookup is NOT a failed report: the money is the point, and an id is a worse
    // label than a name but an honest one. Logged, then fallen back on below.
    if (staffError) console.error("[register] getDayTips names failed", staffError.message);
    for (const row of staff ?? []) names[row.user_id] = row.display_name;
  }

  return { ok: true, report, names, sinceIso, scope: seesEveryone ? "all" : "self" };
}
