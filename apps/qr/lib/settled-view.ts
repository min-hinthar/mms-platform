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
 * Phase 2h · review a (A2) — a CASH refund's hand-back that nobody has been told to make yet.
 *
 * A cash refund with no answer at STAFF_HANG_MS frees its sheet, and its LATE answer is the ONLY
 * place the server-clamped figure and the instruction "hand back $X from the drawer" exist (record
 * first, then the drawer — `floor.settled.path.cash`). It reaches the zone through the sheet's
 * tap-time `onDone`; if the zone has unmounted by then (the manager moved to another screen), its
 * banner state is gone with it and the instruction would be dropped on the floor — money recorded
 * as handed back that never left the till. So a late hand-back that finds the zone gone is kept
 * HERE, per tab (sessionStorage survives a reload of the same tab), keyed by the refunded line, and
 * the zone says it — and forgets it — the next time it mounts.
 *
 * Only a hand-back the zone could NOT say is kept: one said by a mounted zone, kept as well, would
 * be said a second time on the next mount, and a manager following it pays the guest twice.
 * Storage that throws or is absent (private mode, a server render) keeps nothing and never throws.
 */
export const HAND_BACK_KEY = "mms.staff.refund.handBack";
export type HandBack = { lineId: string; cents: number };
export type TabStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** This tab's sessionStorage, or null where there is none (a server render) or it throws. */
export function tabStore(): TabStore | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function readHandBacks(store: TabStore): HandBack[] {
  const raw = store.getItem(HAND_BACK_KEY);
  if (raw === null) return [];
  const parsed: unknown = JSON.parse(raw);
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(
    (h): h is HandBack =>
      typeof h === "object" &&
      h !== null &&
      typeof (h as HandBack).lineId === "string" &&
      Number.isInteger((h as HandBack).cents) &&
      (h as HandBack).cents > 0,
  );
}

/** Keep a hand-back the zone could not say. One line is refunded once, so a line's newer entry
 *  replaces its older one (never two instructions for one refund). */
export function rememberHandBack(store: TabStore | null, lineId: string, cents: number): void {
  // A non-positive or fractional figure is no hand-back; `readHandBacks` drops it on the way out.
  if (store === null) return;
  try {
    let kept: HandBack[] = [];
    try {
      kept = readHandBacks(store);
    } catch {
      kept = []; // an unreadable record is replaced, never allowed to block a new instruction
    }
    const next = [...kept.filter((h) => h.lineId !== lineId), { lineId, cents }];
    store.setItem(HAND_BACK_KEY, JSON.stringify(next));
  } catch {
    // Storage refused (quota, private mode): nothing can be kept. The cash refund's waiting line
    // already told the manager to reload and hand back the figure if the line shows refunded.
  }
}

/** Every kept hand-back, and forget them: the caller is about to say them. */
export function takeHandBacks(store: TabStore | null): HandBack[] {
  if (store === null) return [];
  let owed: HandBack[] = [];
  try {
    owed = readHandBacks(store);
  } catch {
    owed = [];
  }
  try {
    store.removeItem(HAND_BACK_KEY);
  } catch {
    // Nothing to do: the next take reads the same entries again, which only repeats an instruction
    // that was never acted on twice — the refund itself recorded once.
  }
  return owed;
}
