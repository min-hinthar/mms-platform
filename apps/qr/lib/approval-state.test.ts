import { describe, expect, it } from "vitest";
import { lineChangedSinceRequest, requestCardState } from "./approval-state";

/**
 * PD8 · M184 — what a request card IS, derived from the cart's status and the line as it stands now.
 * The snapshot is the request's own `qty` / `amount_cents`; the card's state decides which keys it
 * offers (Approve · Deny · Close it), so each arm is a value here and a mutant in verify:slice. The
 * SQL (`mms_resolve_approval`, M184) decides the same question at the write — this is the affordance.
 */
const snap = { qty: 1, amountCents: 1400 };

describe("lineChangedSinceRequest — the M184 compare", () => {
  it("the same qty at the same price: unchanged", () => {
    expect(lineChangedSinceRequest(snap, { qty: 1, unitPriceCents: 1400 })).toBe(false);
  });
  it("a qty step after asking: changed (the $12 comp that took $36 off)", () => {
    expect(lineChangedSinceRequest(snap, { qty: 2, unitPriceCents: 1400 })).toBe(true);
  });
  it("a re-price at the same qty: changed — the amount, not only the count, is compared", () => {
    expect(lineChangedSinceRequest(snap, { qty: 1, unitPriceCents: 1600 })).toBe(true);
  });
  it("a qty and price that happen to multiply back to the snapshot is NOT the line that was asked about", () => {
    // 2 × $7.00 = $14.00: the amount agrees, the qty does not — changed.
    expect(lineChangedSinceRequest(snap, { qty: 2, unitPriceCents: 700 })).toBe(true);
  });
  it("a line that is gone: changed", () => {
    expect(lineChangedSinceRequest(snap, null)).toBe(true);
  });
});

describe("requestCardState — open · paid · cleared · changed", () => {
  const base = { cartStatus: "open" as const, qty: 1, amountCents: 1400 };
  const same = { qty: 1, unitPriceCents: 1400 };
  it("an open cart with the line as asked: open (Approve · Deny)", () => {
    expect(requestCardState({ ...base, lineNow: same })).toBe("open");
  });
  it("a PAID cart: paid — derived from status === 'paid', never from 'not open'", () => {
    expect(requestCardState({ ...base, cartStatus: "paid", lineNow: same })).toBe("paid");
  });
  it("a CANCELLED cart (cleared outside M182's RPC): cleared, never 'paid'", () => {
    expect(requestCardState({ ...base, cartStatus: "cancelled", lineNow: same })).toBe("cleared");
  });
  it("an open cart whose line changed after asking: changed (Close it only)", () => {
    expect(requestCardState({ ...base, lineNow: { qty: 2, unitPriceCents: 1400 } })).toBe(
      "changed",
    );
    expect(requestCardState({ ...base, lineNow: null })).toBe("changed");
  });
  it("paid wins over changed: the table paid first, whatever the line did", () => {
    expect(requestCardState({ ...base, cartStatus: "paid", lineNow: null })).toBe("paid");
  });
  it("no cart behind the request at all: cleared (nothing to approve against)", () => {
    expect(requestCardState({ ...base, cartStatus: null, lineNow: null })).toBe("cleared");
  });
});
