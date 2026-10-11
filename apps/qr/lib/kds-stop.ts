import type { KitchenStation, KitchenStop, KitchenTicket } from "./kitchen-types";

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

/**
 * The board's stop state: the cards it last read (`null` — UNKNOWN: no stop read has answered yet, the
 * server render's included), and the clears it is hiding. Unknown is never "none": while it stands
 * the board never says All clear, never stands its empty state, and never offers its guide (a quiet
 * board it cannot vouch for), and stop reads that keep failing turn into the board's degraded line
 * (`stopReadDegraded`).
 */
export type StopState = { stops: readonly KitchenStop[] | null; acks: StopAcks };

/** Has any stop read answered? (False: the cards are unknown, never an empty list.) */
export function stopsKnown(state: StopState): boolean {
  return state.stops !== null;
}

/** Consecutive stop reads that did not answer — past this many the board says it is not updating. */
export const STOP_MISS_LIMIT = 2;

/**
 * Stop reads that keep failing (`misses` in a row, the server render's counted) make the WHOLE board's
 * honesty degraded: a table that leaves cannot reach this kitchen while it lasts, which is exactly the
 * silence this card exists to end — so the board wears its existing "not updating" line, not a quiet
 * live face over a hole.
 */
export function stopReadDegraded(misses: number): boolean {
  return misses >= STOP_MISS_LIMIT;
}

/**
 * The stop cards a station's view draws (C1 on #347; the last blind pass's C1): a card stands on a
 * station's view when it stopped ANY dish of that station — the tickets' own derivation,
 * `stationForCategory` — or any dish whose station is unknown (`null`), and it stands WHOLE, every
 * dish it stopped. Never trimmed to the station's own dishes: ONE "Got it" acknowledges the whole
 * clear for every tablet, so a drinks cook who saw only the juice would retire the noodles card on
 * the wok's screen unseen. A card that stopped only other stations' dishes stays off the view; a
 * card with no dishes read shows everywhere (unknown is never "not mine"). The all-stations view
 * draws every card. Per-station acknowledgement is M271.
 */
export function stopsForStation(
  stops: readonly KitchenStop[],
  station: "all" | KitchenStation,
): KitchenStop[] {
  if (station === "all") return [...stops];
  return stops.filter(
    (s) => s.lines.length === 0 || s.lines.some((l) => l.station === null || l.station === station),
  );
}

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
  if (incoming === null) return prev; // unknown stays unknown; the last cards stay drawn
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

/** The stop cards in `stops` the board has not said before (`seen`: the keys it has said). */
export function stopArrivals(
  seen: ReadonlySet<string>,
  stops: readonly KitchenStop[],
): KitchenStop[] {
  return stops.filter((s) => !seen.has(s.key));
}

/**
 * The keys a view has SAID after a read (#347, Codex r2): the cards it said before that are still
 * open, plus every card it draws now (`drawn`, this view's `stopsForStation`). A card the station
 * filter hides stays UNSAID, so the first read after the view starts drawing it says it — a card
 * with no motion and no chime is never drawn without its words. A card said once stays said while
 * it is open, so switching away and back never says it twice.
 */
export function stopsSaidAfter(
  said: ReadonlySet<string>,
  stops: readonly KitchenStop[],
  drawn: readonly KitchenStop[],
): Set<string> {
  const open = new Set(stops.map((s) => s.key));
  const out = new Set([...said].filter((k) => open.has(k)));
  for (const s of drawn) out.add(s.key);
  return out;
}

/**
 * How long a NEW stop card's sentence stands in the board's ONE region (#347 review, a11y): the
 * card's arrival is an ALARM with no motion and no chime, so its words are the only alarm a screen
 * reader hears — they outrank a bump's transient notice for this long and ride beside a standing
 * refusal, never replaced by either (`ERR_DWELL_MS`'s length: a sentence still being read).
 */
export const STOP_NEWS_MS = 8_000;

/**
 * The arrival sentence the region is saying (#347 r2): one part per arriving card, keyed by its
 * clear, so a "Got it" retires ONLY its own table's words (`stopNewsAcked`) and a second table that
 * arrived in the same poll keeps its alarm. `id` names the arrival, so the dwell is not restarted by
 * an acknowledgement that only trims it.
 */
export type StopNews = {
  readonly id: number;
  readonly parts: readonly { readonly clearId: string; readonly text: string }[];
};

/** What the region says for `news`, each table once; `null` when there is nothing left to say. */
export function stopNewsText(news: StopNews | null): string | null {
  if (news === null || news.parts.length === 0) return null;
  return [...new Set(news.parts.map((p) => p.text))].join(" ");
}

/**
 * A second wave of arrivals inside the first's dwell (#347, Codex r2): the words still standing stay
 * (`prev` holds only what no Got it has retired), each clear once — the newer wave's words win — and
 * the merged arrival takes `next`'s id, so the dwell restarts for the newest table and the earlier
 * ones stand at least until it ends. Never a replacement: two tables cleared five seconds apart are
 * both said.
 */
export function stopNewsMerged(prev: StopNews | null, next: StopNews): StopNews {
  if (prev === null) return next;
  const fresh = new Set(next.parts.map((p) => p.clearId));
  return {
    id: next.id,
    parts: [...prev.parts.filter((p) => !fresh.has(p.clearId)), ...next.parts],
  };
}

/** `news` once `clearId` is acknowledged: that clear's words leave; the rest keep their dwell. */
export function stopNewsAcked(news: StopNews | null, clearId: string): StopNews | null {
  if (news === null) return null;
  const parts = news.parts.filter((p) => p.clearId !== clearId);
  if (parts.length === news.parts.length) return news;
  return parts.length === 0 ? null : { ...news, parts };
}
