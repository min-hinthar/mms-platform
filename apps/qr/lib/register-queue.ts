import type { serviceClient } from "@mms/db/server";
import { queueEmptiness } from "./queue-window";

/**
 * A4·2 — the open COUNTER orders, read in ONE place.
 *
 * The register page used to own this read (`getRegisterQueue`, W6a) and the floor deliberately
 * excluded the same sessions (`lib/floor.ts`, the `reg-` / `kiosk-`+pickup filters) so the two
 * lists could not double-count a session. With the register folded into the counter's one screen
 * the floor's own snapshot carries these rows beside the tables — same poll, same outage posture —
 * and this module is the query both callers share, so the predicate cannot drift between them.
 * Plain module (no "use server"): the floor read and the Server Action both import it.
 */
type Db = ReturnType<typeof serviceClient>;

/** The prefix a staff-minted counter session's code carries (`reg-<code>`, W6a). */
export const REG_PREFIX = "reg-";

/**
 * A teahouse has a handful of open counter orders; bound the read regardless. A FULL page is
 * reported (`truncated`) rather than passed off as the whole queue — the oldest-first order means a
 * saturated read hides exactly the newest order, the one just started.
 */
export const REGISTER_QUEUE_CAP = 40;

/** One open counter order (a register queue row). */
export type RegisterQueueRow = {
  sessionId: string;
  customerName: string | null;
  itemCount: number;
  subtotalCents: number;
  startedAt: string;
  /** W6b: where the order was entered — the card badges kiosk orders. */
  source: "register" | "kiosk";
};

export type RegisterQueue =
  | { ok: true; rows: RegisterQueueRow[]; truncated: boolean }
  | { ok: false; reason: "outage" };

/**
 * The open counter orders: `reg-` (staff-minted) and `kiosk-` (self-minted) PICKUP sessions with an
 * open cart, oldest first. OPEN CARTS first (the W6a review's confirmed HIGH): a limit applied to
 * ACTIVE SESSIONS is consumed by settled-but-not-yet-expired ones, hiding genuinely open orders in
 * a rush. The inner join scopes to counter sessions; no `expires_at` filter — an open cart IS the
 * liveness signal (the 11am-phone-order-for-4pm case must stay visible its whole day).
 */
export async function readRegisterQueue(db: Db): Promise<RegisterQueue> {
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
    .limit(REGISTER_QUEUE_CAP);
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
      // Display-only running subtotal for the card — the charge is always getCartTotals at settle.
      subtotalCents: lines.reduce((n, l) => n + l.qty * l.unit_price_cents, 0),
      startedAt: cart.created_at,
    };
  });
  const truncated = queueEmptiness(rows.length, REGISTER_QUEUE_CAP) === "cannot-say";
  if (truncated)
    console.warn(
      "[register-queue] counter queue read saturated — the newest orders are not shown",
      {
        cap: REGISTER_QUEUE_CAP,
      },
    );
  return { ok: true, rows, truncated };
}
