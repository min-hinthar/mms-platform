import type { KitchenChannel, KitchenRound } from "./kitchen-types";
import { staffClockSeconds } from "./staff-clock";

/**
 * PD5 — one Send, one card (m5 decisions 1, 5, 9–11; PATH_DESIGN corrections 3, 14, 17; m5 §E/§F;
 * round 3 D4). The pure rules behind the re-keyed kitchen board, falsified by values in
 * `kitchen-rounds.test.ts` and by the `kitchen-rounds/*` mutants:
 *
 *   · `ticketKey` — the card a raw line belongs to, from the RAW row;
 *   · `roundOrdinals` — a session's round numbers, by first fire time, dine-in Sends only;
 *   · `decideRound` / `decideRounds` / `stubOf` — the ONE round decision a card carries for its
 *     life on the board (the face's stub and the composed name both read it), decided once;
 *   · `cardStamp` / `cardHex` / `cardTags` — what the pill, the Bring-back chip and the card's
 *     accessible name add to "Table 4" so two cards of one table are always told apart;
 *   · `sessionStillOn` — "Table 4 still has a card on the board", from the snapshot alone.
 *
 * Shared with the TV board's shaper (m9: `board-tables.ts` reads `ticketKey` and `roundOrdinals`),
 * so the wall and Mom's board give one card one number. Pure: no React, no I/O.
 */

// ── the card key ──────────────────────────────────────────────────────────────────────────────────

/** The raw columns the key is read from — never the shaped `firedAt`, which `kitchen.ts` fills
 *  with the poll clock for a line with no fire time (correction 3). */
export type RawCardKey = { cart_id: string; fire_batch: string | null; fire_at: string | null };

/**
 * One Send is one card. A batched line keys by its `fire_batch` ALONE: every Send stamps one
 * (`gen_random_uuid()` or the call's own uuid), so the batch is already unique across carts, and a
 * merge (`mms_merge_table_orders`) re-parents a cooking batch to the target cart by rewriting only
 * `cart_id` — keyed on the cart too, that batch would land as a NEW arrival (a flash, a chime, "N
 * new") and lose its decided round, for food that has been cooking for minutes (the blind pass on
 * #328). A batchless line (the pre-batch legacy edge) keys by its cart and raw fire time; a line
 * with neither keys to ONE bucket per cart, so its card never remounts, flashes or chimes on a poll
 * (correction 3). The three kinds never collide: the marker names the kind.
 */
export function ticketKey(l: RawCardKey): string {
  if (l.fire_batch !== null) return `b|${l.fire_batch}`;
  if (l.fire_at !== null) return `${l.cart_id}|f|${l.fire_at}`;
  return `${l.cart_id}|n`;
}

/**
 * A HELD card (a scheduled pickup or a slotted counter order, every line future-fired) keys by its
 * CART, not its batch: "Cook now" is `mms_fire_ticket_now(p_cart)`, which pulls every future-fired
 * line of that cart onto the live board at once, so one card per cart is the only honest shape —
 * two held cards from one cart would offer a Cook now that fires the other card too (Codex on
 * #328). When the clock (or the tap) makes its lines live they key by their batch like any Send,
 * and that is the held→live arrival the board already flashes and chimes for.
 */
export function heldKey(cartId: string): string {
  return `${cartId}|h`;
}

// ── the round ordinal ─────────────────────────────────────────────────────────────────────────────

/** A batched line of the session, any state (voided included — a void keeps its batch, decision 9). */
export type RoundLine = {
  cart_id: string;
  fire_batch: string | null;
  fire_at: string | null;
  fulfillment: string | null;
};

/**
 * The session's round numbers: the rank, by first fire time, of each `fire_batch` among the
 * session's Sends that have cleared the grace (`fire_at <= now`) AND carry a dine-in line (round 3
 * D4 — a make-it-now to-go batch gets its own card with its channel tag and no ordinal, so the room
 * never reads "Round 3" for a table's second order). Settlement food is excluded by WHEN it fired:
 * `mms_fire_pending_food` stamps a dine-in table's unsent drafts at the settlement, on a cart that
 * is already paid, and a Send can never fire on a paid cart — so a batch whose first fire is at or
 * after its cart's order (`paidAtByCart`, the order's `created_at`) is settlement food, never a
 * numbered round (Codex on #328: a hostless table paid at the counter with drafts would otherwise
 * shift its next Send to "Round 3"). An undone Send has no batch and never counts; a Send still
 * inside its grace is not counted yet, so a drawn number can only ever be joined by a higher one.
 * Two batches fired in one instant rank by batch id, so the order is the same on every poll.
 */
export function roundOrdinals(
  lines: readonly RoundLine[],
  nowIso: string,
  paidAtByCart: ReadonlyMap<string, string> = new Map(),
): ReadonlyMap<string, number> {
  const nowMs = Date.parse(nowIso);
  const firstFire = new Map<string, number>();
  const carriesDinein = new Set<string>();
  const settlement = new Set<string>();
  for (const l of lines) {
    if (l.fire_batch === null) continue;
    if ((l.fulfillment ?? "dinein") === "dinein") carriesDinein.add(l.fire_batch);
    if (l.fire_at === null) continue;
    const ms = Date.parse(l.fire_at);
    if (!Number.isFinite(ms)) continue;
    const paidAt = paidAtByCart.get(l.cart_id);
    if (paidAt !== undefined && ms >= Date.parse(paidAt)) settlement.add(l.fire_batch);
    const prev = firstFire.get(l.fire_batch);
    if (prev === undefined || ms < prev) firstFire.set(l.fire_batch, ms);
  }
  const counted = [...firstFire]
    .filter(([batch, ms]) => ms <= nowMs && carriesDinein.has(batch) && !settlement.has(batch))
    .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return new Map(counted.map(([batch], i) => [batch, i + 1]));
}

/** The card's round as the read carries it — declared beside the ticket in `kitchen-types.ts`. */
export type { KitchenRound };

// ── the round decision (the face's stub and the composed name read THIS, never the live read) ─────

/**
 * The ONE round a card carries for its life on this board. Two kinds are DEFINITE and final: a
 * number (`n` — round 1 wears no stub but its name says "Round 1"; a number once decided is frozen,
 * so a merge that re-ranks the session's batches can never renumber a card Mom has read), and
 * `none` (a card that is never numbered: a pickup card, a to-go-only or settlement batch). Two
 * kinds are PROVISIONAL, held while the advisory read has not answered: `next` (the guest's own
 * "next round" word — drawn only while an OLDER card of the same session is live, decision 10) and
 * `undecided` (nothing drawn). A provisional kind sharpens to a definite one on the first read that
 * answers and never goes the other way; "decided once" means the DEFINITE decision is made once.
 */
export type RoundDecision =
  | { kind: "n"; n: number }
  | { kind: "none" }
  | { kind: "next" }
  | { kind: "undecided" };

/** What `decideRound` reads off a ticket. */
export type DecisionCard = Pick<TagCard, "key" | "sessionId" | "channel" | "round" | "stampIso">;

/**
 * The decision after a snapshot, from the prior one (`undefined` when the card first lands). A
 * definite prior is final. A read that answers decides: the number, or `none`. A read that did not
 * answer leaves the card provisional — `next` while an older card of its session is on the board
 * (and `next` is kept once given: words sharpen, never blur), else `undecided` — so a card that
 * lands during a failed or saturated read (the blind pass on #328) gains its number on the FIRST
 * read that answers, instead of wearing round 1's bare face for its whole life while its name says
 * "Round 3".
 */
export function decideRound(
  prior: RoundDecision | undefined,
  card: DecisionCard,
  board: readonly DecisionCard[],
): RoundDecision {
  if (prior?.kind === "n" || prior?.kind === "none") return prior;
  if (card.channel !== "dinein") return { kind: "none" };
  if (card.round.kind === "n") return { kind: "n", n: card.round.n };
  if (card.round.kind === "none") return { kind: "none" };
  if (prior?.kind === "next") return prior;
  const older = board.some(
    (o) => o.key !== card.key && o.sessionId === card.sessionId && o.stampIso < card.stampIso,
  );
  return older ? { kind: "next" } : { kind: "undecided" };
}

/** The decisions after a snapshot: each card's carried forward through `decideRound`, and the cards
 *  that left the board forgotten (a card that returns lands fresh, as decision 5's STATES say). */
export function decideRounds(
  prev: ReadonlyMap<string, RoundDecision>,
  board: readonly DecisionCard[],
): ReadonlyMap<string, RoundDecision> {
  const out = new Map<string, RoundDecision>();
  for (const c of board) out.set(c.key, decideRound(prev.get(c.key), c, board));
  return out;
}

/** The stub a card wears: the round number, or the guest's own "next round" word with no number. */
export type RoundStub = { kind: "n"; n: number } | { kind: "next" };

/** The stub the face draws for a decision: round 2 and up wear their number; `next` wears the
 *  word; round 1, `none` and `undecided` wear nothing (decision 5: round 1 is drawn as today). */
export function stubOf(d: RoundDecision | undefined): RoundStub | null {
  if (d === undefined) return null;
  if (d.kind === "n") return d.n >= 2 ? { kind: "n", n: d.n } : null;
  if (d.kind === "next") return { kind: "next" };
  return null;
}

// ── the fallback label's parts ────────────────────────────────────────────────────────────────────

/**
 * The card's stamp for the fallback label, from the RAW rows (m5 §F): its earliest raw `fire_at`;
 * the no-fire-time bucket has none, so it takes its lines' earliest raw `created_at` — never the
 * poll clock, which would retitle the card on every poll.
 */
export function cardStamp(
  lines: readonly { fire_at: string | null; created_at: string }[],
): string {
  let fire: string | null = null;
  let created: string | null = null;
  for (const l of lines) {
    if (l.fire_at !== null && (fire === null || l.fire_at < fire)) fire = l.fire_at;
    if (created === null || l.created_at < created) created = l.created_at;
  }
  return fire ?? created ?? "";
}

/** FNV-1a over UTF-16 code units, 32-bit, from a seed — four seeds give the 32 hex characters a
 *  batch id also has, so a batchless card's discriminator extends the same way. */
function fnv1a(s: string, seed: number): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * The discriminator source (m5 §E/§F): the batch's own hex for a batch-keyed card; for a card keyed
 * by its raw fire time or its cart's bucket, a stable hash of its own key — the same on every poll,
 * on every tablet, never its position on the rail or the board.
 */
export function cardHex(c: { key: string; fireBatch: string | null }): string {
  if (c.fireBatch !== null) return c.fireBatch.toLowerCase().replaceAll("-", "");
  return [0x811c9dc5, 0x9747b28c, 0x5bd1e995, 0xcc9e2d51]
    .map((seed) => fnv1a(c.key, seed).toString(16).padStart(8, "0"))
    .join("");
}

/** What `cardTags` reads off a ticket (a projection of `KitchenTicket`). */
export type TagCard = {
  key: string;
  sessionId: string;
  channel: KitchenChannel;
  fireBatch: string | null;
  round: KitchenRound;
  stampIso: string;
  tableNumber: number | null;
  label: string;
};

/**
 * What the pill, the chip and the names add after the table: the round when it is decided, else
 * the card's stamp to the second plus, only while two labels on the board would still tie, a
 * discriminator from the card's own key (corrections 14 and 17). Null means today's bare label.
 */
export type RoundTag =
  | { kind: "round"; n: number; disc: string | null }
  | { kind: "time"; stampIso: string; disc: string | null };

/** The stamp as the label PRINTS it ("7:42:05", the restaurant's clock), or "" when the stamp cannot
 *  be parsed — the label then carries the discriminator alone instead of throwing. */
export function stampLabel(iso: string): string {
  return Number.isFinite(Date.parse(iso)) ? staffClockSeconds(iso) : "";
}

/** The base a time-tagged label ties on: the table identity and the stamp AS PRINTED. Two UTC
 *  seconds in the fall-back hour print the same local "1:30:05" (Codex on #328), so the tie is read
 *  off the printed label, never the raw string. */
function timeBase(c: TagCard): string {
  return `${c.tableNumber ?? c.label}|${stampLabel(c.stampIso)}`;
}

/**
 * The stable discriminator of each card in a tie group (corrections 14 and 17; Codex on #328): four
 * hex characters of its own key, extended one character at a time while two cards still tie — the
 * same length for every card in the group, never its position. Null for a group of one: nothing
 * ties, nothing is added. ONE rule for the time ties and the decided-round ties.
 */
function discriminators(group: readonly TagCard[]): string[] | null {
  if (group.length < 2) return null;
  const hexes = group.map((c) => cardHex(c));
  const longest = Math.max(...hexes.map((h) => h.length));
  let len = 4;
  while (len < longest && new Set(hexes.map((h) => h.slice(0, len))).size < hexes.length) len += 1;
  return hexes.map((h) => h.slice(0, len));
}

/**
 * The tag of every card on the board, in one pass over the snapshot. A dine-in card is tagged only
 * when it has a twin — another card of the same session on the board (held cards included), or a
 * Bring-back chip of the same session still on the rail — so a lone ticket's label is today's, byte
 * for byte (decision 5). A pickup or scan-and-go card is never tagged: its identity is a name and a
 * code. The round comes from the card's DECISION — the same frozen number its face draws — never
 * from the live read, so a merge that re-ranks the session's batches cannot make the pill, the chip
 * and the bump's name say "Round 3" over a face that says "Round 2" (the blind pass on #328). The
 * rail's cards take part in the ties (never in the output): a live card ties against the chip of
 * its bumped twin, so a card bumped, then its twin, then brought back can never read exactly like
 * the chip that stays (Codex on #328). The discriminator is extended one character at a time while
 * two cards still tie, the same length for every card in the tie; a card whose stamp cannot be
 * printed always carries one.
 */
export function cardTags(
  board: readonly TagCard[],
  rail: readonly TagCard[],
  decisions: ReadonlyMap<string, RoundDecision>,
): ReadonlyMap<string, RoundTag | null> {
  const out = new Map<string, RoundTag | null>();
  const timed: TagCard[] = [];
  for (const c of board) {
    if (c.channel !== "dinein") {
      out.set(c.key, null);
      continue;
    }
    const twin =
      board.some((o) => o.key !== c.key && o.sessionId === c.sessionId) ||
      rail.some((r) => r.key !== c.key && r.sessionId === c.sessionId);
    if (!twin) {
      out.set(c.key, null);
      continue;
    }
    const decided = decisions.get(c.key);
    if (decided?.kind === "n") {
      out.set(c.key, { kind: "round", n: decided.n, disc: null });
      continue;
    }
    timed.push(c);
    out.set(c.key, { kind: "time", stampIso: c.stampIso, disc: null });
  }
  // The ties: every time-tagged card whose printed base another card — on the board or on the rail,
  // minus a rail copy of a card that is live again — shares.
  const live = new Set(board.map((c) => c.key));
  const byBase = new Map<string, TagCard[]>();
  for (const c of [...timed, ...rail.filter((r) => !live.has(r.key))]) {
    const base = timeBase(c);
    byBase.set(base, [...(byBase.get(base) ?? []), c]);
  }
  for (const group of byBase.values()) {
    const discs = discriminators(group);
    if (discs === null) continue;
    group.forEach((c, i) => {
      if (out.get(c.key)?.kind === "time")
        out.set(c.key, { kind: "time", stampIso: c.stampIso, disc: discs[i]! });
    });
  }
  // Two DECIDED numbers can collide too (Codex round 2 on #328): a merge re-parents another table's
  // round 1 into this session, and both frozen decisions read "Table 4 · Round 1" — their pills and
  // chips with them. The same rule as the time ties: a card whose (table, round) another live card
  // or rail chip shares takes its key's discriminator, extended while the tie holds.
  const rounded = board.filter((c) => out.get(c.key)?.kind === "round");
  const byRound = new Map<string, TagCard[]>();
  const roundKey = (c: TagCard, n: number) => `${c.tableNumber ?? c.label}|${n}`;
  for (const c of rounded) {
    const t = out.get(c.key);
    if (t?.kind !== "round") continue;
    byRound.set(roundKey(c, t.n), [...(byRound.get(roundKey(c, t.n)) ?? []), c]);
  }
  for (const r of rail) {
    if (live.has(r.key) || r.round.kind !== "n") continue;
    const k = roundKey(r, r.round.n);
    if (byRound.has(k)) byRound.set(k, [...byRound.get(k)!, r]);
  }
  for (const group of byRound.values()) {
    const discs = discriminators(group);
    if (discs === null) continue;
    group.forEach((c, i) => {
      const t = out.get(c.key);
      if (t?.kind === "round") out.set(c.key, { ...t, disc: discs[i]! });
    });
  }
  // A stamp that cannot be printed leaves the label bare "Table 4" — the discriminator stands in.
  for (const c of timed) {
    const tag = out.get(c.key);
    if (tag?.kind === "time" && tag.disc === null && stampLabel(c.stampIso) === "")
      out.set(c.key, { ...tag, disc: cardHex(c).slice(0, 4) });
  }
  return out;
}

// ── the spoken next step ──────────────────────────────────────────────────────────────────────────

/**
 * "Table 4 still has a card on the board" (decision 12): true only while ANOTHER card of the same
 * session is on the board, held cards included — computed from the snapshot, with no new read. It
 * compares the session, never the table number, so a new party seated at the same table never
 * counts as "still" there (risk 9, the conservative direction).
 */
export function sessionStillOn(
  card: Pick<TagCard, "key" | "sessionId">,
  board: readonly Pick<TagCard, "key" | "sessionId">[],
): boolean {
  return board.some((o) => o.key !== card.key && o.sessionId === card.sessionId);
}
