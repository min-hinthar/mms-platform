"use server";
import { serviceClient } from "@mms/db/server";
import { cartSplitInput, cartViewInput } from "@mms/db/schemas";
import { assertCartMember } from "./authz";
import { getCartTotals } from "./totals";

export type SeatShare = { seat: string; name: string; shareCents: number };

export type SplitContext = {
  mode: string;
  mySeat: string;
  myRole: "host" | "guest";
  members: { seat: string; name: string; role: "host" | "guest" }[];
};

/**
 * Group context the /cart split UI needs (M3·P3.3a): the session mode (the split shows for dine-in
 * groups only), the viewer's seat + role (drives canMutateLine in the UI), and the table's members
 * (the people a line can be assigned to + whose shares to show). Member-gated.
 */
export async function getSplitContext(cartId: string): Promise<SplitContext> {
  const { cartId: id } = cartViewInput.parse({ cartId });
  const { sessionId, uid, role } = await assertCartMember(id);
  const db = serviceClient();
  const { data: sess } = await db
    .from("table_sessions")
    .select("mode")
    .eq("id", sessionId)
    .maybeSingle();
  const { data: members } = await db
    .from("session_members")
    .select("seat_id,display_name,role,created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  return {
    mode: sess?.mode ?? "dinein",
    mySeat: uid,
    myRole: role,
    members: (members ?? []).map((m) => ({
      seat: m.seat_id,
      name: m.display_name,
      role: m.role === "host" ? "host" : "guest",
    })),
  };
}

/**
 * Server-authoritative per-seat shares for the dine-in split (M3·P3.3a). The grand total comes from
 * getCartTotals (promo + service + tax; tip is a per-payer pay-step choice added in 3.3b), and is
 * allocated across the table's seats so the shares **reconcile to the cent** (Σ shares == total — QA §D):
 *   • even      → equal weights.
 *   • by_person → each seat's weight = the subtotal of the lines assigned to them (by_seat); table-level
 *                 promo/service/tax ride along pro-rata. A line with an unknown/absent owner falls to the
 *                 first seat so nothing is dropped.
 * Largest-remainder allocation assigns leftover pennies deterministically (largest fractional part, ties
 * to the lower index) — never over/under-collect. Member-gated (not an IDOR read).
 */
export async function getCartSplit(
  cartId: string,
  mode: "even" | "by_person",
): Promise<SeatShare[]> {
  const input = cartSplitInput.parse({ cartId, mode });
  const { sessionId } = await assertCartMember(input.cartId);
  const db = serviceClient();

  const { data: memberRows } = await db
    .from("session_members")
    .select("seat_id,display_name,created_at")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  const seats = (memberRows ?? []).map((m) => ({ seat: m.seat_id, name: m.display_name }));
  if (seats.length === 0) return [];

  const total = (await getCartTotals(input.cartId)).totalCents;

  let weights: number[];
  if (input.mode === "even") {
    weights = seats.map(() => 1);
  } else {
    const sub = new Map<string, number>(seats.map((s) => [s.seat, 0]));
    const { data: lines } = await db
      .from("qr_cart_items")
      .select("by_seat,qty,unit_price_cents")
      .eq("cart_id", input.cartId);
    const fallback = seats[0]!.seat;
    for (const l of lines ?? []) {
      const owner = l.by_seat && sub.has(l.by_seat) ? l.by_seat : fallback;
      sub.set(owner, (sub.get(owner) ?? 0) + l.unit_price_cents * l.qty);
    }
    weights = seats.map((s) => sub.get(s.seat) ?? 0);
  }

  const shares = allocate(total, weights);
  return seats.map((s, i) => ({ seat: s.seat, name: s.name, shareCents: shares[i] ?? 0 }));
}

/**
 * Largest-remainder allocation of `total` cents across `weights`, so the result sums EXACTLY to total.
 * All-zero weights (e.g. an as-yet-unassigned by-person split, or a $0 cart) fall back to an even split.
 */
function allocate(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const sumW = weights.reduce((a, b) => a + b, 0);
  const w = sumW === 0 ? weights.map(() => 1) : weights;
  const wsum = sumW === 0 ? n : sumW;

  const exact = w.map((x) => (total * x) / wsum);
  const out = exact.map((x) => Math.floor(x));
  let leftover = total - out.reduce((a, b) => a + b, 0);
  // Hand each leftover penny to the largest fractional part (deterministic; ties → lower index).
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; leftover > 0 && k < n; k++, leftover--) {
    const idx = order[k]!.i;
    out[idx] = (out[idx] ?? 0) + 1;
  }
  return out;
}
