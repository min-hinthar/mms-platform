import type { TrackedOrder } from "./track-order";

/**
 * PD3 — the pickup page's three decisions, pure, so a VALUE falsifies each (the second blind pass on
 * #330: they lived inline in OrderTracker, where deleting either arm left every suite green).
 *
 *  - `orderOnScreen`: which tracked row the page shows. A live row that is not stale is the truth. A
 *    STALE live row (the session lapsed: a read succeeded and found nothing) yields only to a snapshot
 *    that is strictly FURTHER ALONG, so the page can never move backwards — the critical the pass
 *    found: an older snapshot replaced a live Ready, the ticket fell back from the code to the time,
 *    and the live region re-announced the earlier stage.
 *  - `pickupPageShown`: the pickup page is for a PAID pickup only; a pending or failed row keeps the
 *    tracker's existing arms.
 *  - `pickupFootPromised`: "This page catches up whenever you come back to it." is said only while
 *    the page can still read the order.
 */

/** How far an order has visibly progressed, compared lexicographically: a refund, then the bag's
 *  stage, then the guest's arrival, then the cents refunded. Every later fact ranks higher. */
function progress(o: TrackedOrder): number[] {
  const bag =
    o.togoStatus === "picked_up"
      ? 3
      : o.togoStatus === "ready"
        ? 2
        : o.togoStatus === "preparing"
          ? 1
          : 0;
  return [o.status === "refunded" ? 1 : 0, bag, o.arrivedAt ? 1 : 0, o.refund.refundedCents];
}

/** Is `a` strictly further along than `b`? */
function furtherAlong(a: TrackedOrder, b: TrackedOrder): boolean {
  const pa = progress(a);
  const pb = progress(b);
  for (let i = 0; i < pa.length; i++) {
    if (pa[i]! !== pb[i]!) return pa[i]! > pb[i]!;
  }
  return false;
}

export function orderOnScreen(input: {
  live: TrackedOrder | null;
  liveStale: boolean;
  snapshot: TrackedOrder | null;
}): TrackedOrder | null {
  const { live, liveStale, snapshot } = input;
  if (!live) return snapshot;
  if (liveStale && snapshot && furtherAlong(snapshot, live)) return snapshot;
  return live;
}

export function pickupPageShown(input: {
  order: TrackedOrder | null;
  settleCanceled: boolean;
  pureGrocery: boolean;
}): boolean {
  const { order, settleCanceled, pureGrocery } = input;
  return (
    order !== null &&
    order.status === "paid" &&
    !!order.pickupSlot &&
    !settleCanceled &&
    !pureGrocery
  );
}

/** Withdrawn only once the live row is gone (stale) AND the snapshot read answered a decided no
 *  (`not_found` / `share_payer`); a collected order's foot (where the receipt lives) always holds. */
export function pickupFootPromised(input: {
  liveStale: boolean;
  snapshotRefused: boolean;
  pickedUp: boolean;
}): boolean {
  const { liveStale, snapshotRefused, pickedUp } = input;
  return pickedUp || !(liveStale && snapshotRefused);
}
