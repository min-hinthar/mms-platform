import "server-only";
import { serviceClient } from "@mms/db/server";

/**
 * Resolve the open cart for a session (the table's live order) — shared by every staff settle path
 * (cash · secure-tab · Terminal). Returns null when the session is closed or has no open cart
 * (already settled/cancelled). W10b: `unavailable` marks a FAILED read — callers refuse with the
 * outage truth instead of a false "table is closed / nothing to settle".
 *
 * Lives in a server-only module (NOT a "use server" file): exporting it from an action module would
 * mint an unauthenticated public POST endpoint around a service-role read.
 */
export async function openCartFor(sessionId: string) {
  const db = serviceClient();
  const { data: session, error: sessionError } = await db
    .from("table_sessions")
    .select("id,status,mode,qr_code")
    .eq("id", sessionId)
    .maybeSingle();
  if (sessionError) return { session: null, cart: null, unavailable: true as const };
  if (!session || session.status === "closed")
    return { session: null, cart: null, unavailable: false as const };
  const { data: cart, error: cartError } = await db
    .from("qr_carts")
    // `promo_code` / `promo_granted_cents` are here for P3's staff remove, which answers "nothing to
    // clear" without writing (see `clearPromoForTable`). Two more columns on a row every settle path
    // already reads beats a second round trip on the one path that needs them.
    .select("id,locked,locked_at,settle_at,tab_type,promo_code,promo_granted_cents")
    .eq("session_id", sessionId)
    .eq("status", "open")
    .maybeSingle();
  if (cartError) return { session: null, cart: null, unavailable: true as const };
  return { session, cart, unavailable: false as const };
}

/**
 * W6a's counter-lifecycle rule, shared (W6c): a COUNTER-style session (`reg-`, or `kiosk-` in
 * pickup mode) is one order — settled means finished, so close it or it squats in the active set
 * (and the register queue) for the rest of its 12h TTL. A TABLE session stays active (the table is
 * still seated; kiosk dine-in keeps its KDS ticket). Best-effort: a miss only means the session
 * ages out on its own expiry. Callers run this out of band (`after()`).
 */
export async function closeCounterStyleSession(sessionId: string): Promise<void> {
  const db = serviceClient();
  try {
    const { data: session, error: readErr } = await db
      .from("table_sessions")
      .select("id,qr_code,mode,status")
      .eq("id", sessionId)
      .maybeSingle();
    if (readErr || !session) {
      if (readErr)
        console.error("[counter-session] close read failed", {
          sessionId,
          message: readErr.message,
        });
      return;
    }
    const counterStyle =
      session.qr_code.startsWith("reg-") ||
      (session.qr_code.startsWith("kiosk-") && session.mode === "pickup");
    if (!counterStyle || session.status !== "active") return;
    const { error: closeErr } = await db
      .from("table_sessions")
      .update({ status: "closed" })
      .eq("id", sessionId)
      .eq("status", "active");
    if (closeErr)
      console.error("[counter-session] close failed", { sessionId, message: closeErr.message });
  } catch (e) {
    console.error("[counter-session] close threw", { sessionId, error: e });
  }
}
