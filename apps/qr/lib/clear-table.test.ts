import { describe, expect, it } from "vitest";
import {
  clearAnswerOf,
  clearIsLoss,
  clearPreviewOf,
  clearRefusalSays,
  clearSentLine,
  type ClearRow,
} from "./clear-table";
import { clearHint, type ClearVerdictInput } from "./clear-verdict";

/**
 * PD7 · M182 — the clear's pure rules, pinned. Red-first by mutant (verify:slice `clear/*`): each
 * case names the mutation that reddens it. The SQL twin of `clearSentLine` is `mms_clear_table`'s
 * SENT predicate, pinned by supabase/tests/m182_table_clear_test.sql.
 */
const NOW = Date.parse("2026-10-09T18:00:00.000Z");
const PAST = "2026-10-09T17:57:00.000Z";
const FUTURE = "2026-10-09T18:00:08.000Z";
const row = (over: Partial<ClearRow> & { id: string }): ClearRow => ({
  name: "Mohinga",
  qty: 1,
  unit_price_cents: 1400,
  state: "fired",
  fulfillment: "dinein",
  comped: false,
  fire_at: PAST,
  menu_item_id: "m-mohinga",
  ...over,
});

describe("clearSentLine — the SQL's SENT, exactly", () => {
  it("fired, cooking and served dishes past their grace are SENT", () => {
    expect(clearSentLine(row({ id: "a" }), NOW)).toBe(true);
    expect(clearSentLine(row({ id: "b", state: "in_progress" }), NOW)).toBe(true);
    expect(clearSentLine(row({ id: "c", state: "served" }), NOW)).toBe(true);
    // A NULL fire_at is fired at or before now (the KDS shows it).
    expect(clearSentLine(row({ id: "d", fire_at: null }), NOW)).toBe(true);
    // At the DB clock exactly: due (<=).
    expect(clearSentLine(row({ id: "e", fire_at: "2026-10-09T18:00:00.000Z" }), NOW)).toBe(true);
  });
  it("a draft, a dish still in its grace, a comp and grocery are not", () => {
    // MUTATION clear/sent-counts-drafts → red.
    expect(clearSentLine(row({ id: "a", state: "draft", fire_at: null }), NOW)).toBe(false);
    // MUTATION clear/sent-counts-in-grace → red.
    expect(clearSentLine(row({ id: "b", fire_at: FUTURE }), NOW)).toBe(false);
    // MUTATION clear/sent-counts-comps → red.
    expect(clearSentLine(row({ id: "c", comped: true }), NOW)).toBe(false);
    // MUTATION clear/sent-counts-grocery → red.
    expect(clearSentLine(row({ id: "d", fulfillment: "grocery" }), NOW)).toBe(false);
    expect(clearSentLine(row({ id: "e", state: "voided" }), NOW)).toBe(false);
  });
});

describe("clearPreviewOf — the slip's dishes and its ONE figure", () => {
  const rows: ClearRow[] = [
    row({ id: "l3", name: "Shan Noodles", unit_price_cents: 1300, menu_item_id: "m-shan" }),
    row({ id: "l1", state: "in_progress", qty: 2 }),
    row({ id: "l2", name: "Mee-Shay", state: "served" }),
    row({ id: "d1", state: "draft", fire_at: null, qty: 3 }),
    row({ id: "g1", state: "fired", fire_at: FUTURE }),
    row({ id: "c1", state: "in_progress", comped: true }),
  ];
  const p = clearPreviewOf(rows, NOW, "2026-10-09T18:00:00.000000+00:00", (id) =>
    id === "m-mohinga" ? "မုန့်ဟင်းခါး" : null,
  );
  it("the SENT dishes in id order (the RPC's), each its own unit × qty", () => {
    expect(p.sent.map((l) => l.id)).toEqual(["l1", "l2", "l3"]);
    // MUTATION clear/line-figure-one-portion (unit, not unit × qty) → red.
    expect(p.sent.map((l) => l.amountCents)).toEqual([2800, 1400, 1300]);
    expect(p.sent[0]!.nameMy).toBe("မုန့်ဟင်းခါး");
    expect(p.sent[2]!.nameMy).toBeNull();
  });
  it("the loss is Σ over the SENT set — never the drafts, the in-grace fire or the comp", () => {
    // 2800 + 1400 + 1300 = 5500 (node -e 'console.log(2800+1400+1300)').
    expect(p.lossCents).toBe(5500);
    // 2 + 1 + 1 = 4 dishes — the count the RPC answers with.
    expect(p.units).toBe(4);
    // MUTATION clear/dropped-counts-the-comp → red: 3 drafts + 1 in-grace = 4, the comp is a loss
    // already recorded, never "dropped".
    expect(p.droppedUnits).toBe(4);
    expect(p.seenAt).toBe("2026-10-09T18:00:00.000000+00:00");
    expect(clearIsLoss(p)).toBe(true);
  });
  it("nothing SENT: a free clear (straight to the Undo window, no slip)", () => {
    const free = clearPreviewOf([row({ id: "d", state: "draft", fire_at: null })], NOW, "x");
    // MUTATION clear/every-clear-a-loss → red.
    expect(clearIsLoss(free)).toBe(false);
    expect(free.lossCents).toBe(0);
  });
});

describe("clearAnswerOf — the RPC's jsonb, read defensively", () => {
  it("ok with its own count and figure", () => {
    expect(clearAnswerOf({ status: "ok", dishes: 3, loss_cents: 4100, clear_id: "x" })).toEqual({
      status: "ok",
      dishes: 3,
      lossCents: 4100,
    });
  });
  it("every refusal by name; anything else is unreadable, never 'cleared'", () => {
    for (const r of ["joined", "changed", "in_flight", "card_live", "closed", "needs_approval"])
      expect(clearAnswerOf({ status: r }).status).toBe(r);
    // MUTATION clear/answer-trusts-any-ok (the count unchecked) → red.
    expect(clearAnswerOf({ status: "ok", dishes: "3", loss_cents: 100 }).status).toBe("unreadable");
    expect(clearAnswerOf({ status: "ok", dishes: -1, loss_cents: 0 }).status).toBe("unreadable");
    expect(clearAnswerOf({ status: "ok", dishes: 1.5, loss_cents: 0 }).status).toBe("unreadable");
    expect(clearAnswerOf({ status: "cleared" }).status).toBe("unreadable");
    expect(clearAnswerOf("ok").status).toBe("unreadable");
    expect(clearAnswerOf(null).status).toBe("unreadable");
  });
});

describe("clearRefusalSays — the dictionary's words, and when to look again", () => {
  it("a change or a join under the look asks for a fresh look; money in flight does not", () => {
    expect(clearRefusalSays("changed")).toEqual({ k: "table.noshow.err.changed", relook: true });
    // MUTATION clear/joined-reads-as-changed → red: the join's own sentence names WHY it stayed.
    expect(clearRefusalSays("joined")).toEqual({ k: "settle.clear.joined", relook: true });
    expect(clearRefusalSays("in_flight")).toEqual({ k: "settle.clear.midPayment", relook: false });
    expect(clearRefusalSays("card_live")).toEqual({ k: "settle.clear.cardLive", relook: false });
    expect(clearRefusalSays("needs_approval").k).toBe("settle.clear.needsManager");
  });
});

describe("clearHint — the paid card's quiet 'Clear when they leave'", () => {
  const GO: ClearVerdictInput = {
    status: "paid",
    refundState: "none",
    tab: "none",
    itemCount: 0,
    kitchen: { notSent: 0, inKitchen: 0, up: 0 },
    kitchenUnknown: false,
  };
  it("a paid, finished table the floor can vouch for", () => {
    expect(clearHint(GO)).toBe(true);
    expect(clearHint({ ...GO, refundState: null })).toBe(true);
    // A null kitchen is the fold's "nothing in the kitchen" (known), never "unknown".
    // MUTATION clear-hint/null-kitchen-unknown → a finished table never shows the hint; red.
    expect(clearHint({ ...GO, kitchen: null })).toBe(true);
  });
  it("never an ordering, refunded, tabbed, re-ordering, still-eating or unknown table", () => {
    // MUTATION clear-hint/any-status → red.
    expect(clearHint({ ...GO, status: "ordering" })).toBe(false);
    expect(clearHint({ ...GO, status: "seated" })).toBe(false);
    // MUTATION clear-hint/refunded-goes → red.
    expect(clearHint({ ...GO, refundState: "partial" })).toBe(false);
    expect(clearHint({ ...GO, refundState: "full" })).toBe(false);
    // MUTATION clear-hint/tab-goes → red.
    expect(clearHint({ ...GO, tab: "trust" })).toBe(false);
    // MUTATION clear-hint/second-round-goes → red.
    expect(clearHint({ ...GO, itemCount: 1 })).toBe(false);
    // MUTATION clear-hint/served-just-now-goes (the 5-minute linger ignored) → red.
    expect(clearHint({ ...GO, kitchen: { notSent: 0, inKitchen: 0, up: 1 } })).toBe(false);
    expect(clearHint({ ...GO, kitchen: { notSent: 0, inKitchen: 1, up: 0 } })).toBe(false);
    expect(clearHint({ ...GO, kitchen: { notSent: 1, inKitchen: 0, up: 0 } })).toBe(false);
    // MUTATION clear-hint/unknown-kitchen-goes → red.
    expect(clearHint({ ...GO, kitchenUnknown: true })).toBe(false);
    expect(clearHint({ ...GO, kitchen: null, kitchenUnknown: true })).toBe(false);
  });
});
