import { describe, expect, it } from "vitest";
import type { KitchenStop, KitchenTicket } from "./kitchen-types";
import {
  boardOrder,
  foldStopRead,
  stopAckStatusOf,
  stopAckVerdict,
  stopArrivals,
  visibleStops,
  withStopAck,
  type StopAcks,
  type StopState,
} from "./kds-stop";

/**
 * M270 (1) — the stop card's pure half, falsified by values: what "Got it" answered, which cards the
 * board draws through a "Got it" in flight and a read that did not answer, and where each card
 * stands. Each case is the one an `m270/kds-stop/*` mutant turns red.
 */

const at = (min: number) => new Date(Date.UTC(2026, 9, 11, 18, min)).toISOString();
const stop = (clearId: string, min: number, key = `stop|${clearId}|b|${min}`): KitchenStop => ({
  key,
  clearId,
  tableNumber: 3,
  label: "t3",
  firedAt: at(min),
  lines: [],
});
const ticket = (key: string, min: number, held = false): KitchenTicket => ({
  key,
  cartId: `cart-${key}`,
  sessionId: `sess-${key}`,
  fireBatch: null,
  round: { kind: "none" },
  stampIso: at(min),
  channel: "dinein",
  label: key,
  tableNumber: 1,
  customerName: null,
  shortCode: null,
  pickupSlot: null,
  held,
  unpaid: false,
  lines: [],
  firedAt: at(min),
});
const keys = (items: ReturnType<typeof boardOrder>) =>
  items.map((it) => (it.kind === "stop" ? it.s.key : it.t.key));

describe("the RPC's answer, read — never cast", () => {
  it("takes exactly the four words mms_ack_table_clear_stop answers", () => {
    for (const s of ["ok", "already", "nothing_to_stop", "not_found"] as const)
      expect(stopAckStatusOf(s)).toBe(s);
  });
  it("refuses anything else: another word, a null, a number, an object", () => {
    // MUTATION m270/kds-stop/status-unread: a word nobody defined would hide a stop card.
    for (const raw of ["OK", "acknowledged", "", null, undefined, 1, { status: "ok" }])
      expect(stopAckStatusOf(raw)).toBeNull();
  });
});

describe("what a confirmed answer does to the card", () => {
  it("ok, already and nothing_to_stop: the kitchen has it — gone, never a failure", () => {
    // MUTATION m270/kds-stop/already-reread: another tablet's Got it would put the card back.
    expect(stopAckVerdict("ok")).toBe("gone");
    expect(stopAckVerdict("already")).toBe("gone");
    expect(stopAckVerdict("nothing_to_stop")).toBe("gone");
  });
  it("not_found: no such record — the hide is dropped and the next read decides", () => {
    // MUTATION m270/kds-stop/not-found-gone: a record the RPC never found would read acknowledged.
    expect(stopAckVerdict("not_found")).toBe("reread");
  });
});

describe("which stop cards the board draws", () => {
  const a1 = stop("A", 1, "stop|A|b|1");
  const a2 = stop("A", 2, "stop|A|b|2");
  const b = stop("B", 3);
  it("hides every card of a clear whose Got it is out or confirmed — one tap, the whole clear", () => {
    const acks: StopAcks = new Map([["A", { phase: "out" }]]);
    // MUTATION m270/kds-stop/hide-ignored: the cards stay up under the finger until the answer.
    expect(visibleStops([a1, a2, b], acks).map((s) => s.key)).toEqual([b.key]);
    expect(visibleStops([a1, a2, b], new Map()).map((s) => s.key)).toEqual([a1.key, a2.key, b.key]);
  });

  it("a read that did not answer changes NOTHING — the cards last drawn, and every hide over them", () => {
    const prev: StopState = {
      stops: [a1, b],
      acks: new Map([["A", { phase: "done", afterSeq: 4 }]]),
    };
    // MUTATION m270/kds-stop/null-blanks: a failed read would read as "no stop cards" — a table the
    // kitchen never acknowledged, gone from the board.
    expect(foldStopRead(prev, null, 9)).toBe(prev);
  });

  it("a read that answered replaces the cards and retires every confirmed hide its fetch started after", () => {
    const prev: StopState = {
      stops: [a1, b],
      acks: new Map<string, { phase: "out" } | { phase: "done"; afterSeq: number }>([
        ["A", { phase: "done", afterSeq: 4 }],
        ["B", { phase: "done", afterSeq: 5 }],
        ["C", { phase: "out" }],
      ]),
    };
    const next = foldStopRead(prev, [b], 5);
    expect(next.stops).toEqual([b]);
    // seq 5 started after A's answer (afterSeq 4): A retires. B's answer came at seq 5 — this read
    // may have run before that write committed, so B stays hidden. C is still out: it stays.
    // MUTATION m270/kds-stop/prune-at-same-seq: B's card would come back for a beat.
    expect([...next.acks.keys()].sort()).toEqual(["B", "C"]);
    // MUTATION m270/kds-stop/out-pruned: a Got it still in flight would be put back by any read.
    expect(foldStopRead(prev, [], 99).acks.has("C")).toBe(true);
    expect(foldStopRead(prev, [], 99).acks.has("B")).toBe(false);
  });

  it("withStopAck sets one clear's hide, and null drops it (the revert to confirmed)", () => {
    const one = withStopAck(new Map(), "A", { phase: "out" });
    expect(one.get("A")).toEqual({ phase: "out" });
    expect(withStopAck(one, "A", null).has("A")).toBe(false);
    expect(withStopAck(one, "B", null).has("A")).toBe(true);
  });

  it("a card is news once: only keys the board has not drawn", () => {
    expect(stopArrivals(new Set([a1.key]), [a1, b]).map((s) => s.key)).toEqual([b.key]);
    expect(stopArrivals(new Set([a1.key, b.key]), [a1, b])).toEqual([]);
  });
});

describe("where each stop card stands — the slot its ticket stood in", () => {
  it("among the LIVE tickets by its Send's own stamp, never first and never after the held cards", () => {
    const t1 = ticket("t1", 1);
    const t5 = ticket("t5", 5);
    const h = ticket("h", 0, true);
    // MUTATION m270/kds-stop/stops-first: the card jumps to the top and every card after its slot
    // shifts under the cook's hand.
    expect(keys(boardOrder([t1, t5, h], [stop("A", 3)]))).toEqual(["t1", "stop|A|b|3", "t5", "h"]);
    // MUTATION m270/kds-stop/stops-after-held: a stop card older than every live ticket would sit
    // behind the held cards (and, on a full board, on another page).
    expect(keys(boardOrder([t5, h], [stop("A", 0)]))).toEqual(["stop|A|b|0", "t5", "h"]);
  });

  it("equal stamps keep the ticket first; each list keeps its own order", () => {
    const t3 = ticket("t3", 3);
    expect(keys(boardOrder([t3], [stop("A", 3)]))).toEqual(["t3", "stop|A|b|3"]);
    expect(keys(boardOrder([], [stop("A", 1), stop("B", 2)]))).toEqual([
      "stop|A|b|1",
      "stop|B|b|2",
    ]);
    expect(keys(boardOrder([ticket("x", 1), ticket("y", 2)], []))).toEqual(["x", "y"]);
  });
});
