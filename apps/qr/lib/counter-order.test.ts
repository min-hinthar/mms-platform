import { describe, expect, it } from "vitest";
import {
  counterArmOf,
  counterClearRefusal,
  counterSent,
  counterSentLine,
  counterSettleVariant,
  isCounterOrder,
  kdsLineGate,
  mergeCounterRefusal,
  noShowOutcome,
  unpaidBag,
  type CounterLine,
  type KdsGateInput,
} from "./counter-order";
import type { StaffSendView } from "./staff-send-view";

/**
 * Phase 2f · P2v — the counter order's pure rules as values. Every case is the one a named
 * `p2f-lib/counter-order/*` or `p2f-lib/kds-gate/*` mutant in `scripts/verify-slice.mjs` turns red:
 * each fixture SEPARATES the two code paths its mutant confuses (a line fired 1s ago vs 1s ahead;
 * voided, grocery-fired and comped lines that are "in the kitchen" by state alone).
 */

const NOW = Date.parse("2026-10-01T18:00:00.000Z");
const ago = (s: number) => new Date(NOW - s * 1000).toISOString();

const line = (over: Partial<CounterLine & { qty: number; bumped_at: string | null }> = {}) => ({
  state: "fired",
  fulfillment: "togo",
  fire_at: ago(1),
  comped: false,
  qty: 1,
  ...over,
});

describe("counterArmOf / isCounterOrder", () => {
  it("reads the two arms and nothing else", () => {
    expect(counterArmOf("phone")).toBe("phone");
    expect(counterArmOf("walkup")).toBe("walkup");
    expect(counterArmOf(null)).toBeNull();
    expect(counterArmOf(undefined)).toBeNull();
    expect(counterArmOf("kiosk")).toBeNull();
  });

  it("is a staff-minted reg- PICKUP session only", () => {
    expect(isCounterOrder({ mode: "pickup", qrCode: "reg-ab12" })).toBe(true);
    // kiosk-cooks-unpaid: a kiosk order stays pay-first
    expect(isCounterOrder({ mode: "pickup", qrCode: "kiosk-ab12" })).toBe(false);
    // a diner's own pickup (a table sticker code)
    expect(isCounterOrder({ mode: "pickup", qrCode: "T7" })).toBe(false);
    // mode-unchecked: a reg- code on a scan-and-go / dine-in session is not a counter order
    expect(isCounterOrder({ mode: "scango", qrCode: "reg-ab12" })).toBe(false);
    expect(isCounterOrder({ mode: "dinein", qrCode: "reg-ab12" })).toBe(false);
  });
});

describe("counterSentLine — the kitchen HAS it (the SQL no-show's sent set)", () => {
  it("a fired to-go line past its grace is sent; one still inside it is not", () => {
    expect(counterSentLine(line({ fire_at: ago(1) }), NOW)).toBe(true);
    expect(counterSentLine(line({ fire_at: ago(0) }), NOW)).toBe(true); // fire_at <= now
    // grace-counts-as-sent
    expect(counterSentLine(line({ fire_at: ago(-1) }), NOW)).toBe(false);
  });

  it("in progress and served are sent too; a draft and a voided line are not", () => {
    expect(counterSentLine(line({ state: "in_progress" }), NOW)).toBe(true);
    expect(counterSentLine(line({ state: "served" }), NOW)).toBe(true);
    // a draft that still carries an old fire_at (an undone send) is not sent
    expect(counterSentLine(line({ state: "draft", fire_at: ago(600) }), NOW)).toBe(false);
    // voided-counts-as-sent: a voided line keeps its fire_at
    expect(counterSentLine(line({ state: "voided", fire_at: ago(600) }), NOW)).toBe(false);
  });

  it("grocery never cooks and a comp is already an audited loss", () => {
    // grocery-counts-as-sent
    expect(counterSentLine(line({ fulfillment: "grocery" }), NOW)).toBe(false);
    // comped-counts-as-sent
    expect(counterSentLine(line({ comped: true }), NOW)).toBe(false);
    // a dine-in-tagged line that somehow fired still counts (the SQL's `<> 'grocery'`)
    expect(counterSentLine(line({ fulfillment: "dinein" }), NOW)).toBe(true);
  });

  it("a fired line with NO fire_at was fired at or before now — sent (the SQL twin's reading)", () => {
    // p2f-rev-lib/counter-order/null-fire-at-unsent — `mms_line_transition`'s draft→fired edge
    // stamps no fire_at; the SQL no-show counts that line as sent, so the TS must too, or Clear
    // cancels (with no audit) food the no-show would write off.
    expect(counterSentLine(line({ fire_at: null }), NOW)).toBe(true);
    // …but a row whose fire_at was never READ (the field absent) is no evidence: never sent
    expect(counterSentLine(line({ fire_at: undefined }), NOW)).toBe(false);
    expect(counterSentLine(line({ state: "served", fire_at: null }), NOW)).toBe(true);
    // a draft with no fire_at is still not sent (the state decides first)
    expect(counterSentLine(line({ state: "draft", fire_at: null }), NOW)).toBe(false);
    // an unparseable stamp (no Postgres writer produces one) is never sent
    expect(counterSentLine(line({ fire_at: "not a date" }), NOW)).toBe(false);
  });

  it("counterSent is any sent line", () => {
    expect(counterSent([line({ state: "draft" }), line()], NOW)).toBe(true);
    expect(counterSent([line({ state: "draft" }), line({ fire_at: ago(-5) })], NOW)).toBe(false);
    expect(counterSent([], NOW)).toBe(false);
  });
});

describe("kdsLineGate — pay-first with ONE staff-only exception", () => {
  // `fireMs` is sugar for the line's fire_at (null = no stamp); `line` overrides the rest of it.
  const gate = (
    over: Partial<Omit<KdsGateInput, "line">> & {
      fireMs?: number | null;
      line?: Partial<CounterLine>;
    } = {},
  ) => {
    const { fireMs = NOW - 1000, line: l = {}, ...rest } = over;
    return kdsLineGate({
      mode: "pickup",
      counterOrder: true,
      sessionStatus: "active",
      cartStatus: "open",
      slotted: false,
      nowMs: NOW,
      ...rest,
      line: {
        state: "fired",
        fulfillment: "togo",
        comped: false,
        fire_at: fireMs === null ? null : new Date(fireMs).toISOString(),
        ...l,
      },
    });
  };

  it("dine-in: an active table past the grace cooks; closed or in grace is hidden", () => {
    expect(gate({ mode: "dinein", counterOrder: false })).toEqual({
      show: true,
      held: false,
      unpaid: false,
    });
    expect(gate({ mode: "dinein", counterOrder: false, sessionStatus: "closed" })).toEqual({
      show: false,
    });
    expect(gate({ mode: "dinein", counterOrder: false, fireMs: NOW + 1000 })).toEqual({
      show: false,
    });
  });

  it("an OPEN counter order past its grace is shown and flagged unpaid", () => {
    // unpaid-counter-hidden
    expect(gate()).toEqual({ show: true, held: false, unpaid: true });
  });

  it("a COMPED line is cooked but is not unpaid food — the flag is `counterSentLine`, one definition", () => {
    // p2f-rev-lib/kds-gate/comped-flagged-unpaid — the floor, the lane and Clear all read
    // `counterSentLine`, which excludes a comp; the KDS must not call the same line Unpaid.
    expect(gate({ line: { comped: true } })).toEqual({ show: true, held: false, unpaid: false });
  });

  it("a fired line with no fire_at is shown now and is unpaid — fired at or before now", () => {
    // p2f-rev-lib/kds-gate/null-fire-at-in-grace
    expect(gate({ fireMs: null })).toEqual({ show: true, held: false, unpaid: true });
  });

  it("an open counter order is hidden inside its grace and once its session is cleared", () => {
    // counter-grace-shown
    expect(gate({ fireMs: NOW + 1000 })).toEqual({ show: false });
    // cleared-counter-cooks
    expect(gate({ sessionStatus: "closed" })).toEqual({ show: false });
  });

  it("a PAID counter order cooks, never flagged; without a slot its future fire_at is only the grace", () => {
    expect(gate({ cartStatus: "paid", sessionStatus: "closed" })).toEqual({
      show: true,
      held: false,
      unpaid: false,
    });
    // paid-counter-held: no pickup slot, so a future fire_at is the send's grace — hidden, not held
    expect(gate({ cartStatus: "paid", fireMs: NOW + 3000 })).toEqual({ show: false });
  });

  it("a PAID counter order WITH a pickup slot is held until slot − prep, as it always was", () => {
    // p2f-rev-lib/kds-gate/slotted-counter-hidden — a diner who joined the reg- code can set a slot
    // (`mms_set_pickup_slot`); settlement then fires at slot − prep, and the kitchen must SEE it held.
    expect(gate({ cartStatus: "paid", slotted: true, fireMs: NOW + 3_600_000 })).toEqual({
      show: true,
      held: true,
      unpaid: false,
    });
    expect(gate({ cartStatus: "paid", slotted: true })).toEqual({
      show: true,
      held: false,
      unpaid: false,
    });
  });

  it("a cancelled counter cart is hidden", () => {
    expect(gate({ cartStatus: "cancelled" })).toEqual({ show: false });
  });

  it("a DINER pickup / scan-and-go / kiosk cooks only paid; a future fire_at there is held", () => {
    // diner-pickup-cooks-unpaid
    expect(gate({ counterOrder: false })).toEqual({ show: false });
    expect(gate({ counterOrder: false, mode: "scango" })).toEqual({ show: false });
    expect(gate({ counterOrder: false, cartStatus: "paid" })).toEqual({
      show: true,
      held: false,
      unpaid: false,
    });
    expect(gate({ counterOrder: false, cartStatus: "paid", fireMs: NOW + 60_000 })).toEqual({
      show: true,
      held: true,
      unpaid: false,
    });
  });
});

describe("counterClearRefusal / mergeCounterRefusal", () => {
  it("Clear refuses a counter order with SENT food only", () => {
    expect(counterClearRefusal({ counterOrder: true, lines: [line()], nowMs: NOW })).toBe("sent");
    expect(
      counterClearRefusal({ counterOrder: true, lines: [line({ fire_at: ago(-5) })], nowMs: NOW }),
    ).toBeNull();
    expect(
      counterClearRefusal({ counterOrder: true, lines: [line({ state: "draft" })], nowMs: NOW }),
    ).toBeNull();
    // clear-refused-on-tables: a table with fired lines still clears (Clear's precedent)
    expect(counterClearRefusal({ counterOrder: false, lines: [line()], nowMs: NOW })).toBeNull();
  });

  it("Merge refuses any counter TARGET first, and a counter source with sent food", () => {
    const sent = { counterOrder: true, lines: [line()] };
    const drafts = { counterOrder: true, lines: [line({ state: "draft" })] };
    const table = { counterOrder: false, lines: [line()] };
    // merge-target-allowed (and target outranks sent)
    expect(mergeCounterRefusal({ src: sent, tgt: { counterOrder: true }, nowMs: NOW })).toBe(
      "target",
    );
    expect(mergeCounterRefusal({ src: table, tgt: { counterOrder: true }, nowMs: NOW })).toBe(
      "target",
    );
    // merge-sent-source-allowed
    expect(mergeCounterRefusal({ src: sent, tgt: { counterOrder: false }, nowMs: NOW })).toBe(
      "sent",
    );
    expect(
      mergeCounterRefusal({ src: drafts, tgt: { counterOrder: false }, nowMs: NOW }),
    ).toBeNull();
    expect(
      mergeCounterRefusal({ src: table, tgt: { counterOrder: false }, nowMs: NOW }),
    ).toBeNull();
  });
});

describe("counterSettleVariant — one filled pill on the table page", () => {
  const send = (emphasis: "primary" | "secondary", counter = true): StaffSendView => ({
    kind: "send",
    units: 2,
    emphasis,
    note: counter ? "payAtPickup" : null,
    blocked: null,
    staffAdded: 2,
    dinerUnits: 0,
    counter,
  });

  it("settle is primary under a secondary counter Send (walk-up)", () => {
    expect(counterSettleVariant(send("secondary"), "idle")).toBe("primary");
  });

  it("settle steps back when the counter Send is the primary (phone, or more after a send)", () => {
    // two-filled-pills
    expect(counterSettleVariant(send("primary"), "idle")).toBe("secondary");
  });

  it("everything sent (or nothing to send): taking payment is the job", () => {
    expect(counterSettleVariant({ kind: "counterSent" }, "idle")).toBe("primary");
    expect(counterSettleVariant({ kind: "none" }, "idle")).toBe("primary");
  });

  it("nothing is filled while this device's send is mid-life", () => {
    // undo-window-fills-a-pill
    for (const phase of ["sending", "undo", "undoing", "returning"] as const) {
      expect(counterSettleVariant({ kind: "counterSent" }, phase)).toBe("secondary");
      expect(counterSettleVariant(send("secondary"), phase)).toBe("secondary");
    }
  });
});

describe("unpaidBag — the lane shows food the kitchen HAS", () => {
  const bag = (lines: ReturnType<typeof line>[]) =>
    unpaidBag({ cartId: "c1", sessionId: "s1", customerName: "Aye", lines, nowMs: NOW });

  it("the sent lines, the unsent units beside them, and the earliest send", () => {
    const served = line({ state: "served", fire_at: ago(120) });
    const fired = line({ state: "fired", fire_at: ago(30) });
    const draft = line({ state: "draft", fire_at: null, qty: 2 });
    const grocery = line({ state: "draft", fulfillment: "grocery", fire_at: null, qty: 5 });
    const b = bag([fired, draft, served, grocery]);
    // draft-reads-as-cooking
    expect(b?.lines).toEqual([fired, served]);
    expect(b?.moreUnits).toBe(2);
    expect(b?.kitchen).toBe("cooking");
    expect(b?.sentAt).toBe(ago(120));
    expect(b).toMatchObject({ cartId: "c1", sessionId: "s1", customerName: "Aye" });
  });

  it("'done' when every SENT line is served, even with a draft still on the order", () => {
    const b = bag([line({ state: "served" }), line({ state: "draft", fire_at: null })]);
    expect(b?.kitchen).toBe("done");
    expect(b?.moreUnits).toBe(1);
  });

  it("a sent line with no fire_at dates the bag from now (fired at or before now)", () => {
    const b = bag([line({ state: "fired", fire_at: null })]);
    expect(b?.sentAt).toBe(new Date(NOW).toISOString());
    expect(bag([line({ fire_at: null }), line({ fire_at: ago(90) })])?.sentAt).toBe(ago(90));
  });

  it("a DONE bag carries its completion stamp — the latest bump; a cooking bag carries none", () => {
    // p2f-rev-lib/counter-order/bag-done-unstamped — the bell keys food by this stamp, so a second
    // batch that finishes later is a new event (a new ring), and the same finish is never two.
    const b = bag([
      line({ state: "served", bumped_at: ago(50) }),
      line({ state: "served", bumped_at: ago(20) }),
    ]);
    expect(b?.doneAt).toBe(ago(20));
    const cooking = bag([line({ state: "served", bumped_at: ago(50) }), line({ state: "fired" })]);
    expect(cooking?.doneAt).toBeNull();
  });

  it("null when nothing is sent — drafts only, or a send still in its grace", () => {
    // bag-shows-in-grace
    expect(bag([line({ fire_at: ago(-4) })])).toBeNull();
    expect(bag([line({ state: "draft", fire_at: null })])).toBeNull();
    expect(bag([])).toBeNull();
  });
});

describe("noShowOutcome — every RPC status, and never a silent ok", () => {
  it.each([
    ["ok", "ok"],
    // needs-approval-reads-ok
    ["needs_approval", "needs_pin"],
    // self-approve-reads-error
    ["self_approve", "bad_approver"],
    ["bad_approver", "bad_approver"],
    ["not_found", "not_open"],
    ["not_open", "not_open"],
    ["not_counter", "not_counter"],
    ["in_flight", "in_flight"],
    ["nothing_sent", "nothing_sent"],
    // p2f-rev-lib/counter-order/changed-reads-error — the sent set moved since the approver looked:
    // nothing was written, and "try again" after a fresh look is the honest steer.
    ["changed", "changed"],
    ["something_new", "error"],
    [null, "error"],
  ] as const)("%s → %s", (status, reason) => {
    expect(noShowOutcome(status)).toBe(reason);
  });
});
