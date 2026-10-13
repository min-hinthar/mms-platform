import { describe, it, expect } from "vitest";
import {
  ACTIVE_ORDER_TTL_MS,
  activeOrderExpiresAt,
  liveOrderStatusWord,
  kindFromTrackedOrder,
  liveOrderModeLabel,
  liveOrdersMoving,
  liveOrderTrackHref,
  liveWithoutSession,
  sameActiveOrder,
  staleOrderFate,
  uncollectedPickupHref,
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
      expect(
        liveOrderStatusWord({ kind: "grocery", togoStatus, hasTogoFood: false, fired: true }),
      ).toBe("Ready to go");
    }
  });

  it("still says 'Picked up' for a COLLECTED basket — terminal outranks the grocery framing", () => {
    // Adversarial review of #198: the grocery short-circuit used to run first, so the picked_up case
    // was unreachable for the one kind /track was already showing it for. A basket that has been
    // collected has been collected — "Ready to go" would be the stale word, not the honest one.
    expect(
      liveOrderStatusWord({
        kind: "grocery",
        togoStatus: "picked_up",
        hasTogoFood: false,
        fired: true,
      }),
    ).toBe("Picked up");
  });

  it("reads dine-in neutrally — a dine-in order has no bagging signal, ever", () => {
    expect(
      liveOrderStatusWord({ kind: "dinein", togoStatus: null, hasTogoFood: false, fired: true }),
    ).toBe("At your table");
  });

  it("lets a to-go box on a dine-in order win the word (the shipped tie rule)", () => {
    // hasDineInFood decides the KIND, but once the expo starts bagging, the bagging word is the
    // useful one — a diner with a box being made should not read "At your table" about it.
    const box = { kind: "dinein" as const, hasTogoFood: true, fired: true };
    expect(liveOrderStatusWord({ ...box, togoStatus: "preparing" })).toBe("Preparing");
    expect(liveOrderStatusWord({ ...box, togoStatus: "ready" })).toBe("Ready");
  });

  it("a HELD scheduled pickup reads 'Scheduled', never 'Preparing' (M65) — and Ready is never gated", () => {
    // `togo_status = 'preparing'` lands at payment; only `fire_at` says whether the wok has it.
    // MUTATION: `o.fired ? "Preparing" : "Scheduled"` → `"Preparing"` — the noon-paid 6 PM pickup
    // reads "Preparing" in the chip, the tray and /track for six hours.
    const pickup = { kind: "pickup" as const, hasTogoFood: true };
    expect(liveOrderStatusWord({ ...pickup, togoStatus: "preparing", fired: false })).toBe(
      "Scheduled",
    );
    expect(liveOrderStatusWord({ ...pickup, togoStatus: "preparing", fired: true })).toBe(
      "Preparing",
    );
    expect(liveOrderStatusWord({ ...pickup, togoStatus: "ready", fired: false })).toBe(
      "Ready for pickup",
    );
  });

  it("does NOT let a seated diner's GROCERIES read as kitchen progress", () => {
    // Both reviewers on #198 found this independently. `mms_init_togo_status` stamps 'preparing' for
    // `fulfillment in ('togo','grocery')`, so a dine-in order carrying self-scanned groceries and NO
    // to-go box sets the same column — and reading it raw told a seated diner their shopping was
    // being prepared, then ready. `hasTogoFood` is the predicate that separates a kitchen bag from an
    // exit-pass check. This fixture is the one that separates them: kind dinein, grocery-only
    // takeaway, a non-null togo_status.
    const seatedWithGroceries = { kind: "dinein" as const, hasTogoFood: false, fired: true };
    expect(liveOrderStatusWord({ ...seatedWithGroceries, togoStatus: "preparing" })).toBe(
      "At your table",
    );
    expect(liveOrderStatusWord({ ...seatedWithGroceries, togoStatus: "ready" })).toBe(
      "At your table",
    );
  });

  it("distinguishes pickup from to-go only when the bag is ready", () => {
    expect(
      liveOrderStatusWord({ kind: "pickup", togoStatus: "ready", hasTogoFood: true, fired: true }),
    ).toBe("Ready for pickup");
    expect(
      liveOrderStatusWord({ kind: "togo", togoStatus: "ready", hasTogoFood: true, fired: true }),
    ).toBe("Ready");
  });

  it("says 'Order received' — not 'Preparing' — before the kitchen has touched it", () => {
    expect(
      liveOrderStatusWord({ kind: "togo", togoStatus: null, hasTogoFood: true, fired: true }),
    ).toBe("Order received");
    expect(
      liveOrderStatusWord({ kind: "pickup", togoStatus: null, hasTogoFood: true, fired: true }),
    ).toBe("Order received");
  });

  it("is TOTAL over the column's CHECK — picked_up included, so /track can share it", () => {
    // qr_orders.togo_status is CHECK (null or in ('preparing','ready','picked_up')).
    expect(
      liveOrderStatusWord({
        kind: "togo",
        togoStatus: "picked_up",
        hasTogoFood: true,
        fired: true,
      }),
    ).toBe("Picked up");
    expect(
      liveOrderStatusWord({
        kind: "pickup",
        togoStatus: "picked_up",
        hasTogoFood: true,
        fired: true,
      }),
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
      "/track?payment_intent=pi_abc&redirect_status=succeeded&resume=1&cart=cart-1",
    );
  });

  it("⚠️ marks every single-pay link as a RESUME, not an arrival", () => {
    // The link wears Stripe's return shape because that is what resolves the tracker — so `resume=1`
    // is the ONLY thing telling /track this tap is someone checking on an order rather than arriving
    // from a payment. Drop it and every chip tap replays the arrival celebration (confetti, the
    // celebrate haptic, "Payment confirmed", the pay chime) over money that moved hours ago.
    expect(liveOrderTrackHref({ paymentIntent: "pi_abc", cartId: "cart-1" })).toContain("resume=1");
    expect(liveOrderTrackHref({ paymentIntent: "pi_abc", cartId: null })).toContain("resume=1");
  });

  it("falls back to the split-tender shape when there is no PaymentIntent — still a RESUME", () => {
    // A split order has no PI anywhere in any URL — cart+paid is its ONLY route back to /track.
    // Lifecycle audit (2026-10-13), I — and /track treats a bare `?cart=…&paid=1` as the counter's or
    // the split's own ARRIVAL, so this branch needs the marker too. RED when it is dropped: every
    // resume of a counter-paid table replays "Paid — thank you!" and re-captures the order.
    expect(liveOrderTrackHref({ paymentIntent: null, cartId: "cart-2" })).toBe(
      "/track?cart=cart-2&paid=1&resume=1",
    );
  });
});

describe("the device's order pointer (lifecycle audit, 2026-10-13)", () => {
  const H = 60 * 60 * 1000;
  const T0 = Date.parse("2026-10-13T18:00:00.000Z"); // 11 AM in Covina

  it("E — a pickup is remembered until its SLOT plus the linger, never less than four hours", () => {
    expect(activeOrderExpiresAt({ createdAt: T0 })).toBe(T0 + ACTIVE_ORDER_TTL_MS);
    // Paid at 11 AM for 6:20 PM: the pointer outlives the 3 PM capture-TTL. RED when the slot is ignored.
    const slot = "2026-10-14T01:20:00.000Z";
    expect(activeOrderExpiresAt({ createdAt: T0, pickupSlot: slot })).toBe(
      Date.parse(slot) + ACTIVE_ORDER_TTL_MS,
    );
    // A slot already past at the capture never SHORTENS the TTL; an unreadable slot is no slot.
    expect(
      activeOrderExpiresAt({ createdAt: T0, pickupSlot: new Date(T0 - H).toISOString() }),
    ).toBe(T0 + ACTIVE_ORDER_TTL_MS);
    expect(activeOrderExpiresAt({ createdAt: T0, pickupSlot: "not a date" })).toBe(
      T0 + ACTIVE_ORDER_TTL_MS,
    );
  });

  it("I — a resume is the SAME order only on its own key", () => {
    const pi = { paymentIntent: "pi_1", cartId: "c1" };
    expect(sameActiveOrder(pi, { paymentIntent: "pi_1", cartId: null })).toBe(true);
    expect(sameActiveOrder(pi, { paymentIntent: "pi_2", cartId: "c1" })).toBe(false);
    const split = { paymentIntent: null, cartId: "c2" };
    expect(sameActiveOrder(split, { paymentIntent: null, cartId: "c2" })).toBe(true);
    expect(sameActiveOrder(split, { paymentIntent: null, cartId: "c3" })).toBe(false);
    expect(sameActiveOrder(split, { paymentIntent: "pi_9", cartId: "c2" })).toBe(false);
    expect(sameActiveOrder(null, { paymentIntent: "pi_1", cartId: null })).toBe(false);
    expect(
      sameActiveOrder({ paymentIntent: null, cartId: null }, { paymentIntent: null, cartId: null }),
    ).toBe(false);
  });

  it("F — a stale DINE-IN order is finished (its session closing is the meal's end); others unknown", () => {
    // RED when every kind reads "unknown": the pill says "At your table" for the rest of the TTL.
    expect(staleOrderFate("dinein")).toBe("finished");
    for (const k of ["pickup", "togo", "grocery", null] as const)
      expect(staleOrderFate(k)).toBe("unknown");
  });

  it("E — only a PICKUP still to collect (slot today or later) stands without a live session", () => {
    const todayStart = "2026-10-13T07:00:00.000Z"; // midnight in Covina (PDT)
    const later = "2026-10-14T01:20:00.000Z";
    expect(liveWithoutSession({ kind: "pickup", pickupSlot: later }, todayStart)).toBe(true);
    // Earlier TODAY (a late pickup) still counts; yesterday's does not.
    expect(
      liveWithoutSession({ kind: "pickup", pickupSlot: "2026-10-13T08:00:00.000Z" }, todayStart),
    ).toBe(true);
    expect(
      liveWithoutSession({ kind: "pickup", pickupSlot: "2026-10-13T06:59:00.000Z" }, todayStart),
    ).toBe(false);
    // RED when the kind check goes: a dine-in's session closing IS its end.
    for (const kind of ["dinein", "togo", "grocery"] as const)
      expect(liveWithoutSession({ kind, pickupSlot: later }, todayStart)).toBe(false);
    expect(liveWithoutSession({ kind: "pickup", pickupSlot: null }, todayStart)).toBe(false);
  });

  it("E — a history row links to /track only for a pickup still to collect", () => {
    const todayStart = "2026-10-13T07:00:00.000Z";
    const base = {
      pickupSlot: "2026-10-14T01:20:00.000Z",
      togoStatus: "preparing" as string | null,
      refundedInFull: false,
      paymentIntent: "pi_1" as string | null,
      cartId: "c1" as string | null,
    };
    expect(uncollectedPickupHref(base, todayStart)).toBe(
      "/track?payment_intent=pi_1&redirect_status=succeeded&resume=1&cart=c1",
    );
    expect(uncollectedPickupHref({ ...base, togoStatus: "picked_up" }, todayStart)).toBeNull();
    expect(uncollectedPickupHref({ ...base, refundedInFull: true }, todayStart)).toBeNull();
    expect(
      uncollectedPickupHref({ ...base, pickupSlot: "2026-10-12T01:20:00.000Z" }, todayStart),
    ).toBeNull();
    expect(uncollectedPickupHref({ ...base, pickupSlot: null }, todayStart)).toBeNull();
    expect(
      uncollectedPickupHref({ ...base, paymentIntent: null, cartId: null }, todayStart),
    ).toBeNull();
  });

  it("J — /account re-polls only while a to-go bag is still moving", () => {
    expect(liveOrdersMoving([{ hasTogoFood: true, togoStatus: "preparing" }])).toBe(true);
    expect(liveOrdersMoving([{ hasTogoFood: true, togoStatus: null }])).toBe(true);
    // RED when a Ready bag, a dine-in "At your table" or a grocery basket keep the poll alive.
    expect(liveOrdersMoving([{ hasTogoFood: true, togoStatus: "ready" }])).toBe(false);
    expect(liveOrdersMoving([{ hasTogoFood: false, togoStatus: "preparing" }])).toBe(false);
    expect(liveOrdersMoving([])).toBe(false);
  });
});
