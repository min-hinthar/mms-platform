import { describe, expect, it } from "vitest";
import {
  CASH_LADDER_CENTS,
  cashSettleBlocked,
  changeAsTipCents,
  changeDue,
  handoffRows,
  laDayStartIso,
  quickCashTenders,
  summarizeDay,
  tenderState,
} from "./register-math";
import { TIP_AMOUNT_MAX_CENTS } from "./tip";

describe("summarizeDay — the Z-report buckets", () => {
  it("buckets paid orders by tender and keeps refunded APART (never netted)", () => {
    const s = summarizeDay([
      { tender: "cash", total_cents: 2500, status: "paid" },
      { tender: "cash", total_cents: 1300, status: "paid" },
      { tender: "card", total_cents: 4200, status: "paid" },
      { tender: "terminal", total_cents: 1700, status: "paid" },
      { tender: "card", total_cents: 990, status: "refunded" },
    ]);
    expect(s).toEqual({
      cashCount: 2,
      cashCents: 3800,
      cardCount: 1,
      cardCents: 4200,
      terminalCount: 1,
      terminalCents: 1700,
      refundedCount: 1,
      refundedCents: 990,
      cashTipCents: 0,
      // M218 — no cash went back today, so the drawer's net IS its gross.
      cashRefundedCents: 0,
      cashNetCents: 3800,
    });
  });

  it("M218: cash handed back comes OFF the drawer, and never off the other tenders", () => {
    // A line refund leaves the order `paid` at its full `total_cents`, so `cashCents` stays GROSS
    // and this is what actually left the till. The card bucket must not move: a card refund goes
    // back through the processor and never opens the drawer.
    const s = summarizeDay(
      [
        { tender: "cash", total_cents: 2500, status: "paid" },
        { tender: "card", total_cents: 4200, status: "paid" },
      ],
      700,
    );
    expect(s.cashCents).toBe(2500); // gross, unmoved
    expect(s.cashRefundedCents).toBe(700);
    expect(s.cashNetCents).toBe(1800);
    expect(s.cardCents).toBe(4200);
  });

  it("M218: a day that gave back more cash than it took reads NEGATIVE, not zero", () => {
    // Refund an earlier service day's cash order on a slow morning and the true movement is
    // negative. The first draft floored this at 0 — which tells a manager the till balances while
    // it is short by exactly the hidden amount (Codex round 1 on #286, P1). The figure is movement,
    // not a physical count: a float would be needed for that, and this app does not carry one.
    const s = summarizeDay([{ tender: "cash", total_cents: 1000, status: "paid" }], 2500);
    expect(s.cashRefundedCents).toBe(2500);
    expect(s.cashNetCents).toBe(-1500);
  });

  it("M218: a caller that passes no refund figure gets today's honest zero", () => {
    const s = summarizeDay([{ tender: "cash", total_cents: 1000, status: "paid" }]);
    expect(s.cashRefundedCents).toBe(0);
    expect(s.cashNetCents).toBe(1000);
  });

  it("W17c-2: a cash tip is INSIDE the drawer figure, and also reported on its own", () => {
    // The RPC folds the tip into the order total, so `cashCents` already contains it. Reporting it
    // as a separate bucket to ADD would overstate the drawer by exactly the tips — the mistake this
    // assertion exists to prevent. 2500 + 1300 = 3800 either way; 500 + 0 of that is tips.
    const s = summarizeDay([
      { tender: "cash", total_cents: 2500, status: "paid", tip_cents: 500 },
      { tender: "cash", total_cents: 1300, status: "paid", tip_cents: 0 },
    ]);
    expect(s.cashCents).toBe(3800);
    expect(s.cashTipCents).toBe(500);
  });

  it("W17c-2: a row with no tip_cents reads as 0, never NaN", () => {
    // The column is optional on the type so a caller that hasn't widened its SELECT degrades to
    // "no tips recorded" rather than poisoning the whole summary with NaN.
    const s = summarizeDay([{ tender: "cash", total_cents: 2500, status: "paid" }]);
    expect(s.cashTipCents).toBe(0);
    expect(Number.isNaN(s.cashTipCents)).toBe(false);
  });

  it("W17c-2: a REFUNDED cash order's tip is not counted as tipped", () => {
    // Refunded money is not in the drawer, and its tip is not in anyone's pocket either.
    const s = summarizeDay([
      { tender: "cash", total_cents: 2500, status: "refunded", tip_cents: 500 },
    ]);
    expect(s.cashTipCents).toBe(0);
    expect(s.cashCents).toBe(0);
  });

  it("W6c: the counter reader (tender='terminal') is its OWN bucket — never folded into online card", () => {
    // The register reconciles the READER's takings against Stripe Terminal; a merged column hides
    // a mis-tendered order in the noise of online sales.
    const s = summarizeDay([
      { tender: "terminal", total_cents: 2100, status: "paid" },
      { tender: "card", total_cents: 900, status: "paid" },
    ]);
    expect(s.terminalCents).toBe(2100);
    expect(s.terminalCount).toBe(1);
    expect(s.cardCents).toBe(900);
    expect(s.cashCents).toBe(0);
  });

  it("ignores rows in any other status — an unfinished order is not drawer money", () => {
    const s = summarizeDay([
      { tender: "cash", total_cents: 999, status: "pending" },
      { tender: "cash", total_cents: 100, status: "paid" },
    ]);
    expect(s.cashCents).toBe(100);
    expect(s.cashCount).toBe(1);
  });

  it("an unknown tender lands in the card bucket, never the cash drawer", () => {
    // The DB CHECK bounds tender to card|cash today; if a tender is ever added and this module
    // lags, overstating the CASH drawer is the harmful direction — default to the other bucket.
    const s = summarizeDay([{ tender: "ebt", total_cents: 500, status: "paid" }]);
    expect(s.cashCents).toBe(0);
    expect(s.cardCents).toBe(500);
  });
});

describe("changeDue — cashier arithmetic (display-only)", () => {
  it("returns the difference on an over-tender", () => {
    expect(changeDue(1350, 2000)).toBe(650);
  });
  it("never goes negative on a short tender", () => {
    expect(changeDue(1350, 1000)).toBe(0);
  });
  it("exact tender is zero change", () => {
    expect(changeDue(1350, 1350)).toBe(0);
  });
});

describe("laDayStartIso — the LA day window", () => {
  it("returns LA midnight during PDT (UTC−7)", () => {
    // 2026-07-15T19:30Z = 12:30 PDT → LA midnight is 07:00Z that day.
    expect(laDayStartIso(new Date("2026-07-15T19:30:00Z"))).toBe("2026-07-15T07:00:00.000Z");
  });
  it("returns LA midnight during PST (UTC−8)", () => {
    // 2026-01-15T19:30Z = 11:30 PST → LA midnight is 08:00Z.
    expect(laDayStartIso(new Date("2026-01-15T19:30:00Z"))).toBe("2026-01-15T08:00:00.000Z");
  });
  it("early-UTC evening still maps to the LA date, not the UTC date", () => {
    // 2026-07-16T03:00Z is 2026-07-15 20:00 PDT — the LA day is still the 15th.
    expect(laDayStartIso(new Date("2026-07-16T03:00:00Z"))).toBe("2026-07-15T07:00:00.000Z");
  });
});

// ── Phase 2c · register ── the cash moment: what the cashier counts at the drawer ────────────────

describe("quickCashTenders — Exact plus three round-ups (the owner's ladder)", () => {
  // Computed in node from the algorithm (scratch `ladder.mjs`), pasted — never typed by hand.
  it.each([
    [425, [500, 1000, 2000]],
    [987, [1000, 2000, 5000]],
    [1347, [1400, 1500, 2000]],
    [1860, [1900, 2000, 5000]],
    [2000, [2500, 3000, 4000]],
    [2150, [2200, 2500, 3000]],
    [2780, [2800, 3000, 4000]],
    [3415, [3500, 4000, 5000]],
    [4210, [4300, 4500, 5000]],
    [4500, [5000, 6000, 10000]],
    [5010, [5100, 5500, 6000]],
    [6210, [6300, 6500, 7000]],
    [8840, [8900, 9000, 10000]],
    [9950, [10000, 10500, 11000]],
    [10000, [10500, 11000, 12000]],
    [13625, [13700, 14000, 15000]],
  ])("%i → %j", (due, notes) => {
    // MUTATIONS: `ceil` for `floor+1` (2000 offers $20 — the Exact chip twice); no dedupe (425 offers
    // $5 twice); no whole-dollar $1 skip (2000 offers $21, a note nobody hands over) — each red here.
    expect(quickCashTenders(due)).toEqual(notes);
  });

  it("offers nothing for a due that is not a positive whole number of cents", () => {
    for (const bad of [0, -1, Number.NaN, 13.5, Number.POSITIVE_INFINITY])
      expect(quickCashTenders(bad)).toEqual([]);
  });

  it("a custom ladder that does not divide itself still reads ascending", () => {
    // [300, 700] at 650 builds 900 then 700 then 1400 — only the sort puts them in order.
    // MUTATION: drop the sort — [900, 700, 1400]; red.
    expect(quickCashTenders(650, [300, 700])).toEqual([700, 900, 1400]);
  });

  it("the default ladder is the house's notes, $1 to $100", () => {
    expect(CASH_LADDER_CENTS).toEqual([100, 500, 1000, 2000, 5000, 10000]);
  });

  it("property: every due in 1..200000 gets exactly three notes, each above it, strictly ascending", () => {
    let violations = 0;
    for (let due = 1; due <= 200_000; due++) {
      const n = quickCashTenders(due);
      const ok =
        n.length === 3 &&
        n.every((c, i) => Number.isInteger(c) && c > due && (i === 0 || c > n[i - 1]!));
      if (!ok) violations += 1;
    }
    expect(violations).toBe(0);
  });
});

describe("tenderState — what the readout says", () => {
  it("no tender (empty, zero, not a whole number of cents) says nothing", () => {
    expect(tenderState(1347, null)).toEqual({ kind: "none" });
    // MUTATION: drop the ≤0 guard — a typed 0 reads Short $13.47 and blocks the settle; red.
    expect(tenderState(1347, 0)).toEqual({ kind: "none" });
    expect(tenderState(1347, -5)).toEqual({ kind: "none" });
    expect(tenderState(1347, 20.5)).toEqual({ kind: "none" });
  });
  it("equal is exact; over is change (through changeDue); under is short", () => {
    expect(tenderState(1347, 1347)).toEqual({ kind: "exact" });
    // MUTATION: swap the change and short arms — 2000 reads short, 1300 reads change; red.
    expect(tenderState(1347, 2000)).toEqual({ kind: "change", changeCents: 653 });
    expect(tenderState(1347, 1300)).toEqual({ kind: "short", shortCents: 47 });
  });
});

describe("cashSettleBlocked — the ONE binding Settle's dim, its description and its handler read", () => {
  it("blocks on a short tender and never on the others", () => {
    // MUTATION: ignore `short` — Settle stays live beside "Short $2.10"; red.
    expect(cashSettleBlocked(0, { kind: "short", shortCents: 210 })).toBe("short");
    expect(cashSettleBlocked(0, { kind: "none" })).toBeNull();
    expect(cashSettleBlocked(0, { kind: "exact" })).toBeNull();
    expect(cashSettleBlocked(0, { kind: "change", changeCents: 790 })).toBeNull();
  });
  it("blocks a tip over the house cap, at the cap exactly it does not — the cap named once (lib/tip)", () => {
    expect(cashSettleBlocked(TIP_AMOUNT_MAX_CENTS + 1, { kind: "none" })).toBe("tipCap");
    expect(cashSettleBlocked(TIP_AMOUNT_MAX_CENTS, { kind: "none" })).toBeNull();
    // An unreadable tip WITH digits in it (past seven whole-dollar digits) is over any cap.
    expect(cashSettleBlocked(null, { kind: "none" })).toBe("tipCap");
    // The cap outranks short: the tip line is the one to fix first.
    expect(cashSettleBlocked(TIP_AMOUNT_MAX_CENTS + 1, { kind: "short", shortCents: 1 })).toBe(
      "tipCap",
    );
  });
});

describe("changeAsTipCents — keep the change is a FILL, offered only when change is owed", () => {
  it("the whole over-tender becomes the tip", () => {
    expect(changeAsTipCents(4210, 5000, 0)).toBe(790);
    // An existing tip smaller than the over-tender still leaves change to keep.
    expect(changeAsTipCents(4210, 5000, 300)).toBe(790);
  });
  it("is not offered once the tip already takes it all, on an exact tender, or with no tender", () => {
    // MUTATION: `>` → `>=` — offered when the readout already says "Exact — no change"; red.
    expect(changeAsTipCents(4210, 5000, 790)).toBeNull();
    expect(changeAsTipCents(4210, 4210, 0)).toBeNull();
    expect(changeAsTipCents(4210, null, 0)).toBeNull();
    expect(changeAsTipCents(4210, 0, 0)).toBeNull();
    expect(changeAsTipCents(4210, 4000, 0)).toBeNull();
  });
  it("never offers a tip the settle would refuse (over the house cap)", () => {
    expect(changeAsTipCents(100, 100 + TIP_AMOUNT_MAX_CENTS, 0)).toBe(TIP_AMOUNT_MAX_CENTS);
    expect(changeAsTipCents(100, 101 + TIP_AMOUNT_MAX_CENTS, 0)).toBeNull();
  });
});

describe("handoffRows — the paid card's receipt rows, zero-gated, in order", () => {
  it("total, tip, tendered, then the change (six-fifty-three on a $20 for $13.47)", () => {
    expect(handoffRows(1347, null, 2000)).toEqual([
      { k: "total", cents: 1347 },
      { k: "tendered", cents: 2000 },
      { k: "change", cents: 653 },
    ]);
    expect(handoffRows(5000, 790, 5000)).toEqual([
      { k: "total", cents: 5000 },
      { k: "tip", cents: 790 },
      { k: "tendered", cents: 5000 },
      // Exact is still a row — "Change $0.00" is the fact the cashier reads before closing the drawer.
      { k: "change", cents: 0 },
    ]);
  });
  it("a short tender says what is still to collect, never a change row", () => {
    // MUTATION: emit change on a short tender — a card that reads "Change $0.00" while $2.10 is owed; red.
    expect(handoffRows(4210, 0, 4000)).toEqual([
      { k: "total", cents: 4210 },
      { k: "tendered", cents: 4000 },
      { k: "collect", cents: 210 },
    ]);
  });
  it("no tender: the total alone (the reader's counter card, a counter exact settle)", () => {
    expect(handoffRows(1347, null, null)).toEqual([{ k: "total", cents: 1347 }]);
    expect(handoffRows(1347, 0, 0)).toEqual([{ k: "total", cents: 1347 }]);
  });
});
