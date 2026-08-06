"use server";
import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { serverClient, serviceClient } from "@mms/db/server";
import { kioskOpenInput, kioskResetInput } from "@mms/db/schemas";
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

type KioskGate = { ok: true } | { ok: false; reason: "not_configured" | "denied" };

/** Constant-time device-token check. Unset token = the kiosk feature is OFF (503-style refusal),
 *  never a crash — the /board opt-in semantics. */
function kioskGate(k: string): KioskGate {
  const expected = process.env.KIOSK_DEVICE_TOKEN;
  if (!expected) return { ok: false, reason: "not_configured" };
  const a = Buffer.from(k);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, reason: "denied" };
  return { ok: true };
}

export type OpenKioskResult =
  | { ok: true; sessionId: string; cartId: string }
  | { ok: false; reason: "not_configured" | "denied" | "no_auth" | "table" | "occupied" | "error" };

export async function openKioskOrder(raw: unknown): Promise<OpenKioskResult> {
  const parsed = kioskOpenInput.safeParse(raw);
  if (!parsed.success) return { ok: false, reason: "error" };
  const { k, kind, tableNumber, customerName } = parsed.data;
  const gate = kioskGate(k);
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

export type KioskResetResult = { ok: true } | { ok: false };

/** The ABANDON reset (idle mid-order): close the session + cancel its open cart. Scoped in the
 *  statement to `kiosk-`-prefixed sessions — the device token is not a skeleton key over diner or
 *  staff tables. NEVER called after handoff: a handed-off order's home is the register/floor and
 *  the settle (or staff clear) owns its lifecycle. */
export async function kioskReset(raw: unknown): Promise<KioskResetResult> {
  const parsed = kioskResetInput.safeParse(raw);
  if (!parsed.success) return { ok: false };
  const { k, sessionId } = parsed.data;
  const gate = kioskGate(k);
  if (!gate.ok) return { ok: false };
  const db = serviceClient();

  // The prefix guard lives in the UPDATE's predicate, not just a prior read (the status-guard-in-
  // the-statement rule): a non-kiosk session id simply matches zero rows.
  const { data: closed, error } = await db
    .from("table_sessions")
    .update({ status: "closed" })
    .eq("id", sessionId)
    .eq("status", "active")
    .like("qr_code", `${KIOSK_PREFIX}%`)
    .select("id");
  if (error) return { ok: false };
  if (!closed || closed.length === 0) return { ok: false };

  // Cancel the abandoned open cart (the clearTable shape). Best-effort: a missed cancel leaves an
  // open cart on a CLOSED session — unreachable to every surface, aged out by the sweeper.
  const { error: cartErr } = await db
    .from("qr_carts")
    .update({ status: "cancelled" })
    .eq("session_id", sessionId)
    .eq("status", "open");
  if (cartErr)
    console.error("[kiosk] reset cart cancel failed", { sessionId, code: cartErr.code });
  return { ok: true };
}
