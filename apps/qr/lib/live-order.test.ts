import { describe, it, expect } from "vitest";
import {
  liveOrderStatusWord,
  kindFromTrackedOrder,
  liveOrderModeLabel,
  liveOrderTrackHref,
  type LiveOrderKind,
} from "./live-order";

/**
 * W22b — `live-order.ts` is the ONE derivation behind every live-status word the diner sees: the header
 * chip, the orders tray, /account "Today" and (from W22b) /track's status chip. It had no coverage at
 * all, which is why `check-money-coverage` blocks on the first edit — an unguarded file under
 * `apps/qr/lib/` can change what a diner is told about their own order with nothing to notice.
 *
 * The two rules worth pinning are the ones the header pill got WRONG before W22b, both because it
 * re-derived the word itself instead of calling this:
 *   • a pure GROCERY basket is self-scanned and already in the diner's hands at payment, yet the DB
 *     stamps `togo_status='preparing'` on it (mms_init_togo_status fires on fulfillment in
 *     ('togo','grocery')). Reading the raw column says "Preparing" about food nobody is cooking.
 *   • a DINE-IN order carries `togo_status = null` forever, so a raw read falls to a takeaway word.
 */
describe("liveOrderStatusWord", () => {
  it("never lets a grocery basket claim a kitchen state — the DB stamps it 'preparing' at payment", () => {
    // Every NON-terminal togo_status the column can hold, including the one the webhook writes.
    for (const togoStatus of [null, "preparing", "ready"]) {
      expect(liveOrderStatusWord({ kind: "grocery", togoStatus, hasTogoFood: false })).toBe(
        "Ready to go",
      );
    }
  });

  it("still says 'Picked up' for a COLLECTED basket — terminal outranks the grocery framing", () => {
    // Adversarial review of #198: the grocery short-circuit used to run first, so the picked_up case
    // was unreachable for the one kind /track was already showing it for. A basket that has been
    // collected has been collected — "Ready to go" would be the stale word, not the honest one.
    expect(
      liveOrderStatusWord({ kind: "grocery", togoStatus: "picked_up", hasTogoFood: false }),
    ).toBe("Picked up");
  });

  it("reads dine-in neutrally — a dine-in order has no bagging signal, ever", () => {
    expect(liveOrderStatusWord({ kind: "dinein", togoStatus: null, hasTogoFood: false })).toBe(
      "At your table",
    );
  });

  it("lets a to-go box on a dine-in order win the word (the shipped tie rule)", () => {
    // hasDineInFood decides the KIND, but once the expo starts bagging, the bagging word is the
    // useful one — a diner with a box being made should not read "At your table" about it.
    const box = { kind: "dinein" as const, hasTogoFood: true };
    expect(liveOrderStatusWord({ ...box, togoStatus: "preparing" })).toBe("Preparing");
    expect(liveOrderStatusWord({ ...box, togoStatus: "ready" })).toBe("Ready");
  });

  it("does NOT let a seated diner's GROCERIES read as kitchen progress", () => {
    // Both reviewers on #198 found this independently. `mms_init_togo_status` stamps 'preparing' for
    // `fulfillment in ('togo','grocery')`, so a dine-in order carrying self-scanned groceries and NO
    // to-go box sets the same column — and reading it raw told a seated diner their shopping was
    // being prepared, then ready. `hasTogoFood` is the predicate that separates a kitchen bag from an
    // exit-pass check. This fixture is the one that separates them: kind dinein, grocery-only
    // takeaway, a non-null togo_status.
    const seatedWithGroceries = { kind: "dinein" as const, hasTogoFood: false };
    expect(liveOrderStatusWord({ ...seatedWithGroceries, togoStatus: "preparing" })).toBe(
      "At your table",
    );
    expect(liveOrderStatusWord({ ...seatedWithGroceries, togoStatus: "ready" })).toBe(
      "At your table",
    );
  });

  it("distinguishes pickup from to-go only when the bag is ready", () => {
    expect(liveOrderStatusWord({ kind: "pickup", togoStatus: "ready", hasTogoFood: true })).toBe(
      "Ready for pickup",
    );
    expect(liveOrderStatusWord({ kind: "togo", togoStatus: "ready", hasTogoFood: true })).toBe(
      "Ready",
    );
  });

  it("says 'Order received' — not 'Preparing' — before the kitchen has touched it", () => {
    expect(liveOrderStatusWord({ kind: "togo", togoStatus: null, hasTogoFood: true })).toBe(
      "Order received",
    );
    expect(liveOrderStatusWord({ kind: "pickup", togoStatus: null, hasTogoFood: true })).toBe(
      "Order received",
    );
  });

  it("is TOTAL over the column's CHECK — picked_up included, so /track can share it", () => {
    // qr_orders.togo_status is CHECK (null or in ('preparing','ready','picked_up')).
    expect(liveOrderStatusWord({ kind: "togo", togoStatus: "picked_up", hasTogoFood: true })).toBe(
      "Picked up",
    );
    expect(
      liveOrderStatusWord({ kind: "pickup", togoStatus: "picked_up", hasTogoFood: true }),
    ).toBe("Picked up");
  });
});

describe("kindFromTrackedOrder", () => {
  // A fixture that SEPARATES every rung of the ladder: each case differs from the next by exactly the
  // field that rung tests, so a mutant that drops one rung cannot be caught by another rung's case.
  const base = { hasDineInFood: false, pickupSlot: null as string | null, hasTogoFood: false };

  it("puts dine-in FIRST — even when a pickup slot and a to-go box are also present", () => {
    // The separating fixture: all three signals true at once. If the dinein rung is dropped, this
    // falls through to "pickup" and the case goes red. A dine-in-only fixture could NOT tell the
    // difference between "dinein wins" and "dinein is checked last".
    expect(
      kindFromTrackedOrder({
        hasDineInFood: true,
        pickupSlot: "2026-08-17T18:00:00Z",
        hasTogoFood: true,
      }),
    ).toBe("dinein");
  });

  it("puts a pickup slot ahead of to-go food", () => {
    expect(
      kindFromTrackedOrder({ ...base, pickupSlot: "2026-08-17T18:00:00Z", hasTogoFood: true }),
    ).toBe("pickup");
  });

  it("calls it to-go when there is to-go food and no slot", () => {
    expect(kindFromTrackedOrder({ ...base, hasTogoFood: true })).toBe("togo");
  });

  it("falls through to grocery only when nothing else matched", () => {
    expect(kindFromTrackedOrder(base)).toBe("grocery");
  });

  it("agrees with the server read's precedence on the same shape", () => {
    // lib/orders.ts getMyLiveOrders builds `kind` with the identical ladder. This asserts the two
    // cannot drift apart on the case that distinguishes them: dine-in + pickup slot together.
    const both = { hasDineInFood: true, pickupSlot: "2026-08-17T18:00:00Z", hasTogoFood: false };
    expect(kindFromTrackedOrder(both)).toBe("dinein");
  });
});

describe("the derivations that ride the kind", () => {
  it("labels every kind", () => {
    const kinds: LiveOrderKind[] = ["dinein", "pickup", "togo", "grocery"];
    expect(kinds.map(liveOrderModeLabel)).toEqual(["Dine-in", "Pickup", "To-go", "Grocery"]);
  });

  it("builds the single-pay /track link from the PaymentIntent, carrying the cart when present", () => {
    expect(liveOrderTrackHref({ paymentIntent: "pi_abc", cartId: "cart-1" })).toBe(
      "/track?payment_intent=pi_abc&redirect_status=succeeded&cart=cart-1",
    );
  });

  it("falls back to the split-tender shape when there is no PaymentIntent", () => {
    // A split order has no PI anywhere in any URL — cart+paid is its ONLY route back to /track.
    expect(liveOrderTrackHref({ paymentIntent: null, cartId: "cart-2" })).toBe(
      "/track?cart=cart-2&paid=1",
    );
  });
});
