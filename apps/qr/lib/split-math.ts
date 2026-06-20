// Isomorphic split-the-bill math (M3·P3.3a) — pure, no I/O, no secrets — so the UI computes shares
// OPTIMISTICALLY (instant, no layout shift) from the server-authoritative inputs it already has
// (the grand total from getCartTotals + the cart lines + members), and the server (lib/split.ts) uses
// the SAME functions so display and any future server derivation can't drift. Integer cents only.

export type SeatShare = { seat: string; name: string; shareCents: number };

/** A seat's server-derived BASE breakdown (no tip — tip is a per-payer pay-step choice). Σ of each
 *  component across seats equals the cart's grand component to the cent, so the single order the shares
 *  sum to is a faithful snapshot (P3.3b). `baseCents` = subtotal − discount + service + tax. */
export type ShareBreakdown = {
  seat: string;
  subtotalCents: number;
  discountCents: number;
  serviceChargeCents: number;
  taxCents: number;
  baseCents: number;
};

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

/**
 * Server-authoritative per-seat BASE breakdown for real split-tender (M3·P3.3b). Unlike computeShares
 * (which allocates the single grand total for an optimistic DISPLAY), this allocates EACH component
 * with the correct weight so the parts are individually faithful — the fix the LEARNINGS flag for when
 * money actually moves per card:
 *   • subtotal → even: equal; by-person: each seat's assigned-line subtotal (unassigned lines spread
 *     evenly so nothing is dropped).
 *   • discount → pro-rata to each seat's allocated subtotal (a $0-subtotal seat gets $0 discount).
 *   • service → pro-rata to each seat's NET (subtotal − discount).
 *   • tax → each seat's own TAXABLE base (by-person), NOT a pro-rata of the aggregate — so a seat
 *     owning only tax-exempt lines isn't over-charged tax. Even mode: equal.
 * Every component is largest-remainder so it sums EXACTLY to the cart's grand component; therefore
 * Σ baseCents == the cart total (no tip). Tip is added per payer at their pay step. Pure (no I/O).
 */
export function deriveShareBreakdowns(
  grand: {
    subtotalCents: number;
    discountCents: number;
    serviceChargeCents: number;
    taxCents: number;
  },
  seats: { seat: string }[],
  lines: { bySeat: string | null; qty: number; unitPriceCents: number; taxCents: number }[],
  mode: "even" | "by_person",
): ShareBreakdown[] {
  const n = seats.length;
  if (n === 0) return [];
  const idx = new Map(seats.map((s, i) => [s.seat, i]));
  const ownedSub = Array.from({ length: n }, () => 0);
  const ownedTax = Array.from({ length: n }, () => 0);
  let unassignedSub = 0;
  let unassignedTax = 0;
  for (const l of lines) {
    const amt = l.unitPriceCents * l.qty;
    const taxable = l.taxCents > 0 ? amt : 0; // a taxable line carries tax_cents > 0
    const i = l.bySeat == null ? undefined : idx.get(l.bySeat);
    if (i === undefined) {
      unassignedSub += amt;
      unassignedTax += taxable;
    } else {
      ownedSub[i] = (ownedSub[i] ?? 0) + amt;
      ownedTax[i] = (ownedTax[i] ?? 0) + taxable;
    }
  }
  const even = mode === "even";
  // Unassigned lines spread evenly across seats so by-person never drops a line's cost.
  const subWeights = even
    ? seats.map(() => 1)
    : seats.map((_, i) => (ownedSub[i] ?? 0) + unassignedSub / n);
  const taxWeights = even
    ? seats.map(() => 1)
    : seats.map((_, i) => (ownedTax[i] ?? 0) + unassignedTax / n);

  const subtotal = allocate(grand.subtotalCents, subWeights);
  const discount = allocate(grand.discountCents, subtotal); // pro-rata to allocated subtotal
  const net = subtotal.map((s, i) => s - (discount[i] ?? 0));
  const service = allocate(grand.serviceChargeCents, net); // pro-rata to net
  const tax = allocate(grand.taxCents, taxWeights);

  return seats.map((s, i) => {
    const sub = subtotal[i] ?? 0;
    const disc = discount[i] ?? 0;
    const svc = service[i] ?? 0;
    const tx = tax[i] ?? 0;
    return {
      seat: s.seat,
      subtotalCents: sub,
      discountCents: disc,
      serviceChargeCents: svc,
      taxCents: tx,
      baseCents: sub - disc + svc + tx,
    };
  });
}
