/**
 * Phase 2d · split (K24) — the counter's tablet split, as pure decisions.
 *
 * On a tablet the counter screen (`/staff?floor=1`) becomes a master-detail: the floor in the main
 * column, the SELECTED table in a pane beside it. The selection lives in the URL HASH
 * (`/staff?floor=1#table-<uuid>`) — Back fires `hashchange`, a reload keeps it, a link can name it,
 * and no route or layout changes. Everything the components decide about that hash, the history
 * entries, the focus after a close and the pane's words is here, so a VALUE can falsify each rule
 * (verify:slice mutates this module).
 *
 * The hash carries a session UUID and nothing else: it grants no authority. Every read the pane makes
 * is `getTableDetail`, staff-gated on the server, and every write is the existing gated action.
 */
import { STAFF_DOOR_TARGET } from "./staff-door";
import type { LiveBoardState } from "./live-connection";
import { handoffStillCurrent, type Handoff } from "./register-ui";
import type { StaffKey } from "./i18n/staff";
import type { RefundState } from "./refund-view";
import { handoffCode } from "./reader-collect";
import { WRITE_UNCONFIRMED, WRITE_WAITING } from "./staff-outage";

/** Side by side from here (JS reads it at CLICK time). Parity-tested against globals.css. */
export const PANE_QUERY = "(min-width: 48em)";
/** The pane column is ALWAYS there from here (the empty state). CSS-only; parity-tested. */
export const PANE_IDLE_QUERY = "(min-width: 64em)";

/** The floor's own heading — the hash a close leaves behind when it cannot walk back. */
export const FLOOR_HASH = "#floor-h";

const TABLE_HASH = /^#table-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

/** `#table-<uuid>` → the session id (lowercased); anything else → null. */
export function paneFromHash(raw: string): string | null {
  const m = TABLE_HASH.exec(raw);
  return m ? m[1]!.toLowerCase() : null;
}

export function paneHash(id: string): `#table-${string}` {
  return `#table-${id}`;
}

/** The counter screen with this table open beside the floor. `settle` asks the pane to land on the
 *  payment section once (the order pad's Take payment), then the param is dropped. */
export function paneUrl(id: string, opts: { settle?: boolean } = {}): string {
  return `${STAFF_DOOR_TARGET.counter}${opts.settle ? "&settle=1" : ""}${paneHash(id)}`;
}

/**
 * The selection a hash names. A table hash → its id; '' or the floor heading → none; any OTHER hash
 * (a zone jump such as the approvals circle's `#appr-h`) keeps the current table at split width — a
 * manager approving a void for Table 7 keeps Table 7 beside the queue — and clears it below 48em,
 * where the pane covers the whole column and the zone could not be seen.
 */
export function paneSelectionFromHash(
  hash: string,
  current: string | null,
  split: boolean,
): string | null {
  const id = paneFromHash(hash);
  if (id !== null) return id;
  if (hash === "" || hash === "#" || hash === FLOOR_HASH) return null;
  return split ? current : null;
}

/** Did THIS mount push the entry we are on? Next drops custom `history.state`, so ownership is the
 *  hash AND the history length recorded at the push — the hash alone matches a re-pushed copy. */
export function paneOwned(p: {
  pushed: { hash: string; len: number } | null;
  currentHash: string;
  historyLength: number;
}): boolean {
  return p.pushed !== null && p.pushed.hash === p.currentHash && p.pushed.len === p.historyLength;
}

export type PaneHistoryOp = {
  op: "none" | "push" | "replace" | "back";
  hash?: string;
  keepOwnership: boolean;
};

/**
 * One entry deep (owner decision 5c): opening a table PUSHES one entry, switching tables REPLACES
 * it, closing walks BACK over it — only when this mount pushed it; otherwise it replaces to the
 * floor heading (never to an empty hash, and never a same-hash neighbour: two neighbouring entries
 * with one hash hang the view-transition library for ~4s on Back).
 */
export function paneHistoryOp(i: {
  from: string | null;
  to: string | null;
  currentHash: string;
  owned: boolean;
}): PaneHistoryOp {
  if (i.from === i.to) return { op: "none", keepOwnership: true };
  if (i.to !== null && i.currentHash === paneHash(i.to)) return { op: "none", keepOwnership: true };
  if (i.to !== null && i.from === null)
    return { op: "push", hash: paneHash(i.to), keepOwnership: false };
  if (i.to !== null) return { op: "replace", hash: paneHash(i.to), keepOwnership: i.owned };
  if (i.owned) return { op: "back", keepOwnership: false };
  return { op: "replace", hash: FLOOR_HASH, keepOwnership: false };
}

/** A history entry Next never saw (a native fragment jump: its state carries no `__NA`) must be
 *  adopted into Next's canonical URL, or the next revalidating action re-pushes a stale URL. */
export function needsCanonicalSync(state: unknown): boolean {
  return !(
    typeof state === "object" &&
    state !== null &&
    Boolean((state as { __NA?: unknown }).__NA)
  );
}

/**
 * Is the counter's own column on screen? Below 48em a selected table TAKES the column (the floor and
 * the lane stay mounted and polling, just not displayed — `globals.css` "Phase 2d · split"), so the
 * floor card's ring and chip and the lane card's badge are not there to see. The bell reads this at
 * the instant of a ring: sound is never the only feedback (§15).
 */
export function counterColumnShown(p: { paneOpen: boolean; split: boolean }): boolean {
  return !p.paneOpen || p.split;
}

/** A card tap opens in the pane only at split width, for a plain primary click nobody handled. */
export function opensInPane(e: {
  split: boolean;
  button: number;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  defaultPrevented: boolean;
}): boolean {
  return (
    e.split &&
    e.button === 0 &&
    !e.metaKey &&
    !e.ctrlKey &&
    !e.shiftKey &&
    !e.altKey &&
    !e.defaultPrevented
  );
}

/** Escape closes the pane — never over a sheet that handled it, mid-composition (a Burmese IME),
 *  or from inside a field the person is typing in. */
export function paneEscapeCloses(k: {
  key: string;
  defaultPrevented: boolean;
  isComposing: boolean;
  targetEditable: boolean;
}): boolean {
  return k.key === "Escape" && !k.defaultPrevented && !k.isComposing && !k.targetEditable;
}

/** A read (or a live pane's `closed`) applies only to the table still selected. */
export function acceptPaneRead(requested: string, selected: string | null): boolean {
  return requested === selected;
}

// Phase 2g · reader (D1) — `paneSelectionHeld` and `paneStartHeld` are RETIRED. Codex rounds 1–2 on
// #306 held the pane on a table whose reader collected, and refused every start, because a switch or
// a landing unmounted the collect panel — the poll that slides the freeze and records a counter
// order's #CODE. The poll lives in `ReaderCollectProvider` (app/staff/layout.tsx) now, above every
// route, so the failure they guarded no longer exists; kept, they would only strand a lone cashier.

/**
 * Where focus goes after the pane closes. A CLEARED table's card is still in the DOM until the
 * floor's next poll, so focus goes to the floor heading, never onto a card about to vanish. A close
 * by a control lands on the table's card (else the heading). A close by history (Back) moves focus
 * only when it was inside the pane or already lost to <body> — never away from where the person is.
 */
export function paneFocusAfterClose(i: {
  via: "control" | "history";
  reason: "user" | "cleared";
  focusInPane: boolean;
  activeIsBody: boolean;
  cardInDom: boolean;
}): "card" | "floorHeading" | "stay" {
  if (i.reason === "cleared") return "floorHeading";
  if (i.via === "history" && !i.focusInPane && !i.activeIsBody) return "stay";
  return i.cardInDom ? "card" : "floorHeading";
}

/** The freeze is ONE fact on the counter screen: the pane speaks its own only while the floor's
 *  region is not already speaking it (the lane's rule, ExpoBoard). The line always SHOWS. */
export function paneFreezeSpoken(floor: LiveBoardState | undefined): boolean {
  return floor !== "not_updating";
}

/** A first read that failed, by CAUSE. Neither sends anyone to paper: that is the whole-screen
 *  shell's sentence, and the floor beside the pane may be live. */
export function paneFailKeys(cause: "outage" | "unknown"): { title: StaffKey; sub: StaffKey } {
  return cause === "outage"
    ? { title: "out.shell.title", sub: "out.tail.reconnecting" }
    : { title: "floor.pane.fail.title", sub: "out.tail.reconnecting" };
}

/**
 * A change the pane's table never saw land: a line or discount WRITE, a PAYMENT refused (cash not
 * recorded, a card not charged, the reader not started), or a payment whose answer never came
 * (`settleUnknown` — it may have landed). Reported only by a detail that already UNMOUNTED.
 *
 * Phase 2h · integration (critic F1) — `writeWaiting`: a line edit still out at the bound ("no answer
 * yet — it may still be saved"), never "didn't save". (critic F2) — and the two RESOLVED lines a late
 * ok turns an unknown into (`lostAfterLanded`): `settlePaid` ("the payment went through") and
 * `writeSaved` ("the change saved"), so the line the person heard is ANSWERED, never silently gone.
 *
 * Codex r2 on #310 (A2) — `writeUnknown`: a line edit whose answer was LOST (its action threw — "we
 * couldn't confirm that change"). It may already have saved, so never "didn't save"; and unlike
 * `writeWaiting` no late answer is coming to settle it, so nothing retracts it — the person checks.
 */
export type LostKind =
  | "write"
  | "writeWaiting"
  | "writeUnknown"
  | "settle"
  | "settleUnknown"
  | "settlePaid"
  | "writeSaved";

/** The pane's sentence per kind — an unknown payment is never "didn't go through" (it may have). */
export function lostKey(kind: LostKind): StaffKey {
  if (kind === "settleUnknown") return "floor.pane.lostSettleUnknown";
  if (kind === "settle") return "floor.pane.lostSettle";
  if (kind === "writeWaiting") return "floor.pane.lostWriteWaiting";
  if (kind === "writeUnknown") return "floor.pane.lostWriteUnknown";
  if (kind === "settlePaid") return "floor.pane.landedSettle";
  if (kind === "writeSaved") return "floor.pane.landedWrite";
  return "floor.pane.lostWrite";
}

/** A RESOLVED line (a late ok answered it): said and shown quietly, with nothing left to check — no
 *  "View", no warn ink — and it outranks nothing. */
export function lostResolved(kind: LostKind): boolean {
  return kind === "settlePaid" || kind === "writeSaved";
}

/** A line about MONEY the cashier may have to collect again (refused, or its answer never came). */
function lostIsPayment(kind: LostKind): boolean {
  return kind === "settle" || kind === "settleUnknown";
}

/** The pane holds ONE lost change. A later one replaces it — except that a line edit's never
 *  replaces a standing PAYMENT's: money the cashier may have to collect again outranks a dish. */
export function nextLost<T extends { kind: LostKind }>(prev: T | null, next: T): T {
  if (prev !== null && lostIsPayment(prev.kind) && !lostIsPayment(next.kind)) return prev;
  return next;
}

/**
 * Phase 2h · integration (critic F1) — the kind a line edit's sentence hands the pane once its detail
 * UNMOUNTED. WRITE_WAITING ("no answer yet — that change may still be saved") is `writeWaiting`: the
 * change may land, and a late ok retracts it (`lostAfterLanded`, "saved"). Codex r2 on #310 (A2) —
 * WRITE_UNCONFIRMED ("we couldn't confirm that change": the action threw, the answer was LOST) is
 * `writeUnknown`: it may have saved, so never "didn't save". Every other sentence — a refusal in the
 * server's own words — keeps `write`, which no late answer retracts.
 */
export function lostWriteKind(sentence: unknown): "write" | "writeWaiting" | "writeUnknown" {
  if (sentence === WRITE_WAITING) return "writeWaiting";
  if (sentence === WRITE_UNCONFIRMED) return "writeUnknown";
  return "write";
}

/** Where the pane's standing line moves when the table it left clears it by being SELECTED: that
 *  table's own line goes (the detail says the rest), and a RESOLVED line goes on any selection — it
 *  was said, and nothing on it is left to check. A loss on another table stands. */
export function lostOnSelect<T extends { sessionId: string; kind: LostKind }>(
  prev: T | null,
  id: string,
): T | null {
  if (prev !== null && (prev.sessionId === id || lostResolved(prev.kind))) return null;
  return prev;
}

/**
 * Phase 2h · integration — what a settle control (cash, the card-on-file close, the reader START)
 * hands up as each outcome lands: `refused` (nothing recorded), `unknown` (no answer — it may have
 * gone through), `landed`: a LATE ok, answering an attempt the control had already reported
 * `unknown` (a bounded write that went past STAFF_HANG_MS and then succeeded) — the money is
 * RECORDED; or `started` (critic F2): the reader START's late ok — the reader is now ASKING for the
 * card, nothing went through yet. An on-time ok is neither — nothing was ever said to be unknown.
 */
export type SettleOutcome = "refused" | "unknown" | "landed" | "started";

/** What a late ok answered on a table the pane left: a payment recorded (`paid`), the reader started
 *  (`started`), or a line edit saved (`saved`). */
export type LateAnswer = "paid" | "started" | "saved";

/**
 * The pane's standing line once a late ok on `sessionId` lands. It is answered ONLY when it is that
 * table's unknown of the same family — `settleUnknown` for a payment or a reader start,
 * `writeWaiting` for a line edit. Kept: a `settle` refusal or a `write` (different answers that
 * already replaced the unknown, `nextLost`), a dish's line for a payment and a payment's for a dish,
 * and ANOTHER table's line (a landing here says nothing about money there).
 *
 * Critic F2 — answered, not silently retracted: a recorded payment becomes `settlePaid` ("the payment
 * on Table 4 went through") and a saved edit `writeSaved`, said through the pane's one region. A
 * reader START retracts to nothing: nothing went through yet, and the bar's reader chip — on screen
 * and ALERTING its outcome once it lands — now carries that payment.
 */
export function lostAfterLanded<T extends { sessionId: string; kind: LostKind }>(
  prev: T | null,
  sessionId: string,
  how: LateAnswer,
): T | null {
  const answers: LostKind = how === "saved" ? "writeWaiting" : "settleUnknown";
  if (prev === null || prev.sessionId !== sessionId || prev.kind !== answers) return prev;
  if (how === "started") return null;
  return { ...prev, kind: how === "paid" ? "settlePaid" : "writeSaved" };
}

/**
 * Where focus goes once a retracted lost line took the focused control with it (its "View Table 4"
 * button). Only when focus FELL to <body> — a person who moved elsewhere is never pulled back, and a
 * line that stood (another table's) took nothing. The pane's heading while a table is open beside
 * the floor; the floor's heading otherwise (the line sat above the floor).
 */
export function focusAfterLostRetract(i: {
  focusFell: boolean;
  paneOpen: boolean;
}): "paneHeading" | "floorHeading" | "stay" {
  if (!i.focusFell) return "stay";
  return i.paneOpen ? "paneHeading" : "floorHeading";
}

/**
 * What the pane's ONE region says while no detail (which carries its own) is mounted. A lost write
 * outranks (it is about a table the person already left); then the read's own state. Loading is
 * said only when the head does not already carry it: a tapped card names the table at once, so the
 * head's sr-only "Loading…" never renders and focus lands on a bare name over a skeleton — while a
 * deep link's unnamed head IS the loading line, and saying it again would say it twice.
 */
export function paneStatusSays(p: {
  lost: boolean;
  read: "loading" | "closed" | "fail" | null;
  headNamed: boolean;
}): "lost" | "loading" | "closed" | "fail" | null {
  if (p.lost) return "lost";
  if (p.read === "loading") return p.headNamed ? "loading" : null;
  return p.read;
}

/**
 * Phase 2g · review (PT-3 · PT-7) — the sentence under a CLOSED order's title when no paid card
 * stands above it (the pane's closed state, the table page's closed branch). A counter order the
 * server knows was refunded says THAT, from the verdict's refund state: in full, "This order was
 * refunded."; in part, which order (its #CODE — the guest is still owed the rest of the bag) and
 * that a manager is checked with before anything is handed over. The hedge ("it may have been paid,
 * cleared or merged…") stays for everything the server could not name: no order, an unreadable one,
 * a table. Never "Paid" over money that came back, and never a guess dressed as a fact.
 */
export function closedCounterNote(v: { refund: RefundState | null; orderId: string | null }): {
  k: StaffKey;
  vars?: { id: string };
} {
  if (v.refund === "full") return { k: "floor.pane.closed.refundedFull" };
  if (v.refund === "partial" && v.orderId !== null)
    return { k: "floor.pane.closed.refundedPart", vars: { id: handoffCode(v.orderId) } };
  return { k: "floor.pane.closed.body" };
}

/** A closed table's LIVE namesake on the floor (a new party at Table 7), for "Open the current
 *  Table 7". Never the closed session itself; never for a counter order (`reg-` names no place). */
export function liveTwinOf(
  closed: { sessionId: string; label: string },
  live: ReadonlyArray<{ sessionId: string; label: string }>,
): string | null {
  if (closed.label.startsWith("reg-")) return null;
  const twin = live.find((t) => t.label === closed.label && t.sessionId !== closed.sessionId);
  return twin ? twin.sessionId : null;
}

/** The paid card follows its table across a switch: this tab's sessionStorage, `mms-*:{id}`. */
export function handoffStashKey(sessionId: string): string {
  return `mms-handoff:${sessionId}`;
}

/**
 * Codex round 1 (#306) — a table's paid card is SUPERSEDED the moment a DIFFERENT live cart is seen
 * on its session: the next round opened, so the card's total and change describe a round that is
 * over. Hidden is not enough — `handoffStillCurrent` hides it only while that cart is open, and once
 * the next round settles with no tender (no card of its own) the live cart is null again and the old
 * card would read as current: last round's change due, shown as this one's. So a superseded card is
 * DROPPED, from state and from the stash, and never comes back. The exact complement of
 * `handoffStillCurrent` (name it once): a counter order's card (its session closes behind its
 * settle) is never superseded, and with no cart open only a NEWER paid order supersedes a table's
 * card — a round that opened and paid while this screen looked elsewhere.
 */
export function handoffSuperseded(
  h: Pick<Handoff, "isCounter" | "cartId" | "orderId">,
  liveCartId: string | null,
  paidOrderId: string | null,
): boolean {
  return !handoffStillCurrent(h, liveCartId, paidOrderId);
}

const cents = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v) && v >= 0;

/**
 * The stash, validated field by field in register's CANONICAL shape (plan: register × tablet-split).
 * DISPLAY-ONLY: it re-renders the server's settle result verbatim and authorizes nothing, so
 * anything malformed is simply no card.
 */
export function parseHandoffStash(raw: string | null): Handoff | null {
  if (raw === null) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.orderId !== "string" || o.orderId === "") return null;
  if (!cents(o.totalCents)) return null;
  if (o.tipCents !== null && !cents(o.tipCents)) return null;
  if (o.tenderedCents !== null && !cents(o.tenderedCents)) return null;
  if (typeof o.isCounter !== "boolean") return null;
  if (o.cartId !== null && (typeof o.cartId !== "string" || o.cartId === "")) return null;
  return {
    orderId: o.orderId,
    totalCents: o.totalCents,
    tipCents: o.tipCents as number | null,
    tenderedCents: o.tenderedCents as number | null,
    isCounter: o.isCounter,
    cartId: o.cartId as string | null,
    // Phase 2f — a stash written before the field existed (or anything but `true`) reads false.
    sentEarly: o.sentEarly === true,
  };
}

/**
 * Where a way back to a table goes, decided at TAP time: the pane on the counter screen at split
 * width, the full table page below it. `settle` lands on the payment section once (either way).
 */
export function tableDestination(id: string, opts: { split: boolean; settle?: boolean }): string {
  if (opts.split) return paneUrl(id, { settle: opts.settle });
  return `/staff/table/${id}${opts.settle ? "?settle=1" : ""}`;
}

type Store = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const session = (): Store | null => {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null; // deliberate: a blocked storage accessor THROWS in some privacy modes
  }
};

/** Write the paid card for its table. Every storage failure is a deliberate swallow: the card on
 *  screen is in-memory state; the stash only lets it follow the table across a switch. */
export function stashHandoff(sessionId: string, h: Handoff, store: Store | null = session()): void {
  try {
    store?.setItem(handoffStashKey(sessionId), JSON.stringify(h));
  } catch {
    /* deliberate: quota or privacy mode — the in-memory card still shows */
  }
}

export function readHandoffStash(
  sessionId: string,
  store: Store | null = session(),
): Handoff | null {
  try {
    return parseHandoffStash(store?.getItem(handoffStashKey(sessionId)) ?? null);
  } catch {
    return null; // deliberate: unreadable storage is no card
  }
}

export function dropHandoffStash(sessionId: string, store: Store | null = session()): void {
  try {
    store?.removeItem(handoffStashKey(sessionId));
  } catch {
    /* deliberate: nothing to remove from storage that cannot be read */
  }
}

/**
 * PD6 — the SEAL's landing, as a ONE-SHOT note (the blind passes on #334: the stash alone re-landed
 * the seal — the green wash, the bloom — on every same-tab REVISIT of a paid order, and then the note
 * alone landed a client-side revisit, where m6 B6 allows it on a same-tab RELOAD only). The host that
 * took the money writes it beside the stash (`orderId` and the time). The rule, exactly: the FIRST
 * mount of that order's closed card in a LATER document lands only when that document was a RELOAD
 * (`SealNav`, read off Navigation Timing), inside `SEAL_LANDING_TTL_MS`, for the SAME order. A
 * mount in the document that wrote the note (a client-side revisit: Back, the reader chip's View)
 * lands nothing and leaves the note for a reload; a later document takes it either way (one shot),
 * so a reload after a full-page revisit is calm too. The stash's tender still shows on every visit:
 * it is what was entered, in this tab. Every storage failure is a deliberate swallow — the card still
 * renders, calm.
 */
export const SEAL_LANDING_TTL_MS = 120_000;

export function sealLandingKey(sessionId: string): string {
  return `mms-seal-landing:${sessionId}`;
}

export function markSealLanding(
  sessionId: string,
  orderId: string,
  nowMs: number,
  store: Store | null = session(),
): void {
  try {
    store?.setItem(sealLandingKey(sessionId), `${orderId}|${nowMs}`);
  } catch {
    /* deliberate: quota or privacy mode — a reload shows the calm seal */
  }
}

/** How THIS document was reached: whether it was a RELOAD, and when it started (device ms —
 *  `performance.timeOrigin`, the same clock as the note's `Date.now()`). */
export type SealNav = { reload: boolean; docStartMs: number };

type NavPerf = {
  timeOrigin?: number;
  getEntriesByType?: (type: string) => ReadonlyArray<object>;
  navigation?: { type?: number };
};

/**
 * This document's navigation: Navigation Timing 2's entry (`type === "reload"`), the deprecated
 * `performance.navigation.type === 1` as the fallback; neither readable → NOT a reload (the calm
 * seal — the bloom only where it is known to belong). No `timeOrigin` → the document started at
 * the epoch, so every note reads as this document's own (calm).
 */
export function sealNavNow(perf: NavPerf | null = globalThis.performance ?? null): SealNav {
  try {
    const entry = perf?.getEntriesByType?.("navigation")?.[0] as { type?: unknown } | undefined;
    const reload =
      entry && typeof entry.type === "string"
        ? entry.type === "reload"
        : perf?.navigation?.type === 1;
    const origin = perf?.timeOrigin;
    return {
      reload,
      docStartMs: typeof origin === "number" && Number.isFinite(origin) ? origin : 0,
    };
  } catch {
    return { reload: false, docStartMs: 0 }; // deliberate: an unreadable navigation lands nothing
  }
}

/** Whether THIS mount lands the seal (see above), taking the note when it is a later document's. */
export function takeSealLanding(
  sessionId: string,
  orderId: string,
  nowMs: number,
  nav: SealNav,
  store: Store | null = session(),
): boolean {
  try {
    const raw = store?.getItem(sealLandingKey(sessionId)) ?? null;
    if (raw === null) return false;
    const bar = raw.lastIndexOf("|");
    const at = Number(raw.slice(bar + 1));
    // Written in THIS document: a client-side revisit — calm, and the note waits for a reload.
    if (Number.isFinite(at) && at >= nav.docStartMs) return false;
    store?.removeItem(sealLandingKey(sessionId));
    return (
      nav.reload &&
      bar > 0 &&
      raw.slice(0, bar) === orderId &&
      Number.isFinite(at) &&
      nowMs - at >= 0 &&
      nowMs - at <= SEAL_LANDING_TTL_MS
    );
  } catch {
    return false; // deliberate: unreadable storage lands nothing
  }
}

/**
 * Phase 2g · review (A11Y-4) — the phone's table page swaps a counter order that closed PAID under it
 * to the closed branch's card through `router.refresh()`: the whole detail unmounts, and focus that
 * was inside it would fall to <body> with nothing said (the pathname never changes, so no route cue
 * fires). The detail leaves a ONE-SHOT note in this tab before the refresh — only when focus was
 * inside it — and the closed card takes focus once, on mount, when it finds the note. No note (a deep
 * link, a reload, focus already on <body>) means nothing just landed under anyone: never focused.
 *
 * The note is the time it was written, honoured for `HANDOFF_FOCUS_TTL_MS`: a refresh that renders
 * something else (the verdict changed again) must not leave a note that a LATER visit to the same
 * order would act on. Every storage failure is a deliberate swallow — the card still renders; only
 * the focus move is lost.
 */
export const HANDOFF_FOCUS_TTL_MS = 10_000;

export function handoffFocusKey(sessionId: string): string {
  return `mms-handoff-focus:${sessionId}`;
}

export function markHandoffFocus(
  sessionId: string,
  nowMs: number,
  store: Store | null = session(),
): void {
  try {
    store?.setItem(handoffFocusKey(sessionId), String(nowMs));
  } catch {
    /* deliberate: quota or privacy mode — the card renders, unfocused */
  }
}

/** Read AND clear the note (one shot); true only for a note written within the TTL. */
export function takeHandoffFocus(
  sessionId: string,
  nowMs: number,
  store: Store | null = session(),
): boolean {
  try {
    const raw = store?.getItem(handoffFocusKey(sessionId)) ?? null;
    if (raw === null) return false;
    store?.removeItem(handoffFocusKey(sessionId));
    const at = Number(raw);
    return Number.isFinite(at) && nowMs - at >= 0 && nowMs - at <= HANDOFF_FOCUS_TTL_MS;
  } catch {
    return false; // deliberate: unreadable storage is no note
  }
}
