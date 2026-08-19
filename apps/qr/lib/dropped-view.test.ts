import { describe, expect, it } from "vitest";
import {
  droppedChipLabel,
  droppedLineLabel,
  droppedNoticeHeading,
  droppedSpokenClause,
  droppedSpokenNotice,
  DROPPED_NOTICE_BODY,
  NO_DROPS,
  parseDroppedLines,
  settleCanceledCopy,
  settleCanceledSpoken,
  paidClaim,
  safeClaim,
  settleCancelReason,
  SETTLE_CANCELED_NEXT,
  SETTLE_CANCELED_NOTE,
} from "./dropped-view";

/**
 * W23d — the rules that decide what a diner is told about a basket that changed under them.
 *
 * Every assertion below describes a state where the WRONG string is a false claim on a money
 * surface, not a cosmetic slip: silence where a dish was removed, a shortage blamed for a lapsed
 * promo, or "you weren't charged" over a capture that is still in flight.
 */

describe("parseDroppedLines", () => {
  it("reads the snapshot the SQL projection writes", () => {
    const s = parseDroppedLines([
      { name: "Mohinga", qty: 2 },
      { name: "Tea Leaf Salad", qty: 1 },
    ]);
    expect(s).toEqual({
      count: 2,
      lines: [
        { name: "Mohinga", qty: 2 },
        { name: "Tea Leaf Salad", qty: 1 },
      ],
    });
  });

  it("keeps the COUNT when an element is malformed, so a corrupt row degrades to a number", () => {
    // The separating case for `count` vs `lines.length`. A guard that returned only the well-formed
    // lines would render NOTHING here — and silence on this surface is indistinguishable from
    // "nothing happened", which is the exact false claim the slice exists to remove.
    const s = parseDroppedLines([{ name: "Mohinga", qty: 1 }, { qty: 3 }, null]);
    expect(s.count).toBe(3);
    expect(s.lines).toEqual([{ name: "Mohinga", qty: 1 }]);
    expect(droppedNoticeHeading(s)).toBe("3 dishes sold out");
  });

  it("treats a non-array column as nothing dropped", () => {
    // The opposite direction, and it must not be symmetric with the case above: a corrupt COLUMN
    // gives no evidence a shortage happened, so claiming one would fabricate the fact outright.
    expect(parseDroppedLines(null)).toEqual(NO_DROPS);
    expect(parseDroppedLines('[{"name":"Mohinga"}]')).toEqual(NO_DROPS);
    expect(parseDroppedLines(undefined)).toEqual(NO_DROPS);
  });

  it("floors a missing or nonsense qty at 1 rather than printing ×0", () => {
    expect(parseDroppedLines([{ name: "Mohinga" }]).lines).toEqual([{ name: "Mohinga", qty: 1 }]);
    expect(parseDroppedLines([{ name: "Mohinga", qty: 0 }]).lines).toEqual([
      { name: "Mohinga", qty: 1 },
    ]);
    expect(parseDroppedLines([{ name: "Mohinga", qty: -4 }]).lines).toEqual([
      { name: "Mohinga", qty: 1 },
    ]);
  });

  it("drops a blank name into the count rather than rendering an empty bullet", () => {
    const s = parseDroppedLines([{ name: "   ", qty: 2 }]);
    expect(s).toEqual({ count: 1, lines: [] });
  });
});

describe("the notice a CHARGED order carries", () => {
  it("is singular for one dish and plural for more", () => {
    expect(droppedNoticeHeading({ count: 1, lines: [] })).toBe("One dish sold out");
    expect(droppedNoticeHeading({ count: 2, lines: [] })).toBe("2 dishes sold out");
  });

  it("shows the qty even at one — the guest is counting against what they ordered", () => {
    expect(droppedLineLabel({ name: "Mohinga", qty: 1 })).toBe("Mohinga ×1");
    expect(droppedLineLabel({ name: "Mohinga", qty: 3 })).toBe("Mohinga ×3");
  });

  it("carries NO dollar figure anywhere", () => {
    // The money-copy rule, pinned. A figure printed beside the receipt rows for money that was
    // never charged reads as a refund line — which is the confusion W23b spent a whole slice on.
    const s = { count: 1, lines: [{ name: "Mohinga", qty: 2 }] };
    const rendered = [
      droppedNoticeHeading(s),
      droppedLineLabel(s.lines[0]!),
      DROPPED_NOTICE_BODY,
      droppedSpokenNotice(s),
      droppedSpokenClause(s),
      droppedChipLabel(s),
    ].join(" ");
    expect(rendered).not.toMatch(/\$|cents?\b/i);
  });

  it("says nothing at all when nothing was dropped", () => {
    // The overwhelming case — every automatic-capture order — so every surface splices these in
    // unconditionally and nothing changes for the receipts that were already correct.
    expect(droppedChipLabel(NO_DROPS)).toBeNull();
    expect(droppedSpokenClause(NO_DROPS)).toBe("");
    expect(droppedSpokenNotice(NO_DROPS)).toBe("");
  });

  it("speaks the fact even when no line can be named", () => {
    expect(droppedSpokenClause({ count: 2, lines: [] })).toContain("2 dishes sold out");
    expect(droppedSpokenClause({ count: 1, lines: [] })).toContain("1 dish sold out");
  });

  it("names the dishes when it can", () => {
    expect(
      droppedSpokenClause({
        count: 2,
        lines: [
          { name: "Mohinga", qty: 1 },
          { name: "Tea Leaf Salad", qty: 2 },
        ],
      }),
    ).toBe(", sold out and removed: Mohinga ×1, Tea Leaf Salad ×2");
  });
});

describe("the money claim the timed-out screen may make", () => {
  it("does not say a payment went through while the card is only authorized", () => {
    // The tracker's give-up arms all lead with a completed payment. Under manual capture that is
    // false until the order lands — and PaySuccess beside them now says so, which is what turned a
    // lone wrong sentence into two contradictory claims on one screen.
    expect(paidClaim(true)).not.toMatch(/went through|payment (is )?(safe|complete)/i);
    expect(safeClaim(true)).not.toMatch(/payment is safe|went through/i);
    expect(paidClaim(true)).toMatch(/authorized/i);
    expect(safeClaim(true)).toMatch(/authorized/i);
  });

  it("keeps today's wording for every automatic-capture payment", () => {
    // The overwhelming case, and the one that must not regress: an automatic capture really HAS
    // gone through by the time this screen renders.
    expect(paidClaim(false)).toBe("Your payment went through");
    expect(safeClaim(false)).toBe("Your payment is safe");
  });
});

describe("settleCancelReason — the vocabulary allowlist", () => {
  it("passes the four codes the column's CHECK permits", () => {
    for (const r of ["nothing_left", "over_authorized", "cart_not_open", "superseded"])
      expect(settleCancelReason(r)).toBe(r);
  });

  it("degrades an unrecognised code to `unknown`, never to raw database text", () => {
    // The first reason someone adds to the SQL side must not reach a guest as a column value.
    expect(settleCancelReason("kitchen_closed")).toBe("unknown");
    expect(settleCancelReason("")).toBe("unknown");
  });
});

describe("the copy for a CANCELLED hold", () => {
  it("gives each reason its own explanation", () => {
    const headings = (
      ["nothing_left", "over_authorized", "cart_not_open", "superseded", "unknown"] as const
    ).map((r) => settleCanceledCopy({ reason: r, dropped: { count: 1, lines: [] } }).heading);
    expect(new Set(headings).size).toBe(headings.length);
  });

  it("never blames a shortage on the over_authorized arm", () => {
    // The separating case, and the reason the arms exist at all. `over_authorized` fires with the
    // lines still AVAILABLE (a promo lapses on `valid_until`, purely on time — registry M70), so
    // "everything sold out" would be a fabricated explanation on the one screen a guest reads to
    // find out where their money went.
    const over = settleCanceledCopy({ reason: "over_authorized", dropped: NO_DROPS });
    expect(`${over.heading} ${over.body}`).not.toMatch(/sold out|ran out|shortage/i);
    expect(
      settleCanceledCopy({ reason: "nothing_left", dropped: { count: 1, lines: [] } }).heading,
    ).toMatch(/sold out/i);
  });

  it("does not claim a shortage when nothing was actually dropped", () => {
    // `nothing_left` is `liveTotalCents <= 0`, not "every line was voided" — a promo or reward
    // clamped to the remaining subtotal can zero a SHRUNKEN basket with dishes still on it. The
    // two arms must be separable, or the copy asserts a shortage the code never observed.
    const withDrops = settleCanceledCopy({
      reason: "nothing_left",
      dropped: { count: 2, lines: [] },
    });
    const without = settleCanceledCopy({ reason: "nothing_left", dropped: NO_DROPS });
    expect(withDrops.heading).toMatch(/sold out/i);
    expect(`${without.heading} ${without.body}`).not.toMatch(/sold out|ran out/i);
    expect(withDrops.heading).not.toBe(without.heading);
  });

  it("claims only 'no longer open' on the cart_not_open arm, never 'it was paid'", () => {
    // The precheck answers -1 for ANY non-open cart, and qr_carts.status is
    // ('open','paid','cancelled') — every merge/void path writes 'cancelled'. Asserting the settled
    // reading alone tells a guest whose order was CANCELLED that it went through another way.
    const closed = settleCanceledCopy({ reason: "cart_not_open", dropped: NO_DROPS });
    const text = `${closed.heading} ${closed.body}`;
    expect(text).toMatch(/cancelled/i); // the reading the first draft omitted
    expect(text).not.toMatch(/already settled|went through another way/i);
  });

  it("claims no successor payment on the superseded arm", () => {
    // `superseded` proves only that the cart's lock no longer matches this attempt — which also
    // covers a released lock, a takeover by another payer, and a newer checkout that was abandoned.
    // None of those is evidence a successor payment SUCCEEDED, so asserting one is the same defect
    // as blaming a shortage on the over_authorized arm, in the other direction.
    const sup = settleCanceledCopy({ reason: "superseded", dropped: NO_DROPS });
    const text = `${sup.heading} ${sup.body}`;
    expect(text).not.toMatch(/was paid for again|kept the newer payment|we kept/i);
    // It still has to be USEFUL: point at the newer attempt without asserting it completed.
    expect(text).toMatch(/if you finished|took over/i);
  });

  it("promises no charge on every arm, including the one with no dropped lines", () => {
    for (const r of [
      "nothing_left",
      "over_authorized",
      "cart_not_open",
      "superseded",
      "unknown",
    ] as const) {
      const spoken = settleCanceledSpoken({ reason: r, dropped: NO_DROPS });
      expect(spoken).toContain("No payment was taken.");
      // Correct with ZERO lines: no arm may refer to dishes the guest cannot see listed.
      expect(spoken).not.toMatch(/these dishes|the dishes below|listed below/i);
    }
  });

  it("describes the hold as being RELEASED, not as already gone", () => {
    // The verdict is recorded BEFORE `paymentIntents.cancel`, so at the moment this string can
    // first be read the hold may still be standing. It has to be true in both states — and it must
    // not promise a timing the bank owns (the PARTIAL_REFUND_NOTE rule, stated the other way).
    expect(SETTLE_CANCELED_NOTE).toContain("being released");
    expect(SETTLE_CANCELED_NOTE).toContain("your bank decides");
    expect(SETTLE_CANCELED_NOTE).not.toMatch(/\d+\s*(–|-|to)\s*\d+\s*(business )?days/i);
  });

  it("promises no update and names no control that is not on the screen", () => {
    // The tracker's trailing helper paragraph is a five-arm chain whose DEFAULT promises "Status
    // updates here as the kitchen works on it — keep this open", and whose timed-out arm points at
    // a "Refresh above" that the cancelled state deliberately does not render. Both are false here,
    // and both survived the first two copy fixes because the rule lived in JSX where no test could
    // reach it. The string is a module constant for exactly that reason.
    expect(SETTLE_CANCELED_NEXT).not.toMatch(/updates?|keep this open|check back/i);
    expect(SETTLE_CANCELED_NEXT).not.toMatch(/refresh/i);
    // …and it still tells the guest what they CAN do, rather than only what they cannot.
    expect(SETTLE_CANCELED_NEXT).toMatch(/start a new one/i);
  });

  it("speaks the whole verdict in one string — the view has one live region", () => {
    const spoken = settleCanceledSpoken({ reason: "nothing_left", dropped: NO_DROPS });
    const { heading, body } = settleCanceledCopy({ reason: "nothing_left", dropped: NO_DROPS });
    expect(spoken).toContain(heading);
    expect(spoken).toContain(body);
    expect(spoken).toContain(SETTLE_CANCELED_NOTE);
  });
});
