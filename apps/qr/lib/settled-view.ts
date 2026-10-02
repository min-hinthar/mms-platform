/**
 * A4·3 · M204 — the settled list's VIEW rules, pure, in `lib/` so a value test can hold them.
 *
 * The console READS THE RECEIPT: every row, mark and status it shows comes from the same
 * derivations the guest's artifact renders (`receipt-view.ts` · `refund-view.ts`), so the two can
 * never disagree about what an order was. What this module adds is only the bilingual half — the
 * dictionary key for each receipt row, tender and refund state — and `settled-view.test.ts` pins
 * every English value to the receipt's own string, so a reworded row on the artifact reddens
 * here rather than drifting.
 */
import type { StaffKey } from "./i18n/staff";
import { dollars, type ReceiptRow } from "./receipt-view";
import { holdReload } from "./reload-guard";
import type { RefundSummary } from "./refund-view";

/** The settled read's cap (a "use server" module may export only actions, so it lives here). A
 *  FULL page says so (`truncated`) instead of passing part off as the whole day. */
export const SETTLED_CAP = 50;

/** `buildReceiptRows` + `buildRefundRows` produce exactly these eight keys. */
export const RECEIPT_ROW_KEY = {
  subtotal: "floor.settled.row.subtotal",
  discount: "floor.settled.row.discount",
  service: "floor.settled.row.service",
  tax: "floor.settled.row.tax",
  tip: "floor.settled.row.tip",
  total: "floor.settled.row.total",
  // The row shares the floor's own word for the state (`floor.status.refunded`): one Burmese for
  // "Refunded" on this screen, whether it marks a card, a line or a receipt row.
  refunded: "floor.status.refunded",
  net: "floor.settled.row.net",
} as const satisfies Record<string, StaffKey>;

/** The dictionary key for a receipt row, or null for a key this map does not know — the caller
 *  then prints the row's own English label rather than inventing a word. */
export function receiptRowKey(row: ReceiptRow): StaffKey | null {
  return (RECEIPT_ROW_KEY as Record<string, StaffKey>)[row.key] ?? null;
}

/** The receipt's destination headings (`fulfillmentLabel`), keyed — shown only when an order spans
 *  two or more, the Bill rule `groupReceiptLines` already applies. */
export const GROUP_KEY = {
  dinein: "floor.settled.group.dinein",
  togo: "floor.settled.group.togo",
  grocery: "floor.settled.group.grocery",
} as const satisfies Record<string, StaffKey>;

export function groupKey(fulfillment: string): StaffKey | null {
  return (GROUP_KEY as Record<string, StaffKey>)[fulfillment] ?? null;
}

/** The receipt's tender vocabulary (`tenderLabel`), keyed. Cash and the reader reuse the takings
 *  zone's words — one Burmese per tender on the counter screen. */
export const TENDER_KEY = {
  card: "floor.settled.tender.card",
  cash: "reg.day.cash",
  terminal: "reg.day.terminal",
} as const satisfies Record<string, StaffKey>;

export function tenderKey(tender: string): StaffKey | null {
  return (TENDER_KEY as Record<string, StaffKey>)[tender] ?? null;
}

/**
 * The order's settled-state line, by refund state. `none` and `partial` carry the tender in an
 * `{x}` slot and mirror `receiptStatusLabel` word for word (pinned). `full` does NOT mirror it: the
 * artifact says "returned to you", and on the manager's screen "you" is the wrong person.
 */
export function settledStatusKey(summary: RefundSummary): StaffKey {
  if (summary.state === "full") return "floor.settled.status.full";
  if (summary.state === "partial") return "floor.settled.status.partial";
  return "floor.settled.status.paid";
}

/** The collapsed row's chip (`refundChipLabel`), keyed — null when nothing came back. */
export function settledChipKey(summary: RefundSummary): StaffKey | null {
  if (summary.state === "full") return "floor.status.refunded";
  if (summary.state === "partial") return "floor.settled.chip.partial";
  return null;
}

/** The refund reasons `refundLineInput` accepts, each a dictionary key. `sold_out` and `other`
 *  are the loss sheet's own words — the code is the DB's, so the word is the dictionary's, once. */
export const REFUND_REASON_KEY = {
  unhappy: "floor.refund.reason.unhappy",
  wrong_item: "floor.refund.reason.wrongItem",
  // W23a — listed high because if it is ever common it is the one refund reason with a cheap
  // structural fix (86 the dish and the next order never happens).
  sold_out: "table.loss.reason.soldOut",
  too_slow: "floor.refund.reason.tooSlow",
  duplicate: "floor.refund.reason.duplicate",
  other: "table.loss.reason.other",
} as const satisfies Record<string, StaffKey>;

export type RefundReason = keyof typeof REFUND_REASON_KEY;
export const REFUND_REASONS = Object.keys(REFUND_REASON_KEY) as RefundReason[];

const CLOCK = new Map<string, Intl.DateTimeFormat>();
const DAY = new Map<string, Intl.DateTimeFormat>();

/**
 * The wall-clock time an order settled, in the SERVICE zone (the same `pickup_config.tz` the day
 * floor uses) — "12:41 PM". Latin in both tongues: a clock is matched against a printed receipt.
 * Formatted on the server, where the zone is known; the tablet's own zone is not the restaurant's.
 */
export function settledClock(iso: string, tz: string): string {
  let f = CLOCK.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" });
    CLOCK.set(tz, f);
  }
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? f.format(new Date(ms)) : "";
}

/**
 * The calendar day an order settled, in the SERVICE zone — "Sep 12" — for a row the list admits
 * from an earlier day (refunded here today; Codex round 1 on #283): a bare clock under "Settled
 * today" read as today's. Latin in both tongues, like the clock.
 */
export function settledDate(iso: string, tz: string): string {
  let f = DAY.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric" });
    DAY.set(tz, f);
  }
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? f.format(new Date(ms)) : "";
}

/**
 * Phase 2h · integration b — the refund sheet a refund's ANSWER closes: its OWN line's, never another.
 *
 * A refund with no answer at STAFF_HANG_MS frees its sheet (9a), and its LATE answer still reaches the
 * board through that sheet's tap-time `onDone` (9e) — after the manager may have put it away and
 * opened a refund for another line. Closing whatever sheet was open THEN shut a sheet the answer had
 * nothing to do with, under the manager's hands. So the answer closes the open sheet only when it is
 * for the same line (the order item the write refunded): that one is refunded now, and a sheet
 * reopened for it would only be refused as "already refunded". Every other open sheet is kept —
 * EXCEPT under a drawer hand-back (`handBack`: a CASH refund that recorded an amount). That answer
 * carries the only copy of the instruction "hand back $X from the drawer", and the banner that says
 * it sits under any open sheet: aria-hidden, its focus taken back by the sheet's focus trap, and
 * overwritten by the next refund's answer before anyone read it. So a hand-back closes whatever sheet
 * is open, and the banner takes focus (critic S1 on integration b). A sheet kept open can only be
 * one nobody has sent yet — another refund is refused while this one is out.
 */
export function refundSheetAfterAnswer<T extends { line: { id: string } }>(
  open: T | null,
  answeredLineId: string,
  handBack: boolean,
): T | null {
  if (open === null || handBack) return null;
  return open.line.id === answeredLineId ? null : open;
}

/**
 * Phase 2h · review a (A2) · Phase 2i (P2bi · D5) — a CASH refund's hand-back, kept in this tab until a
 * person says it was made.
 *
 * Under record-first a cash refund's ANSWER is the only place the server-clamped figure and the
 * instruction "hand back $X from the drawer" exist (`floor.settled.path.cash`). Phase 2h kept it only
 * when the zone had gone by the time the answer came (its late answer had nowhere else to be said).
 * Phase 2i keeps it on EVERY cash answer, because the answer itself can erase the screen that says
 * it: `refundLine` revalidates, and a tab running an older build than the server is hard-reloaded by
 * Next right after the answer handler runs (one round trip later), with no client code able to veto
 * it. The banner that said "hand back $11.05" a moment before is gone, and the money is recorded as
 * handed back while it is still in the till. So the zone writes it HERE, synchronously, before it
 * sets any state, and renders the banner FROM this record — one source, said once per document.
 *
 * An entry is forgotten only by `ackHandBack` (the manager's [Handed back]) or by age
 * (`HAND_BACK_TTL_MS`, a shift): a peek never forgets. Each entry names its dish and its receipt, and
 * `handBackSubjects` tells apart any two that still read alike, so a standing instruction is
 * identifiable and acknowledged on its own — that is what answers the Codex r3 #286 risk of a stale
 * imperative standing over a new attempt, which a blanket clear answered before.
 *
 * Storage that throws or is absent (private mode, quota, a server render) cannot keep one. Then the
 * entry is held in THIS MODULE's memory — the document's, not a zone's: a late answer after the zone
 * unmounted still reaches the next mount (critic F2) — and while memory holds one, an automatic
 * reload is held (`holdReload`, critic F1): a reload is the one thing that would erase it.
 */
export const HAND_BACK_KEY = "mms.staff.refund.handBack";
export type HandBack = {
  lineId: string;
  cents: number;
  /** The dish, as the settled list names it — the instruction says which refund it is for. */
  name: string;
  /** The receipt's short code (`SettledOrder.code`): two orders' same dish read apart. */
  code: string;
  /** `Date.now()` when the answer came — the TTL's clock. */
  at: number;
};
/** A shift: an instruction nobody acknowledged by then is not one anybody will act on. */
export const HAND_BACK_TTL_MS = 12 * 60 * 60_000;
export type TabStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** This tab's sessionStorage, or null where there is none (a server render) or it throws. */
export function tabStore(): TabStore | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function isHandBack(h: unknown): h is HandBack {
  return (
    typeof h === "object" &&
    h !== null &&
    typeof (h as HandBack).lineId === "string" &&
    Number.isInteger((h as HandBack).cents) &&
    (h as HandBack).cents > 0 &&
    typeof (h as HandBack).name === "string" &&
    typeof (h as HandBack).code === "string" &&
    Number.isFinite((h as HandBack).at)
  );
}

/** Still owed at `now`: younger than a shift. */
function fresh(h: HandBack, now: number): boolean {
  return now - h.at < HAND_BACK_TTL_MS;
}

/**
 * Phase 2h wrote `{ lineId, cents }` only. A tab holding one is exactly the tab the 2i rollout
 * reloads (D9), so such an entry is read as owed — with no dish or receipt (`name: ""`, said by
 * `handBackKey`'s dish-less sentence) and dated by the FIRST read that sees it, which writes it
 * back (`peekHandBacks`) so the TTL runs from there (critic F9) instead of re-dating it forever.
 */
function upgradeLegacy(h: unknown, now: number): unknown {
  if (typeof h !== "object" || h === null) return h;
  const o = h as Partial<HandBack>;
  if (o.name !== undefined || o.at !== undefined) return h;
  return { lineId: o.lineId, cents: o.cents, name: "", code: "", at: now };
}

/** The record's entries (legacy ones upgraded) and whether any was upgraded on this read. */
function readHandBacks(store: TabStore, now: number): { list: HandBack[]; upgraded: boolean } {
  const raw = store.getItem(HAND_BACK_KEY);
  if (raw === null) return { list: [], upgraded: false };
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return { list: [], upgraded: false };
  let upgraded = false;
  const list = parsed
    .map((h) => {
      const u = upgradeLegacy(h, now);
      if (u !== h) upgraded = true;
      return u;
    })
    .filter(isHandBack);
  return { list, upgraded };
}

/** The banner's sentence for an entry: with its dish, or — a Phase 2h entry that never recorded
 *  one — the dish-less instruction, never "for  from the drawer". */
export function handBackKey(
  h: HandBack,
): "floor.settled.confirmed.cashFor" | "floor.settled.confirmed.cash" {
  return h.name === "" ? "floor.settled.confirmed.cash" : "floor.settled.confirmed.cashFor";
}

/**
 * Critic F3 — what each owed entry is called, on its banner line ({x}) and on its [Handed back]: the
 * dish and its receipt ("Mohinga · AA0001"), or, for a dish-less Phase 2h entry, its figure. Two
 * entries that would still read alike (two lines of one dish on one receipt; two legacy entries of
 * one figure) are numbered in list order, so no two instructions ever offer the same button.
 */
export function handBackSubjects(list: readonly HandBack[]): string[] {
  const base = list.map((h) =>
    h.name === "" ? dollars(h.cents) : h.code === "" ? h.name : `${h.name} · ${h.code}`,
  );
  return base.map((b, i) => {
    if (base.filter((x) => x === b).length < 2) return b;
    return `${b} (${base.slice(0, i + 1).filter((x) => x === b).length})`;
  });
}

// ── the document's memory: hand-backs storage refused (critic F1 · F2) ──────────────────────────
let memory: HandBack[] = [];
let releaseHold: (() => void) | null = null;
let expiry: ReturnType<typeof setTimeout> | null = null;

/** Memory shed of expired entries; the reload hold raised exactly while memory holds one, and a
 *  timer that sheds the oldest at its TTL (the hold never outlives what it protects). */
function syncMemory(now: number): void {
  memory = memory.filter((h) => fresh(h, now));
  if (expiry !== null) {
    clearTimeout(expiry);
    expiry = null;
  }
  if (memory.length === 0) {
    releaseHold?.();
    releaseHold = null;
    return;
  }
  // An unread money line: the ONLY copy of a drawer instruction, which a reload would erase. The
  // S0 contract names no hand-back reason (its table leaves the hand-back out because it is
  // persisted — false for exactly this entry), so it rides the nearest unread one: the counter's
  // lost money line. Filed for integration to name its own.
  if (releaseHold === null)
    releaseHold = holdReload({
      kind: "unread",
      reason: "paneLine",
      subject: "handBack",
      survives: false,
    });
  const due = Math.min(...memory.map((h) => h.at)) + HAND_BACK_TTL_MS - now;
  expiry = setTimeout(
    () => {
      expiry = null;
      syncMemory(Date.now());
      tell("expired");
    },
    Math.max(0, due),
  );
}

/** What `rememberHandBack` did: written down, held in memory only (storage refused), or refused
 *  as no hand-back at all (critic F7 — never said from memory either). */
export type Remembered = "kept" | "memory" | "invalid";

/** Keep a hand-back. One line is refunded once, so a line's newer entry replaces its older one
 *  (never two instructions for one refund). */
export function rememberHandBack(store: TabStore | null, hb: HandBack): Remembered {
  // A non-positive or fractional figure, or an entry missing its dish, is no hand-back.
  if (!isHandBack(hb)) return "invalid";
  const entry = { lineId: hb.lineId, cents: hb.cents, name: hb.name, code: hb.code, at: hb.at };
  let kept = false;
  if (store !== null) {
    try {
      let stored: HandBack[] = [];
      try {
        stored = readHandBacks(store, hb.at).list;
      } catch {
        stored = []; // an unreadable record is replaced, never allowed to block a new instruction
      }
      const next = [...stored.filter((h) => h.lineId !== hb.lineId && fresh(h, hb.at)), entry];
      store.setItem(HAND_BACK_KEY, JSON.stringify(next));
      kept = true;
    } catch {
      // Storage refused (quota, private mode): held in memory below, and the caller is told.
    }
  }
  memory = memory.filter((h) => h.lineId !== hb.lineId);
  if (!kept) memory = [...memory, entry];
  syncMemory(hb.at);
  // Said to every zone mounted in this document — including one that mounted AFTER the refund was
  // sent, whose own mount-time read ran before this late answer existed — whichever source holds it.
  tell("remembered");
  return kept ? "kept" : "memory";
}

/** Why the list moved: an answer was remembered (said, with focus), or a memory entry aged out
 *  (re-read quietly). */
export type HandBackNews = "remembered" | "expired";
const heard = new Set<(what: HandBackNews) => void>();
function tell(what: HandBackNews): void {
  for (const fn of [...heard]) {
    try {
      fn(what);
    } catch {
      // A listener's failure is its own; the record is written either way.
    }
  }
}
/** Told after every hand-back remembered in this document (a late answer reaches a zone that
 *  mounted after its refund was sent). Returns the unsubscribe. */
export function subscribeHandBacks(fn: (what: HandBackNews) => void): () => void {
  heard.add(fn);
  return () => {
    heard.delete(fn);
  };
}

/** Every hand-back the RECORD still owes at `now`, oldest first. NEVER forgets one; it writes back
 *  only a Phase 2h entry it has just dated, so that entry's TTL runs (critic F9). */
export function peekHandBacks(store: TabStore | null, now: number): HandBack[] {
  if (store === null) return [];
  try {
    const { list, upgraded } = readHandBacks(store, now);
    if (upgraded) {
      try {
        store.setItem(HAND_BACK_KEY, JSON.stringify(list));
      } catch {
        // Not written back: it is re-dated by the next read, and still said — never lost.
      }
    }
    return list.filter((h) => fresh(h, now));
  } catch {
    return [];
  }
}

/** The manager handed `lineId`'s money back: forget that entry, and only that one — in the record
 *  and in memory. */
export function ackHandBack(store: TabStore | null, lineId: string): void {
  if (memory.some((h) => h.lineId === lineId)) {
    memory = memory.filter((h) => h.lineId !== lineId);
    syncMemory(Date.now());
  }
  if (store === null) return;
  try {
    const left = readHandBacks(store, Date.now()).list.filter((h) => h.lineId !== lineId);
    if (left.length === 0) store.removeItem(HAND_BACK_KEY);
    else store.setItem(HAND_BACK_KEY, JSON.stringify(left));
  } catch {
    // Unreadable: drop the record whole — garbage is never said as an instruction anyway.
    try {
      store.removeItem(HAND_BACK_KEY);
    } catch {
      // Nothing to do: the entry stays until its TTL, and says itself again — never a wrong figure.
    }
  }
}

/** The banner's list: the record's entries, then any this document could NOT keep (storage refused)
 *  that the record does not already hold — said once each, never twice. */
export function owedHandBacks(
  stored: readonly HandBack[],
  unkept: readonly HandBack[],
): HandBack[] {
  return [...stored, ...unkept.filter((u) => !stored.some((s) => s.lineId === u.lineId))];
}

/** Everything owed in this document at `now`: the record, then memory (critic F2 — one read, used
 *  by every zone mount and every re-read, so a late answer held only in memory reaches them all). */
export function owedHandBacksNow(store: TabStore | null, now: number): HandBack[] {
  return owedHandBacks(
    peekHandBacks(store, now),
    memory.filter((h) => fresh(h, now)),
  );
}

// ── what this document has already announced (critic F4) ───────────────────────────────────────
const announced = new Set<string>();
/** Mark `list` as said in this document; true when any of it had not been said here before. A
 *  remount (a navigation back) re-shows what is owed but takes focus only for something new; a
 *  reload is a new document and says everything again. */
export function announceHandBacks(list: readonly HandBack[]): boolean {
  let unsaid = false;
  for (const h of list) {
    const k = `${h.lineId}@${h.at}`;
    if (announced.has(k)) continue;
    announced.add(k);
    unsaid = true;
  }
  return unsaid;
}

/** Test seam: a new document — memory, its hold and timer, and what was announced, all gone. */
export function resetHandBackDocumentForTests(): void {
  memory = [];
  releaseHold?.();
  releaseHold = null;
  if (expiry !== null) clearTimeout(expiry);
  expiry = null;
  announced.clear();
}
