/**
 * Phase 2g · reader (P2em · P2en · P2er · P2es) — the card reader's collect, as pure decisions.
 *
 * Until this slice the collect lived in the table detail that started it: the panel's 2.5 s
 * `terminalStatus` poll (it slides the settle freeze forward, and it is the only thing that turns a
 * counter order's charge into its #CODE card) died with whatever unmounted the detail — "← Floor",
 * Lock, More, a counter-order card, a browser Back, a mint landing — and a start answering after its
 * detail had gone (P2en) wrote a stash nothing read. The tablet split papered over the worst of it
 * with HOLDS (the pane pinned to the paying table, every start refused), which stranded a lone cashier
 * while a guest fumbled a card (P2er · P2es).
 *
 * So the collect moved ABOVE navigation: `ReaderCollectProvider` (mounted by `app/staff/layout.tsx`,
 * the one thing every staff route shares) owns it, and the panel and the bar's chip are views over
 * it. Everything that provider DECIDES lives here, so a VALUE falsifies each rule (verify:slice
 * mutates this module): the record and its one sessionStorage key, the field-by-field parser and its
 * expiry, the one-time adoption of the old per-table key, the poll's reducer and the ONE status
 * binding, the landed card, and the one refusal left — a second reader start while a collect is live.
 *
 * Client-safe on purpose (no directive, no server import beyond types): the provider, the panel and
 * the chip import it. It moves no money and authorizes nothing — the server re-verifies every PI
 * handle (`terminalStatus` reads `metadata.kind`), and fulfilment is the signed webhook's.
 */
import type { TerminalPollResult } from "./terminal";
import type { Handoff } from "./register-ui";
import { parseHandoffStash } from "./floor-pane";
import { ts, type StaffKey } from "./i18n/staff";
import { tf } from "./i18n/fill";
import type { StaffLang } from "./staff-lang";
import { SETTLE_TTL_MS } from "./lock-ttl";

/** How the floor names the table or guest a collect is for — FloorDetailLive's `paneName`, the
 *  lost-write sentence's shape: a counter order reads "Counter order", a table "Table {display}". */
export type ReaderName = { counter: boolean; display: string };

/** The name in words — the pane head's and the lost-write line's rendering of the same shape. */
export function readerNameText(lang: StaffLang, n: ReaderName): string {
  return n.counter ? ts(lang, "floor.counter") : tf(lang, "floor.table", { id: n.display });
}

/**
 * One live reader collect. Everything but the PI handle and the amount is captured AT THE TAP (the
 * detail that tapped may be gone by the time the start answers — P2en): whether it is a counter
 * order, the name it is shown under, whether its food went to the kitchen unpaid (`sentEarly` — the
 * paid card says so; after payment the detail no longer can), and the cart that paid.
 */
export type ReaderCollect = ReaderStart & {
  /** Device ms when the start landed. */
  startedAt: number;
  /** Device ms of the last poll that answered the collect LIVE (collecting or charged-not-recorded)
   *  — the expiry's clock (see `readerCollectExpired`). */
  liveAt: number;
  /** D4 — "Hide this" while charged-not-recorded: the panel is put away, the poll goes on silently
   *  until the order lands (the #CODE then reaches the chip and the stash). */
  hidden: boolean;
  /** Device ms when the charge was first seen succeeded with no order (the poll's `recordingSince`),
   *  carried in the RECORD so a reload resumes the bound below instead of restarting it — every
   *  restore would otherwise buy a charge that never records another full window. */
  recordingSince: number | null;
  /** Device ms when the charge was GIVEN UP as unrecorded (C1's bound). A record carrying it is no
   *  longer a collect but a WARNING — "charged, nothing recorded, don't take payment again" — and the
   *  stash is its only copy on this tab: it restores straight into `unrecorded` (no poll), never
   *  expires by idleness, and leaves only when a person closes it (Codex r1 on #309: dropping it at
   *  the bound let a reload erase the one line standing between the cart and a second charge). */
  unrecordedAt: number | null;
};

/** What a START hands the provider: the server's answer (the handle, the amount) and the tap's facts. */
export type ReaderStart = {
  sessionId: string;
  paymentIntentId: string;
  /** The server's quoted total for the PI — display only; the reader's amount is the server's. */
  totalCents: number;
  isCounter: boolean;
  name: ReaderName;
  sentEarly: boolean;
  cartId: string | null;
};

/** ONE key per tab: there is one reader per deployment (`STRIPE_TERMINAL_READER_ID`), so at most one
 *  collect can be live. sessionStorage (per tab, survives a reload) — the old per-table key's home. */
export const READER_COLLECT_KEY = "mms-reader-collect";

/** The key every collect used before this slice — one per table, `{paymentIntentId,totalCents}`. */
export function legacyCollectKey(sessionId: string): string {
  return `mms-terminal-collect:${sessionId}`;
}

/**
 * How long a stashed collect may sit unpolled and still be restored. The freeze a reader attempt
 * holds lives `SETTLE_TTL_MS` past its last extend, and only a LIVE poll answer extends it
 * (`terminalStatus` → `extendSettlementFor`). A record whose last live answer is older than that has
 * no freeze left: the server no longer holds the cart for it, the webhook fulfils (or the decline
 * released) it on its own, and all a restore could do is re-announce a history — "Payment didn't go
 * through" on every staff page of a tab woken hours later. Named ONCE, from the freeze's own
 * lifetime; a shorter invented number would drop a collect whose freeze is still held.
 */
export const READER_COLLECT_MAX_IDLE_MS = SETTLE_TTL_MS;

export function readerCollectExpired(
  c: Pick<ReaderCollect, "liveAt" | "unrecordedAt">,
  nowMs: number,
): boolean {
  // A given-up charge is a warning a person must close — idleness never retires it (the freeze it
  // outlived is exactly why it must stay: nothing else on this tab says "don't charge again").
  if (c.unrecordedAt !== null) return false;
  return nowMs - c.liveAt > READER_COLLECT_MAX_IDLE_MS;
}

const cents = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;
const ms = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && v >= 0;
const piHandle = (v: unknown): v is string =>
  typeof v === "string" && v.startsWith("pi_") && v.length > 3;

function object(raw: string | null): Record<string, unknown> | null {
  if (raw === null) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  return typeof v === "object" && v !== null ? (v as Record<string, unknown>) : null;
}

/**
 * The stash, validated field by field (the `parseHandoffStash` shape). Anything malformed is simply
 * no collect: the stash only re-attaches a poll, and the server re-verifies the handle it polls.
 */
export function parseReaderCollect(raw: string | null): ReaderCollect | null {
  const o = object(raw);
  if (o === null) return null;
  if (typeof o.sessionId !== "string" || o.sessionId === "") return null;
  if (!piHandle(o.paymentIntentId)) return null;
  if (!cents(o.totalCents)) return null;
  if (typeof o.isCounter !== "boolean") return null;
  const n = o.name as Record<string, unknown> | null | undefined;
  if (typeof n !== "object" || n === null) return null;
  if (typeof n.counter !== "boolean" || typeof n.display !== "string") return null;
  if (o.cartId !== null && (typeof o.cartId !== "string" || o.cartId === "")) return null;
  if (!ms(o.startedAt) || !ms(o.liveAt)) return null;
  return {
    sessionId: o.sessionId,
    paymentIntentId: o.paymentIntentId,
    totalCents: o.totalCents,
    isCounter: o.isCounter,
    name: { counter: n.counter, display: n.display },
    // Anything but `true` reads false — the card never claims food went out unpaid on a guess.
    sentEarly: o.sentEarly === true,
    cartId: o.cartId as string | null,
    startedAt: o.startedAt,
    liveAt: o.liveAt,
    hidden: o.hidden === true,
    // Anything but a clock is no clock: the bound restarts — later, never sooner.
    recordingSince: ms(o.recordingSince) ? o.recordingSince : null,
    // Anything but a clock is a live collect: the restore polls, and the server's answer decides.
    unrecordedAt: ms(o.unrecordedAt) ? o.unrecordedAt : null,
  };
}

/** The pre-2g per-table stash: a handle and an amount, nothing else. */
export type LegacyCollect = { paymentIntentId: string; totalCents: number };

export function parseLegacyCollect(raw: string | null): LegacyCollect | null {
  const o = object(raw);
  if (o === null) return null;
  if (!piHandle(o.paymentIntentId) || !cents(o.totalCents)) return null;
  return { paymentIntentId: o.paymentIntentId, totalCents: o.totalCents };
}

/**
 * One-time adoption of a legacy entry (a tab open at deploy, mid-collect). The old key carried no
 * name, counter flag, cart or tap — so it is adopted only when that table's detail mounts and can
 * supply them (the old code re-attached on exactly that event), and NEVER over a collect that stands:
 * there is one reader, the standing record is the newer fact, and adopting would drop its poll.
 * `sentEarly` is the detail's reading now — the old restore's own fallback (no tap on this device).
 */
export function adoptLegacyCollect(
  current: ReaderCollect | null,
  legacy: LegacyCollect | null,
  at: Omit<ReaderStart, "paymentIntentId" | "totalCents">,
  nowMs: number,
): ReaderCollect | null {
  if (current !== null || legacy === null) return null;
  return {
    ...at,
    paymentIntentId: legacy.paymentIntentId,
    totalCents: legacy.totalCents,
    startedAt: nowMs,
    liveAt: nowMs,
    hidden: false,
    recordingSince: null,
    unrecordedAt: null,
  };
}

// ── the poll ─────────────────────────────────────────────────────────────────────────────────────

export type ReaderPhase = "collecting" | "recording" | "unrecorded" | "failed" | "canceled";

export const READER_POLL_MS = 2500;
/** Consecutive failed polls before the panel admits it's blind (Stripe unreachable). */
export const READER_BLIND_AFTER_MISSES = 3;
/** How long "Recording the order…" may claim progress before escalating honestly. */
export const READER_RECORDING_ESCALATE_MS = 20_000;
/** A poll still unanswered this long counts as a miss (and one more per further span): Next runs
 *  Server Actions one at a time, so a second poll is never dispatched over a hung one — it would only
 *  queue behind it — and a hung one must still be able to make the panel admit it is blind. */
export const READER_POLL_SILENT_MS = 15_000;
/**
 * C1 · P2gb — how long a charge may stand captured with NO order before this tab stops watching it.
 * `recording` is the window the poll matters most: each live answer re-extends the settle freeze
 * (`terminalStatus` → `extendSettlementFor`), which is what stops a cash settle collecting the bill a
 * second time while a slow webhook lands the order. But a PaymentIntent the webhook REFUSED to fulfil
 * (`card_after_settle`, `reconcile_mismatch` — it lands in `qr_refunds_needed`) answers
 * `succeeded / orderId: null` forever, and an unbounded `recording` held the reader for every other
 * table, re-armed itself on every reload and promised an order that would never come. So the freeze
 * is kept alive for the freeze's OWN lifetime past the capture (named once, `SETTLE_TTL_MS` — a
 * webhook slower than that is not "slow"), and then the collect goes `unrecorded`: the poll stops,
 * the stash goes, the refusal lifts, and the panel and the chip say what to do. A late landing is
 * still covered: the server builds the counter's #CODE card from the order row (Phase 2g · D2).
 */
export const READER_UNRECORDED_MS = SETTLE_TTL_MS;

export type ReaderPoll = {
  phase: ReaderPhase;
  /** Consecutive poll misses (a transport failure, a refusal, a poll silent too long). */
  misses: number;
  /** Device ms when the charge was first seen succeeded with no order yet. */
  recordingSince: number | null;
  /** The decline sentence the server chose (`declineCopy` — the card's code, never the bank's text). */
  failCopy: string | null;
};

export const READER_POLL_START: ReaderPoll = {
  phase: "collecting",
  misses: 0,
  recordingSince: null,
  failCopy: null,
};

/** Is this phase still polling? Declined, cancelled or given up as unrecorded is terminal: the poll
 *  stops (declined and cancelled released the freeze; an unrecorded charge's freeze lapses). */
export function readerPolling(phase: ReaderPhase): boolean {
  return phase === "collecting" || phase === "recording";
}

/**
 * Is the collect LIVE — the reader taking a card, or charged and waiting for its order (the window
 * the poll matters MOST: it keeps the freeze and records the #CODE)? The one refusal below reads it.
 */
export function readerLive(phase: ReaderPhase): boolean {
  return readerPolling(phase);
}

/**
 * The poll's reducer — one answer in, the next state out, plus the order when the charge LANDED.
 * A terminal phase ignores every later answer (a cancel that won is never undone by a poll that was
 * already in the air). `res` null is a transport failure.
 */
export function nextReaderPoll(
  prev: ReaderPoll,
  res: TerminalPollResult | null,
  nowMs: number,
): { poll: ReaderPoll; landed: { orderId: string; totalCents: number } | null } {
  if (!readerPolling(prev.phase)) return { poll: prev, landed: null };
  if (res === null || !res.ok) {
    // A transient miss (Stripe or the staff session) — counted, so the panel can stop claiming a
    // live wait it is not watching; the next interval retries and Cancel stays available.
    return { poll: { ...prev, misses: prev.misses + 1 }, landed: null };
  }
  const seen = { ...prev, misses: 0 };
  if (res.state === "succeeded") {
    if (res.orderId)
      return { poll: seen, landed: { orderId: res.orderId, totalCents: res.totalCents } };
    const since = prev.recordingSince ?? nowMs;
    // C1 — captured with no order for the freeze's whole lifetime: give up watching (see above).
    if (nowMs - since >= READER_UNRECORDED_MS)
      return { poll: { ...seen, phase: "unrecorded", recordingSince: since }, landed: null };
    // Charged; the webhook is landing the order — keep polling.
    return {
      poll: { ...seen, phase: "recording", recordingSince: since },
      landed: null,
    };
  }
  if (res.state === "failed")
    return { poll: { ...seen, phase: "failed", failCopy: res.error }, landed: null };
  if (res.state === "canceled") return { poll: { ...seen, phase: "canceled" }, landed: null };
  return { poll: seen, landed: null };
}

/** A poll silent since `sinceMs` is worth this many misses by `nowMs` (one per silent span). */
export function silentMisses(sinceMs: number, nowMs: number): number {
  return Math.floor((nowMs - sinceMs) / READER_POLL_SILENT_MS);
}

/** The poll a RESTORED record resumes from: a charge already seen captured resumes `recording` on its
 *  own clock (never "On the reader" again, and never a fresh unrecorded window). */
export function restoredReaderPoll(
  c: Pick<ReaderCollect, "recordingSince" | "unrecordedAt">,
): ReaderPoll {
  // A given-up charge restores as the warning it was — terminal, so no poll restarts behind it.
  if (c.unrecordedAt !== null)
    return { ...READER_POLL_START, phase: "unrecorded", recordingSince: c.recordingSince };
  if (c.recordingSince === null) return READER_POLL_START;
  return { ...READER_POLL_START, phase: "recording", recordingSince: c.recordingSince };
}

export function readerRecordingLong(poll: ReaderPoll, nowMs: number): boolean {
  return poll.recordingSince != null && nowMs - poll.recordingSince > READER_RECORDING_ESCALATE_MS;
}

/** What the reader says — a dictionary key per arm, or the server's decline sentence (structurally a
 *  `StaffMsg`). `tone` is the region's precedence and tint, never colour alone. */
export type ReaderStatus = { tone: "ok" | "warn"; msg: { k: StaffKey } | string };

/**
 * THE status binding: the panel's visible line, the page's region (through the panel's hand-up) and
 * the bar's chip all read this, so no two surfaces can say different things about one collect.
 */
export function readerStatus(poll: ReaderPoll, recordingLong: boolean): ReaderStatus {
  const blind = poll.misses >= READER_BLIND_AFTER_MISSES;
  if (poll.phase === "collecting")
    return blind
      ? { tone: "warn", msg: { k: "settle.reader.status.blind" } }
      : { tone: "ok", msg: { k: "settle.reader.status.waiting" } };
  if (poll.phase === "recording")
    return recordingLong
      ? { tone: "warn", msg: { k: "settle.reader.status.recordingLong" } }
      : { tone: "ok", msg: { k: "settle.reader.status.recording" } };
  if (poll.phase === "unrecorded")
    return { tone: "warn", msg: { k: "settle.reader.status.unrecorded" } };
  if (poll.phase === "failed")
    return { tone: "warn", msg: poll.failCopy ?? { k: "settle.reader.status.failed" } };
  return { tone: "ok", msg: { k: "settle.reader.status.canceled" } };
}

/**
 * What the collect panel offers under its line (PT-10): Cancel while the reader takes the card;
 * "Hide this — we'll keep checking" once a charge is slow to record (the panel goes, the poll does
 * not — D4; "Back to payment" there named a payment that no longer exists); "Back to payment" after
 * a decline or a cancel (nothing was charged, take it another way); Close once a charge was given up
 * as unrecorded (there is no payment to go back to — "don't take payment again").
 */
export type ReaderPanelAction = "cancel" | "hide" | "back" | "close";
export function readerPanelAction(
  phase: ReaderPhase,
  recordingLong: boolean,
): ReaderPanelAction | null {
  if (phase === "collecting") return "cancel";
  if (phase === "recording") return recordingLong ? "hide" : null;
  if (phase === "unrecorded") return "close";
  return "back";
}

/** A cancel that did not happen: the server's sentence ("too late…"), or the transport's own key. */
export type ReaderCancelError = { kind: "server"; text: string } | { kind: "local" };

/** What the page's region SPEAKS: a cancel refusal is the newer fact while it stands. */
export function readerSpoken(
  status: ReaderStatus,
  cancelError: ReaderCancelError | null,
): ReaderStatus {
  if (cancelError === null) return status;
  return {
    tone: "warn",
    msg: cancelError.kind === "server" ? cancelError.text : { k: "settle.reader.cancelFailed" },
  };
}

/**
 * The paid card a landed charge leaves. A COUNTER order's is the canonical card — the reader records
 * neither a tip nor a tender, so both are null, and `sentEarly` is the TAP's reading (after payment
 * the detail no longer says the food went out unpaid). A TABLE's settle leaves no card: the detail's
 * paid state is the quiet signal.
 */
export function landedHandoff(c: ReaderCollect, orderId: string): Handoff | null {
  if (!c.isCounter) return null;
  return {
    orderId,
    totalCents: c.totalCents,
    tipCents: null,
    tenderedCents: null,
    isCounter: true,
    cartId: c.cartId,
    sentEarly: c.sentEarly,
  };
}

/** The #CODE a counter card is called out by — HandoffCard's derivation, named once for the chip. */
export function handoffCode(orderId: string): string {
  return `#${orderId.slice(-6).toUpperCase()}`;
}

/**
 * The ONE refusal left (D1): there is one reader, so a start on a DIFFERENT table while a collect is
 * live is refused before the server is asked. The table already collecting is not refused here — its
 * own panel is up, and a second start there meets the server's in-flight refusal anyway.
 *
 * It holds through `recording` too, although the physical reader is free by then: the tab keeps ONE
 * record, and a new start would displace the recording one — and with it the only poll re-extending
 * its freeze, the guard against a cash settle collecting that bill twice while the webhook lands. The
 * wait is bounded (`READER_UNRECORDED_MS`), and `readerBusyKey` says which wait it is. Past the
 * bound the hold becomes the WARNING's: every start waits for a person to close it (Codex r2).
 */
export function readerStartRefused(p: {
  collect: Pick<ReaderCollect, "sessionId"> | null;
  phase: ReaderPhase;
  sessionId: string;
}): boolean {
  if (p.collect === null) return false;
  // Codex r2 on #309 — a charge given up as unrecorded holds EVERY start, its own table's included,
  // until a person closes the warning: the tab keeps one record, so a new start would replace the
  // only "don't take payment again" — and its own table is exactly the one a second charge hurts.
  if (p.phase === "unrecorded") return true;
  return readerLive(p.phase) && p.collect.sessionId !== p.sessionId;
}

/**
 * PT-2 — why the reader button is held, in words that are TRUE for the phase: "taking a payment …
 * finish that one first" only while the reader really is taking a card; once the charge went through
 * and the order is being recorded the reader is idle and there is nothing to finish — the sentence
 * says the payment is being recorded and to wait. Null when nothing holds the reader.
 */
export function readerBusyKey(
  phase: ReaderPhase,
):
  | "settle.reader.busyElsewhere"
  | "settle.reader.busyRecording"
  | "settle.reader.busyUnrecorded"
  | null {
  if (phase === "collecting") return "settle.reader.busyElsewhere";
  if (phase === "recording") return "settle.reader.busyRecording";
  // Codex r2 — the given-up charge's warning holds the reader until it is closed, and says so.
  if (phase === "unrecorded") return "settle.reader.busyUnrecorded";
  return null;
}

// ── the landed queue ─────────────────────────────────────────────────────────────────────────────

/**
 * A charge that LANDED while its table was not on screen (M1 · PT-9 · PT-1). A counter order's carries
 * its card (`handoff`, the #CODE the bag is handed over by); a TABLE's carries none (its paid state is
 * the signal) — but the chip had promised "it will show here", so the landing itself is said too:
 * "Paid · $42.10 · Table 7". `landedAt` is the expiry's clock.
 */
export type ReaderLanded = {
  sessionId: string;
  name: ReaderName;
  orderId: string;
  /** The collect's amount (the start's quote — the card's own figure for a counter order). */
  totalCents: number;
  handoff: Handoff | null;
  landedAt: number;
};

/** The queue's sessionStorage key — beside the collect record, per tab, surviving a reload. */
export const READER_LANDED_KEY = "mms-reader-landed";
/** At most this many held at once: a sixth landing lets the OLDEST go (its card is still stashed for
 *  its table — `stashHandoff` — and the server builds it from the order row). */
export const READER_LANDED_CAP = 5;

/**
 * Hold a landing. A QUEUE, never one slot: a second landing off screen used to overwrite the first
 * card, and the #CODE a guest was waiting on left the bar with no trace (M1). Newest appended, one
 * entry per table (a newer landing for the same table replaces its older one), oldest first — the
 * chip shows the head, so cards are met in the order they landed.
 */
export function queueLanded(
  q: readonly ReaderLanded[],
  e: ReaderLanded,
  cap: number = READER_LANDED_CAP,
): ReaderLanded[] {
  return [...q.filter((x) => x.sessionId !== e.sessionId), e].slice(-cap);
}

/** The queue without that table's landing (dismissed, or handed to the view now showing it). */
export function dropLanded(q: readonly ReaderLanded[], sessionId: string): ReaderLanded[] {
  return q.filter((x) => x.sessionId !== sessionId);
}

/** A landing is held as long as a collect record would be (`READER_COLLECT_MAX_IDLE_MS`): past it,
 *  a reload brings back history, not news. */
export function landedExpired(e: Pick<ReaderLanded, "landedAt">, nowMs: number): boolean {
  return nowMs - e.landedAt > READER_COLLECT_MAX_IDLE_MS;
}

function parseName(v: unknown): ReaderName | null {
  if (typeof v !== "object" || v === null) return null;
  const n = v as Record<string, unknown>;
  if (typeof n.counter !== "boolean" || typeof n.display !== "string") return null;
  return { counter: n.counter, display: n.display };
}

function parseLanded(v: unknown): ReaderLanded | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.sessionId !== "string" || o.sessionId === "") return null;
  const name = parseName(o.name);
  if (name === null) return null;
  if (typeof o.orderId !== "string" || o.orderId === "") return null;
  if (!cents(o.totalCents) || !ms(o.landedAt)) return null;
  // `null` (a table) or a card — never absent: a missing field is not "no card".
  if (typeof o.handoff !== "object") return null;
  let handoff: Handoff | null = null;
  if (o.handoff !== null) {
    // The paid card's own field-by-field door (`parseHandoffStash`), and it must be THIS landing's:
    // a counter card for the same order, never another order's #CODE riding a tampered entry.
    handoff = parseHandoffStash(JSON.stringify(o.handoff));
    if (handoff === null || !handoff.isCounter || handoff.orderId !== o.orderId) return null;
  }
  return {
    sessionId: o.sessionId,
    name,
    orderId: o.orderId,
    totalCents: o.totalCents,
    handoff,
    landedAt: o.landedAt,
  };
}

/** The stashed queue, field by field: a malformed or expired entry is dropped alone (the rest stand),
 *  and the queue's own rules (one per table, the cap) are re-applied on the way in. */
export function parseLandedQueue(raw: string | null, nowMs: number): ReaderLanded[] {
  if (raw === null) return [];
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(v)) return [];
  let q: ReaderLanded[] = [];
  for (const x of v) {
    const e = parseLanded(x);
    if (e !== null && !landedExpired(e, nowMs)) q = queueLanded(q, e);
  }
  return q;
}

// ── the bar's chip ───────────────────────────────────────────────────────────────────────────────

/** What the bar's chip is about: the collect (any phase), or a charge that landed off screen — a
 *  counter's with its #CODE (`code`), a table's with its amount (`code` null). */
export type ReaderChip =
  | {
      kind: "collect";
      sessionId: string;
      name: ReaderName;
      paymentIntentId: string;
      totalCents: number;
    }
  | {
      kind: "landed";
      sessionId: string;
      name: ReaderName;
      orderId: string;
      totalCents: number;
      code: string | null;
    };

/**
 * Whether the bar shows the chip, and for what. NEVER over its own table: where the paying table's
 * detail (or its closed pane) is on screen, the panel or the card there says it, and the view's ONE
 * region speaks it — a second voice for the same money would be the P2r defect again. A collect put
 * away ("Hide this" while charged-not-recorded, D4) is silent until it lands or is given up. The
 * collect outranks a landing for another table — one line in the bar at a time; the landings wait,
 * oldest first.
 */
export function readerChip(p: {
  collect: ReaderCollect | null;
  landed: readonly ReaderLanded[];
  shown: ReadonlySet<string>;
}): ReaderChip | null {
  const c = p.collect;
  if (c !== null && !c.hidden && !p.shown.has(c.sessionId))
    return {
      kind: "collect",
      sessionId: c.sessionId,
      name: c.name,
      paymentIntentId: c.paymentIntentId,
      totalCents: c.totalCents,
    };
  const l = p.landed.find((x) => !p.shown.has(x.sessionId));
  if (l === undefined) return null;
  return {
    kind: "landed",
    sessionId: l.sessionId,
    name: l.name,
    orderId: l.orderId,
    totalCents: l.totalCents,
    code: l.handoff ? handoffCode(l.handoff.orderId) : null,
  };
}

/** The lock screen offers no way into a table — the chip there says what the reader is doing, and
 *  the PIN comes first. Every other staff page links to the paying table. */
export const STAFF_LOCK_PATH = "/staff/lock";
export function readerChipLinked(pathname: string | null): boolean {
  return pathname !== STAFF_LOCK_PATH;
}

/** The sign-in screen is the one staff bar a signed-OUT person sees, and the provider (in the
 *  `/staff` layout) outlives the sign-out navigation that lands there — so the chip there would show
 *  a table, an amount or a pickup code, and could ANNOUNCE it, before anyone signs in (Codex r1 on
 *  #309). It shows nothing on that route; the record is kept for the next signed-in page. The
 *  route's signed-in state (the person's own card) loses the chip too — a page with no table on it,
 *  and the next screen they open shows it. Unknown (null) shows: every other bar is signed in. */
export const STAFF_LOGIN_PATH = "/staff/login";
export function readerChipShownAt(pathname: string | null): boolean {
  return pathname !== STAFF_LOGIN_PATH && !pathname?.startsWith(`${STAFF_LOGIN_PATH}/`);
}

/** The chip's ✕: every outcome is the cashier's to put away — a landing, a decline, a cancel, a charge
 *  given up as unrecorded. A collect still polling is not (its panel has the controls). */
export function readerChipDismissible(chip: ReaderChip, phase: ReaderPhase): boolean {
  return chip.kind === "landed" || !readerPolling(phase);
}

/**
 * The chip's status line (PT-8): the panel's, except where the panel's words name a control the chip
 * does not have — the blind line's "Hold on, or cancel" sits beside a View link, never a Cancel, so the
 * chip says where the Cancel is.
 */
export function readerChipStatus(status: ReaderStatus): ReaderStatus {
  if (typeof status.msg !== "string" && status.msg.k === "settle.reader.status.blind")
    return { ...status, msg: { k: "settle.reader.chip.blind" } };
  return status;
}

/**
 * THE key of a collect outcome a person must not miss — a declined card, a charge slow to record, a
 * charge given up as unrecorded — named ONCE: the chip says it (role="alert") and the table's own
 * panel marks it said when it hands the same status to its page's region (A11Y-6), so leaving the
 * table never says it again.
 */
export function readerAlertKey(
  paymentIntentId: string,
  phase: ReaderPhase,
  recordingLong: boolean,
): string | null {
  if (phase === "failed") return `${paymentIntentId}:failed`;
  if (phase === "unrecorded") return `${paymentIntentId}:unrecorded`;
  if (phase === "recording" && recordingLong) return `${paymentIntentId}:long`;
  return null;
}

/**
 * What the chip SAYS, once (role="alert" — the bar tail's assertive precedent, the Lock refusal): the
 * collect outcomes above, and a LANDING off screen ("Paid · #CODE" for a counter order, "Paid · $X ·
 * Table 7" for a table — A11Y-5: the on-table view announces it; off it, nothing did). Keyed by the
 * outcome, so the chip a navigation remounts on the next page stays quiet about the same fact.
 */
export function readerChipAlert(
  chip: ReaderChip | null,
  phase: ReaderPhase,
  recordingLong: boolean,
): string | null {
  if (chip === null) return null;
  if (chip.kind === "landed") return `${chip.orderId}:landed`;
  return readerAlertKey(chip.paymentIntentId, phase, recordingLong);
}

// ── storage (display-only; every failure a deliberate swallow) ──────────────────────────────────

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const session = (): Store | null => {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null; // deliberate: a blocked storage accessor THROWS in some privacy modes
  }
};

export function writeReaderStash(c: ReaderCollect, store: Store | null = session()): void {
  try {
    store?.setItem(READER_COLLECT_KEY, JSON.stringify(c));
  } catch {
    /* deliberate: quota or privacy mode — the in-memory collect still polls */
  }
}

export function dropReaderStash(store: Store | null = session()): void {
  try {
    store?.removeItem(READER_COLLECT_KEY);
  } catch {
    /* deliberate: nothing to remove from storage that cannot be read */
  }
}

/** The stashed collect, or null — and an EXPIRED one is removed as it is read. */
export function readReaderStash(
  nowMs: number,
  store: Store | null = session(),
): ReaderCollect | null {
  let c: ReaderCollect | null;
  try {
    c = parseReaderCollect(store?.getItem(READER_COLLECT_KEY) ?? null);
  } catch {
    return null; // deliberate: unreadable storage is a cold start
  }
  if (c !== null && readerCollectExpired(c, nowMs)) {
    dropReaderStash(store);
    return null;
  }
  return c;
}

/** Read AND remove a table's legacy entry — read once, whatever the adoption decides. */
export function takeLegacyCollect(
  sessionId: string,
  store: Store | null = session(),
): LegacyCollect | null {
  try {
    const raw = store?.getItem(legacyCollectKey(sessionId)) ?? null;
    if (raw !== null) store?.removeItem(legacyCollectKey(sessionId));
    return parseLegacyCollect(raw);
  } catch {
    return null; // deliberate: unreadable storage adopts nothing
  }
}

/** Write the landed queue (an empty one leaves no key behind). */
export function writeLandedStash(
  q: readonly ReaderLanded[],
  store: Store | null = session(),
): void {
  try {
    if (q.length === 0) store?.removeItem(READER_LANDED_KEY);
    else store?.setItem(READER_LANDED_KEY, JSON.stringify(q));
  } catch {
    /* deliberate: quota or privacy mode — the in-memory queue still shows */
  }
}

/** The stashed landed queue — malformed and expired entries dropped, and the stash rewritten to match. */
export function readLandedStash(nowMs: number, store: Store | null = session()): ReaderLanded[] {
  let raw: string | null;
  try {
    raw = store?.getItem(READER_LANDED_KEY) ?? null;
  } catch {
    return []; // deliberate: unreadable storage is a cold start
  }
  if (raw === null) return [];
  const q = parseLandedQueue(raw, nowMs);
  writeLandedStash(q, store);
  return q;
}
