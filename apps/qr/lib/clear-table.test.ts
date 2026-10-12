import { describe, expect, it } from "vitest";
import {
  clearAnswerOf,
  clearIsLoss,
  clearLineKey,
  clearNeedsTheCard,
  clearPaidUnserved,
  clearPreviewOf,
  clearRefusalSays,
  clearSentLine,
  clearStopsKitchen,
  type ClearPreview,
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
    // A comped DRAFT: the kitchen never had it either — dropped, as the no-show drops it.
    row({ id: "c2", state: "draft", fire_at: null, comped: true }),
    // A voided line: no longer on the order — neither sent, dropped, nor one of the look's lines.
    row({ id: "v1", state: "voided" }),
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
    // The no-show's rule (`counterNoShowDropped`): 3 drafts + 1 in-grace fire + 1 comped draft = 5
    // (node -e 'console.log(3+1+1)'); the comp the kitchen HAS is neither sent nor dropped.
    // MUTATION clear/dropped-misses-the-grace (drafts only) → 4; red.
    expect(p.droppedUnits).toBe(5);
    expect(p.seenAt).toBe("2026-10-09T18:00:00.000000+00:00");
    expect(clearIsLoss(p)).toBe(true);
  });
  it("the look's LINES: every live line's key, voided ones left out (Codex P1 on #341)", () => {
    // MUTATION clear/lines-count-voided → "v1:1:dinein:sent" joins the look, and the RPC (which
    // reads live lines only) refuses every clear over a table with a void as changed; red.
    // MUTATION clear/lines-only-the-sent → the drafts leave the look, so a draft re-counted after it
    // can never be told apart; red.
    expect(p.lines).toEqual([
      "c1:1:dinein:sent",
      "c2:1:dinein:draft",
      "d1:3:dinein:draft",
      "g1:1:dinein:sent",
      "l1:2:dinein:sent",
      "l2:1:dinein:sent",
      "l3:1:dinein:sent",
    ]);
  });
  it("nothing SENT: a free clear (straight to the Undo window, no slip)", () => {
    const free = clearPreviewOf([row({ id: "d", state: "draft", fire_at: null })], NOW, "x");
    // MUTATION clear/every-clear-a-loss → red.
    expect(clearIsLoss(free)).toBe(false);
    expect(free.lossCents).toBe(0);
  });
});

describe("clearStopsKitchen — the slip says 'tells the kitchen to stop' only when it will (M270 (1))", () => {
  const look = (...states: ("fired" | "in_progress" | "served")[]): ClearPreview => ({
    seenAt: "2026-10-09T18:00:00Z",
    sent: states.map((state, i) => ({
      id: `l${i}`,
      qty: 1,
      name: "Mohinga",
      nameMy: null,
      state,
      amountCents: 1400,
    })),
    lossCents: 1400 * states.length,
    units: states.length,
    droppedUnits: 0,
    lines: [],
  });
  it("a SENT dish still fired or cooking: the clear stops it, and the kitchen's card says so", () => {
    expect(clearStopsKitchen(look("fired"))).toBe(true);
    expect(clearStopsKitchen(look("served", "in_progress"))).toBe(true);
  });
  it("every SENT dish served — or none sent: nothing to stop, and the slip says nothing of the kitchen", () => {
    // MUTATION m270/clear-table/served-stops: a served table hears a promise no card keeps.
    expect(clearStopsKitchen(look("served"))).toBe(false);
    expect(clearStopsKitchen(look("served", "served"))).toBe(false);
    expect(clearStopsKitchen(look())).toBe(false);
  });
});

describe("clearLineKey — one live line as the look saw it (Codex P1 on #341)", () => {
  it("`<id>:<qty>:<fulfillment>:draft|sent` — the string mms_clear_table builds (M182.17 pins it)", () => {
    expect(clearLineKey(row({ id: "a", qty: 2 }))).toBe("a:2:dinein:sent");
    expect(clearLineKey(row({ id: "d", state: "draft", fire_at: null, fulfillment: "togo" }))).toBe(
      "d:1:togo:draft",
    );
  });
  it("a re-count, a send and a to-go flip each change the key; the kitchen's own progress never does", () => {
    const draft = row({ id: "d", state: "draft", fire_at: null });
    // MUTATION clear/line-key-drops-qty → a draft re-counted after the look reads as the same; red.
    expect(clearLineKey({ ...draft, qty: 3 })).not.toBe(clearLineKey(draft));
    // MUTATION clear/line-key-ignores-the-send → a draft sent after the look reads as the same; red.
    expect(clearLineKey(row({ id: "d", state: "fired", fire_at: FUTURE }))).not.toBe(
      clearLineKey(draft),
    );
    // MUTATION clear/line-key-drops-fulfillment → a draft turned to-go reads as the same; red.
    expect(clearLineKey({ ...draft, fulfillment: "togo" })).not.toBe(clearLineKey(draft));
    const sent = row({ id: "s" });
    // MUTATION clear/line-key-reads-kitchen-state → a cook starting a sent dish refuses the clear
    // (ruling #6: a clear never waits on the kitchen); red.
    expect(clearLineKey({ ...sent, state: "in_progress" })).toBe(clearLineKey(sent));
    expect(clearLineKey({ ...sent, state: "served" })).toBe(clearLineKey(sent));
  });
});

describe("clearPaidUnserved — a PAID cart's food the kitchen has not finished holds the clear", () => {
  const paid = (state: string, fulfillment = "dinein") => ({ state, fulfillment });
  it("a paid draft (settlement fires it), a fired dish, a dish being cooked — comped or not", () => {
    // MUTATION clear/paid-unserved-drafts-ignored → a paid draft is fired into a closed table; red.
    expect(clearPaidUnserved([paid("draft")])).toBe(true);
    // MUTATION clear/paid-unserved-fired-ignored → red.
    expect(clearPaidUnserved([paid("fired")])).toBe(true);
    // MUTATION clear/paid-unserved-cooking-ignored → red.
    expect(clearPaidUnserved([paid("in_progress")])).toBe(true);
    expect(clearPaidUnserved([paid("served"), paid("fired", "togo")])).toBe(true);
  });
  it("served, voided or grocery never holds it — and no paid lines at all is a free clear", () => {
    // MUTATION clear/paid-unserved-counts-served → a paid, finished table can never be cleared; red.
    expect(clearPaidUnserved([paid("served")])).toBe(false);
    expect(clearPaidUnserved([paid("voided")])).toBe(false);
    // MUTATION clear/paid-unserved-counts-grocery → a paid bag line holds the table forever; red.
    expect(clearPaidUnserved([paid("fired", "grocery")])).toBe(false);
    expect(clearPaidUnserved([])).toBe(false);
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
    // MUTATION clear/secure-refusal-unread → the secured-tab refusal reads as "couldn't confirm"
    // (and the pane offers a retry the server will refuse again); red.
    expect(clearAnswerOf({ status: "secure_tab" }).status).toBe("secure_tab");
    // MUTATION clear/paid-unserved-unread → the paid-food refusal reads as "couldn't confirm" — the
    // pane offers a retry the server refuses again, and never says the food is still cooking; red.
    expect(clearAnswerOf({ status: "paid_unserved" }).status).toBe("paid_unserved");
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
    // Codex P1 on #341 — the clear's OWN sentence ("…changed after you looked, so it stayed open"):
    // the no-show's line never said that nothing was cleared.
    // MUTATION clear/changed-says-the-no-shows → red.
    expect(clearRefusalSays("changed")).toEqual({ k: "settle.clear.changed", relook: true });
    // MUTATION clear/joined-reads-as-changed → red: the join's own sentence names WHY it stayed.
    expect(clearRefusalSays("joined")).toEqual({ k: "settle.clear.joined", relook: true });
    expect(clearRefusalSays("in_flight")).toEqual({ k: "settle.clear.midPayment", relook: false });
    expect(clearRefusalSays("card_live")).toEqual({ k: "settle.clear.cardLive", relook: false });
    expect(clearRefusalSays("needs_approval").k).toBe("settle.clear.needsManager");
    // MUTATION clear/secure-refusal-says-manager → a card-on-file table is told it needs a manager,
    // never that the saved card is the way out; red.
    expect(clearRefusalSays("secure_tab")).toEqual({ k: "settle.clear.secureTab", relook: false });
    // Codex P1 on #341 — paid food not yet served: the way out is the kitchen (serve it or bag it),
    // and a fresh look would only say the same.
    // MUTATION clear/paid-unserved-says-changed → told to look again at a table that has not moved; red.
    expect(clearRefusalSays("paid_unserved")).toEqual({
      k: "settle.clear.paidUnserved",
      relook: false,
    });
  });
});

describe("clearNeedsTheCard — a secured tab's SENT food is the card's, never a walkout", () => {
  const sent = clearPreviewOf([row({ id: "a" })], NOW, "2026-10-09T18:00:00.000Z");
  const nothingSent = clearPreviewOf(
    [row({ id: "b", state: "draft", fire_at: null })],
    NOW,
    "2026-10-09T18:00:00.000Z",
  );
  it("a secured tab with a dish SENT: no slip — close the bill on the card", () => {
    // MUTATION clear/secure-look-ignored → the slip and its walkout over a card that can pay; red.
    expect(clearNeedsTheCard("secure", sent)).toBe(true);
  });
  it("…but nothing sent is nothing to charge, and only a SECURED tab holds a card", () => {
    // MUTATION clear/secure-look-ignores-the-loss → a secured table with nothing sent can never be
    // cleared from the pane; red.
    expect(clearNeedsTheCard("secure", nothingSent)).toBe(false);
    // MUTATION clear/secure-look-every-tab → a trust tab (no card saved) is sent to a card door it
    // does not have; red.
    expect(clearNeedsTheCard("trust", sent)).toBe(false);
    expect(clearNeedsTheCard("none", sent)).toBe(false);
    expect(clearNeedsTheCard(null, sent)).toBe(false);
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
