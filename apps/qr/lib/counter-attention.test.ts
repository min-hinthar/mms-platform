import { describe, expect, it } from "vitest";
import {
  counterRing,
  factSubject,
  floorFacts,
  laneFacts,
  mayRing,
  RING_GAP_MS,
  type CounterFacts,
} from "./counter-attention";
import type { ExpoTicket } from "./expo-types";
import type { FloorTable } from "./floor-types";

/**
 * Phase 2d · bell — the rules that decide whether the counter bell rings. A bell that rings falsely
 * or twice teaches the family to mute it, so every case here is a way it could, pinned against the
 * rule that stops it. Each rule has a verify:slice mutant (`counter-attention/…`) that turns this
 * suite red.
 */

type Table = Pick<FloorTable, "sessionId" | "status" | "counterRequestedAt">;
type Ticket = Pick<ExpoTicket, "orderId" | "status" | "arrivedAt" | "kitchen" | "lines">;

const ASK_AT = "2026-09-29T18:00:00.000Z";
const LATER_ASK = "2026-09-29T18:20:00.000Z";
const ARRIVED = "2026-09-29T18:05:00.000Z";
const S1 = "11111111-1111-4111-8111-111111111111";
const S2 = "22222222-2222-4222-8222-222222222222";
const O1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const O2 = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const table = (sessionId: string, over: Partial<Table> = {}): Table => ({
  sessionId,
  status: "ordering",
  counterRequestedAt: null,
  ...over,
});
const asking = (sessionId: string, at = ASK_AT): Table =>
  table(sessionId, { status: "counter", counterRequestedAt: at });

const togo = [{ fulfillment: "togo" as const }];
const grocery = [{ fulfillment: "grocery" as const }, { fulfillment: "grocery" as const }];
const mixed = [{ fulfillment: "grocery" as const }, { fulfillment: "togo" as const }];
const bag = (orderId: string, over: Partial<Ticket> = {}): Ticket => ({
  orderId,
  status: "preparing",
  arrivedAt: null,
  kitchen: "cooking",
  lines: togo as unknown as Ticket["lines"],
  ...over,
});
const lines = (l: readonly { fulfillment: "togo" | "grocery" }[]) =>
  l as unknown as Ticket["lines"];

/** Run a board's polls through the seen set exactly as a board does: seed on the first, then each
 *  good poll in turn. Returns every poll's ring after the seed. */
function polls(seed: CounterFacts | null, ...next: CounterFacts[]) {
  let seen = seed === null ? null : counterRing(null, seed).seen;
  const rings: Array<"guest" | "food" | null> = [];
  for (const f of next) {
    const r = counterRing(seen, f);
    seen = r.seen;
    rings.push(r.ring);
  }
  return rings;
}

describe("floorFacts — a table asking to pay at the counter", () => {
  it("is a guest fact keyed by the session AND the ask's stamp; no other status is", () => {
    const f = floorFacts([
      asking(S1),
      table(S2, { status: "paying", counterRequestedAt: ASK_AT }),
      table("s3", { status: "ordering" }),
      table("s4", { status: "paid" }),
    ]);
    expect([...f.guest]).toEqual([`ask:${S1}:${ASK_AT}`]);
    expect(f.food.size).toBe(0);
  });

  it("a table that asks AGAIN after its ask was answered (a new stamp) rings again", () => {
    // MUTATION (counter-attention/the-ask-forgets-its-stamp): key the ask by the session alone — the
    // second ask reads as the first and the counter never hears it.
    const rings = polls(
      floorFacts([]),
      floorFacts([asking(S1)]),
      floorFacts([table(S1)]),
      floorFacts([asking(S1, LATER_ASK)]),
    );
    expect(rings).toEqual(["guest", null, "guest"]);
  });
});

describe("laneFacts — an arrival, a basket at the exit, a finished bag", () => {
  it("'I'm here' is a guest fact at ANY stage", () => {
    const f = laneFacts([
      bag(O1, { arrivedAt: ARRIVED }),
      bag(O2, { arrivedAt: ARRIVED, status: "ready" }),
    ]);
    expect([...f.guest].sort()).toEqual([`here:${O1}`, `here:${O2}`].sort());
    expect(f.food.size).toBe(0);
  });

  it("a scan-and-go basket is a guest fact only while it waits for its exit check", () => {
    // MUTATION (counter-attention/a-verified-basket-is-a-guest): drop `status === "preparing"` — a
    // basket that ARRIVES already verified (another tablet checked it) rings a guest nobody is
    // waiting on.
    const f = laneFacts([
      bag(O1, { lines: lines(grocery), kitchen: "done" }),
      bag(O2, { lines: lines(grocery), kitchen: "done", status: "ready" }),
    ]);
    expect([...f.guest]).toEqual([`verify:${O1}`]);
    // …and a basket is never FOOD, whatever its kitchen state reads.
    expect(f.food.size).toBe(0);
    expect(polls(laneFacts([]), f)).toEqual(["guest"]);
    expect(polls(laneFacts([]), laneFacts([bag(O2, { lines: lines(grocery), status: "ready" })])))
      .toEqual([null]);
  });

  it("the basket test is the card's own: one food line makes it a bag", () => {
    const f = laneFacts([bag(O1, { lines: lines(mixed), kitchen: "done" })]);
    expect(f.guest.size).toBe(0);
    expect([...f.food]).toEqual([`food:${O1}`]);
  });

  it("food is a bag the kitchen finished, still to bag, whose guest is not already here", () => {
    const f = laneFacts([
      bag(O1, { kitchen: "done" }),
      bag(O2, { kitchen: "done", status: "ready" }), // already bagged
      bag("o3", { kitchen: "cooking" }),
    ]);
    expect([...f.food]).toEqual([`food:${O1}`]);
  });

  it("an arrived guest's bag turning done rings nothing new — the guest already rang", () => {
    // MUTATION (counter-attention/food-rings-for-an-arrived-guest): drop `arrivedAt === null` — the
    // same person rings the bell twice.
    const rings = polls(
      laneFacts([bag(O1)]),
      laneFacts([bag(O1, { arrivedAt: ARRIVED })]),
      laneFacts([bag(O1, { arrivedAt: ARRIVED, kitchen: "done" })]),
    );
    expect(rings).toEqual(["guest", null]);
  });

  it("an UNKNOWN kitchen (a failed read) never rings food", () => {
    // MUTATION (counter-attention/an-unknown-kitchen-rings-food): `kitchen !== "cooking"` — every
    // bag rings "food" the moment the cart-lines read fails, and `expo.ts` answers ok on that.
    const rings = polls(laneFacts([bag(O1)]), laneFacts([bag(O1, { kitchen: "unknown" })]));
    expect(rings).toEqual([null]);
  });
});

describe("counterRing — the seen set, per mount", () => {
  it("a null seen SEEDS: nothing rings, nothing is news, every key is recorded", () => {
    // MUTATION (counter-attention/a-mount-rings): treat the null seen as an EMPTY set — the mount
    // rings for every ask and every arrival already on the screen.
    const facts = laneFacts([bag(O1, { arrivedAt: ARRIVED }), bag(O2, { kitchen: "done" })]);
    const r = counterRing(null, facts);
    expect(r.ring).toBeNull();
    expect(r.fresh.size).toBe(0);
    expect([...r.seen].sort()).toEqual([`food:${O2}`, `here:${O1}`].sort());
  });

  it("one ring per new fact — the same facts again ring nothing", () => {
    const empty = laneFacts([]);
    const one = laneFacts([bag(O1, { arrivedAt: ARRIVED })]);
    expect(polls(empty, one, one, one)).toEqual(["guest", null, null]);
  });

  it("kitchen done → unknown → done rings food ONCE (the advisory read's flap)", () => {
    // MUTATION (counter-attention/the-seen-set-forgets): compute the news against the previous poll
    // instead of every key seen this mount — the failed kitchen read's return rings the bag again.
    const rings = polls(
      laneFacts([bag(O1)]),
      laneFacts([bag(O1, { kitchen: "done" })]),
      laneFacts([bag(O1, { kitchen: "unknown" })]),
      laneFacts([bag(O1, { kitchen: "done" })]),
    );
    expect(rings).toEqual(["food", null, null]);
  });

  it("a KDS bump-undo flap (done → cooking → done) after food rang rings nothing", () => {
    const rings = polls(
      laneFacts([bag(O1)]),
      laneFacts([bag(O1, { kitchen: "done" })]),
      laneFacts([bag(O1, { kitchen: "cooking" })]),
      laneFacts([bag(O1, { kitchen: "done" })]),
    );
    expect(rings).toEqual(["food", null, null]);
  });

  it("an ask that leaves 'counter' and comes back with the SAME stamp rings nothing", () => {
    // A card lock lapsing, or the basket emptying and refilling: `counter-pay.ts` keeps the FIRST
    // stamp on a re-ask, so this is the same ask.
    const rings = polls(
      floorFacts([table(S1)]),
      floorFacts([asking(S1)]),
      floorFacts([table(S1, { status: "paying", counterRequestedAt: ASK_AT })]),
      floorFacts([asking(S1)]),
    );
    expect(rings).toEqual(["guest", null, null]);
  });

  it("a guest outranks food in one poll", () => {
    // MUTATION (counter-attention/food-outranks-a-waiting-guest): swap the precedence — the ask and
    // the finished bag landing together ring the bag's phrase, and the person waiting is unheard.
    const r = counterRing(
      new Set(),
      laneFacts([bag(O1, { kitchen: "done" }), bag(O2, { arrivedAt: ARRIVED })]),
    );
    expect(r.ring).toBe("guest");
    expect([...r.fresh].sort()).toEqual([`food:${O1}`, `here:${O2}`].sort());
  });

  it("food alone rings food", () => {
    expect(counterRing(new Set(), laneFacts([bag(O1, { kitchen: "done" })])).ring).toBe("food");
  });

  it("a key seen before an outage never rings again; one first seen after it rings once", () => {
    // A frozen board reports nothing (it only calls in on a good poll), so the outage is simply the
    // gap between two good polls.
    const before = laneFacts([bag(O1, { arrivedAt: ARRIVED })]);
    const afterSame = laneFacts([bag(O1, { arrivedAt: ARRIVED })]);
    const afterNew = laneFacts([bag(O1, { arrivedAt: ARRIVED }), bag(O2, { arrivedAt: ARRIVED })]);
    expect(polls(before, afterSame)).toEqual([null]);
    expect(polls(before, afterNew, afterNew)).toEqual(["guest", null]);
  });

  it("factSubject names the card the news is about (the ask's stamp carries colons)", () => {
    expect(factSubject(`here:${O1}`)).toBe(O1);
    expect(factSubject(`food:${O2}`)).toBe(O2);
    expect(factSubject(`verify:${O1}`)).toBe(O1);
    expect(factSubject(`ask:${S1}:${ASK_AT}`)).toBe(S1);
  });
});

describe("mayRing — two boards on one tick are one ring per kind", () => {
  const T = 1_000_000;
  it("nothing rang yet: ring", () => {
    expect(mayRing(null, "food", T)).toBe(true);
    expect(mayRing(null, "guest", T)).toBe(true);
  });

  it("the same kind inside the gap is refused; AT the gap it rings (inclusive)", () => {
    // MUTATION (counter-attention/the-gap-is-inclusive): `>` — a ring exactly one gap later is
    // swallowed.
    expect(mayRing({ ring: "guest", at: T }, "guest", T + RING_GAP_MS - 1)).toBe(false);
    expect(mayRing({ ring: "guest", at: T }, "guest", T + RING_GAP_MS)).toBe(true);
    expect(mayRing({ ring: "food", at: T }, "food", T + RING_GAP_MS - 1)).toBe(false);
    expect(mayRing({ ring: "food", at: T }, "food", T + RING_GAP_MS)).toBe(true);
  });

  it("a guest is never swallowed by a food ring inside the gap", () => {
    // MUTATION (counter-attention/a-bag-bell-swallows-a-guest): drop the exemption.
    expect(mayRing({ ring: "food", at: T }, "guest", T + 500)).toBe(true);
  });

  it("…and the exemption is one-way: food right after a guest is refused", () => {
    // MUTATION (counter-attention/the-exemption-is-symmetric): any change of kind rings — a guest's
    // bell followed half a second later by a bag's is two bells for one glance.
    expect(mayRing({ ring: "guest", at: T }, "food", T + 500)).toBe(false);
  });
});
