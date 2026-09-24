import { describe, expect, it } from "vitest";
import {
  pendingBlocker,
  pendingCounts,
  pendingReduce,
  pendingUnitsByItem,
  type PendingAdd,
} from "./pad-pending";

/**
 * Phase 2c · pad — the order pad's in-flight adds, as values. Every rule here is what decides
 * whether a ghost row says "Adding…", "Checking…" or offers "Send again", and when it leaves: a
 * ghost that lingers doubles the dish on screen, a ghost that leaves early hides a dish that may be
 * on the bill.
 */
const tap = (key: string, itemId = "mohinga", qty = 1) =>
  ({ kind: "tap", key, itemId, name: itemId, nameMy: null, qty }) as const;

function run(...events: Parameters<typeof pendingReduce>[1][]): PendingAdd[] {
  return events.reduce<PendingAdd[]>((s, e) => pendingReduce(s, e), []);
}

describe("pendingReduce — a tap to a landing", () => {
  it("a tap is flying; ok lands it with the read sequence it landed under", () => {
    const s = run(tap("k1"), { kind: "ok", key: "k1", seq: 5 });
    expect(s).toEqual([
      expect.objectContaining({ key: "k1", state: "landed", landedSeq: 5, itemId: "mohinga" }),
    ]);
  });

  it("a read that STARTED before the landing keeps the ghost; one that started after drops it", () => {
    const landed = run(tap("k1"), { kind: "ok", key: "k1", seq: 5 });
    // MUTATION: a commit that drops every landed entry whatever its seq — a poll already in the air
    // when the add landed shows the order WITHOUT it, and the ghost vanishes with nothing in its
    // place (the dish looks lost for up to 5s); red.
    expect(pendingReduce(landed, { kind: "commit", readStartSeq: 4 })).toHaveLength(1);
    // MUTATION: `<=` → the read that started AT the landing seq — it may be the very read that was
    // in flight while the write committed; kept here, dropped only by a strictly later start. Red on
    // a commit that never drops.
    expect(pendingReduce(landed, { kind: "commit", readStartSeq: 5 })).toHaveLength(1);
    expect(pendingReduce(landed, { kind: "commit", readStartSeq: 6 })).toEqual([]);
  });

  it("a commit never drops what has not landed", () => {
    const s = run(tap("k1"), tap("k2"), { kind: "timeout", key: "k2" });
    expect(pendingReduce(s, { kind: "commit", readStartSeq: 99 })).toHaveLength(2);
  });
});

describe("pendingReduce — the unknown outcomes", () => {
  it("15s with no answer is unconfirmed; a late ok still lands it", () => {
    const s = run(tap("k1"), { kind: "timeout", key: "k1" });
    expect(s[0]?.state).toBe("unconfirmed");
    expect(pendingReduce(s, { kind: "ok", key: "k1", seq: 3 })[0]).toMatchObject({
      state: "landed",
      landedSeq: 3,
    });
  });

  it("a rejected action is lost; retry flies it again under the SAME key", () => {
    const lost = run(tap("k1"), { kind: "rejected", key: "k1" });
    expect(lost[0]?.state).toBe("lost");
    const again = pendingReduce(lost, { kind: "retry", key: "k1" });
    // MUTATION: a retry that mints a new entry/key — the resend would then add the dish TWICE
    // (the ledger dedupes by key only); red.
    expect(again).toEqual([expect.objectContaining({ key: "k1", state: "flying" })]);
  });

  it("a timeout only moves a flying add (a landed one stays landed)", () => {
    const s = run(tap("k1"), { kind: "ok", key: "k1", seq: 1 }, { kind: "timeout", key: "k1" });
    expect(s[0]?.state).toBe("landed");
  });
});

describe("pendingReduce — a refusal is removed by KEY", () => {
  it("refused removes that attempt; a second in-flight tap of the same dish survives", () => {
    const s = run(tap("k1", "mohinga"), tap("k2", "mohinga"), { kind: "refused", key: "k1" });
    // MUTATION: removing by itemId — the second Mohinga, still on its way, vanishes from the
    // ticket while it may yet land on the bill; red.
    expect(s).toEqual([expect.objectContaining({ key: "k2", state: "flying" })]);
  });

  it("a tap for a key already pending is not a second entry", () => {
    expect(run(tap("k1"), tap("k1"))).toHaveLength(1);
  });
});

describe("pendingCounts / pendingUnitsByItem / pendingBlocker", () => {
  const s = run(
    tap("a", "mohinga", 2),
    tap("b", "mohinga"),
    tap("c", "tea"),
    tap("d", "salad"),
    { kind: "ok", key: "b", seq: 1 },
    { kind: "timeout", key: "c" },
    { kind: "rejected", key: "d" },
  );

  it("splits flying / unseen (landed, not yet in a read) / unconfirmed / lost", () => {
    // MUTATION: counting landed as flying — the Send would stay "bare" but the subtotal and the
    // Settle amount would reappear over a dish the read has not shown yet; red.
    expect(pendingCounts(s)).toEqual({ flying: 1, unseen: 1, unconfirmed: 1, lost: 1 });
    expect(pendingCounts([])).toEqual({ flying: 0, unseen: 0, unconfirmed: 0, lost: 0 });
  });

  it("units per dish sum every pending attempt's qty", () => {
    const u = pendingUnitsByItem(s);
    expect(u.get("mohinga")).toBe(3);
    expect(u.get("tea")).toBe(1);
    expect(u.get("salad")).toBe(1);
    expect(u.get("rice")).toBeUndefined();
  });

  it("the blocker is the first add whose fate is unknown", () => {
    expect(pendingBlocker(s)?.key).toBe("c");
    // Flying and landed adds are not blockers — only the unknown ones hold Send and Settle.
    expect(pendingBlocker(run(tap("a"), { kind: "ok", key: "a", seq: 1 }))).toBeNull();
    expect(pendingBlocker(run(tap("a"), { kind: "rejected", key: "a" }))?.key).toBe("a");
  });
});
