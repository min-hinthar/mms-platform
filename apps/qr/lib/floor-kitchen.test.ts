import { describe, expect, it } from "vitest";
import {
  floorWait,
  foldFloorKitchen,
  kitchenSegments,
  upRose,
  type FloorKitchenRow,
} from "./floor-kitchen";
import { PULSE_PASS_LINGER_MS } from "./board-pulse";
import { DEFAULT_KDS_THRESHOLDS } from "./kds-urgency";

/**
 * Phase 2d · floor — the table card's kitchen row, decided as VALUES.
 *
 * Every rule here is the KDS's or the wall's own, read from where it lives: "in the kitchen" is
 * `PULSE_COOKING_STATES`, "ready to serve" is the wall's `PULSE_PASS_LINGER_MS` window, the send
 * grace is the `fire_at > now` skip the KDS and the wall both make, "late" is `kdsUrgency`, and "not
 * sent" is 2a's `staffOwedSendUnits(hostPresent, staffSendCounts(…))`. Each case separates the two
 * code paths its mutant would merge — a fixture both paths answer identically proves nothing.
 */
const NOW = Date.parse("2026-09-29T19:00:00.000Z");
const at = (msFromNow: number) => new Date(NOW + msFromNow).toISOString();
const MIN = 60_000;

const row = (over: Partial<FloorKitchenRow>): FloorKitchenRow => ({
  qty: 1,
  state: "fired",
  fulfillment: "dinein",
  fire_at: at(-2 * MIN),
  bumped_at: null,
  by_seat: null,
  onOpenCart: true,
  ...over,
});
const fold = (rows: FloorKitchenRow[], hostPresent = false) =>
  foldFloorKitchen(rows, { mode: "dinein", hostPresent, nowMs: NOW });

describe("foldFloorKitchen — what the floor may say about the kitchen", () => {
  it("a line still inside the send grace (fire_at ahead of now) counts nowhere and is not the oldest", () => {
    // MUTATION: drop the `fireMs > nowMs` skip → the held line counts as in the kitchen and its
    // (future) fire time never becomes the oldest only because a real line is older — so the count
    // is what reddens.
    const k = fold([row({ fire_at: at(3_000) }), row({ fire_at: at(-4 * MIN) })]);
    expect(k?.inKitchen).toBe(1);
    expect(k?.oldestFireAt).toBe(at(-4 * MIN));
  });

  it("a voided line is never counted; a comped one is (the kitchen still cooks it)", () => {
    // A voided line is in neither state set the fold counts (pinned as a value: widening the
    // cooking set to admit it would count it here).
    const k = fold([
      row({ state: "voided", fire_at: at(-5 * MIN) }),
      row({ state: "in_progress", fire_at: at(-3 * MIN) }),
    ]);
    expect(k?.inKitchen).toBe(1);
    expect(k?.oldestFireAt).toBe(at(-3 * MIN));
  });

  it("'not sent' is 2a's one count: dine-in drafts only — a to-go draft cooks at pay, grocery never fires", () => {
    const k = fold([
      row({ state: "draft", fire_at: null, qty: 2 }),
      row({ state: "draft", fire_at: null, fulfillment: "togo" }),
      row({ state: "draft", fire_at: null, fulfillment: "grocery" }),
    ]);
    expect(k?.notSent).toBe(2);
  });

  it("a paid cart's line is never 'not sent' — settlement fires it", () => {
    // MUTATION: count drafts from every row instead of the OPEN cart's → 3, not 1.
    const k = fold([
      row({ state: "draft", fire_at: null, onOpenCart: false, qty: 2 }),
      row({ state: "draft", fire_at: null }),
    ]);
    expect(k?.notSent).toBe(1);
  });

  it("a HOST table counts only what staff added — a diner's own round is theirs to send (owner 5c)", () => {
    // Two diner-added drafts and one staff-added: a hostless table owes all three, a host table
    // owes the one. MUTATION: ignore `hostPresent` → the host table reads 3.
    const rows = [
      row({ state: "draft", fire_at: null, by_seat: "seat-a", qty: 2 }),
      row({ state: "draft", fire_at: null, by_seat: null }),
    ];
    expect(fold(rows, true)?.notSent).toBe(1);
    expect(fold(rows, false)?.notSent).toBe(3);
  });

  it("'ready to serve' is the wall's window: bumped 4:59 ago is up, 5:01 ago is done, never bumped is done", () => {
    // MUTATION: drop the linger floor → all three read up.
    expect(PULSE_PASS_LINGER_MS).toBe(5 * MIN);
    const k = fold([
      row({ state: "served", bumped_at: at(-(4 * MIN + 59_000)), fire_at: at(-20 * MIN) }),
      row({ state: "served", bumped_at: at(-(5 * MIN + 1_000)), fire_at: at(-20 * MIN) }),
      row({ state: "served", bumped_at: null, fire_at: at(-20 * MIN) }),
    ]);
    expect(k?.up).toBe(1);
    expect(k?.done).toBe(2);
  });

  it("the oldest in-kitchen line is the MIN fire time, whatever the row order", () => {
    // MUTATION: keep the max → 18:04, not 18:00.
    const a = "2026-09-29T18:04:00.000Z";
    const b = "2026-09-29T18:00:00.000Z";
    expect(fold([row({ fire_at: a }), row({ fire_at: b })])?.oldestFireAt).toBe(b);
    expect(fold([row({ fire_at: b }), row({ fire_at: a })])?.oldestFireAt).toBe(b);
  });

  it("counts are dish UNITS: qty 3 is three in the kitchen", () => {
    // MUTATION: `+= 1` per row → 1.
    expect(fold([row({ qty: 3 })])?.inKitchen).toBe(3);
  });

  it("a table with nothing to say about the kitchen is null — never a row of zeros", () => {
    // MUTATION: return the zero record → the card would draw an empty kitchen row.
    expect(fold([])).toBeNull();
    expect(fold([row({ state: "voided" })])).toBeNull();
    // A host table whose only drafts are the diner's own: nothing staff owe, nothing cooking.
    expect(fold([row({ state: "draft", fire_at: null, by_seat: "seat-a" })], true)).toBeNull();
  });

  it("an unparsable fire time is skipped, never read as the epoch", () => {
    expect(fold([row({ fire_at: "not-a-date" })])).toBeNull();
  });
});

describe("kitchenSegments — the row's words, in visible order", () => {
  it("names every non-zero count in order: not sent · in kitchen · ready", () => {
    expect(
      kitchenSegments({ notSent: 2, inKitchen: 3, up: 1, done: 4, oldestFireAt: null }),
    ).toEqual([
      { k: "floor.kitchen.notSent", n: 2 },
      { k: "floor.kitchen.inKitchen", n: 3 },
      { k: "floor.kitchen.up", n: 1 },
    ]);
  });

  it("'Kitchen done' only when nothing is unsent, cooking or ready — a table still owing a Send is never 'done'", () => {
    // MUTATION: drop `notSent === 0` from the done test → ['notSent', 'kitchenDone'].
    expect(
      kitchenSegments({ notSent: 2, inKitchen: 0, up: 0, done: 3, oldestFireAt: null }),
    ).toEqual([{ k: "floor.kitchen.notSent", n: 2 }]);
    expect(
      kitchenSegments({ notSent: 0, inKitchen: 0, up: 0, done: 3, oldestFireAt: null }),
    ).toEqual([{ k: "expo.kitchenDone" }]);
    expect(kitchenSegments(null)).toEqual([]);
  });
});

describe("floorWait — the kitchen's own clock, in whole minutes", () => {
  const cooking = (oldest: string | null, inKitchen = 1) => ({
    notSent: 0,
    inKitchen,
    up: 0,
    done: 0,
    oldestFireAt: oldest,
  });

  it("no pill without something in the kitchen, however old the stamp", () => {
    // MUTATION: `inKitchen >= 0` → a pill on a table whose food is all served.
    expect(floorWait(cooking(at(-9 * MIN), 0), NOW, DEFAULT_KDS_THRESHOLDS)).toBeNull();
    expect(floorWait(null, NOW, DEFAULT_KDS_THRESHOLDS)).toBeNull();
  });

  it("nothing under a whole minute; '1 min' at exactly sixty seconds", () => {
    // MUTATION: drop the under-a-minute null → a '0 min' pill.
    expect(floorWait(cooking(at(-59_000)), NOW, DEFAULT_KDS_THRESHOLDS)).toBeNull();
    expect(floorWait(cooking(at(-60_000)), NOW, DEFAULT_KDS_THRESHOLDS)).toEqual({
      min: 1,
      level: "ok",
    });
  });

  it("the level is the KDS's dine-in rule with the configured thresholds", () => {
    const th = { ...DEFAULT_KDS_THRESHOLDS, dineinAmberMin: 5, dineinRedMin: 9, pickupAmberMin: 1 };
    expect(floorWait(cooking(at(-4 * MIN)), NOW, th)?.level).toBe("ok");
    expect(floorWait(cooking(at(-5 * MIN)), NOW, th)).toEqual({ min: 5, level: "amber" });
    expect(floorWait(cooking(at(-9 * MIN - 30_000)), NOW, th)).toEqual({ min: 9, level: "red" });
  });

  it("a stamp ahead of the clock reads as no wait, never a negative one", () => {
    expect(floorWait(cooking(at(2 * MIN)), NOW, DEFAULT_KDS_THRESHOLDS)).toBeNull();
  });
});

describe("upRose — food coming OUT is the one kitchen event that cues", () => {
  it("a rise cues; the same count, a decay and a recall do not", () => {
    expect(upRose(0, 1)).toBe(true);
    expect(upRose(1, 2)).toBe(true);
    // MUTATION: `!==` → a decay (the five-minute window closing) would ring the card.
    expect(upRose(1, 1)).toBe(false);
    expect(upRose(2, 1)).toBe(false);
  });

  it("first sight is never a rise — a table already showing food up on load must not ring", () => {
    // MUTATION: treat `undefined` as 0 → every table with food up rings on the first poll.
    expect(upRose(undefined, 1)).toBe(false);
  });
});
