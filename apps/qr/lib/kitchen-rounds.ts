import type { KitchenChannel, KitchenRound } from "./kitchen-types";

/**
 * PD5 — one Send, one card (m5 decisions 1, 5, 9–11; PATH_DESIGN corrections 3, 14, 17; m5 §E/§F;
 * round 3 D4). The pure rules behind the re-keyed kitchen board, falsified by values in
 * `kitchen-rounds.test.ts` and by the `kitchen-rounds/*` mutants:
 *
 *   · `ticketKey` — the card a raw line belongs to, from the RAW row;
 *   · `roundOrdinals` — a session's round numbers, by first fire time, dine-in Sends only;
 *   · `cardStamp` / `cardHex` / `cardTags` — what the pill, the Bring-back chip and the card's
 *     accessible name add to "Table 4" so two cards of one table are always told apart;
 *   · `stubFor` / `nextStubs` — the perforated "အလှည့် 2" stub a card wears, decided once;
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
 * One Send is one card: keyed by cart and `fire_batch` (every Send stamps one). A batchless line
 * (the pre-batch legacy edge) keys by its raw fire time; a line with neither keys to ONE bucket per
 * cart, so its card never remounts, flashes or chimes on a poll (correction 3). The three kinds
 * never collide: the marker between the cart and the rest names the kind.
 */
export function ticketKey(l: RawCardKey): string {
  if (l.fire_batch !== null) return `${l.cart_id}|b|${l.fire_batch}`;
  if (l.fire_at !== null) return `${l.cart_id}|f|${l.fire_at}`;
  return `${l.cart_id}|n`;
}

// ── the round ordinal ─────────────────────────────────────────────────────────────────────────────

/** A batched line of the session, any state (voided included — a void keeps its batch, decision 9). */
export type RoundLine = {
  fire_batch: string | null;
  fire_at: string | null;
  fulfillment: string | null;
};

/**
 * The session's round numbers: the rank, by first fire time, of each `fire_batch` among the
 * session's Sends that have cleared the grace (`fire_at <= now`) AND carry a dine-in line (round 3
 * D4 — a make-it-now to-go batch or settlement food gets its own card with its channel tag and no
 * ordinal, so the room never reads "Round 3" for a table's second order). An undone Send has no
 * batch and never counts; a Send still inside its grace is not counted yet, so a drawn number can
 * only ever be joined by a higher one. Two batches fired in one instant rank by batch id, so the
 * order is the same on every poll.
 */
export function roundOrdinals(
  lines: readonly RoundLine[],
  nowIso: string,
): ReadonlyMap<string, number> {
  const nowMs = Date.parse(nowIso);
  const firstFire = new Map<string, number>();
  const carriesDinein = new Set<string>();
  for (const l of lines) {
    if (l.fire_batch === null) continue;
    if ((l.fulfillment ?? "dinein") === "dinein") carriesDinein.add(l.fire_batch);
    if (l.fire_at === null) continue;
    const ms = Date.parse(l.fire_at);
    if (!Number.isFinite(ms)) continue;
    const prev = firstFire.get(l.fire_batch);
    if (prev === undefined || ms < prev) firstFire.set(l.fire_batch, ms);
  }
  const counted = [...firstFire]
    .filter(([batch, ms]) => ms <= nowMs && carriesDinein.has(batch))
    .sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return new Map(counted.map(([batch], i) => [batch, i + 1]));
}

/** The card's round as the board carries it — declared beside the ticket in `kitchen-types.ts`. */
export type { KitchenRound };

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
 * What the pill, the chip and the names add after the table: the round when it is known, else the
 * card's stamp to the second plus, only while two labels on the board would still tie, a
 * discriminator from the card's own key (corrections 14 and 17). Null means today's bare label.
 */
export type RoundTag =
  | { kind: "round"; n: number }
  | { kind: "time"; stampIso: string; disc: string | null };

/** The base a time-tagged label ties on: the table identity and the stamp to the second. */
function timeBase(c: TagCard): string {
  return `${c.tableNumber ?? c.label}|${c.stampIso.slice(0, 19)}`;
}

/**
 * The tag of every card on the board, in one pass over the snapshot. A dine-in card is tagged only
 * when it has a twin — another card of the same session on the board (held cards included), or a
 * Bring-back chip of the same session still on the rail — so a lone ticket's label is today's, byte
 * for byte (decision 5). A pickup or scan-and-go card is never tagged: its identity is a name and a
 * code. The discriminator is extended one character at a time while two cards still tie, the same
 * length for every card in the tie, and never shortened by a card leaving (it is read again on the
 * next snapshot, and a label is captured once at bump time either way).
 */
export function cardTags(
  board: readonly TagCard[],
  railSessions: ReadonlySet<string>,
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
      railSessions.has(c.sessionId);
    if (!twin) {
      out.set(c.key, null);
      continue;
    }
    if (c.round.kind === "n") {
      out.set(c.key, { kind: "round", n: c.round.n });
      continue;
    }
    timed.push(c);
    out.set(c.key, { kind: "time", stampIso: c.stampIso, disc: null });
  }
  // The ties: every time-tagged card whose base another time-tagged card shares.
  const byBase = new Map<string, TagCard[]>();
  for (const c of timed) {
    const base = timeBase(c);
    byBase.set(base, [...(byBase.get(base) ?? []), c]);
  }
  for (const group of byBase.values()) {
    if (group.length < 2) continue;
    const hexes = group.map((c) => cardHex(c));
    const longest = Math.max(...hexes.map((h) => h.length));
    let len = 4;
    while (len < longest && new Set(hexes.map((h) => h.slice(0, len))).size < hexes.length)
      len += 1;
    group.forEach((c, i) => {
      out.set(c.key, { kind: "time", stampIso: c.stampIso, disc: hexes[i]!.slice(0, len) });
    });
  }
  return out;
}

// ── the stub ──────────────────────────────────────────────────────────────────────────────────────

/** The stub a card wears: the round number, or the guest's own "next round" word with no number. */
export type RoundStub = { kind: "n"; n: number } | { kind: "next" };

/** What `stubFor` reads off a ticket. */
export type StubCard = Pick<TagCard, "key" | "sessionId" | "channel" | "round" | "stampIso">;

/**
 * The stub, decided ONCE when the card first lands (`prior` undefined) and never added or removed
 * afterwards (decision 5): round 2 and up wear their number; round 1, an unnumbered Send and a
 * pickup card wear nothing; an unknown number reads "next round" only while an OLDER card of the
 * same session is on the board right now (decision 10), and is never drawn as a number. Its words
 * may sharpen — "next round" becomes the number once the read answers — but never blur, and a drawn
 * number is frozen for the card's life on this board, so a later merge or void can never renumber a
 * card Mom has already read.
 */
export function stubFor(
  prior: RoundStub | null | undefined,
  card: StubCard,
  board: readonly StubCard[],
): RoundStub | null {
  if (prior === null) return null;
  if (prior?.kind === "n") return prior;
  const now = freshStub(card, board);
  if (prior === undefined) return now;
  return now?.kind === "n" ? now : prior;
}

function freshStub(card: StubCard, board: readonly StubCard[]): RoundStub | null {
  if (card.channel !== "dinein") return null;
  if (card.round.kind === "n") return card.round.n >= 2 ? { kind: "n", n: card.round.n } : null;
  if (card.round.kind === "none") return null;
  const older = board.some(
    (o) => o.key !== card.key && o.sessionId === card.sessionId && o.stampIso < card.stampIso,
  );
  return older ? { kind: "next" } : null;
}

/** The stubs after a snapshot: each card's stub carried forward through `stubFor`, and the cards
 *  that left the board forgotten (a card that returns lands fresh, as decision 5's STATES say). */
export function nextStubs(
  prev: ReadonlyMap<string, RoundStub | null>,
  board: readonly StubCard[],
): ReadonlyMap<string, RoundStub | null> {
  const out = new Map<string, RoundStub | null>();
  for (const c of board) out.set(c.key, stubFor(prev.get(c.key), c, board));
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
