import { describe, expect, it } from "vitest";
import {
  cardHex,
  cardStamp,
  cardTags,
  decideRound,
  decideRounds,
  heldKey,
  isSettlementBatch,
  roundOrdinals,
  sessionStillOn,
  stampLabel,
  stubOf,
  ticketKey,
  type RoundDecision,
  type TagCard,
} from "./kitchen-rounds";

/**
 * PD5 — one Send, one card (m5 decisions 1, 5, 9–11; PATH_DESIGN corrections 3, 14, 17; m5 §E/§F;
 * the blind pass and Codex's round on #328). The card key, the session's round ordinal, the ONE
 * round decision a card carries, the fallback label's parts and "still on" are pure rules, each
 * falsified by a value here and by a `kitchen-rounds/*` mutant.
 */
const NOW = "2026-10-08T19:48:00.000Z";
const at = (ms: number) => new Date(Date.parse(NOW) + ms).toISOString();
const B1 = "3f2a9c10-1111-4aaa-8bbb-000000000001";
const B2 = "7d0e4b22-2222-4aaa-8bbb-000000000002";
/** A settlement batch as `mms_fire_pending_food` mints it since PD5b: version 8 (character 15). */
const SETTLE = "5c1d7e33-3333-8aaa-8bbb-000000000003";

describe("ticketKey — one Send is one card, from the RAW row", () => {
  it("keys a batched line by its batch alone, so a merge that re-parents the batch keeps the card (`kitchen-rounds/key-by-cart-only`)", () => {
    const a = ticketKey({ cart_id: "c1", fire_batch: B1, fire_at: at(-60_000) });
    const b = ticketKey({ cart_id: "c1", fire_batch: B2, fire_at: at(-4_000) });
    expect(a).not.toBe(b);
    expect(a).toContain(B1);
    // The same batch is the same card on every poll, whatever its fire time reads …
    expect(ticketKey({ cart_id: "c1", fire_batch: B1, fire_at: at(-61_000) })).toBe(a);
    // … and whichever cart it sits on: when `mms_merge_table_orders` RE-PARENTS a line it rewrites
    // only `cart_id` (a line it FOLDS into a matching target line is deleted instead; since PD5b a
    // cooking line folds only into a line of its own batch — m5 §H.4).
    expect(ticketKey({ cart_id: "c9", fire_batch: B1, fire_at: at(-60_000) })).toBe(a);
  });

  it("a batchless line keys by its cart and raw fire time (`kitchen-rounds/batchless-keys-by-cart`)", () => {
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

  it("a HELD card keys by its cart, apart from every Send key (Codex on #328: Cook now fires the cart)", () => {
    expect(heldKey("c1")).toBe(heldKey("c1"));
    expect(heldKey("c1")).not.toBe(heldKey("c2"));
    expect(heldKey("c1")).not.toBe(
      ticketKey({ cart_id: "c1", fire_batch: B1, fire_at: at(600_000) }),
    );
    expect(heldKey("c1")).not.toBe(ticketKey({ cart_id: "c1", fire_batch: null, fire_at: null }));
  });
});

describe("roundOrdinals — the session's rounds, by first fire time", () => {
  const dinein = (batch: string, fireMs: number, cart = "c1") => ({
    cart_id: cart,
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
    const togo = { cart_id: "c1", fire_batch: B1, fire_at: at(-600_000), fulfillment: "togo" };
    const r = roundOrdinals([togo, dinein(B2, -40_000)], NOW);
    expect(r.has(B1)).toBe(false);
    expect(r.get(B2)).toBe(1);
    // One to-go line beside a dine-in line is still a numbered Send.
    const mixed = roundOrdinals([togo, { ...togo, fulfillment: null }], NOW);
    expect(mixed.get(B1)).toBe(1);
  });

  it("settlement food — its batch MARKED by the drain — is never a numbered round (Codex on #328; PD5b; `kitchen-rounds/settlement-batch-counted`)", () => {
    // A hostless table paid at the counter with unsent drafts: `mms_fire_pending_food` fires them
    // under a version-8 batch; the guest's Sends carry version-4 batches.
    const lines = [
      dinein(B1, -3_000_000, "c-paid"),
      dinein(SETTLE, -2_599_000, "c-paid"),
      dinein(B2, -40_000, "c-open"),
    ];
    const r = roundOrdinals(lines, NOW);
    expect(r.get(B1)).toBe(1);
    expect(r.has(SETTLE)).toBe(false);
    expect(r.get(B2)).toBe(2);
  });

  it("THE GRACE RACE: a Send fired AFTER the cart's payment was recorded keeps its number — the mark decides, never the moment (PD5b; `kitchen-rounds/settlement-mark-any-version`)", () => {
    // The Send landed in the 10 s before the guest's own card payment (or a staff secure-tab close)
    // was recorded: its `fire_at` — the grace deadline — is after the order. Read by WHEN it fired it
    // was settlement food and lost its number; its batch is a v4, so it is round 2.
    const lines = [dinein(B1, -3_000_000, "c-paid"), dinein(B2, -2_599_000, "c-paid")];
    const r = roundOrdinals(lines, NOW);
    expect(r.get(B1)).toBe(1);
    expect(r.get(B2)).toBe(2);
  });

  it("isSettlementBatch reads the version character AND the RFC variant of a canonical UUID — no other text is a settlement batch", () => {
    expect(isSettlementBatch(SETTLE)).toBe(true);
    expect(isSettlementBatch(SETTLE.toUpperCase())).toBe(true);
    expect(isSettlementBatch(B1)).toBe(false);
    // The 8 must be the VERSION: an 8 in the variant position is a v4 Send's ordinary variant.
    expect(isSettlementBatch("3f2a9c10-1111-4aaa-8bbb-000000000003")).toBe(false);
    // The mint keeps the RFC variant (`8`–`b`); a version-8 shape with any other variant is not the
    // drain's batch (Codex on #340; `kitchen-rounds/settlement-mark-ignores-the-variant`).
    expect(isSettlementBatch("5c1d7e33-3333-8aaa-cbbb-000000000003")).toBe(false);
    expect(isSettlementBatch("5c1d7e33-3333-8aaa-7bbb-000000000003")).toBe(false);
    expect(isSettlementBatch("5c1d7e33-3333-8aaa-bbbb-000000000003")).toBe(true);
    // Not a UUID (a fixture id, a truncated or padded string) — never settlement food.
    expect(isSettlementBatch("bt")).toBe(false);
    expect(isSettlementBatch(` ${SETTLE}`)).toBe(false);
    expect(isSettlementBatch(SETTLE.slice(0, -1))).toBe(false);
  });

  it("an undone Send (its batch cleared) and a line with no fire time never count", () => {
    const r = roundOrdinals(
      [
        { cart_id: "c1", fire_batch: null, fire_at: at(-900_000), fulfillment: "dinein" },
        { cart_id: "c1", fire_batch: B1, fire_at: null, fulfillment: "dinein" },
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
    expect(cardHex({ key: "b|" + B1, fireBatch: B1 })).toBe(B1.replaceAll("-", ""));
    const k = "c1|f|" + at(-60_000);
    const h = cardHex({ key: k, fireBatch: null });
    expect(h).toMatch(/^[0-9a-f]{32}$/);
    expect(cardHex({ key: k, fireBatch: null })).toBe(h);
    expect(cardHex({ key: "c1|n", fireBatch: null })).not.toBe(h);
  });
});

const card = (over: Partial<TagCard> = {}): TagCard => ({
  key: "b|" + B1,
  sessionId: "s1",
  channel: "dinein",
  fireBatch: B1,
  round: { kind: "n", n: 1 },
  stampIso: at(-600_000),
  tableNumber: 4,
  label: "T4",
  ...over,
});
const r2card = (over: Partial<TagCard> = {}): TagCard =>
  card({
    key: "b|" + B2,
    fireBatch: B2,
    round: { kind: "n", n: 2 },
    stampIso: at(-4_000),
    ...over,
  });
const noRail: TagCard[] = [];
/** The decisions a board makes when the read answers: every card's own round. */
const decided = (board: readonly TagCard[]) => decideRounds(new Map(), board);

describe("decideRound — the ONE round a card carries; definite once, provisional until the read answers", () => {
  const r1 = card();
  const r2 = r2card();

  it("a read that answers decides: the number (round 1 included), or none for a Send that is never numbered", () => {
    expect(decideRound(undefined, r2, [r1, r2])).toEqual({ kind: "n", n: 2 });
    expect(decideRound(undefined, r1, [r1, r2])).toEqual({ kind: "n", n: 1 });
    expect(decideRound(undefined, card({ round: { kind: "none" } }), [r1])).toEqual({
      kind: "none",
    });
    expect(decideRound(undefined, card({ channel: "pickup" }), [])).toEqual({ kind: "none" });
  });

  it("a card that lands while the read has not answered is PROVISIONAL, and takes its number from the first read that does (the blind pass on #328; `kitchen-rounds/unknown-read-decides-forever`)", () => {
    const u2 = r2card({ round: { kind: "unknown" } });
    const landed = decideRound(undefined, u2, [u2]);
    expect(landed).toEqual({ kind: "undecided" });
    expect(stubOf(landed)).toBeNull();
    const answered = decideRound(landed, r2, [r2]);
    expect(answered).toEqual({ kind: "n", n: 2 });
    expect(stubOf(answered)).toEqual({ kind: "n", n: 2 });
    // The read may also answer "round 1" or "none": provisional sharpens to that, drawing nothing.
    expect(decideRound(landed, card({ round: { kind: "n", n: 1 } }), [])).toEqual({
      kind: "n",
      n: 1,
    });
    expect(decideRound(landed, card({ round: { kind: "none" } }), [])).toEqual({ kind: "none" });
  });

  it("an unknown number reads 'next round' only while an OLDER card of the same session is live, and never as a number (decision 10; `kitchen-rounds/next-without-an-older-card`, `kitchen-rounds/unknown-drawn-as-one`)", () => {
    const u2 = r2card({ round: { kind: "unknown" } });
    expect(decideRound(undefined, u2, [r1, u2])).toEqual({ kind: "next" });
    expect(stubOf({ kind: "next" })).toEqual({ kind: "next" });
    // Alone, or beside only a NEWER card, nothing is drawn — and nothing is ever a guessed "1".
    expect(decideRound(undefined, u2, [u2])).toEqual({ kind: "undecided" });
    const newer = card({ key: "b|b3", fireBatch: "b3", stampIso: at(-1_000) });
    expect(decideRound(undefined, u2, [u2, newer])).toEqual({ kind: "undecided" });
    // Another session at the same table is not an older card of THIS session.
    expect(decideRound(undefined, u2, [{ ...r1, sessionId: "s9" }, u2])).toEqual({
      kind: "undecided",
    });
  });

  it("a definite decision is final: a number is frozen and round 1 never gains a stub (`kitchen-rounds/stub-blurs`, `kitchen-rounds/stub-added-after-first-render`)", () => {
    const two: RoundDecision = { kind: "n", n: 2 };
    expect(decideRound(two, r2card({ round: { kind: "n", n: 4 } }), [r2])).toEqual(two);
    expect(decideRound(two, r2card({ round: { kind: "unknown" } }), [r2])).toEqual(two);
    const one: RoundDecision = { kind: "n", n: 1 };
    expect(decideRound(one, card({ round: { kind: "n", n: 2 } }), [])).toEqual(one);
    const none: RoundDecision = { kind: "none" };
    expect(decideRound(none, card({ round: { kind: "n", n: 2 } }), [])).toEqual(none);
  });

  it("'next round' sharpens to the number once it is known and is kept while unknown — words never blur", () => {
    const next: RoundDecision = { kind: "next" };
    expect(decideRound(next, r2, [r1, r2])).toEqual({ kind: "n", n: 2 });
    expect(decideRound(next, r2card({ round: { kind: "unknown" } }), [r2])).toEqual(next);
  });

  it("'next round' is a DRAWN stub: it sharpens only to 2 or more, never to round 1 or none, which would take a stub Mom has read off the card (the blind pass on #328; `kitchen-rounds/next-blurs-to-round-one`, `kitchen-rounds/next-blurs-to-none`)", () => {
    const next: RoundDecision = { kind: "next" };
    // A merge re-ranked the session under the provisional card: the read now calls it round 1.
    const one = decideRound(next, r2card({ round: { kind: "n", n: 1 } }), [r2]);
    expect(one).toEqual(next);
    expect(stubOf(one)).toEqual({ kind: "next" });
    // The read now calls it unnumbered (its batch left the dine-in count).
    const none = decideRound(next, r2card({ round: { kind: "none" } }), [r2]);
    expect(none).toEqual(next);
    expect(stubOf(none)).toEqual({ kind: "next" });
    // A number that keeps a stub is the sharpening the word was waiting for.
    expect(decideRound(next, r2card({ round: { kind: "n", n: 3 } }), [r2])).toEqual({
      kind: "n",
      n: 3,
    });
  });

  it("stubOf — round 2 and up wear the number; round 1, none and undecided wear nothing (`kitchen-rounds/round-one-wears-a-stub`)", () => {
    expect(stubOf({ kind: "n", n: 2 })).toEqual({ kind: "n", n: 2 });
    expect(stubOf({ kind: "n", n: 3 })).toEqual({ kind: "n", n: 3 });
    expect(stubOf({ kind: "n", n: 1 })).toBeNull();
    expect(stubOf({ kind: "none" })).toBeNull();
    expect(stubOf({ kind: "undecided" })).toBeNull();
    expect(stubOf(undefined)).toBeNull();
  });

  it("a card that comes BACK takes the decision it was bumped with, never a fresh one from a re-ranked read (the blind pass on #328; `kitchen-rounds/returning-card-re-decided`)", () => {
    const first = decideRounds(new Map(), [r1, r2]);
    // Round 2 is bumped: the next snapshot forgets it.
    const bumped = decideRounds(first, [r1]);
    expect(bumped.has(r2.key)).toBe(false);
    // A merge re-ranks the session, then round 2 is brought back: the read now says 4.
    const back = decideRounds(bumped, [r1, r2card({ round: { kind: "n", n: 4 } })], first);
    expect(back.get(r2.key)).toEqual({ kind: "n", n: 2 });
    expect(stubOf(back.get(r2.key))).toEqual({ kind: "n", n: 2 });
    // The board's own carried decision outranks a returning one.
    const carried = decideRounds(first, [r2], new Map([[r2.key, { kind: "n", n: 7 }]]));
    expect(carried.get(r2.key)).toEqual({ kind: "n", n: 2 });
  });

  it("decideRounds carries every decision forward and forgets cards that left the board", () => {
    const first = decideRounds(new Map(), [r1, r2]);
    expect(first.get(r2.key)).toEqual({ kind: "n", n: 2 });
    expect(first.get(r1.key)).toEqual({ kind: "n", n: 1 });
    const later = decideRounds(first, [r2card({ round: { kind: "unknown" } })]);
    expect(later.get(r2.key)).toEqual({ kind: "n", n: 2 });
    expect(later.has(r1.key)).toBe(false);
  });
});

describe("cardTags — what the pill, the chip and the names add to 'Table 4'", () => {
  it("a lone card carries nothing: today's label, byte for byte (`kitchen-rounds/tag-with-no-twin`)", () => {
    expect(cardTags([card()], noRail, decided([card()])).get(card().key)).toBeNull();
    const u = card({ round: { kind: "unknown" } });
    expect(cardTags([u], noRail, decided([u])).get(u.key)).toBeNull();
  });

  it("two cards of one session name their rounds (decision 11)", () => {
    const r1 = card();
    const r2 = r2card();
    const tags = cardTags([r1, r2], noRail, decided([r1, r2]));
    expect(tags.get(r1.key)).toEqual({ kind: "round", n: 1, disc: null });
    expect(tags.get(r2.key)).toEqual({ kind: "round", n: 2, disc: null });
  });

  it("the round in the name is the card's DECISION, never the live read (the blind pass on #328; `kitchen-rounds/name-reads-the-live-ordinal`)", () => {
    const r1 = card();
    const r2 = r2card();
    const frozen = decided([r1, r2]);
    // A merge re-ranked the session: the read now says 3 and 4; the faces still say 1 and 2.
    const renumbered = [
      card({ round: { kind: "n", n: 3 } }),
      r2card({ round: { kind: "n", n: 4 } }),
    ];
    const tags = cardTags(renumbered, noRail, frozen);
    expect(tags.get(r1.key)).toEqual({ kind: "round", n: 1, disc: null });
    expect(tags.get(r2.key)).toEqual({ kind: "round", n: 2, disc: null });
    // A card still provisional under a failed read falls back to its stamp, never to the read's number.
    const u = r2card({ round: { kind: "n", n: 2 } });
    const provisional = new Map<string, RoundDecision>([
      [r1.key, { kind: "n", n: 1 }],
      [u.key, { kind: "undecided" }],
    ]);
    expect(cardTags([r1, u], noRail, provisional).get(u.key)).toEqual({
      kind: "time",
      stampIso: u.stampIso,
      disc: null,
    });
  });

  it("a card whose twin sits on the Bring-back rail is tagged too, so two chips are never alike (`kitchen-rounds/rail-twin-ignored`)", () => {
    const r2 = r2card();
    const chip = card(); // round 1, bumped
    expect(cardTags([r2], [chip], decided([r2])).get(r2.key)).toEqual({
      kind: "round",
      n: 2,
      disc: null,
    });
    expect(cardTags([r2], [{ ...chip, sessionId: "s9" }], decided([r2])).get(r2.key)).toBeNull();
  });

  it("another session at the same table is not a twin (the conservative direction, risk 9)", () => {
    const other = card({ key: "b|" + B2, sessionId: "s7", fireBatch: B2 });
    const tags = cardTags([card(), other], noRail, decided([card(), other]));
    expect(tags.get(card().key)).toBeNull();
    expect(tags.get(other.key)).toBeNull();
  });

  it("with no round number the tag is the card's raw stamp, and a discriminator only when two still tie (corrections 14, 17; `kitchen-rounds/discriminator-never-extended`, `kitchen-rounds/tie-undiscriminated`)", () => {
    const r1 = card({ round: { kind: "unknown" }, stampIso: at(-600_000) });
    const r2 = r2card({ round: { kind: "unknown" }, stampIso: at(-4_000) });
    const apart = cardTags([r1, r2], noRail, decided([r1, r2]));
    expect(apart.get(r1.key)).toEqual({ kind: "time", stampIso: at(-600_000), disc: null });
    expect(apart.get(r2.key)).toEqual({ kind: "time", stampIso: at(-4_000), disc: null });

    // The same second: each takes four hex characters of its own key.
    const tied = cardTags([r1, { ...r2, stampIso: at(-600_000 + 400) }], noRail, decided([r1, r2]));
    expect(tied.get(r1.key)).toEqual({ kind: "time", stampIso: at(-600_000), disc: "3f2a" });
    expect(tied.get(r2.key)).toEqual({ kind: "time", stampIso: at(-600_000 + 400), disc: "7d0e" });

    // Still tied at four characters: extended one character at a time, the same for both.
    const near = "3f2a9c10-9999-4aaa-8bbb-000000000003";
    const r3 = { ...r2, key: "b|" + near, fireBatch: near, stampIso: at(-600_000 + 400) };
    const extended = cardTags([r1, r3], noRail, decided([r1, r3]));
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

  it("a tie is read off the PRINTED stamp: two UTC seconds in the fall-back hour print alike (Codex on #328; `kitchen-rounds/tie-on-the-raw-second`)", () => {
    // 2026-11-01 08:30:05Z is 1:30:05 PDT; 09:30:05Z is 1:30:05 PST — one printed label.
    const a = card({ round: { kind: "unknown" }, stampIso: "2026-11-01T08:30:05.000Z" });
    const b = r2card({ round: { kind: "unknown" }, stampIso: "2026-11-01T09:30:05.000Z" });
    expect(stampLabel(a.stampIso)).toBe(stampLabel(b.stampIso));
    const tags = cardTags([a, b], noRail, decided([a, b]));
    expect(tags.get(a.key)).toEqual({ kind: "time", stampIso: a.stampIso, disc: "3f2a" });
    expect(tags.get(b.key)).toEqual({ kind: "time", stampIso: b.stampIso, disc: "7d0e" });
  });

  it("a chip on the rail takes part in the ties, so a live card never reads exactly like its bumped twin's chip (Codex on #328; `kitchen-rounds/rail-out-of-the-ties`)", () => {
    const a = card({ round: { kind: "unknown" }, stampIso: at(-600_000) });
    const b = r2card({ round: { kind: "unknown" }, stampIso: at(-600_000 + 400) });
    // A was bumped (its chip holds its card); B is alone on the board and must still carry its mark.
    const tags = cardTags([b], [a], decided([b]));
    expect(tags.get(b.key)).toEqual({ kind: "time", stampIso: b.stampIso, disc: "7d0e" });
    // A brought back while B's chip is on the rail: the same rule, the other way round.
    expect(cardTags([a], [b], decided([a])).get(a.key)).toEqual({
      kind: "time",
      stampIso: a.stampIso,
      disc: "3f2a",
    });
    // A rail copy of a card that is LIVE again never ties with itself.
    expect(cardTags([a, b], [a], decided([a, b])).get(a.key)).toEqual({
      kind: "time",
      stampIso: a.stampIso,
      disc: "3f2a",
    });
  });

  it("a stamp that cannot be printed never leaves the label bare: the discriminator stands in, and nothing throws", () => {
    const bad = card({ round: { kind: "unknown" }, stampIso: "" });
    const twin = r2card({ round: { kind: "unknown" } });
    expect(stampLabel("")).toBe("");
    const tags = cardTags([bad, twin], noRail, decided([bad, twin]));
    expect(tags.get(bad.key)).toEqual({ kind: "time", stampIso: "", disc: "3f2a" });
  });

  it("a known round never falls back to a time, and a to-go-only Send keeps its channel tag alone", () => {
    const r1 = card();
    const togo = r2card({ round: { kind: "none" } });
    const tags = cardTags([r1, togo], noRail, decided([r1, togo]));
    expect(tags.get(r1.key)).toEqual({ kind: "round", n: 1, disc: null });
    expect(tags.get(togo.key)).toEqual({ kind: "time", stampIso: togo.stampIso, disc: null });
  });

  it("a counter order that sends twice is two cards with no number, so each takes the fallback stamp — never two cards called 'Min' (the blind pass on #328; `kitchen-rounds/counter-twins-untagged`)", () => {
    const counter = { channel: "pickup" as const, tableNumber: null, label: "reg-ab12" };
    const p = card({ ...counter, round: { kind: "none" }, stampIso: at(-600_000) });
    const q = r2card({ ...counter, round: { kind: "none" }, stampIso: at(-4_000) });
    const tags = cardTags([p, q], noRail, decided([p, q]));
    expect(tags.get(p.key)).toEqual({ kind: "time", stampIso: at(-600_000), disc: null });
    expect(tags.get(q.key)).toEqual({ kind: "time", stampIso: at(-4_000), disc: null });
    // Sent in the same second: the discriminator, exactly as a dine-in tie.
    const tied = cardTags([p, { ...q, stampIso: at(-600_000 + 400) }], noRail, decided([p, q]));
    expect(tied.get(p.key)).toEqual({ kind: "time", stampIso: at(-600_000), disc: "3f2a" });
    expect(tied.get(q.key)).toEqual({ kind: "time", stampIso: at(-600_000 + 400), disc: "7d0e" });
    // A lone counter card is today's: its name and its code alone.
    expect(cardTags([p], noRail, decided([p])).get(p.key)).toBeNull();
  });
});

describe("cardTags — two DECIDED numbers that collide are told apart (Codex round 2 on #328)", () => {
  it("after a merge two live round-1 cards of one session and table each take their key's discriminator, extended while they tie (`kitchen-rounds/round-duplicates-undiscriminated`)", () => {
    // Table 4's own round 1, and Table 6's round 1 re-parented into Table 4's session by a merge:
    // both decisions were frozen at 1 when each landed.
    const own = card();
    const merged = card({ key: "b|" + B2, fireBatch: B2, stampIso: at(-300_000) });
    const tags = cardTags([own, merged], noRail, decided([own, merged]));
    expect(tags.get(own.key)).toEqual({ kind: "round", n: 1, disc: "3f2a" });
    expect(tags.get(merged.key)).toEqual({ kind: "round", n: 1, disc: "7d0e" });
    // A shared prefix extends both, one character at a time.
    const near = "3f2a9c10-9999-4aaa-8bbb-000000000003";
    const twin = card({ key: "b|" + near, fireBatch: near });
    const ext = cardTags([own, twin], noRail, decided([own, twin]));
    expect(ext.get(own.key)).toEqual({ kind: "round", n: 1, disc: "3f2a9c101" });
    expect(ext.get(twin.key)).toEqual({ kind: "round", n: 1, disc: "3f2a9c109" });
    // Different numbers never collide; a chip on the rail with the same number does.
    const r2 = r2card();
    expect(cardTags([own, r2], noRail, decided([own, r2])).get(own.key)).toEqual({
      kind: "round",
      n: 1,
      disc: null,
    });
    const chip = card({ key: "b|" + B2, fireBatch: B2 });
    const withChip = (d: RoundDecision) => new Map([...decided([own]), [chip.key, d]]);
    expect(cardTags([own], [chip], withChip({ kind: "n", n: 1 })).get(own.key)).toEqual({
      kind: "round",
      n: 1,
      disc: "3f2a",
    });
  });

  it("a chip's number is the DECISION it was bumped with, never its live read (the blind pass on #328; `kitchen-rounds/rail-round-read-live`)", () => {
    const own = card();
    // The chip's card was decided round 2; a merge since re-ranked it, and its live read says 1.
    const reranked = card({ key: "b|" + B2, fireBatch: B2, round: { kind: "n", n: 1 } });
    const two = new Map([...decided([own]), [reranked.key, { kind: "n", n: 2 } as RoundDecision]]);
    expect(cardTags([own], [reranked], two).get(own.key)).toEqual({
      kind: "round",
      n: 1,
      disc: null,
    });
    // The other way round: decided 1 — the chip reads "Table 4 · Round 1" — while its read says 2.
    const drifted = card({ key: "b|" + B2, fireBatch: B2, round: { kind: "n", n: 2 } });
    const one = new Map([...decided([own]), [drifted.key, { kind: "n", n: 1 } as RoundDecision]]);
    expect(cardTags([own], [drifted], one).get(own.key)).toEqual({
      kind: "round",
      n: 1,
      disc: "3f2a",
    });
  });
});

describe("sessionStillOn — 'Table 4 still has a card on the board' (decision 12)", () => {
  it("is true only while ANOTHER card of the same session is on the board, held cards included (`kitchen-rounds/still-on-counts-itself`)", () => {
    const r1 = card();
    const r2 = card({ key: "b|" + B2, fireBatch: B2 });
    expect(sessionStillOn(r1, [r1, r2])).toBe(true);
    expect(sessionStillOn(r1, [r1])).toBe(false);
    expect(sessionStillOn(r1, [r1, { ...r2, sessionId: "s9" }])).toBe(false);
  });
});
