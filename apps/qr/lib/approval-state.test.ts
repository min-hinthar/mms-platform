import { describe, expect, it } from "vitest";
import {
  changedNote,
  lineChangedSinceRequest,
  lineNowFromRow,
  requestCardState,
} from "./approval-state";

/**
 * PD8 · M184 — what a request card IS, derived from the cart's status and the line as it stands now.
 * The snapshot is the request's own `qty` / `amount_cents`; the card's state decides which keys it
 * offers (Approve · Deny · Close it), so each arm is a value here and a mutant in verify:slice. The
 * SQL (`mms_resolve_approval`, M184) decides the same question at the write — this is the affordance.
 */
const snap = { qty: 1, amountCents: 1400 };

describe("lineChangedSinceRequest — the M184 compare", () => {
  it("the same qty at the same price: unchanged", () => {
    expect(lineChangedSinceRequest(snap, { qty: 1, unitPriceCents: 1400, offTheBill: false })).toBe(
      false,
    );
  });
  it("a qty step after asking: changed (the $12 comp that took $36 off)", () => {
    expect(lineChangedSinceRequest(snap, { qty: 2, unitPriceCents: 1400, offTheBill: false })).toBe(
      true,
    );
  });
  it("a re-price at the same qty: changed — the amount, not only the count, is compared", () => {
    expect(lineChangedSinceRequest(snap, { qty: 1, unitPriceCents: 1600, offTheBill: false })).toBe(
      true,
    );
  });
  it("a qty and price that happen to multiply back to the snapshot is NOT the line that was asked about", () => {
    // 2 × $7.00 = $14.00: the amount agrees, the qty does not — changed.
    expect(lineChangedSinceRequest(snap, { qty: 2, unitPriceCents: 700, offTheBill: false })).toBe(
      true,
    );
  });
  it("a line that is gone: changed", () => {
    expect(lineChangedSinceRequest(snap, null)).toBe(true);
  });
});

describe("requestCardState — open · paid · cleared · changed", () => {
  const base = { cartStatus: "open" as const, qty: 1, amountCents: 1400 };
  const same = { qty: 1, unitPriceCents: 1400, offTheBill: false };
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
    expect(
      requestCardState({ ...base, lineNow: { qty: 2, unitPriceCents: 1400, offTheBill: false } }),
    ).toBe("changed");
    expect(requestCardState({ ...base, lineNow: null })).toBe("changed");
  });
  it("paid wins over changed: the table paid first, whatever the line did", () => {
    expect(requestCardState({ ...base, cartStatus: "paid", lineNow: null })).toBe("paid");
  });
  it("no cart behind the request at all: cleared (nothing to approve against)", () => {
    expect(requestCardState({ ...base, cartStatus: null, lineNow: null })).toBe("cleared");
  });
});

describe("the blind pass on #333 — a line already off the bill, and the one sentence a change says", () => {
  it("a line voided or comped since the ask is CHANGED, whatever its qty and price say", () => {
    // Same qty and price as the snapshot: only `offTheBill` separates it from an unchanged line.
    // MUTATION (approval-state/off-the-bill-reads-unchanged): false; red.
    expect(lineChangedSinceRequest(snap, { qty: 1, unitPriceCents: 1400, offTheBill: true })).toBe(
      true,
    );
    expect(
      requestCardState({
        cartStatus: "open",
        qty: 1,
        amountCents: 1400,
        lineNow: { qty: 1, unitPriceCents: 1400, offTheBill: true },
      }),
    ).toBe("changed");
  });
  it("lineNowFromRow — voided OR comped is off the bill; a live row is not; no row is gone", () => {
    const live = { qty: 2, unit_price_cents: 700, state: "in_progress", comped: false };
    expect(lineNowFromRow(live)).toEqual({ qty: 2, unitPriceCents: 700, offTheBill: false });
    // MUTATION (approval-state/voided-line-on-the-bill): the voided row reads live; red.
    expect(lineNowFromRow({ ...live, state: "voided" })?.offTheBill).toBe(true);
    // MUTATION (approval-state/comped-line-on-the-bill): the comped row reads live; red.
    expect(lineNowFromRow({ ...live, comped: true })?.offTheBill).toBe(true);
    expect(lineNowFromRow(undefined)).toBeNull();
    expect(lineNowFromRow(null)).toBeNull();
  });
  it("changedNote — gone, already off, or the live figure: one choice for the card and its decision", () => {
    expect(changedNote(null)).toEqual({ k: "table.appr.changed.goneNote" });
    // MUTATION (approval-state/changed-note-always-gone): a line still on the order at 2× reads
    // "no longer on the order"; red.
    expect(changedNote({ qty: 2, unitPriceCents: 1400, offTheBill: false })).toEqual({
      k: "table.appr.changed.note",
      qty: 2,
      amountCents: 2800,
    });
    // MUTATION (approval-state/changed-note-done-as-moved): an already-removed line reads "now 1× ·
    // $9.00 — nothing was taken off" over a dish that IS off; red.
    expect(changedNote({ qty: 1, unitPriceCents: 900, offTheBill: true })).toEqual({
      k: "table.appr.changed.doneNote",
    });
  });
});
