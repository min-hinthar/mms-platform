"use server";
import { cookies } from "next/headers";
import { serverClient, serviceClient } from "@mms/db/server";
import { kioskOpenInput, kioskResetInput } from "@mms/db/schemas";
import { authorizeDevice } from "./device-auth";
import { CART_LOCK_TTL_MS, SETTLE_TTL_MS } from "./lock-ttl";
import { generateJoinCode } from "./session-code";

/**
 * The self-serve kiosk's server layer (W6b — S5). The device token IS the authority (the /board
 * pattern): no staff session exists on a lobby kiosk, and the ordinary diner mint is deliberately
 * bypassed (its rate budgets key on one anon seat, and a kiosk must never trust a client-asserted
 * session code). The kiosk client holds sessionId/cartId in MEMORY only — no localStorage — so the
 * privacy story is: abandon = `kioskReset` (close + cancel), handoff = screen-clear only (the
 * order's home becomes the register queue / floor board for the counter settle).
 *
 * The minted session carries a `session_members` row for the kiosk device's anon uid — that is what
 * lets the whole DINER cart machinery (`addItem`, `scanAdd`, `getCartView`, `assertCartMember`,
 * RLS) run verbatim on a kiosk order. Pricing stays server-authoritative end to end.
 */

const KIOSK_PREFIX = "kiosk-";
/** Counter-style kiosk sessions share the register's abandoned-order horizon (W6a). */
const KIOSK_SESSION_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * The device gate now lives in `lib/device-auth.ts`, shared with `/api/board`: the two surfaces had
 * hand-copied constant-time token checks, and both gained a second credential at once (a staff
 * sign-in — owner, 2026-08-21). The token is still checked FIRST and still refuses the same way, so
 * an already-bookmarked kiosk behaves exactly as before; the staff session is purely additive, and a
 * failed AUTH read now surfaces as `unavailable` rather than being flattened into `denied`.
 */

export type OpenKioskResult =
  | { ok: true; sessionId: string; cartId: string }
  | {
      ok: false;
      reason:
        | "not_configured"
        | "denied"
        | "unavailable"
        | "no_auth"
        | "table"
        | "occupied"
        | "error";
    };

export async function openKioskOrder(raw: unknown): Promise<OpenKioskResult> {
  const parsed = kioskOpenInput.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "error" };
  const { k, kind, tableNumber, customerName } = parsed.data;
  const gate = await authorizeDevice("kiosk", k);
  if (!gate.ok) return { ok: false, reason: gate.reason };

  // The seat: the kiosk device's own anon Supabase session (AnonAuthGate minted it). Verified
  // server-side — the membership row below is what authorizes every later cart write.
  const {
    data: { user },
  } = await serverClient(await cookies()).auth.getUser();
  if (!user) return { ok: false, reason: "no_auth" };
  const db = serviceClient();

  let sessionTable: number | null = null;
  if (kind === "dinein") {
    if (tableNumber == null) return { ok: false, reason: "table" };
    const { data: reg, error: regErr } = await db
      .from("qr_tables")
      .select("table_number")
      .eq("table_number", tableNumber)
      .maybeSingle();
    if (regErr) return { ok: false, reason: "error" };
    if (!reg) return { ok: false, reason: "table" };
    // Occupancy by TABLE NUMBER across every active session (sticker-coded or kiosk-coded) — a
    // kiosk claim must never open a second live cart over a seated party's order.
    const { data: occupied, error: occErr } = await db
      .from("table_sessions")
      .select("id")
      .eq("table_number", tableNumber)
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .limit(1)
      .maybeSingle();
    if (occErr) return { ok: false, reason: "error" };
    if (occupied) return { ok: false, reason: "occupied" };
    sessionTable = tableNumber;
  }

  for (let attempt = 0; attempt < 6; attempt++) {
    const code = `${KIOSK_PREFIX}${generateJoinCode()}`;
    const { data: sess, error } = await db
      .from("table_sessions")
      .insert({
        qr_code: code,
        mode: kind === "dinein" ? "dinein" : "pickup",
        // The kiosk uid hosts its own single-member session (host powers over its own lines).
        host_seat: user.id,
        table_number: sessionTable,
        // Counter-style orders share the register's 12h abandoned horizon; a dine-in claim keeps
        // the standard table TTL (staff clear at turnover like any table).
        ...(kind === "dinein"
          ? {}
          : { expires_at: new Date(Date.now() + KIOSK_SESSION_TTL_MS).toISOString() }),
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") continue; // active-code collision → fresh code
      return { ok: false, reason: "error" };
    }

    // Membership is the authorization for every diner-path cart write this order will make.
    const { error: memErr } = await db
      .from("session_members")
      .insert({ session_id: sess.id, seat_id: user.id, display_name: "Kiosk", role: "host" });
    if (memErr && memErr.code !== "23505") {
      await db.from("table_sessions").update({ status: "closed" }).eq("id", sess.id);
      return { ok: false, reason: "error" };
    }

    const { data: cart, error: cartErr } = await db
      .from("qr_carts")
      .insert({ session_id: sess.id, customer_name: customerName?.trim() || null })
      .select("id")
      .single();
    if (cartErr || !cart) {
      // Close the orphan best-effort so it never squats on the active set.
      await db.from("table_sessions").update({ status: "closed" }).eq("id", sess.id);
      return { ok: false, reason: "error" };
    }
    return { ok: true, sessionId: sess.id, cartId: cart.id };
  }
  return { ok: false, reason: "error" };
}

export type KioskResetResult =
  | { ok: true }
  /** `frozen` = the register owns this order now (settle in flight or already settled) — the reset
   *  correctly stood down; the client's only remaining job is the screen-clear. `gone` = not an
   *  active kiosk session (already reset, or not ours to touch). */
  | { ok: false; reason: "denied" | "unavailable" | "gone" | "frozen" | "error" };

/** The ABANDON reset (idle mid-order): cancel the open cart, then close the session. Scoped in
 *  every statement to `kiosk-`-prefixed sessions — the device token is not a skeleton key over
 *  diner or staff tables. NEVER called after handoff: a handed-off order's home is the
 *  register/floor and the settle (or staff clear) owns its lifecycle. */
export async function kioskReset(raw: unknown): Promise<KioskResetResult> {
  const parsed = kioskResetInput.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "denied" };
  const { k, sessionId } = parsed.data;
  const gate = await authorizeDevice("kiosk", k);
  // Pass `unavailable` THROUGH rather than flattening it to `denied`. The reset runs detached from
  // the idle timer and from "start over", and its caller only retries `error`-shaped outcomes — so a
  // transient auth blip reported as `denied` leaves the cart live and, for a dine-in kiosk order,
  // the table reported occupied until the session TTL expires (Codex round 1, P2).
  if (!gate.ok)
    return { ok: false, reason: gate.reason === "unavailable" ? "unavailable" : "denied" };
  const db = serviceClient();

  // Scope first, in the READ's predicate: a non-kiosk session id matches nothing and NOTHING is
  // written below (the cart cancel keys on this session id, so it inherits the scope — qr_code is
  // immutable, so the read can't go stale between here and the writes).
  const { data: sess, error: sessErr } = await db
    .from("table_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("status", "active")
    .like("qr_code", `${KIOSK_PREFIX}%`)
    .maybeSingle();
  if (sessErr) return { ok: false, reason: "error" };
  if (!sess) return { ok: false, reason: "gone" };

  // Cancel the cart FIRST, and only when the register isn't moving money on it: the counter-settle
  // freeze (settle_at, held by settleCash's acquireSettlement before totals are derived) and the
  // pay-window lock live in the UPDATE's own predicate, so an idle reset racing a settle loses the
  // row atomically — it matches zero and stands down. A cart already settled (status 'paid')
  // matches zero too: from that moment the order's lifecycle belongs to the register, and a settled
  // kiosk DINE-IN session must stay active (its KDS ticket dies with the session).
  const lockCutoff = new Date(Date.now() - CART_LOCK_TTL_MS).toISOString();
  const settleCutoff = new Date(Date.now() - SETTLE_TTL_MS).toISOString();
  const { data: cancelled, error: cartErr } = await db
    .from("qr_carts")
    .update({ status: "cancelled" })
    .eq("session_id", sessionId)
    .eq("status", "open")
    .or(`locked.eq.false,locked_at.lt.${lockCutoff}`)
    .or(`settle_at.is.null,settle_at.lt.${settleCutoff}`)
    .select("id");
  if (cartErr) return { ok: false, reason: "error" };
  if (!cancelled || cancelled.length === 0) return { ok: false, reason: "frozen" };

  // Close the session only after its cart is provably dead. The scope predicates repeat in the
  // destructive statement itself (defense in depth over the read above).
  const { data: closed, error } = await db
    .from("table_sessions")
    .update({ status: "closed" })
    .eq("id", sessionId)
    .eq("status", "active")
    .like("qr_code", `${KIOSK_PREFIX}%`) // re-asserted in the write, not only the read
    .select("id");
  if (error || !closed || closed.length === 0) {
    // The cart is cancelled but the session survived — it squats on the active set until the TTL /
    // staff clear. Loud, because a dine-in claim keeps its table blocked until then.
    console.error("[kiosk] reset session close failed after cart cancel", { sessionId });
    return { ok: false, reason: "error" };
  }
  return { ok: true };
}
