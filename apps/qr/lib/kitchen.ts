"use server";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { serviceClient } from "@mms/db/server";
import { bumpLineInput, staffFireInput } from "@mms/db/schemas";
import { requireStaff } from "./staff";
import { getPostHogClient } from "./posthog-server";
import type { KitchenLine, KitchenQueue, KitchenTicket } from "./kitchen-types";

/**
 * The KDS — kitchen display (S2.1b). Read-only fire queue + the cook's bump, plus a staff-side "send to
 * kitchen". Server Actions are public POSTs (IDOR by default), so EVERY export re-checks requireStaff()
 * and acts via the service-role client — the client UI is the affordance, never the gate (parity with
 * lib/floor.ts). The queue is intentionally cross-table (the kitchen sees the whole room), which is
 * exactly why the staff gate lives here and not on RLS rows.
 *
 * ONE unified fire timer (S2_DESIGN spine #3): the queue is the single read
 * `state IN ('fired','in_progress') AND fire_at <= now()`. S4.2 routes by the per-line fulfillment tag —
 * dine-in fires now (the batch send), to-go fires at checkout / "make it now", grocery never fires — so
 * the queue is the kitchen subset for free. Lines on a paid cart still show (to-go fired at checkout)
 * until the cook bumps them served. Pickup/scango keep their separate M2 order-level scheduled fire
 * (no kitchen actor yet). Bump reuses mms_line_transition (legal-edge graph, atomic, cart-open guarded).
 */

const QUEUE_LINE_CAP = 500; // a teahouse kitchen has tens of live lines; bound the read regardless.

/**
 * The live fire queue, grouped into per-table tickets. Three bounded reads (fired lines → their open
 * dine-in carts → those sessions' labels), assembled in TS — a fixed round-trip count regardless of
 * volume. Only lines whose fire_at has PASSED appear (the S2.2 undo-grace window keeps a just-sent line
 * out of the kitchen until its grace expires). Ordered oldest-first so the kitchen works head-down.
 */
export async function getKitchenQueue(): Promise<KitchenQueue> {
  await requireStaff();
  const db = serviceClient();
  // S2-audit S3: the grace cutoff is the DB clock (mms_now), not the Next process clock — a skew between
  // the app instance and Postgres must not let the KDS surface a line the DB still considers undoable.
  const { data: dbNow } = await db.rpc("mms_now");
  const nowIso = dbNow ?? new Date().toISOString(); // app-clock fallback only if the rpc fails

  // Live kitchen lines: fired/in_progress AND actually due (fire_at <= now — past any undo grace).
  const { data: lines } = await db
    .from("qr_cart_items")
    .select("id,name,qty,modifiers,state,fire_at,cart_id,fulfillment")
    .in("state", ["fired", "in_progress"])
    .lte("fire_at", nowIso)
    .order("fire_at", { ascending: true })
    .limit(QUEUE_LINE_CAP);
  if (!lines || lines.length === 0) return { tickets: [], serverNow: nowIso };

  // Resolve each line's table via its cart → active dine-in session. S4.2: carts in ('open','paid') —
  // a to-go line fired at checkout lives on the just-PAID cart, so an open-only filter would hide paid-for
  // to-go food from the cook. 'cancelled' is excluded (a cleared table); the line-state gate (fired/
  // in_progress) keeps served/voided off, so only live, not-yet-bumped kitchen work shows.
  const cartIds = [...new Set(lines.map((l) => l.cart_id))];
  const { data: carts } = await db
    .from("qr_carts")
    .select("id,session_id,status")
    .in("id", cartIds)
    .in("status", ["open", "paid"]);
  const sessionByCart = new Map((carts ?? []).map((c) => [c.id, c.session_id]));
  const sessionIds = [...new Set([...sessionByCart.values()])];
  if (sessionIds.length === 0) return { tickets: [], serverNow: nowIso };

  const { data: sessions } = await db
    .from("table_sessions")
    .select("id,qr_code,mode,status")
    .in("id", sessionIds)
    .eq("status", "active")
    .eq("mode", "dinein");
  const labelBySession = new Map((sessions ?? []).map((s) => [s.id, s.qr_code]));

  // Assemble tickets, preserving the oldest-first line order (lines is already sorted by fire_at).
  const ticketBySession = new Map<string, KitchenTicket>();
  for (const l of lines) {
    const sessionId = sessionByCart.get(l.cart_id);
    if (!sessionId) continue; // line's cart is cancelled/cleared — not a live kitchen line
    const label = labelBySession.get(sessionId);
    if (label === undefined) continue; // session not an active dine-in table — skip
    const line: KitchenLine = {
      id: l.id,
      name: l.name,
      qty: l.qty,
      modifiers: Array.isArray(l.modifiers) ? (l.modifiers as string[]) : [],
      state: l.state === "in_progress" ? "in_progress" : "fired",
      firedAt: l.fire_at ?? nowIso,
      // S4.2: only dinein + fired togo ever reach the kitchen (grocery never fires). The badge tells the
      // cook/expo where a line goes; 'grocery' is defensive (it can't be here) but typed for completeness.
      fulfillment: (l.fulfillment ?? "dinein") as KitchenLine["fulfillment"],
    };
    const existing = ticketBySession.get(sessionId);
    if (existing) existing.lines.push(line);
    else
      ticketBySession.set(sessionId, {
        sessionId,
        label,
        lines: [line],
        firedAt: line.firedAt, // first (oldest) line's fire time = the ticket's age
      });
  }

  const tickets = [...ticketBySession.values()].sort(
    (a, b) => new Date(a.firedAt).getTime() - new Date(b.firedAt).getTime(),
  );
  return { tickets, serverNow: nowIso };
}

export type KitchenActionResult = { ok: true } | { ok: false; error: string };

/**
 * Bump a fired line along its kitchen life: 'in_progress' (Start) or 'served' (Ready). The legal-edge
 * graph + atomicity + parent-cart-'open' guard all live in mms_line_transition (S2.1a) — a 0-row return
 * means the line already moved, the cart closed, or the edge is illegal (e.g. a stale tap on a line a
 * teammate already served), which we surface as a benign "already updated" rather than an error.
 */
export async function bumpLine(raw: unknown): Promise<KitchenActionResult> {
  const caller = await requireStaff().catch(() => null);
  if (!caller) return { ok: false, error: "Staff sign-in required." };
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

  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    after(async () => {
      try {
        const ph = getPostHogClient();
        ph.capture({
          distinctId: `staff:${caller.staffId}`,
          event: "kds_bump_line",
          properties: { role: caller.role, to },
        });
        await ph.flush();
      } catch {
        /* analytics best-effort — never fail a bump on a capture error */
      }
    });
  }
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
  const caller = await requireStaff().catch(() => null);
  if (!caller) return { ok: false, error: "Staff sign-in required." };
  const parsed = staffFireInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { sessionId } = parsed.data;

  const db = serviceClient();
  const { data: cart } = await db
    .from("qr_carts")
    .select("id")
    .eq("session_id", sessionId)
    .eq("status", "open")
    .maybeSingle();
  if (!cart) return { ok: false, error: "This table has no open order." };

  const { data: fired, error } = await db.rpc("mms_fire_cart", { p_cart_id: cart.id });
  if (error) {
    console.error("[kitchen] mms_fire_cart failed", { sessionId, message: error.message });
    return { ok: false, error: "Couldn’t send that order. Try again." };
  }
  if (!fired) return { ok: false, error: "Nothing new to send — it’s all in the kitchen already." };

  if (process.env.NEXT_PUBLIC_POSTHOG_KEY) {
    after(async () => {
      try {
        const ph = getPostHogClient();
        ph.capture({
          distinctId: `staff:${caller.staffId}`,
          event: "staff_fire_cart",
          properties: { role: caller.role, sessionId, lines: fired },
        });
        await ph.flush();
      } catch {
        /* analytics best-effort */
      }
    });
  }
  revalidatePath("/staff/kitchen");
  revalidatePath(`/staff/table/${sessionId}`);
  return { ok: true };
}
