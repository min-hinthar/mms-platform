import { describe, expect, it } from "vitest";
import { PILOT_CHANNELS, bucketByChannel, promoFigure, type PilotOrderRow } from "./pilot-night";

/**
 * P5 — the nightly sheet's one derivation, falsified by VALUES.
 *
 * Every fixture below is asymmetric on purpose: three channels with three DIFFERENT counts, and an
 * unattributed count different from all of them. A fixture where the buckets happened to be equal
 * would let "fold the unknown into dine-in" and "count only paid" both survive — the degenerate
 * shape `verify:slice` reports as a surviving mutant.
 */
const rows = (spec: [status: string, mode: string | null][]): PilotOrderRow[] =>
  spec.map(([status, mode]) => ({ status, mode }));

describe("bucketByChannel — tonight's orders by the door they came in", () => {
  it("counts each channel separately and reports every channel, in a stable order", () => {
    const split = bucketByChannel(
      rows([
        ["paid", "dinein"],
        ["paid", "dinein"],
        ["paid", "dinein"],
        ["paid", "dinein"],
        ["paid", "pickup"],
        ["paid", "pickup"],
        ["paid", "scango"],
      ]),
    );
    expect(split.channels).toEqual([
      { mode: "dinein", orders: 4 },
      { mode: "pickup", orders: 2 },
      { mode: "scango", orders: 1 },
    ]);
    expect(split.counted).toBe(7);
    expect(split.unattributed).toBe(0);
  });

  it("keeps a channel with no orders on the sheet, as zero", () => {
    // A vanished row reads as "not measured"; a zero reads as "none tonight". They are different
    // statements, and the sheet must make the second one.
    const split = bucketByChannel(rows([["paid", "dinein"]]));
    expect(split.channels.map((c) => c.mode)).toEqual([...PILOT_CHANNELS]);
    expect(split.channels.find((c) => c.mode === "scango")?.orders).toBe(0);
  });

  it("counts an order with NO recorded channel apart — never folded into a bucket", () => {
    // `qr_orders.session_id` is nullable and the mode is only reachable through it, so this is a
    // real row shape. Attributing it to dine-in (the commonest channel, and the tempting default)
    // would print a number the app invented on a screen read as a statement of fact.
    const split = bucketByChannel(
      rows([
        ["paid", "dinein"],
        ["paid", "dinein"],
        ["paid", "dinein"],
        ["paid", null],
        ["paid", null],
      ]),
    );
    expect(split.channels).toEqual([
      { mode: "dinein", orders: 3 },
      { mode: "pickup", orders: 0 },
      { mode: "scango", orders: 0 },
    ]);
    expect(split.unattributed).toBe(2);
    // …and the gap is VISIBLE: the buckets do not silently absorb it, and they do not silently drop
    // it either — `counted + unattributed` is the day.
    expect(split.counted).toBe(3);
    expect(split.counted + split.unattributed).toBe(5);
  });

  it("treats a mode string it does not know as unattributed, not as a new channel", () => {
    // A mode added to `table_sessions` and not to this map must surface as "we don't know", never as
    // a silently dropped order — the fail-safe direction for a count.
    const split = bucketByChannel(
      rows([
        ["paid", "dinein"],
        ["paid", "catering"],
      ]),
    );
    expect(split.unattributed).toBe(1);
    expect(split.counted).toBe(1);
  });

  it("counts ONLY paid — a refunded order is not tonight's participation", () => {
    // `summarizeDay` splits refunded out of every tender bucket for the same reason; the two screens
    // must not disagree about what "an order tonight" means.
    const split = bucketByChannel(
      rows([
        ["paid", "dinein"],
        ["paid", "dinein"],
        ["refunded", "dinein"],
        ["refunded", "pickup"],
        ["refunded", null],
      ]),
    );
    expect(split.channels).toEqual([
      { mode: "dinein", orders: 2 },
      { mode: "pickup", orders: 0 },
      { mode: "scango", orders: 0 },
    ]);
    expect(split.counted).toBe(2);
    // The refunded unattributed row must not leak into the unattributed count either — the status
    // filter runs FIRST, so "no channel" is only ever said about an order that counts.
    expect(split.unattributed).toBe(0);
  });

  it("an empty day is an honest set of zeroes, not an empty list", () => {
    const split = bucketByChannel([]);
    expect(split.counted).toBe(0);
    expect(split.unattributed).toBe(0);
    expect(split.channels).toHaveLength(PILOT_CHANNELS.length);
  });
});

/**
 * P5 — the promo cell's show/suppress rule.
 *
 * These fixtures are the four states crossed with zero-and-non-zero, because the defect this rule
 * was extracted to fix lived in exactly ONE of the eight cells: a NON-ZERO count under an INACTIVE
 * campaign, which the old JSX branch deleted. A test that only checked "live shows, off hides" —
 * the shape the original branch would have passed — never reaches it. So every case is named.
 *
 * The counts are deliberately distinct (7, 3, 4) rather than a shared constant: a mutant that
 * returned some other query's number would otherwise be invisible.
 */
describe("promoFigure — a measured number is never erased by a campaign state change", () => {
  const live = { exists: true as const, active: true };
  const off = { exists: true as const, active: false };
  const unset = { exists: false as const };

  it("prints tonight's count when the campaign is live", () => {
    expect(promoFigure(live, 7)).toEqual({ show: true, redemptions: 7, state: "live" });
  });

  it("prints a ZERO when the campaign is live — the offer stood and nobody took it", () => {
    // Honest and actionable: this is a fact about the guests, which is what the reader acts on.
    expect(promoFigure(live, 0)).toEqual({ show: true, redemptions: 0, state: "live" });
  });

  it("STILL prints tonight's count after the emergency off-switch is pulled", () => {
    // THE REGRESSION THIS RULE EXISTS FOR. `update promo_codes set active = false` is the pilot's
    // documented dark switch. Pull it at 20:00 on a day that already took 3 redemptions and the old
    // JSX branch showed no participation figure at all — on the one evening something changed.
    expect(promoFigure(off, 3)).toEqual({ show: true, redemptions: 3, state: "off" });
  });

  it("suppresses a zero under a switched-off campaign, and says which state it is in", () => {
    // True, and misleading: it reads as "nobody used it" when the honest sentence is "it wasn't
    // discounting anything". Those call for opposite actions at 9pm.
    expect(promoFigure(off, 0)).toEqual({ show: false, state: "off" });
  });

  it("suppresses a zero when no campaign row exists", () => {
    expect(promoFigure(unset, 0)).toEqual({ show: false, state: "unset" });
  });

  it("prints a count even with no campaign row — redemptions happened, whatever the row says", () => {
    // Reachable if the row is deleted mid-pilot. The count is a measurement; the row's absence is a
    // separate fact and the sheet prints both rather than choosing which one to believe.
    expect(promoFigure(unset, 4)).toEqual({ show: true, redemptions: 4, state: "unset" });
  });

  it("never invents a redemption count — the printed number is the one it was handed", () => {
    for (const n of [0, 1, 3, 7, 250]) {
      const f = promoFigure(live, n);
      expect(f.show && f.redemptions).toBe(n === 0 ? 0 : n);
    }
  });
});
