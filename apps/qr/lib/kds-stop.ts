import type { KitchenStop, KitchenTicket } from "./kitchen-types";

/**
 * M270 (1) · PATH_DESIGN correction 12 — the kitchen's "Table N left — stop cooking" card, the PURE
 * half: what "Got it" answered, which stop cards the board draws, and where each one stands. Plain
 * (no "use server", no "server-only") so the board and the server action read ONE copy of each rule,
 * and a value falsifies every one of them (the board's suite pins only the wiring).
 *
 * The record is `qr_table_clears` (M182): `mms_clear_table` writes `stop_line_ids` — the kitchen lines
 * that clear voided — and `mms_ack_table_clear_stop(p_clear, p_by)` writes "Got it" once.
 */

/** `mms_ack_table_clear_stop`'s four answers (M182 §3). One guarded UPDATE decides: a second "Got it"
 *  — another tablet, a double tap — is `already`, never a second write. */
export type KitchenStopAck = "ok" | "already" | "nothing_to_stop" | "not_found";

const ACK_STATUSES: ReadonlySet<string> = new Set<KitchenStopAck>([
  "ok",
  "already",
  "nothing_to_stop",
  "not_found",
]);

/**
 * The RPC's answer, READ — never cast. A value outside the four is a function this app does not know
 * (a changed migration, a proxy's error text), and the action answers it as a failure: the card comes
 * back and the board re-reads, rather than hiding a stop on a word nobody defined.
 */
export function stopAckStatusOf(raw: unknown): KitchenStopAck | null {
  return typeof raw === "string" && ACK_STATUSES.has(raw) ? (raw as KitchenStopAck) : null;
}

/**
 * What a CONFIRMED answer does to the card. `gone`: the record is acknowledged — by this tap (`ok`),
 * by another tablet first (`already`, not a failure: the kitchen has it), or there was never anything
 * to stop (`nothing_to_stop`, not a failure either) — so it stays hidden until a read that started
 * after this answer drops it for good. `reread`: no such record (`not_found`) — the hide is dropped
 * and the next read decides, because only a fresh snapshot can say what is true.
 */
export function stopAckVerdict(status: KitchenStopAck): "gone" | "reread" {
  return status === "not_found" ? "reread" : "gone";
}

/**
 * The optimistic doctrine's state for one clear's "Got it" (DESIGN-LANGUAGE: instant flip, revert to
 * confirmed + re-read): `out` — tapped, the write unanswered, the card hidden at once; `done` — the
 * answer confirmed it, hidden until a read whose fetch STARTED after the answer (`afterSeq`, the
 * board's poll sequence at that moment — a read already in flight may have run before the write
 * committed, and would put the card back for a beat). Keyed by the CLEAR: one tap retires every card
 * of that clear, because the record the RPC acknowledges is the clear, not the Send.
 */
export type StopAckEntry = { phase: "out" } | { phase: "done"; afterSeq: number };
export type StopAcks = ReadonlyMap<string, StopAckEntry>;

/** The stops the board draws: the read's, minus every clear whose "Got it" is out or confirmed. */
export function visibleStops(stops: readonly KitchenStop[], acks: StopAcks): KitchenStop[] {
  return stops.filter((s) => !acks.has(s.clearId));
}

/** The board's stop state: the cards it last read, and the clears it is hiding. */
export type StopState = { stops: readonly KitchenStop[]; acks: StopAcks };

/**
 * A snapshot lands. A stop read that did not answer (`null` — failed, or past its budget) changes
 * NOTHING: the cards last drawn stay, and so does every hide over them (soft-fail — a stop card never
 * leaves without a "Got it", and a pruned hide over a carried list would put an acknowledged card
 * back). A read that answered replaces the cards, and drops every CONFIRMED hide whose answer this
 * read's fetch started after (`afterSeq < seq`): from here the read itself is the truth. A hide still
 * `out` stays until its own answer.
 */
export function foldStopRead(
  prev: StopState,
  incoming: readonly KitchenStop[] | null,
  seq: number,
): StopState {
  if (incoming === null) return prev;
  const acks = new Map<string, StopAckEntry>();
  for (const [id, a] of prev.acks) if (a.phase === "out" || a.afterSeq >= seq) acks.set(id, a);
  return { stops: incoming, acks };
}

/** One clear's hide set (or, with `null`, dropped — the revert to confirmed). */
export function withStopAck(acks: StopAcks, clearId: string, entry: StopAckEntry | null): StopAcks {
  const next = new Map(acks);
  if (entry === null) next.delete(clearId);
  else next.set(clearId, entry);
  return next;
}

/** A grid slot: a live or held ticket, or a stop card. */
export type BoardItem = { kind: "ticket"; t: KitchenTicket } | { kind: "stop"; s: KitchenStop };

/**
 * Where each stop card stands (m7 decision 20: "keeps its slot until Got it"). The board is
 * oldest-first — live tickets by `firedAt`, then the HELD cards — and a stop card was a live ticket a
 * moment ago, so it slots among the LIVE ones by its Send's own stamp: the card turns face where the
 * ticket stood, and the cards around it do not move (a stop card is never shoved to the top, and never
 * after the held cards). Equal stamps keep the ticket first. Both inputs keep their own order.
 */
export function boardOrder(
  tickets: readonly KitchenTicket[],
  stops: readonly KitchenStop[],
): BoardItem[] {
  const live = tickets.filter((t) => !t.held);
  const held = tickets.filter((t) => t.held);
  const out: BoardItem[] = [];
  let i = 0;
  let j = 0;
  while (i < live.length || j < stops.length) {
    const t = live[i];
    const s = stops[j];
    if (s === undefined || (t !== undefined && Date.parse(t.firedAt) <= Date.parse(s.firedAt))) {
      out.push({ kind: "ticket", t: t! });
      i += 1;
    } else {
      out.push({ kind: "stop", s });
      j += 1;
    }
  }
  for (const t of held) out.push({ kind: "ticket", t });
  return out;
}

/** The stop cards in `stops` the board has not drawn before (`seen`: the keys it has). */
export function stopArrivals(
  seen: ReadonlySet<string>,
  stops: readonly KitchenStop[],
): KitchenStop[] {
  return stops.filter((s) => !seen.has(s.key));
}
