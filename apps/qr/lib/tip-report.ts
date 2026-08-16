// W17c-4 — tip transparency for the team, pure (owner's selected set: "tip transparency for the
// team"). No I/O; mutation-tested via verify:slice. Every value is integer CENTS.
//
// THE HONEST CONSTRAINT, which shapes the whole thing: only some tips can be attributed to a person.
// `qr_orders.settled_by` is stamped when a STAFF member takes the money (a cash settle, a counter
// reader tap). When a guest pays on their own phone it is null — nobody handed anything to anyone,
// so there is no one to credit. That is not missing data to be filled in with a guess; it is a real
// distinction between "you were tipped this" and "the shift was tipped this".
//
// So this reports two buckets and never blends them. It computes no averages, no projections, and no
// per-head splits: how a shared pool gets divided is a decision the owner makes, and a number this
// module invented would look exactly like a number they had agreed to.

export type TipOrderRow = {
  /** staff.user_id when a staff member settled it; null when the guest paid on their own phone. */
  settled_by: string | null;
  tip_cents: number | null;
  status: string;
  tender: string;
};

export type AttributedTips = {
  staffId: string;
  tipCents: number;
  /** Orders that actually carried a tip — not every order this person settled. */
  orderCount: number;
};

export type TipReport = {
  /** Per-person, highest first, then by id so the order is stable across reloads. */
  attributed: AttributedTips[];
  /** Tips on orders no staff member settled — the guest paid on their phone. Shared, not anyone's. */
  unattributedCents: number;
  unattributedCount: number;
  /** attributed + unattributed. The one figure that answers "what did we take in tips today". */
  totalCents: number;
};

/**
 * Bucket a day's orders into what a person was tipped and what the shift was tipped.
 *
 * Only `status='paid'` counts. A refunded order's money is not in the drawer and its tip is not in
 * anyone's pocket — the same rule the Z-report follows, for the same reason. A zero tip contributes
 * nothing and is not counted as a tipped order, so "3 orders" means three guests actually tipped.
 */
export function summarizeTips(rows: TipOrderRow[]): TipReport {
  const byStaff = new Map<string, AttributedTips>();
  let unattributedCents = 0;
  let unattributedCount = 0;

  for (const r of rows) {
    if (r.status !== "paid") continue;
    const tip = r.tip_cents ?? 0;
    if (tip <= 0) continue;
    if (r.settled_by) {
      const row = byStaff.get(r.settled_by) ?? {
        staffId: r.settled_by,
        tipCents: 0,
        orderCount: 0,
      };
      row.tipCents += tip;
      row.orderCount += 1;
      byStaff.set(r.settled_by, row);
    } else {
      unattributedCents += tip;
      unattributedCount += 1;
    }
  }

  const attributed = [...byStaff.values()].sort(
    (a, b) => b.tipCents - a.tipCents || a.staffId.localeCompare(b.staffId),
  );
  const attributedCents = attributed.reduce((a, r) => a + r.tipCents, 0);
  return {
    attributed,
    unattributedCents,
    unattributedCount,
    totalCents: attributedCents + unattributedCents,
  };
}
