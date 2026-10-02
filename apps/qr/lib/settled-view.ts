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
import type { ReceiptRow } from "./receipt-view";
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
 * (`HAND_BACK_TTL_MS`, a shift): a peek never forgets. Each entry names its dish, so a standing
 * instruction is identifiable and acknowledged on its own — that is what answers the Codex r3 #286
 * risk of a stale imperative standing over a new attempt, which a blanket clear answered before.
 * Storage that throws or is absent (private mode, a server render) keeps nothing and never throws;
 * `rememberHandBack` says so (`false`) and the zone keeps that one in memory for this document.
 */
export const HAND_BACK_KEY = "mms.staff.refund.handBack";
export type HandBack = {
  lineId: string;
  cents: number;
  /** The dish, as the settled list names it — the instruction says which refund it is for. */
  name: string;
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
    Number.isFinite((h as HandBack).at)
  );
}

/** Still owed at `now`: younger than a shift. */
function fresh(h: HandBack, now: number): boolean {
  return now - h.at < HAND_BACK_TTL_MS;
}

/**
 * Phase 2h wrote `{ lineId, cents }` only. A tab holding one is exactly the tab the 2i rollout
 * reloads (D9), so such an entry is read as owed — with no dish (`name: ""`, said by
 * `handBackKey`'s dish-less sentence) and dated `now`, so it stands until its [Handed back].
 */
function upgradeLegacy(h: unknown, now: number): unknown {
  if (typeof h !== "object" || h === null) return h;
  const o = h as Partial<HandBack>;
  if (o.name !== undefined || o.at !== undefined) return h;
  return { lineId: o.lineId, cents: o.cents, name: "", at: now };
}

function readHandBacks(store: TabStore, now: number): HandBack[] {
  const raw = store.getItem(HAND_BACK_KEY);
  if (raw === null) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.map((h) => upgradeLegacy(h, now)).filter(isHandBack);
}

/** The banner's sentence for an entry: with its dish, or — a Phase 2h entry that never recorded
 *  one — the dish-less instruction, never "for  from the drawer". */
export function handBackKey(
  h: HandBack,
): "floor.settled.confirmed.cashFor" | "floor.settled.confirmed.cash" {
  return h.name === "" ? "floor.settled.confirmed.cash" : "floor.settled.confirmed.cashFor";
}

/** Keep a hand-back. One line is refunded once, so a line's newer entry replaces its older one
 *  (never two instructions for one refund). `true` only when the record now holds it. */
export function rememberHandBack(store: TabStore | null, hb: HandBack): boolean {
  // A non-positive or fractional figure, or an entry missing its dish, is no hand-back.
  if (store === null || !isHandBack(hb)) return false;
  try {
    let kept: HandBack[] = [];
    try {
      kept = readHandBacks(store, hb.at);
    } catch {
      kept = []; // an unreadable record is replaced, never allowed to block a new instruction
    }
    const next = [
      ...kept.filter((h) => h.lineId !== hb.lineId && fresh(h, hb.at)),
      { lineId: hb.lineId, cents: hb.cents, name: hb.name, at: hb.at },
    ];
    store.setItem(HAND_BACK_KEY, JSON.stringify(next));
  } catch {
    // Storage refused (quota, private mode): nothing can be kept, and the caller is told.
    return false;
  }
  // Said to every zone mounted in this document — including one that mounted AFTER the refund was
  // sent, whose own mount-time peek ran before this late answer existed.
  for (const fn of [...heard]) {
    try {
      fn();
    } catch {
      // A listener's failure is its own; the record is written either way.
    }
  }
  return true;
}

const heard = new Set<() => void>();
/** Told after every hand-back written down in this document (a late answer reaches a zone that
 *  mounted after its refund was sent). Returns the unsubscribe. */
export function subscribeHandBacks(fn: () => void): () => void {
  heard.add(fn);
  return () => {
    heard.delete(fn);
  };
}

/** Every hand-back still owed at `now`, oldest first. Reads only: NEVER forgets one. */
export function peekHandBacks(store: TabStore | null, now: number): HandBack[] {
  if (store === null) return [];
  try {
    return readHandBacks(store, now).filter((h) => fresh(h, now));
  } catch {
    return [];
  }
}

/** The manager handed `lineId`'s money back: forget that entry, and only that one. */
export function ackHandBack(store: TabStore | null, lineId: string): void {
  if (store === null) return;
  try {
    const left = readHandBacks(store, Date.now()).filter((h) => h.lineId !== lineId);
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
