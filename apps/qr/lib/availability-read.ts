import { serviceClient } from "@mms/db/server";
import { foodMenuIds, pickUnavailable, type UnavailableLine } from "./availability";

/**
 * W23a — the two reads behind the charge-boundary availability gate. Thin on purpose: every rule
 * lives in the pure `./availability`, which is where the test and the `verify:slice` mutants can
 * reach it. This file is plumbing.
 *
 * Deliberately FAIL-OPEN on a transport failure: an unreadable cart or catalog returns "nothing is
 * unavailable" and the charge proceeds. Same direction the pickup soft-cap chose, for the same
 * reason — an outage in a SECONDARY check must never block a diner paying for an order that is very
 * probably fine. Being wrong costs one refund; failing closed costs every diner at the Pay button on
 * every catalog blip. The `console.error` is what makes the swallow deliberate rather than silent.
 */
export async function unavailableLineNames(cartId: string): Promise<string[]> {
  const r = await unavailableLines(cartId);
  // The gate's documented FAIL-OPEN: an unreadable catalog lets the charge proceed. Being wrong
  // costs one refund; failing closed blocks every diner at the Pay button on every blip.
  return r.ok ? r.lines.map((u) => u.name) : [];
}

/** Either the verdict, or an honest admission that the catalog could not be read. */
export type AvailabilityRead = { ok: true; lines: UnavailableLine[] } | { ok: false };

/**
 * W23c — the same read, returning the OUTCOME rather than a bare list, and keeping the ids.
 *
 * ⚠️ M72 — it now has ONE caller, and the note that used to sit here was rewritten rather than left
 * to rot. It read "two callers, two correct answers to the same failure": the pre-mint gate fails
 * OPEN (a secondary check must not block every diner on a catalog blip), while the manual-capture
 * path failed CLOSED, because there "I could not read the catalog" resolving to "everything is
 * available" captures the full hold for a basket the kitchen cannot make.
 *
 * That second caller is gone. `mms_settle_precheck_and_void` now derives the unsellable set itself,
 * inside the statement that voids — so the capture path never reads the catalog app-side, and there
 * is no second read there to fail. The fail-CLOSED requirement did not go away; it moved into the
 * RPC, where an unreadable catalog is simply an error and the caller retries.
 *
 * So the `{ ok: false }` arm survives with only `unavailableLineNames` above it, which converts it
 * to the documented fail-OPEN. Keeping the outcome shape is still right — collapsing it would bake
 * the fail-open into the type and leave the next caller no way to choose — but it is now a
 * capability rather than a live requirement, and a reader should not infer a fail-closed consumer
 * that no longer exists.
 *
 * The underlying rule is unchanged and is the delivery repo's, one process boundary out: a failure
 * must never read as empty.
 */
export async function unavailableLines(cartId: string): Promise<AvailabilityRead> {
  const db = serviceClient();
  const { data: lines, error: linesErr } = await db
    .from("qr_cart_items")
    .select("menu_item_id,name,state,fulfillment")
    .eq("cart_id", cartId);
  if (linesErr || !lines) {
    console.error("[availability] cart read failed", linesErr?.message);
    return { ok: false };
  }
  const ids = foodMenuIds(lines);
  if (ids.length === 0) return { ok: true, lines: [] };

  const { data: items, error: itemsErr } = await db
    .from("menu_items")
    .select("id,name_en,is_sold_out,is_active")
    .in("id", ids);
  if (itemsErr || !items) {
    console.error("[availability] catalog read failed", itemsErr?.message);
    return { ok: false };
  }
  return { ok: true, lines: pickUnavailable(lines, items) };
}
