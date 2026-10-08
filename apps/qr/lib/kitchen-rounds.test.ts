import { describe, expect, it } from "vitest";
import {
  cardHex,
  cardStamp,
  cardTags,
  nextStubs,
  roundOrdinals,
  sessionStillOn,
  stubFor,
  ticketKey,
  type RoundStub,
  type TagCard,
} from "./kitchen-rounds";

/**
 * PD5 — one Send, one card (m5 decisions 1, 5, 9–11; PATH_DESIGN corrections 3, 14, 17; m5 §E/§F).
 * The card key, the session's round ordinal, the fallback label's parts and the stub a card wears
 * are pure rules, each falsified by a value here and by a `kitchen-rounds/*` mutant.
 */
const NOW = "2026-10-08T19:48:00.000Z";
const at = (ms: number) => new Date(Date.parse(NOW) + ms).toISOString();
const B1 = "3f2a9c10-1111-4aaa-8bbb-000000000001";
const B2 = "7d0e4b22-2222-4aaa-8bbb-000000000002";

describe("ticketKey — one Send is one card, from the RAW row", () => {
  it("keys by cart and batch (`kitchen-rounds/key-by-cart-only`)", () => {
    const a = ticketKey({ cart_id: "c1", fire_batch: B1, fire_at: at(-60_000) });
    const b = ticketKey({ cart_id: "c1", fire_batch: B2, fire_at: at(-4_000) });
    expect(a).not.toBe(b);
    expect(a).toContain("c1");
    expect(a).toContain(B1);
    // The same batch is the same card on every poll, whatever its fire time reads.
    expect(ticketKey({ cart_id: "c1", fire_batch: B1, fire_at: at(-61_000) })).toBe(a);
  });

  it("a batchless line keys by its raw fire time (`kitchen-rounds/batchless-keys-by-cart`)", () => {
    const f1 = ticketKey({ cart_id: "c1", fire_batch: null, fire_at: at(-60_000) });
    const f2 = ticketKey({ cart_id: "c1", fire_batch: null, fire_at: at(-30_000) });
    expect(f1).not.toBe(f2);
    expect(f1).not.toBe(ticketKey({ cart_id: "c1", fire_batch: B1, fire_at: at(-60_000) }));
  });

  it("no batch and no fire time is ONE bucket per cart — never the poll clock (correction 3)", () => {
    const n1 = ticketKey({ cart_id: "c1", fire_batch: null, fire_at: null });
    expect(ticketKey({ cart_id: "c1", fire_batch: null, fire_at: null })).toBe(n1);
    expect(ticketKey({ cart_id: "c2", fire_batch: null, fire_at: null })).not.toBe(n1);
    expect(n1).not.toBe(ticketKey({ cart_id: "c1", fire_batch: null, fire_at: NOW }));
  });
});

describe("roundOrdinals — the session's rounds, by first fire time", () => {
  const dinein = (batch: string, fireMs: number) => ({
    fire_batch: batch,
    fire_at: at(fireMs),
    fulfillment: "dinein",
  });

  it("ranks batches 1, 2, 3 by their earliest fire time (`kitchen-rounds/ordinal-off-by-one`)", () => {
    const r = roundOrdinals(
      [dinein(B2, -40_000), dinein(B1, -600_000), dinein(B1, -590_000), dinein("b3", -10_000)],
      NOW,
    );
    expect(r.get(B1)).toBe(1);
    expect(r.get(B2)).toBe(2);
    expect(r.get("b3")).toBe(3);
  });

  it("a Send still inside its grace is not counted yet (`kitchen-rounds/ordinal-counts-the-grace`)", () => {
    const r = roundOrdinals([dinein(B1, -600_000), dinein(B2, 6_000)], NOW);
    expect(r.get(B1)).toBe(1);
    expect(r.has(B2)).toBe(false);
    // The edge: fired exactly now has cleared the grace.
    expect(roundOrdinals([dinein(B2, 0)], NOW).get(B2)).toBe(1);
  });

  it("a batch with no dine-in line gets no ordinal and shifts nothing (round 3 D4; `kitchen-rounds/ordinal-counts-togo-only-batches`)", () => {
    const togo = { fire_batch: B1, fire_at: at(-600_000), fulfillment: "togo" };
    const r = roundOrdinals([togo, dinein(B2, -40_000)], NOW);
    expect(r.has(B1)).toBe(false);
    expect(r.get(B2)).toBe(1);
    // One to-go line beside a dine-in line is still a numbered Send.
    const mixed = roundOrdinals([togo, { ...togo, fulfillment: null }], NOW);
    expect(mixed.get(B1)).toBe(1);
  });

  it("an undone Send (its batch cleared) and a line with no fire time never count", () => {
    const r = roundOrdinals(
      [
        { fire_batch: null, fire_at: at(-900_000), fulfillment: "dinein" },
        { fire_batch: B1, fire_at: null, fulfillment: "dinein" },
        dinein(B2, -40_000),
      ],
      NOW,
    );
    expect(r.size).toBe(1);
    expect(r.get(B2)).toBe(1);
  });

  it("two batches fired in the same instant rank by batch id, so the order is stable across polls", () => {
    const a = roundOrdinals([dinein(B2, -60_000), dinein(B1, -60_000)], NOW);
    const b = roundOrdinals([dinein(B1, -60_000), dinein(B2, -60_000)], NOW);
    expect([...a]).toEqual([...b]);
    expect(a.get(B1)).toBe(1);
  });
});

describe("cardStamp — the fallback label's time, from the RAW rows", () => {
  it("is the earliest raw fire time (`kitchen-rounds/stamp-takes-the-latest`)", () => {
    expect(
      cardStamp([
        { fire_at: at(-30_000), created_at: at(-90_000) },
        { fire_at: at(-60_000), created_at: at(-95_000) },
      ]),
    ).toBe(at(-60_000));
  });

  it("the no-fire-time bucket takes its lines' earliest raw created_at, never the poll clock (m5 §F; `kitchen-rounds/stamp-ignores-created-at`)", () => {
    expect(
      cardStamp([
        { fire_at: null, created_at: at(-80_000) },
        { fire_at: null, created_at: at(-120_000) },
      ]),
    ).toBe(at(-120_000));
    // A stamped line outranks an unstamped one on the same card.
    expect(
      cardStamp([
        { fire_at: null, created_at: at(-120_000) },
        { fire_at: at(-30_000), created_at: at(-80_000) },
      ]),
    ).toBe(at(-30_000));
  });
});

describe("cardHex — the stable discriminator source", () => {
  it("a batch-keyed card uses its batch's hex; a batchless card a stable hash of its own key", () => {
    expect(cardHex({ key: "c1|b|" + B1, fireBatch: B1 })).toBe(B1.replaceAll("-", ""));
    const k = "c1|f|" + at(-60_000);
    const h = cardHex({ key: k, fireBatch: null });
    expect(h).toMatch(/^[0-9a-f]{32}$/);
    expect(cardHex({ key: k, fireBatch: null })).toBe(h);
    expect(cardHex({ key: "c1|n", fireBatch: null })).not.toBe(h);
  });
});

const card = (over: Partial<TagCard> = {}): TagCard => ({
  key: "c1|b|" + B1,
  sessionId: "s1",
  channel: "dinein",
  fireBatch: B1,
  round: { kind: "n", n: 1 },
  stampIso: at(-600_000),
  tableNumber: 4,
  label: "T4",
  ...over,
});
const none = new Set<string>();

describe("cardTags — what the pill, the chip and the names add to 'Table 4'", () => {
  it("a lone card carries nothing: today's label, byte for byte (`kitchen-rounds/tag-with-no-twin`)", () => {
    expect(cardTags([card()], none).get(card().key)).toBeNull();
    expect(cardTags([card({ round: { kind: "unknown" } })], none).get(card().key)).toBeNull();
  });

  it("two cards of one session name their rounds (decision 11)", () => {
    const r1 = card();
    const r2 = card({
      key: "c1|b|" + B2,
      fireBatch: B2,
      round: { kind: "n", n: 2 },
      stampIso: at(-4_000),
    });
    const tags = cardTags([r1, r2], none);
    expect(tags.get(r1.key)).toEqual({ kind: "round", n: 1 });
    expect(tags.get(r2.key)).toEqual({ kind: "round", n: 2 });
  });

  it("a card whose twin sits on the Bring-back rail is tagged too, so two chips are never alike (`kitchen-rounds/rail-twin-ignored`)", () => {
    const r2 = card({ key: "c1|b|" + B2, fireBatch: B2, round: { kind: "n", n: 2 } });
    expect(cardTags([r2], new Set(["s1"])).get(r2.key)).toEqual({ kind: "round", n: 2 });
    expect(cardTags([r2], new Set(["s9"])).get(r2.key)).toBeNull();
  });

  it("another session at the same table is not a twin (the conservative direction, risk 9)", () => {
    const other = card({ key: "c7|b|" + B2, sessionId: "s7", fireBatch: B2 });
    const tags = cardTags([card(), other], none);
    expect(tags.get(card().key)).toBeNull();
    expect(tags.get(other.key)).toBeNull();
  });

  it("with no round number the tag is the card's raw stamp, and a discriminator only when two still tie (corrections 14, 17; `kitchen-rounds/discriminator-never-extended`, `kitchen-rounds/tie-undiscriminated`)", () => {
    const r1 = card({ round: { kind: "unknown" }, stampIso: at(-600_000) });
    const r2 = card({
      key: "c1|b|" + B2,
      fireBatch: B2,
      round: { kind: "unknown" },
      stampIso: at(-4_000),
    });
    const apart = cardTags([r1, r2], none);
    expect(apart.get(r1.key)).toEqual({ kind: "time", stampIso: at(-600_000), disc: null });
    expect(apart.get(r2.key)).toEqual({ kind: "time", stampIso: at(-4_000), disc: null });

    // The same second: each takes four hex characters of its own key.
    const tied = cardTags([r1, { ...r2, stampIso: at(-600_000 + 400) }], none);
    expect(tied.get(r1.key)).toEqual({ kind: "time", stampIso: at(-600_000), disc: "3f2a" });
    expect(tied.get(r2.key)).toEqual({ kind: "time", stampIso: at(-600_000 + 400), disc: "7d0e" });

    // Still tied at four characters: extended one character at a time, the same for both.
    const near = "3f2a9c10-9999-4aaa-8bbb-000000000003";
    const r3 = { ...r2, key: "c1|b|" + near, fireBatch: near, stampIso: at(-600_000 + 400) };
    const extended = cardTags([r1, r3], none);
    expect(extended.get(r1.key)).toEqual({
      kind: "time",
      stampIso: at(-600_000),
      disc: "3f2a9c101",
    });
    expect(extended.get(r3.key)).toEqual({
      kind: "time",
      stampIso: at(-600_000 + 400),
      disc: "3f2a9c109",
    });
  });

  it("a known round never falls back to a time, and a to-go-only Send keeps its channel tag alone", () => {
    const r1 = card();
    const togo = card({ key: "c1|b|" + B2, fireBatch: B2, round: { kind: "none" } });
    const tags = cardTags([r1, togo], none);
    expect(tags.get(r1.key)).toEqual({ kind: "round", n: 1 });
    expect(tags.get(togo.key)).toEqual({ kind: "time", stampIso: togo.stampIso, disc: null });
  });

  it("a pickup or scan-and-go card is never tagged — its identity is a name and a code", () => {
    const p = card({ channel: "pickup", sessionId: "s1" });
    const q = card({ channel: "pickup", key: "c1|b|" + B2, fireBatch: B2, sessionId: "s1" });
    const tags = cardTags([p, q], none);
    expect(tags.get(p.key)).toBeNull();
    expect(tags.get(q.key)).toBeNull();
  });
});

describe("stubFor — decided once when the card lands; words sharpen, never blur (decision 5)", () => {
  const r1 = card();
  const r2 = card({
    key: "c1|b|" + B2,
    fireBatch: B2,
    round: { kind: "n", n: 2 },
    stampIso: at(-4_000),
  });

  it("round 2 and up wear the number; round 1 wears nothing (`kitchen-rounds/round-one-wears-a-stub`)", () => {
    expect(stubFor(undefined, r2, [r1, r2])).toEqual({ kind: "n", n: 2 });
    expect(stubFor(undefined, r1, [r1, r2])).toBeNull();
    expect(stubFor(undefined, card({ round: { kind: "n", n: 3 } }), [])).toEqual({
      kind: "n",
      n: 3,
    });
  });

  it("an unknown number is never drawn as a number (`kitchen-rounds/unknown-drawn-as-one`)", () => {
    expect(stubFor(undefined, card({ round: { kind: "unknown" } }), [])).toBeNull();
  });

  it("an unknown number reads 'next round' only while an OLDER card of the same session is live (decision 10; `kitchen-rounds/next-without-an-older-card`)", () => {
    const u2 = { ...r2, round: { kind: "unknown" } as const };
    expect(stubFor(undefined, u2, [r1, u2])).toEqual({ kind: "next" });
    // Alone, or beside only a NEWER card, nothing is drawn.
    expect(stubFor(undefined, u2, [u2])).toBeNull();
    const newer = card({ key: "c1|b|b3", fireBatch: "b3", stampIso: at(-1_000) });
    expect(stubFor(undefined, u2, [u2, newer])).toBeNull();
    // Another session at the same table is not an older card of THIS session.
    expect(stubFor(undefined, u2, [{ ...r1, sessionId: "s9" }, u2])).toBeNull();
  });

  it("a to-go-only Send and a pickup card never wear a stub (round 3 D4)", () => {
    expect(stubFor(undefined, card({ round: { kind: "none" } }), [r1])).toBeNull();
    expect(
      stubFor(undefined, card({ channel: "pickup", round: { kind: "n", n: 2 } }), []),
    ).toBeNull();
  });

  it("a card that landed with no stub never gains one (`kitchen-rounds/stub-added-after-first-render`)", () => {
    expect(stubFor(null, r2, [r1, r2])).toBeNull();
  });

  it("'next round' sharpens to the number once it is known, and a number is frozen (`kitchen-rounds/stub-blurs`)", () => {
    const next: RoundStub = { kind: "next" };
    expect(stubFor(next, r2, [r1, r2])).toEqual({ kind: "n", n: 2 });
    expect(stubFor(next, { ...r2, round: { kind: "unknown" } }, [r2])).toEqual(next);
    const drawn: RoundStub = { kind: "n", n: 2 };
    expect(stubFor(drawn, { ...r2, round: { kind: "n", n: 4 } }, [r2])).toEqual(drawn);
    expect(stubFor(drawn, { ...r2, round: { kind: "unknown" } }, [r2])).toEqual(drawn);
  });

  it("nextStubs keeps every drawn stub and forgets cards that left the board", () => {
    const first = nextStubs(new Map(), [r1, r2]);
    expect(first.get(r2.key)).toEqual({ kind: "n", n: 2 });
    expect(first.get(r1.key)).toBeNull();
    const later = nextStubs(first, [{ ...r2, round: { kind: "unknown" } }]);
    expect(later.get(r2.key)).toEqual({ kind: "n", n: 2 });
    expect(later.has(r1.key)).toBe(false);
  });
});

describe("sessionStillOn — 'Table 4 still has a card on the board' (decision 12)", () => {
  it("is true only while ANOTHER card of the same session is on the board, held cards included (`kitchen-rounds/still-on-counts-itself`)", () => {
    const r1 = card();
    const r2 = card({ key: "c1|b|" + B2, fireBatch: B2 });
    expect(sessionStillOn(r1, [r1, r2])).toBe(true);
    expect(sessionStillOn(r1, [r1])).toBe(false);
    expect(sessionStillOn(r1, [r1, { ...r2, sessionId: "s9" }])).toBe(false);
  });
});
