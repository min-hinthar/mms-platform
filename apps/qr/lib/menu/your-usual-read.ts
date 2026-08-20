import "server-only";
import { cookies } from "next/headers";
import { serverClient, serviceClient } from "@mms/db/server";
import {
  USUAL_WINDOW_DAYS,
  yourUsual,
  type UsualCandidate,
  type UsualOutcome,
  type UsualRow,
} from "./your-usual";

/**
 * W22e — the read behind "your usual". The RULES live in `your-usual.ts`; this file only fetches.
 *
 * Split for the same reason `dropped-read.ts` is split from `dropped-view.ts`: `server-only` breaks
 * the node vitest runner, so anything importing it is untestable. Everything that DECIDES is next
 * door and covered; this side is a query and a degradation path.
 *
 * ── Privacy, by construction ─────────────────────────────────────────────────────────────────────
 * This reads ONE diner's paid history, so the scoping is the whole safety argument:
 *
 *  - NOT a Server Action — an internal server module, so it cannot be POSTed with someone else's id.
 *  - The uid comes from `supa.auth.getUser()` (SSR-verified), never from an argument. There is no
 *    parameter a caller could use to ask about another diner; that is deliberate and should stay
 *    true — the moment this takes a uid, it becomes an endpoint for reading strangers' habits.
 *  - The service-role client is needed because order rows are RLS-scoped and this aggregates across
 *    several, but the query is pinned to `earned_by = uid` and the only thing that LEAVES is a menu
 *    item id and a name the diner can already see on the menu. No amounts, no order ids, no dates.
 *  - `getUser()`, never `getSession()`. `getSession` decodes the auth cookie WITHOUT verifying it
 *    against GoTrue, so a tampered cookie would hand an arbitrary uid straight into an RLS-bypassing
 *    service-role query. The whole safety argument rests on this one call, and the test pins it.
 *
 * ── Degradation ─────────────────────────────────────────────────────────────────────────────────
 * The whole body is inside try/catch, including `serviceClient()` itself, which throws on a missing
 * or rotated key. This is a decorative recognition card on the highest-traffic page in the app: a
 * config gap must degrade to "no card", never to a 500 on the menu. Same rule `mostLoved` states.
 *
 * verify:slice-exempt — `server-only` cannot be imported by `apps/qr`'s node vitest, so no mutant can
 * run against this file; every rule that CAN be tested was deliberately put in `your-usual.ts` next
 * door, which carries four. What is left here is a query, and its one security-critical line — pinning
 * the read to the caller's own uid — is guarded as TEXT instead: `your-usual.test.ts` reads this file
 * with `readFileSync` and asserts the scoping, which needs no import and therefore works.
 */

/** Strict canonical uuid — the same discriminator `mostLoved` uses to tell a menu dish from a
 *  grocery barcode line (`menu_item_id` is a soft text ref that holds both). */
const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** One diner's 90 days is small; this is a generous ceiling, not a working limit. If it were ever
 *  hit, the ordering below decides which rows survive. (The parent IS ordered here: postgrest's
 *  `referencedTable` ordering reaches the parent only because the embed is `!inner`, which it is.) */
const ROW_CAP = 400;

export async function getYourUsual(catalog: UsualCandidate[]): Promise<UsualOutcome> {
  try {
    const supa = serverClient(await cookies());
    const {
      data: { user },
    } = await supa.auth.getUser();
    if (!user) return { state: "none" };

    const db = serviceClient();
    const since = new Date(Date.now() - USUAL_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await db
      .from("qr_order_items")
      .select(
        "menu_item_id,order_id,fulfillment,refunded_cents,qr_orders!inner(status,created_at,earned_by)",
      )
      // `earned_by` is the uid that PAID. Cash and staff-closed orders have no earner, so they never
      // appear here.
      .eq("qr_orders.earned_by", user.id)
      // ⚠️ NOT the same as "what you ordered", which an earlier version of this comment claimed.
      // `qr_order_items` carries NO seat (`by_seat` lives on the cart and is dropped at fulfillment),
      // so on a dine-in table the host who pays owns every guest's dish in this data. Two such visits
      // and the card would name a dish they never ordered — and hand a stranger's diet, religion or
      // allergy back to them as their own taste. To-go and pickup have no such ambiguity: the payer
      // chose the food. So the ATTRIBUTABLE half is what counts, and dine-in waits for a migration
      // that snapshots the seat (registry M87).
      .neq("fulfillment", "dinein")
      // A fully refunded order flips `status` to 'refunded' and is excluded by the filter below — but
      // W23b is explicit that status STAYS 'paid' for a PARTIAL refund, so a dish sent back twice
      // would otherwise become a "usual". `refunded_cents` is the only signal that a line came back.
      .eq("refunded_cents", 0)
      .eq("qr_orders.status", "paid")
      .gte("qr_orders.created_at", since)
      .order("created_at", { ascending: false, referencedTable: "qr_orders" })
      .limit(ROW_CAP);
    if (error) {
      console.error("[your-usual] history read failed", error.message);
      return { state: "none" };
    }

    const rows: UsualRow[] = [];
    for (const r of data ?? []) {
      const id = r.menu_item_id;
      // Belt for the two filters above: a shape change that drops either `.eq`/`.neq` from the query
      // still cannot produce a dine-in or refunded row here.
      if (r.fulfillment === "dinein" || (r.refunded_cents ?? 0) > 0) continue;
      // Grocery barcode lines are not menu dishes and cannot be re-added from the menu card.
      if (!id || !uuidRe.test(id) || !r.order_id) continue;
      const at = r.qr_orders?.created_at;
      if (!at) continue;
      rows.push({ menuItemId: id, orderId: r.order_id, orderedAt: at });
    }
    return yourUsual(rows, catalog);
  } catch {
    // Deliberate swallow — see the header. A decorative card must never take the menu down.
    return { state: "none" };
  }
}
