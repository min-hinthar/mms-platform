// Isomorphic split-the-bill math (M3·P3.3a) — pure, no I/O, no secrets — so the UI computes shares
// OPTIMISTICALLY (instant, no layout shift) from the server-authoritative inputs it already has
// (the grand total from getCartTotals + the cart lines + members), and the server (lib/split.ts) uses
// the SAME functions so display and any future server derivation can't drift. Integer cents only.

export type SeatShare = { seat: string; name: string; shareCents: number };

/**
 * Largest-remainder allocation of `total` cents across `weights`, so the result sums EXACTLY to total
 * (QA §D: shares reconcile to the cent). Leftover pennies go to the largest fractional part
 * (deterministic; ties → lower index). All-zero weights (unassigned by-person, or a $0 cart) fall
 * back to an even split.
 */
export function allocate(total: number, weights: number[]): number[] {
  const n = weights.length;
  if (n === 0) return [];
  const sumW = weights.reduce((a, b) => a + b, 0);
  const w = sumW === 0 ? weights.map(() => 1) : weights;
  const wsum = sumW === 0 ? n : sumW;

  const exact = w.map((x) => (total * x) / wsum);
  const out = exact.map((x) => Math.floor(x));
  let leftover = total - out.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; leftover > 0 && k < n; k++, leftover--) {
    const idx = order[k]!.i;
    out[idx] = (out[idx] ?? 0) + 1;
  }
  return out;
}

/**
 * Per-seat shares of `totalCents` for the chosen mode:
 *   • even      → equal weights.
 *   • by_person → weight each seat by the subtotal of the lines assigned to them (`bySeat`); the
 *                 table-level promo/service/tax already baked into `totalCents` ride along pro-rata.
 *                 A line with an unknown/absent owner folds to the first seat so nothing is dropped.
 * Always reconciles to `totalCents`.
 */
export function computeShares(
  totalCents: number,
  members: { seat: string; name: string }[],
  lines: { bySeat: string | null; qty: number; unitPriceCents: number }[],
  mode: "even" | "by_person",
): SeatShare[] {
  if (members.length === 0) return [];
  let weights: number[];
  if (mode === "even") {
    weights = members.map(() => 1);
  } else {
    const sub = new Map<string, number>(members.map((m) => [m.seat, 0]));
    const fallback = members[0]!.seat;
    for (const l of lines) {
      const owner = l.bySeat && sub.has(l.bySeat) ? l.bySeat : fallback;
      sub.set(owner, (sub.get(owner) ?? 0) + l.unitPriceCents * l.qty);
    }
    weights = members.map((m) => sub.get(m.seat) ?? 0);
  }
  const shares = allocate(totalCents, weights);
  return members.map((m, i) => ({ seat: m.seat, name: m.name, shareCents: shares[i] ?? 0 }));
}
